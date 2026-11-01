// Opt-in diagnostic captures: allowlisted fields, bounds, safe rejection and offline replay.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DIAGNOSTIC_CAPTURE_FORMAT,
  DIAGNOSTIC_CAPTURE_LIMITS,
  DIAGNOSTIC_CAPTURE_VERSION,
  DiagnosticRecorder,
  captureBuild,
  parseDiagnosticCapture,
  serializeDiagnosticCapture,
} from '../shared/diagnostic-capture.ts';
import { replayDiagnosticCapture } from '../shared/diagnostic-replay.ts';
import { tradePreview, type TradePreviewInput } from '../shared/economy-preview.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = path.join(root, 'test/fixtures/diagnostic-capture-v1.json');
let clock = 1000;
const now = () => clock;

/** A realistic client input carrying fields that must never reach a capture. */
function previewInput(amount = 5): TradePreviewInput {
  const unrelated = {
    chat: 'meet me at the private-chat-text',
    token: 'session-token-secret',
    password: 'hunter2-password',
    captain: 'Private Captain',
  };
  return Object.assign(unrelated, {
    market: {
      id: 'ore',
      price: 40,
      sellCap: 100,
      name: 'Raw Ore',
      seller: 'Private Captain',
    } as TradePreviewInput['market'],
    amount,
    cargo: { ore: 6, food: 3, secret_cargo: 9 },
    cargoLots: {
      version: 1,
      byCommodity: { ore: { common: 1, rich: 2, pure: 3 }, gas: { common: 0, rich: 0, pure: 0 } },
    },
    credits: 1000,
    freeHold: 20,
    tradePct: 5,
    sell: 1,
    site: false,
    orders: [
      { cid: 'ore', grade: 'pure', qty: 2 },
      { cid: 'food', grade: 'common', qty: 1 },
    ],
  }) as TradePreviewInput;
}
const forbiddenText = [
  'Raw Ore',
  'Private Captain',
  'private-chat-text',
  'session-token-secret',
  'hunter2-password',
  'secret_cargo',
  'food',
  'gas',
];

// Off by default: nothing is recorded or exported before an explicit start.
const recorder = new DiagnosticRecorder(now);
assert.equal(recorder.recording, false);
assert.equal(recorder.recordTradePreview(previewInput(), tradePreview(previewInput()), 1), false);
assert.equal(recorder.size, 0);
assert.deepEqual(recorder.exportCapture().entries, []);

// Allowlisted copy of the previewed commodity only.
recorder.setBuild('3.4.2');
recorder.start();
const input = previewInput();
const observed = tradePreview(input);
assert.equal(observed.warnings.length, 2, 'fixture exercises both preview warnings');
assert.equal(recorder.recordTradePreview(input, observed, 0.25), true);
const exported = recorder.exportCapture();
const exportedText = serializeDiagnosticCapture(exported);
for (const text of forbiddenText)
  assert.equal(exportedText.includes(text), false, `capture must not contain ${text}`);
assert.deepEqual(Object.keys(exported), ['format', 'version', 'build', 'durationMs', 'entries']);
assert.deepEqual(exported.entries[0].input, {
  market: { id: 'ore', price: 40, sellCap: 100 },
  amount: 5,
  cargo: { ore: 6 },
  cargoLots: { version: 1, byCommodity: { ore: { common: 1, rich: 2, pure: 3 } } },
  credits: 1000,
  freeHold: 20,
  tradePct: 5,
  sell: 1,
  site: false,
  orders: [{ cid: 'ore', grade: 'pure', qty: 2 }],
});
assert.deepEqual(exported.build, { game: '3.4.2' });
assert.equal(exported.entries[0].elapsedMs, 0.25);
// Recording does not alter the live input or result.
assert.equal((input as unknown as { chat: string }).chat, 'meet me at the private-chat-text');
assert.deepEqual(tradePreview(input), observed);

// Exported files parse back and reproduce the preview offline.
const reparsed = parseDiagnosticCapture(exportedText);
assert.ok(reparsed.ok);
assert.deepEqual(reparsed.capture, exported);
assert.deepEqual(replayDiagnosticCapture(reparsed.capture), {
  recordedBuild: '3.4.2',
  entries: 1,
  matched: 1,
  mismatches: [],
});

