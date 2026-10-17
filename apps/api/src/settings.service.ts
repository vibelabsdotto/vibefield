import { Injectable } from '@nestjs/common';
import * as c from '@vibefield/contracts';
import { DatabaseService } from './db/database.service';
import { ProvidersService } from './providers/providers.service';
import { config } from './config';
import { fail } from './errors';

@Injectable()
export class SettingsService {
  constructor(private readonly db: DatabaseService, private readonly providers: ProvidersService) {}
  defaults() { return { imageProvider: this.db.settingValue('defaultImageProvider', 'codex'), imageModel: this.db.settingValue('defaultImageModel', 'gpt-image-2'), videoModel: this.db.settingValue('defaultVideoModel', ''), textModel: this.db.settingValue('defaultTextModel', 'openai/gpt-4.1-mini') }; }
  async get() { const providers = await this.providers.describe(); const defaults = this.defaults(); if (!defaults.videoModel) defaults.videoModel = await this.providers.defaultVideoModel() || ''; return { providers, defaults, videoBudget: this.db.budget(), storage: { dataDir: config.home } }; }
  async update(body: unknown, actor: string) {
    const input = c.patchSettingsSchema.parse(body); const statuses = await this.providers.describe();
    if (input.defaultImageProvider && !statuses.some(p => p.id === input.defaultImageProvider && p.kinds.includes('image'))) fail('UNKNOWN_PROVIDER', 'Choose an image provider from the capability catalog');
    this.db.transaction(() => { for (const [key, value] of Object.entries(input)) if (value !== undefined) this.db.setting(key, value); this.db.audit(actor, 'settings', 'settings', 'updated', { fields: Object.keys(input) }); }); return this.get();
  }
  async capability(kind: c.CompiledRequest['kind'], providerId?: string, modelId?: string, requireAvailable = true) {
    const defaults = this.defaults(); const provider = providerId || (kind === 'image' ? defaults.imageProvider : 'openrouter');
    const model = modelId || (kind === 'image' ? defaults.imageModel : kind === 'video' ? defaults.videoModel || await this.providers.defaultVideoModel() || '' : defaults.textModel);
    const status = (await this.providers.describe()).find(p => p.id === provider && p.kinds.includes(kind));
    if (!status) fail('UNKNOWN_PROVIDER', 'Provider does not support this generation kind');
    if (requireAvailable && (!status.available || !status.configured)) fail('PROVIDER_UNAVAILABLE', status.reason || 'Configure the provider locally before generation', 503);
    if (!model) fail('MODEL_REQUIRED', 'Choose a model from the provider capability catalog');
    const capabilities = status.models.find(m => m.id === model && m.kind === kind);
    if (!capabilities) fail('MODEL_UNSUPPORTED', 'Model is not present in the current provider capability catalog');
    return { provider, model, capabilities, maxReferences: capabilities.maxReferences };
  }
  validateVideo(request: c.CompiledRequest, model: c.ProviderModel) {
    if (model.supportsStartFrame !== true || !model.durations?.includes(request.params.durationSeconds!) || !model.resolutions?.includes(request.params.resolution!) || !model.aspectRatios?.includes(request.aspectRatio)) fail('VIDEO_MODEL_UNSUPPORTED', 'Choose a model with verified start-frame, duration, resolution, and aspect-ratio support');
    if (request.params.generateAudio && model.supportsAudio !== true) fail('VIDEO_AUDIO_UNSUPPORTED', 'This model does not advertise audio support');
  }
}
