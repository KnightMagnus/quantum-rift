// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  captainNames: string[];
  telemetryPath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();

import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
const original = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
let game: Game | undefined;
Game.prototype.spawnPlayer = function (session, ...args) {
  original.call(this, session, ...args);
  // oxlint-disable-next-line typescript/no-this-alias -- Capture the live receiver for the telemetry timer.
  game = this;
  const simulationIndex = preloadConfig.captainNames.indexOf(session.data.name);
  if (simulationIndex < 0) return;
  const shipEntity = session.ent,
    activeSpace = this.spaces[session.data.sys];
  shipEntity!.x = 10000 + simulationIndex * 500;
  shipEntity!.y = 10000;
  shipEntity!.vx = shipEntity!.vy = shipEntity!.a = 0;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const ambientEntity of [...activeSpace.ships.values()])
    if (!ambientEntity.player && !ambientEntity.owner) activeSpace.remove(ambientEntity);
  activeSpace.spawnT = 1e9;
  if (simulationIndex === 2) {
    const escortWing = activeSpace.makeShip({
      hull: 704,
      faction: 'quantum',
      x: shipEntity!.x + 200,
      y: shipEntity!.y + 200,
    });
    escortWing.owner = shipEntity!.id;
    escortWing.ai = 'escort';
    escortWing.slot = 3;
  }
};
setInterval(() => {
  if (!game) return;
  const activeSessions = [...game.sessions.values()].filter(
    (session) => session.ent && preloadConfig.captainNames.includes(session.data.name),
  );
  if (!activeSessions.length) return;
  const activeSpace = game.spaces[activeSessions[0].data.sys];
  // Advance the unmodified production Space.tick faster for bounded QA, not altered physics.
  for (let simulationIndex = 0; simulationIndex < 24; simulationIndex++) activeSpace.tick();
  fileSystem.writeFileSync(
    preloadConfig.telemetryPath + '.tmp',
    JSON.stringify(
      activeSessions.map((session) => ({
        name: session.data.name,
        x: session.ent!.x,
        y: session.ent!.y,
        a: session.ent!.a,
        vx: session.ent!.vx,
        vy: session.ent!.vy,
        follow: session.data.armadaFollow,
        target: session.armadaFormationTarget,
        inp: session.ent!.inp,
      })),
    ),
  );
  fileSystem.renameSync(preloadConfig.telemetryPath + '.tmp', preloadConfig.telemetryPath);
}, 20).unref();
