import type { Shot } from '@vibefield/contracts';

export interface PhotographyPreset {
  id: string;
  label: string;
  camera: string;
  lighting: string;
  scene: string;
  skin: string;
  note: string;
}

/** Original direction snippets. These request a look; they do not simulate camera hardware. */
export const photographyPresets = [
  {
    id: 'window-conversation', label: 'Window conversation',
    camera: 'Eye-level medium close-up, ordinary phone-camera perspective, eyes sharp, room still legible behind the subject.',
    lighting: 'Broad side window light, soft room fill, gentle shadow on the far cheek, no beauty-ring catchlight.',
    scene: 'A quiet lived-in room with a clear background and a few ordinary objects kept out of the face outline.',
    skin: 'Keep natural cheek texture, subtle under-eye detail and individual flyaway hairs. Avoid adding uniform pores or invented freckles.',
    note: 'Useful for direct-to-camera UGC hooks. Keep the face away from wide-angle frame edges.',
  },
  {
    id: 'kitchen-demonstration', label: 'Kitchen demonstration',
    camera: 'Waist-up at counter height, a normal-looking perspective with room for hands and the entire product.',
    lighting: 'Window light across the counter, softer bounced fill from the room, contact shadows under the product and fingers.',
    scene: 'An everyday kitchen counter with restrained clutter and believable material wear.',
    skin: 'Preserve skin texture on face and hands, natural knuckle folds, and gentle highlights rather than glossy skin.',
    note: 'Useful for product-in-use shots. Check hand contact, packaging proportions and visible label details.',
  },
  {
    id: 'outdoor-open-shade', label: 'Outdoor open shade',
    camera: 'Chest-up framing at eye level, mild background separation and enough context to read the location.',
    lighting: 'Open shade with soft sky light; warmer reflected light from nearby pavement, without a hard sun patch across the face.',
    scene: 'A quiet outdoor walkway with real depth and an uncluttered area behind the head.',
    skin: 'Keep natural tonal variation, facial hair and visible marks. Do not bleach skin to compensate for a bright background.',
    note: 'Useful for conversational lifestyle ads. Wind should move hair consistently, not change its length or shape.',
  },
  {
    id: 'desk-product-detail', label: 'Desk product detail',
    camera: 'Close product-and-hands crop from a slight overhead angle, readable geometry, restrained depth of field.',
    lighting: 'A broad side light across the desk, soft shadows beneath hands, material reflections consistent with the light source.',
    scene: 'A plain desk surface with the actual product, one useful prop at most, and space around the action.',
    skin: 'Natural hand creases and nails, consistent skin tone and marks, no extra fingers or melted joints.',
    note: 'Useful for tactile demonstration inserts. Keep product shape and functional parts visible through the action.',
  },
] as const satisfies readonly PhotographyPreset[];

type ShotDirection = Pick<Shot, 'title' | 'scene' | 'action' | 'camera' | 'lighting' | 'wardrobe' | 'dialogue' | 'motion' | 'durationSeconds' | 'resolution'>;
export interface ShotTemplate extends ShotDirection { id: string; label: string; note: string }

export const shotTemplates = [
  {
    id: 'direct-introduction', label: 'Direct introduction', title: 'Introduce the product',
    scene: 'A quiet everyday room with a simple background.',
    action: 'Face the camera with the product visible at chest height, without blocking the face or label.',
    camera: 'Eye-level medium close-up, comfortable phone-camera framing.',
    lighting: 'Soft side-window light with gentle room fill.', wardrobe: '', dialogue: '',
    motion: 'Small natural breathing movement and one relaxed glance from the product to the lens. Keep the camera steady.',
    durationSeconds: 5, resolution: '720p',
    note: 'Add a short original spoken line supported by the brief. Check face, hair, hands and product together.',
  },
  {
    id: 'single-use-demonstration', label: 'Single use demonstration', title: 'Show one useful action',
    scene: 'A clear working surface in the product\'s ordinary setting.',
    action: 'Perform one practical product action with both the grip and result visible. Do not imply an unsupported benefit.',
    camera: 'Waist-up or medium hands-and-product framing, leave room for the whole action.',
    lighting: 'Broad soft light from one side, visible contact shadows.', wardrobe: '', dialogue: '',
    motion: 'One slow, readable action with plausible hand contact and stable product geometry. No scene cut.',
    durationSeconds: 5, resolution: '720p',
    note: 'Specify the real action before generation. A clear single action is easier to review than a sequence of steps.',
  },
  {
    id: 'tactile-closeup', label: 'Tactile close-up', title: 'Show the material detail',
    scene: 'A neutral desk or counter with no distracting props.',
    action: 'Hold the product naturally so one relevant material or functional detail is visible.',
    camera: 'Tight hands-and-product crop, slight overhead angle, readable depth rather than extreme blur.',
    lighting: 'Soft directional light that reveals the actual surface without exaggerated gloss.', wardrobe: '', dialogue: '',
    motion: 'A small controlled rotation or touch that keeps the product shape, label and fingers stable.',
    durationSeconds: 5, resolution: '720p',
    note: 'Keep the canonical hand and skin cues, not just the face. Do not invent hidden functions or label text.',
  },
] as const satisfies readonly ShotTemplate[];
