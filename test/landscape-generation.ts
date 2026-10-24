import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import inventory from '../tools/landscape-inventory.json' with { type: 'json' };
import { tempDataDir } from './helpers/temp-data.ts';

const directory = tempDataDir('landscape-generation-');
const protectedPaths = fs
  .readdirSync('client/assets/land')
  .filter((name) => name === 'l_earth.jpg' || name.startsWith('l_st_'));
const hash = (file: string) =>
  crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before = new Map(protectedPaths.map((file) => [file, hash('client/assets/land/' + file)]));
const result = spawnSync(
  process.env.PYTHON || 'python3',
  ['tools/rift_colony_landscapes.py', directory, 'desert1'],
  {
    encoding: 'utf8',
    timeout: 180000,
    env: { ...process.env, OPENBLAS_NUM_THREADS: '1', PYTHONDONTWRITEBYTECODE: '1' },
  },
);
assert.equal(result.status, 0, result.stdout + result.stderr);
const actual = fs.readdirSync(directory).filter((file) => file.endsWith('.jpg'));
assert.equal(
  actual.length,
  24,
  'one base and five actual context worlds, with all three colony stages',
);
for (const file of actual) {
  const expected = inventory.find((row) => row.file === file)!;
  assert.ok(expected, file);
  assert.equal(
    hash(path.join(directory, file)),
    expected.sha256,
    'reproduction matches approved output ' + file,
  );
}
const audit = JSON.parse(
  fs.readFileSync(path.join(directory, 'evidence/scene-audit.json'), 'utf8'),
)[0];
assert.ok(audit.groundResidual < 1e-7);
assert.ok(audit.stages[0].changedPixels < audit.stages[1].changedPixels);
assert.ok(audit.stages[1].changedPixels < audit.stages[2].changedPixels);
for (const [file, expected] of before)
  assert.equal(hash('client/assets/land/' + file), expected, 'protected artwork unchanged');
console.log(
  'Production generator reproduces24 approved JPEGs; grounded increasing colony coverage and protected originals passed.',
);
