import assert from 'node:assert/strict';

import { simulateCombatPlayability } from './helpers/combat-playability-simulation.ts';
const full = !process.argv.includes('--smoke');
const scenarios = full
  ? [
      { system: 'emberlight', fleet: [708], upgraded: false },
      { system: 'gloam', fleet: [736, 717, 717], upgraded: true },
      { system: 'umbra', fleet: [787, 786, 736], upgraded: true },
    ]
  : [{ system: 'emberlight', fleet: [708], upgraded: false }];
const results = scenarios.flatMap((scenario) =>
  (full ? [1701, 1702, 1703] : [1701]).map((seed) => {
    const result = simulateCombatPlayability({ ...scenario, seed, seconds: full ? 480 : 30 });
    assert.ok(Number.isFinite(result.power) && result.power > 0, 'finite fitted fleet power');
    assert.ok(Number.isFinite(result.damageTaken) && result.damageTaken >= 0);
    assert.ok(Number.isFinite(result.remainingHullFraction) && result.remainingHullFraction >= 0);
    assert.ok(result.aliveSeconds > 0 && result.aliveSeconds <= result.seconds);
    assert.ok(Number.isInteger(result.kills) && result.kills >= 0);
    assert.ok(Number.isInteger(result.disables) && result.disables >= 0);
    assert.ok(result.peakHostiles >= result.arrivalHostiles);
    if (result.survived) assert.equal(result.aliveSeconds, result.seconds);
    console.log(JSON.stringify(result));
    return result;
  }),
);
if (full && !process.argv.includes('--report-only')) {
  for (const scenario of scenarios) {
    const runs = results.filter((result) => result.system === scenario.system);
    const contestedSurvivors = runs.filter(
      (result) =>
        result.survived && result.damageTaken > 0 && (result.kills > 0 || result.disables > 0),
    );
    assert.ok(
      contestedSurvivors.length >= 2,
      `${scenario.system}: ${contestedSurvivors.length}/3 contested eight-minute survivors; at least 2 required (positive damage and a kill or player-caused disable in each surviving run)`,
    );
  }
}
