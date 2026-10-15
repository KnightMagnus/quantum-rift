// 1.0 balance harness: price ladders, strength-for-money, and how long things take to afford at typical income.
// Prints a report and fails on clear outliers. Run: node test/balance.js
import fs from 'node:fs';
import { FACTION_HULLS, OPS, COMMODITIES, SYSTEMS, MK2_OF, MK3_OF } from '../shared/galaxy.js';
import { augmentAssets } from '../shared/rules.js';
import { RESEARCH2 } from '../shared/hangar.js';
import { SPECIALISTS, BP_NEED } from '../shared/specialty.js';
import { HOLDOUT } from '../shared/hostile.js';
const A = augmentAssets(JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))));
let bad = 0; const warn = (m) => { console.log('  ! ' + m); bad++; };
const fmt = (n) => Math.round(n).toLocaleString();
// 1) each shipyard ladder: cheaper ships should not be much stronger than dearer ones
console.log('== shipyard ladders (cost -> strength)');
for (const [f, hs] of Object.entries(FACTION_HULLS)) {
  const all = hs.map(h => A.ships[h]).filter(Boolean);
  for (const role of new Set(all.map(x => x.role))) { if (role === 'survey') continue;      // haulers and liners trade strength for cargo
  const L = all.filter(x => x.role === role).sort((a, b) => a.cost - b.cost);
  for (let i = 1; i < L.length; i++) { const a = L[i - 1], b = L[i];
    if (b.cost > a.cost * 1.25 && b.strength < a.strength * 0.7 && !(b.speed > a.speed * 1.08))   // faster ships may trade strength for speed
      warn(`${f}: ${b.name} (${fmt(b.cost)}) is much weaker than the cheaper ${a.name} (${a.strength} vs ${b.strength})`); } }
}
// 2) value for money across every buyable hull: strength per 100k credits should stay within a sane band
console.log('== value for money (strength per 100k cr)');
const buyable = Object.values(A.ships).filter(s => s.cost > 0 && s.kind !== 'wingmate' && !s.npcOnly && s.id !== 744);
const vfm = buyable.map(s => [s.strength / (s.cost / 1e5), s]).sort((a, b) => b[0] - a[0]);
console.log('  best:', vfm.slice(0, 4).map(([v, s]) => `${s.name} ${v.toFixed(1)}`).join(', '));
console.log('  worst:', vfm.slice(-4).map(([v, s]) => `${s.name} ${v.toFixed(2)}`).join(', '));
const med = vfm[Math.floor(vfm.length / 2)][0];
for (const [v, s] of vfm) if (s.kind === 'specialist' && (v < med * 0.15 || v > med * 4)) warn(`specialist ${s.name} is out of line: ${v.toFixed(2)} strength/100k vs median ${med.toFixed(2)}`);
// 3) income per hour (rough, solo) and time to afford the big milestones
console.log('== income per hour (rough estimates, mid-game)');
const cargoJob = 800 + 2 * 1100 + 18 * 60, cargoPerHour = cargoJob * 6;                  // ~6 two-jump cargo runs an hour
const bounty = (300 * 25 + 500), bountyPerHour = bounty * 10;                            // ~10 frigate-class kills an hour
const orePrice = COMMODITIES.find(c => c.id === 'ore').base, minePerHour = 2.5 * 60 * 0.8 * orePrice;   // ~2.5 t a minute
const shuttlePerHour = (2500 + 3 * 2600 * 1.5) * 4 / 2;                                  // four bays, ~2 h runs
const rates = { cargo: cargoPerHour, bounties: bountyPerHour, mining: minePerHour, shuttles: shuttlePerHour };
for (const [k, v] of Object.entries(rates)) console.log(`  ${k.padEnd(9)} ~${fmt(v)} cr/h`);
const missionPerHour = (4000 + 300 * 60) * 3;                                              // ~3 bounty contracts an hour on top
const typical = (cargoPerHour + bountyPerHour + missionPerHour + shuttlePerHour) / 2;       // a mixed session, half of each
console.log(`  contracts ~${fmt(missionPerHour)} cr/h`);
const milestones = [['Ops 1-5 (credits)', OPS.reduce((t, o) => t + o.cost, 0)], ['All research (credits)', RESEARCH2.reduce((t, r) => t + r.cost, 0)],
  ['A specialist (after trade-in)', SPECIALISTS.reduce((t, s) => t + s.cost, 0) / SPECIALISTS.length - A.ships[713].cost * 0.5], ['Halberd Frigate', A.ships[713].cost], ['Bastion Dreadnought', A.ships[717].cost], ['Constitution', A.ships[736].cost]];
console.log(`== hours to afford at ~${fmt(typical)} cr/h`);
for (const [n, c] of milestones) console.log(`  ${n.padEnd(30)} ${fmt(c).padStart(12)} cr  ~${(c / typical).toFixed(1)} h`);
if (milestones[0][1] / typical > 40) warn('Ops 1-5 takes over 40 hours of typical income');
if (milestones[2][1] / typical > 30) warn('an average specialist takes over 30 hours of typical income');
// 4) the holdout rewards should beat plain bounty hunting for the time they take (2.6: solo armadas retired)
console.log('== event rewards');
console.log(`  Holdout all 10 waves: ${fmt(HOLDOUT.reward(10).credits)} cr`);
if (HOLDOUT.reward(10).credits < bountyPerHour / 2) warn('a full Holdout pays less than half an hour of bounty hunting');
console.log(bad ? `BALANCE: ${bad} warning(s)` : 'BALANCE OK'); process.exit(bad ? 1 : 0);
