import { mockSession } from './helpers/mocks.ts';
import type { Entity } from '../server/space.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { Game } from '../server/game.ts';
import { DB as Database } from '../server/db.ts';
import { SYS as systemsById } from '../shared/galaxy.ts';
import { gatewayGuidance } from '../client/gateway_autopilot.ts';
import { makeLoadout, shipStats, step } from '../shared/rules.ts';
const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-gateway-'));
try {
  const game = new Game(
    JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8')),
    new Database(directory),
  );
  const playerData = { ...game.fresh(), name: 'Gateway Test' };
  playerData.name = 'Gateway Test';
  playerData.sys = 'sol';
  playerData.stellar = null;
  playerData.tut = 999;
  const session = mockSession({
    id: 9981,
    name: playerData.name,
    data: playerData,
    sock: { open: true, backlog: 0, send() {} },
  });
  game.sessions.set(session.id, session);
  game.spawnPlayer(session, 0, 0, 0, 0);
  for (const origin of ['sol', 'coldharbor']) {
    const player = systemsById[origin].stellars.find((stellarBody) => stellarBody.wormhole);
    const shipStats3 = requiredFixtureValue(shipStats(game.A, makeLoadout(game.A, 704)));
    // Near the center, aligned ships keep thrusting regardless of drift speed/direction.
    for (const velocityX of [
      -requiredFixtureValue(shipStats3).maxSpeed,
      0,
      requiredFixtureValue(shipStats3).maxSpeed,
    ]) {
      const input: Record<string, number> = {};
      gatewayGuidance(
        {
          x: requiredFixtureValue(player).x + 1,
          y: requiredFixtureValue(player).y,
          a: -Math.PI / 2,
          vx: velocityX,
          vy: 0,
        },
        shipStats3,
        requiredFixtureValue(player),
        input,
      );
      assert.equal(input.thrust, 1, 'no speed-dependent arrival slowdown near center');
      assert.equal(input.turn, 0, 'aim at center, not against drift');
      assert.equal(input.rev, 0);
    }
    const ship = {
      x: requiredFixtureValue(player).x + 600,
      y: requiredFixtureValue(player).y + 300,
      vx: 80,
      vy: -60,
      a: 2,
      fuel: requiredFixtureValue(shipStats3).fuel,
    };
    let index = 0;
    for (
      ;
      index < 3000 &&
      Math.hypot(
        ship.x - requiredFixtureValue(player).x,
        ship.y - requiredFixtureValue(player).y,
      ) >=
        requiredFixtureValue(player).r * 0.5;
      index++
    ) {
      const input: Record<string, number> = {};
      gatewayGuidance(ship, shipStats3, requiredFixtureValue(player), input);
      assert.equal(input.rev, 0, 'Gateway never requests retrograde braking');
      if (
        Math.abs(
          Math.atan2(
            Math.sin(
              Math.atan2(
                requiredFixtureValue(player).x - ship.x,
                -(requiredFixtureValue(player).y - ship.y),
              ) - ship.a,
            ),
            Math.cos(
              Math.atan2(
                requiredFixtureValue(player).x - ship.x,
                -(requiredFixtureValue(player).y - ship.y),
              ) - ship.a,
            ),
          ),
        ) < 0.5
      )
        assert.equal(input.thrust, 1, 'aligned approach burns straight through, even at aperture');
      step(ship, shipStats3, input);
    }
    assert.ok(index < 3000, 'guidance reaches actual transit aperture');
    game.wormholeTransit(
      requiredFixtureValue<Entity>(session.ent),
      game.spaces[origin],
      requiredFixtureValue(player),
    );
    const exit = systemsById[playerData.sys].stellars.find(
        (stellarBody) => stellarBody.id === requiredFixtureValue(player).exit,
      ),
      entity = requiredFixtureValue<Entity>(session.ent),
      space = game.spaces[playerData.sys];
    assert.ok(
      Math.hypot(entity.x - requiredFixtureValue(exit).x, entity.y - requiredFixtureValue(exit).y) <
        requiredFixtureValue(exit).r * 0.2,
    );
    assert.equal(entity.wormExit, requiredFixtureValue(exit).id);
    entity.vx = entity.vy = 0;
    entity.inp = {};
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const other of [...space.ships.values()]) if (!other.player) space.remove(other);
    for (let tickIndex = 0; tickIndex < 180; tickIndex++) space.tick();
    assert.equal(session.ent, entity, 'no bounce even stopped in center after cooldown');
    entity.x = requiredFixtureValue(exit).x + requiredFixtureValue(exit).r;
    space.tick();
    assert.equal(entity.wormExit, undefined);
  }
  const farLayer = systemsById.coldharbor.stellars.find((stellarBody) => stellarBody.wormhole);
  for (const stellarBody of systemsById.coldharbor.stellars.filter((stellarBody2) =>
    requiredFixtureValue(stellarBody2.svc).includes('L'),
  )) {
    assert.ok(
      Math.hypot(
        requiredFixtureValue(farLayer).x - stellarBody.x,
        requiredFixtureValue(farLayer).y - stellarBody.y,
      ) > Math.hypot(600 - stellarBody.x, 600 - stellarBody.y),
    );
  }
  console.log(
    'Gateway both directions: aperture guidance, center exit, stopped anti-bounce and rearm passed.',
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}

process.exit(0);
