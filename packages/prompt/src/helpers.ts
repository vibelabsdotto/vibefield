import {
  appearanceSchema, assetSchema, compiledRequestSchema, countSchema, nonBlankStringSchema,
  providerModelSchema, requestedAspectRatioSchema,
  type Asset, type Character, type CompiledRequest, type IdentitySnapshot, type JobKind,
  type JobPurpose, type ReferenceDescription,
} from '@vibefield/contracts';
import { PromptCompileError, type CompilerOptions } from './types.js';

type ParseResult<T> = { success: true; data: T } | { success: false; error: { issues: unknown } };
export function validated<T>(schema: { safeParse(value: unknown): ParseResult<T> }, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new PromptCompileError('INVALID_COMPILER_INPUT', `Invalid ${label}`, result.error.issues);
  return result.data;
}
export function requireCondition(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new PromptCompileError(code, message);
}
export const quote = (value: unknown): string => JSON.stringify(value);
export function optionalText(value: string | undefined, label: string): string {
  if (value === undefined) return '';
  requireCondition(typeof value === 'string', 'INVALID_COMPILER_INPUT', `${label} must be text`);
  return value;
}
export const realismDirection = [
  'Photographic direction: preserve natural skin variation, small pores where visible, fine facial hair, and the person\'s own marks. Do not add fake freckles or change age.',
  'Light should come from identifiable sources in the scene. Keep plausible shadow direction, gentle highlight roll-off, and texture in bright skin.',
  'Use ordinary lived-in surfaces, credible hand contact, coherent scale and perspective. Avoid plastic skin, over-sharpened edges, beauty-filter smoothing and a pasted-on subject.',
].join('\n');
export const identityDirection = [
  'Identity hierarchy: the clean canonical face anchor is authoritative. Preserve its facial proportions, eye shape, hairline, hair color and length, skin tone and distinguishing marks. Keep visible body proportions and build consistent; do not improve only the face while changing the person.',
  'A reference sheet or angle supplies supporting body, pose and wardrobe information only. If it conflicts with the canonical face, follow the canonical face.',
  'Written appearance is supporting context, not permission to replace visible identity. Product, composition and scene inputs must never supply a different face.',
].join('\n');

/** Advisory only. Names and ordinary scene directions are never banned. */
export function lintIdentity(text: string, anchored = true): string[] {
  const warnings: string[] = [];
  if (anchored && /\b(?:different person|replace (?:the )?face|change (?:the )?(?:identity|ethnicity)|younger face|older face)\b/i.test(text)) {
    warnings.push('Direction may conflict with the visual identity anchor. The canonical face takes precedence; review the result manually.');
  }
  if (/\b(?:8k|16k|masterpiece|flawless skin|perfect skin)\b/i.test(text)) {
    warnings.push('Generic quality or skin-perfection wording does not define lighting, detail or output resolution; use concrete photographic direction.');
  }
  return warnings;
}
export function appearanceContext(character: Character): string {
  const appearance = validated(appearanceSchema, character.appearance, 'appearance');
  return `Identity description, supporting context: ${quote({ description: character.description, appearance })}`;
}
export function requireCanonical(character: Character): string {
  requireCondition(character.canonicalAssetId, 'CANONICAL_REQUIRED', 'Approve a canonical image before compiling this request.');
  return character.canonicalAssetId;
}
export function canonicalRole(character: Character): ReferenceDescription {
  return { assetId: requireCanonical(character), role: 'canonical', description: 'Primary identity anchor. This clean canonical portrait controls facial identity and overrides all supporting references and text.' };
}

export function referenceBlock(roles: readonly ReferenceDescription[]): string {
  if (!roles.length) return 'No image references are attached. This is an initial text-directed request, not an identity-matched edit.';
  return ['Attached images in exact input order:', ...roles.map((ref, index) => `Image ${index + 1} [${ref.assetId}] ${ref.role}: ${ref.description}`)].join('\n');
}

interface FinishInput {
  options: CompilerOptions;
  kind: JobKind;
  purpose: JobPurpose;
  aspectRatio: string;
  prompt: string[];
  roles?: ReferenceDescription[];
  dropped?: string[];
  warnings?: string[];
  character?: Character;
  params?: CompiledRequest['params'];
  startFrameAssetId?: string;
  knownAssets?: readonly Asset[];
}

