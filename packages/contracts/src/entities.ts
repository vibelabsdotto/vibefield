import { z } from 'zod';
import {
  appearanceSchema, aspectRatioSchema, assetIdSchema, assetKindSchema, campaignIdSchema,
  campaignStatusSchema, characterIdSchema, characterStatusSchema, durationSecondsSchema,
  historyIdSchema, identityVersionSchema, isoDateSchema, jobIdSchema, jobKindSchema,
  jobPurposeSchema, jobStatusSchema, nonBlankStringSchema, personaSchema, positionSchema,
  referenceIdSchema, referenceRoleSchema, resolutionSchema, reviewContextTypeSchema,
  reviewDecisionSchema, reviewIdSchema, reviewResultSchema, sha256Schema, shotIdSchema,
  shotStatusSchema, submissionIdSchema, submissionOutcomeSchema, uniqueAssetIdsSchema,
  uniqueCharacterIdsSchema,
} from './common.js';
import { compiledRequestSchema, providerStatusSchema } from './generation.js';

const timestamps = { createdAt: isoDateSchema, updatedAt: isoDateSchema };
export const characterSchema = z.object({
  id: characterIdSchema, slug: nonBlankStringSchema, name: nonBlankStringSchema,
  description: z.string(), appearance: appearanceSchema, persona: personaSchema,
  status: characterStatusSchema, canonicalAssetId: assetIdSchema.nullable(),
  identityVersion: identityVersionSchema, ...timestamps,
}).refine(character => character.status !== 'active' || character.canonicalAssetId !== null, {
  message: 'An active character requires a canonical image', path: ['canonicalAssetId'],
});
export const characterReferenceSchema = z.object({
  id: referenceIdSchema, characterId: characterIdSchema, assetId: assetIdSchema,
  role: referenceRoleSchema, position: positionSchema, approved: z.boolean(),
  identityVersion: identityVersionSchema, sourceJobId: jobIdSchema.nullable(),
  consentConfirmed: z.boolean(), ...timestamps,
});
export const campaignSchema = z.object({
  id: campaignIdSchema, name: nonBlankStringSchema, brief: z.string(), productName: z.string(),
  productAssetIds: uniqueAssetIdsSchema, characterIds: uniqueCharacterIdsSchema,
  format: aspectRatioSchema, status: campaignStatusSchema, ...timestamps,
});
export const shotSchema = z.object({
  id: shotIdSchema, campaignId: campaignIdSchema, characterId: characterIdSchema,
  position: positionSchema, title: nonBlankStringSchema, scene: z.string(), action: z.string(),
  camera: z.string(), lighting: z.string(), wardrobe: z.string(), dialogue: z.string(), motion: z.string(),
  refAssetIds: uniqueAssetIdsSchema, durationSeconds: durationSecondsSchema, resolution: resolutionSchema,
  selectedStillAssetId: assetIdSchema.nullable(), selectedVideoAssetId: assetIdSchema.nullable(),
  stillIdentityVersion: identityVersionSchema.nullable(), status: shotStatusSchema, ...timestamps,
});
export const assetSchema = z.object({
  id: assetIdSchema, sha256: sha256Schema, kind: assetKindSchema, mime: nonBlankStringSchema,
  bytes: z.number().int().nonnegative(), width: z.number().int().positive().nullable(),
  height: z.number().int().positive().nullable(), durationMs: z.number().finite().nonnegative().nullable(),
  storageKey: nonBlankStringSchema, originalName: z.string(), sourceJobId: jobIdSchema.nullable(),
  consentConfirmed: z.boolean(), createdAt: isoDateSchema,
  contentUrl: z.string().optional(), thumbUrl: z.string().optional(),
});
export const jobErrorSchema = z.object({ code: nonBlankStringSchema, message: z.string() });
export const jobSchema = z.object({
  id: jobIdSchema, idempotencyKey: nonBlankStringSchema, requestHash: sha256Schema,
  kind: jobKindSchema, purpose: jobPurposeSchema,
  characterId: characterIdSchema.nullable(), campaignId: campaignIdSchema.nullable(), shotId: shotIdSchema.nullable(),
  provider: nonBlankStringSchema, modelRequested: nonBlankStringSchema, modelReported: z.string().nullable(),
  request: compiledRequestSchema, status: jobStatusSchema, providerJobId: z.string().nullable(),
  outputAssetIds: uniqueAssetIdsSchema, resultText: z.string().nullable(), result: z.unknown().nullable(),
  error: jobErrorSchema.nullable(), ...timestamps, submittedAt: isoDateSchema.nullable(), finishedAt: isoDateSchema.nullable(),
});
export const reviewChecklistItemSchema = z.object({
  item: nonBlankStringSchema.max(500), result: reviewResultSchema, note: z.string().max(8000).optional(),
}).strict();
export const reviewSchema = z.object({
  id: reviewIdSchema, assetId: assetIdSchema, contextType: reviewContextTypeSchema,
  contextId: z.union([characterIdSchema, shotIdSchema]), decision: reviewDecisionSchema,
  checklist: z.array(reviewChecklistItemSchema), notes: z.string(), actor: nonBlankStringSchema,
  createdAt: isoDateSchema,
}).superRefine((review, ctx) => {
  const schema = review.contextType === 'character' ? characterIdSchema : shotIdSchema;
  if (!schema.safeParse(review.contextId).success) ctx.addIssue({ code: 'custom', path: ['contextId'], message: 'Context ID must match context type' });
});
export const submissionSchema = z.object({
  id: submissionIdSchema, jobId: jobIdSchema, provider: nonBlankStringSchema,
  kind: jobKindSchema, outcome: submissionOutcomeSchema, createdAt: isoDateSchema,
});
export const historySchema = z.object({
  id: historyIdSchema, at: isoDateSchema, actor: nonBlankStringSchema,
  entityType: nonBlankStringSchema, entityId: nonBlankStringSchema, action: nonBlankStringSchema, payload: z.unknown(),
});
export const settingsSchema = z.object({
  providers: z.array(providerStatusSchema),
  defaults: z.object({ imageProvider: z.string(), imageModel: z.string(), videoModel: z.string(), textModel: z.string() }),
  videoBudget: z.object({
    cap: z.number().int().nonnegative(), used: z.number().int().nonnegative(), remaining: z.number().int().nonnegative(),
    enabled: z.boolean(), submissions: z.array(submissionSchema),
  }),
  storage: z.object({ dataDir: z.string() }),
});
export const healthSchema = z.object({
  ok: z.literal(true), version: z.string(), dataDir: z.string(),
  runner: z.object({ active: z.boolean(), jobId: jobIdSchema.optional() }),
});
export const jobStartedSchema = z.object({ jobId: jobIdSchema });
export const assetUploadedSchema = z.object({ asset: assetSchema });

export type Character = z.infer<typeof characterSchema>;
export type CharacterReference = z.infer<typeof characterReferenceSchema>;
export type Campaign = z.infer<typeof campaignSchema>;
export type Shot = z.infer<typeof shotSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Job = z.infer<typeof jobSchema>;
export type JobError = z.infer<typeof jobErrorSchema>;
export type ReviewChecklistItem = z.infer<typeof reviewChecklistItemSchema>;
export type Review = z.infer<typeof reviewSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type History = z.infer<typeof historySchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Health = z.infer<typeof healthSchema>;
export type JobStarted = z.infer<typeof jobStartedSchema>;
export type AssetUploaded = z.infer<typeof assetUploadedSchema>;
export interface CharacterDetail extends Character { references?: CharacterReference[]; assets?: Asset[] }
export interface CampaignDetail extends Campaign { shots: Shot[] }
export interface ShotDetail extends Shot { assets?: Asset[]; jobs?: Job[]; character?: Character; stale?: boolean }
export interface AssetDetail extends Asset { reviews?: Review[] }
export interface JobDetail extends Job { assets?: Asset[]; history?: History[] }
