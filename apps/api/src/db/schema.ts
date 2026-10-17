import { sqliteTable, text, integer, uniqueIndex, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Appearance, Persona, CompiledRequest } from '@vibefield/contracts';

const mutable = () => ({ createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull() });
export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(), slug: text('slug').notNull().unique(), name: text('name').notNull(), description: text('description').notNull(),
  appearance: text('appearance', { mode: 'json' }).$type<Appearance>().notNull(), persona: text('persona', { mode: 'json' }).$type<Persona>().notNull(),
  status: text('status', { enum: ['draft', 'active', 'archived'] }).notNull(),
  canonicalAssetId: text('canonical_asset_id').references((): AnySQLiteColumn => assets.id), identityVersion: integer('identity_version').notNull(), ...mutable(),
});
export const assets = sqliteTable('assets', {
  id: text('id').primaryKey(), sha256: text('sha256').notNull(), kind: text('kind', { enum: ['image', 'video'] }).notNull(), mime: text('mime').notNull(), bytes: integer('bytes').notNull(),
  width: integer('width'), height: integer('height'), durationMs: integer('duration_ms'), storageKey: text('storage_key').notNull(), originalName: text('original_name').notNull(),
  sourceJobId: text('source_job_id').references((): AnySQLiteColumn => jobs.id), consentConfirmed: integer('consent_confirmed', { mode: 'boolean' }).notNull(), createdAt: text('created_at').notNull(),
}, t => [index('assets_source_job').on(t.sourceJobId), uniqueIndex('assets_hash').on(t.sha256)]);
export const references = sqliteTable('character_references', {
  id: text('id').primaryKey(), characterId: text('character_id').notNull().references(() => characters.id), assetId: text('asset_id').notNull().references(() => assets.id),
  role: text('role', { enum: ['sheet', 'angle', 'expression', 'scene', 'upload'] }).notNull(), position: integer('position').notNull(), approved: integer('approved', { mode: 'boolean' }).notNull(),
  identityVersion: integer('identity_version').notNull(), sourceJobId: text('source_job_id').references((): AnySQLiteColumn => jobs.id), consentConfirmed: integer('consent_confirmed', { mode: 'boolean' }).notNull(), ...mutable(),
}, t => [uniqueIndex('reference_unique').on(t.characterId, t.assetId), index('reference_character').on(t.characterId)]);
export const campaigns = sqliteTable('campaigns', {
  id: text('id').primaryKey(), name: text('name').notNull(), brief: text('brief').notNull(), productName: text('product_name').notNull(),
  productAssetIds: text('product_asset_ids', { mode: 'json' }).$type<string[]>().notNull(), characterIds: text('character_ids', { mode: 'json' }).$type<string[]>().notNull(),
  format: text('format', { enum: ['9:16', '16:9', '1:1', '3:4', '4:5'] }).notNull(), status: text('status', { enum: ['draft', 'active', 'done', 'archived'] }).notNull(), ...mutable(),
});
export const shots = sqliteTable('shots', {
  id: text('id').primaryKey(), campaignId: text('campaign_id').notNull().references(() => campaigns.id), characterId: text('character_id').notNull().references(() => characters.id), position: integer('position').notNull(),
  title: text('title').notNull(), scene: text('scene').notNull(), action: text('action').notNull(), camera: text('camera').notNull(), lighting: text('lighting').notNull(), wardrobe: text('wardrobe').notNull(), dialogue: text('dialogue').notNull(), motion: text('motion').notNull(),
  refAssetIds: text('ref_asset_ids', { mode: 'json' }).$type<string[]>().notNull(), durationSeconds: integer('duration_seconds').notNull(), resolution: text('resolution').notNull(),
  selectedStillAssetId: text('selected_still_asset_id').references(() => assets.id), selectedVideoAssetId: text('selected_video_asset_id').references(() => assets.id), stillIdentityVersion: integer('still_identity_version'),
  status: text('status', { enum: ['draft', 'stills', 'still_selected', 'video', 'done'] }).notNull(), ...mutable(),
}, t => [index('shot_campaign_position').on(t.campaignId, t.position)]);
export const jobs = sqliteTable('jobs', {
  id: text('id').primaryKey(), idempotencyKey: text('idempotency_key').notNull().unique(), requestHash: text('request_hash').notNull(), kind: text('kind', { enum: ['image', 'video', 'text'] }).notNull(),
  purpose: text('purpose', { enum: ['portrait', 'derivation', 'still', 'video', 'copy'] }).notNull(), characterId: text('character_id').references((): AnySQLiteColumn => characters.id), campaignId: text('campaign_id').references((): AnySQLiteColumn => campaigns.id),
  // Shot deletion preserves immutable job context. Application checks ownership at creation.
  shotId: text('shot_id'), provider: text('provider').notNull(), modelRequested: text('model_requested').notNull(), modelReported: text('model_reported'),
  request: text('request', { mode: 'json' }).$type<CompiledRequest>().notNull(), identitySnapshot: text('identity_snapshot', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  status: text('status', { enum: ['queued', 'submitting', 'running', 'downloading', 'succeeded', 'failed', 'needs_attention', 'cancelled'] }).notNull(), providerJobId: text('provider_job_id'),
  outputAssetIds: text('output_asset_ids', { mode: 'json' }).$type<string[]>().notNull(), resultText: text('result_text'), result: text('result', { mode: 'json' }).$type<Record<string, unknown> | null>(),
  error: text('error', { mode: 'json' }).$type<{ code: string; message: string } | null>(), ...mutable(), submittedAt: text('submitted_at'), finishedAt: text('finished_at'),
}, t => [index('job_status').on(t.status), index('job_shot').on(t.shotId), index('job_character').on(t.characterId)]);
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(), assetId: text('asset_id').notNull().references(() => assets.id), contextType: text('context_type', { enum: ['character', 'shot'] }).notNull(), contextId: text('context_id').notNull(),
  decision: text('decision', { enum: ['approved', 'rejected', 'needs_changes'] }).notNull(), checklist: text('checklist', { mode: 'json' }).$type<Array<{ item: string; result: 'pass' | 'fail' | 'unsure' | 'na'; note?: string }>>().notNull(),
  notes: text('notes').notNull(), actor: text('actor').notNull(), createdAt: text('created_at').notNull(),
}, t => [index('review_context_asset').on(t.contextType, t.contextId, t.assetId)]);
export const submissions = sqliteTable('submissions', {
  id: text('id').primaryKey(), jobId: text('job_id').notNull().unique().references(() => jobs.id), provider: text('provider').notNull(), kind: text('kind', { enum: ['image', 'video', 'text'] }).notNull(),
  outcome: text('outcome', { enum: ['pending', 'accepted', 'rejected', 'unknown'] }).notNull(), createdAt: text('created_at').notNull(),
});
export const history = sqliteTable('history', {
  id: text('id').primaryKey(), at: text('at').notNull(), actor: text('actor').notNull(), entityType: text('entity_type').notNull(), entityId: text('entity_id').notNull(), action: text('action').notNull(), payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
}, t => [index('history_entity').on(t.entityType, t.entityId)]);
export const settings = sqliteTable('settings', { id: text('id').primaryKey(), value: text('value', { mode: 'json' }).$type<unknown>().notNull() });
export const tables = { characters, assets, references, campaigns, shots, jobs, reviews, submissions, history, settings };
export type TableName = keyof typeof tables;
export type Row<K extends TableName> = (typeof tables)[K]['$inferSelect'];
export type Insert<K extends TableName> = (typeof tables)[K]['$inferInsert'];
