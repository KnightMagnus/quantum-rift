import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.js';
import { makeLoadout, DT } from '../../shared/rules.ts';
export { seed, lots, DT };
let pilotCounter = 0;
export function dredgePilot(g = refineryGame(), name = 'Dredger', hull = 815, sys = 'meridian') {
  const s = refineryPilot(g, name.replace(/[^a-zA-Z]/g, '').slice(0, 12) + ++pilotCounter);
  s.data.ship = makeLoadout(g.A, hull);
  s.data.stellar = null;
  s.data.sys = sys;
  g.spawnPlayer(s, 10000, 10000, 0, 0);
  const sp = g.spaces[sys];
  sp.spawnT = 1e9;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const e of [...sp.ships.values()]) if (!e.player) sp.remove(e);
  s.ent.guns = [];
  s.ent.graceT = 1e9;
  return { g, s, sp };
}
export function control(f, op, extra = {}) {
  f.g.features.industrial.command(f.s, { t: 'industrial', op, ...extra });
}
export function industrialStep(f, seconds, dt = 1 / 30) {
  for (let t = 0; t < seconds - 1e-8; t += dt) {
    const step = Math.min(dt, seconds - t);
    f.g.features.mining.advanceClock(step);
    f.g.features.industrial.industrialTick(f.sp, step);
    f.g.features.mining.endTick(f.sp);
  }
}
export function fullStep(f, seconds) {
  for (let t = 0; t < seconds - 1e-8; t += DT) {
    f.g.features.mining.advanceClock(DT);
    f.sp.tick();
  }
}
