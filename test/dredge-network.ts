import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import assert from 'node:assert/strict';
import { dredgeFixture, until } from './helpers/dredge-play-fixture.ts';
import { delay } from './helpers/browser-fixture.ts';
const feature = await dredgeFixture('dredge-network'),
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
    await until(() => player.you, 'hello');
  }
  return player;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'industrial', op: 'harvest' });
  await delay(60);
  assert.ok(!unauth.you);
  const firstEntry = await peer('Dredge Alpha'),
    secondEntry = await peer('Dredge Bravo');
  firstEntry.send({ t: 'spec', op: 'build', id: 815 });
  await until(() => firstEntry.you.ship.hull === 815, 'real no-plasma build');
  firstEntry.send({ t: 'depart' });
  secondEntry.send({ t: 'depart' });
  await until(
    () => firstEntry.snap?.industrial && secondEntry.snap,
    'private industrial snapshots',
  );
  assert.equal(secondEntry.snap.industrial, null);
  firstEntry.send({ t: 'industrial', op: 'harvest', heat: 0, n: 999 });
  await delay(70);
  assert.equal(firstEntry.snap.industrial!.harvest, false);
  secondEntry.send({ t: 'industrial', op: 'harvest' });
  await delay(60);
  assert.equal(secondEntry.snap.industrial, null, 'wrong hull cannot harvest');
  const industrialBefore = JSON.stringify(firstEntry.you.industrial);
  for (const packet of [
    { t: 'industrial', op: null },
    { t: 'industrial', op: [] },
    { t: 'industrial', op: 'recipe', recipe: [], grade: 'common' },
    { t: 'industrial', op: 'recipe', recipe: 'alloy', grade: null },
    { t: 'industrial', op: 'recipe', recipe: 'x'.repeat(201), grade: 'common' },
    { t: 'industrial', op: 'off', recipe: Infinity },
  ]) {
    const responseCount = firstEntry.messages.filter((message) => message.t === 'toast').length;
    firstEntry.send(packet);
    await until(
      () => firstEntry.messages.filter((message) => message.t === 'toast').length > responseCount,
      'malformed industrial denial',
    );
    assert.equal(JSON.stringify(firstEntry.you.industrial), industrialBefore);
    assert.equal(firstEntry.snap.industrial!.harvest, false);
  }
  firstEntry.send({ t: 'industrial', op: 'harvest' });
  await until(() => firstEntry.snap.industrial!.harvest, 'server opt-in');
  await until(() => firstEntry.you.cargo.plasma >= 1, 'real finite harvest through WebSocket');
  assert.ok(
    !JSON.stringify(secondEntry.snap).includes('meridian-shallow'),
    'private ship mode/band estimates not leaked',
  );
  firstEntry.send({ t: 'industrial', op: 'off' });
  await until(() => !firstEntry.snap.industrial!.harvest, 'safe off');
  const heat = firstEntry.snap.industrial!.heat;
  firstEntry.ws.close();
  await delay(100);
  const again = await peer('Dredge Alpha');
  assert.equal(again.you.industrial!.harvest, false);
  assert.ok(again.you.industrial!.heat >= heat - 0.5, 'logout does not reset heat');
  console.log(
    'Real WS stock build, auth/wrong-hull/forged-authority denials, finite plasma, private modes and reconnect heat.',
  );
} finally {
  for (const player of peers) player.ws.close();
  await feature.close(undefined);
}
