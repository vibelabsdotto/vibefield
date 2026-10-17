import { characterReferenceSchema, type Character, type CharacterReference, type ReferenceDescription } from '@vibefield/contracts';
import { canonicalRole, requireCondition, validated } from './helpers.js';

export interface OrderedReferences { roles: ReferenceDescription[]; dropped: string[]; warnings: string[] }

/** Keep canonical stronger than supporting identity. Caller provides the exact persisted rows. */
export function orderStillReferences(
  character: Character,
  references: readonly CharacterReference[],
  productAssetIds: readonly string[],
  extraAssetIds: readonly string[],
): OrderedReferences {
  const roles: ReferenceDescription[] = [canonicalRole(character)];
  const warnings: string[] = [];
  const dropped: string[] = [];
  const seen = new Set(roles.map(ref => ref.assetId));
  const rows = references.map(ref => validated(characterReferenceSchema, ref, 'character reference'))
    .sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const rowByAsset = new Map<string, CharacterReference>();
  const stale = new Set<string>();
  for (const row of rows) {
    requireCondition(row.characterId === character.id, 'REFERENCE_CHARACTER_MISMATCH', `Reference ${row.id} belongs to a different character.`);
    if (row.assetId === character.canonicalAssetId) {
      warnings.push(`Ignored redundant reference row ${row.id}: canonical is attached directly, not as a secondary reference.`);
      continue;
    }
    const existing = rowByAsset.get(row.assetId);
    requireCondition(!existing || (existing.role === row.role && existing.identityVersion === row.identityVersion && existing.approved === row.approved), 'CONFLICTING_REFERENCE_ROWS', `Conflicting roles or approval/version metadata for asset ${row.assetId}.`);
    rowByAsset.set(row.assetId, row);
    if (row.identityVersion !== character.identityVersion) {
      stale.add(row.assetId);
      dropped.push(row.assetId);
      warnings.push(`Excluded stale reference ${row.assetId}: identity version ${row.identityVersion}, current ${character.identityVersion}.`);
    }
  }
  const supporting = rows.find(row => row.assetId !== character.canonicalAssetId && !stale.has(row.assetId) && row.approved && (row.role === 'sheet' || row.role === 'angle'));
  if (supporting) {
    seen.add(supporting.assetId);
    roles.push({
      assetId: supporting.assetId, role: supporting.role,
      description: supporting.role === 'sheet'
        ? 'Secondary identity reference for body proportions and wardrobe continuity. The canonical close-up remains the stronger facial identity reference; do not blend faces.'
        : 'Secondary approved face-angle reference for geometry from another view. Preserve the canonical face if any feature conflicts.',
    });
  }
  const add = (assetId: string, role: string, description: string): void => {
    if (seen.has(assetId)) {
      warnings.push(`Repeated asset ${assetId} retained only at its first reference position.`);
      return;
    }
    if (stale.has(assetId)) return;
    const row = rowByAsset.get(assetId);
    if (row && !row.approved) {
      dropped.push(assetId);
      warnings.push(`Excluded unapproved character reference ${assetId}; adding it to a shot or product list cannot bypass approval.`);
      return;
    }
    if (row && row.role !== 'scene') {
      dropped.push(assetId);
      warnings.push(`Excluded extra identity reference ${assetId}; only the canonical and first approved current sheet or angle define identity.`);
      return;
    }
    seen.add(assetId);
    roles.push({ assetId, role, description });
  };
  const scenes: string[] = [];
  for (const assetId of productAssetIds) {
    if (rowByAsset.get(assetId)?.role === 'scene') {
      scenes.push(assetId);
      warnings.push(`Asset ${assetId} is a scene reference, so it cannot define the product and is moved to the end.`);
    } else add(assetId, 'product', 'Product-only reference. Match visible packaging, shape, material and label placement; do not use any depicted person as an identity source. Do not invent unreadable label text.');
  }
  for (const assetId of extraAssetIds) {
    if (rowByAsset.get(assetId)?.role === 'scene') scenes.push(assetId);
    else add(assetId, 'extra', 'Composition, prop or action reference only. Do not copy another person\'s face, change the canonical identity, or redefine the requested wardrobe.');
  }
  for (const assetId of scenes) {
    add(assetId, 'scene', 'Empty scene plate only. Use background layout, perspective and light direction. Do not import any person, face or wardrobe from this plate; keep identity and clothing controlled by the earlier references and shot direction.');
  }
  if (roles.some(role => role.role === 'scene')) warnings.push('Scene plates must be empty backgrounds. Human review must confirm the supplied plate does not introduce another person or wardrobe.');
  return { roles, dropped, warnings };
}
