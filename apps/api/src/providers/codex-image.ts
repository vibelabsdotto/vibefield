import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { CompiledRequest, ProviderStatus } from '@vibefield/contracts';
import { credentialFingerprint, readCodexCredential } from './codex-auth';
import { ProviderError, type ProviderAdapter, type ProviderContext, type ProviderResult } from './provider.types';
import { CODEX_BASE, IMAGE_BYTES_LIMIT, imageMime, inlineImage, record, safeIdentifier, safeUsage, wireJson } from './transport';

const WARNINGS = [
  'Unofficial experimental endpoint. May break without notice, uses ChatGPT/Codex account quota, and may be disallowed by OpenAI terms.',
  'Only gpt-image-2 is requested. Actual model is unverified unless the upstream response reports it.',
  'No functional quality or size control. Aspect ratio is prompt direction, not a guaranteed output shape.',
  'At most five ordered inline image references. No automatic retry, fallback, login or token refresh.',
];

export class CodexImageProvider implements ProviderAdapter {
  private rejectedCredential?: string;

  async describe(): Promise<ProviderStatus> {
    const configured = Boolean(process.env.VIBEFIELD_CODEX_ACCESS_TOKEN || process.env.VIBEFIELD_CODEX_AUTH_FILE);
    let reason: string | undefined;
    try {
      const credential = await readCodexCredential();
      if (credentialFingerprint(credential) === this.rejectedCredential) reason = 'Codex rejected this credential. Run codex login outside VibeField, then retry with the renewed credential.';
    } catch (error) { reason = error instanceof ProviderError ? error.message : 'Codex credentials are unavailable.'; }
    return {
      id: 'codex', label: 'Codex images · Experimental', kinds: ['image'], configured, available: !reason,
      ...(reason ? { reason } : {}), models: [{ id: 'gpt-image-2', label: 'GPT Image 2 requested · model execution unverified', kind: 'image', maxReferences: 5, maxOutputs: 1, maxOutputsSource: 'observed', maxOutputsObservedAt: '2026-10-17' }],
      warnings: [...WARNINGS, `Credential source: ${process.env.VIBEFIELD_CODEX_ACCESS_TOKEN !== undefined ? 'env' : process.env.VIBEFIELD_CODEX_AUTH_FILE ? 'auth_file' : 'not configured'}. Credentials stay in the API process.`],
      docsUrl: 'https://developers.openai.com/codex/auth',
    };
  }

