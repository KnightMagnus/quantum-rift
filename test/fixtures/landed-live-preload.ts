import { Game } from '../../server/game.ts';
import { STELLARS } from '../../shared/galaxy.ts';

const seeded = new WeakSet<Game>();
// oxlint-disable-next-line typescript/unbound-method -- Invoke the preserved implementation with its Game receiver.
const originalLanded = Game.prototype.landed;
Game.prototype.landed = function (session) {
  originalLanded.call(this, session);
  if (session.data.name !== 'Dock Observer' || seeded.has(this)) return;
  const stellar = STELLARS[session.data.stellar!];
  if (!stellar) return;
  seeded.add(this);
  // Keep one real moving NPC in the dock camera regardless of unrelated traffic RNG.
  const ship = this.spaces[session.data.sys].makeShip({
    hull: 704,
    faction: 'quantum',
    x: stellar.x + 450,
    y: stellar.y,
    a: Math.PI / 2,
    vx: 60,
    vy: 0,
    ai: 'leave',
    name: 'Dock traffic fixture',
  });
  ship.life = 120;
};
