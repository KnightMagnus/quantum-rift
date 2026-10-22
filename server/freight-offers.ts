import type { StellarBody, StarSystem, RawStellarBody } from '../shared/galaxy.ts';
import type { Mission } from './game.ts';

import { xorshift32, fnv1a } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { SYSTEMS, SYS, FACTIONS, START, COMMODITIES } from '../shared/galaxy.ts';
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

const lawful = (s: StarSystem | undefined, danger: number) =>
  s &&
  s.danger <= danger &&
  !s.farside &&
  !s.arena &&
  !FACTIONS[s.faction].region &&
  !FACTIONS[s.faction].pirate &&
  s.stellars.some((p) => p.svc!.includes('L') && !p.site && !p.outlaw);

const galaxyGraph = new GalaxyGraph(SYS);

function distances(origin: string, allowed: Set<string>, limit: number) {
  return new Map(galaxyGraph.walk(origin, { allowed, maxDepth: limit }));
}

const quiet = new Set(SYSTEMS.filter((s) => lawful(s, 1)).map((s) => s.id));
// "Inner" means the low-danger, lawful neighbourhood within two quiet jumps of Concordia.
export const INNER_FREIGHT_SYSTEMS = new Set(distances(START.system, quiet, 2).keys());
const trade = new Set(SYSTEMS.filter((s) => lawful(s, 2)).map((s) => s.id));

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
  const r = random(`${port.id}:${window}:freight`),
    out: Mission[] = [];
  const destinations = (allowed: Set<string>, limit: number) =>
    [...distances(port.system, allowed, limit)].flatMap(([id, n]) => {
      if (!n) return [];
      // Match the actual Plot route, not only an alternative safe path through the graph.
      const path = route(SYS, port.system, id);
      return path.length > 0 && path.length <= limit && path.every((sid) => allowed.has(sid))
        ? SYS[id].stellars
            .filter(
              (stellarBody) =>
                stellarBody.svc!.includes('L') && !stellarBody.site && !stellarBody.outlaw,
            )
            .map((stellarBody) => ({ p: stellarBody, sys: id, jumps: path.length }))
        : [];
    });
  function add(
    slot: string,
    qty: number,
    choices: Array<{ p: RawStellarBody; sys: string; jumps: number }>,
    bulk: boolean,
  ) {
    if (!choices.length) return;
    const { p, sys, jumps } = choices[Math.floor(r() * choices.length)],
      commodity = COMMODITIES[Math.floor(r() * COMMODITIES.length)];
    out.push({
      id: `${port.id}-${window}-freight-${slot}`,
      type: 'cargo',
      title: `${bulk ? 'Freight' : 'Courier'}: ${qty} t of ${commodity.name}`,
      sys,
      dest: p.id,
      cid: commodity.id,
      qty,
      reward: Math.round((800 + jumps * 1100 + qty * (60 + (bulk ? jumps * 20 : 0))) * 1.35),
      text: `The sender supplies the shipment. Carry ${qty} tons of ${commodity.name.toLowerCase()} to ${p.name} in ${SYS[sys].name} (${jumps} jump${jumps === 1 ? '' : 's'}). No purchase needed and no deadline.`,
    });
  }
  if (INNER_FREIGHT_SYSTEMS.has(port.system)) {
    const nearby = destinations(INNER_FREIGHT_SYSTEMS, 2);
    // Even a 5 t scout fits the first; both together fit the empty 15 t starter.
    add('courier-0', 3 + Math.floor(r() * 3), nearby, false);
    add('courier-1', 6 + Math.floor(r() * 5), nearby, false);
  }
  const routes = destinations(trade, 4);
  for (const [i, [min, max]] of FREIGHT_BANDS.entries())
    add(`bulk-${i}`, min + Math.floor(r() * ((max - min) / 5 + 1)) * 5, routes, true);
  return out;
}
