import { allOutfits, type GameAssets, type OutfitAsset } from '../shared/rules.ts';

/** A catalog location and the authoring error found there. */
export type ContentDiagnostic = {
  /** Catalog field or derived artwork reference to correct. */
  path: string;
  /** Expected value or missing reference. */
  message: string;
};

/** Validate composed ship content without changing it or creating game state. */
export function validateShipContent(
  assets: GameAssets,
  assetExists: (relativePath: string) => boolean,
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const weaponOutfits = new Map<number, OutfitAsset>();
  for (const outfit of Object.values(allOutfits(assets))) {
    const weaponId = outfit.eff?.weapon;
    if (weaponId && !weaponOutfits.has(weaponId)) weaponOutfits.set(weaponId, outfit);
  }
  const report = (path: string, message: string) => diagnostics.push({ path, message });
  const checkArtwork = (path: string, relativePath: string) => {
    if (!/^ships\/[a-zA-Z0-9_-]+\.(png|webp)$/.test(relativePath))
      report(path, 'expected a local ships/*.png or ships/*.webp path');
    else if (!assetExists(relativePath)) report(path, `missing client/assets/${relativePath}`);
  };
  for (const [key, hull] of Object.entries(assets.ships)) {
    const path = `ships[${key}]`;
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
