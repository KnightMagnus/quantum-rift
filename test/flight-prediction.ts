import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { FlightPrediction } from '../client/flight-prediction.ts';
import type { PredictionView, PredictionSnapshot } from '../client/flight-prediction.ts';
import { augmentAssets, shipStats, makeLoadout, step } from '../shared/rules.ts';
import type { ComputedShipStats, FlightInput } from '../shared/rules.ts';

// Independent reference: sequence/history and reconciliation blocks from main.ts
// at e8c8c29. Keep this baseline independent of the replacement owner's methods.
function legacyPrediction() {
  let sequence = 0;
  let history: Array<{ seq: number; inp: FlightInput }> = [];
  return {
    nextSequence: () => ++sequence,
    clearPending: () => {
      history = [];
    },
    reset: () => {
      sequence = 0;
      history = [];
    },
    record(
      seq: number,
      input: FlightInput,
      view: PredictionView,
      stats: ComputedShipStats | undefined,
      enabled: boolean,
    ) {
      history.push({ seq, inp: input });
      if (history.length > 90) history.shift();
      if (enabled) step(view, stats!, input);
      view.fl = (input.thrust ? 1 : 0) | (input.ab ? 2 : 0);
    },
    reconcile(
      view: PredictionView | null,
      snapshot: PredictionSnapshot,
      stats: ComputedShipStats | undefined,
      enabled: boolean,
    ) {
      const result =
        view ||
        ({ id: snapshot.id, rx: snapshot.x, ry: snapshot.y, ox: 0, oy: 0 } as PredictionView);
      const previousX = view ? view.x : snapshot.x;
      const previousY = view ? view.y : snapshot.y;
      Object.assign(result, {
        id: snapshot.id,
        x: snapshot.x,
        y: snapshot.y,
        vx: snapshot.vx,
        vy: snapshot.vy,
        a: snapshot.a,
        shield: snapshot.shield,
        armor: snapshot.armor,
        fuel: snapshot.fuel,
        fl: snapshot.fl,
      });
      history = history.filter((entry) => entry.seq > snapshot.acknowledgement);
      if (stats && enabled) for (const entry of history) step(result, stats, entry.inp);
      if (view) {
        result.ox += previousX - result.x;
        result.oy += previousY - result.y;
        if (Math.hypot(result.ox, result.oy) > 300) result.ox = result.oy = 0;
      }
      return result;
    },
  };
}
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const hulls = Object.keys(assets.ships).slice(0, 4);
let comparisons = 0;
for (const hull of hulls) {
  const original = legacyPrediction();
  const replacement = new FlightPrediction();
  let oldView: PredictionView | null = null;
  let newView: PredictionView | null = null;
  const stats = shipStats(assets, makeLoadout(assets, hull))!;
  const snapshot: PredictionSnapshot = {
    id: 1,
    acknowledgement: 0,
    x: 5,
    y: -8,
    vx: 2,
    vy: -3,
    a: 0.5,
    shield: 100,
    armor: 50,
    fuel: 200,
    fl: 0,
  };
  const reconcile = (enabled = true, currentStats: ComputedShipStats | undefined = stats) => {
    const prior = newView;
    oldView = original.reconcile(oldView, snapshot, currentStats, enabled);
    newView = replacement.reconcile(newView, snapshot, currentStats, enabled);
    assert.deepEqual(newView, oldView);
    if (prior) assert.equal(newView, prior, 'reconciliation mutates the existing display ship');
    comparisons++;
  };
  reconcile();
  for (let index = 0; index < 140; index++) {
    const seq = replacement.nextSequence();
    assert.equal(seq, original.nextSequence());
    // Neutral modal-release packets have a sequence but no replay entry.
    if (index % 11 === 0) continue;
    const input: FlightInput = {
      thrust: index % 3 === 0 ? 1 : 0,
      turn: (index % 3) - 1,
      ab: index % 5 === 0 ? 1 : 0,
      rev: index % 7 === 0 ? 1 : 0,
      navigation: index % 7 === 0,
    };
    const enabled = index % 13 !== 0;
    original.record(seq, input, oldView!, stats, enabled);
    replacement.record(seq, input, newView!, stats, enabled);
    assert.deepEqual(newView, oldView);
    comparisons++;
  }
  // Delayed, duplicate and reordered acknowledgements retain original replay behavior.
  for (const acknowledgement of [12, 12, 5, 55, 140, 140]) {
    snapshot.acknowledgement = acknowledgement;
    snapshot.x += 4;
    snapshot.y -= 3;
    reconcile();
  }
  for (const enabled of [false, true, false, true]) {
    const sequence = replacement.nextSequence();
    assert.equal(sequence, original.nextSequence());
    const input = { thrust: 1, turn: -1 };
    original.record(sequence, input, oldView!, stats, enabled);
    replacement.record(sequence, input, newView!, stats, enabled);
    snapshot.acknowledgement++;
    reconcile(enabled, { ...stats, accel: stats.accel * 2 });
  }
  // Preserve tow caps and the snap threshold without taking ownership of towing.
  oldView!.towCap = newView!.towCap = 10;
  snapshot.x += 2000;
  reconcile();
  assert.equal(newView!.ox, 0);
  assert.equal(newView!.oy, 0);
  assert.equal(newView!.towCap, 10);
  original.clearPending();
  replacement.clearPending();
  const next = replacement.nextSequence();
  assert.equal(
    next,
    original.nextSequence(),
    'travel clears pending inputs, not the sequence epoch',
  );
  snapshot.acknowledgement = 0;
  snapshot.x = 0;
  oldView = newView = null;
  reconcile();
  assert.equal(newView!.x, 0, 'travel cannot replay prior-space inputs');
  original.reset();
  replacement.reset();
  assert.equal(replacement.nextSequence(), 1, 'new presence starts at input sequence one');
  assert.equal(original.nextSequence(), 1);
  oldView = newView = null;
  reconcile();
}
// A long unacknowledged run replays only the last 90 inputs, not all sent controls.
const bounded = new FlightPrediction();
const stats = shipStats(assets, makeLoadout(assets, hulls[0]))!;
const snapshot: PredictionSnapshot = {
  id: 1,
  acknowledgement: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  a: 0,
  shield: 100,
  armor: 100,
  fuel: 100,
  fl: 0,
};
const view = bounded.reconcile(null, snapshot, stats, true);
for (let index = 0; index < 100; index++)
  bounded.record(bounded.nextSequence(), { thrust: 1 }, view, stats, false);
const expected = { ...structuredClone(view), fl: snapshot.fl };
for (let index = 0; index < 90; index++) step(expected, stats, { thrust: 1 });
assert.deepEqual(bounded.reconcile(null, snapshot, stats, true), expected);
// Extraction preserves the existing caller contract: enabled prediction requires stats.
// Missing stats with prediction disabled is valid; enabled use remains an error.
for (const owner of [legacyPrediction(), new FlightPrediction()]) {
  const body = owner.reconcile(null, snapshot, undefined, true);
  owner.record(owner.nextSequence(), { thrust: 1 }, body, undefined, false);
  assert.throws(
    () => owner.record(owner.nextSequence(), { thrust: 1 }, body, undefined, true),
    TypeError,
  );
}
console.log(
  `Prediction ownership: ${comparisons} independent baseline comparisons, bounded replay, live stats, resets and disabled prediction passed.`,
);
