import type { GradeLots } from '../shared/cargo-contracts.ts';
import type {
  CargoLoot,
  CargoPlayer,
  CommandSession,
  FleetCommandsCapabilities,
} from './contracts.ts';
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
  fleetOrder(this: FleetCommandsCapabilities, session: CommandSession, options: string) {
    if (!ORDERS[options] || !session.ent) return;
    const entity = session.ent;
    entity.order = entity.order === options && options !== 'gather' ? 'gather' : options;
    entity.orderSeq = (entity.orderSeq || 0) + 1; // giving the same order again cancels it
    this.toast(session, entity.order === options ? ORDERS[options] : ORDERS.gather);
    this.send(session, { t: 'order', o: entity.order });
  },
  // throw cargo out of the hold: it floats free, and pirates chasing you may go for it instead

  jettison(
    this: FleetCommandsCapabilities,
    session: CommandSession,
    captainId: string,
    count: number,
    selection: GradeLots | 'common-first' = 'common-first',
  ) {
    const playerData = session.data,
      entity = session.ent;
    if (!entity || entity.state !== 'fly')
      return this.toast(session, 'You can only jettison cargo in space.');
    const have = playerData.cargo[captainId] || 0;
    count = Math.min(have, count > 0 ? count : have);
    if (!count) return;
    let take;
    try {
      take = planTake(playerData.cargo, playerData.cargoLots, captainId, count, selection);
    } catch {
      return this.toast(session, 'Those cargo grades are unavailable.');
    }
    applyTake(playerData.cargo, playerData.cargoLots, take);
    const remaining = { ...take.grades };
    const space = this.spaces[playerData.sys],
      commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === captainId);
    for (let index = 0, entryKey = Math.min(4, Math.ceil(count / 5)); index < entryKey; index++) {
      const part =
        Math.ceil(count / entryKey) -
        (index === entryKey - 1 ? Math.ceil(count / entryKey) * entryKey - count : 0);
      if (part <= 0) continue;
      const lots = splitLots(remaining, part);
      for (const rAW_GRADES of RAW_GRADES) remaining[rAW_GRADES] -= lots[rAW_GRADES];
      space.loot.push({
        id: space.nextLootId(),
        x: entity.x - Math.sin(entity.a) * 40 + (Math.random() - 0.5) * 40,
        y: entity.y + Math.cos(entity.a) * 40 + (Math.random() - 0.5) * 40,
        vx: entity.vx * 0.4 + (Math.random() - 0.5) * 40,
        vy: entity.vy * 0.4 + (Math.random() - 0.5) * 40,
        it: {
          cargo: captainId,
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
    for (const entity2 of space.ships.values())
      if (
        !entity2.player &&
        entity2.target === entity &&
        space.root(entity2).faction === 'hollow' &&
        Math.random() < 0.7
      ) {
        entity2.target = null;
        entity2.aggro.delete(entity.id);
        entity2.distractT = space.t + 20;
        entity2.dest = { x: entity.x, y: entity.y };
        lured++;
      }
    this.toast(
      session,
      `Jettisoned ${count} t of ${commodityDef ? commodityDef.name.toLowerCase() : captainId}. Own fleet pickup paused ${JETTISON_OWNER_GRACE_SECONDS}s.${lured ? ` ${lured} raider${lured > 1 ? 's' : ''} went for it.` : ''}`,
    );
    this.you(session);
  },
  // picking jettisoned (or anyone's) cargo back up

  lootCargo(this: FleetCommandsCapabilities, session: CommandSession, cargoLoot: CargoLoot) {
    const playerData = session.data,
      grace = cargoLoot.jettisonPickup;
    // All player/wing/drone pickup paths resolve to this captain authority.
    if (
      grace &&
      grace.owner === playerData.name &&
      grace.sys === playerData.sys &&
      this.spaces[playerData.sys]?.t < grace.until
    )
      return false;
    const stats2 = this.stats(playerData);
    if (!stats2) throw new TypeError('Cannot collect cargo without valid ship stats');
    const used = this.holdUsed(playerData),
      count = Math.min(cargoLoot.n, stats2.cargo - used);
    if (count <= 0) return false;
    const remaining =
      cargoLoot.lots === undefined
        ? commonLots(cargoLoot.cargo, cargoLoot.n).grades
        : cargoLoot.lots;
    const selected = splitLots(remaining, count);
    addLots(
      playerData.cargo,
      playerData.cargoLots,
      { cid: cargoLoot.cargo, qty: count, grades: selected },
      Math.max(0, stats2.cargo - used),
    );
    cargoLoot.lots = remaining;
    for (const rAW_GRADES of RAW_GRADES) remaining[rAW_GRADES] -= selected[rAW_GRADES];
    cargoLoot.n -= count;
    const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === cargoLoot.cargo);
    this.toast(session, `+${count} t ${commodityDef ? commodityDef.name : cargoLoot.cargo}`);
    this.you(session);
    return cargoLoot.n <= 0 ? true : false;
  },

  rankOf(playerData: CargoPlayer) {
    return combatRank((playerData.stats && playerData.stats.combat) || 0);
  },
};
