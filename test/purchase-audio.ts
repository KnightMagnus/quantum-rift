import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDataDir } from './helpers/temp-data.ts';
const directory = tempDataDir('purchase-signal-');
try {
  const generated = path.join(directory, 'ui_buy.wav');
  const result = spawnSync('python3', ['tools/rift_purchase_audio.py', generated], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const actual = filesystem.readFileSync('client/assets/sfx/ui_buy.wav');
  assert.deepEqual(
    filesystem.readFileSync(generated),
    actual,
    'Checked-in signal exactly reproduces from original oscillator source',
  );
  assert.equal(actual.subarray(0, 4).toString(), 'RIFF');
  assert.equal(actual.readUInt16LE(22), 1);
  assert.equal(actual.readUInt32LE(24), 22050);
  assert.equal(actual.readUInt16LE(34), 16);
  const samples = [];
  for (let index = 44; index < actual.length; index += 2)
    samples.push(actual.readInt16LE(index) / 32768);
  const peak = Math.max(...samples.map(Math.abs));
  const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
  assert.equal(samples.length / 22050, 0.24);
  assert.ok(peak <= 0.181 && peak >= 0.179, 'Quiet peak, no clipping or automatic renormalization');
  assert.ok(rms < 0.04);
  assert.ok(Math.max(...samples.slice(0, 100).map(Math.abs)) < 0.04, 'Soft onset');
  assert.ok(Math.max(...samples.slice(-300).map(Math.abs)) < 0.002, 'Short tapered tail');
  console.log(
    JSON.stringify({ duration: 0.24, peak, rms, bytes: actual.length, reproducible: true }),
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
