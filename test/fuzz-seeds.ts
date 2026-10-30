import assert from 'node:assert/strict';
import { packetSeed, packetRandom } from './helpers/fuzz-random.ts';
const trace = (seed: number) => {
  const random = packetRandom(seed);
  return Array.from({ length: 1000 }, () => random());
};
assert.deepEqual(trace(123456789), trace(123456789));
assert.deepEqual(trace(42), trace(42));
assert.notDeepEqual(trace(123456789), trace(42));
assert.equal(trace(123456789)[0], 0.2142903469502926);
assert.equal(packetSeed(undefined, {}), 123456789);
assert.equal(packetSeed(undefined, { RIFT_TEST_SEED: '4' }), 4);
assert.equal(packetSeed(undefined, { RIFT_TEST_SEED: '4', RIFT_FUZZ_PACKET_SEED: '5' }), 5);
assert.equal(packetSeed('0', { RIFT_FUZZ_PACKET_SEED: '5' }), 0);
for (const invalid of ['', '-1', 'NaN', '1.5', '4294967296'])
  assert.throws(() => packetSeed(invalid, {}));
console.log('Packet seed precedence, rejection and replay diversity passed');
