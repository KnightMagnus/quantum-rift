import type { GradeLots } from '../shared/cargo-contracts.ts';
import type {
  CargoLoot,
  CargoPlayer,
  CommandSession,
  FleetCommandsCapabilities,
} from './contracts.ts';

// @ts-check
import {
  RAW_GRADES,
  planTake,
  applyTake,
  addLots,
  commonLots,
  splitLots,
} from '../shared/cargo-lots.ts';
// fleet commands, jettisoning cargo, and the combat rating.
import { COMMODITIES } from '../shared/galaxy.ts';
import { combatRank } from '../shared/rivals.ts';

/** @import { GradeLots } from '../shared/cargo-contracts.ts' */
/** @import { CargoLoot, CargoPlayer, CommandSession, FleetCommandsCapabilities } from './contracts.ts' */

/** @type {Record<string, string>} */
const ORDERS: Record<string, string> = {
  gather: 'Escorts: form up on me.',
  attack: 'Escorts: attack my target.',
  hold: 'Escorts: hold position.',
  holdfire: 'Escorts: hold your fire.',
  loot: 'Escorts: collect the loot.',
};
// Simulation seconds before the dumping captain/fleet may scoop its own cargo again.
export const JETTISON_OWNER_GRACE_SECONDS = 5;
export const FleetCmdOperations = {
  /** @this {FleetCommandsCapabilities} @param {CommandSession} session @param {string} o */
  fleetOrder(this: FleetCommandsCapabilities, session: CommandSession, o: string) {
    if (!ORDERS[o] || !session.ent) return;
    const entity = session.ent;
    entity.order = entity.order === o && o !== 'gather' ? 'gather' : o;
    entity.orderSeq = (entity.orderSeq || 0) + 1; // giving the same order again cancels it
    this.toast(session, entity.order === o ? ORDERS[o] : ORDERS.gather);
    this.send(session, { t: 'order', o: entity.order });
  },
  // throw cargo out of the hold: it floats free, and pirates chasing you may go for it instead
  /** @this {FleetCommandsCapabilities} @param {CommandSession} session @param {string} cid @param {number} n @param {GradeLots|'common-first'} [selection] */
  jettison(
    this: FleetCommandsCapabilities,
    session: CommandSession,
    cid: string,
    n: number,
    selection: GradeLots | 'common-first' = 'common-first',
  ) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly')
      return this.toast(session, 'You can only jettison cargo in space.');
    const have = playerData.cargo[cid] || 0;
    n = Math.min(have, n > 0 ? n : have);
    if (!n) return;
    let take;
    try {
      take = planTake(playerData.cargo, playerData.cargoLots, cid, n, selection);
    } catch {
      return this.toast(session, 'Those cargo grades are unavailable.');
    }
    applyTake(playerData.cargo, playerData.cargoLots, take);
    const remaining = { ...take.grades };
    const space = this.spaces[playerData.sys],
      c = COMMODITIES.find((x) => x.id === cid);
    for (let i = 0, k = Math.min(4, Math.ceil(n / 5)); i < k; i++) {
      const part = Math.ceil(n / k) - (i === k - 1 ? Math.ceil(n / k) * k - n : 0);
      if (part <= 0) continue;
      const lots = splitLots(remaining, part);
      for (const g of RAW_GRADES) remaining[g] -= lots[g];
      space.loot.push({
        id: space.nextLootId(),
        x: entity.x - Math.sin(entity.a) * 40 + (Math.random() - 0.5) * 40,
        y: entity.y + Math.cos(entity.a) * 40 + (Math.random() - 0.5) * 40,
        vx: entity.vx * 0.4 + (Math.random() - 0.5) * 40,
        vy: entity.vy * 0.4 + (Math.random() - 0.5) * 40,
        it: {
          cargo: cid,
          n: part,
          lots,
          jettisonPickup: {
            owner: playerData.name,
            sys: playerData.sys,
            until: space.t + JETTISON_OWNER_GRACE_SECONDS,
          },
        },
        t: space.t,
        kind: 2,
      });
    }
    let lured = 0;
    for (const x of space.ships.values())
      if (
        !x.player &&
        x.target === entity &&
        space.root(x).faction === 'hollow' &&
        Math.random() < 0.7
      ) {
        x.target = null;
        x.aggro.delete(entity.id);
        x.distractT = space.t + 20;
        x.dest = { x: entity.x, y: entity.y };
        lured++;
      }
    this.toast(
      session,
      `Jettisoned ${n} t of ${c ? c.name.toLowerCase() : cid}. Own fleet pickup paused ${JETTISON_OWNER_GRACE_SECONDS}s.${lured ? ` ${lured} raider${lured > 1 ? 's' : ''} went for it.` : ''}`,
    );
    this.you(session);
  },
  // picking jettisoned (or anyone's) cargo back up
  /** @this {FleetCommandsCapabilities} @param {CommandSession} session @param {CargoLoot} it */
  lootCargo(this: FleetCommandsCapabilities, session: CommandSession, it: CargoLoot) {
    const playerData = session.data,
      grace = it.jettisonPickup;
    // All player/wing/drone pickup paths resolve to this captain authority.
    if (
      grace &&
      grace.owner === playerData.name &&
      grace.sys === playerData.sys &&
      this.spaces[playerData.sys]?.t < grace.until
    )
      return false;
    const st = this.stats(playerData);
    if (!st) throw new TypeError('Cannot collect cargo without valid ship stats');
    const used = this.holdUsed(playerData),
      n = Math.min(it.n, st.cargo - used);
    if (n <= 0) return false;
    const remaining = it.lots === undefined ? commonLots(it.cargo, it.n).grades : it.lots;
    const selected = splitLots(remaining, n);
    addLots(
      playerData.cargo,
      playerData.cargoLots,
      { cid: it.cargo, qty: n, grades: selected },
      Math.max(0, st.cargo - used),
    );
    it.lots = remaining;
    for (const g of RAW_GRADES) remaining[g] -= selected[g];
    it.n -= n;
    const c = COMMODITIES.find((x) => x.id === it.cargo);
    this.toast(session, `+${n} t ${c ? c.name : it.cargo}`);
    this.you(session);
    return it.n <= 0 ? true : false;
  },
  /** @param {CargoPlayer} playerData */
  rankOf(playerData: CargoPlayer) {
    return combatRank((playerData.stats && playerData.stats.combat) || 0);
  },
};
