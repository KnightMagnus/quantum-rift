import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Game } from '../../server/game.ts';
import { DB } from '../../server/db.ts';
import { makeLoadout } from '../../shared/rules.ts';
import { clearLots, addLots, assertLots } from '../../shared/cargo-lots.ts';
import { tempDataDir } from './temp-data.js';
export function refineryGame(db = new DB(tempDataDir('rift-refinery-'))) {
  const interval = globalThis.setInterval;
  try {
    globalThis.setInterval = () => ({ unref() {} });
    return new Game(
      JSON.parse(fs.readFileSync(new URL('../../shared/assets.json', import.meta.url))),
      db,
    );
  } finally {
    globalThis.setInterval = interval;
  }
}
export function refineryPilot(g, name = 'Refiner') {
  const existing = g.db.get(name);
  const sock = Object.assign(new EventEmitter(), {
    open: true,
    backlog: 0,
    out: [],
    close() {},
    send(m) {
      this.out.push(typeof m === 'string' ? JSON.parse(m) : m);
    },
  });
  g.connect(sock, '127.0.0.1');
  const s = [...g.sessions.values()].at(-1);
  g.onMessage(s, { t: 'hello', name, pass: 'fixture' });
  assert.ok(s.data);
  if (!existing) {
    s.data.tut = 999;
    s.data.credits = 1e8;
    s.data.ship = makeLoadout(g.A, 704, 'Refinery');
  }
  s.ent = null;
  return s;
}
export function seed(d, inputs) {
  clearLots(d.cargo, d.cargoLots);
  for (const [cid, lots] of Object.entries(inputs))
    addLots(d.cargo, d.cargoLots, {
      cid,
      qty: Object.values(lots).reduce((a, b) => a + b, 0),
      grades: lots,
    });
  assertLots(d.cargo, d.cargoLots);
}
export function command(g, s, m, orders = false) {
  g.features.refinery.command(s, { t: orders ? 'miningOrder' : 'refinery', ...m }, orders);
  assertLots(s.data.cargo, s.data.cargoLots);
}
export function quote(g, s, recipe = 'alloy', n = 3, grade = 'common', mode = 'instant') {
  const before = s.sock.out.length;
  command(g, s, { op: 'quote', recipe, n, grade, mode });
  const q = s.sock.out.slice(before).find((m) => m.t === 'refineryQuote')?.quote;
  assert.ok(q, 'binding quote returned');
  return q;
}
export function lots(common = 0, rich = 0, pure = 0) {
  return { common, rich, pure };
}
export function w(g) {
  return g.db.world.refinery;
}

export function fuelQuote(g, s, n = 1) {
  const before = s.sock.out.length;
  command(g, s, { op: 'fuelQuote', n });
  const q = s.sock.out.slice(before).find((m) => m.t === 'refineryFuelQuote')?.quote;
  assert.ok(q, 'server-issued fuel quote');
  return q;
}
