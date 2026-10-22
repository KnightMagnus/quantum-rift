import { requiredFixtureValue } from '../helpers/required.ts';
const telemetry = requiredFixtureValue(process.env.QUANTUM_FIXTURE_TELEMETRY);
import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
const fixtureState: { game?: Game } = {};
// oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype implementation; invoke it with explicit apply(this, ...) below.
const originalConnect = Game.prototype.connect;
Game.prototype.connect = function (...argumentsList) {
  fixtureState.game = this;
  return originalConnect.apply(this, argumentsList);
};
// oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype implementation; invoke it with explicit call(this, ...) below.
const originalSpawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...argumentsList) {
  originalSpawnPlayer.call(this, session, ...argumentsList);
  if (!session.data.name.startsWith('Refinery')) return;
  const space = this.spaces[session.data.sys];
  const existingShips = [...space.ships.values()];
  for (const entity of existingShips) if (!entity.player && !entity.owner) space.remove(entity);
  space.spawnT = 1e9;
  const rock = space.rocks.find((rock2) => rock2.ore === 'gas') || space.rocks[0];
  rock.ore = 'gas';
  rock.x = 10000;
  rock.y = 10000;
  rock.hp = rock.max = 100000;
  requiredFixtureValue(session.ent).x = 10160;
  requiredFixtureValue(session.ent).y = 10000;
  requiredFixtureValue(session.ent).a = -Math.PI / 2;
  requiredFixtureValue(session.ent).fuel = 0;
};
setInterval(() => {
  const activeGame = fixtureState.game;
  if (!activeGame) return;
  fileSystem.writeFileSync(
    telemetry,
    JSON.stringify({
      refinery: activeGame.db.world.refinery,
      pressure: activeGame.db.world.miningPressure,
      pilots: [...activeGame.sessions.values()]
        .filter((session) => session.data)
        .map((session) => ({
          name: session.data.name,
          cargo: session.data.cargo,
          cargoLots: session.data.cargoLots,
          fuel: session.ent?.fuel ?? session.data.fuel,
          drones: [...(activeGame.live[session.data.sys]?.ships?.values() || [])]
            .filter((entity) => entity.fighterOf === session.ent?.id)
            .map((entity) => ({ id: entity.id, recall: entity.recall })),
        })),
    }),
  );
}, 40).unref();