export function finish(input: FinishInput): CompiledRequest {
  const { options, kind } = input;
  const provider = validated(nonBlankStringSchema, options.provider, 'provider');
  const model = validated(nonBlankStringSchema, options.model, 'model');
  const aspectRatio = validated(requestedAspectRatioSchema, options.aspectRatio ?? input.aspectRatio, 'aspect ratio');
  const count = validated(countSchema, options.count ?? 1, 'count');
  requireCondition(kind === 'image' || count === 1, 'INVALID_COUNT', 'Video and text requests require count 1.');
  const warnings = [...(input.warnings ?? [])];
  const roles = [...(input.roles ?? [])];
  const dropped = [...(input.dropped ?? [])];
  const capabilities = options.capabilities ? validated(providerModelSchema, options.capabilities, 'model capabilities') : undefined;
  if (capabilities) {
    requireCondition(capabilities.id === model && capabilities.kind === kind, 'CAPABILITY_MISMATCH', 'Discovered capability model and kind must match this request.');
    if (capabilities.maxOutputs !== undefined && count > capabilities.maxOutputs) {
      throw new PromptCompileError('COUNT_EXCEEDS_PROVIDER_MAX', `${provider} returns ${capabilities.maxOutputs} image per request (${capabilities.maxOutputsSource ?? 'provider limit'}). Run the command again for another candidate.`, { provider, max: capabilities.maxOutputs, source: capabilities.maxOutputsSource ?? 'documented' });
    }
    if (capabilities.aspectRatios) requireCondition(capabilities.aspectRatios.includes(aspectRatio), 'UNSUPPORTED_ASPECT_RATIO', `Model does not list aspect ratio ${aspectRatio}.`);
    if (input.params?.durationSeconds !== undefined && capabilities.durations) requireCondition(capabilities.durations.includes(input.params.durationSeconds), 'UNSUPPORTED_DURATION', 'Requested duration is not listed for this model.');
    if (input.params?.resolution !== undefined && capabilities.resolutions) requireCondition(capabilities.resolutions.includes(input.params.resolution), 'UNSUPPORTED_RESOLUTION', 'Requested resolution is not listed for this model.');
  }
  if (kind === 'video') {
    requireCondition(capabilities?.supportsStartFrame === true, 'PROVIDER_NO_START_FRAME', 'This model must explicitly support the selected start frame. No text-only fallback is allowed.');
    requireCondition(capabilities.durations && capabilities.durations.length > 0, 'VIDEO_CAPABILITIES_INCOMPLETE', 'Discover supported video durations before submitting.');
    requireCondition(capabilities.resolutions && capabilities.resolutions.length > 0, 'VIDEO_CAPABILITIES_INCOMPLETE', 'Discover supported video resolutions before submitting.');
    requireCondition(capabilities.aspectRatios && capabilities.aspectRatios.length > 0, 'VIDEO_CAPABILITIES_INCOMPLETE', 'Discover supported video aspect ratios before submitting.');
    if (input.params?.generateAudio === true) requireCondition(capabilities.supportsAudio === true, 'VIDEO_AUDIO_UNSUPPORTED', 'This model does not explicitly advertise audio generation. Disable audio or select a supported model.');
  }
  if (options.maxReferences !== undefined) requireCondition(Number.isInteger(options.maxReferences) && options.maxReferences >= 0, 'INVALID_REFERENCE_LIMIT', 'Reference limit must be a nonnegative integer.');
  const limits = [options.maxReferences, capabilities?.maxReferences].filter((limit): limit is number => limit !== undefined);
  const limit = limits.length ? Math.min(...limits) : undefined;
  if (roles.length && limit === undefined) warnings.push('Provider reference limit is undiscovered; all ordered references must be supported or submission must fail, never switch to text-only.');
  if (roles.length && limit === 0) throw new PromptCompileError('PROVIDER_NO_REFERENCES', 'This request needs its visual anchor. The provider accepts no reference images.');
  if (limit !== undefined && roles.length > limit) {
    const removed = roles.splice(limit);
    dropped.push(...removed.map(ref => ref.assetId));
    warnings.push(`Provider reference limit ${limit} omitted end references: ${removed.map(ref => ref.assetId).join(', ')}. Composition may lose that guidance.`);
  }
  const assetMap = new Map<string, Asset>();
  for (const source of [...(options.assets ?? []), ...(input.knownAssets ?? [])]) {
    const asset = validated(assetSchema, source, 'asset metadata');
    const existing = assetMap.get(asset.id);
    requireCondition(!existing || existing.sha256 === asset.sha256, 'CONFLICTING_ASSET_METADATA', `Conflicting checksums for ${asset.id}.`);
    assetMap.set(asset.id, asset);
  }
  for (const ref of roles) {
    const asset = assetMap.get(ref.assetId);
    if (options.assets !== undefined || asset !== undefined) {
      requireCondition(asset, 'REFERENCE_ASSET_MISSING', `No resolved asset metadata for ${ref.assetId}.`);
      requireCondition(asset.kind === 'image' && asset.mime.startsWith('image/'), 'REFERENCE_NOT_IMAGE', `Reference ${ref.assetId} must be an image.`);
    } else {
      warnings.push(`Image metadata for ${ref.assetId} was not supplied; API must resolve and verify this exact asset before submission.`);
    }
  }
  let identitySnapshot: IdentitySnapshot | undefined;
  if (input.character) {
    const character = input.character;
    const canonical = character.canonicalAssetId ? assetMap.get(character.canonicalAssetId) : undefined;
    identitySnapshot = {
      characterId: character.id, identityVersion: character.identityVersion,
      canonicalAssetId: character.canonicalAssetId, appearance: { ...character.appearance },
      ...(canonical ? { canonicalSha256: canonical.sha256 } : {}),
    };
    if (character.canonicalAssetId && !canonical) warnings.push('Canonical checksum was not supplied. Preserve canonical asset metadata alongside this request for export provenance.');
  }
  if (kind === 'image') warnings.push('Aspect ratio and photographic direction are requests. Inspect actual output dimensions and identity before approval.');
  if (provider === 'codex' && kind === 'image') warnings.push('Codex has no functional image size or quality control here. Requested model is not proof of executed model; keep modelReported null unless the provider reports it.');
  const retained = new Set(roles.map(ref => ref.assetId));
  return validated(compiledRequestSchema, {
    kind, purpose: input.purpose, provider, model,
    prompt: [referenceBlock(roles), ...(kind === 'image' ? [`Framing request: compose the complete image at width:height ${aspectRatio}. Keep all intended subjects inside that frame. This is composition direction, not text to draw in the image.`] : []), ...input.prompt].filter(Boolean).join('\n\n'),
    aspectRatio, count, refAssetIds: roles.map(ref => ref.assetId), referenceRoles: roles,
    identityVersion: input.character?.identityVersion ?? null,
    ...(identitySnapshot ? { identitySnapshot } : {}),
    ...(input.startFrameAssetId ? { startFrameAssetId: input.startFrameAssetId } : {}),
    params: input.params ?? {}, warnings: [...new Set(warnings)],
    droppedRefAssetIds: [...new Set(dropped)].filter(id => !retained.has(id)),
  }, 'compiled request');
}
