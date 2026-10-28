// Everything one faction store lists: the shared goods, that faction's star chart and its
// three store-only outfits. Server purchases and the store screen read the same listings.
import { STORE_ITEMS, type FactionStoreItem } from './fronts.ts';
import { FACTIONS, SYS } from './galaxy.ts';
import { FACTION_STORE_OUTFITS } from './faction-outfits.ts';
import { chartSystems, starChartCredits } from './map-knowledge.ts';

/** Store id prefix for outfit listings, followed by the outfit id. */
export const STORE_OUTFIT_PREFIX = 'outfit-';
/** Store id of the faction star chart. */
export const STAR_CHART_ID = 'chart';

/** The faction's star chart listing. */
export function starChartListing(faction: string): FactionStoreItem {
  const systems = chartSystems(SYS, faction);
  return {
    id: STAR_CHART_ID,
    name: `${FACTIONS[faction]?.short || faction} star chart (${systems.length} systems)`,
    tokens: 4,
    credits: starChartCredits(systems.length),
    rep: 10,
    give: { chart: faction },
  };
}

/** Every listing in a faction's store, in display order. */
export function factionStoreListings(faction: string): FactionStoreItem[] {
  return [
    ...STORE_ITEMS,
    starChartListing(faction),
    ...FACTION_STORE_OUTFITS.filter((outfit) => outfit.faction === faction).map((outfit) => ({
      id: STORE_OUTFIT_PREFIX + outfit.id,
      name: outfit.name,
      tokens: outfit.tokens,
      credits: outfit.cost,
      rep: outfit.rep,
      give: { outfit: outfit.id },
    })),
  ];
}
