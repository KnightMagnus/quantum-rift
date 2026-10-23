import { requiredFixtureValue } from '../helpers/required.ts';
const telemetry = requiredFixtureValue(process.env.QUANTUM_FIXTURE_TELEMETRY);
import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import { STELLARS } from '../../shared/galaxy.ts';
const fixtureState: { game?: Game } = {};
// oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype implementation; invoke it with explicit call(this, ...) below.
const originalSpawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (this: Game, session, ...argumentsList) {
  originalSpawnPlayer.call(this, session, ...argumentsList);
  fixtureState.game = this;
  if (!session.data.name.startsWith('Tow')) return;
  const space = this.spaces[session.data.sys];
  const existingShips = [...space.ships.values()];
  for (const entity of existingShips) if (!entity.player && !entity.owner) space.remove(entity);
  space.spawnT = 1e9;
  this.features.towing.ensure(space.id);
  const motherlode = requiredFixtureValue(
      requiredFixtureValue(
        requiredFixtureValue(this.db.world.towing).slots.find(
          (towSlot) => towSlot.sys === space.id,
        ),
      ).object,
    ),
    stellarBody = STELLARS[motherlode.acceptPorts[0]];
  if (motherlode.status === 'available') {
    motherlode.x = stellarBody.x;
    motherlode.y = stellarBody.y + stellarBody.r + 450;
  }
  const session3 = [...this.sessions.values()].find(
    (session2) => session2 !== session && session2.ent && this.features.towing.attached(session2),
  );
  requiredFixtureValue(session.ent).x = session3
    ? requiredFixtureValue(session3.ent).x + 60
    : motherlode.x;
  requiredFixtureValue(session.ent).y = session3
    ? requiredFixtureValue(session3.ent).y
    : motherlode.y - 80;
  requiredFixtureValue(session.ent).vx = requiredFixtureValue(session.ent).vy = 0;
  requiredFixtureValue(session.ent).a = 0;
  requiredFixtureValue(session.ent).graceT = 1e9;
};
setInterval(() => {
  const activeGame = fixtureState.game;
  if (!activeGame) return;
  fileSystem.writeFileSync(
    telemetry + '.tmp',
    JSON.stringify({
      world: activeGame.db.world.towing,
      pilots: [...activeGame.sessions.values()]
        .filter((session) => session.data)
        .map((session) => ({
          name: session.data.name,
          sys: session.data.sys,
          cargo: session.data.cargo,
          cargoLots: session.data.cargoLots,
          x: session.ent?.x,
          y: session.ent?.y,
          speed: session.ent
            ? Math.hypot(requiredFixtureValue(session.ent).vx, requiredFixtureValue(session.ent).vy)
            : 0,
          input2: session.ent?.inp?.fire2 || 0,
          fighters: [...(activeGame.live[session.data.sys]?.ships.values() || [])]
            .filter((entity) => entity.fighterOf === session.ent?.id)
            .map((entity) => entity.id),
        })),
    }),
  );
  fileSystem.renameSync(telemetry + '.tmp', telemetry);
}, 40).unref();
