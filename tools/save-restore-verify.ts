import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import filesystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DB } from '../server/db.ts';
import { previewCargoMigration } from '../server/save-migrations.ts';

/** Read a stopped local snapshot into a disposable restore; never open the source with DB. */
export function verifySaveRestore(sourceDirectory: string, scratchDirectory: string) {
  const source = filesystem.realpathSync(sourceDirectory);
  const scratch = filesystem.realpathSync(scratchDirectory);
  if (scratch === source || scratch.startsWith(source + path.sep))
    throw new Error('Scratch directory must be outside the source save');
  const files = ['players.json', 'world.json', 'checkpoint.json'];
  const originals = new Map<string, Buffer>();
  for (const filename of files) {
    try {
      const fullPath = path.join(source, filename);
      if (!filesystem.lstatSync(fullPath).isFile())
        throw new Error('Save inputs must be regular files');
      originals.set(filename, filesystem.readFileSync(fullPath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  // A missing source is not an empty successful rehearsal. Journal-only commits are valid.
  if (
    !originals.has('checkpoint.json') &&
    (!originals.has('players.json') || !originals.has('world.json'))
  )
    throw new Error('Restore needs both snapshots or a committed checkpoint journal');
  const restoredDirectory = filesystem.mkdtempSync(path.join(scratch, 'rift-restore-'));
  try {
    for (const [filename, bytes] of originals)
      filesystem.writeFileSync(path.join(restoredDirectory, filename), bytes, { mode: 0o600 });
    const restored = new DB(restoredDirectory);
    const before = structuredClone(restored.world);
    const migrated = previewCargoMigration(restored.players);
    const again = previewCargoMigration(migrated.players);
    assert.equal(again.changedAccounts, 0, 'Cargo migration must be idempotent');
    assert.deepEqual(again.players, migrated.players);
    restored.players = migrated.players;
    restored.touch();
    restored.flush();
    const reopened = new DB(restoredDirectory);
    assert.deepEqual(reopened.players, Object.assign(Object.create(null), migrated.players));
    assert.deepEqual(reopened.world, before);
    assert.equal(previewCargoMigration(reopened.players).changedAccounts, 0);
    // Detect a concurrently changed source; operators must stop the source process first.
    for (const filename of files) {
      const fullPath = path.join(source, filename);
      const original = originals.get(filename);
      if (original) assert.deepEqual(filesystem.readFileSync(fullPath), original, 'Source changed');
      else assert.equal(filesystem.existsSync(fullPath), false, 'Source changed');
    }
    return {
      schema: 1,
      checkedMigration: 'cargo-ledger-v1',
      accounts: Object.keys(reopened.players).length,
      changedAccounts: migrated.changedAccounts,
      journalRecovered: originals.has('checkpoint.json'),
      sourceHashes: Object.fromEntries(
        [...originals].map(([filename, bytes]) => [
          filename,
          crypto.createHash('sha256').update(bytes).digest('hex'),
        ]),
      ),
      checks: [
        'cargo-idempotence',
        'local-checkpoint-reopen',
        'world-preserved',
        'source-unchanged',
      ],
      limits: [
        'Cargo/storage ledger only; no Game login or other feature migrations.',
        'Not a native Nakama restore, reverse migration or cross-version archive test.',
      ],
    };
  } finally {
    filesystem.rmSync(restoredDirectory, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 4)
      throw new Error('Usage: node tools/save-restore-verify.ts SOURCE_SAVE PRIVATE_SCRATCH');
    console.log(JSON.stringify(verifySaveRestore(process.argv[2], process.argv[3]), null, 2));
  } catch {
    // Save parser errors can quote source data; only the fixed category leaves this process.
    console.error('Save restore verification failed; source was not modified.');
    process.exitCode = 1;
  }
}
