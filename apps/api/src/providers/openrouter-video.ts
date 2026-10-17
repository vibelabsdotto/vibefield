import { setTimeout as delay } from 'node:timers/promises';
import type { CompiledRequest } from '@vibefield/contracts';
import { OpenRouterCatalog } from './openrouter-catalog';
import { OpenRouterAuth, openRouterHeaders } from './openrouter-text';
import { ProviderError, type ProviderContext, type ProviderResult } from './provider.types';
import { OPENROUTER_BASE, VIDEO_BYTES_LIMIT, safeIdentifier, safeUsage, wire, wireJson } from './transport';
import { prepareStartFrame } from './video-frame';

export const VIDEO_WARNINGS = [
  'Your selected frame is sent inline to OpenRouter. Acceptance and safety rules vary by model and provider.',
  'No public upload fallback. A rejected or ambiguous submission still consumes the local submission budget.',
  'Only the selected first frame is attached, not canonical or subject-reference images. No webhook is registered.',
  'Video is not eligible for zero data retention. Provider credits and account routing permissions are required.',
  'Input frames use a conservative local 4 MiB / 2048px envelope. Re-encoding and dimensions are recorded, not claimed as universal provider limits.',
];
const POLL_INTERVAL_MS = 30000;
const POLL_DEADLINE_MS = 15 * 60 * 1000;

function jobId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) throw new ProviderError('VIDEO_JOB_ID_INVALID', 'Video job ID is missing or invalid. Do not automatically submit again.', 'unknown');
  return value;
}

export class OpenRouterVideoProvider {
  constructor(private readonly catalog: OpenRouterCatalog, private readonly auth: OpenRouterAuth) {}

  async generate(request: CompiledRequest, context: ProviderContext): Promise<ProviderResult> {
    if (request.provider !== 'openrouter' || request.kind !== 'video' || request.count !== 1) throw new ProviderError('VIDEO_REQUEST_INVALID', 'Video generation requires one explicit OpenRouter video request.');
    if (process.env.VIBEFIELD_ALLOW_VIDEO !== '1') throw new ProviderError('VIDEO_DISABLED', 'External video submission requires VIBEFIELD_ALLOW_VIDEO=1 and API submission-budget admission.');
    const key = this.auth.key();
    const catalog = await this.catalog.video();
    const model = catalog.models.find(item => item.id === request.model);
    if (!model || model.supportsStartFrame !== true || !model.durations?.length || !model.resolutions?.length || !model.aspectRatios?.length) throw new ProviderError('VIDEO_MODEL_UNSUPPORTED', 'Model does not advertise the complete first-frame generation capabilities required by VibeField.');
    if (!model.durations.includes(request.params.durationSeconds ?? NaN)) throw new ProviderError('VIDEO_DURATION_UNSUPPORTED', 'Duration must exactly match an advertised value for the chosen video model.');
    if (!model.resolutions.includes(request.params.resolution ?? '')) throw new ProviderError('VIDEO_RESOLUTION_UNSUPPORTED', 'Resolution must exactly match an advertised value for the chosen video model.');
    if (!model.aspectRatios.includes(request.aspectRatio)) throw new ProviderError('VIDEO_ASPECT_UNSUPPORTED', 'Aspect ratio is not advertised by the chosen video model.');
    if (request.params.generateAudio === true && model.supportsAudio !== true) throw new ProviderError('VIDEO_AUDIO_UNSUPPORTED', 'Audio generation is not explicitly advertised by this model. Disable audio or choose another model.');
    const ref = context.refs[0];
    if (!ref || context.refs.length !== 1 || request.refAssetIds.length !== 1 || request.startFrameAssetId !== ref.assetId || request.refAssetIds[0] !== ref.assetId) throw new ProviderError('VIDEO_START_FRAME_REQUIRED', 'Video requires exactly the selected first-frame asset, resolved in compiled order.');
    const frame = await prepareStartFrame(ref, request.model, context.signal);
    let submittedId: string | undefined;
    try {
      // The sole paid POST. No other code path in this adapter submits.
      const { data } = await wireJson(`${OPENROUTER_BASE}/videos`, {
        method: 'POST', headers: openRouterHeaders(key), signal: context.signal, timeoutMs: 90000, maxBytes: 1024 * 1024,
        body: { model: request.model, prompt: request.prompt, duration: request.params.durationSeconds, resolution: request.params.resolution,
          aspect_ratio: request.aspectRatio, generate_audio: request.params.generateAudio ?? false,
          frame_images: [{ type: 'image_url', image_url: { url: frame.dataUrl }, frame_type: 'first_frame' }] },
      });
      submittedId = jobId(data.id);
      // Await durable acknowledgement before even the first free status GET.
      try { await context.onSubmitted(submittedId); }
      catch { throw new ProviderError('VIDEO_ACK_PERSIST_FAILED', 'OpenRouter acknowledged the job, but local acknowledgement persistence failed. Recover this provider job ID; do not submit again.', 'accepted', submittedId); }
      const result = await this.poll(submittedId, context, key);
      return { ...result, metadata: { ...result.metadata, startFrame: frame.metadata, catalogFetchedAt: catalog.fetchedAt } };
    } catch (error) {
      this.auth.rememberFailure(error, key);
      const safeError = error instanceof ProviderError ? error : new ProviderError('VIDEO_SUBMISSION_ERROR', 'Video submission or observation failed. No automatic resubmission was made.', submittedId ? 'accepted' : 'unknown', submittedId);
      safeError.metadata = { startFrame: frame.metadata, catalogFetchedAt: catalog.fetchedAt, warnings: VIDEO_WARNINGS };
      throw safeError;
    }
  }

