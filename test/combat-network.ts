import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Against a disposable local server: node test/combat-network.ts ws://localhost:18765/ws
import assert from 'node:assert/strict';
const address = process.argv[2] || 'ws://localhost:18765/ws';
const sleep = (milliseconds: number | undefined) =>
  new Promise((result) => setTimeout(result, milliseconds));
async function until(feature: () => unknown) {
  for (let index = 0; index < 80; index++) {
    if (feature()) return;
    await sleep(50);
  }
  assert.ok(feature(), 'timed out waiting for server state');
}
async function captain(name: string) {
  const webSocket = new WebSocket(address),
    captain4 = { ws: webSocket, name, snap: null, you: null } as unknown as NetworkClient;
  webSocket.onmessage = (entity) => {
    const message = JSON.parse(String(entity.data)) as ServerMessage;
    if (message.t === 'snap') captain4.snap = message;
    if (message.t === 'you') captain4.you = message.d;
  };
  await new Promise((result) => (webSocket.onopen = result));
  captain4.send = (message: object) => webSocket.send(JSON.stringify(message));
  captain4.send({ t: 'hello', name, pass: 'secret' });
  await until(() => captain4.you);
  return captain4;
}
const stamp = String(Date.now()).slice(-6),
  firstEntry = await captain('Lead ' + stamp),
  secondEntry = await captain('Wing ' + stamp),
  captain2 = await captain('Solo ' + stamp);
try {
  firstEntry.send({ t: 'armada', op: 'form', name: 'Assist ' + stamp });
  await until(() => requiredFixtureValue(firstEntry.you).armada?.id);
  const identifier = requiredFixtureValue(firstEntry.you).armada!.id;
  for (const entry of [secondEntry, captain2]) {
    firstEntry.send({ t: 'armada', op: 'invite', name: entry.name });
    await sleep(100);
    entry.send({ t: 'armada', op: 'accept', id: identifier });
    await until(() => requiredFixtureValue(entry.you).armada?.id === identifier);
  }
  for (const entry of [firstEntry, secondEntry, captain2]) entry.send({ t: 'depart' });
  await until(() => firstEntry.snap && secondEntry.snap && captain2.snap);
  secondEntry.send({ t: 'armada', op: 'follow', on: true });
  firstEntry.send({ t: 'combat', op: 'coordinate', on: true });
  secondEntry.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => requiredFixtureValue(secondEntry.snap).combat!.delegated);
  assert.equal(requiredFixtureValue(captain2.snap).combat!.delegated, false);
  assert.equal(
    requiredFixtureValue(firstEntry.snap).combat!.power,
    requiredFixtureValue(secondEntry.snap).combat!.power,
  );
  assert.ok(
    requiredFixtureValue(firstEntry.snap).combat!.power >
      requiredFixtureValue(captain2.snap).combat!.power,
  );
  secondEntry.send({ t: 'input', seq: 1, th: 1 });
  await until(() => !requiredFixtureValue(secondEntry.snap).combat!.consent);
  assert.equal(requiredFixtureValue(secondEntry.snap).combat!.delegated, false);
  // Manual thrust now deliberately revokes Follow as well as combat consent.
  await until(() => requiredFixtureValue(secondEntry.you).armada!.follow === false);
  secondEntry.send({ t: 'armada', op: 'follow', on: true });
  await until(() => requiredFixtureValue(secondEntry.you).armada!.follow === true);
  secondEntry.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => requiredFixtureValue(secondEntry.snap).combat!.delegated);
  secondEntry.send({ t: 'armada', op: 'follow', on: false });
  await until(() => !requiredFixtureValue(secondEntry.snap).combat!.consent);
  secondEntry.send({ t: 'armada', op: 'follow', on: true });
  await sleep(150);
  assert.equal(requiredFixtureValue(secondEntry.snap).combat!.delegated, false);
  secondEntry.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => requiredFixtureValue(secondEntry.snap).combat!.delegated);
  firstEntry.send({ t: 'armada', op: 'lead', name: captain2.name });
  await until(() => !requiredFixtureValue(secondEntry.snap).combat!.consent);
  firstEntry.send({ t: 'combat', op: 'assist', on: true });
  await until(() => requiredFixtureValue(firstEntry.snap).combat!.on);
  firstEntry.send({ t: 'order', o: 'holdfire' });
  await until(() => !requiredFixtureValue(firstEntry.snap).combat!.on);
  console.log(
    'Real three-client WebSocket combat: consent-only delegation, group odds, independent isolation, input takeover, Follow revocation/rearm, leader transfer and Hold Fire passed.',
  );
} finally {
  for (const entry of [firstEntry, secondEntry, captain2]) entry.ws.close();
}
