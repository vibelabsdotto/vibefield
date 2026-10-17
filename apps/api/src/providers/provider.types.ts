import type { CompiledRequest, ProviderStatus } from '@vibefield/contracts';

export interface ProviderContext {
  signal: AbortSignal;
  refs: Array<{ assetId: string; path: string; mime: string }>;
  onSubmitted: (providerJobId: string) => Promise<void>;
}

export interface ProviderResult {
  outputs: Array<{ url?: string; bytes?: Buffer; mime?: string }>;
  modelReported: string | null;
  text?: string;
  usage?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface ProviderAdapter {
  describe(): Promise<ProviderStatus>;
  generate(request: CompiledRequest, context: ProviderContext): Promise<ProviderResult>;
  resume(request: CompiledRequest, providerJobId: string, context: ProviderContext): Promise<ProviderResult>;
}

export type SubmissionState = 'not_submitted' | 'rejected' | 'unknown' | 'accepted';

/** Safe to persist. Never wrap native errors with their messages, causes or response bodies. */
export class ProviderError extends Error {
  readonly name = 'ProviderError';
  metadata?: Record<string, unknown>;
  constructor(
    readonly code: string,
    message: string,
    readonly submissionOutcome: SubmissionState = 'not_submitted',
    readonly providerJobId?: string,
  ) { super(message); }

  get ambiguous(): boolean { return this.submissionOutcome === 'unknown'; }
}
