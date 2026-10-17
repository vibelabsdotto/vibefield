import { createReadStream, openAsBlob } from 'node:fs';
import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { CliError, fail, isObject, type JsonObject } from './errors.js';

export type FieldType = 'text' | 'number' | 'count' | 'boolean' | 'object' | 'array' | 'ids';
export interface Field { key: string; flag: string; description: string; type?: FieldType; choices?: readonly string[] }
export type Options = Record<string, unknown>;
const MAX_INPUT_BYTES = 1024 * 1024;

export function numeric(value: string, name: string, min: number, max: number, integer = false): number {
  if (!value.trim()) throw new InvalidArgumentError(`${name} must be a number.`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < min || result > max || (integer && !Number.isInteger(result))) {
    throw new InvalidArgumentError(`${name} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}.`);
  }
  return result;
}

export function booleanValue(value: string): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new InvalidArgumentError('Expected true or false.');
}

export function id(value: string, prefix: string): string {
  const pattern = new RegExp(`^${prefix}_[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`);
  if (!pattern.test(value)) throw new InvalidArgumentError(`Expected a ${prefix}_ UUID identifier, not a path or URL.`);
  return value;
}

function parseValue(value: string, field: Field): unknown {
  if (field.choices && !field.choices.includes(value)) throw new InvalidArgumentError(`Expected one of: ${field.choices.join(', ')}.`);
  switch (field.type) {
    case 'number': return numeric(value, field.flag, 0, 1_000_000);
    case 'count': return numeric(value, field.flag, 1, 4, true);
    case 'boolean': return booleanValue(value);
    case 'ids': {
      const items = value === '' ? [] : value.split(',');
      if (items.some((item) => item.trim() !== item || !item)) throw new InvalidArgumentError('Use comma-separated identifiers without spaces or empty entries.');
      return items;
    }
    case 'object':
    case 'array': {
      let parsed: unknown;
      try { parsed = JSON.parse(value) as unknown; } catch { throw new InvalidArgumentError('Expected valid inline JSON. Use --file for a JSON payload file.'); }
      if (field.type === 'object' ? !isObject(parsed) : !Array.isArray(parsed)) throw new InvalidArgumentError(`Expected a JSON ${field.type}.`);
      return parsed;
    }
    default: return value;
  }
}

export function fields(command: Command, definitions: readonly Field[]): Command {
  command.option('--file <path>', 'Read a JSON object from a file, or - for stdin; flags override its fields');
  for (const field of definitions) {
    command.option(`--${field.flag} <value>`, field.description, (value: string) => parseValue(value, field));
  }
  return command;
}

async function readPayload(path: string): Promise<JsonObject> {
  if (path === '-' && process.stdin.isTTY) fail('STDIN_REQUIRED', '--file - requires JSON on stdin. Pipe a JSON object into the command.');
  const input = path === '-' ? process.stdin : createReadStream(path);
  const chunks: Buffer[] = [];
  let size = 0;
  const interrupt = (): void => { input.destroy(new CliError({ error: { code: 'INPUT_INTERRUPTED', message: 'JSON input was interrupted. No API request was sent.' } }, 1)); };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    for await (const chunk of input) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      size += buffer.length;
      if (size > MAX_INPUT_BYTES) fail('INPUT_TOO_LARGE', 'JSON input must not exceed 1 MiB.');
      chunks.push(buffer);
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail('INPUT_READ_FAILED', 'Could not read the JSON input file.', 1, { path });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
  catch { fail('INVALID_JSON', 'The input is not valid JSON.', 1, { path }); }
  if (!isObject(value)) fail('INVALID_JSON_OBJECT', 'The payload must be a JSON object.');
  return value;
}

