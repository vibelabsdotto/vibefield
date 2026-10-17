import { Injectable } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import type { Response } from 'express';
import { StudioService } from './studio.service';
import { fail } from './errors';
import { now } from './db/database.service';

@Injectable()
export class ExportService {
  constructor(private readonly studio: StudioService) {}
  async campaign(key: string, response: Response, actor: string) {
    const db = this.studio.db; const campaign = db.get('campaigns', key);
    const media = new Map<string, { path: string; name: string }>();
    const shots = this.studio.shots(key).map(shot => {
      const character = db.get('characters', shot.characterId); const warnings: string[] = [];
      if (!shot.selectedStillAssetId) warnings.push('No selected still');
      if (!shot.selectedVideoAssetId) warnings.push('No selected video');
      if (shot.stillIdentityVersion !== null && shot.stillIdentityVersion !== character.identityVersion) warnings.push('Selected still uses an older character identity');
      const outputs = [shot.selectedStillAssetId, shot.selectedVideoAssetId].filter((assetId): assetId is string => !!assetId).map(assetId => {
        const { asset, job } = this.studio.shotAsset(shot.id, assetId); const review = this.studio.approved(assetId, 'shot', shot.id);
        const filename = `media/${shot.id}/${asset.id}.${asset.kind === 'video' ? 'mp4' : 'png'}`;
        media.set(asset.id, { path: this.studio.assets.path(asset), name: filename });
        return { file: filename, asset, review, provenance: { jobId: job.id, provider: job.provider, providerJobId: job.providerJobId, modelRequested: job.modelRequested, modelReported: job.modelReported, executedModelVerified: job.modelReported !== null, request: job.request, identitySnapshot: job.identitySnapshot, createdAt: job.createdAt, submittedAt: job.submittedAt, finishedAt: job.finishedAt, submissions: db.all('submissions').filter(s => s.jobId === job.id), usage: job.result?.usage ?? null, metadata: job.result?.metadata ?? null } };
      });
      return { ...shot, incomplete: warnings.length > 0, warnings, outputs };
    });
    if (!media.size) fail('EXPORT_EMPTY', 'Select at least one approved still or video before exporting');
    const manifest = { version: 1, exportedAt: now(), campaign, incompleteShots: shots.filter(s => s.incomplete).map(s => s.id), shots, characters: campaign.characterIds.map(id => db.get('characters', id)), copyJobs: db.all('jobs').filter(j => j.campaignId === key && j.purpose === 'copy' && j.status === 'succeeded').map(j => ({ id: j.id, request: j.request, text: j.resultText, provider: j.provider, modelRequested: j.modelRequested, modelReported: j.modelReported })) };
    response.setHeader('Content-Type', 'application/zip'); response.setHeader('Content-Disposition', `attachment; filename="vibefield-${campaign.id}.zip"`); response.setHeader('Cache-Control', 'no-store');
    const archive = new ZipArchive({ zlib: { level: 6 } }); archive.on('error', () => response.destroy()); response.on('close', () => archive.abort()); archive.pipe(response);
    archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
    for (const file of media.values()) archive.file(file.path, { name: file.name });
    db.transaction(() => db.audit(actor, 'campaign', key, 'export_requested', { assetIds: [...media.keys()], incompleteShotIds: manifest.incompleteShots }));
    await archive.finalize();
  }
}
