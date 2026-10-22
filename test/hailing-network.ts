import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import { requiredFixtureValue } from './helpers/required.ts';
// Disposable real-WebSocket test; start server/local-main.ts with a temporary DATA_DIR first.
import assert from 'node:assert/strict';
const address = process.argv[2] || 'ws://localhost:18766/ws';
const sleep = (milliseconds: number | undefined) =>
  new Promise((result) => setTimeout(result, milliseconds));
const until = async (feature: () => unknown) => {
  for (let index = 0; index < 100; index++) {
    if (feature()) return;
    await sleep(40);
  }
  assert.ok(feature(), 'timed out');
};
const suffix = String(Date.now()).slice(-6);
async function captain(name: string) {
  const webSocket = new WebSocket(address),
    captain3 = {
      ws: webSocket,
      name,
      messages: [],
      you: null,
      snap: null,
    } as unknown as NetworkClient;
  webSocket.onmessage = (entity) => {
    const message = JSON.parse(String(entity.data)) as ServerMessage;
    captain3.messages.push(message);
    if (message.t === 'you') captain3.you = message.d;
    if (message.t === 'snap') captain3.snap = message;
    if (message.t === 'social') captain3.social = message;
  };
  await new Promise((result) => (webSocket.onopen = result));
  captain3.send = (message: object) => webSocket.send(JSON.stringify(message));
  captain3.send({ t: 'hello', name, pass: 'secret' });
  await until(() => captain3.you);
  return captain3;
}
const firstEntry = await captain('Hailer ' + suffix),
  secondEntry = await captain('Receiver ' + suffix);
try {
  for (const captain2 of [firstEntry, secondEntry]) {
    captain2.send({ t: 'social', op: 'prefs', dmAll: true, hideSys: false });
    captain2.send({ t: 'depart' });
  }
  await until(() => firstEntry.snap?.me && secondEntry.snap?.me);
  const armadaId = requiredFixtureValue(firstEntry.snap).me![0],
    buyOffer = requiredFixtureValue(secondEntry.snap).me![0];
  secondEntry.messages = [];
  firstEntry.send({ t: 'hail', id: buyOffer });
  await until(() =>
    firstEntry.messages.some((message) => message.t === 'hail' && message.player === buyOffer),
  );
  firstEntry.send({
    t: 'hailin',
    op: 'send',
    id: buyOffer,
    text: '<img src=x> 😀',
    sender: 'forged',
  });
  await until(() =>
    secondEntry.messages.some((message) => message.t === 'hailinbox' && message.entries!.length),
  );
  const fixtureState = requiredFixtureValue(
    secondEntry.messages.filter((message) => message.t === 'hailinbox').at(-1),
  ).entries![0];
  assert.equal(fixtureState.who, firstEntry.name);
  assert.ok(!secondEntry.messages.some((message) => message.t === 'hail'), 'arrival nonmodal');
  secondEntry.send({ t: 'hailin', op: 'open', key: fixtureState.key });
  await until(() =>
    secondEntry.messages.some(
      (message) => message.t === 'hail' && message.key === fixtureState.key,
    ),
  );
  const opened = secondEntry.messages.find(
    (message) => message.t === 'hail' && message.key === fixtureState.key,
  ) as import('../client/protocol.ts').HailConversation | undefined;
  assert.equal(requiredFixtureValue(opened).text, '<img src=x> 😀');
  assert.equal(requiredFixtureValue(opened).player, armadaId);
  secondEntry.send({ t: 'hailin', op: 'send', id: armadaId, text: 'Reply' });
  await until(() =>
    firstEntry.messages.some(
      (message) =>
        message.t === 'hailinbox' &&
        message.entries!.some((entity: { who: string }) => entity.who === secondEntry.name),
    ),
  );
  firstEntry.send({ t: 'hailin', op: 'send', id: buyOffer, text: 'flood' });
  await sleep(100);
  assert.ok(
    firstEntry.messages.some((message) => message.t === 'toast' && /moment/.test(message.msg)),
  );
  secondEntry.send({ t: 'social', op: 'block', name: firstEntry.name });
  await sleep(100);
  await sleep(2000);
  assert.ok(
    requiredFixtureValue(
      secondEntry.messages.filter((message) => message.t === 'hailinbox').at(-1),
    ).entries!.every((entity: { kind: string }) => entity.kind !== 'player'),
    'blocking invalidates old calls',
  );
  firstEntry.send({ t: 'hailin', op: 'send', id: buyOffer, text: 'blocked' });
  await sleep(100);
  assert.match(
    (
      requiredFixtureValue(
        firstEntry.messages.filter((message) => message.t === 'toast').at(-1),
      ) as { t: 'toast'; msg: string }
    ).msg,
    /not accepting/,
  );
  const prior = requiredFixtureValue(firstEntry.you).credits;
  firstEntry.send({ t: 'hailopt', id: buyOffer, k: 'bribe' });
  await sleep(100);
  assert.equal(
    requiredFixtureValue(firstEntry.you).credits,
    prior,
    'forged legacy option cannot spend on player',
  );
  console.log(
    'Real two-client hailing: outgoing player composer, authenticated identity, no automatic popup, plain Unicode text, reply, flood protection, block invalidation, forged player actions rejected.',
  );
} finally {
  firstEntry.ws.close();
  secondEntry.ws.close();
}
