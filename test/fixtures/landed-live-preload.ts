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
  // A single departing NPC can leave the camera before a slow renderer reaches
  // the last service tab. Seed a continuing stream, not a frozen/teleported ship:
  // every actor still uses ordinary production AI, physics and draw handling.
  const traffic = () => {
    if (this.paused || !session.data.stellar) return;
    const ship = this.spaces[session.data.sys].makeShip({
      hull: 704,
      faction: 'quantum',
      x: stellar.x + 100,
      y: stellar.y,
      a: Math.PI / 2,
      vx: 60,
      vy: 0,
      ai: 'leave',
      name: 'Dock traffic fixture',
    });
    ship.life = 120;
  };
  traffic();
  setInterval(traffic, 3000).unref();
};

// This regression owns observer/flight scene transitions, not approach guidance.
// Leave the real Depart and land handlers intact, but make the redock start
// independent of random departure headings and the renderer's frame cadence.
const originalDepart = Reflect.get(Game.prototype, 'depart') as typeof Game.prototype.depart;
Game.prototype.depart = function (session) {
  const stellar = session.data.stellar ? STELLARS[session.data.stellar] : undefined;
  originalDepart.call(this, session);
  if (session.data.name !== 'Dock Observer' || !stellar || !session.ent) return;
  Object.assign(session.ent, {
    x: stellar.x,
    y: stellar.y + stellar.r * 0.5,
    vx: 0,
    vy: 0,
  });
};