  async generate(request: CompiledRequest, context: ProviderContext): Promise<ProviderResult> {
    if (request.kind !== 'image' || request.provider !== 'codex' || request.model !== 'gpt-image-2') throw new ProviderError('CODEX_MODEL_UNSUPPORTED', 'Codex images only accepts model gpt-image-2.');
    if (request.count !== 1) throw new ProviderError('COUNT_EXCEEDS_PROVIDER_MAX', 'Codex returns one image per request in the verified integration. Create a separate explicit job for another candidate.');
    if (context.refs.length > 5) throw new ProviderError('REFERENCE_LIMIT', 'Codex accepts at most five references. Recompile with explicit dropped-reference warnings.');
    if (context.refs.length !== request.refAssetIds.length || context.refs.some((ref, index) => ref.assetId !== request.refAssetIds[index])) throw new ProviderError('REFERENCE_MISMATCH', 'Resolved references must match the compiled image reference order exactly.');
    const credential = await readCodexCredential();
    const fingerprint = credentialFingerprint(credential);
    if (fingerprint === this.rejectedCredential) throw new ProviderError('CODEX_AUTH_REJECTED', 'Run codex login outside VibeField before submitting with this credential again.');
    const images = [];
    for (const ref of context.refs) images.push({ image_url: await inlineImage(ref, context.signal) });
    const turnId = randomUUID();
    const body: Record<string, unknown> = { model: 'gpt-image-2', prompt: request.prompt, n: request.count, quality: 'auto', size: 'auto', background: 'opaque' };
    if (images.length) body.images = images;
    const secrets = [credential.token, credential.accountId ?? ''];
    try {
      const { data, headers } = await wireJson(`${CODEX_BASE}/images/${images.length ? 'edits' : 'generations'}`, {
        method: 'POST', body, signal: context.signal, timeoutMs: 300000, maxBytes: 140 * 1024 * 1024,
        headers: { Authorization: `Bearer ${credential.token}`, originator: 'vibefield', 'x-codex-image-turn-id': turnId,
          ...(credential.accountId ? { 'ChatGPT-Account-ID': credential.accountId } : {}),
          ...(credential.residency ? { 'x-openai-internal-codex-residency': credential.residency } : {}) },
      });
      if (!Array.isArray(data.data) || data.data.length < 1 || data.data.length > 4) throw new ProviderError('CODEX_INVALID_OUTPUT', 'Codex returned no usable image array.', 'unknown');
      const outputs: ProviderResult['outputs'] = [];
      const imageMetadata: Record<string, unknown>[] = [];
      for (const value of data.data) {
        const image = record(value);
        const encoded = image?.b64_json;
        if (typeof encoded !== 'string' || encoded.length > Math.ceil(IMAGE_BYTES_LIMIT / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new ProviderError('CODEX_INVALID_OUTPUT', 'Codex image data is missing, invalid or too large.', 'unknown');
        const bytes = Buffer.from(encoded, 'base64');
        const mime = imageMime(bytes);
        if (!mime || !bytes.length || bytes.length > IMAGE_BYTES_LIMIT) throw new ProviderError('CODEX_INVALID_OUTPUT', 'Codex output is not a supported image.', 'unknown');
        let dimensions;
        try { dimensions = await sharp(bytes, { limitInputPixels: 40000000 }).timeout({ seconds: 20 }).metadata(); }
        catch { throw new ProviderError('CODEX_INVALID_OUTPUT', 'Codex image could not be decoded safely.', 'unknown'); }
        outputs.push({ bytes, mime });
        imageMetadata.push({ width: dimensions.width ?? null, height: dimensions.height ?? null,
          generationId: safeIdentifier(image?.generation_id, secrets) ?? null,
          qualityReported: safeIdentifier(image?.quality, secrets) ?? null, sizeReported: safeIdentifier(image?.size, secrets) ?? null });
      }
      const reportedModels = [...new Set(data.data.map(item => safeIdentifier(record(item)?.model, secrets)).filter((item): item is string => Boolean(item)))];
      const modelReported = safeIdentifier(data.model, secrets) ?? safeIdentifier(headers.get('openai-model'), secrets) ?? (reportedModels.length === 1 ? reportedModels[0]! : null);
      return { outputs, modelReported, usage: safeUsage(data.usage), metadata: {
        provider: 'codex', transport: 'experimental-native-images', modelRequested: 'gpt-image-2', modelReportedByProvider: modelReported !== null,
        qualityReported: safeIdentifier(data.quality, secrets) ?? null, sizeReported: safeIdentifier(data.size, secrets) ?? null,
        backgroundReported: safeIdentifier(data.background, secrets) ?? null,
        requestId: safeIdentifier(headers.get('x-codex-imagegen-request-id'), secrets) ?? safeIdentifier(headers.get('x-request-id'), secrets) ?? null,
        turnId, images: imageMetadata, requestedCount: request.count, returnedCount: outputs.length,
        warnings: [...WARNINGS, ...(outputs.length !== request.count ? ['Returned image count differs from requested count. No additional submission was made.'] : [])],
      } };
    } catch (error) {
      if (error instanceof ProviderError) {
        if (error.code === 'PROVIDER_HTTP_401' || error.code === 'PROVIDER_HTTP_403') {
          this.rejectedCredential = fingerprint;
          throw new ProviderError(error.code, 'Codex rejected access. Run codex login outside VibeField, then retry with the renewed credential.', error.submissionOutcome);
        }
        throw error;
      }
      throw new ProviderError('CODEX_OUTPUT_ERROR', 'Codex output processing failed after submission. No automatic resubmission was made.', 'unknown');
    }
  }

  async resume(): Promise<ProviderResult> {
    throw new ProviderError('PROVIDER_RESUME_UNSUPPORTED', 'Native Codex images are synchronous and cannot be resumed or automatically resubmitted.');
  }
}
