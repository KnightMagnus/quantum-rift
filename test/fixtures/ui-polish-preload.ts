import { Game } from '../../server/game.ts';
import type { Session } from '../../server/game.ts';
// oxlint-disable-next-line typescript/unbound-method -- Preserve the real spawn for receiver-bound fixture calls.
const spawn = Game.prototype.spawnPlayer;
/** Seed a bounded mixed roster; movement, hails and rendering retain production owners. */
Game.prototype.spawnPlayer = function (session: Session, ...args) {
  if (session.data.name !== 'Index Viewer') return spawn.call(this, session, ...args);
  session.data.sys = 'glasswake';
  session.data.stellar = null;
  this.db.world.indexFleets ||= {};
  this.db.world.indexFleets.glasswake ||= {
    actors: [910, 911, 912, 916, 919, 921, 923].map((hull, index) => ({
      hull,
      base: hull,
      armor: this.A.ships[hull].armor,
      shield: this.A.ships[hull].shield,
      x: 1300 + index * 5,
      y: 600 + index * 4,
      dead: false,
      hidden: false,
      readyAt: 1e9,
      hitAt: -100,
      launched: 0,
    })),
    remaining: 36,
    offenders: {},
    warnings: {},
    site: { x: 1300, y: 600 },
    kernelLost: false,
    rebootUntil: 0,
    dormantUntil: 0,
    extractAt: 1e9,
    holdImmunity: {},
  };
  spawn.call(this, session, ...args);
  const space = this.spaces.glasswake;
  this.features.indexFleet.open(space);
  // oxlint-disable-next-line unicorn/no-useless-spread -- Removal mutates the live ship registry.
  for (const entity of [...space.ships.values()]) {
    if (entity !== session.ent && entity.faction !== 'index') space.remove(entity);
    else entity.guns = [];
  }
  space.spawnT = 1e9;
  Object.assign(session.ent!, { x: 1300, y: 600, vx: 0, vy: 0, a: 0 });
  const sender = [...space.ships.values()].find((entity) => Number(entity.hull) === 912)!;
  // Normal faction members, not just worksite-flagged callers, need ship-only artwork.
  sender.indexWorksite = false;
  this.hails.enqueue(
    session,
    sender,
    'survey',
    'Index machine survey transmission. Transit is unrestricted.',
  );
};
