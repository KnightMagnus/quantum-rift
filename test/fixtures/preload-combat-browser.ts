import type { Session } from '../../server/game.ts';
import type { Entity } from '../../server/space.ts';
// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  protection: boolean;
  initialVelocityX: number;
  initialVelocityY: number;
  initialAngle: number;
  targetFaction: string;
  namedTarget: boolean;
  movingTarget: boolean;
  telemetryPath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();

import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import { Space } from '../../server/space.ts';
import { RIVALS } from '../../shared/rivals.ts';
let active: Session | undefined,
  targetShip: (Entity & { _browserInert?: boolean }) | undefined,
  space: Space | undefined,
  shots = 0,
  previousWrite = 0;
const spawnPlayer = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (this: Game, session, ...args) {
  spawnPlayer.call(this, session, ...args);
  if (session.data.name !== 'Browser Assist') return;
  if (preloadConfig.protection && session.data.sys !== 'dimmer') {
    const prior = this.spaces[session.data.sys];
    this.dropEscorts(prior, session.ent!);
    prior.remove(session.ent!);
    prior.players--;
    session.ent = null;
    session.data.sys = 'dimmer';
    session.data.stellar = null;
    spawnPlayer.call(this, session, 0, 0, 0, 0);
  }
  active = session;
  space = this.spaces[session.data.sys];
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const entity of [...space.ships.values()]) if (!entity.player) space.remove(entity);
  session.ent!.x = 0;
  session.ent!.y = 0;
  session.ent!.vx = preloadConfig.initialVelocityX;
  session.ent!.vy = preloadConfig.initialVelocityY;
  session.ent!.a = preloadConfig.initialAngle;
  targetShip = space.makeShip({
    hull: 704,
    faction: preloadConfig.targetFaction,
    name: 'Idle Selected Browser Fixture',
    x: 0,
    y: -1100,
  });
  if (preloadConfig.namedTarget) {
    space.remove(targetShip);
    const rivalDefinition =
      RIVALS.find((result) => result.fac === 'quantum' && result.kind === 'trader') ||
      RIVALS.find((result) => result.fac === 'spacer' && result.kind === 'trader');
    for (const result of Object.values(this.db.world.rivals))
      result.sys = -999 as unknown as typeof result.sys;
    const result = this.db.world.rivals[rivalDefinition!.id];
    result.sys = space.id;
    result.hull = 704;
    result.down = 0;
    result.dockT = 0;
    this.rivalEnts.clear();
    this.features.rivals.rivalSync(space);
    targetShip = space.ships.get(this.rivalEnts.get(rivalDefinition!.id)!.id);
    targetShip!.x = 0;
    targetShip!.y = -1100;
    targetShip!.a = 0;
    targetShip!.vx = 0;
    targetShip!.vy = 0;
    targetShip!.dest = { x: 0, y: -10000 };
  } else if (preloadConfig.movingTarget) {
    targetShip.ai = 'trade';
    targetShip.dest = { x: 6000, y: -1100, out: true };
  } else targetShip._browserInert = true;
  if (preloadConfig.protection) {
    session.ent!.graceT = 0;
    targetShip!.faction = 'umbral';
    targetShip!.ai = 'raid';
    delete targetShip!._browserInert;
    targetShip!.dest = null;
    targetShip!.pers = 'reckless';
    const ally = space.makeShip({
      hull: 704,
      faction: 'umbral',
      ai: 'raid',
      name: 'Ambient Ally',
      x: 300,
      y: -1000,
    });
    ally.pers = 'reckless';
  }
  targetShip!.st.shield = 1000;
  targetShip!.shield = 1000;
  targetShip!.st.armor = 2000;
  targetShip!.armor = 2000;
  targetShip!.st.shieldRe = 0;
  targetShip!.st.armorRe = 0;
};
const runArtificialIntelligence = Reflect.get(Space.prototype, 'ai') as typeof Space.prototype.ai;
Space.prototype.ai = function (entity: Entity & { _browserInert?: boolean }) {
  if (entity._browserInert) {
    entity.inp = {};
    return;
  }
  return runArtificialIntelligence.call(this, entity);
};
const fire = Reflect.get(Space.prototype, 'fire') as typeof Space.prototype.fire;
Space.prototype.fire = function (entity, ...args) {
  if (active && entity === active.ent) shots++;
  return fire.call(this, entity, ...args);
};
const tick = Reflect.get(Game.prototype, 'tick') as typeof Game.prototype.tick;
Game.prototype.tick = function (...args) {
  const result = tick.apply(this, args);
  if (active?.ent && targetShip && Date.now() - previousWrite > 75) {
    previousWrite = Date.now();
    fileSystem.writeFileSync(
      preloadConfig.telemetryPath,
      JSON.stringify({
        time: Date.now(),
        sys: space!.id,
        newcomer: this.newcomer(active.data),
        ops: active.data.station.ops,
        state: active.ent.state,
        player: {
          hull: active.ent.hull,
          a: active.ent.a,
          vx: active.ent.vx,
          vy: active.ent.vy,
          inp: active.ent.inp,
          x: active.ent.x,
          y: active.ent.y,
          id: active.ent.id,
          target: active.ent.target?.id || 0,
        },
        foe: {
          id: targetShip.id,
          state: targetShip.state,
          hull: targetShip.hull,
          name: targetShip.name,
          rival: targetShip.rival,
          ai: targetShip.ai,
          x: targetShip.x,
          y: targetShip.y,
          shield: targetShip.shield,
          armor: targetShip.armor,
          target: targetShip.target?.id || 0,
          aggro: [...targetShip.aggro],
        },
        distance: Math.hypot(active.ent.x - targetShip.x, active.ent.y - targetShip.y),
        shots,
        combat: this.combatAssist.payload(active, space!),
        assistMissiles: active.combat?.missiles !== false,
        playerHealth: { shield: active.ent.shield, armor: active.ent.armor },
        retaliating: [...(active.retaliationVisit?.factions || [])],
        npcTargets: [...space!.ships.values()]
          .filter((entity) => !entity.player)
          .map((entity) => [entity.name, entity.target?.id || 0]),
        hostile: space!.isHostile(active.ent, targetShip),
        canHit: space!.canHit(active.ent, targetShip),
        reverseSpared: space!.spared(targetShip, active.ent),
      }),
    );
  }
  return result;
};