// A full, order-heavy recording must remain readable by the format's own reader.
const denseInput = previewInput();
denseInput.orders = Array.from({ length: DIAGNOSTIC_CAPTURE_LIMITS.maxOrders }, () => ({
  cid: 'ore',
  grade: 'pure',
  qty: 123456789012345,
}));
const denseResult = tradePreview(denseInput);
const denseRecorder = new DiagnosticRecorder(now);
denseRecorder.start();
for (let index = 0; index < DIAGNOSTIC_CAPTURE_LIMITS.maxEntries; index++)
  assert.equal(denseRecorder.recordTradePreview(denseInput, denseResult, 1), true);
const denseText = serializeDiagnosticCapture(denseRecorder.exportCapture());
assert.ok(
  Buffer.byteLength(denseText) <= DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes,
  'a full supported recording cannot export an oversized file',
);
const denseParsed = parseDiagnosticCapture(denseText);
assert.ok(denseParsed.ok);
assert.equal(denseParsed.capture.entries.length, DIAGNOSTIC_CAPTURE_LIMITS.maxEntries);
assert.equal(
  replayDiagnosticCapture(denseParsed.capture).matched,
  DIAGNOSTIC_CAPTURE_LIMITS.maxEntries,
);

// Invalid previews are captured too; unrecordable inputs are skipped without throwing.
assert.equal(recorder.recordTradePreview(previewInput(0), tradePreview(previewInput(0)), 0), true);
assert.equal(recorder.recordTradePreview(previewInput(Number.NaN), {}, 0), false);
assert.equal(recorder.recordTradePreview({ ...previewInput(), market: null }, observed, 0), false);
assert.equal(
  recorder.recordTradePreview(
    { ...previewInput(), market: { id: '<img src=x>', price: 1 } },
    observed,
    0,
  ),
  false,
);
assert.equal(
  recorder.recordTradePreview(
    previewInput(),
    { ...observed, warnings: ['x'.repeat(DIAGNOSTIC_CAPTURE_LIMITS.maxWarningLength + 1)] },
    0,
  ),
  false,
);
assert.equal(recorder.size, 2);

// Count bound: oldest entries are discarded first and timestamps stay relative.
for (let index = 0; index < DIAGNOSTIC_CAPTURE_LIMITS.maxEntries + 10; index++) {
  clock += 10;
  recorder.recordTradePreview(previewInput(index + 1), tradePreview(previewInput(index + 1)), 0);
}
assert.equal(recorder.size, DIAGNOSTIC_CAPTURE_LIMITS.maxEntries);
const bounded = recorder.exportCapture();
assert.equal(bounded.entries[0].input.amount, 11);
assert.ok(bounded.entries.every((entry, index, all) => !index || entry.atMs > all[index - 1].atMs));
assert.ok(
  Buffer.byteLength(serializeDiagnosticCapture(bounded)) <=
    DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes,
  'a full recorder always exports an accepted file',
);
assert.ok(parseDiagnosticCapture(serializeDiagnosticCapture(bounded)).ok);

// Stop keeps entries for export; clear discards them and stops recording.
recorder.stop();
assert.equal(recorder.recordTradePreview(input, observed, 0), false);
assert.equal(recorder.size, DIAGNOSTIC_CAPTURE_LIMITS.maxEntries);
recorder.start();
recorder.clear();
assert.equal(recorder.recording, false);
assert.equal(recorder.size, 0);
assert.equal(recorder.exportCapture().durationMs, 0);

// Lifetime bound: recording ends and entries expire after maxAgeMs.
recorder.start();
recorder.recordTradePreview(input, observed, 0);
clock += DIAGNOSTIC_CAPTURE_LIMITS.maxAgeMs / 2;
recorder.recordTradePreview(input, observed, 0);
clock += DIAGNOSTIC_CAPTURE_LIMITS.maxAgeMs / 2;
assert.equal(recorder.recording, false, 'recording stops itself');
assert.equal(recorder.size, 1, 'the older entry expired');
assert.equal(recorder.recordTradePreview(input, observed, 0), false);
clock += DIAGNOSTIC_CAPTURE_LIMITS.maxAgeMs;
assert.equal(recorder.size, 0);

