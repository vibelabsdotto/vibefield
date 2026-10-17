import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import * as c from '@vibefield/contracts';
import { DatabaseService, id, now } from './db/database.service';
import type { Row } from './db/schema';
import { ProvidersService } from './providers/providers.service';
import { ProviderError } from './providers/provider.types';
import { AssetsService } from './assets.service';
import { CompilerService } from './compiler.service';
import { SettingsService } from './settings.service';
import { StudioService, newest, paginate } from './studio.service';
import { ApiError, fail } from './errors';
import { temporaryPath, config } from './config';
import { downloadOutput } from './download';
import { publicJob } from './job-view';

type ProviderResult = Awaited<ReturnType<ProvidersService['generate']>>;
type OutputHandle = { url?: string; file?: string; mime?: string; assetId?: string };
type SavedResult = { outputs: OutputHandle[]; modelReported: string | null; text?: string; usage?: Record<string, unknown>; metadata?: Record<string, unknown> };
const terminalStatuses = ['succeeded', 'failed', 'needs_attention', 'cancelled'];
const terminalProviderCodes = ['VIDEO_FAILED', 'VIDEO_CANCELLED', 'VIDEO_EXPIRED'];
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function hash(value: unknown) { return createHash('sha256').update(stable(value)).digest('hex'); }
function sanitize(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (typeof value === 'string') return value.slice(0, 20000);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 100).map(v => sanitize(v, depth + 1));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !/^(?:access[_-]?token|refresh[_-]?token|token|authorization|cookie|set-cookie|secret|password|credentials?|api[_-]?key|headers|raw|raw[_-]?(?:request|response)|request|response)$/i.test(key)).slice(0, 100).map(([key, item]) => [key, sanitize(item, depth + 1)]));
  return null;
}
@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private active?: { id: string; abort: AbortController };
  private stopped = false;
  private running?: Promise<void>;
  constructor(private readonly db: DatabaseService, private readonly providers: ProvidersService, private readonly assets: AssetsService, private readonly compiler: CompilerService, private readonly settings: SettingsService, private readonly studio: StudioService) {}
  status() { return { active: !!this.active, ...(this.active ? { jobId: this.active.id } : {}) }; }
  onModuleInit() {
    this.db.transaction(() => {
      for (const job of this.db.all('jobs')) {
        if (job.status === 'submitting' || job.status === 'running') {
          if (job.providerJobId) this.transition(job.id, 'running', { error: null }, 'recovery_poll');
          else { this.submissionOutcome(job.id, 'unknown'); this.transition(job.id, 'needs_attention', { error: { code: 'SUBMISSION_UNCERTAIN', message: 'The process stopped before acknowledgment. No generation was resubmitted.' } }, 'recovery_ambiguous'); }
        }
        if (job.status === 'downloading' && !job.result) this.transition(job.id, 'needs_attention', { error: { code: 'OUTPUTS_UNAVAILABLE', message: 'Output handles were not persisted. Resolve this job manually.' } }, 'recovery_missing_outputs');
      }
    });
    this.timer = setInterval(() => this.kick(), 750); this.timer.unref(); this.kick();
  }
  async onModuleDestroy() { this.stopped = true; clearInterval(this.timer); this.active?.abort.abort(); await this.running; }
  private kick() { if (this.stopped || this.active || this.running) return; this.running = this.runNext().catch(() => console.error('Job runner operation failed')).finally(() => { this.running = undefined; }); }
  private transition(key: string, status: c.Job['status'], fields: Partial<Row<'jobs'>> = {}, action: string = status) {
    const result = this.db.update('jobs', key, { ...fields, status, updatedAt: now(), ...(terminalStatuses.includes(status) ? { finishedAt: now() } : {}) }); this.db.audit('runner', 'job', key, action, { status }); return result;
  }
  private submissionOutcome(jobId: string, outcome: Row<'submissions'>['outcome']) { const submission = this.db.all('submissions').find(s => s.jobId === jobId); if (submission) this.db.update('submissions', submission.id, { outcome }); }
  private key(input: string | undefined, required = false): string { if (!input && required) fail('IDEMPOTENCY_KEY_REQUIRED', 'Supply Idempotency-Key for generation or resubmission'); const key = input || randomUUID(); if (!/^[\x21-\x7e]{1,200}$/.test(key)) fail('INVALID_IDEMPOTENCY_KEY', 'Idempotency-Key must contain 1 to 200 printable characters'); return key; }
  private existing(key: string, requestHash: string) { const job = this.db.all('jobs').find(j => j.idempotencyKey === key); if (job && job.requestHash !== requestHash) fail('IDEMPOTENCY_CONFLICT', 'This idempotency key was already used for a different request'); return job; }
  private validateSnapshot(request: c.CompiledRequest, context: { characterId: string | null; shotId: string | null; campaignId: string | null }) {
    request.refAssetIds.forEach(assetId => this.studio.image(assetId));
    if (context.characterId) {
      const character = this.db.get('characters', context.characterId);
      if (request.kind !== 'video' && request.identityVersion !== character.identityVersion) fail('IDENTITY_CHANGED', 'Character identity changed. Submit a new generation request.');
      if (request.kind !== 'video' && request.identitySnapshot?.canonicalAssetId !== undefined && request.identitySnapshot.canonicalAssetId !== character.canonicalAssetId) fail('IDENTITY_CHANGED', 'Canonical image changed. Submit a new generation request.');
      if (['still', 'derivation'].includes(request.purpose) && request.refAssetIds[0] !== character.canonicalAssetId) fail('CANONICAL_REQUIRED', 'The current canonical must be the first reference');
    }
    if (context.shotId) {
      const shot = this.db.get('shots', context.shotId); if (shot.characterId !== context.characterId || shot.campaignId !== context.campaignId) fail('SHOT_CHANGED', 'Shot ownership changed'); this.studio.validateShot(shot.campaignId, shot);
      if (request.kind === 'video') {
        if (shot.selectedStillAssetId !== request.startFrameAssetId) fail('START_FRAME_CHANGED', 'Selected still changed');
        const source = this.studio.shotAsset(shot.id, request.startFrameAssetId!, 'image'); this.studio.approved(request.startFrameAssetId!, 'shot', shot.id);
        const identity = c.identitySnapshotSchema.parse(source.job.request.identitySnapshot ?? source.job.identitySnapshot);
        if (request.identityVersion !== source.job.request.identityVersion || identity.characterId !== shot.characterId || request.identitySnapshot?.canonicalAssetId !== identity.canonicalAssetId || stable(request.identitySnapshot?.appearance) !== stable(identity.appearance)) fail('STILL_PROVENANCE_INVALID', 'Video must preserve the selected still identity snapshot');
      }
    }
    if (request.kind === 'video') { if (!config.videoEnabled) fail('VIDEO_DISABLED', 'Set VIBEFIELD_ALLOW_VIDEO=1 explicitly to allow external video generation', 403); if (!this.db.budget().remaining) fail('VIDEO_BUDGET_EXHAUSTED', 'The persisted video submission cap has been reached', 403); }
  }
  async create(purpose: c.CompiledRequest['purpose'], entityId: string, body: unknown, keyInput: string | undefined, actor: string) {
    const key = this.key(keyInput, true); const requestHash = hash({ purpose, entityId, body });
    const existing = this.existing(key, requestHash); if (existing) return { jobId: existing.id };
    if (purpose === 'video' && !config.videoEnabled) fail('VIDEO_DISABLED', 'Set VIBEFIELD_ALLOW_VIDEO=1 explicitly to allow external video generation', 403);
    const request = c.compiledRequestSchema.parse(await this.compiler.compile(purpose, entityId, body));
    return this.db.transaction(() => {
      const raced = this.existing(key, requestHash); if (raced) return { jobId: raced.id };
      const shot = purpose === 'still' || purpose === 'video' ? this.db.get('shots', entityId) : null;
      const context = { characterId: shot?.characterId ?? (purpose === 'portrait' || purpose === 'derivation' ? entityId : null), campaignId: shot?.campaignId ?? (purpose === 'copy' ? entityId : null), shotId: shot?.id ?? null };
      this.validateSnapshot(request, context); return this.enqueue(request, context, key, requestHash, actor);
    });
  }
  private enqueue(request: c.CompiledRequest, context: { characterId: string | null; campaignId: string | null; shotId: string | null }, key: string, requestHash: string, actor: string) {
    const stamp = now(); const character = context.characterId ? this.db.get('characters', context.characterId) : null;
    const job = this.db.insert('jobs', { id: id('job'), idempotencyKey: key, requestHash, kind: request.kind, purpose: request.purpose, ...context, provider: request.provider, modelRequested: request.model, modelReported: null, request, identitySnapshot: request.identitySnapshot ? { ...request.identitySnapshot } : character ? { characterId: character.id, identityVersion: character.identityVersion, appearance: character.appearance, canonicalAssetId: character.canonicalAssetId, canonicalSha256: character.canonicalAssetId ? this.db.get('assets', character.canonicalAssetId).sha256 : null } : null, status: 'queued', providerJobId: null, outputAssetIds: [], resultText: null, result: null, error: null, createdAt: stamp, updatedAt: stamp, submittedAt: null, finishedAt: null });
    this.db.audit(actor, 'job', job.id, 'queued', { purpose: job.purpose, requestHash }); return { jobId: job.id };
  }
  list(query: c.JobListQuery) { return paginate(newest(this.db.all('jobs').filter(j => (!query.status || j.status === query.status) && (!query.characterId || j.characterId === query.characterId) && (!query.campaignId || j.campaignId === query.campaignId) && (!query.shotId || j.shotId === query.shotId))).map(publicJob), query); }
  detail(key: string) { const job = publicJob(this.db.get('jobs', key)); return { ...job, assets: job.outputAssetIds.map(assetId => this.assets.present(this.db.get('assets', assetId))), history: this.db.all('history').filter(h => h.entityType === 'job' && h.entityId === key) }; }
  cancel(key: string, actor: string) {
    return this.db.transaction(() => {
      const job = this.db.get('jobs', key); if (terminalStatuses.includes(job.status)) return job;
      if (job.status === 'queued') { const result = this.transition(key, 'cancelled'); this.db.audit(actor, 'job', key, 'cancel_requested', { upstreamCancelled: false, submissionSpent: false }); return result; }
      if (this.active?.id === key) this.active.abort.abort();
      const result = this.transition(key, 'needs_attention', { error: { code: 'CANCELLED_LOCALLY', message: 'Local work stopped. The upstream job may still run; its submission is not refunded.' } }); this.db.audit(actor, 'job', key, 'cancel_requested', { upstreamCancelled: false, submissionSpent: true }); return result;
    });
  }
  async resolve(key: string, body: unknown, keyInput: string | undefined, actor: string) {
    const input = c.resolveJobSchema.parse(body); const job = this.db.get('jobs', key);
    if (this.active?.id === key) fail('JOB_BUSY', 'Wait for the active worker to stop before resolving this job', 409);
    if (!['needs_attention', 'failed', 'cancelled'].includes(job.status)) fail('JOB_NOT_RESOLVABLE', 'Only failed, cancelled, or ambiguous jobs can be resolved', 409);
    if (input.action === 'mark_failed') return this.db.transaction(() => { const result = this.transition(key, 'failed', { error: { code: 'MANUALLY_FAILED', message: 'Marked failed by the operator. Submission budget is unchanged.' } }); this.db.audit(actor, 'job', key, 'marked_failed'); return result; });
    if (input.action === 'resubmit') {
      const newKey = this.key(keyInput, true); const requestHash = hash({ resubmit: key, body }); const existing = this.existing(newKey, requestHash); if (existing) return { jobId: existing.id };
      if (job.kind === 'video' && input.confirmExternal !== true) fail('CONFIRMATION_REQUIRED', 'Confirm external video submission explicitly', 403);
      const capability = await this.settings.capability(job.kind, job.provider, job.modelRequested);
      if (capability.capabilities.maxOutputs !== undefined && job.request.count > capability.capabilities.maxOutputs) throw new ApiError(422, 'COUNT_EXCEEDS_PROVIDER_MAX', 'The saved request exceeds the current provider output limit. Create a new single-candidate job.', { provider: job.provider, max: capability.capabilities.maxOutputs, source: capability.capabilities.maxOutputsSource ?? 'documented' });
      if (job.kind === 'video') this.settings.validateVideo(job.request, capability.capabilities);
      return this.db.transaction(() => { const raced = this.existing(newKey, requestHash); if (raced) return { jobId: raced.id }; this.validateSnapshot(job.request, job); const result = this.enqueue(job.request, job, newKey, requestHash, actor); this.db.audit(actor, 'job', key, 'resubmitted', { newJobId: result.jobId }); return result; });
    }
    if (input.action === 'resume') {
      if (job.error && terminalProviderCodes.includes(job.error.code)) fail('NOT_RESUMABLE', 'The provider reports a terminal unsuccessful job. Create a new explicit submission to retry.');
      if (!job.providerJobId && !job.result) fail('NOT_RESUMABLE', 'No acknowledged provider job or saved outputs exist');
      return this.db.transaction(() => { this.db.audit(actor, 'job', key, 'resume_requested'); return this.transition(key, job.result ? 'downloading' : 'running', { error: null, finishedAt: null }); });
    }
    if (job.provider !== 'openrouter' || job.kind !== 'video') fail('ATTACH_UNSUPPORTED', 'Attaching IDs is supported only for the async video provider');
    if (!this.db.all('submissions').some(s => s.jobId === key)) fail('NO_SUBMISSION', 'A provider ID can only resolve a recorded submission attempt');
    this.checkProviderJobId(job, input.providerJobId!);
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const verified = await this.providers.verifyVideoJob(input.providerJobId!, controller.signal);
      if (verified.id !== input.providerJobId || !['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'expired'].includes(verified.status)) fail('PROVIDER_JOB_UNVERIFIED', 'Provider job status or ID could not be verified');
      return this.db.transaction(() => {
        const current = this.db.get('jobs', key); if (current.updatedAt !== job.updatedAt) fail('JOB_CHANGED', 'Job changed during provider verification', 409);
        this.checkProviderJobId(current, verified.id);
        const unsuccessful = ['failed', 'cancelled', 'expired'].includes(verified.status);
        this.submissionOutcome(key, 'accepted'); const updated = this.transition(key, unsuccessful ? 'failed' : 'running', { providerJobId: verified.id, modelReported: verified.modelReported, error: unsuccessful ? { code: `VIDEO_${verified.status.toUpperCase()}`, message: 'The provider reports a terminal unsuccessful video job. No resubmission was made.' } : null, finishedAt: null }); this.db.audit(actor, 'job', key, 'provider_job_attached', { providerJobId: verified.id, providerStatus: verified.status }); return updated;
      });
    } catch (error) { if (error instanceof ApiError) throw error; fail('PROVIDER_JOB_UNVERIFIED', 'The provider ID could not be verified. No paid submission was made.', 422); }
    finally { clearTimeout(timer); }
  }
  private checkProviderJobId(job: Row<'jobs'>, providerJobId: string) {
    if (job.providerJobId && job.providerJobId !== providerJobId) fail('PROVIDER_JOB_CONFLICT', 'An existing provider acknowledgment cannot be overwritten', 409);
    if (this.db.all('jobs').some(other => other.id !== job.id && other.provider === job.provider && other.providerJobId === providerJobId)) fail('PROVIDER_JOB_CONFLICT', 'This provider job ID is already attached to another job', 409);
  }
  private context(job: Row<'jobs'>, signal: AbortSignal, acknowledge = true) {
    const ids = [...new Set([...(job.request.startFrameAssetId ? [job.request.startFrameAssetId] : []), ...job.request.refAssetIds])];
    return { signal, refs: ids.map(assetId => { const asset = this.db.get('assets', assetId); return { assetId, path: this.assets.path(asset), mime: asset.mime }; }), onSubmitted: async (providerJobId: string) => {
      if (!acknowledge) return;
      if (!providerJobId || providerJobId.length > 1000) throw new Error('Invalid provider acknowledgment');
      this.db.transaction(() => { const current = this.db.get('jobs', job.id); this.checkProviderJobId(current, providerJobId); this.submissionOutcome(job.id, 'accepted'); this.db.update('jobs', job.id, { providerJobId, updatedAt: now() }); if (current.status === 'submitting') this.transition(job.id, 'running'); this.db.audit('runner', 'job', job.id, 'provider_acknowledged', { providerJobId }); });
    } };
  }
  private async persistHandles(job: Row<'jobs'>, result: ProviderResult): Promise<SavedResult> {
    if (!Array.isArray(result.outputs) || result.outputs.length > 8) throw new Error('Invalid provider output count');
    const outputs: OutputHandle[] = [];
    for (const [index, output] of result.outputs.entries()) {
      if (output.bytes) { if (output.bytes.length > (job.kind === 'image' ? 25 : 200) * 1024 * 1024) throw new Error('Provider output exceeds limit'); const file = `${job.id}-${index}-${randomUUID()}.output`; await writeFile(join(temporaryPath, file), output.bytes, { mode: 0o600 }); outputs.push({ file, mime: output.mime }); }
      else if (output.url) outputs.push({ url: output.url, mime: output.mime });
      else throw new Error('Provider output has no bytes or URL');
    }
    return { outputs, modelReported: result.modelReported || null, ...(result.text !== undefined ? { text: result.text } : {}), ...(result.usage ? { usage: sanitize(result.usage) as Record<string, unknown> } : {}), ...(result.metadata ? { metadata: sanitize(result.metadata) as Record<string, unknown> } : {}) };
  }
  private async runNext() {
    const candidates = this.db.all('jobs').filter(j => ['queued', 'running', 'downloading'].includes(j.status)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let job = candidates[0]; if (!job) return;
    const abort = new AbortController(); this.active = { id: job.id, abort };
    const timer = setTimeout(() => abort.abort(), 30 * 60 * 1000);
    let submit = false;
    try {
      if (job.status === 'queued') {
        job = this.db.transaction(() => {
          const current = this.db.get('jobs', job!.id); if (current.status !== 'queued') return current;
          if (this.db.all('submissions').some(s => s.jobId === current.id)) return this.transition(current.id, 'needs_attention', { error: { code: 'ALREADY_SUBMITTED', message: 'A submission already exists. It will not be repeated.' } });
          try { this.validateSnapshot(current.request, current); } catch (error) { return this.transition(current.id, 'failed', { error: { code: error instanceof ApiError ? (error.getResponse() as { error: { code: string } }).error.code : 'INVALID_SNAPSHOT', message: error instanceof ApiError ? (error.getResponse() as { error: { message: string } }).error.message : 'Saved request is no longer valid.' } }); }
          const stamp = now(); this.db.insert('submissions', { id: id('sub'), jobId: current.id, provider: current.provider, kind: current.kind, outcome: 'pending', createdAt: stamp });
          submit = true; return this.transition(current.id, 'submitting', { submittedAt: stamp, error: null });
        });
      }
      if (!['submitting', 'running', 'downloading'].includes(job.status)) return;
      if (job.status !== 'downloading') {
        const result = submit ? await this.providers.generate(job.request, this.context(job, abort.signal)) : job.providerJobId ? await this.providers.resume(job.request, job.providerJobId, this.context(job, abort.signal)) : fail('NOT_RESUMABLE', 'Job has no provider acknowledgment');
        const saved = await this.persistHandles(job, result);
        this.db.transaction(() => {
          this.submissionOutcome(job!.id, 'accepted'); const current = this.db.get('jobs', job!.id);
          this.db.update('jobs', job!.id, { result: saved as unknown as Record<string, unknown>, modelReported: saved.modelReported, resultText: saved.text ?? null, updatedAt: now() });
          if (!terminalStatuses.includes(current.status)) this.transition(job!.id, 'downloading');
        });
        job = this.db.get('jobs', job.id); if (job.status !== 'downloading') return;
      }
      const saved = job.result as unknown as SavedResult;
      if (!saved || !Array.isArray(saved.outputs)) throw new Error('Saved output handles unavailable');
      for (const [index, output] of saved.outputs.entries()) {
        if (abort.signal.aborted || this.db.get('jobs', job.id).status !== 'downloading') throw new Error('Download interrupted');
        if (output.assetId && this.db.find('assets', output.assetId)) continue;
        if (output.file && !/^job_[a-f0-9-]+-\d+-[a-f0-9-]+\.output$/.test(output.file)) throw new Error('Invalid local output handle');
        const bytes = output.file ? await readFile(join(temporaryPath, output.file)) : output.url ? await downloadOutput(output.url, abort.signal, (job.kind === 'image' ? 25 : 200) * 1024 * 1024) : fail('OUTPUT_MISSING', 'Output has no download handle');
        const expectedKind = job.kind;
        await this.assets.import(bytes, `${job.id}-${index}.${job.kind === 'video' ? 'mp4' : 'png'}`, job.id, true, asset => {
          if (asset.kind !== expectedKind) fail('OUTPUT_KIND_MISMATCH', 'Provider output media kind did not match the request');
          const current = this.db.get('jobs', job!.id); const result = current.result as unknown as SavedResult;
          result.outputs[index]!.assetId = asset.id;
          this.db.update('jobs', job!.id, { result: result as unknown as Record<string, unknown>, outputAssetIds: [...new Set([...current.outputAssetIds, asset.id])], updatedAt: now() });
        });
      }
      this.db.transaction(() => {
        const current = this.db.get('jobs', job!.id); if (current.status !== 'downloading') return;
        if (current.kind === 'text' ? !saved.text?.trim() : current.outputAssetIds.length === 0) throw new Error('Provider returned no usable output');
        this.transition(current.id, 'succeeded', { error: null, resultText: saved.text ?? null });
        if (current.shotId && this.db.find('shots', current.shotId)) { const shot = this.db.get('shots', current.shotId); this.db.update('shots', shot.id, { status: current.kind === 'video' ? (shot.selectedVideoAssetId ? 'done' : 'video') : shot.selectedStillAssetId ? 'still_selected' : 'stills', updatedAt: now() }); }
      });
    } catch (error) {
      const providerError = error instanceof ProviderError ? error : null;
      if (providerError?.submissionOutcome === 'accepted') {
        try { this.db.transaction(() => {
          const acknowledged = this.db.get('jobs', job!.id); this.submissionOutcome(acknowledged.id, 'accepted');
          if (providerError.providerJobId) { this.checkProviderJobId(acknowledged, providerError.providerJobId); this.db.update('jobs', acknowledged.id, { providerJobId: providerError.providerJobId, updatedAt: now() }); }
        }); } catch { console.error(JSON.stringify({ code: 'ACK_PERSIST_FAILED', jobId: job.id, providerJobId: providerError.providerJobId ?? null })); }
      }
      const current = this.db.get('jobs', job.id);
      if (!terminalStatuses.includes(current.status)) this.db.transaction(() => {
        const knownRejected = providerError?.submissionOutcome === 'not_submitted' || providerError?.submissionOutcome === 'rejected';
        if (!current.providerJobId && !current.result && providerError?.submissionOutcome !== 'accepted') this.submissionOutcome(current.id, knownRejected ? 'rejected' : 'unknown');
        const terminalProviderFailure = !!providerError && terminalProviderCodes.includes(providerError.code);
        const code = current.result ? 'DOWNLOAD_FAILED' : providerError?.code ?? (current.providerJobId ? 'PROVIDER_POLL_FAILED' : knownRejected ? 'PROVIDER_REJECTED' : 'SUBMISSION_UNCERTAIN');
        this.transition(current.id, knownRejected || terminalProviderFailure ? 'failed' : 'needs_attention', { error: { code, message: current.result ? 'Saved outputs could not be imported. Resume downloads without resubmitting.' : providerError?.message ?? (current.providerJobId ? 'Polling stopped. Resume the acknowledged job without resubmitting.' : knownRejected ? 'The provider rejected this attempt. A new explicit job is required to try again.' : 'Submission outcome is uncertain. No automatic resubmission will occur.') } });
      });
    } finally { clearTimeout(timer); this.active = undefined; }
  }
}
