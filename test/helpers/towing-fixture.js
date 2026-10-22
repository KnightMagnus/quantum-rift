import assert from 'node:assert/strict';
import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.js';
import { makeLoadout } from '../../shared/rules.js';
import { TOW } from '../../shared/towing-rules.js';
import { STELLARS } from '../../shared/galaxy.js';
export { refineryGame, seed, lots };
let counter = 0;
export function tug(g = refineryGame(), name = 'TowPilot', hull = 815) {
  const s = refineryPilot(g, name + ++counter);
  s.data.ship = makeLoadout(g.A, hull);
  if (hull !== 815) s.data.ship.outfits[TOW.rig] = 1;
  s.data.sys = 'meridian';
  s.data.stellar = null;
  g.spawnPlayer(s, 10000, 10000, 0, 0);
  const sp = g.spaces.meridian;
  sp.spawnT = 1e9;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const e of [...sp.ships.values()]) if (!e.player) sp.remove(e);
  s.ent.guns = [];
  s.ent.graceT = 1e9;
  g.features.towing.ensure('meridian');
  const o = g.db.world.towing.slots.find((x) => x.sys === 'meridian').object;
  Object.assign(s.ent, { x: o.x, y: o.y - 90, vx: 0, vy: 0 });
  return { g, s, sp, o };
}
export function survey(f) {
  f.s.data.miningSurvey = {
    version: 1,
    sys: f.s.data.sys,
    x: f.s.ent.x,
    y: f.s.ent.y,
    revealUntil: f.g.db.world.mining.clock + 6,
    cooldownUntil: 0,
  };
}
export function command(f, op, extra = {}) {
  return f.g.features.towing.command(f.s, {
    t: 'towing',
    op,
    id: f.o.id,
    revision: f.o.revision,
    ...extra,
  });
}
export function attach(f) {
  survey(f);
  assert.equal(command(f, 'attach'), true, 'real tow attachment');
}
export function atPort(f) {
  const p = STELLARS[f.o.acceptPorts[0]];
  Object.assign(f.s.ent, { x: p.x, y: p.y + p.r + 30, vx: 0, vy: 0 });
  Object.assign(f.o, { x: p.x, y: p.y + p.r + 90, vx: 0, vy: 0 });
  return p;
}
export function advance(f, seconds) {
  for (let t = 0; t < seconds - 1e-8; t += 1 / 30) {
    f.g.features.mining.advanceClock(Math.min(1 / 30, seconds - t));
    f.sp.tick();
  }
}
