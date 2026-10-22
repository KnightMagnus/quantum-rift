import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DB } from '../../server/db.js';
import { Game } from '../../server/game.js';
import { augmentAssets } from '../../shared/rules.js';
import { STELLARS } from '../../shared/galaxy.js';
import { BUILD } from '../../shared/specialty.js';
import { tempDataDir } from './temp-data.js';
import { root, availablePort, evidenceDir, ready, cleanup } from './browser-fixture.mjs';
export { until } from './mining-fixture.mjs';
export async function dredgeFixture(name) {
  const dir = tempDataDir('rift-dredge-play-'),
    out = evidenceDir(name),
    data = path.join(dir, 'data'),
    db = new DB(data),
    A = augmentAssets(JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'))));
  const bay = Object.values(A.weapons).find((w) => w.launch && A.ships[w.launch]);
  const home = Object.values(STELLARS).find((p) => p.site && p.system === 'meridian');
  for (const name of ['Dredge Alpha', 'Dredge Bravo']) {
    const d = Game.prototype.fresh.call({ A });
    d.tut = 999;
    d.story = { done: ['start'], active: null };
    d.sys = 'meridian';
    d.credits = 1e8;
    if (name === 'Dredge Alpha') {
      d.stellar = home.id;
      d.station.site = home.id;
      d.station.ops = BUILD.ops;
      db.world.sites[home.id] = name;
      d.bp = { 815: 40 };
      for (const [cid, g, n] of BUILD.mats) {
        d.mats[cid] ??= [0, 0, 0, 0, 0];
        d.mats[cid][g] = n;
      }
    } else
      d.stellar = Object.values(STELLARS).find(
        (p) => p.system === 'meridian' && !p.site && p.svc.includes('L'),
      ).id;
    db.create(name, 'fixture', d);
  }
  db.flush();
  const preload = path.join(dir, 'dredge-preload.mjs'),
    telemetry = path.join(out, 'telemetry.json');
  fs.writeFileSync(
    preload,
    `import fs from 'node:fs';import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href)};
 let game;const spawn=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){if(s.data.name==='Dredge Alpha'&&s.data.ship.hull===815&&!s.data.ship.fixed.some(x=>x[0]===${bay.id})){s.data.ship.fixed.push([${bay.id},1,8]);s.data.ship.ammo[${bay.id}]=8;}spawn.call(this,s,...args);game=this;const sp=this.spaces[s.data.sys];if(!s.data.name.startsWith('Dredge'))return;for(const e of [...sp.ships.values()])if(!e.player&&!e.owner)sp.remove(e);sp.spawnT=1e9;s.ent.x=15900;s.ent.y=14000;s.ent.a=Math.PI/2;s.ent.vx=s.ent.vy=0;s.ent.graceT=1e9;const r=sp.rocks.find(r=>r.stages===1);if(r){r.x=16020;r.y=14000;}};
 setInterval(()=>{if(!game)return;fs.writeFileSync(${JSON.stringify(telemetry)}+'.tmp',JSON.stringify({world:game.db.world.industrial,pilots:[...game.sessions.values()].filter(s=>s.data).map(s=>({name:s.data.name,cargo:s.data.cargo,input2:s.ent?.inp?.fire2||0,industrial:game.features.industrial.payload(s),drones:[...(game.live[s.data.sys]?.ships.values()||[])].filter(e=>e.industrialRoot===s.ent?.id).map(e=>e.id),fighters:[...(game.live[s.data.sys]?.ships.values()||[])].filter(e=>e.fighterOf===s.ent?.id).map(e=>({id:e.id,recall:e.recall}))}))}));fs.renameSync(${JSON.stringify(telemetry)}+'.tmp',${JSON.stringify(telemetry)});},50).unref();`,
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
