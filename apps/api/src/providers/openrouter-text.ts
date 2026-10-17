import { createHash } from 'node:crypto';
import type { CompiledRequest } from '@vibefield/contracts';
import { OpenRouterCatalog } from './openrouter-catalog';
import { ProviderError, type ProviderContext, type ProviderResult } from './provider.types';
import { OPENROUTER_BASE, record, safeIdentifier, safeUsage, wireJson } from './transport';

export class OpenRouterAuth {
  private rejectedFingerprint?: string;
  key(): string {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key || key.length > 8192 || !/^[\x21-\x7e]+$/.test(key)) throw new ProviderError('OPENROUTER_AUTH_MISSING', 'Set OPENROUTER_API_KEY in the API process. No other credential source is used.');
    if (this.fingerprint(key) === this.rejectedFingerprint) throw new ProviderError('OPENROUTER_AUTH_REJECTED', 'OpenRouter rejected this API key. Update OPENROUTER_API_KEY in the API process before another submission.');
    return key;
  }
  rememberFailure(error: unknown, key: string): void {
    if (error instanceof ProviderError && ['PROVIDER_HTTP_401', 'PROVIDER_HTTP_403'].includes(error.code)) this.rejectedFingerprint = this.fingerprint(key);
  }
  private fingerprint(key: string): string { return createHash('sha256').update(key).digest('hex'); }
}

export function openRouterHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, 'X-OpenRouter-Title': 'VibeField' };
}

export class OpenRouterTextProvider {
  constructor(private readonly catalog: OpenRouterCatalog, private readonly auth: OpenRouterAuth) {}
  async generate(request: CompiledRequest, context: ProviderContext): Promise<ProviderResult> {
    if (request.provider !== 'openrouter' || request.kind !== 'text' || request.count !== 1) throw new ProviderError('OPENROUTER_TEXT_INVALID', 'OpenRouter copy requests require one text result.');
    if (request.refAssetIds.length || context.refs.length) throw new ProviderError('TEXT_REFERENCES_UNSUPPORTED', 'Campaign copy is text-only. Image references must not be silently dropped.');
    const key = this.auth.key();
    const catalog = await this.catalog.text();
    if (!catalog.models.some(model => model.id === request.model)) throw new ProviderError('MODEL_UNSUPPORTED', 'Text model is absent from the current public OpenRouter catalog.');
    try {
      const { data, headers } = await wireJson(`${OPENROUTER_BASE}/chat/completions`, {
        method: 'POST', headers: openRouterHeaders(key), signal: context.signal, timeoutMs: 120000, maxBytes: 4 * 1024 * 1024,
        body: { model: request.model, messages: [{ role: 'user', content: request.prompt }], stream: false, max_tokens: 4096, provider: { allow_fallbacks: false } },
      });
      const choice = Array.isArray(data.choices) ? record(data.choices[0]) : undefined;
      const message = record(choice?.message);
      const text = message?.content;
      if (typeof text !== 'string' || !text.trim() || Buffer.byteLength(text) > 1024 * 1024) throw new ProviderError('OPENROUTER_TEXT_EMPTY', 'OpenRouter returned no usable text. No automatic continuation or retry was made.', 'unknown');
      return { outputs: [], text: text.split(key).join('[redacted]'), modelReported: safeIdentifier(data.model, [key]) ?? null, usage: safeUsage(data.usage), metadata: {
        provider: 'openrouter', generationId: safeIdentifier(data.id, [key]) ?? null,
        requestId: safeIdentifier(headers.get('x-request-id'), [key]) ?? null,
        finishReason: safeIdentifier(choice?.finish_reason, [key]) ?? null, catalogFetchedAt: catalog.fetchedAt,
        warnings: choice?.finish_reason === 'length' ? ['Provider stopped at the output limit. No automatic continuation was submitted.'] : [],
      } };
    } catch (error) {
      this.auth.rememberFailure(error, key);
      if (error instanceof ProviderError) throw error;
      throw new ProviderError('OPENROUTER_TEXT_ERROR', 'OpenRouter text processing failed after submission.', 'unknown');
    }
  }
}
