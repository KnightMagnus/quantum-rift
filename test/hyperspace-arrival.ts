// Chained hyperjumps: arrivals land clear of planets, and the clear-out heading never
// crosses the system toward a blocking body.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { SYSTEMS, SYS } from '../shared/galaxy.ts';
import { K as physicsConstants } from '../shared/rules.ts';
import type { GameAssets } from '../shared/rules.ts';
import { hyperspaceArrivalRadius, jumpClearHeading } from '../shared/hyperspace-arrival.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';

const DRIFT_CLEARANCE = physicsConstants.jumpClear + 700;
const bearingBetween = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  Math.atan2(to.x - from.x, -(to.y - from.y));
const nearestBody = (system: (typeof SYSTEMS)[number], x: number, y: number) =>
  Math.min(...system.stellars.map((body) => Math.hypot(x - body.x, y - body.y)));

// Every authored and generated lane arrives with room for the next jump.
let pushedOut = 0;
for (const system of SYSTEMS)
  for (const link of system.links) {
    const bearing = bearingBetween(system, SYS[link]);
    const radius = hyperspaceArrivalRadius(system, bearing);
    const x = Math.sin(bearing) * radius,
      y = -Math.cos(bearing) * radius;
    if (radius > 2200) pushedOut++;
    assert.ok(
      !system.stellars.length || nearestBody(system, x, y) >= DRIFT_CLEARANCE,
      `${system.id} arrival from ${link} lands ${Math.round(nearestBody(system, x, y))} from a body`,
    );
  }
assert.ok(pushedOut > 0, 'Some lanes previously arrived inside a planet’s jump-clear radius');

// Empty space keeps the usual arrival distance.
assert.equal(hyperspaceArrivalRadius({ stellars: [] }, 1.2), 2200);

// A planet straight ahead: turn away from it instead of flying through it.
const blocked = { stellars: [{ x: 0, y: 0 }] };
const awayHeading = jumpClearHeading(blocked, 0, -500, Math.PI); // route points down, through the planet
assert.ok(Math.abs(awayHeading) < 1e-9, 'Heads straight up, away from the blocking planet');
// A route that already leads away from the planet is kept.
assert.equal(jumpClearHeading(blocked, 0, -500, 0.3), 0.3);
// Already clear: route bearing unchanged.
assert.equal(jumpClearHeading(blocked, 0, -5000, Math.PI), Math.PI);

// Through the real server jump: the arriving ship can jump again at once.
process.env.SEEDS_FILE = '/nonexistent';
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-arrival-'));
const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const game = new Game(assets, new Database(directory));
try {
  const socket = legacySocket();
  socket.open = true;
  socket.backlog = 0;
  socket.send = () => {};
  socket.close = () => {};
  game.connect(socket, '127.0.0.1');
  socket.emit('message', JSON.stringify({ t: 'hello', name: 'Arrival Pilot', pass: 'secret' }));
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  const playerData = session.data;
  playerData.tut = 999;
  // Pick a lane whose old fixed 2200 arrival sat inside the destination's jump-clear radius.
  const lane = SYSTEMS.flatMap((system) =>
    system.links.map((link) => ({ from: system, to: SYS[link] })),
  ).find(({ from, to }) => {
    const bearing = bearingBetween(to, from);
    return (
      to.stellars.length &&
      nearestBody(to, Math.sin(bearing) * 2200, -Math.cos(bearing) * 2200) <
        physicsConstants.jumpClear
    );
  });
  assert.ok(lane, 'A fixture lane with a crowded arrival exists');
  playerData.sys = lane!.from.id;
  playerData.explored = [lane!.from.id, lane!.to.id];
  const space = game.spaces[lane!.from.id];
  if (!session.ent) game.spawnPlayer(session, 9000, 9000, 0, 0);
  const ship = requiredFixtureValue(session.ent);
  ship.x = ship.y = 9000;
  ship.fuel = 1000;
  ship.jumpTo = lane!.to.id;
  game.finishJump(ship, space);
  const arrived = requiredFixtureValue(session.ent);
  assert.equal(playerData.sys, lane!.to.id);
  assert.ok(
    nearestBody(lane!.to, arrived.x, arrived.y) >= DRIFT_CLEARANCE,
    'The arriving ship is clear enough to chain the next jump',
  );
  console.log(JSON.stringify({ ok: true, pushedOut, lane: [lane!.from.id, lane!.to.id] }));
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
process.exit(0);
