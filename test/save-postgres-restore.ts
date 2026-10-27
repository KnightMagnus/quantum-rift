import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { customCaptainId, NAKAMA_CHECKPOINT_KEY } from '../shared/nakama-contracts.ts';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import type { GameAssets } from '../shared/rules.ts';
import { NakamaService, until, sanitizedDiagnostic } from './helpers/nakama-service.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const service = new NakamaService();
const checks: string[] = [];
const report: Record<string, unknown> = { schema: 1, checks };
try {
  await service.initialize();
  const name = 'Restore Pilot';
  const password = 'synthetic-disposable-password';
  const authenticate = () =>
    service.client.authenticateCustom(customCaptainId(name), true, undefined, {
      pass: password,
      captainName: name,
    });
  const identity = await authenticate();
  const assets: GameAssets = JSON.parse(
    filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  );
  const template = new Game(assets, new DB(tempDataDir('rift-pg-restore-template-')), {
    seedDefinitions: [],
    automaticClock: false,
    defer: () => {},
    randomUUID: () => 'restore-fixture',
  });
  const account = template.db.create(name, 'fixture', template.fresh());
  account.credits = 4321;
  delete account.v26;
  account.directives = { '1': 1 };
  account.dock = [
    {
      ship: structuredClone(account.ship),
      escorts: [{ ship: structuredClone(account.ship) }, { ship: structuredClone(account.ship) }],
    },
  ];
  const checkpoint = {
    schema: 1,
    revision: 4,
    players: { 'restore pilot': account },
    world: {
      sites: {},
      fleets: {
        OLD: { tag: 'OLD', name: 'Synthetic Fleet', leader: name, members: [name], bank: 1000 },
      },
    },
  };
  const encoded = JSON.stringify(checkpoint).replaceAll("'", "''");
  await service.query(`INSERT INTO storage (collection,key,user_id,value,version,read,write)
    VALUES ('qr_server','${NAKAMA_CHECKPOINT_KEY}','00000000-0000-0000-0000-000000000000',
    '${encoded}'::jsonb,md5('synthetic-restore'),0,0)`);
  const world = async (session: typeof identity) =>
    ((await service.client.rpc(session, 'qr_world', {})).payload as { matchId: string }).matchId;
  const match = await world(identity);
  const first = await service.connect(identity);
  await first.socket.joinMatch(match);
  await until(() => first.latest('you'), 'legacy account native login');
  const expectedCredits = 4321 + 1000 + 50000 + 90000 + 1000;
  assert.equal(
    first.latest('you')!.d.credits,
    expectedCredits,
    'Native construction/login pays fleet, founding, directive and dock refunds exactly once',
  );
  first.socket.disconnect(false);
  await until(
    async () =>
      Number(
        await service.query(`SELECT value->'players'->'restore pilot'->>'credits'
    FROM storage WHERE collection='qr_server' AND key='${NAKAMA_CHECKPOINT_KEY}'`),
      ) === expectedCredits,
    'native checkpoint persisted before backup',
  );
  checks.push('Native old-shape login applies exact owner refunds and commits feature markers');
  const backup = await service.restoreDisposableBackup();
  assert.notEqual(backup.sourceDatabase, backup.restoredDatabase);
  assert.equal(backup.archiveSha256.length, 64);
  const restoredIdentity = await authenticate();
  assert.equal(
    restoredIdentity.user_id,
    identity.user_id,
    'PostgreSQL restore retains authenticated identity',
  );
  const restoredMatch = await world(restoredIdentity);
  assert.notEqual(restoredMatch, match);
  const second = await service.connect(restoredIdentity);
  await second.socket.joinMatch(restoredMatch);
  await until(() => second.latest('you'), 'restored copy native login');
  assert.equal(
    second.latest('you')!.d.credits,
    expectedCredits,
    'Restore never duplicates migration refunds',
  );
  const row = `FROM storage WHERE collection='qr_server' AND key='${NAKAMA_CHECKPOINT_KEY}'`;
  const restoredAccount = JSON.parse(
    await service.query(`SELECT (value->'players'->'restore pilot')::text ${row}`),
  );
  assert.equal(restoredAccount.v26, true);
  assert.equal(restoredAccount.directives, undefined);
  assert(
    restoredAccount.dock.every((stored: { escorts?: unknown }) => stored.escorts === undefined),
  );
  assert.equal(await service.query(`SELECT value->'world'->>'fleets' ${row}`), '');
  const sourceCredits = await service.query(
    `SELECT value->'players'->'restore pilot'->>'credits' ${row}`,
    backup.sourceDatabase,
  );
  assert.equal(
    Number(sourceCredits),
    expectedCredits,
    'Restored gameplay uses the copy, not the source',
  );
  checks.push(
    'pg_dump/pg_restore into separate database preserves storage values, CAS versions and permissions',
  );
  checks.push(
    'Restored native authentication and login retain identity, exact economy and consumed migration markers',
  );
  second.socket.disconnect(false);
  await service.restartNakama();
  const restartedIdentity = await authenticate();
  const third = await service.connect(restartedIdentity);
  await third.socket.joinMatch(await world(restartedIdentity));
  await until(() => third.latest('you'), 'restored database second restart');
  assert.equal(third.latest('you')!.d.credits, expectedCredits);
  const finalAccount = JSON.parse(
    await service.query(`SELECT (value->'players'->'restore pilot')::text ${row}`),
  );
  assert.deepEqual(
    finalAccount.log.map((entry: { text: string }) => entry.text),
    restoredAccount.log.map((entry: { text: string }) => entry.text),
    'Restore/restart does not duplicate refund logs',
  );
  assert.equal(
    await service.query(
      `SELECT md5(COALESCE(jsonb_agg(to_jsonb(saved) ORDER BY collection,key,user_id)::text,'[]')) FROM storage saved`,
      backup.sourceDatabase,
    ),
    backup.storageDigest,
    'All source storage rows remain unchanged after restored gameplay',
  );
  checks.push('Second native restart retains restored balances and migration log counts');
  report.status = 'passed';
  report.archiveSha256 = backup.archiveSha256;
} catch (error) {
  report.status = 'failed';
  report.error = sanitizedDiagnostic(String(error));
  process.exitCode = 1;
} finally {
  try {
    report.cleanup = await service.cleanup();
  } catch (error) {
    report.cleanupError = sanitizedDiagnostic(String(error));
    process.exitCode = 1;
  }
  filesystem.writeFileSync(
    path.join(service.run, 'save-restore-results.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
