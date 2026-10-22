import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import assert from 'node:assert/strict';
import { miningFixture, until } from './helpers/mining-fixture.ts';
import { delay } from './helpers/browser-fixture.ts';
const feature = await miningFixture('mining-network'),
  peers: NetworkClient[] = [];
async function peer(name: string, login = true) {
  const webSocket = new WebSocket(feature.origin.replace('http', 'ws') + '/ws'),
    captain = { ws: webSocket, messages: [] } as unknown as NetworkClient;
  peers.push(captain);
  webSocket.onmessage = (entity) => {
    const message = JSON.parse(String(entity.data)) as ServerMessage;
    captain.messages.push(message);
    if (message.t === 'you') captain.you = message.d;
    if (message.t === 'snap') captain.snap = message;
    if (message.t === 'space') captain.space = message;
  };
  await new Promise((result) => (webSocket.onopen = result));
  captain.send = (message: object) => webSocket.send(JSON.stringify(message));
  if (login) {
    captain.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => captain.you, 'authenticated login');
  }
  return captain;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'mining', op: 'survey' });
  await delay(80);
  assert.ok(!feature.read()?.pilots.some((player: { name: string }) => player.name === 'Nobody'));
  const firstEntry = await peer('Mining Alpha'),
    secondEntry = await peer('Mining Bravo');
  firstEntry.send({ t: 'depart' });
  secondEntry.send({ t: 'depart' });
  await until(
    () => firstEntry.snap?.miningRocks && secondEntry.snap?.mining,
    'full mining snapshots',
  );
  assert.equal(firstEntry.space.miningRocks!.version, 1);
  assert.equal(firstEntry.snap.miningRocks!.version, 1);
  firstEntry.send({ t: 'mining', op: 'contact', heat: 70, reward: 999 });
  firstEntry.send({ t: 'mining', op: 'survey', n: 999 });
  await delay(100);
  assert.equal(firstEntry.snap.mining!.cooldownUntil, 0);
  firstEntry.send({ t: 'mining', op: 'survey' });
  await until(() => firstEntry.snap.mining!.revealed.length, 'survey reveals local seams');
  assert.equal(secondEntry.snap.mining!.revealed.length, 0, 'survey private across captains');
  const cooldown = firstEntry.snap.mining!.cooldownUntil,
    expiry = firstEntry.snap.mining!.revealUntil;
  firstEntry.send({ t: 'mining', op: 'survey' });
  await delay(100);
  assert.equal(firstEntry.snap.mining!.cooldownUntil, cooldown);
  for (const result of firstEntry.snap.mining!.revealed) {
    const rock = firstEntry.snap.miningRocks!.rocks.find(
      (propertyKey) => propertyKey.id === result.id,
    );
    assert.ok(Math.hypot(rock!.x - 10180, rock!.y - 10000) <= 1500);
    if (rock!.ore === 'gas')
      assert.equal(result.hazard, 'volatile', 'survey marks real gas volatility');
    assert.ok(
      ['none', 'volatile'].includes(result.hazard),
      'server exposes stable volatile/safe hazard classification',
    );
  }
  const target = firstEntry.snap.miningRocks!.rocks.find(
      (result: { x: number; y: number }) => result.x === 10000 && result.y === 10000,
    ),
    identifier = target!.id;
  firstEntry.send({ t: 'input', seq: 1, f1: 1 });
  await until(
    () =>
      (firstEntry.snap.miningRocks!.rocks.find((asteroid) => asteroid.id === identifier)?.heat ??
        0) >= 65,
    'real primary contact heats rock',
  );
  assert.ok(
    firstEntry.snap.miningRocks!.rocks.find((asteroid) => asteroid.id === identifier)!.ready,
  );
  firstEntry.send({ t: 'input', seq: 2, f1: 0 });
  await until(
    () =>
      feature
        .read()
        ?.rocks.rocks.find((result: { id: number; lastCut?: string }) => result.id === identifier)
        ?.lastCut === 'clean',
    'real contact release resolves clean',
  );
  const parcels = feature
    .read()
    .parcels.filter((player: { it: { generationKey: string | string[] } }) =>
      player.it.generationKey.includes('meridian:'),
    );
  assert.ok(parcels.length >= 2 && parcels.length <= 4);
  assert.ok(parcels.every((player: { it: { remainingLots?: object } }) => player.it.remainingLots));
  assert.equal(secondEntry.snap.mining!.revealed.length, 0);
  // Late reconnect receives full generation/heat state, not transient-event-only state.
  firstEntry.ws.close();
  await delay(120);
  const regeneration = await peer('Mining Alpha');
  regeneration.send({ t: 'depart' });
  await until(() => regeneration.snap?.miningRocks, 'reconnect full refresh');
  assert.ok(
    regeneration.snap.miningRocks!.rocks.some(
      (asteroid) => asteroid.id === identifier && asteroid.lastCut === 'clean',
    ),
  );
  assert.equal(regeneration.snap.mining!.cooldownUntil, cooldown);
  await until(() => regeneration.snap.mining!.now >= expiry, 'six-second reveal expiry');
  assert.equal(regeneration.snap.mining!.revealed.length, 0);
  assert.ok(regeneration.snap.mining!.cooldownUntil > regeneration.snap.mining!.now);
  console.log(
    'Real WS auth, forged authority denial, private radius/cooldown/reveal, real primary clean release and reconnect full refresh passed.',
  );
} finally {
  for (const player of peers) player.ws.close();
  await feature.close(undefined);
}
