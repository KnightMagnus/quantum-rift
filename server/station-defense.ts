import type { Space, Entity } from './space.ts';
import { FACTIONS } from '../shared/galaxy.ts';
import { angDiff, DT } from '../shared/rules.ts';
import {
  STATION_DEFENSE_HULL,
  STATION_DEFENSE_RADIUS,
  STATION_DEFENSE_REBUILD,
  stationPlatformCount,
} from '../shared/station-defense.ts';

/** Runtime berth identity; platform health is ordinary live entity state. */
interface DefenseBerth {
  /** Current live ship, or null while rebuilding. */
  id: number | null;
  /** Simulation time at which a destroyed platform can be replaced. */
  readyAt: number;
}
/** Runtime roster for one claimed site. */
interface DefenseRoster {
  /** Canonical saved owner, used to retire platforms after a claim changes. */
  owner: string;
  /** Stable orbital berths, including temporarily destroyed platforms. */
  berths: DefenseBerth[];
}
const rosters = new WeakMap<Space, Map<string, DefenseRoster>>();

/** Create defenses only in already-awake systems; abandoned hulls have none. */
export function syncStationDefenses(space: Space): void {
  let sites = rosters.get(space);
  if (!sites) rosters.set(space, (sites = new Map()));
  const active = new Set<string>();
  for (const site of space.sys.stellars) {
    if (!site.site) continue;
    const owner = space.game.siteOwner(site.id);
    if (
      !owner ||
      !owner.station.claimed ||
      owner.station.site !== site.id ||
      !(owner.station.ops >= 1)
    )
      continue;
    active.add(site.id);
    const ownerKey = space.game.db.key(owner.name);
    let roster = sites.get(site.id);
    if (roster && roster.owner !== ownerKey) {
      for (const berth of roster.berths) {
        const entity = berth.id === null ? null : space.ships.get(berth.id);
        if (entity) space.remove(entity, 'jump');
      }
      sites.delete(site.id);
      roster = undefined;
    }
    if (!roster) sites.set(site.id, (roster = { owner: ownerKey, berths: [] }));
    const count = stationPlatformCount(owner.station.defense);
    while (roster.berths.length > count) {
      const berth = roster.berths.pop()!;
      const entity = berth.id === null ? null : space.ships.get(berth.id);
      if (entity) space.remove(entity, 'jump');
    }
    while (roster.berths.length < count) roster.berths.push({ id: null, readyAt: 0 });
    roster.berths.forEach((berth, slot) => {
      if (berth.id !== null && !space.ships.has(berth.id)) {
        berth.id = null;
        berth.readyAt = space.t + STATION_DEFENSE_REBUILD;
      }
      const angle = (slot * Math.PI) / 3;
      const orbit = Math.max(220, site.r + 150);
      const home = { x: site.x + Math.sin(angle) * orbit, y: site.y - Math.cos(angle) * orbit };
      if (berth.id !== null) {
        space.ships.get(berth.id)!.home = home;
        return;
      }
      if (space.t < berth.readyAt) return;
      const entity = space.makeShip({
        hull: STATION_DEFENSE_HULL,
        faction: 'quantum',
        x: home.x,
        y: home.y,
        a: angle,
        ai: 'guard',
        name: 'Triad Sentinel',
        bonus: { armorPct: 150, shieldPct: 150, damagePct: 60 },
      });
      entity.home = home;
      entity.life = 1e9;
      entity.noDisable = true;
      entity.platform = true;
      entity.stationDefense = { site: site.id, owner: ownerKey };
      berth.id = entity.id;
    });
  }
  for (const [site, roster] of sites)
    if (!active.has(site)) {
      for (const berth of roster.berths) {
        const entity = berth.id === null ? null : space.ships.get(berth.id);
        if (entity) space.remove(entity, 'jump');
      }
      sites.delete(site);
    }
}

/** Station property never initiates PvP; NPC hostility follows its saved owner. */
export function stationDefenseHostility(space: Space, left: Entity, right: Entity): boolean | null {
  const platform = left.stationDefense ? left : right.stationDefense ? right : null;
  if (!platform) return null;
  const other = platform === left ? right : left;
  if (other.stationDefense || space.root(other).player) return false;
  const owner = space.game.siteOwner(platform.stationDefense!.site);
  if (
    !owner ||
    !owner.station.claimed ||
    !(owner.station.ops >= 1) ||
    owner.station.site !== platform.stationDefense!.site ||
    space.game.db.key(owner.name) !== platform.stationDefense!.owner
  )
    return false;
  const captain = [...space.ships.values()].find((entity) => entity.player?.s.data === owner);
  if (captain) return space.isHostile(captain, other);
  if (other.story || other.miningEncounter || other.mission || other.industrialRoot) return false;
  if (platform.aggro.has(other.id) || other.aggro.has(platform.id)) return true;
  const faction = FACTIONS[space.root(other).faction];
  const reputation = owner.rep[space.root(other).faction] || 0;
  return faction?.alwaysHostile || (faction?.pirate ? reputation < 30 : reputation <= -30);
}

/** Anchored platforms track and fire at hostiles without chasing them away from home. */
export function steerStationDefense(space: Space, entity: Entity): void {
  entity.inp = {};
  entity.fireAt = null;
  const previousTarget = entity.target;
  entity.target = null;
  entity.vx = entity.vy = 0;
  if (entity.home) {
    entity.x = entity.home.x;
    entity.y = entity.home.y;
  }
  const site = space.sys.stellars.find((site) => site.id === entity.stationDefense!.site);
  if (!site) return;
  let nearest = Infinity;
  const candidates =
    previousTarget && space.ships.get(previousTarget.id) === previousTarget
      ? [previousTarget, ...space.ships.values()]
      : space.ships.values();
  for (const target of candidates) {
    if (
      target === entity ||
      target.dead ||
      target.disabled ||
      target.state !== 'fly' ||
      Math.hypot(target.x - site.x, target.y - site.y) > STATION_DEFENSE_RADIUS ||
      !space.isHostile(entity, target) ||
      !space.canAcquire(entity, target)
    )
      continue;
    const distance = Math.hypot(target.x - entity.x, target.y - entity.y);
    if (distance < nearest) {
      nearest = distance;
      entity.target = target;
      if (target === previousTarget) break;
    }
  }
  if (!entity.target) return;
  const offset = angDiff(
    Math.atan2(entity.target.x - entity.x, -(entity.target.y - entity.y)),
    entity.a,
  );
  entity.inp.turn =
    Math.abs(offset) < 0.002 ? 0 : Math.max(-1, Math.min(1, offset / (entity.st.turn * DT)));
  entity.fireAt = entity.target;
}