// Build labels have restricted syntax and length.
assert.equal(captureBuild('3.4.2'), '3.4.2');
assert.equal(captureBuild('27.0.0-nightly+abc'), '27.0.0-nightly+abc');
for (const betaLabel of ['0.5 MP Beta 1', '0.5.1 MP Beta 1', '0.12 MP Beta 10']) {
  assert.equal(captureBuild(betaLabel), betaLabel);
  const betaRecorder = new DiagnosticRecorder(now);
  betaRecorder.setBuild(betaLabel);
  const parsedBeta = parseDiagnosticCapture(
    serializeDiagnosticCapture(betaRecorder.exportCapture()),
  );
  assert.equal(parsedBeta.ok, true);
  if (parsedBeta.ok) assert.equal(parsedBeta.capture.build.game, betaLabel);
}
for (const unsafeBeta of [
  '0.5.1 MP Beta 0',
  '0.5.1 MP Beta 1 Private Captain',
  '0.5.1 MP Beta 1\n',
  '0.5 MP Beta 0',
  '0.5 MP Beta 01',
  '0.5 MP Beta 1 Private Captain',
  ' 0.5 MP Beta 1',
  '0.5 MP Beta 1 ',
  '0.5 MP Beta 1\n',
  '0.5 MP Beta 1\t',
  '0.5 MP Beta ' + '1'.repeat(32),
])
  assert.equal(captureBuild(unsafeBeta), 'unknown');
for (const unsafe of ['<script>', 'Private Captain', '', 42, null, 'x'.repeat(40)])
  assert.equal(captureBuild(unsafe), 'unknown');

// Corrupt, oversized, unknown and newer files are rejected without throwing.
const valid = JSON.parse(exportedText);
function rejection(text: string) {
  const parsed = parseDiagnosticCapture(text);
  assert.equal(parsed.ok, false, text.slice(0, 120));
  return parsed.ok ? null : parsed.reason;
}
function mutated(change: (capture: Record<string, any>) => void) {
  const copy = structuredClone(valid);
  change(copy);
  return JSON.stringify(copy);
}
assert.equal(rejection('{"format":'), 'corrupt');
assert.equal(rejection(''), 'corrupt');
assert.equal(rejection('[]'), 'corrupt');
assert.equal(rejection('null'), 'corrupt');
assert.equal(rejection(' '.repeat(DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes + 1)), 'oversized');
assert.equal(
  rejection('"' + '🚀'.repeat(DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes / 4) + '"'),
  'oversized',
  'byte length, not character count, is bounded',
);
assert.equal(
  rejection(mutated((capture) => (capture.format = 'other-game'))),
  'unsupported-format',
);
assert.equal(rejection(mutated((capture) => (capture.version = 2))), 'unsupported-version');
assert.equal(rejection(mutated((capture) => (capture.version = '1'))), 'unsupported-version');
assert.equal(rejection(mutated((capture) => delete capture.version)), 'unsupported-version');
for (const field of ['tradePct', 'sell', 'site', 'orders']) {
  assert.equal(
    rejection(mutated((capture) => delete capture.entries[0].input[field])),
    'invalid',
    `missing ${field} is not silently defaulted in an exported file`,
  );
  assert.equal(
    rejection(mutated((capture) => (capture.entries[0].input[field] = null))),
    'invalid',
    `null ${field} is not silently defaulted in an exported file`,
  );
}
const oversizedEntry = structuredClone(denseParsed.capture);
oversizedEntry.entries = oversizedEntry.entries.slice(0, 1);
oversizedEntry.entries[0].result.warnings = Array(4).fill('界'.repeat(160));
assert.ok(
  Buffer.byteLength(JSON.stringify(oversizedEntry.entries[0])) >
    DIAGNOSTIC_CAPTURE_LIMITS.maxEntryBytes,
  'otherwise allowed fields can exceed the per-entry limit',
);
assert.equal(
  rejection(JSON.stringify(oversizedEntry)),
  'invalid',
  'reader enforces entry byte cap',
);
for (const [label, change] of [
  ['unknown root field', (capture) => (capture.chat = 'hello')],
  ['unknown input field', (capture) => (capture.entries[0].input.token = 'abc')],
  ['unknown market field', (capture) => (capture.entries[0].input.market.name = 'Raw Ore')],
  ['other commodity cargo', (capture) => (capture.entries[0].input.cargo.food = 1)],
  ['other commodity order', (capture) => (capture.entries[0].input.orders[0].cid = 'food')],
  ['unsupported subsystem', (capture) => (capture.entries[0].subsystem = 'combat')],
  ['non-numeric field', (capture) => (capture.entries[0].input.credits = '1000')],
  ['negative timing', (capture) => (capture.entries[0].elapsedMs = -1)],
  ['free-text build', (capture) => (capture.build.game = 'Private Captain')],
  ['entries not a list', (capture) => (capture.entries = {})],
  [
    'too many entries',
    (capture) =>
      (capture.entries = Array(DIAGNOSTIC_CAPTURE_LIMITS.maxEntries + 1).fill(capture.entries[0])),
  ],
  [
    'too many warnings',
    (capture) => (capture.entries[0].result.warnings = Array(5).fill('warning')),
  ],
] as [string, (capture: Record<string, any>) => void][])
  assert.equal(rejection(mutated(change)), 'invalid', label);
