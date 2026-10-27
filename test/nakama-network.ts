import { PLAYER_PORTRAITS } from '../shared/portraits.ts';
import { evidenceDir } from './helpers/browser-fixture.ts';
import { scryptSync } from 'node:crypto';
import { customCaptainId } from '../shared/nakama-contracts.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Session } from '@heroiclabs/nakama-js';
import { sanitizedDiagnostic, NakamaService, until } from './helpers/nakama-service.ts';
const service = new NakamaService();
const checks: string[] = [];
const result: Record<string, unknown> = { run: service.run, checks };
const password = 'synthetic-test-password-only';
try {
  await service.initialize();
  if (process.env.NAKAMA_TEST_FORCE_FAILURE === '1')
    throw new Error('Injected failure after native service startup');
  const client = service.client;
  // Seed only this disposable database, using an independently generated historical credential.
  const legacyPassword = 'Captain’s pass 🚀';
  const legacySalt = '00112233445566778899aabbccddeeff';
  const legacyCredential = JSON.stringify({
    schema: 1,
    canonical: 'legacy pilot',
    displayName: 'Legacy Pilot',
    created: 17,
    password: {
      kind: 'legacy-scrypt',
      salt: legacySalt,
      hash: scryptSync(legacyPassword, legacySalt, 32).toString('hex'),
    },
  }).replaceAll("'", "''");
  await service.query(
    "INSERT INTO storage (collection,key,user_id,value,version,read,write) VALUES ('qr_server','credential:legacy pilot','00000000-0000-0000-0000-000000000000','" +
      legacyCredential +
      "'::jsonb,md5('legacy-fixture'),0,0)",
  );
  const legacyStarted = performance.now();
  const legacy = await client.authenticateCustom(customCaptainId('Legacy Pilot'), true, undefined, {
    pass: legacyPassword,
    captainName: 'Legacy Pilot',
  });
  result.legacyAuthenticationMs = Math.round(performance.now() - legacyStarted);
  assert(legacy.user_id);
  assert.equal(
    await service.query(
      "SELECT value->'password'->>'kind' FROM storage WHERE collection='qr_server' AND key='credential:legacy pilot'",
    ),
    'bcrypt-sha256',
  );
  await client.authenticateCustom(customCaptainId('Legacy Pilot'), true, undefined, {
    pass: legacyPassword,
  });
  checks.push(
    'Actual Goja legacy scrypt authentication upgrades once to versioned native bcrypt; encoded names and repeat login preserved',
  );
  const authenticate = (name: string, pass = password) =>
    client.authenticateCustom('qr:' + name, true, undefined, {
      pass,
      secretCopy: pass,
      captain: 'bob',
    });
  const alice = await authenticate('alice');
  const bob = await authenticate('bob');
  assert.notEqual(alice.user_id, bob.user_id);
  await assert.rejects(
    authenticate('alice', 'wrong-password'),
    (error: unknown) => error instanceof Response && error.status === 401,
  );
  await assert.rejects(client.authenticateCustom('qr:ab', true, undefined, { pass: password }));
  const tokenPayload = JSON.parse(Buffer.from(alice.token.split('.')[1], 'base64url').toString());
  assert(!JSON.stringify(tokenPayload).includes(password));
  assert.deepEqual(tokenPayload.vrs || {}, {});
  assert.equal(Session.restore(alice.token, alice.refresh_token).user_id, alice.user_id);
  checks.push(
    'Custom registration, wrong password and invalid name denied; all token vars stripped; session restoration',
  );
  const world = async (session: Session) => {
    const response = await client.rpc(session, 'qr_world', {});
    assert.equal((response.payload as { protocol: number }).protocol, 1);
    return (response.payload as { matchId: string }).matchId;
  };
  const matchId = await world(alice);
  assert.equal(await world(bob), matchId);
  const first = await service.connect(alice);
  const second = await service.connect(bob);
  for (const protocol of ['2', '0', 'bad', '']) {
    await assert.rejects(first.socket.joinMatch(matchId, undefined, { protocol }));
    assert.equal(first.latest('you'), undefined, 'rejected protocol cannot enter the Game');
  }
  assert.equal(
    (await first.socket.joinMatch(matchId, undefined, { protocol: '1' })).authoritative,
    true,
  );
  await second.socket.joinMatch(matchId);
  checks.push(
    'Future/malformed native join epochs denied before Game login; current and missing legacy epochs admitted',
  );
  await until(() => first.latest('you') && second.latest('you'), 'real Game hello/you');
  assert.equal(first.latest('welcome')!.name.toLowerCase(), 'alice');
  assert.equal(first.latest('you')!.d.name.toLowerCase(), 'alice');
  assert.equal(second.latest('you')!.d.name.toLowerCase(), 'bob');
  assert(first.latest('you')!.d.ship);
  assert(Number.isFinite(first.latest('you')!.d.credits));
  const initialCredits = first.latest('you')!.d.credits;
  const economicBefore = JSON.stringify({
    credits: first.latest('you')!.d.credits,
    cargo: first.latest('you')!.d.cargo,
    ship: first.latest('you')!.d.ship,
    mats: first.latest('you')!.d.mats,
  });
  for (const packet of [
    null,
    [],
    { t: 'industrial', op: [] },
    { t: 'industrial', op: 'recipe', recipe: [], grade: 'common' },
    { t: 'industrial', op: 'recipe', recipe: 'alloy', grade: null },
    { t: 'industrial', op: 'recipe', recipe: 'x'.repeat(201), grade: 'common' },
    { t: 'buyship', hull: null },
    { t: 'buyship', hull: '201', store: [] },
    { t: 'outfit', id: [], n: 1 },
    { t: 'outfit', id: 5, n: null },
    { t: 'buymat', mat: 'alloy', grade: [], n: 1 },
    { t: 'buymat', mat: '__proto__', grade: 0, n: 1 },
    { t: 'buymat', mat: 'x'.repeat(201), grade: 0, n: 1 },
    { t: 'trade', cid: 'food', qty: null },
    { t: 'trade', cid: 'food', qty: [] },
    { t: 'trade', cid: 'x'.repeat(201), qty: 3 },
    { t: 'refinery', op: 'quote', recipe: 'alloy', n: null },
    { t: 'miningOrder', op: 'accept', id: [] },
    { t: 'towing', op: 'deliver', id: 1, revision: null },
  ]) {
    await first.socket.sendMatchState(matchId, 1, JSON.stringify(packet));
    await delay(40);
  }
  await first.socket.sendMatchState(matchId, 1, JSON.stringify({ t: 'refinery', op: 'list' }));
  await until(() => first.latest('refinery'), 'native economic denial barrier');
  assert.equal(
    JSON.stringify({
      credits: first.latest('you')!.d.credits,
      cargo: first.latest('you')!.d.cargo,
      ship: first.latest('you')!.d.ship,
      mats: first.latest('you')!.d.mats,
    }),
    economicBefore,
  );
  checks.push(
    'Real native malformed economic requests preserve credits and cargo, followed by a valid refinery request',
  );

  checks.push(
    'Singleton authoritative world; actual Game welcome, fresh captain ship and finite credits',
  );
  await assert.rejects(
    client.authenticateDevice('synthetic-outsider-device', true),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
  // A valid server-signed principal must still own a captain, independently of provider shutdown.
  const outsider = await service.unmappedSession(alice);
  await assert.rejects(
    client.linkCustom(alice, { id: customCaptainId('Reserved Target') }),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
  await assert.rejects(
    client.unlinkCustom(alice, { id: customCaptainId('alice') }),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
  await assert.rejects(
    client.linkDevice(alice, { id: 'persistent-backdoor-fixture' }),
    (error: unknown) => error instanceof Response && error.status === 403,
  );
  await assert.rejects(world(outsider));
  const outsiderSocket = await service.connect(outsider);
  await assert.rejects(outsiderSocket.socket.joinMatch(matchId));
  const forged = Session.restore(alice.token, alice.refresh_token);
  forged.token = alice.token.slice(0, -8) + 'aaaaaaaa';
  await assert.rejects(service.connect(forged));
  await assert.rejects(
    client.readStorageObjects(bob, {
      object_ids: [
        {
          collection: 'qr_server',
          key: 'authoritative_world_v1',
          user_id: '00000000-0000-0000-0000-000000000000',
        },
        {
          collection: 'qr_server',
          key: 'credential:alice',
          user_id: '00000000-0000-0000-0000-000000000000',
        },
      ],
    }),
    (error: unknown) => error instanceof Response && error.status === 400,
  );
  assert.equal(
    await service.query(
      "SELECT count(*) FROM storage WHERE collection='qr_server' AND (read<>0 OR write<>0)",
    ),
    '0',
  );
  checks.push(
    'Non-custom identity RPC/join and forged session denied; credentials/checkpoint server-only permissions',
  );
  const send = (connection: typeof first, packet: object, opcode = 1) =>
    connection.socket.sendMatchState(matchId, opcode, JSON.stringify(packet));
  const selectedPortrait = PLAYER_PORTRAITS.at(-1)!.id;
  const otherPortrait = PLAYER_PORTRAITS[1].id;
  await send(first, { t: 'portrait', portraitId: selectedPortrait });
  await until(
    () => first.latest('portrait')?.ok === true,
    'native portrait selection acknowledged',
  );
  assert.equal(first.latest('you')!.d.portraitId, selectedPortrait);
  await send(second, {
    t: 'portrait',
    portraitId: otherPortrait,
    name: 'alice',
    target: first.latest('welcome')!.id,
  });
  await until(
    () => second.latest('portrait')?.ok === true,
    'spoofed target stays bound to authenticated captain',
  );
  assert.equal(second.latest('you')!.d.portraitId, otherPortrait);
  assert.equal(first.latest('you')!.d.portraitId, selectedPortrait);
  await send(second, { t: 'portrait', portraitId: '../outside.png' });
  await until(() => second.latest('portrait')?.ok === false, 'invalid native portrait rejected');
  assert.equal(second.latest('you')!.d.portraitId, otherPortrait);
  await send(second, { t: 'profile', name: 'alice' });
  await until(() => second.latest('profile')?.p, 'public profile portrait projection');
  assert.equal(second.latest('profile')!.p.portraitId, selectedPortrait);
  checks.push(
    'Native authenticated portrait selection, spoofed-target isolation, invalid-path denial and public profile projection',
  );
  await send(first, { t: 'depart' });
  await send(second, { t: 'depart' });
  await until(() => first.latest('snap') && second.latest('snap'), 'actual flight snapshots');
  const initial = [...first.latest('snap')!.me];
  assert.notEqual(initial[0], second.latest('snap')!.me[0]);
  await send(first, { t: 'input', seq: 1, th: 1, tu: 0 });
  await until(() => first.latest('snap')!.me[1] === 1, 'input sequence acknowledgement');
  await until(
    () =>
      Math.hypot(
        first.latest('snap')!.me[2] - initial[2],
        first.latest('snap')!.me[3] - initial[3],
      ) > 1,
    'native Space physics movement',
  );
  await send(first, { t: 'input', seq: 2, th: 0 });
  await until(() => first.latest('snap')!.me[1] === 2, 'release acknowledgement');
  for (const connection of [first, second]) {
    for (const packet of connection.packets.filter((entry) => entry.t === 'snap')) {
      assert(packet.me.slice(0, 11).every(Number.isFinite));
      assert.equal(packet.me[0], connection.latest('snap')!.me[0]);
      assert.deepEqual(Object.keys(packet.attention).sort(), ['scanned', 'targeted']);
      assert.equal(typeof packet.attention.targeted, 'boolean');
      assert.equal(typeof packet.attention.scanned, 'boolean');
    }
    for (const packet of connection.packets.filter((entry) => entry.t === 'you'))
      assert.equal(packet.d.name.toLowerCase(), connection === first ? 'alice' : 'bob');
  }
  checks.push(
    'Actual depart, finite private me snapshots, sequence acknowledgement and Space movement',
  );
  await first.socket.sendMatchState(matchId, 1, '{');
  await send(first, { t: 'input', seq: 2147483647, th: 1 });
  await send(first, { t: 'input', seq: 3, th: 999 });
  await send(first, { t: 'input', seq: 1, th: 1 });
  await send(first, { t: 'you', d: { name: 'bob', credits: 999999999 } });
  await send(first, { t: 'snap', me: [1, 9, 999999999, 999999999] }, 2);
  await send(first, { t: 'hello', name: 'bob', pass: password });
  await delay(300);
  assert.equal(first.latest('snap')!.me[1], 2);
  assert(
    first
      .latest('snap')!
      .me.slice(2, 6)
      .every((value: number) => Number.isFinite(value) && Math.abs(value) < 999999999),
  );
  checks.push(
    'Malformed, future, invalid and replayed input rejected; forged captain/state/opcode cannot replace authority',
  );
  const before = performance.now();
  const prior = [...first.latest('snap')!.me];
  await Promise.all(
    Array.from({ length: 150 }, (_, index) =>
      send(first, {
        t: 'input',
        seq: index + 3,
        th: 0,
        tu: 0,
        x: 999999999,
        credits: 999999999,
        dt: 999999,
      }),
    ),
  );
  await send(second, { t: 'input', seq: 1, th: 0 });
  await until(() => second.latest('snap')!.me[1] === 1, 'other captain progresses during flood');
  await delay(250);
  const after = first.latest('snap')!.me;
  result.flood = { submitted: 150, priorSequence: prior[1], acknowledgedSequence: after[1] };
  // Transport may split the flood across match callbacks. A highest sequence is
  // not an admission count; nakama-world-lease verifies the exact per-batch cap.
  assert(after[1] >= 3 && after[1] <= 152, 'Flood acknowledges only submitted input sequences');
  assert(
    Math.hypot(after[2] - prior[2], after[3] - prior[3]) <
      10000 * ((performance.now() - before) / 1000 + 1),
    'Input count must not speed up physics',
  );
  checks.push(
    '150-packet native flood preserves peer progress and bounded physics; client position, credits and dt remain non-authoritative',
  );
  const duplicate = await service.connect(alice);
  await assert.rejects(duplicate.socket.joinMatch(matchId, undefined, { protocol: '2' }));
  assert.equal(duplicate.latest('you'), undefined);
  assert.equal(
    first.disconnected,
    false,
    'incompatible reconnect must not replace the active captain',
  );
  assert.equal(first.latest('you')!.d.credits, initialCredits);
  await duplicate.socket.joinMatch(matchId);
  await until(() => duplicate.latest('you'), 'duplicate sign-in replacement');
  await until(
    () =>
      first.disconnected ||
      first.packets.some((packet) => packet.t === 'kick' || packet.t === 'error'),
    'old sign-in kicked',
  );
  assert.equal(duplicate.latest('you')!.d.credits, initialCredits);
  await send(duplicate, { t: 'depart' });
  await until(() => duplicate.latest('snap'), 'reconnected flight');
  assert.equal(
    duplicate.latest('snap')!.me[1],
    0,
    'No stale input acknowledgement after reconnect',
  );
  await send(duplicate, { t: 'input', seq: 1, th: 0 });
  await until(() => duplicate.latest('snap')!.me[1] === 1, 'reconnect fresh input');
  checks.push(
    'Duplicate sign-in replaces old captain session; account retained; no stale input sequence',
  );
  await client.sessionLogout(bob, bob.token, bob.refresh_token);
  second.socket.disconnect(false);
  await assert.rejects(service.connect(bob));
  await assert.rejects(client.sessionRefresh(bob));
  checks.push('Logged-out access/refresh tokens cannot reconnect or refresh');
  duplicate.socket.disconnect(false);
  await delay(300);
  await service.restartNakama();
  const checkpoint = JSON.parse(
    await service.query(
      "SELECT value::text FROM storage WHERE collection='qr_server' AND key='authoritative_world_v1'",
    ),
  );
  assert(checkpoint.players.alice);
  assert.equal(checkpoint.players.alice.portraitId, selectedPortrait);
  assert.equal(checkpoint.players.bob.portraitId, otherPortrait);
  assert(checkpoint.players.bob);
  assert(checkpoint.world.sites);
  const revision = checkpoint.revision;
  const restoredSession = await authenticate('alice');
  assert.equal(restoredSession.user_id, alice.user_id);
  const restoredMatch = await world(restoredSession);
  assert.notEqual(restoredMatch, matchId);
  const restored = await service.connect(restoredSession);
  await restored.socket.joinMatch(restoredMatch);
  await until(() => restored.latest('you'), 'durable account restored after server restart');
  assert.equal(restored.latest('you')!.d.credits, initialCredits);
  assert.equal(
    restored.latest('you')!.d.portraitId,
    selectedPortrait,
    'portrait survives real native service restart and reauthentication',
  );
  assert.deepEqual(restored.latest('you')!.d.ship, duplicate.latest('you')!.d.ship);
  const recovered = JSON.parse(
    await service.query(
      "SELECT value::text FROM storage WHERE collection='qr_server' AND key='authoritative_world_v1'",
    ),
  );
  assert(recovered.revision >= revision);
  assert.deepEqual(recovered.world.sites, checkpoint.world.sites);
  checks.push(
    'Nakama-only restart retains PostgreSQL account identity, game account and world checkpoint',
  );
  result.status = 'passed';
} catch (error) {
  result.status = 'failed';
  result.error =
    error instanceof Response
      ? 'HTTP ' + error.status + ': ' + (await error.text())
      : error instanceof Error
        ? error.stack || error.message
        : typeof error === 'object' && error !== null
          ? JSON.stringify({
              code: Reflect.get(error, 'code'),
              message: Reflect.get(error, 'message'),
            })
          : String(error);
  process.exitCode = 1;
} finally {
  try {
    result.exits = await service.cleanup();
  } catch (error) {
    result.cleanupError = String(error);
    process.exitCode = 1;
    result.status = 'failed';
  }
  fs.writeFileSync(path.join(service.run, 'result.json'), JSON.stringify(result, null, 2));
  fs.writeFileSync(
    path.join(evidenceDir('nakama-network'), 'result.json'),
    JSON.stringify(
      {
        status: result.status,
        checks,
        legacyAuthenticationMs: result.legacyAuthenticationMs,
        flood: result.flood,
        error: typeof result.error === 'string' ? sanitizedDiagnostic(result.error) : undefined,
        cleanupError:
          typeof result.cleanupError === 'string'
            ? sanitizedDiagnostic(result.cleanupError)
            : undefined,
        exits: result.exits,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(result, null, 2));
}
