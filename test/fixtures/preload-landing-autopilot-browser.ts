import type { Session } from '../../server/game.ts';
import type { RawStellarBody } from '../../shared/galaxy.ts';
// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  cases: { name: string; port: string; x: number; y: number; vx: number; vy: number; a: number }[];
  tracePath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();

import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import { STELLARS } from '../../shared/galaxy.ts';
const cases = preloadConfig.cases,
  active = new Map<string, { s: Session; p: RawStellarBody; last: number }>();
const write = (record: Record<string, unknown>) =>
  fileSystem.appendFileSync(
    preloadConfig.tracePath,
    JSON.stringify({ ...record, time: Date.now() }) + '\n',
  );
const spawnPlayer = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...args) {
  spawnPlayer.call(this, session, ...args);
  const landingScenario2 = cases.find(
    (landingScenario) => landingScenario.name === session.data.name,
  );
  if (!landingScenario2) return;
  const player = STELLARS[landingScenario2.port],
    entity = session.ent;
  Object.assign(entity!, {
    x: player.x + landingScenario2.x,
    y: player.y + landingScenario2.y,
    vx: landingScenario2.vx,
    vy: landingScenario2.vy,
    a: landingScenario2.a,
  });
  const space = this.spaces[session.data.sys];
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const other of [...space.ships.values()]) if (!other.player) space.remove(other);
  active.set(session.data.name, { s: session, p: player, last: 0 });
  write({
    kind: 'spawn',
    name: session.data.name,
    hull: entity!.hull,
    port: player.id,
    r: player.r,
  });
};
const land = Reflect.get(Game.prototype, 'land') as typeof Game.prototype.land;
Game.prototype.land = function (session, identifier) {
  const entity = session.ent,
    player = STELLARS[identifier];
  if (entity)
    write({
      kind: 'request',
      name: session.data.name,
      port: identifier,
      distance: Math.hypot(entity.x - player.x, entity.y - player.y),
      speed: Math.hypot(entity.vx, entity.vy),
      a: entity.a,
    });
  const result = land.call(this, session, identifier);
  write({ kind: 'result', name: session.data.name, landed: !!session.data.stellar });
  return result;
};
const tick = Reflect.get(Game.prototype, 'tick') as typeof Game.prototype.tick;
Game.prototype.tick = function (...args) {
  const result = tick.apply(this, args);
  for (const [name, activePilot] of active) {
    const entity = activePilot.s.ent;
    if (!entity) continue;
    const currentTime = Date.now();
    if (currentTime - activePilot.last < 30) continue;
    activePilot.last = currentTime;
    write({
      kind: 'tick',
      name,
      distance: Math.hypot(entity.x - activePilot.p.x, entity.y - activePilot.p.y),
      speed: Math.hypot(entity.vx, entity.vy),
      x: entity.x,
      y: entity.y,
      vx: entity.vx,
      vy: entity.vy,
      a: entity.a,
      inp: entity.inp,
      fuel: entity.fuel,
    });
  }
  return result;
};
