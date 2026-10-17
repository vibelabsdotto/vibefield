import { Injectable } from '@nestjs/common';
import * as c from '@vibefield/contracts';
import { compilePortrait, compileDerivation, compileStill, compileVideo, compileCopy, PromptCompileError } from '@vibefield/prompt';
import { StudioService, newest } from './studio.service';
import { SettingsService } from './settings.service';
import { ApiError, fail } from './errors';

@Injectable()
export class CompilerService {
  constructor(private readonly studio: StudioService, private readonly settings: SettingsService) {}
  async compile(purpose: c.CompiledRequest['purpose'], key: string, body: unknown, preview = false): Promise<c.CompiledRequest> {
    try {
      const db = this.studio.db;
      const assets = db.all('assets');
      if (purpose === 'portrait') {
        const input = c.portraitOptionsSchema.parse(body); const character = db.get('characters', key);
        return compilePortrait({ ...input, ...await this.settings.capability('image', input.provider, input.model, !preview), character, assets });
      }
      if (purpose === 'derivation') {
        const input = c.derivationOptionsSchema.parse(body); const character = db.get('characters', key);
        return compileDerivation({ ...input, ...await this.settings.capability('image', input.provider, input.model, !preview), character, references: this.studio.references(key), assets });
      }
      if (purpose === 'copy') {
        const input = c.copyOptionsSchema.parse(body); const campaign = db.get('campaigns', key);
        return compileCopy({ ...input, ...await this.settings.capability('text', 'openrouter', input.model, !preview), campaign, characters: campaign.characterIds.map(id => db.get('characters', id)), shots: this.studio.shots(key), assets });
      }
      const shot = db.get('shots', key); const character = db.get('characters', shot.characterId); const campaign = db.get('campaigns', shot.campaignId);
      this.studio.validateShot(campaign.id, shot);
      const latestReviewNotes = newest(db.all('reviews').filter(review => review.contextType === 'shot' && review.contextId === key && review.decision === 'needs_changes'))[0]?.notes;
      if (purpose === 'still') {
        const input = c.stillOptionsSchema.parse(body);
        return compileStill({ ...input, ...await this.settings.capability('image', input.provider, input.model, !preview), character, campaign, shot, references: this.studio.references(character.id), assets, latestReviewNotes });
      }
      const input = c.videoOptionsSchema.parse(body);
      if (!shot.selectedStillAssetId) fail('STILL_REQUIRED', 'Approve and select a still before video generation');
      const { asset: selectedStill, job: selectedStillJob } = this.studio.shotAsset(key, shot.selectedStillAssetId, 'image'); this.studio.approved(selectedStill.id, 'shot', key);
      const snapshot = c.identitySnapshotSchema.parse(selectedStillJob.request.identitySnapshot ?? selectedStillJob.identitySnapshot);
      if (snapshot.characterId !== character.id || snapshot.identityVersion !== selectedStillJob.request.identityVersion) fail('STILL_PROVENANCE_INVALID', 'The selected still has no matching saved identity provenance');
      const pinnedCharacter = { ...character, appearance: snapshot.appearance, canonicalAssetId: snapshot.canonicalAssetId, identityVersion: snapshot.identityVersion };
      const pinnedShot = { ...shot, stillIdentityVersion: snapshot.identityVersion };
      // Supply the verified contextual generation occurrence to the pure compiler;
      // the stored Asset.sourceJobId remains its original CAS import provenance.
      const compiled = compileVideo({ ...input, ...await this.settings.capability('video', 'openrouter', input.model, !preview), character: pinnedCharacter, campaign, shot: pinnedShot, selectedStill: { ...selectedStill, sourceJobId: selectedStillJob.id }, selectedStillJob, reviews: db.all('reviews'), assets, latestReviewNotes });
      if (snapshot.identityVersion !== character.identityVersion) compiled.warnings.push(`Selected still uses historical identity version ${snapshot.identityVersion}; current character is version ${character.identityVersion}. This video preserves the selected still and its saved identity, not the newer canonical.`);
      return compiled;
    } catch (error) { if (error instanceof PromptCompileError) throw new ApiError(422, error.code, error.message, error.details); throw error; }
  }
}
