import { Injectable } from '@nestjs/common';
import { compiledRequestSchema, type CompiledRequest, type ProviderStatus } from '@vibefield/contracts';
import { CodexImageProvider } from './codex-image';
import { OpenRouterCatalog, selectDefaultVideoModel } from './openrouter-catalog';
import { OpenRouterAuth, OpenRouterTextProvider } from './openrouter-text';
import { OpenRouterVideoProvider, VIDEO_WARNINGS } from './openrouter-video';
import { ProviderError, type ProviderContext, type ProviderResult } from './provider.types';
export { ProviderError } from './provider.types';
export type { ProviderContext, ProviderResult } from './provider.types';

@Injectable()
export class ProvidersService {
  private readonly catalog = new OpenRouterCatalog();
  private readonly codex = new CodexImageProvider();
  private readonly openrouterAuth = new OpenRouterAuth();
  private readonly text = new OpenRouterTextProvider(this.catalog, this.openrouterAuth);
  private readonly video = new OpenRouterVideoProvider(this.catalog, this.openrouterAuth);

  async describe(): Promise<ProviderStatus[]> {
    const [codex, video, text] = await Promise.all([this.codex.describe(), this.catalog.video().catch(() => null), this.catalog.text().catch(() => null)]);
    let authReason: string | undefined;
    try { this.openrouterAuth.key(); } catch (error) { authReason = error instanceof ProviderError ? error.message : 'OpenRouter credentials are unavailable.'; }
    const warnings = [...VIDEO_WARNINGS, 'Availability indicates configured credentials and catalog access, not a successful authenticated generation. Text requests disable provider fallbacks and never auto-continue.'];
    if (!video) warnings.push('Video catalog unavailable. Video submission is disabled until public discovery succeeds.');
    if (!text) warnings.push('Text catalog unavailable. Copy submission is disabled until public discovery succeeds.');
    if (process.env.VIBEFIELD_ALLOW_VIDEO !== '1') warnings.push('External video submission is disabled. Set VIBEFIELD_ALLOW_VIDEO=1 and use the API submission-budget gate; free resume remains available.');
    if (video) warnings.push(`Video catalog fetched ${video.fetchedAt}; cached for five minutes. Omitted capabilities are unknown, not supported.`);
    const preferred = video ? selectDefaultVideoModel(video.models) : undefined;
    const videoModels = video ? [...video.models].sort((a, b) => Number(b.id === preferred?.id) - Number(a.id === preferred?.id)) : [];
    const reason = authReason ?? (!video && !text ? 'Public OpenRouter text and video catalogs are unavailable.' : undefined);
    return [codex, { id: 'openrouter', label: 'OpenRouter', kinds: ['text', 'video'], configured: Boolean(process.env.OPENROUTER_API_KEY), available: !reason,
      ...(reason ? { reason } : {}), models: [...videoModels, ...(text?.models ?? [])], warnings,
      docsUrl: 'https://openrouter.ai/docs/guides/overview/multimodal/video-generation' }];
  }

  /** For SettingsService's unset video default. Never returns an invented or stale ID. */
  async defaultVideoModel(): Promise<string | null> {
    try { return await this.catalog.defaultVideoModel(); } catch { return null; }
  }

  async generate(request: CompiledRequest, context: ProviderContext): Promise<ProviderResult> {
    const parsed = compiledRequestSchema.safeParse(request);
    if (!parsed.success) throw new ProviderError('COMPILED_REQUEST_INVALID', 'Provider request does not satisfy the immutable generation contract.');
    if (request.provider === 'codex' && request.kind === 'image') return this.codex.generate(request, context);
    if (request.provider === 'openrouter' && request.kind === 'text') return this.text.generate(request, context);
    if (request.provider === 'openrouter' && request.kind === 'video') return this.video.generate(request, context);
    throw new ProviderError('PROVIDER_UNSUPPORTED', 'No configured adapter supports this provider and generation kind. No fallback was attempted.');
  }

  async verifyVideoJob(providerJobId: string, signal: AbortSignal): Promise<{ id: string; status: string; modelReported: string | null }> {
    return this.video.verify(providerJobId, signal);
  }

  async resume(request: CompiledRequest, providerJobId: string, context: ProviderContext): Promise<ProviderResult> {
    if (request.provider === 'openrouter' && request.kind === 'video') return this.video.resume(request, providerJobId, context);
    throw new ProviderError('PROVIDER_RESUME_UNSUPPORTED', 'Only acknowledged OpenRouter videos support free poll/download resume. No generation was submitted.');
  }
}
