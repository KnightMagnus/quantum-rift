import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DB } from '../../server/db.js';
import { STELLARS } from '../../shared/galaxy.js';
import { refineryGame, refineryPilot, seed, quote, command, lots, w } from './refinery-fixture.js';
import { tempDataDir } from './temp-data.js';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.mjs';
export { until } from './mining-fixture.mjs';
export async function refineryFixture(name) {
  const dir = tempDataDir('rift-refinery-play-'),
    out = evidenceDir(name),
    data = path.join(dir, 'data'),
    g = refineryGame(new DB(data)),
    port = Object.values(STELLARS).find(
      (p) => p.system === 'meridian' && p.svc?.includes('O') && p.svc.includes('T') && !p.site,
    );
  for (const name of ['Refinery Alpha', 'Refinery Bravo']) {
    const s = refineryPilot(g, name);
    s.data.sys = port.system;
    s.data.stellar = port.id;
    s.data.tut = 999;
    s.data.story = { done: ['start'], active: null };
    s.data.fuel = 0;
    const bay = Object.values(g.A.weapons).find((w) => w.launch && g.A.ships[w.launch]);
    s.data.ship.outfits = {};
    s.data.ship.fixed = [
      [9101, 1, 0],
      [bay.id, 1, 8],
    ];
    s.data.ship.ammo[bay.id] = 8;
    seed(s.data, { ore: lots(18, 3, 3), gas: lots(3), shards: lots(0, 0, 3), fuel_cells: lots(2) });
    if (name === 'Refinery Alpha') {
      command(g, s, { op: 'submit', id: quote(g, s, 'alloy', 6).id });
      command(g, s, { op: 'submit', id: quote(g, s, 'alloy', 3, 'common', 'stored').id });
      const b = w(g).batches.at(-1);
      b.readyAt = Date.now() - 1000;
      b.startAt = b.readyAt - b.quote.duration;
      b.submittedAt = b.startAt - 30000;
      s.data.cargo.food = g.features.shipStats.stats(s.data).cargo - g.holdUsed(s.data) - 1;
      g.db.world.miningPressure.captains.push({
        owner: g.db.key(name),
        sys: 'meridian',
        noise: 90,
        updated: 0,
        lastEncounter: -300,
        warned: true,
      });
    }
  }
  g.db.touch();
  g.db.flush();
  const telemetry = path.join(out, 'telemetry.json'),
    preload = path.join(dir, 'refinery-preload.mjs');
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href)};
 let game;const connect=Game.prototype.connect;Game.prototype.connect=function(...args){game=this;return connect.apply(this,args);};
 const spawn=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){spawn.call(this,s,...args);if(!s.data.name.startsWith('Refinery'))return;const sp=this.spaces[s.data.sys];for(const e of [...sp.ships.values()])if(!e.player&&!e.owner)sp.remove(e);sp.spawnT=1e9;const r=sp.rocks.find(r=>r.ore==='gas')||sp.rocks[0];r.ore='gas';r.x=10000;r.y=10000;r.hp=r.max=100000;s.ent.x=10160;s.ent.y=10000;s.ent.a=-Math.PI/2;s.ent.fuel=0;};
 setInterval(()=>{if(!game)return;fs.writeFileSync(${JSON.stringify(telemetry)},JSON.stringify({refinery:game.db.world.refinery,pressure:game.db.world.miningPressure,pilots:[...game.sessions.values()].filter(s=>s.data).map(s=>({name:s.data.name,cargo:s.data.cargo,cargoLots:s.data.cargoLots,fuel:s.ent?.fuel??s.data.fuel,drones:[...(game.live[s.data.sys]?.ships?.values()||[])].filter(e=>e.fighterOf===s.ent?.id).map(e=>({id:e.id,recall:e.recall}))}))}));},40).unref();`,
  );
  const portNumber = await availablePort(),
    origin = `http://127.0.0.1:${portNumber}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.js', '--import', preload, 'server/main.js'],
      {
        cwd: root,
        env: {
          ...process.env,
          SOLO: '',
          PORT: String(portNumber),
          DATA_DIR: data,
          SEEDS_FILE: '/nonexistent',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ),
    log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  await ready(server, origin);
  return {
    dir,
    out,
    origin,
    server,
    port: port.id,
    read() {
      try {
        return JSON.parse(fs.readFileSync(telemetry));
      } catch {
        return null;
      }
    },
    async close(browser) {
      await cleanup(server, browser, log, dir);
    },
  };
}
