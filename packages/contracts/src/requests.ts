import { z } from 'zod';
import {
  appearanceSchema, aspectRatioSchema, assetIdSchema, assetKindSchema, campaignIdSchema,
  campaignStatusSchema, characterIdSchema, characterStatusSchema, countSchema, derivationRoleSchema,
  durationSecondsSchema, entityIdSchema, jobStatusSchema, nonBlankStringSchema, personaSchema,
  positionSchema, referenceRoleSchema, requestedAspectRatioSchema, resolutionSchema,
  reviewContextTypeSchema, reviewDecisionSchema, shotIdSchema, uniqueAssetIdsSchema, uniqueCharacterIdsSchema,
} from './common.js';
import { reviewChecklistItemSchema } from './entities.js';

const name = nonBlankStringSchema.max(200);
const direction = z.string().max(12000);
const description = z.string().max(20000);
const provider = nonBlankStringSchema.max(200);
const model = nonBlankStringSchema.max(300);
const hasChanges = (value: Record<string, unknown>) => Object.values(value).some(item => item !== undefined);
const patchMessage = 'Provide at least one editable field';

export const createCharacterSchema = z.object({
  name, description: description.default(''), appearance: appearanceSchema.default({}), persona: personaSchema.default({}),
}).strict();
export const patchCharacterSchema = z.object({
  name: name.optional(), description: description.optional(), appearance: appearanceSchema.optional(),
  persona: personaSchema.optional(), status: characterStatusSchema.optional(),
}).strict().refine(hasChanges, patchMessage);

const campaignFields = {
  name, brief: description, productName: z.string().max(500), productAssetIds: uniqueAssetIdsSchema,
  characterIds: uniqueCharacterIdsSchema, format: aspectRatioSchema, status: campaignStatusSchema,
};
export const createCampaignSchema = z.object({
  ...campaignFields, brief: campaignFields.brief.default(''), productName: campaignFields.productName.default(''),
  productAssetIds: uniqueAssetIdsSchema.default([]), characterIds: uniqueCharacterIdsSchema.default([]),
  format: aspectRatioSchema.default('9:16'), status: campaignStatusSchema.default('draft'),
}).strict();
export const patchCampaignSchema = z.object(campaignFields).partial().strict().refine(hasChanges, patchMessage);

const shotFields = {
  characterId: characterIdSchema, title: name, scene: direction, action: direction, camera: direction,
  lighting: direction, wardrobe: direction, dialogue: direction, motion: direction,
  refAssetIds: uniqueAssetIdsSchema, durationSeconds: durationSecondsSchema, resolution: resolutionSchema,
};
export const createShotSchema = z.object({
  ...shotFields, scene: direction.default(''), action: direction.default(''), camera: direction.default(''),
  lighting: direction.default(''), wardrobe: direction.default(''), dialogue: direction.default(''), motion: direction.default(''),
  refAssetIds: uniqueAssetIdsSchema.default([]), durationSeconds: durationSecondsSchema.default(5), resolution: resolutionSchema.default('720p'),
}).strict();
export const patchShotSchema = z.object(shotFields).partial().strict().refine(hasChanges, patchMessage);

export const createReferenceSchema = z.object({
  assetId: assetIdSchema, role: referenceRoleSchema,
  approved: z.boolean().default(false), consentConfirmed: z.boolean().default(false),
}).strict();
export const patchReferenceSchema = z.object({ approved: z.boolean().optional(), position: positionSchema.optional() })
  .strict().refine(hasChanges, patchMessage);
export const selectAssetSchema = z.object({ assetId: assetIdSchema }).strict();
export const reorderShotsSchema = z.object({
  ids: z.array(shotIdSchema).refine(ids => new Set(ids).size === ids.length, 'Shot IDs must be unique'),
}).strict();

const generationFields = { count: countSchema.default(1), provider: provider.optional(), model: model.optional() };
export const generationOptionsSchema = z.object({ ...generationFields, aspectRatio: requestedAspectRatioSchema.optional() }).strict();
export const portraitOptionsSchema = generationOptionsSchema.extend({ notes: direction.optional() });
export const derivationOptionsSchema = z.object({ ...generationFields, role: derivationRoleSchema, spec: direction.optional() }).strict();
export const stillOptionsSchema = z.object(generationFields).strict();
export const videoOptionsSchema = z.object({
  confirmExternal: z.literal(true), model: model.optional(), durationSeconds: durationSecondsSchema.optional(),
  resolution: resolutionSchema.optional(), generateAudio: z.boolean().optional(),
}).strict();
export const copyOptionsSchema = z.object({ instruction: description.optional(), model: model.optional() }).strict();

