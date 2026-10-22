// Isolated production-runtime instrumentation used only by its owning regression test.
import { Game } from '../../server/game.ts';
const spawn = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...args) {
  spawn.call(this, session, ...args);
  if (!session.data.name.startsWith('Radio ')) return;
  const space = this.spaces[session.data.sys];
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const entity of [...space.ships.values()])
    if (!entity.player && !entity.owner) space.remove(entity);
  space.spawnT = 1e9;
  Object.assign(session.ent!, { x: 20000, y: 20000, vx: 0, vy: 0, fuel: 1000 });
};
