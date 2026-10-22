import assert from 'node:assert/strict';
import { scryptSync, createHash } from 'node:crypto';
import {
  NakamaCaptainAuth,
  nakamaPasswordCrypto,
  verifyLegacyPassword,
  bcryptPasswordInput,
} from '../server/nakama-auth.ts';
import {
  previewLegacyMigration,
  applyLegacyMigration,
  rollbackLegacyMigration,
} from '../server/nakama-migration.ts';
import type { MigrationBackend } from '../server/nakama-migration.ts';
import type { CaptainCredential } from '../shared/nakama-contracts.ts';
import { nakamaUtf8, credentialKey, NAKAMA_CHECKPOINT_KEY } from '../shared/nakama-contracts.ts';
class Storage implements MigrationBackend {
  rows = new Map<string, { value: unknown; version: string }>();
  counter = 0;
  read(key: string) {
    const row = this.rows.get(key);
    return row ? structuredClone(row) : null;
  }
  write(key: string, value: object, version: string) {
    const current = this.rows.get(key);
    if (version === '*' ? !!current : current?.version !== version) throw new Error('CAS');
    const next = String(++this.counter);
    this.rows.set(key, { value: structuredClone(value), version: next });
    return next;
  }
  revertBatch(rows: Array<{ key: string; version: string }>) {
    for (const row of rows) assert.equal(this.rows.get(row.key)?.version, row.version);
    for (const row of rows) this.rows.delete(row.key);
  }
  writeBatch(rows: Array<{ key: string; value: object; version: string }>) {
    for (const row of rows) {
      const current = this.rows.get(row.key);
      if (row.version === '*' ? !!current : current?.version !== row.version)
        throw new Error('CAS');
    }
    for (const row of rows) this.write(row.key, row.value, row.version);
  }
}
for (const input of ['ASCII', 'Captain’s pass 🚀', '\ud800', '\udc00', 'é中']) {
  assert.deepEqual(nakamaUtf8(input), new Uint8Array(Buffer.from(input, 'utf8')));
}
const salt = '00112233445566778899aabbccddeeff';
const nativeCrypto = nakamaPasswordCrypto({
  bcryptHash: (pass) => 'hash:' + pass,
  bcryptCompare: (hash, pass) => hash === 'hash:' + pass,
});
assert.equal(nativeCrypto.bcryptCompare('secret', nativeCrypto.bcryptHash('secret')), true);
const password = 'Captain’s pass 🚀';
// Independent Node fixture, not a second invocation of the bridge under test.
const hash = scryptSync(password, salt, 32).toString('hex');
assert.equal(verifyLegacyPassword(password, salt, hash), true);
assert.equal(verifyLegacyPassword('incorrect', salt, hash), false);
assert.equal(verifyLegacyPassword(password, salt, 'bad'), false);
const players = {
  pilot: { name: 'Pilot', salt, hash, created: 17, credits: 123, storage: { ore: 4 } },
};
const bundle = {
  players: JSON.stringify(players),
  world: JSON.stringify({ sites: { station: 'pilot' }, armadas: {} }),
};
const preview = previewLegacyMigration(bundle, 'fixture-1');
assert.equal(preview.count, 1);
assert.match(preview.hash, /^[a-f0-9]{64}$/);
assert.equal(preview.checkpoint.players.pilot.credits, 123);
assert.equal(preview.credentials.pilot.password.kind, 'legacy-scrypt');
assert.equal(preview.checkpoint.players.pilot.hash, '');
const journalPreview = previewLegacyMigration(
  { ...bundle, players: '{}', journal: { version: 1, ...bundle } },
  'fixture-1',
);
assert.equal(journalPreview.hash, preview.hash);
assert.throws(
  () => previewLegacyMigration({ ...bundle, journal: { version: 2, ...bundle } }, 'bad'),
  /journal/,
);
const reversible = new Storage();
applyLegacyMigration(reversible, preview);
rollbackLegacyMigration(reversible, preview);
assert.equal(reversible.rows.size, 0);
applyLegacyMigration(reversible, preview);
const originalCredential = reversible.read(credentialKey('pilot'))!;
reversible.write(credentialKey('pilot'), { changed: true }, originalCredential.version);
assert.throws(() => rollbackLegacyMigration(reversible, preview), /Credential changed/);
assert.ok(reversible.read(NAKAMA_CHECKPOINT_KEY));
const backend = new Storage();
assert.equal(applyLegacyMigration(backend, preview), 'applied');
assert.equal(applyLegacyMigration(backend, preview), 'already-applied');
const crypto = {
  bcryptHash: (pass: string) => 'test-only:' + pass,
  bcryptCompare: (pass: string, saved: string) => saved === 'test-only:' + pass,
};
let now = 1000;
const auth = new NakamaCaptainAuth(backend, crypto, () => now);
const originalLegacy = backend.read(credentialKey('pilot'))!;
assert.throws(() =>
  auth.beforeAuthenticateCustom(
    { account: { id: 'qr:pilot', vars: { pass: 'wrong' } } },
    'separate-ip',
  ),
);
assert.deepEqual(backend.read(credentialKey('pilot')), originalLegacy);
// A reservation race loser must fail, even if a credential now exists.
const racing = new Storage();
const originalWrite = racing.write.bind(racing);
racing.write = (key, value, version) => {
  if (key.startsWith('credential:')) {
    originalWrite(key, value, version);
    throw new Error('reservation race');
  }
  return originalWrite(key, value, version);
};
assert.throws(
  () =>
    new NakamaCaptainAuth(racing, crypto).beforeAuthenticateCustom(
      { account: { id: 'qr:race', vars: { pass: 'good' } } },
      'race-ip',
    ),
  /Authentication/,
);
const request = { account: { id: 'qr: PILOT ', vars: { pass: password, extra: password } } };
auth.beforeAuthenticateCustom(request, 'one');
assert.equal(request.account.id, 'qr:pilot');
assert.deepEqual(request.account.vars, {});
assert.equal(
  (backend.read(credentialKey('pilot'))!.value as CaptainCredential).password.kind,
  'bcrypt-sha256',
);
assert.equal(
  auth.captainForUser('server-user', (id) => {
    assert.equal(id, 'server-user');
    return { customId: 'qr:pilot' };
  }),
  'Pilot',
);
assert.throws(
  () => auth.captainForUser('bad', () => ({ customId: 'unrelated' })),
  /Authentication/,
);
assert.throws(
  () => auth.captainForUser('bad', () => ({ customId: 'qr:unmapped' })),
  /Authentication/,
);
now += 600_001; // Independent lockout window from the earlier upgrade-denial fixture.
for (let index = 0; index < 6; index++) {
  const wrong = { account: { id: 'qr:pilot', vars: { pass: 'wrong' } } };
  assert.throws(() => auth.beforeAuthenticateCustom(wrong, 'attacker'), /Authentication/);
  assert.deepEqual(wrong.account.vars, {});
}
assert.throws(
  () =>
    auth.beforeAuthenticateCustom(
      { account: { id: 'qr:pilot', vars: { pass: password } } },
      'another-ip',
    ),
  /Authentication/,
);
assert.throws(
  () =>
    auth.beforeAuthenticateCustom(
      { account: { id: 'qr:other', vars: { pass: 'good' } } },
      'attacker',
    ),
  /Authentication/,
);
now += 600_001;
auth.beforeAuthenticateCustom(
  { account: { id: 'qr:pilot', vars: { pass: password } } },
  'attacker',
);
const create = { account: { id: 'qr:Fresh', vars: { pass: 'good' } } };
auth.beforeAuthenticateCustom(create, 'new-ip');
assert.throws(
  () =>
    auth.beforeAuthenticateCustom(
      { account: { id: 'qr:fresh', vars: { pass: 'evil' } } },
      'new-ip',
    ),
  /Authentication/,
);
assert.throws(
  () =>
    auth.beforeAuthenticateCustom(
      { account: { id: 'qr:missing', vars: { pass: 'good' } }, create: false },
      'new-ip',
    ),
  /Authentication/,
);
for (const id of ['qr:__proto__', 'qr:constructor', 'qr:ab', 'qr:bad!', 'other:pilot']) {
  assert.throws(
    () => auth.beforeAuthenticateCustom({ account: { id, vars: { pass: 'good' } } }, 'new-ip'),
    /Authentication/,
  );
}
assert.throws(
  () =>
    auth.beforeAuthenticateCustom(
      { account: { id: 'qr:pilot', vars: { pass: 'x'.repeat(257) } } },
      'new-ip',
    ),
  /Authentication/,
);
// Import never replaces a gameplay checkpoint after any live mutation.
const checkpoint = backend.read(NAKAMA_CHECKPOINT_KEY)!;
backend.write(
  NAKAMA_CHECKPOINT_KEY,
  { ...(checkpoint.value as object), revision: 1 },
  checkpoint.version,
);
assert.throws(() => applyLegacyMigration(backend, preview), /changed/);
assert.throws(() => rollbackLegacyMigration(backend, preview), /changed/);
const conflict = new Storage();
conflict.write(credentialKey('pilot'), { occupied: true }, '*');
assert.throws(() => applyLegacyMigration(conflict, preview), /CAS/);
assert.equal(conflict.read(NAKAMA_CHECKPOINT_KEY), null);
console.log(
  'Nakama transition: independent legacy scrypt, secret stripping, ownership, lockouts, CAS import passed',
);

const longPassword = '船'.repeat(100);
assert.equal(
  bcryptPasswordInput(longPassword),
  createHash('sha256').update(longPassword).digest('hex'),
);
assert.equal(bcryptPasswordInput(longPassword).length, 64);
const longBackend = new Storage();
const longAuth = new NakamaCaptainAuth(longBackend, crypto);
longAuth.beforeAuthenticateCustom(
  { account: { id: 'qr:long pilot', vars: { pass: longPassword, captainName: 'Long Pilot' } } },
  'long',
);
longAuth.beforeAuthenticateCustom(
  { account: { id: 'qr:long pilot', vars: { pass: longPassword } } },
  'long',
);
assert.equal(
  longAuth.captainForUser('long-user', () => ({ customId: 'qr:long%20pilot' })),
  'Long Pilot',
);
assert.throws(
  () =>
    longAuth.beforeAuthenticateCustom(
      { account: { id: 'qr:long pilot', vars: { pass: longPassword + 'x' } } },
      'wrong-long',
    ),
  /Authentication/,
);