export const createReviewSchema = z.object({
  assetId: assetIdSchema, contextType: reviewContextTypeSchema,
  contextId: z.union([characterIdSchema, shotIdSchema]), decision: reviewDecisionSchema,
  checklist: z.array(reviewChecklistItemSchema).max(100).default([]), notes: description.default(''),
}).strict().superRefine((review, ctx) => {
  const schema = review.contextType === 'character' ? characterIdSchema : shotIdSchema;
  if (!schema.safeParse(review.contextId).success) ctx.addIssue({ code: 'custom', path: ['contextId'], message: 'Context ID must match context type' });
});
export const patchSettingsSchema = z.object({
  defaultImageProvider: provider.optional(), defaultImageModel: model.optional(),
  defaultVideoModel: model.optional(), defaultTextModel: model.optional(),
}).strict().refine(hasChanges, patchMessage);
export const resolveJobSchema = z.object({
  action: z.enum(['mark_failed', 'resubmit', 'attach_provider_job', 'resume']),
  providerJobId: nonBlankStringSchema.max(1000).optional(), confirmExternal: z.boolean().optional(),
}).strict().superRefine((input, ctx) => {
  if (input.action === 'attach_provider_job' && !input.providerJobId) ctx.addIssue({ code: 'custom', path: ['providerJobId'], message: 'Attaching a provider job requires its ID' });
  if (input.action !== 'attach_provider_job' && input.providerJobId !== undefined) ctx.addIssue({ code: 'custom', path: ['providerJobId'], message: 'Provider job ID is only accepted for attach_provider_job' });
});
export const emptyBodySchema = z.object({}).strict();
export const uploadConsentSchema = z.object({ consent: z.literal('true') }).strict();

// Coerce only decimal query strings, not null, booleans, empty text or exponent notation.
const queryLimit = z.union([z.number().int().min(1).max(200), z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(1).max(200))]).default(100);
const paginationFields = { limit: queryLimit, cursor: nonBlankStringSchema.max(2000).optional() };
export const paginationSchema = z.object(paginationFields).strict();
export const assetListQuerySchema = z.object({
  ...paginationFields, kind: assetKindSchema.optional(), q: z.string().max(1000).optional(),
  characterId: characterIdSchema.optional(), campaignId: campaignIdSchema.optional(),
}).strict();
export const jobListQuerySchema = z.object({
  ...paginationFields, status: jobStatusSchema.optional(), characterId: characterIdSchema.optional(),
  shotId: shotIdSchema.optional(), campaignId: campaignIdSchema.optional(),
}).strict();
export const historyListQuerySchema = z.object({
  ...paginationFields, entityType: nonBlankStringSchema.max(100).optional(), entityId: entityIdSchema.optional(),
}).strict();
export const previewQuerySchema = z.object({ kind: z.enum(['still', 'video']).default('still') }).strict();
export const thumbnailQuerySchema = z.object({ w: z.enum(['256', '768']).default('768') }).strict();

export type CreateCharacterInput = z.input<typeof createCharacterSchema>;
export type PatchCharacterInput = z.input<typeof patchCharacterSchema>;
export type CreateCampaignInput = z.input<typeof createCampaignSchema>;
export type PatchCampaignInput = z.input<typeof patchCampaignSchema>;
export type CreateShotInput = z.input<typeof createShotSchema>;
export type PatchShotInput = z.input<typeof patchShotSchema>;
export type CreateReferenceInput = z.input<typeof createReferenceSchema>;
export type PatchReferenceInput = z.input<typeof patchReferenceSchema>;
export type CreateReviewInput = z.input<typeof createReviewSchema>;
export type GenerationOptions = z.input<typeof generationOptionsSchema>;
export type PortraitOptions = z.input<typeof portraitOptionsSchema>;
export type DerivationOptions = z.input<typeof derivationOptionsSchema>;
export type StillOptions = z.input<typeof stillOptionsSchema>;
export type VideoOptions = z.input<typeof videoOptionsSchema>;
export type CopyOptions = z.input<typeof copyOptionsSchema>;
export type PatchSettingsInput = z.input<typeof patchSettingsSchema>;
export type ResolveJobInput = z.input<typeof resolveJobSchema>;
export type SelectAssetInput = z.input<typeof selectAssetSchema>;
export type ReorderShotsInput = z.input<typeof reorderShotsSchema>;
export type Pagination = z.output<typeof paginationSchema>;
export type AssetListQuery = z.output<typeof assetListQuerySchema>;
export type JobListQuery = z.output<typeof jobListQuerySchema>;
export type HistoryListQuery = z.output<typeof historyListQuerySchema>;
