import { Game } from '../../server/game.ts';
import type { Session } from '../../server/game.ts';
import { SYS } from '../../shared/galaxy.ts';
// oxlint-disable-next-line typescript/unbound-method -- Preserve the original for an explicit .call with the live Game receiver.
const spawnPlayer = Game.prototype.spawnPlayer;
/** Isolate native rendering from random traffic; the arrival uses the real gated transit. */
Game.prototype.spawnPlayer = function (session: Session & { _realityPlaced?: boolean }, ...args) {
  const firstPlacement = !session._realityPlaced;
  session._realityPlaced = true;
  if (firstPlacement && session.name === 'Reality Beyond') session.data.sys = 'quantum-rift';
  if (firstPlacement && session.name === 'Reality Breach') session.data.sys = 'dimmer';
  if (firstPlacement && session.name === 'Reality Vigil') session.data.sys = 'founding-vigil';
  spawnPlayer.call(this, session, ...args);
  Object.assign(session.ent!, {
    x: session.name === 'Reality Breach' ? 1600 : session.name === 'Reality Vigil' ? 400 : 900,
    y: session.name === 'Reality Breach' ? -600 : session.name === 'Reality Vigil' ? 0 : 300,
    vx: 0,
    vy: 0,
    a: 0,
  });
  // oxlint-disable-next-line unicorn/no-useless-spread -- Remove from a copied live registry.
  for (const entity of [...this.spaces[session.data.sys].ships.values()])
    if (!entity.player) this.spaces[session.data.sys].remove(entity);
  if (firstPlacement && session.name === 'Reality Beyond') {
    const portal = SYS['quantum-rift'].stellars.find((stellar) => stellar.wormhole)!;
    this.wormholeTransit(session.ent!, this.spaces['quantum-rift'], portal);
  }
};
