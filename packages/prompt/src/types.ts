import type { Asset, Campaign, Character, CharacterReference, DerivationRole, Job, ProviderModel, Review, Shot } from '@vibefield/contracts';

export interface CompilerOptions {
  provider: string;
  model: string;
  count?: number;
  aspectRatio?: string;
  maxReferences?: number;
  capabilities?: ProviderModel;
  assets?: readonly Asset[];
  latestReviewNotes?: string;
}
export interface IdentityCompilerInput extends CompilerOptions {
  character: Character;
  references?: readonly CharacterReference[];
}
export interface PortraitInput extends CompilerOptions { character: Character; notes?: string }
export interface DerivationInput extends IdentityCompilerInput { role: DerivationRole; spec?: string }
export interface StillInput extends IdentityCompilerInput { campaign: Campaign; shot: Shot }
export interface VideoInput extends CompilerOptions {
  character: Character;
  campaign: Campaign;
  shot: Shot;
  selectedStill: Asset;
  selectedStillJob: Pick<Job, 'id' | 'shotId' | 'outputAssetIds'>;
  reviews: readonly Review[];
  durationSeconds?: number;
  resolution?: string;
  generateAudio?: boolean;
}
export interface CopyInput extends CompilerOptions {
  campaign: Campaign;
  characters?: readonly Character[];
  shots?: readonly Shot[];
  instruction?: string;
}

export class PromptCompileError extends Error {
  constructor(public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'PromptCompileError';
  }
}
