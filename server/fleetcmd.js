// @ts-check
import {
  RAW_GRADES,
  planTake,
  applyTake,
  addLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.js';
// 1.1: fleet commands (inspired by Endless Sky), jettisoning cargo, and the combat rating.
import { COMMODITIES } from '../shared/galaxy.js';
import { combatRank } from '../shared/rivals.js';

/** @type {Record<string, string>} */
const ORDERS = {
  gather: 'Escorts: form up on me.',
  attack: 'Escorts: attack my target.',
  hold: 'Escorts: hold position.',
  holdfire: 'Escorts: hold your fire.',
  loot: 'Escorts: collect the loot.',
};
export const FleetCmdOperations = {
  /** @this {import('./contracts.js').FleetCommandsCapabilities} @param {import('./contracts.js').CommandSession} s @param {string} o */
  fleetOrder(s, o) {
    if (!ORDERS[o] || !s.ent) return;
    const e = s.ent;
    e.order = e.order === o && o !== 'gather' ? 'gather' : o;
    e.orderSeq = (e.orderSeq || 0) + 1; // giving the same order again cancels it
    this.toast(s, e.order === o ? ORDERS[o] : ORDERS.gather);
    this.send(s, { t: 'order', o: e.order });
  },
  // throw cargo out of the hold: it floats free, and pirates chasing you may go for it instead
  /** @this {import('./contracts.js').FleetCommandsCapabilities} @param {import('./contracts.js').CommandSession} s @param {string} cid @param {number} n @param {import('../shared/cargo-contracts.js').GradeLots|'common-first'} [selection] */
  jettison(s, cid, n, selection = 'common-first') {
    const d = s.data,
      e = s.ent;
    if (!e || e.state !== 'fly') return this.toast(s, 'You can only jettison cargo in space.');
    const have = d.cargo[cid] || 0;
    n = Math.min(have, n > 0 ? n : have);
    if (!n) return;
    let take;
    try {
      take = planTake(d.cargo, d.cargoLots, cid, n, selection);
    } catch {
      return this.toast(s, 'Those cargo grades are unavailable.');
    }
    applyTake(d.cargo, d.cargoLots, take);
    const remaining = { ...take.grades };
    const sp = this.spaces[d.sys],
      c = COMMODITIES.find((x) => x.id === cid);
    for (let i = 0, k = Math.min(4, Math.ceil(n / 5)); i < k; i++) {
      const part = Math.ceil(n / k) - (i === k - 1 ? Math.ceil(n / k) * k - n : 0);
      if (part <= 0) continue;
      const lots = splitLots(remaining, part);
      for (const g of RAW_GRADES) remaining[g] -= lots[g];
      sp.loot.push({
        id: sp.nextLootId(),
        x: e.x - Math.sin(e.a) * 40 + (Math.random() - 0.5) * 40,
        y: e.y + Math.cos(e.a) * 40 + (Math.random() - 0.5) * 40,
        vx: e.vx * 0.4 + (Math.random() - 0.5) * 40,
        vy: e.vy * 0.4 + (Math.random() - 0.5) * 40,
        it: { cargo: cid, n: part, lots },
        t: sp.t,
        kind: 2,
      });
    }
    let lured = 0;
    for (const x of sp.ships.values())
      if (!x.player && x.target === e && sp.root(x).faction === 'hollow' && Math.random() < 0.7) {
        x.target = null;
        x.aggro.delete(e.id);
        x.distractT = sp.t + 20;
        x.dest = { x: e.x, y: e.y };
        lured++;
      }
    this.toast(
      s,
      `Jettisoned ${n} t of ${c ? c.name.toLowerCase() : cid}.${lured ? ` ${lured} raider${lured > 1 ? 's' : ''} went for it.` : ''}`,
    );
    this.you(s);
  },
  // picking jettisoned (or anyone's) cargo back up
  /** @this {import('./contracts.js').FleetCommandsCapabilities} @param {import('./contracts.js').CommandSession} s @param {import('./contracts.js').CargoLoot} it */
  lootCargo(s, it) {
    const d = s.data,
      st = this.stats(d);
    if (!st) throw new TypeError('Cannot collect cargo without valid ship stats');
    const used = this.holdUsed(d),
      n = Math.min(it.n, st.cargo - used);
    if (n <= 0) return false;
    const remaining = it.lots === undefined ? commonLots(it.cargo, it.n).grades : it.lots;
    const selected = splitLots(remaining, n);
    addLots(
      d.cargo,
      d.cargoLots,
      { cid: it.cargo, qty: n, grades: selected },
      Math.max(0, st.cargo - used),
    );
    it.lots = remaining;
    for (const g of RAW_GRADES) remaining[g] -= selected[g];
    it.n -= n;
    const c = COMMODITIES.find((x) => x.id === it.cargo);
    this.toast(s, `+${n} t ${c ? c.name : it.cargo}`);
    this.you(s);
    return it.n <= 0 ? true : false;
  },
  /** @param {import('./contracts.js').CargoPlayer} d */
  rankOf(d) {
    return combatRank((d.stats && d.stats.combat) || 0);
  },
};
