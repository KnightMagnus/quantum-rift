// 2.5.2 tests: the bug-fix and quality-of-life pass (story needs, supply warnings, mining hints, markets for mined goods,
// war fleets and newcomers, map station marker, broken-ring art).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { needsOf } from '../server/quests.js';
import { STELLARS, SYS } from '../shared/galaxy.js';
import { CHAINS } from '../shared/quests.js';
import { price, makeLoadout } from '../shared/rules.js';
import { TUTORIAL } from '../shared/tutorial.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
process.env.SEEDS_FILE = '/nonexistent';
const C = new URL('../client/', import.meta.url).pathname, read = (f) => fs.readFileSync(C + f, 'utf8');
{ const bad = []; for (const f of fs.readdirSync(C).filter(f => f.endsWith('.js'))) { try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(C + f), stdio: ['pipe', 'ignore', 'ignore'] }); } catch { bad.push(f); } }
  ok(!bad.length, `every client script parses${bad.length ? ': BAD ' + bad : ''}`); }
// markets for mined goods
const mk = Object.values(STELLARS).filter(p => p.svc.includes('T') && !p.site), n = (c) => mk.filter(p => price(p, c) !== null).length;
ok(n('shards') >= 60 && n('ore') >= 80 && n('gas') >= 70, `more markets buy mined goods (ore ${n('ore')}, gas ${n('gas')}, shards ${n('shards')} of ${mk.length})`);
// stories say what they need
const fr = CHAINS.find(x => x.id === 'medicine'); ok(needsOf(fr.steps).hold === 12 && needsOf(fr.steps).pax === 1, 'a story reports the most hold space and bunks its steps ask for');
const g = new Game(A, new DB('/tmp/rift-v252-' + Date.now()));
function fake(name) { const sock = new EventEmitter(); sock.open = true; sock.backlog = 0; const out = []; sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m); sock.close = () => {};
  g.connect(sock, '7.7.9.' + name.length); sock.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' })); const s = [...g.sessions.values()].pop(); return { s, d: s.data, out, toasts: () => out.filter(m => m.t === 'toast').map(m => m.msg) }; }
const P = fake('Need Checker'); P.d.stellar = 'concordia'; P.d.sys = STELLARS.concordia.system;
const offs = g.offers(STELLARS.concordia, P.d).filter(o => o.type === 'quest'); ok(offs.length && offs.every(o => o.needs && 'hold' in o.needs && 'pax' in o.needs), 'story offers carry their needs to the job board');
ok(/questNeeds\(o\)/.test(read('ui.js')) && /switch ships for this step/.test(read('missions.js')), 'the job card warns and a stuck step says to switch ships');
ok(/o\.type === 'supply' && !y\.shipless/.test(read('ui.js')), 'supply jobs warn when the hold is too small');
ok(/Cargo Compression outfit first/.test(TUTORIAL.find(t => t.title === 'Mine 10 tons').text), 'the mining career step explains ships with no hold');
// mining hints
const M = fake('Dart Miner'); M.d.ship = makeLoadout(A, 790, 'Dart'); M.d.sys = 'qgate';
g.onLoot({ s: M.s }, { ore: 'ore', n: 3 }); ok(M.toasts().some(t => /no cargo hold/.test(t)), 'mining in a ship with no hold explains why and what to fit');
const H = fake('Full Miner'); H.d.ship = makeLoadout(A, 704, 'Dory'); H.d.sys = 'qgate'; H.d.cargo = { food: 70 };
g.onLoot({ s: H.s }, { ore: 'ore', n: 3 }); ok(H.toasts().some(t => /Cargo hold full\. Raw Ore sells at .+/.test(t)), `a full hold names the nearest buyer (${H.toasts().pop()})`);
ok(g.nearestBuyer('qgate', 'shards') && g.nearestBuyer('qgate', 'shards').j <= 5, 'the nearest buyer of crystal shards is a few jumps at most');
// war fleets and newcomers
{ const sp = g.spaces.halcyon; sp.players = 1; const N = fake('Fresh Captain'); N.d.sys = 'halcyon'; N.d.stellar = null;
  const me = sp.makeShip({ hull: 703, faction: 'quantum', x: 0, y: 0, player: { s: N.s, id: N.s.id, name: 'Fresh Captain' } }); me.graceT = -1;
  const w = sp.makeShip({ hull: 708, faction: 'korrund', x: 300, y: 0, ai: 'patrol' }); w.warFleet = true;
  ok(sp.inner() ? sp.spared(w, me) : true, 'war fleets leave newcomers alone in inner space, like pirates'); sp.players = 0; }
// map, cargo panel, shipyard
ok(/myStSys === s\.id/.test(read('render.js')) && /your station/.test(read('render.js')) && /id="ghome"/.test(read('index.html')), 'the galaxy map marks your station, lists it in the legend and has a HOME button');
ok(/export function bestSale/.test(read('info_ui.js')), 'the cargo panel shows the best nearby buyer for each good');
ok(/NO CARGO HOLD/.test(read('ui.js')) && /yardSorted/.test(read('ui.js')) && /only what fits/.test(read('ui.js')), 'the shipyard tags ships with no hold and sorts; the outfitter can show only what fits');
// art
for (const f of ['ruin_0', 'ruin_1', 'arc_0', 'arc_1']) ok(fs.statSync(C + `assets/decor/${f}.webp`).size > 20000, `the ${f} scenery is the detailed 2.5.2 render`);
ok(/size: 900 \+ r\(\) \* 700/.test(read('render.js')), 'megastructure arcs are drawn smaller');
console.log('ALL 2.5.2 TESTS PASSED'); process.exit(0);
