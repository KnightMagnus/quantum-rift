import worlds from './landscape-worlds.json' with { type: 'json' };
import type { StellarBody } from './galaxy.ts';
import { planetType } from './planet-type.ts';

/** Stable scene families for newly introduced worlds; existing identities are explicit. */
const families: Record<string, string[]> = {
  terran: ['terran_wild1', 'terran_wild2', 'terran_city1', 'terran_city2'],
  city: ['city1', 'city2', 'city_harbor', 'city_terraces'],
  jungle: ['jungle1', 'jungle2', 'jungle_delta', 'jungle_highlands'],
  ocean: ['ocean1', 'ocean2', 'ocean_atolls', 'ocean_fjords'],
  desert: ['desert1', 'desert2', 'desert3', 'desert_salt'],
  ice: ['ice1', 'ice2', 'ice_fjords', 'ice_crags'],
  lava: ['lava1', 'lava2', 'lava_caldera', 'lava_obsidian'],
  barren: ['moon1', 'moon2', 'moon3', 'moon_chasm'],
  gas: ['gas1', 'gas2', 'gas_violet_clouds', 'gas_amber_storm'],
  toxic: ['toxic1', 'toxic2', 'toxic_marsh', 'toxic_spires'],
  crystal: ['crystal1', 'crystal2', 'crystal_basin', 'crystal_towers'],
};
/** Convert authoritative colony levels into the three settlement illustrations. */
export function colonyStage(level: unknown): number {
  return typeof level === 'number' && Number.isInteger(level) && level >= 1 && level <= 5
    ? level === 1
      ? 1
      : level < 4
        ? 2
        : 3
    : 0;
}
/** Select an immutable planetary scene; stations keep their separate live renderer. */
export function landscapeScene(body: StellarBody, level: unknown = 0): string {
  if (body.kind === 'station' || body.hub || body.site) return '';
  const known = worlds as Record<string, string>;
  let key = known[body.id];
  if (!key) {
    let hash = 2166136261;
    for (const character of body.id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    let biome: string = planetType(body);
    const description = `${body.desc || ''} ${body.name}`.toLowerCase();
    if (biome === 'terran' && /(city|capital|sprawl|metropol|towers|arcolog)/.test(description))
      biome = 'city';
    else if (biome === 'terran' && /(jungle|forest|garden)/.test(description)) biome = 'jungle';
    const family = families[biome] || families.barren;
    key = 'l_' + family[(hash >>> 0) % family.length];
  }
  const stage = colonyStage(level);
  return key + (stage ? `_col${stage}` : '');
}
