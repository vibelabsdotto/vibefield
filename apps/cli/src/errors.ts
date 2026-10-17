export type ExitCode = 1 | 2 | 3 | 4;
export type JsonObject = Record<string, unknown>;
export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
  [key: string]: unknown;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return isObject(value) && isObject(value.error)
    && typeof value.error.code === 'string' && typeof value.error.message === 'string';
}

export class CliError extends Error {
  constructor(readonly envelope: ErrorEnvelope, readonly exitCode: ExitCode, readonly source: 'api' | 'cli' = 'cli') {
    super(envelope.error.message);
    this.name = 'CliError';
  }
}

export function fail(code: string, message: string, exitCode: ExitCode = 1, details?: unknown): never {
  throw new CliError({ error: { code, message, ...(details === undefined ? {} : { details }) } }, exitCode);
}

export function httpExitCode(status: number, code: string): ExitCode {
  if ([401, 402, 403, 429].includes(status) || /(?:BUDGET|CAP_REACHED|CAP_EXCEEDED|VIDEO_DISABLED|EXTERNAL_CONFIRMATION|PROVIDER_UNAVAILABLE|NOT_CONFIGURED|PERMISSION|FORBIDDEN)/.test(code)) return 3;
  if (status >= 500) return 2;
  return 1;
}

export function cleanTerminal(text: string): string {
  // Provider/user text must not inject terminal control sequences in human output.
  return Array.from(text).filter((character) => {
    const code = character.codePointAt(0)!;
    return code === 9 || code === 10 || code >= 32 && (code < 127 || code > 159);
  }).join('');
}
