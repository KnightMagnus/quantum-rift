import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DB } from '../../server/db.js';
import { makeLoadout } from '../../shared/rules.js';
import { STELLARS } from '../../shared/galaxy.js';
import { refineryGame, refineryPilot, seed, lots } from './refinery-fixture.js';
import { tempDataDir } from './temp-data.js';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.mjs';
export { until } from './mining-fixture.mjs';
export async function towingFixture(name) {
  const dir = tempDataDir('rift-towing-play-'),
    out = evidenceDir(name),
    data = path.join(dir, 'data'),
    g = refineryGame(new DB(data));
  const p = Object.values(STELLARS).find(
    (x) => x.system === 'meridian' && x.svc.includes('L') && !x.site && !x.outlaw,
  );
  for (const [name, hull] of [
    ['Tow Alpha', 815],
    ['Tow Bravo', 704],
  ]) {
    const s = refineryPilot(g, name);
    s.data.ship = makeLoadout(g.A, hull);
    if (hull !== 815) s.data.ship.outfits[9920] = 1;
    const bay = Object.values(g.A.weapons).find((w) => w.launch && g.A.ships[w.launch]);
    s.data.ship.fixed.push([bay.id, 1, 8]);
    s.data.ship.ammo[bay.id] = 8;
    s.data.sys = 'meridian';
    s.data.stellar = p.id;
    s.data.story = { done: ['start'], active: null };
    s.data.tut = 999;
    s.data.fuel = 0;
    seed(s.data, { food: lots(g.features.shipStats.stats(s.data).cargo - 10) });
  }
  g.db.touch();
  g.db.flush();
  const preload = path.join(dir, 'towing-preload.mjs'),
    telemetry = path.join(out, 'telemetry.json');
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href)};import {STELLARS} from ${JSON.stringify(pathToFileURL(path.join(root, 'shared/galaxy.js')).href)};
 let game;const spawn=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){spawn.call(this,s,...args);game=this;if(!s.data.name.startsWith('Tow'))return;const sp=this.spaces[s.data.sys];for(const e of [...sp.ships.values()])if(!e.player&&!e.owner)sp.remove(e);sp.spawnT=1e9;this.features.towing.ensure(sp.id);const o=this.db.world.towing.slots.find(x=>x.sys===sp.id).object,p=STELLARS[o.acceptPorts[0]];if(o.status==='available'){o.x=p.x;o.y=p.y+p.r+450;}const tug=[...this.sessions.values()].find(x=>x!==s&&x.ent&&this.features.towing.attached(x));s.ent.x=tug?tug.ent.x+60:o.x;s.ent.y=tug?tug.ent.y:o.y-80;s.ent.vx=s.ent.vy=0;s.ent.a=0;s.ent.graceT=1e9;};
 setInterval(()=>{if(!game)return;fs.writeFileSync(${JSON.stringify(telemetry)}+'.tmp',JSON.stringify({world:game.db.world.towing,pilots:[...game.sessions.values()].filter(s=>s.data).map(s=>({name:s.data.name,sys:s.data.sys,cargo:s.data.cargo,cargoLots:s.data.cargoLots,x:s.ent?.x,y:s.ent?.y,speed:s.ent?Math.hypot(s.ent.vx,s.ent.vy):0,input2:s.ent?.inp?.fire2||0,fighters:[...(game.live[s.data.sys]?.ships.values()||[])].filter(e=>e.fighterOf===s.ent?.id).map(e=>e.id)}))}));fs.renameSync(${JSON.stringify(telemetry)}+'.tmp',${JSON.stringify(telemetry)});},40).unref();`,
  );
  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.js', '--import', preload, 'server/main.js'],
      {
        cwd: root,
        env: {
          ...process.env,
          PORT: String(port),
          SOLO: '',
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
