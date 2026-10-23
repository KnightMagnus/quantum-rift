import type { SavedRockGeneration } from '../../server/mining-contracts.ts';
import { requiredFixtureValue } from '../helpers/required.ts';
const telemetry = requiredFixtureValue(process.env.QUANTUM_FIXTURE_TELEMETRY);
import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
import { SYS as systemsById } from '../../shared/galaxy.ts';
requiredFixtureValue(systemsById.meridian.fields).push({
  x: 10400,
  y: 10200,
  r: 60,
  ore: 'gas',
  rich: 2,
  rocks: 1,
});
const fixtureState: { game?: Game } = {};
// oxlint-disable-next-line typescript/unbound-method -- Preserve the prototype implementation; invoke it with explicit call(this, ...) below.
const originalSpawnPlayer = Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...argumentsList) {
  originalSpawnPlayer.call(this, session, ...argumentsList);
  fixtureState.game = this;
  const space = this.spaces[session.data.sys];
  if (!['Mining Alpha', 'Mining Bravo'].includes(session.data.name)) return;
  const existingShips = [...space.ships.values()];
  for (const entity of existingShips) if (!entity.player && !entity.owner) space.remove(entity);
  space.spawnT = 1e9;
  const savedRockGeneration =
    (space.rocks as SavedRockGeneration[]).find(
      (savedRockGeneration2) =>
        savedRockGeneration2.ore === 'ore' && savedRockGeneration2.stages === 1,
    ) || (space.rocks as SavedRockGeneration[])[0];
  savedRockGeneration.x = 10000;
  savedRockGeneration.y = 10000;
  savedRockGeneration.seam = 0;
  const gasRock = (space.rocks as SavedRockGeneration[]).find(
    (savedRockGeneration2) => savedRockGeneration2.ore === 'gas',
  );
  if (gasRock) {
    gasRock.x = 10400;
    gasRock.y = 10200;
  }
  requiredFixtureValue(session.ent).x = 10180;
  requiredFixtureValue(session.ent).y = 10000 + (session.data.name === 'Mining Bravo' ? 200 : 0);
  requiredFixtureValue(session.ent).a = -Math.PI / 2;
  requiredFixtureValue(session.ent).vx = requiredFixtureValue(session.ent).vy = 0;
};
setInterval(() => {
  const activeGame = fixtureState.game;
  if (!activeGame) return;
  const space = activeGame.live.meridian;
  if (!space) return;
  const result = {
    clock: requiredFixtureValue(activeGame.db.world.mining).clock,
    rocks: activeGame.features.mining.rocksPayload(space),
    parcels: requiredFixtureValue(activeGame.db.world.mining).systems.meridian.parcels,
    pilots: [...activeGame.sessions.values()]
      .filter((session) => session.data)
      .map((session) => ({
        name: session.data.name,
        cargo: session.data.cargo,
        cargoLots: session.data.cargoLots,
        inp: session.ent?.inp,
        x: session.ent?.x,
        y: session.ent?.y,
        heading: session.ent?.a,
        guns: session.ent?.guns.map((weaponMount) => ({
          w: weaponMount.w,
          n: weaponMount.n,
          sec: weaponMount.sec,
        })),
        drones: [...space.ships.values()]
          .filter((entity) => entity.fighterOf === session.ent?.id)
          .map((entity) => ({ id: entity.id, recall: entity.recall })),
        survey: session.data.miningSurvey,
      })),
  };
  fileSystem.writeFileSync(telemetry + '.tmp', JSON.stringify(result));
  fileSystem.renameSync(telemetry + '.tmp', telemetry);
}, 40).unref();
