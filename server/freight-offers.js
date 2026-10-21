import { SYSTEMS, SYS, FACTIONS, START, COMMODITIES } from '../shared/galaxy.js';
import { route } from '../shared/rules.js';

// Stable public board slots, independent of a captain's ship, money or combat rank.
// Each band gives an existing class of hauler useful work without hiding smaller jobs.
export const FREIGHT_BANDS = [
  [30, 60],
  [70, 120],
  [140, 300],
  [350, 450],
  [900, 1800],
];

const lawful = (s, danger) =>
  s &&
  s.danger <= danger &&
  !s.farside &&
  !s.arena &&
  !FACTIONS[s.faction].region &&
  !FACTIONS[s.faction].pirate &&
  s.stellars.some((p) => p.svc.includes('L') && !p.site && !p.outlaw);

function distances(origin, allowed, limit) {
  const found = new Map([[origin, 0]]);
  for (const [id, n] of found) {
    if (n >= limit) continue;
    for (const next of SYS[id].links)
      if (allowed.has(next) && !found.has(next)) found.set(next, n + 1);
  }
  return found;
}

const quiet = new Set(SYSTEMS.filter((s) => lawful(s, 1)).map((s) => s.id));
// "Inner" means the low-danger, lawful neighbourhood within two quiet jumps of Concordia.
export const INNER_FREIGHT_SYSTEMS = new Set(distances(START.system, quiet, 2).keys());
const trade = new Set(SYSTEMS.filter((s) => lawful(s, 2)).map((s) => s.id));

function random(seed) {
  let n = 2166136261;
  for (const c of seed) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return () => {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return (n >>> 0) / 4294967296;
  };
}

/** Additional ordinary cargo contracts, using existing acceptance/hold/payout rules.
 * @param {import('../shared/galaxy.js').StellarBody} port
 * @param {number} window Ten-minute board window.
 * @returns {import('./game.js').Mission[]}
 */
export function freightOffers(port, window) {
  if (!port.svc.includes('B') || port.site || port.outlaw || !trade.has(port.system)) return [];
  const r = random(`${port.id}:${window}:freight`),
    out = [];
  const destinations = (allowed, limit) =>
    [...distances(port.system, allowed, limit)].flatMap(([id, n]) => {
      if (!n) return [];
      // Match the actual Plot route, not only an alternative safe path through the graph.
      const path = route(SYS, port.system, id);
      return path.length > 0 && path.length <= limit && path.every((sid) => allowed.has(sid))
        ? SYS[id].stellars
            .filter((p) => p.svc.includes('L') && !p.site && !p.outlaw)
            .map((p) => ({ p, sys: id, jumps: path.length }))
        : [];
    });
  function add(slot, qty, choices, bulk) {
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
