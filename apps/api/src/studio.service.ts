import { Injectable } from '@nestjs/common';
import * as c from '@vibefield/contracts';
import { DatabaseService, id, now } from './db/database.service';

import { AssetsService } from './assets.service';
import { fail } from './errors';
import { publicJob } from './job-view';

export function paginate<T extends { id: string }>(rows: T[], query: { limit: number; cursor?: string }) {
  let offset = 0;
  if (query.cursor) {
    const decoded = Buffer.from(query.cursor, 'base64url').toString('utf8'); const found = rows.findIndex(row => row.id === decoded);
    if (found < 0) fail('INVALID_CURSOR', 'Cursor is not present in this result set'); offset = found + 1;
  }
  const items = rows.slice(offset, offset + query.limit);
  return { items, nextCursor: offset + query.limit < rows.length && items.length ? Buffer.from(items.at(-1)!.id).toString('base64url') : null };
}
export const newest = <T extends { createdAt: string }>(rows: T[]) => rows.reverse().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
@Injectable()
export class StudioService {
  constructor(readonly db: DatabaseService, readonly assets: AssetsService) {}
  image(assetId: string) { const asset = this.db.get('assets', assetId); if (asset.kind !== 'image') fail('IMAGE_REQUIRED', 'An image asset is required'); return asset; }
  approved(assetId: string, contextType: 'character' | 'shot', contextId: string) {
    const latest = newest(this.db.all('reviews').filter(r => r.assetId === assetId && r.contextType === contextType && r.contextId === contextId))[0];
    if (!latest || latest.decision !== 'approved') fail('APPROVED_REVIEW_REQUIRED', 'Approve this asset in the matching context before selecting it'); return latest;
  }
  characterAsset(characterId: string, assetId: string) {
    const asset = this.image(assetId);
    if (asset.sourceJobId) { if (!this.db.all('jobs').some(job => job.characterId === characterId && job.outputAssetIds.includes(assetId))) fail('ASSET_OWNERSHIP', 'Generated asset does not belong to this character'); }
    else if (!asset.consentConfirmed) fail('CONSENT_REQUIRED', 'Uploaded assets require ownership or permission confirmation');
    return asset;
  }
  shotAsset(shotId: string, assetId: string, kind?: 'image' | 'video', preserveSelection = true) {
    const asset = this.db.get('assets', assetId);
    const candidates = newest(this.db.all('jobs').filter(job => job.shotId === shotId && job.outputAssetIds.includes(assetId) && (!kind || (asset.kind === kind && job.purpose === (kind === 'image' ? 'still' : 'video')))));
    // Assets deduplicate by bytes; selection audit pins the contextual job occurrence.
    const selection = preserveSelection ? this.db.all('history').reverse().find(event => event.entityType === 'shot' && event.entityId === shotId && event.action === (asset.kind === 'image' ? 'still_selected' : 'video_selected') && event.payload.assetId === assetId) : undefined;
    const job = candidates.find(candidate => candidate.id === selection?.payload.sourceJobId) ?? candidates[0];
    if (!job) fail('ASSET_OWNERSHIP', 'Asset must be a matching generated output of this shot');
    return { asset, job };
  }
  characterDetail(characterId: string) {
    const character = this.db.get('characters', characterId); const references = this.references(characterId);
    const ids = new Set([character.canonicalAssetId, ...references.map(r => r.assetId), ...this.db.all('jobs').filter(j => j.characterId === characterId).flatMap(j => j.outputAssetIds)]);
    return { ...character, references, assets: newest(this.db.all('assets').filter(a => ids.has(a.id))).map(a => this.assets.present(a)) };
  }
  references(characterId: string) { this.db.get('characters', characterId); return this.db.all('references').filter(r => r.characterId === characterId).sort((a, b) => a.position - b.position); }
  createCharacter(body: unknown, actor: string) {
    const input = c.createCharacterSchema.parse(body); return this.db.transaction(() => {
      const key = id('chr'); const stamp = now(); const slug = `${input.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'character'}-${key.slice(-8)}`;
      const character = this.db.insert('characters', { ...input, id: key, slug, canonicalAssetId: null, identityVersion: 0, status: 'draft', createdAt: stamp, updatedAt: stamp });
      this.db.audit(actor, 'character', key, 'created'); return character;
    });
  }
  patchCharacter(key: string, body: unknown, actor: string) {
    const input = c.patchCharacterSchema.parse(body); return this.db.transaction(() => {
      const old = this.db.get('characters', key); if (input.status === 'active' && !old.canonicalAssetId) fail('CANONICAL_REQUIRED', 'Approve a canonical image before activating this character');
      const changed = input.appearance && Object.keys({ ...old.appearance, ...input.appearance }).some(k => old.appearance[k as keyof c.Appearance] !== input.appearance![k as keyof c.Appearance]);
      const character = this.db.update('characters', key, { ...input, identityVersion: old.identityVersion + (changed ? 1 : 0), updatedAt: now() });
      this.db.audit(actor, 'character', key, 'updated', { fields: Object.keys(input), identityChanged: !!changed }); return character;
    });
  }
  canonical(key: string, body: unknown, actor: string) {
    const { assetId } = c.selectAssetSchema.parse(body); return this.db.transaction(() => {
      const old = this.db.get('characters', key); this.characterAsset(key, assetId); this.approved(assetId, 'character', key);
      for (const ref of this.references(key).filter(r => r.assetId === assetId)) this.db.remove('references', ref.id);
      const character = this.db.update('characters', key, { canonicalAssetId: assetId, identityVersion: old.identityVersion + (old.canonicalAssetId !== assetId ? 1 : 0), status: 'active', updatedAt: now() });
      this.db.audit(actor, 'character', key, 'canonical_promoted', { assetId, identityVersion: character.identityVersion }); return character;
    });
  }
  addReference(characterId: string, body: unknown, actor: string) {
    const input = c.createReferenceSchema.parse(body); return this.db.transaction(() => {
      const character = this.db.get('characters', characterId); const asset = this.characterAsset(characterId, input.assetId);
      if (character.canonicalAssetId === asset.id) fail('CANONICAL_IS_NOT_REFERENCE', 'The canonical image is already attached first');
      const stamp = now(); const refs = this.references(characterId);
      const source = newest(this.db.all('jobs').filter(job => job.characterId === characterId && job.outputAssetIds.includes(asset.id)))[0] ?? null;
      const reference = this.db.insert('references', { ...input, id: id('ref'), characterId, position: refs.length ? Math.max(...refs.map(r => r.position)) + 1 : 0, identityVersion: source?.request.identityVersion ?? character.identityVersion, sourceJobId: source?.id ?? null, consentConfirmed: asset.consentConfirmed || input.consentConfirmed, createdAt: stamp, updatedAt: stamp });
      this.db.audit(actor, 'character', characterId, 'reference_added', { referenceId: reference.id, assetId: asset.id, approved: reference.approved }); return reference;
    });
  }
  patchReference(characterId: string, referenceId: string, body: unknown, actor: string) {
    const input = c.patchReferenceSchema.parse(body); return this.db.transaction(() => {
      const ref = this.db.get('references', referenceId); if (ref.characterId !== characterId) fail('NOT_FOUND', 'Reference not found on this character', 404);
      const updated = this.db.update('references', referenceId, { ...input, updatedAt: now() }); this.db.audit(actor, 'character', characterId, 'reference_updated', { referenceId, ...input }); return updated;
    });
  }
  removeReference(characterId: string, referenceId: string, actor: string) {
    return this.db.transaction(() => { const ref = this.db.get('references', referenceId); if (ref.characterId !== characterId) fail('NOT_FOUND', 'Reference not found on this character', 404); this.db.remove('references', referenceId); this.db.audit(actor, 'character', characterId, 'reference_removed', { referenceId }); return { deleted: true }; });
  }
  validateCampaign(input: { productAssetIds: string[]; characterIds: string[] }) { input.productAssetIds.forEach(assetId => this.image(assetId)); input.characterIds.forEach(key => this.db.get('characters', key)); }
  createCampaign(body: unknown, actor: string) {
    const input = c.createCampaignSchema.parse(body); return this.db.transaction(() => { this.validateCampaign(input); const stamp = now(); const campaign = this.db.insert('campaigns', { ...input, id: id('cmp'), createdAt: stamp, updatedAt: stamp }); this.db.audit(actor, 'campaign', campaign.id, 'created'); return campaign; });
  }
  patchCampaign(key: string, body: unknown, actor: string) {
    const input = c.patchCampaignSchema.parse(body); return this.db.transaction(() => {
      const old = this.db.get('campaigns', key); const next = { ...old, ...input }; this.validateCampaign(next);
      if (this.shots(key).some(s => !next.characterIds.includes(s.characterId))) fail('CHARACTER_IN_USE', 'Campaign characters must include every shot character');
      const campaign = this.db.update('campaigns', key, { ...input, updatedAt: now() }); this.db.audit(actor, 'campaign', key, 'updated', { fields: Object.keys(input) }); return campaign;
    });
  }
  shots(campaignId: string) { this.db.get('campaigns', campaignId); return this.db.all('shots').filter(s => s.campaignId === campaignId).sort((a, b) => a.position - b.position); }
  validateShot(campaignId: string, input: { characterId: string; refAssetIds: string[] }) {
    const campaign = this.db.get('campaigns', campaignId); this.db.get('characters', input.characterId);
    if (!campaign.characterIds.includes(input.characterId)) fail('CHARACTER_NOT_IN_CAMPAIGN', 'Add this character to the campaign first'); input.refAssetIds.forEach(key => this.image(key));
  }
  createShot(campaignId: string, body: unknown, actor: string) {
    const input = c.createShotSchema.parse(body); return this.db.transaction(() => {
      this.validateShot(campaignId, input); const stamp = now(); const siblings = this.shots(campaignId);
      const shot = this.db.insert('shots', { ...input, id: id('sht'), campaignId, position: siblings.length ? Math.max(...siblings.map(s => s.position)) + 1 : 0, selectedStillAssetId: null, selectedVideoAssetId: null, stillIdentityVersion: null, status: 'draft', createdAt: stamp, updatedAt: stamp }); this.db.audit(actor, 'shot', shot.id, 'created'); return shot;
    });
  }
  patchShot(key: string, body: unknown, actor: string) {
    const input = c.patchShotSchema.parse(body); return this.db.transaction(() => {
      const old = this.db.get('shots', key); this.validateShot(old.campaignId, { ...old, ...input });
      if (this.activeJobs(key).length) fail('SHOT_BUSY', 'Wait for active generation before editing this shot', 409);
      const reset = input.characterId && input.characterId !== old.characterId ? { selectedStillAssetId: null, selectedVideoAssetId: null, stillIdentityVersion: null, status: 'draft' as const } : {};
      const shot = this.db.update('shots', key, { ...input, ...reset, updatedAt: now() }); this.db.audit(actor, 'shot', key, 'updated', { fields: Object.keys(input) }); return shot;
    });
  }
  reorder(campaignId: string, body: unknown, actor: string) {
    const { ids } = c.reorderShotsSchema.parse(body); return this.db.transaction(() => {
      const rows = this.shots(campaignId); if (rows.length !== ids.length || rows.some(row => !ids.includes(row.id))) fail('INVALID_REORDER', 'Supply each current shot exactly once');
      ids.forEach((key, position) => this.db.update('shots', key, { position, updatedAt: now() })); this.db.audit(actor, 'campaign', campaignId, 'shots_reordered', { ids }); return { items: this.shots(campaignId), nextCursor: null };
    });
  }
  activeJobs(shotId: string) { return this.db.all('jobs').filter(j => j.shotId === shotId && ['queued', 'submitting', 'running', 'downloading', 'needs_attention'].includes(j.status)); }
  removeShot(key: string, actor: string) { return this.db.transaction(() => { if (this.activeJobs(key).length) fail('SHOT_BUSY', 'Resolve active or ambiguous jobs before deleting this shot', 409); this.db.remove('shots', key); this.db.audit(actor, 'shot', key, 'deleted'); return { deleted: true }; }); }
  shotDetail(key: string) {
    const shot = this.db.get('shots', key); const character = this.db.get('characters', shot.characterId); const jobs = newest(this.db.all('jobs').filter(j => j.shotId === key)); const assetIds = new Set(jobs.flatMap(j => j.outputAssetIds));
    return { ...shot, character, jobs: jobs.map(publicJob), assets: newest(this.db.all('assets').filter(a => assetIds.has(a.id))).map(a => this.assets.present(a)), stale: shot.stillIdentityVersion !== null && shot.stillIdentityVersion !== character.identityVersion };
  }
  select(key: string, body: unknown, kind: 'image' | 'video', actor: string) {
    const { assetId } = c.selectAssetSchema.parse(body); return this.db.transaction(() => {
      const shot = this.db.get('shots', key); const { job } = this.shotAsset(key, assetId, kind, false); this.approved(assetId, 'shot', key);
      if (job.characterId !== shot.characterId) fail('ASSET_OWNERSHIP', 'Output belongs to a different shot character');
      if (kind === 'video' && (!shot.selectedStillAssetId || job.request.startFrameAssetId !== shot.selectedStillAssetId)) fail('START_FRAME_MISMATCH', 'Video was not generated from the selected still');
      const result = this.db.update('shots', key, kind === 'image' ? { selectedStillAssetId: assetId, stillIdentityVersion: job.request.identityVersion, selectedVideoAssetId: null, status: 'still_selected', updatedAt: now() } : { selectedVideoAssetId: assetId, status: 'done', updatedAt: now() });
      this.db.audit(actor, 'shot', key, kind === 'image' ? 'still_selected' : 'video_selected', { assetId, sourceJobId: job.id }); return result;
    });
  }
  review(body: unknown, actor: string) {
    const input = c.createReviewSchema.parse(body); return this.db.transaction(() => {
      if (input.contextType === 'character') { this.db.get('characters', input.contextId); this.characterAsset(input.contextId, input.assetId); }
      else { this.db.get('shots', input.contextId); this.shotAsset(input.contextId, input.assetId); }
      const review = this.db.insert('reviews', { ...input, id: id('rev'), actor, createdAt: now() });
      if (input.contextType === 'shot' && input.decision !== 'approved') {
        const shot = this.db.get('shots', input.contextId);
        if (shot.selectedStillAssetId === input.assetId) this.db.update('shots', shot.id, { selectedStillAssetId: null, selectedVideoAssetId: null, stillIdentityVersion: null, status: 'stills', updatedAt: now() });
        else if (shot.selectedVideoAssetId === input.assetId) this.db.update('shots', shot.id, { selectedVideoAssetId: null, status: 'video', updatedAt: now() });
      }
      this.db.audit(actor, input.contextType, input.contextId, 'review_created', { reviewId: review.id, assetId: input.assetId, decision: input.decision }); return review;
    });
  }
  listAssets(query: c.AssetListQuery) {
    let rows = this.db.all('assets');
    if (query.kind) rows = rows.filter(a => a.kind === query.kind);
    if (query.q) rows = rows.filter(a => a.originalName.toLowerCase().includes(query.q!.toLowerCase()));
    if (query.characterId) { const detail = this.characterDetail(query.characterId); const ids = new Set(detail.assets.map(a => a.id)); rows = rows.filter(a => ids.has(a.id)); }
    if (query.campaignId) { const campaign = this.db.get('campaigns', query.campaignId); const ids = new Set([...campaign.productAssetIds, ...this.db.all('jobs').filter(j => j.campaignId === campaign.id).flatMap(j => j.outputAssetIds), ...this.shots(campaign.id).flatMap(s => s.refAssetIds)]); rows = rows.filter(a => ids.has(a.id)); }
    return paginate(newest(rows).map(a => this.assets.present(a)), query);
  }
}
