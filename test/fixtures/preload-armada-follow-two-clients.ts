// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  captainNames: string[];
  leaderName: string;
  telemetryPath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();

import fileSystem from 'node:fs';
import { Game } from '../../server/game.ts';
let game: Game | undefined,
  ticks = 0,
  trace: {
    t: number;
    ships: {
      name: string;
      x: number;
      y: number;
      a: number;
      vx: number;
      vy: number;
      follow?: boolean;
      target: import('../../server/game.ts').Session['armadaFormationTarget'];
      inp: import('../../server/space.ts').Entity['inp'];
    }[];
  }[] = [];
const original = Reflect.get(Game.prototype, 'spawnPlayer') as typeof Game.prototype.spawnPlayer;
Game.prototype.spawnPlayer = function (session, ...args) {
  original.call(this, session, ...args);
  // oxlint-disable-next-line typescript/no-this-alias -- Capture the live receiver for the telemetry timer.
  game = this;
  const simulationIndex = preloadConfig.captainNames.indexOf(session.data.name);
  if (simulationIndex < 0) return;
  const shipEntity = session.ent,
    activeSpace = this.spaces[session.data.sys];
  const lead = [...this.sessions.values()].find(
    (other) => other.data?.name === preloadConfig.leaderName,
  )?.ent;
  shipEntity!.x = simulationIndex ? lead!.x - 230 : 10000;
  shipEntity!.y = simulationIndex ? lead!.y + 240 : 10000;
  shipEntity!.a = 0;
  shipEntity!.vx = simulationIndex ? lead!.vx + 0.3 : 0;
  shipEntity!.vy = simulationIndex ? lead!.vy : -80;
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before removing live entities.
  for (const ambientEntity of [...activeSpace.ships.values()])
    if (!ambientEntity.player) activeSpace.remove(ambientEntity);
  activeSpace.spawnT = 1e9;
};
setInterval(() => {
  if (!game) return;
  const sessions = [...game.sessions.values()].filter(
    (session) => session.ent && preloadConfig.captainNames.includes(session.data.name),
  );
  if (sessions.length !== 2) return;
  const activeSpace = game.spaces[sessions[0].data.sys];
  for (let acceleratedTickIndex = 0; acceleratedTickIndex < 8; acceleratedTickIndex++) {
    activeSpace.tick();
    ticks++;
    if (ticks % 3 === 0)
      trace.push({
        t: ticks / 30,
        ships: sessions.map((session) => ({
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
      });
  }
  fileSystem.writeFileSync(
    preloadConfig.telemetryPath + '.tmp',
    JSON.stringify({ t: ticks / 30, trace: trace.slice(-1200) }),
  );
  fileSystem.renameSync(preloadConfig.telemetryPath + '.tmp', preloadConfig.telemetryPath);
}, 20).unref();
