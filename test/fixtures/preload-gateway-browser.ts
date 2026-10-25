import { EXPEDITION_HULK } from '../../shared/expeditions.ts';
import type { Session } from '../../server/game.ts';
// Isolated production-runtime instrumentation used only by its owning regression test.
import { Game } from '../../server/game.ts';
import { SYS as systemsById } from '../../shared/galaxy.ts';
const orig = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (
  session: Session & { _gatewayFixturePlaced?: boolean },
  ...args
) {
  orig.call(this, session, ...args);
  if (!session._gatewayFixturePlaced) {
    const player = systemsById[session.data.sys].stellars.find(
      (wormholeBody) => wormholeBody.wormhole,
    );
    session._gatewayFixturePlaced = true;
    Object.assign(session.ent!, {
      x:
        session.data.sys === 'glasswake' ? 1300 : player ? player.x + 250 : EXPEDITION_HULK.x + 600,
      y: session.data.sys === 'glasswake' ? 500 : player ? player.y : EXPEDITION_HULK.y,
      vx: 0,
      vy: 0,
      a: -Math.PI / 2,
    });
  }
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const entity of [...this.spaces[session.data.sys].ships.values()])
    if (!entity.player && !(session.data.sys === 'glasswake' && entity.indexWorksite))
      this.spaces[session.data.sys].remove(entity);
};
