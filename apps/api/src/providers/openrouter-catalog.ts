import type { ProviderModel } from '@vibefield/contracts';
import { ProviderError } from './provider.types';
import { OPENROUTER_BASE, record, safeIdentifier, wireJson } from './transport';

export type VideoModel = ProviderModel;
interface Catalog<T> { models: T[]; fetchedAt: string }
const TTL_MS = 5 * 60 * 1000;

class PublicCatalog<T> {
  private cached?: Catalog<T>;
  private inFlight?: Promise<Catalog<T>>;
  private retryAfter = 0;
  constructor(private readonly path: string, private readonly parse: (value: unknown) => T[]) {}
  async get(): Promise<Catalog<T>> {
    if (this.cached && Date.now() - Date.parse(this.cached.fetchedAt) < TTL_MS) return this.cached;
    if (this.inFlight) return this.inFlight;
    if (Date.now() < this.retryAfter) throw new ProviderError('CATALOG_UNAVAILABLE', 'Public OpenRouter model discovery is temporarily unavailable. No stale or invented model is selected.');
    this.inFlight = this.fetch();
    try { return await this.inFlight; } finally { this.inFlight = undefined; }
  }
  private async fetch(): Promise<Catalog<T>> {
    try {
      const { data } = await wireJson(`${OPENROUTER_BASE}${this.path}`, { signal: new AbortController().signal, timeoutMs: 15000, maxBytes: 20 * 1024 * 1024 });
      const models = this.parse(data.data);
      if (!models.length) throw new ProviderError('CATALOG_EMPTY', 'OpenRouter returned no usable models.');
      this.cached = { models, fetchedAt: new Date().toISOString() };
      return this.cached;
    } catch {
      this.retryAfter = Date.now() + 30000;
      throw new ProviderError('CATALOG_UNAVAILABLE', 'Public OpenRouter model discovery is unavailable or malformed. No stale or invented model is selected.');
    }
  }
}

function stringArray(value: unknown, pattern: RegExp): string[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 256 || value.some(item => typeof item !== 'string' || !pattern.test(item))) throw new Error('Invalid capability array');
  return [...new Set(value as string[])];
}
function durations(value: unknown): number[] | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 1024 || value.some(item => typeof item !== 'number' || !Number.isFinite(item) || !Number.isInteger(item) || item <= 0 || item > 3600)) throw new Error('Invalid duration array');
  return [...new Set(value as number[])];
}
function rows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || value.length > 10000) throw new Error('Invalid catalog');
  return value.map(item => { const row = record(item); if (!row) throw new Error('Invalid catalog row'); return row; });
}
function identity(row: Record<string, unknown>): { id: string; label: string } {
  const id = safeIdentifier(row.id);
  if (!id || !id.includes('/')) throw new Error('Invalid model id');
  const label = typeof row.name === 'string' && row.name.length > 0 && row.name.length < 256 && [...row.name].every(character => character.charCodeAt(0) >= 32) ? row.name : id;
  return { id, label };
}
function unique<T extends { id: string }>(models: T[]): T[] {
  if (new Set(models.map(model => model.id)).size !== models.length) throw new Error('Duplicate model ids');
  return models;
}

export function parseVideoModels(value: unknown): VideoModel[] {
  return unique(rows(value).map(row => {
    const model: VideoModel = { ...identity(row), kind: 'video' };
    const durationValues = durations(row.supported_durations);
    const resolutionValues = stringArray(row.supported_resolutions, /^[A-Za-z0-9]{1,16}$/);
    const aspectValues = stringArray(row.supported_aspect_ratios, /^[1-9]\d{0,3}:[1-9]\d{0,3}$/);
    const frameValues = stringArray(row.supported_frame_images, /^(first_frame|last_frame)$/);
    if (durationValues) model.durations = durationValues;
    if (resolutionValues) model.resolutions = resolutionValues;
    if (aspectValues) model.aspectRatios = aspectValues;
    if (frameValues) { model.supportsStartFrame = frameValues.includes('first_frame'); model.maxReferences = model.supportsStartFrame ? 1 : 0; }
    if (typeof row.generate_audio === 'boolean') model.supportsAudio = row.generate_audio;
    else if (row.generate_audio !== null && row.generate_audio !== undefined) throw new Error('Invalid audio capability');
    return model;
  }));
}

function parseTextModels(value: unknown): ProviderModel[] {
  return unique(rows(value).filter(row => {
    const architecture = record(row.architecture);
    return Array.isArray(architecture?.input_modalities) && architecture.input_modalities.includes('text') &&
      Array.isArray(architecture.output_modalities) && architecture.output_modalities.includes('text');
  }).map(row => ({ ...identity(row), kind: 'text' as const, maxReferences: 0 })));
}

export function selectDefaultVideoModel(models: VideoModel[]): VideoModel | undefined {
  const supported = models.filter(model => model.supportsStartFrame && model.durations?.includes(5) && model.resolutions?.includes('720p') && model.aspectRatios?.includes('9:16'));
  return supported.find(model => model.id === 'bytedance/seedance-2.0-fast') ?? supported.find(model => model.id.startsWith('bytedance/seedance-')) ?? supported[0];
}

export class OpenRouterCatalog {
  private readonly videos = new PublicCatalog('/videos/models', parseVideoModels);
  private readonly texts = new PublicCatalog('/models?output_modalities=text', parseTextModels);
  video(): Promise<Catalog<VideoModel>> { return this.videos.get(); }
  text(): Promise<Catalog<ProviderModel>> { return this.texts.get(); }
  async defaultVideoModel(): Promise<string | null> { return selectDefaultVideoModel((await this.video()).models)?.id ?? null; }
}
