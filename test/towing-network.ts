import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import assert from 'node:assert/strict';
import { towingFixture, until } from './helpers/towing-play-fixture.ts';
import { delay } from './helpers/browser-fixture.ts';
const feature = await towingFixture('towing-network'),
  peers: NetworkClient[] = [];
async function peer(name: string, login = true) {
  const webSocket = new WebSocket(feature.origin.replace('http', 'ws') + '/ws'),
    player = { ws: webSocket, messages: [] } as unknown as NetworkClient;
  peers.push(player);
  webSocket.onmessage = (entity) => {
    const message = JSON.parse(String(entity.data)) as ServerMessage;
    player.messages.push(message);
    if (message.t === 'you') player.you = message.d;
    if (message.t === 'snap') player.snap = message;
  };
  await new Promise((result) => (webSocket.onopen = result));
  player.send = (message: object) => webSocket.send(JSON.stringify(message));
  if (login) {
    player.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => player.you, 'login');
  }
  return player;
}
function object(player: NetworkClient) {
  return player.snap?.towing?.objects[0];
}
function request(player: NetworkClient, operation: string, extra = {}) {
  const options = object(player);
  player.send({
    t: 'towing',
    op: operation,
    id: options!.id,
    revision: options!.revision,
    ...extra,
  });
}
try {
  const user = await peer('No Auth', false);
  user.send({ t: 'towing', op: 'attach', id: 1, revision: 1 });
  await delay(80);
  assert.ok(!user.you);
  const firstEntry = await peer('Tow Alpha'),
    secondEntry = await peer('Tow Bravo');
  for (const player of [firstEntry, secondEntry]) player.send({ t: 'depart' });
  await until(() => object(firstEntry) && object(secondEntry), 'snapshot');
  for (const player of [firstEntry, secondEntry]) player.send({ t: 'mining', op: 'survey' });
  await until(() => object(firstEntry)!.revealed && object(secondEntry)!.revealed, 'actual survey');
  request(firstEntry, 'attach', { owner: 'forged', lots: { pure: 999 } });
  await delay(100);
  assert.equal(object(firstEntry)!.status, 'available');
  request(firstEntry, 'attach');
  request(secondEntry, 'attach');
  await until(
    () => object(firstEntry)!.status === 'attached' && object(secondEntry)!.status === 'attached',
    'race',
  );
  const owner = object(firstEntry)!.owner === 'tow alpha' ? firstEntry : secondEntry;
  let other = owner === firstEntry ? secondEntry : firstEntry;
  // Telemetry is sampled on its own timer, independently of WebSocket snapshots.
  await until(
    () =>
      feature
        .read()
        ?.world.slots.some(
          (entry: { object: { status: string } }) => entry.object?.status === 'attached',
        ),
    'authoritative attach telemetry',
  );
  assert.equal(
    feature
      .read()
      .world.slots.filter(
        (entry: { object: { status: string } }) => entry.object?.status === 'attached',
      ).length,
    1,
  );
  assert.equal(other.snap.towing!.attached, null);
  owner.send({ t: 'jump', to: 'sol' });
  await delay(100);
  assert.equal(owner.snap.sys || owner.you.sys, 'meridian');
  request(owner, 'offer', { to: other.you.name });
  await until(() => other.snap.towing!.offers.length === 1, 'private offer');
  assert.equal(owner.snap.towing!.offers.length, 0);
  assert.equal(object(owner)!.owner, owner.you.name.toLowerCase(), 'offer not consent');
  // The load, not only the two stationary tugs, must settle under the recipient cap.
  await until(
    () => Math.hypot(object(other)!.vx, object(other)!.vy) <= other.snap.towing!.cap,
    'safe transfer relative motion',
  );
  request(other, 'accept');
  await until(() => other.snap.towing!.attached === object(other)!.id, 'recipient acceptance');
  const reclaimName = other.you.name,
    loadId = object(other)!.id;
  other.ws.close();
  await until(
    () => object(owner)!.status === 'detached',
    'real disconnect releases external object',
  );
  const grace = object(owner)!.graceUntil;
  request(owner, 'attach');
  await delay(100);
  assert.equal(object(owner)!.status, 'detached', 'foreign owner grace denied');
  other = await peer(reclaimName);
  assert.equal(
    other.you.towing!.objects.find((options) => options.id === loadId)!.graceUntil,
    grace,
    'reconnect no grace refresh',
  );
  other.send({ t: 'depart' });
  await until(() => object(other)?.id === loadId, 'complete reconnect snapshot');
  request(other, 'attach');
  await until(() => other.snap.towing!.attached === loadId, 'owner reclaim');
  const player = object(other)!.ports[0];
  other.send({ t: 'input', seq: 1, th: 1, tu: 0 });
  await until(() => object(other)!.status === 'detached', 'full hold auto-release at port');
  other.send({ t: 'input', seq: 2, th: 0, tu: 0 });
  assert.equal(other.you.cargo.ore || 0, 0, 'no cargo lost or added on full hold');
  other.send({ t: 'jettison', cid: 'food', n: 1000 });
  await until(() => !other.you.cargo.food, 'real hold clearance');
  await until(
    () => Math.hypot(object(other)!.vx, object(other)!.vy) <= 10,
    'detached load stationary',
  );
  // Reconnect fixture spawns beside the preserved load; reclaim uses real ownership checks.
  other.ws.close();
  other = await peer(reclaimName);
  other.send({ t: 'depart' });
  await until(() => object(other)?.id === loadId, 'reload near reserved load');
  request(other, 'attach');
  await until(() => other.you.cargo.ore === 24, 'automatic once-only delivery after reclaim');
  request(other, 'deliver', { port: player });
  await delay(150);
  assert.equal(other.you.cargo.ore, 24);
  assert.deepEqual(other.you.cargoLots.byCommodity.ore, { common: 18, rich: 5, pure: 1 });
  console.log(
    'Real WS auth/forgery denials, two-captain attach race, private explicit transfer, capacity-first grade delivery and receipt replay.',
  );
} finally {
  for (const player of peers) player.ws.close();
  await feature.close(undefined);
}