  /** Verify ownership/access and status without waiting or submitting. */
  async verify(providerJobId: string, signal: AbortSignal): Promise<{ id: string; status: string; modelReported: string | null }> {
    const id = jobId(providerJobId);
    const key = this.auth.key();
    try {
      const { data } = await wireJson(`${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}`, {
        headers: openRouterHeaders(key), signal, timeoutMs: 30000, maxBytes: 1024 * 1024, providerJobId: id,
      });
      if (data.id !== id) throw new ProviderError('VIDEO_JOB_MISMATCH', 'OpenRouter returned a different job ID.', 'accepted', id);
      const status = String(data.status);
      if (!['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'].includes(status)) {
        throw new ProviderError('VIDEO_STATUS_UNKNOWN', 'OpenRouter returned an unknown video status. Keep the job ID for manual recovery.', 'accepted', id);
      }
      return { id, status, modelReported: safeIdentifier(data.model, [key]) ?? null };
    } catch (error) {
      this.auth.rememberFailure(error, key);
      throw error;
    }
  }

  async resume(request: CompiledRequest, providerJobId: string, context: ProviderContext): Promise<ProviderResult> {
    if (request.provider !== 'openrouter' || request.kind !== 'video') throw new ProviderError('PROVIDER_RESUME_UNSUPPORTED', 'Only acknowledged OpenRouter video jobs can be resumed.');
    const id = jobId(providerJobId);
    try {
      const key = this.auth.key();
      try { return await this.poll(id, context, key); }
      catch (error) { this.auth.rememberFailure(error, key); throw error; }
    } catch (error) {
      if (error instanceof ProviderError) throw new ProviderError(error.code, error.message, 'accepted', id);
      throw new ProviderError('VIDEO_RESUME_ERROR', 'Video observation failed. The existing provider job can be resumed without resubmitting.', 'accepted', id);
    }
  }

