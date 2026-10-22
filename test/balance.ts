import { requiredFixtureValue } from './helpers/required.ts';
// 1.0 balance harness: price ladders, strength-for-money, and how long things take to afford at typical income.
// Prints a report and fails on clear outliers. Run: node test/balance.ts
import filesystem from 'node:fs';
import { FACTION_HULLS, OPS as operationNames, COMMODITIES } from '../shared/galaxy.ts';
import { augmentAssets } from '../shared/rules.ts';
import { RESEARCH2 } from '../shared/hangar.ts';
import { SPECIALISTS } from '../shared/specialty.ts';
import { HOLDOUT } from '../shared/hostile.ts';
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
let invalidValue = 0;
const warn = (message: string) => {
  console.log('  ! ' + message);
  invalidValue++;
};
const formatValue = (quantity: number) => Math.round(quantity).toLocaleString();
// 1) each shipyard ladder: cheaper ships should not be much stronger than dearer ones
console.log('== shipyard ladders (cost -> strength)');
for (const [feature, hulls] of Object.entries(FACTION_HULLS)) {
  const allEntries = hulls.map((hull) => assets.ships[hull]).filter(Boolean);
  for (const role of new Set(allEntries.map((shipHull) => shipHull.role))) {
    if (role === 'survey') continue; // haulers and liners trade strength for cargo
    const rankedHulls = allEntries
      .filter((shipHull) => shipHull.role === role)
      .sort((shipHull, shipHull2) => shipHull.cost - shipHull2.cost);
    for (let index = 1; index < rankedHulls.length; index++) {
      const shipHull = rankedHulls[index - 1],
        shipHull2 = rankedHulls[index];
      if (
        shipHull2.cost > shipHull.cost * 1.25 &&
        shipHull2.strength < shipHull.strength * 0.7 &&
        !(shipHull2.speed > shipHull.speed * 1.08)
      )
        // faster ships may trade strength for speed
        warn(
          `${feature}: ${shipHull2.name} (${formatValue(shipHull2.cost)}) is much weaker than the cheaper ${shipHull.name} (${shipHull.strength} vs ${shipHull2.strength})`,
        );
    }
  }
}
// 2) value for money across every buyable hull: strength per 100k credits should stay within a sane band
console.log('== value for money (strength per 100k cr)');
const buyable = Object.values(assets.ships).filter(
  (session) =>
    session.cost > 0 && session.kind !== 'wingmate' && !session.npcOnly && session.id !== 744,
);
const valueForMoney = buyable
  .map((shipHull) => [shipHull.strength / (shipHull.cost / 1e5), shipHull] as const)
  .sort((firstEntry, secondEntry) => secondEntry[0] - firstEntry[0]);
console.log(
  '  best:',
  valueForMoney
    .slice(0, 4)
    .map(([value, shipHull]) => `${shipHull.name} ${value.toFixed(1)}`)
    .join(', '),
);
console.log(
  '  worst:',
  valueForMoney
    .slice(-4)
    .map(([value, shipHull]) => `${shipHull.name} ${value.toFixed(2)}`)
    .join(', '),
);
const median = valueForMoney[Math.floor(valueForMoney.length / 2)][0];
for (const [value, shipHull] of valueForMoney)
  if (shipHull.kind === 'specialist' && (value < median * 0.15 || value > median * 4))
    warn(
      `specialist ${shipHull.name} is out of line: ${value.toFixed(2)} strength/100k vs median ${median.toFixed(2)}`,
    );
// 3) income per hour (rough, solo) and time to afford the big milestones
console.log('== income per hour (rough estimates, mid-game)');
const cargoJob = 800 + 2 * 1100 + 18 * 60,
  cargoPerHour = cargoJob * 6; // ~6 two-jump cargo runs an hour
const bounty = 300 * 25 + 500,
  bountyPerHour = bounty * 10; // ~10 frigate-class kills an hour
const orePrice = requiredFixtureValue(COMMODITIES.find((commodity) => commodity.id === 'ore')).base,
  minePerHour = 2.5 * 60 * 0.8 * orePrice; // ~2.5 t a minute
const shuttlePerHour = ((2500 + 3 * 2600 * 1.5) * 4) / 2; // four bays, ~2 h runs
const rates = {
  cargo: cargoPerHour,
  bounties: bountyPerHour,
  mining: minePerHour,
  shuttles: shuttlePerHour,
};
for (const [propertyKey, value] of Object.entries(rates))
  console.log(`  ${propertyKey.padEnd(9)} ~${formatValue(value)} cr/h`);
const missionPerHour = (4000 + 300 * 60) * 3; // ~3 bounty contracts an hour on top
const typical = (cargoPerHour + bountyPerHour + missionPerHour + shuttlePerHour) / 2; // a mixed session, half of each
console.log(`  contracts ~${formatValue(missionPerHour)} cr/h`);
const milestones: [string, number][] = [
  ['Ops 1-5 (credits)', operationNames.reduce((totalCost, options) => totalCost + options.cost, 0)],
  ['All research (credits)', RESEARCH2.reduce((totalCost2, result) => totalCost2 + result.cost, 0)],
  [
    'A specialist (after trade-in)',
    SPECIALISTS.reduce((totalCost3, shipHull) => totalCost3 + shipHull.cost, 0) /
      SPECIALISTS.length -
      assets.ships[713].cost * 0.5,
  ],
  ['Halberd Frigate', assets.ships[713].cost],
  ['Bastion Dreadnought', assets.ships[717].cost],
  ['Constitution', assets.ships[736].cost],
];
console.log(`== hours to afford at ~${formatValue(typical)} cr/h`);
for (const [quantity, upgradeCost] of milestones)
  console.log(
    `  ${quantity.padEnd(30)} ${formatValue(upgradeCost).padStart(12)} cr  ~${(upgradeCost / typical).toFixed(1)} h`,
  );
if (milestones[0][1] / typical > 40) warn('Ops 1-5 takes over 40 hours of typical income');
if (milestones[2][1] / typical > 30)
  warn('an average specialist takes over 30 hours of typical income');
// 4) the holdout rewards should beat plain bounty hunting for the time they take (2.6: solo armadas retired)
console.log('== event rewards');
console.log(`  Holdout all 10 waves: ${formatValue(HOLDOUT.reward(10).credits)} cr`);
if (HOLDOUT.reward(10).credits < bountyPerHour / 2)
  warn('a full Holdout pays less than half an hour of bounty hunting');
console.log(invalidValue ? `BALANCE: ${invalidValue} warning(s)` : 'BALANCE OK');
process.exit(invalidValue ? 1 : 0);
