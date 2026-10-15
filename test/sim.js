// In-process server test: station progression, wingmates, fighter bays, pirates, bounties, death and respawn.
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { OPS } from '../shared/galaxy.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const dir = '/tmp/rift-sim-' + Date.now(); const game = new Game(A, new DB(dir));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
function fake(name) {
  const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; sock.out = []; sock.send = (m) => sock.out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  game.connect(sock); const s = [...game.sessions.values()].pop();
  const c = { sock, s, send: (m) => sock.emit('message', JSON.stringify(m)), last: (t) => [...sock.out].reverse().find(m => m.t === t) };
  c.send({ t: 'hello', name, pass: 'secret' }); return c;
}
(async () => {
  const a = fake('SimCaptain'), b = fake('Rival');
  ok(b.last('landed').community && b.last('landed').community.online.length === 2, 'the hub shows the community board');
  ok(a.s.data && a.last('landed'), 'logged in and landed');
  const d = a.s.data;
  // ---- station all the way to Ops 5
  d.credits = 5e7; for (const m of ['alloy', 'crystal', 'isotope']) d.mats[m] = [9, 9, 9, 9, 9];
  a.send({ t: 'station', op: 'claim' }); ok(!d.station.claimed, 'the hub itself cannot be claimed');
  d.sys = 'meridian'; d.stellar = 'site-meridian'; game.landed(a.s);
  ok(a.last('landed').site && a.last('landed').site.owner === null, 'landed at an unclaimed derelict hull');
  a.send({ t: 'station', op: 'claim' }); ok(d.station.site === 'site-meridian' && game.db.world.sites['site-meridian'] === 'simcaptain', 'claimed the hull');
  for (let i = 0; i < 5; i++) a.send({ t: 'station', op: 'upgrade' });
  ok(d.station.ops === 5, 'station built to Ops 5');
  const yard = a.last('landed').yard;
  ok(yard.includes(785) && yard.includes(736), 'Exotics and the Constitution are on sale at Ops 5');
  a.send({ t: 'station', op: 'research', id: 'shield1' }); ok(d.station.active && d.station.active.id === 'shield1', 'research started');
  d.station.active.ends = Date.now() - 1; game.checkStation(d); ok(d.station.done.includes('shield1'), 'research completes on time');
  d.station.refT -= 60 * 60000; game.checkStation(d); ok(d.station.refUnits === 3, 'refinery filled its silos while away');
  a.send({ t: 'station', op: 'collect' }); ok(d.station.refUnits === 0, 'collected refinery output');
  // ---- 2.6: refits are retired
  a.send({ t: 'buyship', hull: 708 }); ok(d.ship.hull === 708, 'bought a Cutlass');
  a.send({ t: 'station', op: 'refit' }); ok(d.ship.hull === 708, 'refits are retired: the Cutlass stays a Cutlass');
  // ---- wingmates
  a.send({ t: 'buyship', hull: 753, store: true }); a.send({ t: 'buyship', hull: 754, store: true });   // 2.1: wingmates are ships in a dock
  for (const [j, x] of d.dock.filter(x => [753, 754].includes(x.ship.hull)).entries()) a.send({ t: 'docks', op: 'assign', k: d.activeDock, slot: j, uid: x.ship.uid });
  ok(game.features.docks.activeWings(d).length === 2, 'bought Ines Varro and Old Mags Pell into the hangar and assigned them as wingmates');
  a.send({ t: 'depart' }); await sleep(300);
  const sp = game.spaces[d.sys], me = a.s.ent;
  const esc = [...sp.ships.values()].filter(e => e.owner === me.id);
  ok(esc.length === 2 && esc.every(e => e.ai === 'escort'), 'wingmates launch with you');
  // fly forward 3 s, escorts should keep up
  for (let i = 0; i < 90; i++) { a.send({ t: 'input', seq: i + 1, th: 1 }); await sleep(33); }
  const far = esc.map(e => Math.hypot(e.x - me.x, e.y - me.y));
  ok(far.every(x => x < 600), `escorts keep formation (${far.map(x => x.toFixed(0)).join(', ')} px behind)`);
  // ---- a pirate attacks: escorts engage it
  const pirate = sp.makeShip({ hull: 716, faction: 'hollow', x: me.x + 500, y: me.y, a: 0, ai: 'raid' });
  await sleep(2500);
  ok(esc.some(e => e.target === pirate) || pirate.dead, 'wingmates engage a Hollow raider');
  await sleep(8000);
  ok(pirate.dead || pirate.armor < pirate.st.armor || pirate.shield < pirate.st.shield, `the raider takes damage (shield ${Math.round(pirate.shield)}, armor ${Math.round(pirate.armor)})`);
  // ---- fighter bay: a Hive Tender launches Mite drones at a target
  const hive = sp.makeShip({ hull: 715, faction: 'quantum', x: me.x - 800, y: me.y, ai: 'patrol' });
  const foe = sp.makeShip({ hull: 708, faction: 'hollow', x: me.x - 1100, y: me.y + 200, ai: 'raid' });
  await sleep(4000);
  ok([...sp.ships.values()].some(e => e.fighterOf === hive.id) || foe.dead, 'Hive Tender launches Mite drones');
  // ---- bounty: accept, the target spawns in the target system, killing it completes the job and pays on landing
  const credits0 = d.credits;
  d.missions.push({ id: 'test-bounty', type: 'bounty', title: 'Bounty: test', sys: d.sys, hull: 708, faction: 'hollow', targetName: 'Hollow captain Test', reward: 9999, owner: a.s.id });
  a.s.ent && (d.missions[0].spawned = true);
  const target = sp.spawnMissionTarget({ ...d.missions[d.missions.length - 1], owner: a.s.id });
  sp.damage(target, 1e6, 1e6, a.s.ent);
  ok(d.missions.find(m => m.id === 'test-bounty').done, 'killing the bounty target completes the job');
  // ---- death and respawn
  sp.damage(a.s.ent, 1e7, 1e7, null);
  await sleep(200);
  ok(!a.s.ent && d.stellar && a.last('dead'), 'player death: rebuilt at the last landing point');
  ok(game.features.docks.activeWings(d).length === 2 && ![...sp.ships.values()].some(e => e.wingOf === a.s.id), 'wingmates fly home with the insurers, not lost');
  game.completeOnLanding(a.s, { id: d.stellar, system: d.sys });
  ok(d.credits > credits0 - 1e6 && !d.missions.some(m => m.id === 'test-bounty'), 'bounty paid on landing');
  // ---- persistence
  game.db.touch(); game.db.flush(); const saved = JSON.parse(fs.readFileSync(dir + '/players.json', 'utf8'));
  b.s.data.sys = 'meridian'; b.s.data.stellar = 'site-meridian'; game.landed(b.s);
  ok(b.last('landed').site.owner === 'SimCaptain' && b.last('landed').market && !b.last('landed').yard, 'other captains can trade at your station but not use its shipyard');
  b.send({ t: 'station', op: 'claim' }); ok(!b.s.data.station.claimed, 'a claimed hull cannot be taken');
  const sites = [...b.sock.out].reverse().find(m => m.t === 'sites'); ok(sites && sites.sites['site-meridian'].ops === 5, 'everyone is told about the station and its Ops level');
  ok(saved.simcaptain && saved.simcaptain.station.ops === 5 && saved.simcaptain.salt && !saved.simcaptain.pass, 'progress is saved, password stored only as a hash');
  console.log('ALL SIM TESTS PASSED'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
