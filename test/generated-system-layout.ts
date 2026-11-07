import assert from 'node:assert/strict';
import { SYSTEMS } from '../shared/galaxy.ts';
import { hyperspaceArrivalRadius } from '../shared/hyperspace-arrival.ts';
import { K as physicsConstants } from '../shared/rules.ts';

// Script-generated Rift systems spread their worlds, stations and fields over a flyable area.
const generated = SYSTEMS.filter((system) => system.gen && system.region !== 'milky-way');
assert.ok(generated.length > 100, 'the generated Rift systems are present');
const distances = generated
  .flatMap((system) => system.stellars.map((body) => Math.hypot(body.x, body.y)))
  .sort((left, right) => left - right);
const median = distances[distances.length >> 1];
assert.ok(median > 1100, `generated bodies are spread out (median ${Math.round(median)})`);
for (const system of generated) {
  for (const [index, body] of system.stellars.entries())
    for (const other of system.stellars.slice(index + 1))
      assert.ok(
        Math.hypot(body.x - other.x, body.y - other.y) > body.r + other.r + 100,
        `${system.id}: ${body.id} and ${other.id} keep clear of each other`,
      );
  // Jump arrivals still find open space on every bearing.
  for (let bearing = 0; bearing < Math.PI * 2; bearing += Math.PI / 4) {
    const radius = hyperspaceArrivalRadius(system, bearing);
    const x = Math.sin(bearing) * radius,
      y = -Math.cos(bearing) * radius;
    assert.ok(
      system.stellars.every(
        (body) => Math.hypot(body.x - x, body.y - y) >= physicsConstants.jumpClear,
      ),
      `${system.id}: arrival at bearing ${bearing.toFixed(2)} is clear`,
    );
  }
}
console.log('Generated system layout: spread bodies and open arrivals passed');
