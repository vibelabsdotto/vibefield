import { z } from 'zod';

export const CHARACTER_STATUSES = ['draft', 'active', 'archived'] as const;
export const CAMPAIGN_STATUSES = ['draft', 'active', 'done', 'archived'] as const;
export const SHOT_STATUSES = ['draft', 'stills', 'still_selected', 'video', 'done'] as const;
export const REFERENCE_ROLES = ['sheet', 'angle', 'expression', 'scene', 'upload'] as const;
export const DERIVATION_ROLES = ['sheet', 'angle', 'expression'] as const;
export const ASPECT_RATIOS = ['9:16', '16:9', '1:1', '3:4', '4:5'] as const;
export const ASSET_KINDS = ['image', 'video'] as const;
export const JOB_KINDS = ['image', 'video', 'text'] as const;
export const JOB_PURPOSES = ['portrait', 'derivation', 'still', 'video', 'copy'] as const;
export const JOB_STATUSES = ['queued', 'submitting', 'running', 'downloading', 'succeeded', 'failed', 'needs_attention', 'cancelled'] as const;
export const REVIEW_DECISIONS = ['approved', 'rejected', 'needs_changes'] as const;
export const REVIEW_RESULTS = ['pass', 'fail', 'unsure', 'na'] as const;
export const REVIEW_CONTEXT_TYPES = ['character', 'shot'] as const;
export const SUBMISSION_OUTCOMES = ['pending', 'accepted', 'rejected', 'unknown'] as const;

export const characterStatusSchema = z.enum(CHARACTER_STATUSES);
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const shotStatusSchema = z.enum(SHOT_STATUSES);
export const referenceRoleSchema = z.enum(REFERENCE_ROLES);
export const derivationRoleSchema = z.enum(DERIVATION_ROLES);
export const aspectRatioSchema = z.enum(ASPECT_RATIOS);
export const assetKindSchema = z.enum(ASSET_KINDS);
export const jobKindSchema = z.enum(JOB_KINDS);
export const jobPurposeSchema = z.enum(JOB_PURPOSES);
export const jobStatusSchema = z.enum(JOB_STATUSES);
export const reviewDecisionSchema = z.enum(REVIEW_DECISIONS);
export const reviewResultSchema = z.enum(REVIEW_RESULTS);
export const reviewContextTypeSchema = z.enum(REVIEW_CONTEXT_TYPES);
export const submissionOutcomeSchema = z.enum(SUBMISSION_OUTCOMES);

export type CharacterStatus = z.infer<typeof characterStatusSchema>;
export type CampaignStatus = z.infer<typeof campaignStatusSchema>;
export type ShotStatus = z.infer<typeof shotStatusSchema>;
export type ReferenceRole = z.infer<typeof referenceRoleSchema>;
export type DerivationRole = z.infer<typeof derivationRoleSchema>;
export type AspectRatio = z.infer<typeof aspectRatioSchema>;
export type AssetKind = z.infer<typeof assetKindSchema>;
export type JobKind = z.infer<typeof jobKindSchema>;
export type JobPurpose = z.infer<typeof jobPurposeSchema>;
export type JobStatus = z.infer<typeof jobStatusSchema>;
export type ReviewDecision = z.infer<typeof reviewDecisionSchema>;
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export type ReviewContextType = z.infer<typeof reviewContextTypeSchema>;
export type SubmissionOutcome = z.infer<typeof submissionOutcomeSchema>;

const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}';
const prefixedId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_${uuidPattern}$`), `Expected ${prefix}_ followed by a UUID`);
export const characterIdSchema = prefixedId('chr');
export const referenceIdSchema = prefixedId('ref');
export const campaignIdSchema = prefixedId('cmp');
export const shotIdSchema = prefixedId('sht');
export const assetIdSchema = prefixedId('ast');
export const jobIdSchema = prefixedId('job');
export const reviewIdSchema = prefixedId('rev');
export const submissionIdSchema = prefixedId('sub');
export const historyIdSchema = prefixedId('hst');
export const entityIdSchema = z.string().regex(new RegExp(`^(?:chr|ref|cmp|sht|ast|job|rev|sub|hst)_${uuidPattern}$`));
export const isoDateSchema = z.iso.datetime({ offset: false });
export const sha256Schema = z.string().regex(/^[0-9a-fA-F]{64}$/);
export const nonBlankStringSchema = z.string().min(1).refine(value => value.trim().length > 0, 'Must not be blank');
export const requestedAspectRatioSchema = z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/, 'Expected a positive width:height ratio');
export const durationSecondsSchema = z.number().finite().positive();
export const resolutionSchema = nonBlankStringSchema.max(100);
export const positionSchema = z.number().finite().nonnegative();
export const identityVersionSchema = z.number().int().nonnegative();
export const countSchema = z.number().int().min(1).max(4);
export const uniqueAssetIdsSchema = z.array(assetIdSchema).refine(ids => new Set(ids).size === ids.length, 'Duplicate asset IDs are not allowed');
export const uniqueCharacterIdsSchema = z.array(characterIdSchema).refine(ids => new Set(ids).size === ids.length, 'Duplicate character IDs are not allowed');

export const appearanceSchema = z.object({
  age: z.string().max(4000).optional(),
  gender: z.string().max(4000).optional(),
  skinTone: z.string().max(4000).optional(),
  face: z.string().max(4000).optional(),
  eyes: z.string().max(4000).optional(),
  hair: z.string().max(4000).optional(),
  build: z.string().max(4000).optional(),
  distinguishingMarks: z.string().max(4000).optional(),
  wardrobe: z.string().max(4000).optional(),
}).strict();
export const personaSchema = z.object({
  bio: z.string().max(8000).optional(),
  tone: z.string().max(4000).optional(),
  audience: z.string().max(4000).optional(),
  dos: z.string().max(8000).optional(),
  donts: z.string().max(8000).optional(),
}).strict();
export type Appearance = z.infer<typeof appearanceSchema>;
export type Persona = z.infer<typeof personaSchema>;

export const apiErrorSchema = z.object({
  error: z.object({ code: nonBlankStringSchema, message: z.string(), details: z.unknown().optional() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
export interface Page<T> { items: T[]; nextCursor: string | null }
export const pageSchema = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });
