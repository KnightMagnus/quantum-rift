import type { PlayerData } from './game.ts';
import type { Entity, Space } from './space.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { STORY_SHIP } from '../shared/story.ts';
import { loadoutValue, makeLoadout, type GameAssets, type ShipLoadout } from '../shared/rules.ts';

/** Retire legacy rewards without deleting cargo, officers, fittings records or hull value. */
export function migrateLegacyFlagships(assets: GameAssets, player: PlayerData): boolean {
  let changed = false;
  const replace = (ship: ShipLoadout) => {
    if (Number(ship.hull) !== STORY_SHIP) return ship;
    const refund = Math.max(0, loadoutValue(assets, ship) * 2);
    (player.story.retiredFlagships ??= []).push({ ship: structuredClone(ship), refund });
    player.credits += refund;
    // The liner exceeds the old hull’s hold and cabins; compensation funds a chosen combat ship.
    const replacement = makeLoadout(assets, 783, ship.name);
    replacement.uid = ship.uid;
    for (const identifier of [577, 578, 579, 9020, 9021])
      if (ship.outfits[identifier]) replacement.outfits[identifier] = ship.outfits[identifier];
    changed = true;
    return replacement;
  };
  player.ship = replace(player.ship);
  for (const stored of player.dock || []) stored.ship = replace(stored.ship);
  if (changed) {
    player.fuel = undefined;
    player.story.retiredFlagshipNotice = true;
  }
  return changed;
}

/** Hull identity, not its current AI order, owns the capital defender’s travel restriction. */
export function isQuevariDefender(entity: Pick<Entity, 'hull' | 'player'>): boolean {
  return Number(entity.hull) === STORY_SHIP && !entity.player;
}

/** Hails and generic NPC orders cannot turn the defender into departing traffic. */
export function keepQuevariPatrol(entity: Entity): void {
  if (!isQuevariDefender(entity)) return;
  if (entity.ai !== 'patrol') {
    entity.ai = 'patrol';
    entity.dest = null;
  }
  entity.owner = null;
  entity.noDisable = true;
  entity.life = Infinity;
}

/** A single local patrol wakes after any captain completes the awakening. */
export function ensureQuevariDefender(space: Space): void {
  if (space.id !== STELLARS.inalumen.system) return;
  if (
    !space.game.db.world.quevariDefenderAwake ||
    space.game.db.world.quevariDefenderDestroyed ||
    [...space.ships.values()].some((ship) => ship.hull === STORY_SHIP)
  )
    return;
  const port = STELLARS.inalumen;
  const defender = space.makeShip({
    hull: STORY_SHIP,
    name: "Ina Que'var",
    faction: 'quevari',
    ai: 'patrol',
    x: port.x + 650,
    y: port.y,
  });
  // Ordinary faction targeting defends the capital. Never retreat or age into a jump-out.
  keepQuevariPatrol(defender);
}
