import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { DB } from '../../server/db.js';
import { Game } from '../../server/game.js';
import { augmentAssets, makeLoadout, shipStats } from '../../shared/rules.js';
import { STELLARS } from '../../shared/galaxy.js';
import { tempDataDir } from './temp-data.js';
import { root, availablePort, evidenceDir, ready, cleanup, delay } from './browser-fixture.mjs';
export async function until(fn, label, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await delay(40);
  }
  throw Error(label);
}
export async function miningFixture(name) {
  const dir = tempDataDir('rift-mining-play-'),
    out = evidenceDir(name),
    data = path.join(dir, 'data'),
    A = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json')));
  augmentAssets(A);
  const db = new DB(data);
  const portDef = Object.values(STELLARS).find(
    (p) => p.system === 'meridian' && !p.site && p.svc?.includes('L'),
  );
  const bay = Object.values(A.weapons).find((w) => w.launch && A.ships[w.launch]);
  for (const name of ['Mining Alpha', 'Mining Bravo']) {
    const d = Game.prototype.fresh.call({ A });
    d.tut = 999;
    d.story = { done: ['start'], active: null };
    d.sys = 'meridian';
    d.stellar = portDef.id;
    d.ship = makeLoadout(A, 704, name);
    d.ship.outfits = {};
    d.ship.fixed = [
      [9102, 1, 0],
      [bay.id, 1, 8],
    ];
    d.ship.ammo[bay.id] = 8;
    if (name === 'Mining Alpha' && out.endsWith('mining-ui'))
      d.cargo.food = shipStats(A, d.ship).cargo - 1;
    db.create(name, 'fixture', d);
  }
  db.flush();
  const telemetry = path.join(out, 'telemetry.json'),
    fixture = path.join(dir, 'placement.mjs');
  fs.writeFileSync(
    fixture,
    `import fs from 'node:fs';import {Game} from ${JSON.stringify(pathToFileURL(path.join(root, 'server/game.js')).href)};
 import {SYS} from ${JSON.stringify(pathToFileURL(path.join(root, 'shared/galaxy.js')).href)};SYS.meridian.fields.push({x:10400,y:10200,r:60,ore:'gas',rich:2,rocks:1});
 let game;const spawn=Game.prototype.spawnPlayer;Game.prototype.spawnPlayer=function(s,...args){spawn.call(this,s,...args);game=this;const sp=this.spaces[s.data.sys];if(!['Mining Alpha','Mining Bravo'].includes(s.data.name))return;for(const e of [...sp.ships.values()])if(!e.player&&!e.owner)sp.remove(e);sp.spawnT=1e9;
 const r=sp.rocks.find(r=>r.ore==='ore'&&r.stages===1)||sp.rocks[0];r.x=10000;r.y=10000;r.seam=0;const gas=sp.rocks.find(r=>r.ore==='gas');if(gas){gas.x=10400;gas.y=10200;}s.ent.x=10180;s.ent.y=10000+(s.data.name==='Mining Bravo'?200:0);s.ent.a=-Math.PI/2;s.ent.vx=s.ent.vy=0;
 };
 setInterval(()=>{if(!game)return;const sp=game.live.meridian;if(!sp)return;const result={clock:game.db.world.mining.clock,rocks:game.features.mining.rocksPayload(sp),parcels:game.db.world.mining.systems.meridian.parcels,pilots:[...game.sessions.values()].filter(s=>s.data).map(s=>({name:s.data.name,cargo:s.data.cargo,cargoLots:s.data.cargoLots,inp:s.ent?.inp,x:s.ent?.x,y:s.ent?.y,heading:s.ent?.a,guns:s.ent?.guns.map(g=>({w:g.w,n:g.n,sec:g.sec})),drones:[...sp.ships.values()].filter(e=>e.fighterOf===s.ent?.id).map(e=>({id:e.id,recall:e.recall})),survey:s.data.miningSurvey}))};fs.writeFileSync(${JSON.stringify(telemetry)}+'.tmp',JSON.stringify(result));fs.renameSync(${JSON.stringify(telemetry)}+'.tmp',${JSON.stringify(telemetry)});},40).unref();`,
  );
  const port = await availablePort(),
    origin = `http://127.0.0.1:${port}`,
    server = spawn(
      process.execPath,
      ['--import', './test/seed-random.js', '--import', fixture, 'server/main.js'],
      {
        cwd: root,
        env: {
          ...process.env,
          SOLO: '',
          PORT: String(port),
          DATA_DIR: data,
          SEEDS_FILE: '/nonexistent',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  const log = fs.createWriteStream(path.join(out, 'server.log'));
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  await ready(server, origin);
  return {
    dir,
    out,
    origin,
    server,
    telemetry,
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
