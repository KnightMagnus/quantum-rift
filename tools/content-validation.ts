import { ARMADA_HULLS, MK2_OF, MK3_OF } from '../shared/galaxy.ts';
import { INDEX_FLEET_HULLS } from '../shared/index-fleet.ts';
import { INDEX_HULLS } from '../shared/index.ts';
import { NHAL_HULLS } from '../shared/nhal.ts';
import { allOutfits, type GameAssets, type OutfitAsset } from '../shared/rules.ts';
import { SHIPS23 } from '../shared/ships23.ts';
import { SPECIALISTS } from '../shared/specialty.ts';

/** A catalog location and the authoring error found there. */
export type ContentDiagnostic = {
  /** Repository file that authors the entry, when known. */
  source?: string;
  /** Catalog field or derived artwork reference to correct. */
  path: string;
  /** Expected value or missing reference. */
  message: string;
};

/** A hull id that a refit or Armada table requires to exist in the composed catalog. */
export type HullReference = {
  /** Table location, such as `MK2_OF[750]`. */
  path: string;
  /** Referenced hull id. */
  hull: number;
};

/**
 * Map each hull id to the file that authors it. `augmentAssets` keeps the first definition
 * of an id, so `shared/assets.json` wins, then the authored hull tables in merge order.
 */
export function hullSources(rawShipIds: Iterable<string>): Map<string, string> {
  const sources = new Map<string, string>();
  for (const identifier of rawShipIds) sources.set(identifier, 'shared/assets.json');
  const authoredHulls: [string, { id: number | string }[]][] = [
    ['shared/specialty.ts', SPECIALISTS],
    ['shared/ships23.ts', SHIPS23],
    ['shared/index.ts', INDEX_HULLS],
    ['shared/index-fleet.ts', INDEX_FLEET_HULLS],
    ['shared/nhal.ts', NHAL_HULLS],
  ];
  for (const [source, hulls] of authoredHulls)
    for (const hull of hulls)
      if (!sources.has(String(hull.id))) sources.set(String(hull.id), source);
  return sources;
}

/** Hull ids named by the refit (`MK2_OF`, `MK3_OF`) and `ARMADA_HULLS` tables. */
export function refitHullReferences(): HullReference[] {
  const references: HullReference[] = [];
  for (const [table, refits] of [
    ['MK2_OF', MK2_OF],
    ['MK3_OF', MK3_OF],
  ] as const)
    for (const [base, refit] of Object.entries(refits))
      references.push(
        { path: `${table}[${base}]`, hull: Number(base) },
        { path: `${table}[${base}]`, hull: refit },
      );
  ARMADA_HULLS.forEach((hull, index) => references.push({ path: `ARMADA_HULLS[${index}]`, hull }));
  return references;
}

/** Report refit/Armada table entries and weapon outfits that name missing hulls or weapons. */
export function validateContentReferences(
  assets: GameAssets,
  references: HullReference[],
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  for (const reference of references)
    if (!assets.ships[reference.hull])
      diagnostics.push({
        source: 'shared/galaxy.ts',
        path: reference.path,
        message: `unknown hull id ${reference.hull}`,
      });
  for (const [key, outfit] of Object.entries(allOutfits(assets))) {
    const weaponId = outfit.eff?.weapon;
    if (weaponId !== undefined && !assets.weapons[weaponId])
      diagnostics.push({
        source: assets.outfits[key] ? 'shared/assets.json' : 'shared/galaxy.ts',
        path: `outfits[${key}].eff.weapon`,
        message: `unknown weapon id ${weaponId}`,
      });
  }
  return diagnostics;
}

/** Validate composed ship content without changing it or creating game state. */
export function validateShipContent(
  assets: GameAssets,
  assetExists: (relativePath: string) => boolean,
  sources: ReadonlyMap<string, string> = new Map(),
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const weaponOutfits = new Map<number, OutfitAsset>();
  for (const outfit of Object.values(allOutfits(assets))) {
    const weaponId = outfit.eff?.weapon;
    if (weaponId && !weaponOutfits.has(weaponId)) weaponOutfits.set(weaponId, outfit);
  }
  let source: string | undefined;
  const report = (path: string, message: string) =>
    diagnostics.push(source ? { source, path, message } : { path, message });
  const checkArtwork = (path: string, relativePath: string) => {
    if (!/^ships\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(relativePath))
      report(path, 'expected a local ships/*.png or ships/*.webp path');
    else if (!assetExists(relativePath)) report(path, `missing client/assets/${relativePath}`);
  };
  for (const [key, hull] of Object.entries(assets.ships)) {
    const path = `ships[${key}]`;
    source = sources.get(key);
    if (!Number.isSafeInteger(hull.id) || hull.id <= 0 || String(hull.id) !== key)
      report(`${path}.id`, 'expected a positive integer matching the catalog key');
    for (const field of [
      'cost',
      'mass',
      'space',
      'cargo',
      'fuel',
      'size',
      'guns',
      'turrets',
    ] as const)
      if (!Number.isFinite(hull[field]) || hull[field] < 0)
        report(`${path}.${field}`, 'expected a finite nonnegative number');
    for (const field of ['guns', 'turrets'] as const)
      if (Number.isFinite(hull[field]) && !Number.isInteger(hull[field]))
        report(`${path}.${field}`, 'expected an integer mount count');
    let guns = 0;
    let turrets = 0;
    for (const [index, weapon] of hull.weapons.entries()) {
      const weaponPath = `${path}.weapons[${index}]`;
      const [identifier, count, ammo] = weapon;
      if (weapon.length < 2 || weapon.length > 3)
        report(weaponPath, 'expected [weaponId, count, optionalAmmo]');
      if (!Number.isSafeInteger(identifier) || !assets.weapons[identifier])
        report(`${weaponPath}[0]`, `unknown weapon id ${identifier}`);
      if (!Number.isSafeInteger(count) || count <= 0)
        report(`${weaponPath}[1]`, 'expected a positive integer weapon count');
      if (ammo !== undefined && (!Number.isSafeInteger(ammo) || ammo < 0))
        report(`${weaponPath}[2]`, 'expected a nonnegative integer ammo count');
      const outfit = weaponOutfits.get(identifier);
      // Fixed weapons have no outfitter mount cost; match makeLoadout/shipStats policy.
      if (outfit && Number.isSafeInteger(count) && count > 0) {
        if (outfit.turret) turrets += count;
        else guns += count;
      }
    }
    // Existing NPC-only loadouts may deliberately exceed player fitting limits.
    if (!hull.npcOnly) {
      if (Number.isSafeInteger(hull.guns) && hull.guns >= 0 && guns > hull.guns)
        report(`${path}.weapons`, `stock guns ${guns} exceed mounts ${hull.guns}`);
      if (Number.isSafeInteger(hull.turrets) && hull.turrets >= 0 && turrets > hull.turrets)
        report(`${path}.weapons`, `stock turrets ${turrets} exceed mounts ${hull.turrets}`);
    }
    if (!hull.img) report(`${path}.img`, 'expected shipyard artwork');
    else checkArtwork(`${path}.img`, hull.img);
    const extension = hull.spr ? 'webp' : 'png';
    checkArtwork(`${path}.flightArtwork`, `ships/${hull.id}.${extension}`);
    if (hull.glow && (!hull.spr || hull.spr.glow))
      checkArtwork(`${path}.glowArtwork`, `ships/${hull.id}_glow.${extension}`);
  }
  return diagnostics;
}
