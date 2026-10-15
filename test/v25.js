// 2.5 tests: the rendered art set is complete and wired up, plus the polish pass (career steps, market depth, dialogs).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { STELLARS, SYS, EXTRA_OUTFITS } from '../shared/galaxy.js';
import { TUTORIAL, tutMigrate } from '../shared/tutorial.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
process.env.SEEDS_FILE = '/nonexistent';
const C = decodeURIComponent(new URL('../client/', import.meta.url).pathname), AS = C + 'assets/';
const read = (f) => fs.readFileSync(C + f, 'utf8');
{ const bad = []; for (const f of fs.readdirSync(C).filter(f => f.endsWith('.js'))) { try { execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(C + f), stdio: ['pipe', 'ignore', 'ignore'] }); } catch { bad.push(f); } }
  ok(!bad.length, `every client script parses${bad.length ? ': BAD ' + bad : ''}`); }
// planets
const man = JSON.parse(fs.readFileSync(AS + 'planets/planets.json'));
ok(Object.keys(man).length >= 50 && Object.keys(man).every(id => fs.existsSync(AS + `planets/${id}.webp`)), `${Object.keys(man).length} pre-rendered planets, every one on disk`);
const types = new Set(Object.values(man).map(m => m.type));
for (const t of ['earth', 'terran', 'ocean', 'desert', 'ice', 'lava', 'barren', 'gas', 'toxic', 'crystal', 'city', 'jungle']) ok(types.has(t), `planet type ${t} has renders`);
ok(Object.entries(man).every(([id, m]) => ['_tex', '_aux', '_back'].every(x => fs.existsSync(AS + `planets/${id}${x}.webp`)) && (!m.rings || fs.existsSync(AS + `planets/${id}_front.webp`)) && m.tw > 0 && m.bk >= 0), 'every planet has surface maps to turn (2.5.1), and ringed ones a front ring layer');
ok(/function renderRendered/.test(read('planets.js')) && /P\.off \+ t \* P\.spin/.test(read('planets.js')), 'the client turns the rendered planets');
ok(Object.values(man).some(m => m.rings) && Object.values(man).every(m => m.r > 0.3 && m.r < 0.9), 'ringed giants are included and every render records its sphere size');
// stations
const designs = [...read('render.js').matchAll(/'(ring|spindle|cross|rock|twin|yard|disc|hive|crystal|reef|forge|junk)'/g)].map(m => m[1]);
const D = [...new Set(designs)]; ok(D.length === 12 && D.every(d => fs.existsSync(AS + `stations/s_${d}.webp`) && fs.existsSync(AS + `land/l_st_${d}.jpg`)), 'twelve station designs, each with a space sprite and a landing picture');
// landing pictures
const LS = read('ui.js').match(/const LAND_SCENES = (\{[\s\S]*?\});/)[1], scenes = [...LS.matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]).filter(x => !/^(terran|city|ocean|desert|ice|lava|barren|gas|toxic|crystal)$/.test(x) || fs.existsSync(AS + `land/l_${x}.jpg`));
ok(scenes.length >= 20 && scenes.every(x => fs.existsSync(AS + `land/l_${x}.jpg`)), `${scenes.length} landing scenes referenced by the client all exist`);
for (const x of ['earth', 'inalumen', 'threshold', 'moon2', 'lava2', 'desert2', 'jungle1', 'jungle2']) ok(fs.existsSync(AS + `land/l_${x}.jpg`), `landing picture l_${x}`);
const landable = Object.values(STELLARS).filter(p => p.svc.includes('L') && !p.site);
ok(landable.length > 150, `${landable.length} landable worlds now get a rendered picture instead of a colour blur`);
// effects, objects, icons, login
for (const f of ['fx/boom_a.webp', 'fx/boom_b.webp', 'fx/boom_big.webp', 'fx/shards.webp', 'fx/flare.webp', 'ui/login_bg.jpg', 'objects/loot5.webp', 'objects/rock9.webp', 'objects/crys3.webp']) ok(fs.existsSync(AS + f), `asset ${f}`);
ok(EXTRA_OUTFITS.every(o => o.icon && fs.existsSync(AS + o.icon)), `all ${EXTRA_OUTFITS.length} web-game outfits have outfitter pictures`);
const all = Object.values(A.outfits).concat(EXTRA_OUTFITS); ok(all.every(o => o.icon), 'no outfit is left without a picture');
const size = (d) => fs.readdirSync(d, { withFileTypes: true }).reduce((a, e) => a + (e.isDirectory() ? size(d + e.name + '/') : fs.statSync(d + e.name).size), 0);
{ const ships = size(AS + 'ships/'); ok(size(AS) - ships < 29e6, `client art besides the ship sheets stays small enough for one zip (${((size(AS) - ships) / 1e6).toFixed(1)} MB; 2.6 ship sheets ${(ships / 1e6).toFixed(1)} MB ship as part 2)`); }
// polish
ok(!/[^.\w]confirm\(/.test(read('ui.js') + read('main.js')), 'native confirm() dialogs are gone (styled dialog instead)');
ok(TUTORIAL.length === 23 && TUTORIAL.some(t => t.title === 'Meet a contact') && TUTORIAL.some(t => t.title === 'Finish a story'), 'the career guide teaches contacts, troubled systems and stories');
{ const d1 = { tut: 12 }, d2 = { tut: 16 }, d3 = { tut: 20 }, d4 = { tut: 3 }; [d1, d2, d3, d4].forEach(tutMigrate);
  ok(d1.tut === 14 && d2.tut === 19 && d3.tut === 23 && d4.tut === 3 && TUTORIAL[14].title === 'Market and refinery (Ops 2)', 'old saves keep their place in the longer career guide'); }
const g = new Game(A, new DB('/tmp/rift-v25-' + Date.now()));
const port = Object.values(STELLARS).find(p => p.svc.includes('T') && !p.site && !p.outlaw && SYS[p.system].faction === 'quantum');
const sell = (n) => { const s = { id: 900 + n, data: g.fresh(), sock: { open: true, backlog: 0, send() {} } }; s.data.name = 'Depth' + n; g.sessions.set(s.id, s); s.data.stellar = port.id; s.data.sys = port.system; s.data.cargo = { metal: n };
  g.db.world.tradeImpact = {}; const c0 = s.data.credits; g.trade(s, 'metal', -n); return (s.data.credits - c0) / n; };
const small = sell(5), big = sell(150); ok(big < small * 0.9, `a big load sells for less per ton than a small one (${Math.round(big)} vs ${Math.round(small)})`);
console.log('ALL 2.5 TESTS PASSED'); process.exit(0);
