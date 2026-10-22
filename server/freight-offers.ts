import type { StellarBody, StarSystem, RawStellarBody } from '../shared/galaxy.ts';
import type { Mission } from './game.ts';

import { xorshift32, fnv1a } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { SYSTEMS, SYS as systemsById, FACTIONS, START, COMMODITIES } from '../shared/galaxy.ts';
import { route } from '../shared/rules.ts';

/** @import { StellarBody } from '../shared/galaxy.ts' */
/** @import { Mission } from './game.ts' */

// Stable public board slots, independent of a captain's ship, money or combat rank.
// Each band gives an existing class of hauler useful work without hiding smaller jobs.
export const FREIGHT_BANDS = [
  [30, 60],
  [70, 120],
  [140, 300],
  [350, 450],
  [900, 1800],
];

const lawful = (starSystem: StarSystem | undefined, danger: number) =>
  starSystem &&
  starSystem.danger <= danger &&
  !starSystem.farside &&
  !starSystem.arena &&
  !FACTIONS[starSystem.faction].region &&
  !FACTIONS[starSystem.faction].pirate &&
  starSystem.stellars.some(
    (rawStellarBody) =>
      rawStellarBody.svc!.includes('L') && !rawStellarBody.site && !rawStellarBody.outlaw,
  );

const galaxyGraph = new GalaxyGraph(systemsById);

function distances(origin: string, allowed: Set<string>, limit: number) {
  return new Map(galaxyGraph.walk(origin, { allowed, maxDepth: limit }));
}

const quiet = new Set(
  SYSTEMS.filter((starSystem) => lawful(starSystem, 1)).map((starSystem) => starSystem.id),
);
// "Inner" means the low-danger, lawful neighbourhood within two quiet jumps of Concordia.
export const INNER_FREIGHT_SYSTEMS = new Set(distances(START.system, quiet, 2).keys());
const trade = new Set(
  SYSTEMS.filter((starSystem) => lawful(starSystem, 2)).map((starSystem) => starSystem.id),
);

function random(seed: string) {
  return xorshift32(fnv1a(seed));
}

/** Additional ordinary cargo contracts, using existing acceptance/hold/payout rules.
 * @param {StellarBody} port
 * @param {number} window Ten-minute board window.
 * @returns {Mission[]}
 */
export function freightOffers(port: StellarBody, window: number): Mission[] {
  if (!port.svc.includes('B') || port.site || port.outlaw || !trade.has(port.system)) return [];
  const radius = random(`${port.id}:${window}:freight`),
    missions: Mission[] = [];
  const destinations = (allowed: Set<string>, limit: number) =>
    [...distances(port.system, allowed, limit)].flatMap(([identifier, count]) => {
      if (!count) return [];
      // Match the actual Plot route, not only an alternative safe path through the graph.
      const path = route(systemsById, port.system, identifier);
      return path.length > 0 &&
        path.length <= limit &&
        path.every((sessionId) => allowed.has(sessionId))
        ? systemsById[identifier].stellars
            .filter(
              (stellarBody) =>
                stellarBody.svc!.includes('L') && !stellarBody.site && !stellarBody.outlaw,
            )
            .map((stellarBody) => ({ p: stellarBody, sys: identifier, jumps: path.length }))
        : [];
    });
  function appendEntry(
    slot: string,
    quantity: number,
    choices: Array<{ p: RawStellarBody; sys: string; jumps: number }>,
    bulk: boolean,
  ) {
    if (!choices.length) return;
    const {
        p: rawStellarBody,
        sys: starSystem,
        jumps,
      } = choices[Math.floor(radius() * choices.length)],
      commodity = COMMODITIES[Math.floor(radius() * COMMODITIES.length)];
    missions.push({
      id: `${port.id}-${window}-freight-${slot}`,
      type: 'cargo',
      title: `${bulk ? 'Freight' : 'Courier'}: ${quantity} t of ${commodity.name}`,
      sys: starSystem,
      dest: rawStellarBody.id,
      cid: commodity.id,
      qty: quantity,
      reward: Math.round((800 + jumps * 1100 + quantity * (60 + (bulk ? jumps * 20 : 0))) * 1.35),
      text: `The sender supplies the shipment. Carry ${quantity} tons of ${commodity.name.toLowerCase()} to ${rawStellarBody.name} in ${systemsById[starSystem].name} (${jumps} jump${jumps === 1 ? '' : 's'}). No purchase needed and no deadline.`,
    });
  }
  if (INNER_FREIGHT_SYSTEMS.has(port.system)) {
    const nearby = destinations(INNER_FREIGHT_SYSTEMS, 2);
    // Even a 5 t scout fits the first; both together fit the empty 15 t starter.
    appendEntry('courier-0', 3 + Math.floor(radius() * 3), nearby, false);
    appendEntry('courier-1', 6 + Math.floor(radius() * 5), nearby, false);
  }
  const routes = destinations(trade, 4);
  for (const [index, [minimum, maximum]] of FREIGHT_BANDS.entries())
    appendEntry(
      `bulk-${index}`,
      minimum + Math.floor(radius() * ((maximum - minimum) / 5 + 1)) * 5,
      routes,
      true,
    );
  return missions;
}
