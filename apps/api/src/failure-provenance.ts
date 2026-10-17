import { z } from 'zod';
import { assetIdSchema, isoDateSchema, sha256Schema } from '@vibefield/contracts';
import type { ProviderError } from './providers/provider.types';

const quantity = z.number().int().nonnegative();
const imageMime = z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
// Unknown fields are stripped at both levels; raw provider bodies are never audited.
const metadataSchema = z.object({
  catalogFetchedAt: isoDateSchema.max(40).optional(),
  startFrame: z.object({
    assetId: assetIdSchema.optional(),
    adapted: z.boolean().optional(),
    originalMime: imageMime.optional(), sentMime: imageMime.optional(),
    originalBytes: quantity.optional(), sentBytes: quantity.optional(),
    originalWidth: quantity.optional(), originalHeight: quantity.optional(),
    sentWidth: quantity.optional(), sentHeight: quantity.optional(),
    originalSha256: sha256Schema.optional(), sentSha256: sha256Schema.optional(),
    localInlineByteLimit: quantity.optional(),
    inlineInputSupport: z.enum(['unverified', 'provider_dependent']).optional(),
  }).optional(),
});

export function failureProvenance(error: ProviderError): Record<string, unknown> {
  const parsed = metadataSchema.safeParse(error.metadata);
  const payload = {
    code: error.code,
    ...(error.providerJobId ? { providerJobId: error.providerJobId } : {}),
    ...(parsed.success ? { metadata: parsed.data } : { metadataOmitted: true }),
  };
  return Buffer.byteLength(JSON.stringify(payload), 'utf8') <= 4096 ? payload : { metadataOmitted: true };
}
