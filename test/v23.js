// 2.3 tests: ten new common Quantum hulls, more moons and asteroid fields, busier traffic.
import fs from 'node:fs';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYSTEMS, STELLARS, COMMON_HULLS, TRAFFIC, FACTION_HULLS } from '../shared/galaxy.js';
import { SHIPS23 } from '../shared/ships23.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => { if (!c) { console.error('FAIL:', m); process.exit(1); } console.log('ok -', m); };
process.env.SEEDS_FILE = '/nonexistent';
const g = new Game(A, new DB('/tmp/rift-v23-' + Date.now()));
g.features.fronts.event = () => null; g.features.fronts.anomalies = () => ({});   // 2.6: traffic counts must not depend on the weekday's event (Bounty Week brings 50% more raiders)
// new hulls
ok(SHIPS23.length === 10 && SHIPS23.every(H => g.A.ships[H.id] && g.A.ships[H.id].role), 'ten new hulls are in the game, each with a class role');
const dir = decodeURIComponent(new URL('../client/assets/ships/', import.meta.url).pathname);
ok(SHIPS23.every(H => ['', '_glow'].every(s => fs.existsSync(`${dir}${H.id}${s}.webp`)) && fs.existsSync(`${dir}${H.id}_yard.png`)), 'each has its sprite sheet (2.6: WebP with banking), engine glow and shipyard picture');
ok(SHIPS23.every(H => COMMON_HULLS.includes(H.id) && FACTION_HULLS.quantum.includes(H.id)), 'they are sold in Concord yards');
const yardP = Object.values(STELLARS).find(p => p.svc.includes('Y') && p.tech >= 2 && !p.hub && !p.site && SYSTEMS.find(s => s.id === p.system).faction === 'spacer');
ok(yardP && [820, 821].every(h => g.yard(yardP, g.fresh()).includes(h)), 'the cheapest new hulls are sold in common yards everywhere');
ok([821, 824].every(h => TRAFFIC.quantum.traders.includes(h)) && [823, 829].every(h => TRAFFIC.quantum.war.includes(h)), 'and they fly in NPC traffic');
const hub = Object.values(STELLARS).find(p => p.hub), d = g.fresh(); d.credits = 1e8;
ok(g.yard(hub, d).includes(829) || g.A.ships[829].tech > hub.tech, 'the hub shipyard lists the new hulls up to its tech level');
// moons and fields
const moons = Object.values(STELLARS).filter(p => /-m\d$/.test(p.id));
ok(moons.length >= 40 && moons.every(m => m.kind === 'moon' && m.svc === '' && STELLARS[m.id.replace(/-m\d$/, '')]), `${moons.length} new uninhabited moons, each circling a planet`);
ok(Object.keys(STELLARS).length === new Set(Object.keys(STELLARS)).size, 'every world id is unique');
for (const id of ['qstation', 'concordia', 'earth', 'threshold', 'site-qgate', 'meridian-yards']) ok(STELLARS[id] && !/-m\d$/.test(id), `existing world ${id} is unchanged`);
ok(moons.every(m => { const S = SYSTEMS.find(s => s.id === m.system); return S.stellars.every(o => o === m || o.id === m.id || Math.hypot(o.x - m.x, o.y - m.y) > (o.r || 60) + m.r + 100); }), 'new moons keep clear of other worlds');
ok(SYSTEMS.reduce((a, s) => a + (s.fields || []).filter(f => f.id.includes('-x')).length, 0) >= 60, 'many systems gain an extra asteroid field or gas cloud');
// traffic
const sp = g.spaces.halcyon; sp.players = 1; for (let i = 0; i < 30 * 120; i++) sp.tick();
ok(sp.ships.size >= 10, `systems are busier (${sp.ships.size} ships in Halcyon after two minutes)`);
ok([...sp.ships.values()].filter(e => e.ai === 'trade' && e.dest && !e.dest.out).every(e => e.dest.svc && e.dest.svc.includes('L')), 'traders only head for worlds they can land on');
const gl = g.spaces.gloam; gl.players = 1; for (let i = 0; i < 30 * 300; i++) gl.tick();
const raids = [...gl.ships.values()].filter(e => e.ai === 'raid' && !e.owner && !e.mission).length;
ok(raids <= 3 + Math.floor(gl.sys.danger / 2), `even pirate havens cap their raider packs (${raids})`);
console.log('ALL 2.3 TESTS PASSED'); process.exit(0);
