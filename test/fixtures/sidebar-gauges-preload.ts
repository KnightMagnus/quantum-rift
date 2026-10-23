import { Game } from '../../server/game.ts';
const started = new WeakMap<object, number>();
// oxlint-disable-next-line typescript/unbound-method -- The production implementation is invoked with its original receiver.
const tick = Game.prototype.tick;
Game.prototype.tick = function (...argumentsList) {
  for (const session of this.sessions.values()) {
    const entity = session.ent;
    if (!entity || !session.data.name.startsWith('Refinery')) continue;
    if (!started.has(entity)) started.set(entity, Date.now());
    const elapsed = Date.now() - started.get(entity)!;
    // Actual authoritative fixture changes flow through ordinary snapshots.
    // Stop touching shield after the damage event, so production regeneration runs.
    const bravo = session.data.name === 'Refinery Bravo';
    if (elapsed < 1000) {
      entity.shield = bravo ? 22 : 12;
      entity.armor = bravo ? 50 : 30;
      entity.fuel = bravo ? 8 : 4;
    } else if (elapsed > 2500 && elapsed < 3500) {
      entity.shield = bravo ? 8 : 2;
      entity.armor = bravo ? 45 : 20;
      entity.fuel = bravo ? 6 : 2;
    }
  }
  return tick.apply(this, argumentsList);
};