  private async poll(id: string, context: ProviderContext, key: string): Promise<ProviderResult> {
    const endpoint = `${OPENROUTER_BASE}/videos/${encodeURIComponent(id)}`;
    const deadline = Date.now() + POLL_DEADLINE_MS;
    for (;;) {
      if (context.signal.aborted) throw new ProviderError('PROVIDER_CANCELLED', 'Video observation cancelled locally. Upstream generation may continue; resume the existing job.', 'accepted', id);
      if (Date.now() >= deadline) throw new ProviderError('VIDEO_POLL_TIMEOUT', 'Video polling deadline reached. Generation may continue upstream; resume this job without another submission.', 'accepted', id);
      const { data, headers } = await wireJson(endpoint, { headers: openRouterHeaders(key), signal: context.signal, timeoutMs: Math.min(30000, deadline - Date.now()), maxBytes: 1024 * 1024, providerJobId: id });
      if (data.id !== id) throw new ProviderError('VIDEO_JOB_MISMATCH', 'OpenRouter returned a different job ID while polling.', 'accepted', id);
      if (data.status === 'completed') {
        const outputCount = Array.isArray(data.urls) && data.urls.length ? data.urls.length : Array.isArray(data.unsigned_urls) && data.unsigned_urls.length ? data.unsigned_urls.length : 1;
        if (outputCount > 4) throw new ProviderError('VIDEO_OUTPUT_LIMIT', 'OpenRouter returned more outputs than the bounded download limit.', 'accepted', id);
        const outputs: ProviderResult['outputs'] = [];
        // Ignore arbitrary unsigned URLs. Authenticated downloads always use this fixed host/path.
        for (let index = 0; index < outputCount; index++) {
          const signed = Array.isArray(data.urls) ? this.signedContentUrl(data.urls[index], endpoint, index, key) : undefined;
          if (signed) { outputs.push({ url: signed, mime: 'video/mp4' }); continue; }
          const { bytes, headers: contentHeaders } = await wire(`${endpoint}/content?index=${index}`, {
            headers: { ...openRouterHeaders(key), Accept: 'video/mp4' }, signal: context.signal, timeoutMs: 120000, maxBytes: VIDEO_BYTES_LIMIT, providerJobId: id,
          });
          const mime = contentHeaders.get('content-type')?.split(';')[0]?.trim();
          if ((mime !== 'video/mp4' && mime !== 'application/octet-stream') || bytes.length < 12 || bytes.toString('ascii', 4, 8) !== 'ftyp') throw new ProviderError('VIDEO_CONTENT_INVALID', 'OpenRouter content is not a supported MP4. Resume download without resubmitting.', 'accepted', id);
          outputs.push({ bytes, mime: 'video/mp4' });
        }
        return { outputs, modelReported: safeIdentifier(data.model, [key]) ?? null, usage: safeUsage(data.usage), metadata: {
          provider: 'openrouter', providerJobId: id, generationId: safeIdentifier(data.generation_id, [key]) ?? null,
          requestId: safeIdentifier(headers.get('x-request-id'), [key]) ?? null,
          expiresAt: typeof data.expires_at === 'number' && Number.isFinite(data.expires_at) ? data.expires_at : null,
          contentPath: `/api/v1/videos/${encodeURIComponent(id)}/content`, status: 'completed', warnings: VIDEO_WARNINGS,
        } };
      }
      if (['failed', 'cancelled', 'expired'].includes(String(data.status))) throw new ProviderError(`VIDEO_${String(data.status).toUpperCase()}`, 'OpenRouter reports a terminal unsuccessful video job. No public upload fallback or automatic resubmission was made.', 'accepted', id);
      if (data.status !== 'pending' && data.status !== 'in_progress') throw new ProviderError('VIDEO_STATUS_UNKNOWN', 'OpenRouter returned an unknown video status. Keep the job ID for manual recovery.', 'accepted', id);
      try { await delay(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())), undefined, { signal: context.signal }); }
      catch { throw new ProviderError('PROVIDER_CANCELLED', 'Video observation cancelled locally. This does not cancel or refund upstream generation.', 'accepted', id); }
    }
  }

  private signedContentUrl(value: unknown, endpoint: string, index: number, key: string): string | undefined {
    if (typeof value !== 'string' || value.length > 8192 || value.includes(key)) return undefined;
    try {
      const url = new URL(value);
      if (url.origin !== 'https://openrouter.ai' || url.username || url.password || url.hash || url.pathname !== `${new URL(endpoint).pathname}/content`) return undefined;
      if ((url.searchParams.get('index') ?? '0') !== String(index) || !url.searchParams.size) return undefined;
      if ([...url.searchParams.keys()].some(name => /api.?key|authorization|access.?token/i.test(name))) return undefined;
      return url.href;
    } catch { return undefined; }
  }
}
