import { open } from 'node:fs/promises';
import { ProviderError, type SubmissionState } from './provider.types';

export const CODEX_BASE = 'https://chatgpt.com/backend-api/codex';
export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
export const USER_AGENT = 'VibeField/0.1.0';
export const IMAGE_BYTES_LIMIT = 25 * 1024 * 1024;
export const VIDEO_BYTES_LIMIT = 200 * 1024 * 1024;

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Restricted metadata, not an arbitrary upstream string or error message. */
export function safeIdentifier(value: unknown, secrets: string[] = []): string | undefined {
  if (typeof value !== 'string' || !/^[A-Za-z0-9~][A-Za-z0-9_~./:+@-]{0,255}$/.test(value)) return undefined;
  if (value.includes('..') || /^(?:sk-|eyJ)/.test(value) || secrets.some(secret => secret.length > 0 && value.includes(secret))) return undefined;
  return value;
}

/** Usage has numeric values, nested token counts and booleans, never arbitrary text. */
export function safeUsage(value: unknown, depth = 0): Record<string, unknown> | undefined {
  const input = record(value);
  if (!input || depth > 4) return undefined;
  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(input).slice(0, 64)) {
    if (!/^[a-z][a-z0-9_]{0,63}$/i.test(key) || /authorization|secret|api_key|access_token|refresh_token|password|credential/i.test(key)) continue;
    if (item === null || typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) output[key] = item;
    else if (typeof item === 'string' && /^-?\d{1,16}(?:\.\d{1,16})?$/.test(item)) output[key] = item;
    else { const nested = safeUsage(item, depth + 1); if (nested) output[key] = nested; }
  }
  return Object.keys(output).length ? output : undefined;
}

export async function boundedFile(path: string, maxBytes: number, signal?: AbortSignal): Promise<Buffer> {
  let handle;
  try {
    if (signal?.aborted) throw new ProviderError('PROVIDER_CANCELLED', 'Cancelled before submission.');
    handle = await open(path, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) throw new ProviderError('PROVIDER_FILE_INVALID', 'Provider input file is empty, too large or not a regular file.');
    // The extra byte catches concurrent growth without an unbounded readFile allocation.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, maxBytes + 1));
    let size = 0;
    while (size < buffer.length) {
      if (signal?.aborted) throw new ProviderError('PROVIDER_CANCELLED', 'Cancelled before submission.');
      const part = await handle.read(buffer, size, buffer.length - size, size);
      if (!part.bytesRead) break;
      size += part.bytesRead;
    }
    if (size !== stat.size) throw new ProviderError('PROVIDER_FILE_CHANGED', 'Provider input changed while being read.');
    return buffer.subarray(0, size);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    throw new ProviderError('PROVIDER_FILE_UNREADABLE', 'Provider input file could not be read.');
  } finally { await handle?.close().catch(() => undefined); }
}

export function imageMime(bytes: Buffer): string | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.toString('ascii', 0, 6))) return 'image/gif';
  return undefined;
}

export async function inlineImage(ref: { path: string; mime: string }, signal: AbortSignal): Promise<string> {
  const bytes = await boundedFile(ref.path, IMAGE_BYTES_LIMIT, signal);
  const mime = imageMime(bytes);
  if (!mime || mime !== ref.mime) throw new ProviderError('REFERENCE_FORMAT_INVALID', 'Reference bytes must match their PNG, JPEG, WebP or GIF media type.');
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

interface WireOptions {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  signal: AbortSignal;
  timeoutMs: number;
  maxBytes: number;
  providerJobId?: string;
}

/** One HTTP attempt only. No redirects, origin overrides, retries or raw upstream diagnostics. */
export async function wire(url: string, options: WireOptions): Promise<{ bytes: Buffer; headers: Headers }> {
  const target = new URL(url);
  const allowed = (target.origin === 'https://chatgpt.com' && target.pathname.startsWith('/backend-api/codex/')) ||
    (target.origin === 'https://openrouter.ai' && target.pathname.startsWith('/api/v1/'));
  if (!allowed || target.username || target.password || target.hash) throw new ProviderError('PROVIDER_HOST_REJECTED', 'Provider transport destination is not allowed.');
  const method = options.method ?? 'GET';
  const state: SubmissionState = options.providerJobId ? 'accepted' : method === 'POST' ? 'unknown' : 'not_submitted';
  if (options.signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', 'Provider operation cancelled before HTTP request.', options.providerJobId ? 'accepted' : 'not_submitted', options.providerJobId);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const abort = () => controller.abort();
  options.signal.addEventListener('abort', abort, { once: true });
  try {
    const body = options.body ? JSON.stringify(options.body) : undefined;
    if (body && Buffer.byteLength(body) > 180 * 1024 * 1024) throw new ProviderError('PROVIDER_REQUEST_TOO_LARGE', 'Provider request exceeds the byte limit.');
    const response = await fetch(target, {
      method, redirect: 'error', signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      ...(body ? { body } : {}),
    });
    if (!response.ok) {
      await response.body?.cancel();
      const rejected = method === 'POST' && response.status >= 400 && response.status < 500 && response.status !== 408;
      const message = response.status === 401 ? 'Provider credentials were rejected. Renew them outside VibeField.' :
        response.status === 402 ? 'Provider credits or spending allowance are insufficient.' :
        response.status === 403 ? 'Provider access is denied for this account or client.' :
        response.status === 429 ? 'Provider rate or usage limit reached. No automatic resubmission was made.' :
        `Provider returned HTTP ${response.status}. No automatic resubmission was made.`;
      throw new ProviderError(`PROVIDER_HTTP_${response.status}`, message, rejected ? 'rejected' : state, options.providerJobId);
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (declaredLength > options.maxBytes) { await response.body?.cancel(); throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE', 'Provider response exceeds the byte limit.', state, options.providerJobId); }
    if (!response.body) throw new ProviderError('PROVIDER_EMPTY_RESPONSE', 'Provider returned an empty response.', state, options.providerJobId);
    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > options.maxBytes) { await reader.cancel(); throw new ProviderError('PROVIDER_RESPONSE_TOO_LARGE', 'Provider response exceeds the byte limit.', state, options.providerJobId); }
        chunks.push(Buffer.from(chunk.value));
      }
    } finally { reader.releaseLock(); }
    return { bytes: Buffer.concat(chunks, size), headers: response.headers };
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    const code = options.signal.aborted ? 'PROVIDER_CANCELLED' : controller.signal.aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_TRANSPORT_ERROR';
    throw new ProviderError(code, options.providerJobId ? 'Provider observation or download stopped. The acknowledged job can be resumed without submitting again.' : method === 'POST' ? 'Provider submission outcome is unknown. Do not automatically submit again.' : 'Provider discovery could not be reached.', state, options.providerJobId);
  } finally { clearTimeout(timer); options.signal.removeEventListener('abort', abort); }
}

export async function wireJson(url: string, options: WireOptions): Promise<{ data: Record<string, unknown>; headers: Headers }> {
  const response = await wire(url, options);
  try {
    const data = record(JSON.parse(response.bytes.toString('utf8')));
    if (!data) throw new Error();
    return { data, headers: response.headers };
  } catch {
    throw new ProviderError('PROVIDER_INVALID_RESPONSE', 'Provider returned invalid JSON. No automatic resubmission was made.', options.providerJobId ? 'accepted' : options.method === 'POST' ? 'unknown' : 'not_submitted', options.providerJobId);
  }
}
