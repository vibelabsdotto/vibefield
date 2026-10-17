import { z } from 'zod';
import {
  appearanceSchema, assetIdSchema, characterIdSchema, countSchema, derivationRoleSchema,
  durationSecondsSchema, identityVersionSchema, jobKindSchema, jobPurposeSchema,
  nonBlankStringSchema, requestedAspectRatioSchema, resolutionSchema, sha256Schema,
  uniqueAssetIdsSchema,
} from './common.js';

export const providerModelSchema = z.object({
  id: nonBlankStringSchema,
  label: nonBlankStringSchema,
  kind: jobKindSchema,
  maxReferences: z.number().int().nonnegative().optional(),
  maxOutputs: z.number().int().min(1).max(4).optional(),
  maxOutputsSource: z.enum(['observed', 'documented']).optional(),
  maxOutputsObservedAt: z.iso.date().optional(),
  durations: z.array(durationSecondsSchema).optional(),
  resolutions: z.array(resolutionSchema).optional(),
  aspectRatios: z.array(requestedAspectRatioSchema).optional(),
  supportsStartFrame: z.boolean().optional(),
  supportsAudio: z.boolean().optional(),
});
export const providerStatusSchema = z.object({
  id: nonBlankStringSchema,
  label: nonBlankStringSchema,
  kinds: z.array(jobKindSchema),
  configured: z.boolean(),
  available: z.boolean(),
  reason: z.string().optional(),
  models: z.array(providerModelSchema),
  warnings: z.array(z.string()),
  docsUrl: z.url(),
});
export type ProviderModel = z.infer<typeof providerModelSchema>;
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

export const referenceDescriptionSchema = z.object({
  assetId: assetIdSchema,
  role: nonBlankStringSchema,
  description: nonBlankStringSchema,
}).strict();
export const identitySnapshotSchema = z.object({
  characterId: characterIdSchema,
  identityVersion: identityVersionSchema,
  canonicalAssetId: assetIdSchema.nullable(),
  canonicalSha256: sha256Schema.optional(),
  appearance: appearanceSchema,
}).strict();
export const compiledRequestSchema = z.object({
  kind: jobKindSchema,
  purpose: jobPurposeSchema,
  provider: nonBlankStringSchema,
  model: nonBlankStringSchema,
  prompt: nonBlankStringSchema,
  negativePrompt: z.string().optional(),
  aspectRatio: requestedAspectRatioSchema,
  count: countSchema,
  refAssetIds: uniqueAssetIdsSchema,
  referenceRoles: z.array(referenceDescriptionSchema),
  identityVersion: identityVersionSchema.nullable(),
  identitySnapshot: identitySnapshotSchema.optional(),
  startFrameAssetId: assetIdSchema.optional(),
  params: z.object({
    durationSeconds: durationSecondsSchema.optional(),
    resolution: resolutionSchema.optional(),
    generateAudio: z.boolean().optional(),
    derivationRole: derivationRoleSchema.optional(),
  }).strict(),
  warnings: z.array(z.string()),
  droppedRefAssetIds: uniqueAssetIdsSchema,
}).strict().superRefine((request, ctx) => {
  const expectedKind = request.purpose === 'copy' ? 'text' : request.purpose === 'video' ? 'video' : 'image';
  if (request.kind !== expectedKind) ctx.addIssue({ code: 'custom', path: ['kind'], message: 'Kind does not match purpose' });
  if (request.referenceRoles.length !== request.refAssetIds.length || request.referenceRoles.some((ref, i) => ref.assetId !== request.refAssetIds[i])) {
    ctx.addIssue({ code: 'custom', path: ['referenceRoles'], message: 'Reference roles must match exact asset order' });
  }
  if (request.droppedRefAssetIds.some(id => request.refAssetIds.includes(id))) ctx.addIssue({ code: 'custom', path: ['droppedRefAssetIds'], message: 'Attached references cannot also be dropped' });
  if ((request.kind === 'video' || request.kind === 'text') && request.count !== 1) ctx.addIssue({ code: 'custom', path: ['count'], message: 'Video and text requests produce one result per explicit action' });
  if (request.kind === 'video' && (!request.startFrameAssetId || request.refAssetIds[0] !== request.startFrameAssetId)) {
    ctx.addIssue({ code: 'custom', path: ['startFrameAssetId'], message: 'Video requires its exact selected start frame first' });
  }
  if (request.kind !== 'video' && request.startFrameAssetId !== undefined) ctx.addIssue({ code: 'custom', path: ['startFrameAssetId'], message: 'Start frames apply only to video' });
  if (['derivation', 'still', 'video'].includes(request.purpose) && request.identityVersion === null) ctx.addIssue({ code: 'custom', path: ['identityVersion'], message: 'Anchored requests require an identity version' });
  if (['derivation', 'still'].includes(request.purpose) && request.referenceRoles[0]?.role !== 'canonical') ctx.addIssue({ code: 'custom', path: ['referenceRoles'], message: 'Canonical reference must be first' });
  if (request.purpose === 'derivation' && !request.params.derivationRole) ctx.addIssue({ code: 'custom', path: ['params', 'derivationRole'], message: 'Derivation requires a role' });
  if (request.purpose === 'copy' && request.refAssetIds.length > 0) ctx.addIssue({ code: 'custom', path: ['refAssetIds'], message: 'Copy is text-only; do not imply image inspection' });
  if (request.identitySnapshot && request.identitySnapshot.identityVersion !== request.identityVersion) ctx.addIssue({ code: 'custom', path: ['identitySnapshot'], message: 'Identity snapshot version must match request' });
  const snapshotCanonical = request.identitySnapshot?.canonicalAssetId;
  if (snapshotCanonical && ['portrait', 'derivation', 'still'].includes(request.purpose) && request.refAssetIds[0] !== snapshotCanonical) {
    ctx.addIssue({ code: 'custom', path: ['identitySnapshot', 'canonicalAssetId'], message: 'Snapshot canonical must be the first attached image' });
  }
  if (request.identitySnapshot?.canonicalSha256 && !snapshotCanonical) ctx.addIssue({ code: 'custom', path: ['identitySnapshot', 'canonicalSha256'], message: 'A canonical checksum requires its exact asset ID' });
  if (['derivation', 'still'].includes(request.purpose) && request.referenceRoles.filter(ref => ['canonical', 'sheet', 'angle', 'expression', 'upload'].includes(ref.role)).length > 2) {
    ctx.addIssue({ code: 'custom', path: ['referenceRoles'], message: 'At most two identity images may be attached' });
  }
  if (request.referenceRoles.filter(ref => ref.role === 'canonical').length > 1) ctx.addIssue({ code: 'custom', path: ['referenceRoles'], message: 'There can only be one primary canonical anchor' });
});
export type ReferenceDescription = z.infer<typeof referenceDescriptionSchema>;
export type IdentitySnapshot = z.infer<typeof identitySnapshotSchema>;
export type CompiledRequest = z.infer<typeof compiledRequestSchema>;
