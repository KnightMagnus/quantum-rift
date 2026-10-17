import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../server/game.js';
import { DB } from '../server/db.js';
import { SYS } from '../shared/galaxy.js';
import { landingGuidance } from '../client/landing_autopilot.js';
import { makeLoadout, shipStats, step } from '../shared/rules.js';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-gateway-'));
try {
  const game = new Game(JSON.parse(fs.readFileSync('shared/assets.json')), new DB(dir));
  const d = game.fresh();
  d.name = 'Gateway Test';
  d.sys = 'sol';
  d.stellar = null;
  d.tut = 999;
  const s = { id: 9981, name: d.name, data: d, sock: { open: true, backlog: 0, send() {} } };
  game.sessions.set(s.id, s);
  game.spawnPlayer(s, 0, 0, 0, 0);
  for (const origin of ['sol', 'coldharbor']) {
    const p = SYS[origin].stellars.find((p) => p.wormhole);
    const st = shipStats(game.A, makeLoadout(game.A, 704));
    const ship = { x: p.x + 600, y: p.y + 300, vx: 80, vy: -60, a: 2, fuel: st.fuel },
      state = {};
    let i = 0;
    for (; i < 3000 && Math.hypot(ship.x - p.x, ship.y - p.y) >= p.r * 0.5; i++) {
      const input = {};
      landingGuidance(state, ship, st, { ...p, r: 0 }, input);
      step(ship, st, input);
    }
    assert.ok(i < 3000, 'guidance reaches actual transit aperture');
    game.wormholeTransit(s.ent, game.spaces[origin], p);
    const exit = SYS[d.sys].stellars.find((x) => x.id === p.exit),
      e = s.ent,
      space = game.spaces[d.sys];
    assert.ok(Math.hypot(e.x - exit.x, e.y - exit.y) < exit.r * 0.2);
    assert.equal(e.wormExit, exit.id);
    e.vx = e.vy = 0;
    e.inp = {};
    for (const other of [...space.ships.values()]) if (!other.player) space.remove(other);
    for (let t = 0; t < 180; t++) space.tick();
    assert.equal(s.ent, e, 'no bounce even stopped in center after cooldown');
    e.x = exit.x + exit.r;
    space.tick();
    assert.equal(e.wormExit, undefined);
  }
  const far = SYS.coldharbor.stellars.find((p) => p.wormhole);
  for (const p of SYS.coldharbor.stellars.filter((p) => p.svc.includes('L'))) {
    assert.ok(Math.hypot(far.x - p.x, far.y - p.y) > Math.hypot(600 - p.x, 600 - p.y));
  }
  console.log(
    'Gateway both directions: aperture guidance, center exit, stopped anti-bounce and rearm passed.',
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

process.exit(0);