assert.equal(
  rejection(exportedText.replace(/"credits":\s*1000/, '"credits":1e309')),
  'invalid',
  'JSON overflow to Infinity',
);

// Replay reports differences instead of trusting the recorded result.
const tampered = structuredClone(reparsed.capture);
tampered.entries[0].result.buy!.total += 1;
const tamperedReport = replayDiagnosticCapture(tampered);
assert.equal(tamperedReport.matched, 0);
assert.equal(tamperedReport.mismatches[0].replayed!.buy!.total, observed.buy!.total);
const inconsistent = structuredClone(reparsed.capture);
inconsistent.entries[0].input.cargo.ore = 99;
const inconsistentReport = replayDiagnosticCapture(inconsistent);
assert.equal(inconsistentReport.mismatches[0].replayed, null);
assert.match(inconsistentReport.mismatches[0].error!, /aggregate mismatch/);

// The committed version-1 fixture keeps reproducing with this build's trade formulas.
const fixtureText = fileSystem.readFileSync(fixturePath, 'utf8');
const fixture = parseDiagnosticCapture(fixtureText);
assert.ok(fixture.ok, 'version-1 fixture remains readable');
assert.equal(fixture.capture.version, DIAGNOSTIC_CAPTURE_VERSION);
assert.equal(fixture.capture.format, DIAGNOSTIC_CAPTURE_FORMAT);
assert.ok(fixture.capture.entries.length >= 3);
assert.deepEqual(replayDiagnosticCapture(fixture.capture).mismatches, []);

// The offline replay tool reads one local file and reports by exit status.
const scratch = tempDataDir('rift-diagnostic-capture-');
function replayTool(filePath: string) {
  return spawnSync(
    process.execPath,
    [path.join(root, 'tools/replay-diagnostic-capture.ts'), filePath],
    {
      cwd: root,
      encoding: 'utf8',
      timeout: 30000,
    },
  );
}
const matched = replayTool(fixturePath);
assert.equal(matched.status, 0, matched.stderr);
assert.match(matched.stdout, /reproduced/);
const tamperedPath = path.join(scratch, 'tampered.json');
fileSystem.writeFileSync(tamperedPath, serializeDiagnosticCapture(tampered));
const mismatched = replayTool(tamperedPath);
assert.equal(mismatched.status, 1);
assert.match(mismatched.stderr, /0 of 1 trade previews reproduced/);
const oversizedPath = path.join(scratch, 'oversized.json');
fileSystem.writeFileSync(oversizedPath, ' '.repeat(DIAGNOSTIC_CAPTURE_LIMITS.maxCaptureBytes + 1));
const oversized = replayTool(oversizedPath);
assert.equal(oversized.status, 2);
assert.match(oversized.stderr, /oversized/);
const newerPath = path.join(scratch, 'newer.json');
fileSystem.writeFileSync(
  newerPath,
  mutated((capture) => (capture.version = 2)),
);
const newer = replayTool(newerPath);
assert.equal(newer.status, 2);
assert.match(newer.stderr, /unsupported-version/);
assert.equal(replayTool(path.join(scratch, 'missing.json')).status, 2);
const directoryInput = replayTool(scratch);
assert.equal(directoryInput.status, 2, 'non-file input is rejected instead of crashing');
assert.match(directoryInput.stderr, /Cannot read/);
assert.doesNotMatch(directoryInput.stderr, /Error:|at file:/);

console.log(
  'Diagnostic captures: off by default, allowlisted, count/age/byte bounded, safe rejection, offline trade-preview replay and CLI exit codes PASS',
);
