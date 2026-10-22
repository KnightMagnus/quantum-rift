import type { SavedRockGeneration } from '../../server/mining-contracts.ts';
import { requiredFixtureValue } from '../helpers/required.ts';
const telemetry = requiredFixtureValue(process.env.QUANTUM_FIXTURE_TELEMETRY);
const droneBayId = Number(requiredFixtureValue(process.env.QUANTUM_FIXTURE_BAY_ID));
import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
const fixtureState: { game?: Game } = {};
// oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype implementation; invoke it with explicit call(this, ...) below.
const originalSpawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...argumentsList) {
  if (
    session.data.name === 'Dredge Alpha' &&
    session.data.ship.hull === 815 &&
    !session.data.ship.fixed.some((positionX) => positionX[0] === droneBayId)
  ) {
    session.data.ship.fixed.push([droneBayId, 1, 8]);
    session.data.ship.ammo[droneBayId] = 8;
  }
  originalSpawnPlayer.call(this, session, ...argumentsList);
  fixtureState.game = this;
  const space = this.spaces[session.data.sys];
  if (!session.data.name.startsWith('Dredge')) return;
  const existingShips = [...space.ships.values()];
  for (const entity of existingShips) if (!entity.player && !entity.owner) space.remove(entity);
  space.spawnT = 1e9;
  requiredFixtureValue(session.ent).x = 15900;
  requiredFixtureValue(session.ent).y = 14000;
  requiredFixtureValue(session.ent).a = Math.PI / 2;
  requiredFixtureValue(session.ent).vx = requiredFixtureValue(session.ent).vy = 0;
  requiredFixtureValue(session.ent).graceT = 1e9;
  const savedRockGeneration = (space.rocks as SavedRockGeneration[]).find(
    (savedRockGeneration2) => savedRockGeneration2.stages === 1,
  );
  if (savedRockGeneration) {
    savedRockGeneration.x = 16020;
    savedRockGeneration.y = 14000;
  }
};
setInterval(() => {
  const activeGame = fixtureState.game;
  if (!activeGame) return;
  fileSystem.writeFileSync(
    telemetry + '.tmp',
    JSON.stringify({
      world: activeGame.db.world.industrial,
      pilots: [...activeGame.sessions.values()]
        .filter((session) => session.data)
        .map((session) => ({
          name: session.data.name,
          cargo: session.data.cargo,
          input2: session.ent?.inp?.fire2 || 0,
          industrial: activeGame.features.industrial.payload(session),
          drones: [...(activeGame.live[session.data.sys]?.ships.values() || [])]
            .filter((entity) => entity.industrialRoot === session.ent?.id)
            .map((entity) => entity.id),
          fighters: [...(activeGame.live[session.data.sys]?.ships.values() || [])]
            .filter((entity) => entity.fighterOf === session.ent?.id)
            .map((entity) => ({ id: entity.id, recall: entity.recall })),
        })),
    }),
  );
  fileSystem.renameSync(telemetry + '.tmp', telemetry);
}, 50).unref();
