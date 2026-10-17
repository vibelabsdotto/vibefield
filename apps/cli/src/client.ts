import { createWriteStream } from 'node:fs';
import { link, rename, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CliError, fail, httpExitCode, isErrorEnvelope } from './errors.js';

const MAX_JSON_BYTES = 16 * 1024 * 1024;

export interface ClientOptions {
  api: string;
  actor: string;
  timeout: number;
  signal: AbortSignal;
}
export interface RequestOptions {
  body?: unknown;
  idempotencyKey?: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class ApiClient {
  readonly base: string;
  constructor(readonly options: ClientOptions) {
    let url: URL;
    try { url = new URL(options.api); } catch { fail('INVALID_API_URL', '--api must be an absolute HTTP or HTTPS URL.'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      fail('INVALID_API_URL', '--api must use HTTP or HTTPS without credentials, a query, or a fragment.');
    }
    const path = url.pathname.replace(/\/+$/, '');
    if (path !== '' && path !== '/api/v1') fail('INVALID_API_URL', '--api must point to the server root or /api/v1.');
    this.base = `${url.origin}/api/v1`;
    for (const [name, value] of [['actor', options.actor]] as const) {
      if (!value || value.length > 256 || !/^[\x20-\x7e]+$/.test(value)) fail('INVALID_HEADER', `--${name} must contain 1 to 256 printable ASCII characters.`);
    }
  }

  private async exchange<T>(method: string, path: string, options: RequestOptions, consume: (response: Response, signal: AbortSignal) => Promise<T>): Promise<T> {
    const timeout = options.timeout ?? this.options.timeout;
    const deadline = new AbortController();
    const timer = setTimeout(() => deadline.abort(), timeout);
    const signal = AbortSignal.any([deadline.signal, this.options.signal]);
    const mutation = method !== 'GET' && method !== 'HEAD';
    const context = { method, path, ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}), ...(mutation ? { outcomeUnknown: true, resubmitted: false } : {}) };
    try {
      const headers = new Headers({ Accept: 'application/json', 'X-Vibefield-Actor': this.options.actor, ...options.headers });
      if (options.idempotencyKey !== undefined) headers.set('Idempotency-Key', options.idempotencyKey);
      let body: string | FormData | undefined;
      if (options.body instanceof FormData) body = options.body;
      else if (options.body !== undefined) {
        headers.set('Content-Type', 'application/json');
        body = JSON.stringify(options.body);
      }
      const response = await fetch(`${this.base}${path}`, { method, headers, body, signal, redirect: 'error' });
      if (!response.ok) {
        let payload: unknown;
        try { payload = await this.readJson(response); } catch (error) {
          if (signal.aborted) throw error;
          fail('HTTP_ERROR', `API returned HTTP ${response.status} without a valid error envelope.`, httpExitCode(response.status, ''), { status: response.status, ...context });
        }
        if (isErrorEnvelope(payload)) throw new CliError(payload, httpExitCode(response.status, payload.error.code), 'api');
        fail('HTTP_ERROR', `API returned HTTP ${response.status} without a valid error envelope.`, httpExitCode(response.status, ''), { status: response.status, ...context });
      }
      return await consume(response, signal);
    } catch (error) {
      if (error instanceof CliError) throw error;
      if (this.options.signal.aborted) fail('INTERRUPTED', mutation ? 'Interrupted. The API may have accepted the request. Check its state before retrying.' : 'Interrupted. No job was cancelled.', mutation ? 4 : 2, context);
      if (deadline.signal.aborted) fail(mutation ? 'REQUEST_OUTCOME_UNKNOWN' : 'REQUEST_TIMEOUT', mutation ? 'The request deadline expired. The API may have accepted it. Do not resubmit blindly.' : 'The API request deadline expired.', 2, { ...context, timeoutMs: timeout });
      fail(mutation ? 'REQUEST_OUTCOME_UNKNOWN' : 'API_UNREACHABLE', mutation ? 'The API connection failed. The request outcome is unknown. Check its state before retrying.' : 'Cannot reach the API or finish reading its response.', 2, { ...context, api: this.base });
    } finally {
      clearTimeout(timer);
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    if (!response.body) fail('INVALID_RESPONSE', 'The API returned an empty JSON response.', 2);
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_JSON_BYTES) {
          await reader.cancel();
          fail('RESPONSE_TOO_LARGE', 'The API JSON response exceeds 16 MiB. Request a smaller page.', 2);
        }
        chunks.push(value);
      }
      try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
      catch { fail('INVALID_RESPONSE', 'The API did not return valid JSON.', 2); }
    } finally { reader.releaseLock(); }
  }

  async request(method: string, path: string, options: RequestOptions = {}): Promise<unknown> {
    return this.exchange(method, path, options, async (response) => {
      if (response.status === 204) return null;
      try { return await this.readJson(response); }
      catch (error) {
        if (error instanceof CliError && method !== 'GET') {
          fail(error.envelope.error.code, `${error.message} The API may have accepted the mutation.`, error.exitCode, { method, path, outcomeUnknown: true, resubmitted: false, ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}) });
        }
        throw error;
      }
    });
  }

  async download(path: string, output: string, force: boolean, timeout: number, headers: Record<string, string> = {}): Promise<unknown> {
    const stdout = output === '-';
    const destination = stdout ? '-' : resolve(output);
    const temporary = stdout ? undefined : join(dirname(destination), `.${basename(destination)}.${randomUUID()}.partial`);
    const digest = createHash('sha256');
    let bytes = 0;
    let ownsTemporary = false;
    try {
      return await this.exchange('GET', path, { timeout, headers: { Accept: '*/*', ...headers } }, async (response, signal) => {
        if (!response.body) fail('EMPTY_DOWNLOAD', 'The API returned no download body.', 2);
        const counter = new Transform({ transform(chunk: Buffer, _encoding, callback) { bytes += chunk.length; digest.update(chunk); callback(null, chunk); } });
        const source = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]);
        if (stdout) {
          await pipeline(source, counter, process.stdout, { signal, end: false });
        } else {
          const target = createWriteStream(temporary!, { flags: 'wx', mode: 0o600 });
          target.once('open', () => { ownsTemporary = true; });
          let localError: Error | undefined;
          target.once('error', (error) => {
            // pipeline also forwards network errors to the file stream. Only
            // filesystem failures should be reported as local output errors.
            const fileCodes = new Set(['EACCES', 'EPERM', 'ENOSPC', 'EDQUOT', 'EIO', 'EMFILE', 'ENFILE', 'EISDIR', 'EROFS', 'ENOENT', 'ENAMETOOLONG', 'EEXIST']);
            if ('code' in error && typeof error.code === 'string' && fileCodes.has(error.code)) localError = error;
          });
          try { await pipeline(source, counter, target, { signal }); }
          catch (error) {
            if (localError) fail('OUTPUT_WRITE_FAILED', 'Could not write the download. Check the output directory and available disk space.', 1, { output: destination });
            throw error;
          }
          try {
            // link publishes exclusively. --force opts into atomic replacement.
            if (force) await rename(temporary!, destination);
            else { await link(temporary!, destination); await unlink(temporary!); }
            ownsTemporary = false;
          } catch (error) {
            const exists = typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
            fail(exists ? 'OUTPUT_EXISTS' : 'OUTPUT_WRITE_FAILED', exists ? 'Output already exists. Choose another path or pass --force.' : 'Could not publish the downloaded file.', 1, { output: destination });
          }
        }
        return { output: destination, bytes, sha256: digest.digest('hex'), contentType: response.headers.get('content-type'), ...(response.headers.has('content-range') ? { contentRange: response.headers.get('content-range') } : {}) };
      });
    } finally {
      if (ownsTemporary && temporary) await unlink(temporary).catch(() => undefined);
    }
  }
}