export async function payload(options: Options, definitions: readonly Field[], required: readonly string[] = [], defaults: JsonObject = {}): Promise<JsonObject> {
  const result: JsonObject = { ...defaults, ...(typeof options.file === 'string' ? await readPayload(options.file) : {}) };
  for (const field of definitions) {
    const option = field.flag.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    if (options[option] !== undefined) result[field.key] = options[option];
  }
  const allowed = new Set(definitions.map((field) => field.key));
  for (const key of Object.keys(result)) if (!allowed.has(key)) fail('UNKNOWN_FIELD', `Unknown payload field: ${key}.`);
  for (const key of required) {
    if (result[key] === undefined || result[key] === null || typeof result[key] === 'string' && !result[key].trim()) fail('REQUIRED_FIELD', `Required field: ${key}. Supply its flag or include it in --file.`);
  }
  for (const field of definitions) {
    const value = result[field.key];
    if (value === undefined) continue;
    const type = field.type ?? 'text';
    const valid = type === 'text' ? typeof value === 'string'
      : type === 'number' ? typeof value === 'number' && Number.isFinite(value) && value >= 0
      : type === 'count' ? typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 4
      : type === 'boolean' ? typeof value === 'boolean'
      : type === 'object' ? isObject(value)
      : type === 'ids' ? Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
      : Array.isArray(value);
    if (!valid) fail('INVALID_FIELD', `${field.key} must be ${type === 'count' ? 'an integer from 1 to 4' : `of type ${type}`}.`);
    if (field.choices && (typeof value !== 'string' || !field.choices.includes(value))) fail('INVALID_FIELD', `${field.key} must be one of: ${field.choices.join(', ')}.`);
    if (field.key === 'position' && !Number.isInteger(value)) fail('INVALID_FIELD', 'position must be a nonnegative integer.');
    if (field.key === 'durationSeconds' && value === 0) fail('INVALID_FIELD', 'durationSeconds must be greater than zero.');
    const prefixes: Record<string, string> = { assetId: 'ast', characterId: 'chr', productAssetIds: 'ast', characterIds: 'chr', refAssetIds: 'ast', ids: 'sht' };
    const prefix = prefixes[field.key];
    if (prefix) for (const item of Array.isArray(value) ? value : [value]) id(String(item), prefix);
    if (field.key === 'contextId') id(String(value), result.contextType === 'character' ? 'chr' : 'sht');
    if (field.key === 'appearance' || field.key === 'persona') {
      const allowed = field.key === 'appearance' ? ['age', 'gender', 'skinTone', 'face', 'eyes', 'hair', 'build', 'distinguishingMarks', 'wardrobe'] : ['bio', 'tone', 'audience', 'dos', 'donts'];
      for (const [key, item] of Object.entries(value as JsonObject)) {
        if (!allowed.includes(key) || typeof item !== 'string') fail('INVALID_FIELD', `${field.key}.${key} must be a supported string field.`);
      }
    }
    if (field.key === 'checklist') {
      for (const item of value as unknown[]) {
        if (!isObject(item) || typeof item.item !== 'string' || !['pass', 'fail', 'unsure', 'na'].includes(String(item.result)) || item.note !== undefined && typeof item.note !== 'string' || Object.keys(item).some((key) => !['item', 'result', 'note'].includes(key))) fail('INVALID_CHECKLIST', 'Each checklist entry requires item and result: pass, fail, unsure, or na. note is optional.');
      }
    }
  }
  return result;
}

export async function uploadBody(path: string, consent: boolean): Promise<FormData> {
  if (!consent) fail('CONSENT_REQUIRED', 'Upload requires --consent to confirm the material is yours, authorized, or synthetic.', 3);
  try {
    const info = await stat(path);
    if (!info.isFile()) fail('INVALID_UPLOAD', 'Upload must be a regular file.');
    if (info.size === 0 || info.size > 200 * 1024 * 1024) fail('INVALID_UPLOAD_SIZE', 'Upload must contain bytes and must not exceed 200 MiB. The API limits images to 25 MiB.');
    const body = new FormData();
    body.set('file', await openAsBlob(path), basename(path));
    body.set('consent', 'true');
    return body;
  } catch (error) {
    if (error instanceof CliError) throw error;
    fail('UPLOAD_READ_FAILED', 'Could not read the upload file.', 1, { path });
  }
}
