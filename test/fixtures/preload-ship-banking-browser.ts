import type { Session } from '../../server/game.ts';
import type { Entity, Space } from '../../server/space.ts';
// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  telemetryPath: string;
  samplesPath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();

import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import { STELLARS } from '../../shared/galaxy.ts';
let active: Session | undefined,
  trader: Entity | undefined,
  space: Space | undefined,
  previousWrite = 0;
const spawnPlayer = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...args) {
  spawnPlayer.call(this, session, ...args);
  if (session.data.name !== 'Banking Observer') return;
  active = session;
  space = this.spaces[session.data.sys];
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const entity of [...space.ships.values()]) if (!entity.player) space.remove(entity);
  const port = STELLARS.qstation,
    horizontalPosition = port.x - 500,
    verticalPosition = port.y + 450;
  session.ent!.x = horizontalPosition + 120;
  session.ent!.y = verticalPosition + 80;
  session.ent!.vx = 0;
  session.ent!.vy = 0;
  trader = space.makeShip({
    hull: 704,
    faction: 'quantum',
    name: 'Banking Trader Fixture',
    ai: 'trade',
    x: horizontalPosition,
    y: verticalPosition,
    a: Math.atan2(port.x - horizontalPosition, -(port.y - verticalPosition)) + Math.PI,
  });
  trader.dest = port;
};
const tick = Reflect.get(Game.prototype, 'tick') as typeof Game.prototype.tick;
Game.prototype.tick = function (...args) {
  const result = tick.apply(this, args);
  if (active?.ent && trader && Date.now() - previousWrite > 40) {
    previousWrite = Date.now();
    const sample = {
      time: Date.now(),
      id: trader.id,
      angle: trader.a,
      x: trader.x,
      y: trader.y,
      turn: trader.inp.turn || 0,
      ai: trader.ai,
      dead: trader.dead,
      target: trader.target?.id || 0,
    };
    fileSystem.writeFileSync(preloadConfig.telemetryPath, JSON.stringify(sample));
    fileSystem.appendFileSync(
      preloadConfig.samplesPath,
      JSON.stringify(sample) + String.fromCharCode(10),
    );
  }
  return result;
};
