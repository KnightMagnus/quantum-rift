/** Three real clients share one production friends authority and isolated persistent universe. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { FriendHost, until, password } from './helpers/friend-host.ts';
import type { FriendClient } from './helpers/friend-host.ts';
const host = new FriendHost('friend-host-network');
const checks: Record<string, unknown> = {};
const names = ['Hosting Pilot', 'Friend One', 'Friend Two'];
const deadline = setTimeout(() => {
  void host.stop().finally(() => process.exit(1));
}, 120000);
const onSignal = () => {
  void host.stop().finally(() => process.exit(143));
};
process.once('SIGTERM', onSignal);
process.once('SIGINT', onSignal);
function assertPrivate(client: FriendClient) {
  assert.equal(client.you?.name, client.name);
  assert.equal(
    client.snap?.ships.find((ship) => ship[0] === client.snap?.me?.[0])?.[11],
    client.name,
    'Private me belongs to this captain, not another session',
  );
  const serialized = JSON.stringify(client.messages);
  assert(!serialized.includes(password), 'Password never returned');
  assert(
    !/"(?:salt|hash|password)" *:|"pass" *: *"/.test(serialized),
    'No credential fields on wire',
  );
  assert.equal(
    client.messages
      .filter((packet) => packet.t === 'you')
      .every((packet) => packet.t === 'you' && packet.d.name === client.name),
    true,
  );
}
try {
  checks.status = await host.start();
  const noPassword = await host.connect('Missing Password', '');
  assert.equal(noPassword.you, undefined);
  assert.match(JSON.stringify(noPassword.latest('error')), /password/i);
  await noPassword.close();
  const clients = await Promise.all(names.map((name) => host.connect(name)));
  for (const client of clients) assert.equal(client.you?.name, client.name);
  const wrong = await host.connect(names[0], 'wrong-password');
  assert.equal(wrong.you, undefined);
  assert.match(JSON.stringify(wrong.latest('error')), /wrong password/i);
  await wrong.close();
  checks.authentication =
    'Three distinct password-protected accounts; blank and wrong passwords denied';
  for (const endpoint of ['/api/export?name=Hosting%20Pilot', '/api/import']) {
    const response = await fetch(host.origin + endpoint, {
      method: endpoint.includes('import') ? 'POST' : 'GET',
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(response.ok, false, 'Solo save endpoint unavailable');
  }
  clients[0].send({ t: 'pause' });
  await delay(150);
  assert(!clients[0].latest('paused'), 'Host has no Solo pause privilege');
  // An ordinary commodity purchase makes cargo/credit persistence nontrivial, without seeding a save.
  const leader = clients[0];
  assert.ok(leader.landed?.market?.length, 'Actual starting market');
  const commodity = leader.landed!.market![0];
  const initialCredits = leader.you!.credits;
  leader.send({ t: 'trade', cid: commodity.id, qty: 1 });
  await until(() => leader.you!.credits !== initialCredits, 'ordinary market purchase');
  assert.equal(leader.you!.cargo[commodity.id], 1);
  checks.purchase = {
    commodity: commodity.id,
    credits: leader.you!.credits,
    cargo: leader.you!.cargo,
  };
  for (const client of clients) client.send({ t: 'depart' });
  await until(
    () =>
      clients.every(
        (client) =>
          client.snap?.me &&
          names.every((name) => client.snap!.ships.some((ship) => ship[11] === name)),
      ),
    'all three ships in same universe',
  );
  assert.equal(new Set(clients.map((client) => client.you!.sys)).size, 1);
  assert.equal(new Set(clients.map((client) => client.snap!.me![0])).size, 3);
  for (const client of clients) assertPrivate(client);
  for (let index = 0; index < clients.length; index++) {
    const client = clients[index];
    client.send({ t: 'chat', msg: 'Loopback hello ' + index, ch: 'sys' });
    await until(
      () =>
        clients.every((other) =>
          other.messages.some(
            (packet) =>
              packet.t === 'chat' &&
              packet.from === client.name &&
              packet.msg === 'Loopback hello ' + index,
          ),
        ),
      'chat from each captain',
    );
  }
  const before = clients.map((client) => [client.snap!.me![2], client.snap!.me![3]]);
  for (const client of clients) client.send({ t: 'input', seq: 1, th: 1, tu: 0 });
  await until(
    () =>
      clients.every(
        (client, index) =>
          Math.hypot(
            client.snap!.me![2] - before[index][0],
            client.snap!.me![3] - before[index][1],
          ) > 15,
      ),
    'movement from all three clients',
  );
  for (const client of clients) client.send({ t: 'input', seq: 2, th: 0, tu: 0 });
  for (const mover of clients) {
    await until(
      () =>
        clients.every((observer) => {
          const ship = observer.snap!.ships.find((ship) => ship[11] === mover.name);
          return (
            ship && Math.hypot(ship[2] - mover.snap!.me![2], ship[3] - mover.snap!.me![3]) < 80
          );
        }),
      'other clients observe ' + mover.name,
    );
  }
  // The production queue accepts eight commands, so drain six-command batches rather
  // than overflowing it. Thirty acknowledged commands require thirty 30 Hz steps.
  await until(() => leader.snap!.me![1] === 2, 'released command acknowledged');
  const clockStart = Date.now();
  const firstSnapshot = leader.snapshots.length;
  for (let batch = 0; batch < 5; batch++) {
    const finalSequence = 2 + (batch + 1) * 6;
    for (let sequence = finalSequence - 5; sequence <= finalSequence; sequence++)
      leader.send({ t: 'input', seq: sequence, th: 0, tu: 0 });
    await until(() => leader.snap!.me![1] === finalSequence, 'six-command batch consumed');
  }
  const consumedMs = Date.now() - clockStart;
  assert(
    consumedMs >= 850 && consumedMs < 4500,
    'Single 30 Hz clock, not accelerated: ' + consumedMs,
  );
  const count = leader.snapshots.length - firstSnapshot;
  const snapshotHz = count / (consumedMs / 1000);
  assert(snapshotHz >= 7 && snapshotHz <= 22, 'Single 15 Hz snapshot cadence: ' + snapshotHz);
  checks.clock = { commands: 30, consumedMs, snapshots: count, snapshotHz };
  for (const client of clients) assertPrivate(client);
  checks.sharedWorld = 'Three mutual ships, movement, chat, unique private me and account payloads';
  const savedCredits = leader.you!.credits;
  const savedCargo = structuredClone(leader.you!.cargo);
  await leader.close();
  const reconnected = await host.connect(names[0]);
  assert.equal(reconnected.you!.credits, savedCredits);
  assert.deepEqual(reconnected.you!.cargo, savedCargo);
  assert.ok(
    reconnected.you!.stellar,
    'Disconnect resumes safely docked, not stale flight coordinates',
  );
  checks.reconnect = { sys: reconnected.you!.sys, stellar: reconnected.you!.stellar };
  await host.stop();
  const savedPlayers = JSON.parse(fs.readFileSync(path.join(host.data, 'players.json'), 'utf8'));
  const persisted = names.map((name) => {
    const player = savedPlayers[name.toLowerCase()];
    assert.ok(player);
    return {
      name,
      sys: player.sys,
      stellar: player.stellar,
      credits: player.credits,
      cargo: player.cargo,
    };
  });
  const worldBefore = JSON.parse(fs.readFileSync(path.join(host.data, 'world.json'), 'utf8'));
  await host.start();
  for (const expected of persisted) {
    const client = await host.connect(expected.name);
    assert.deepEqual(
      {
        name: client.you!.name,
        sys: client.you!.sys,
        stellar: client.you!.stellar,
        credits: client.you!.credits,
        cargo: client.you!.cargo,
      },
      expected,
    );
  }
  const worldAfter = JSON.parse(fs.readFileSync(path.join(host.data, 'world.json'), 'utf8'));
  assert.deepEqual(worldAfter, worldBefore, 'Persisted universe reloaded, not recreated');
  checks.restart = {
    accounts: persisted,
    universeReloaded: true,
    positionPolicy:
      'Persisted in-system dock location; free-flight coordinates intentionally reset by production disconnect',
  };
  host.save('result.json', { passed: true, checks });
  console.log('Friends three-client network passed; evidence: ' + host.output);
} catch (error) {
  host.save('result.json', {
    passed: false,
    checks,
    error: String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw error;
} finally {
  clearTimeout(deadline);
  await host.stop();
  process.removeListener('SIGTERM', onSignal);
  process.removeListener('SIGINT', onSignal);
}
