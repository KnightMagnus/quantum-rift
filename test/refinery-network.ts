import type { NetworkClient } from './helpers/network-client-types.ts';
import type { ServerMessage } from '../client/protocol.ts';
import assert from 'node:assert/strict';
import { refineryFixture, until } from './helpers/refinery-play-fixture.ts';
import { delay } from './helpers/browser-fixture.ts';
const feature = await refineryFixture('refinery-network'),
  peers: NetworkClient[] = [];
async function peer(name: string, login = true) {
  const webSocket = new WebSocket(feature.origin.replace('http', 'ws') + '/ws'),
    player = { ws: webSocket, messages: [] } as unknown as NetworkClient;
  peers.push(player);
  webSocket.onmessage = (entity) => {
    const message = JSON.parse(String(entity.data)) as ServerMessage;
    player.messages.push(message);
    if (message.t === 'you') player.you = message.d;
    if (message.t === 'refineryQuote') player.quote = message.quote;
  };
  await new Promise((result) => (webSocket.onopen = result));
  player.send = (message: object) => webSocket.send(JSON.stringify(message));
  if (login) {
    player.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => player.you, 'authenticatedrefinerylogin');
  }
  return player;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'refinery', op: 'submit', id: 'q1' });
  await delay(60);
  assert.ok(!unauth.you);
  const firstEntry = await peer('Refinery Alpha'),
    secondEntry = await peer('Refinery Bravo');
  const deniedBefore = JSON.stringify({
    credits: firstEntry.you.credits,
    cargo: firstEntry.you.cargo,
    ship: firstEntry.you.ship,
    mats: firstEntry.you.mats,
  });
  const denialPackets = [
    null,
    [],
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
    { t: 'towing', op: 'deliver', id: 1, revision: null, port: feature.port },
  ];
  for (const packet of denialPackets) firstEntry.ws.send(JSON.stringify(packet));
  firstEntry.send({ t: 'refinery', op: 'list' });
  const messagesBefore = firstEntry.messages.length;
  await until(
    () => firstEntry.messages.slice(messagesBefore).some((message) => message.t === 'refinery'),
    'denial barrier',
  );
  assert.equal(
    JSON.stringify({
      credits: firstEntry.you.credits,
      cargo: firstEntry.you.cargo,
      ship: firstEntry.you.ship,
      mats: firstEntry.you.mats,
    }),
    deniedBefore,
    'real local transport malformed economic requests preserve inventory and credits',
  );
  assert.ok(firstEntry.you.refinery.batches.length);
  assert.equal(secondEntry.you.refinery.batches.length, 0, 'owner-onlyjobs');
  assert.equal(firstEntry.you.refinery.ready[0].units, 765, 'offline maturity once');
  const _before = JSON.stringify(feature.read()?.refinery);
  firstEntry.send({ t: 'refinery', op: 'quote', recipe: 'alloy', n: 3, fee: 0 });
  firstEntry.send({ t: 'refinery', op: 'mint', n: 99 });
  await delay(80);
  assert.equal(firstEntry.quote, undefined, 'forgedauthorityfields denied');
  firstEntry.send({ t: 'refinery', op: 'claim', recipe: 'alloy' });
  await until(() => firstEntry.you.cargo.alloy_ingots === 1, 'realWSpartialclaim');
  assert.equal(firstEntry.you.refinery.ready[0].units, 465, 'onlyacceptedwholetonne debited');
  firstEntry.send({
    t: 'refinery',
    op: 'quote',
    recipe: 'alloy',
    n: 3,
    grade: 'common',
    mode: 'stored',
  });
  await until(() => firstEntry.quote, 'bindingquote');
  const refineryQuote = (firstEntry as NetworkClient).quote!,
    credits = firstEntry.you.credits;
  secondEntry.send({ t: 'refinery', op: 'submit', id: refineryQuote.id });
  await delay(60);
  assert.equal(secondEntry.you.refinery.batches.length, 0);
  firstEntry.send({ t: 'refinery', op: 'submit', id: refineryQuote.id });
  firstEntry.send({ t: 'refinery', op: 'submit', id: refineryQuote.id });
  await until(() => firstEntry.you.refinery.batches.length === 3, 'oneconfirmedbatch');
  assert.equal(firstEntry.you.credits, credits - refineryQuote.fee);
  const batch = firstEntry.you.refinery.batches.at(-1);
  assert.equal(batch!.status, 'queued');
  firstEntry.send({ t: 'refinery', op: 'cancel', id: batch!.id });
  await until(
    () => firstEntry.you.refinery.batches.at(-1)!.status === 'cancelled',
    'cancelexactescrow',
  );
  firstEntry.send({ t: 'refinery', op: 'returns', id: batch!.id });
  await until(
    () =>
      firstEntry.you.refinery.batches
        .at(-1)!
        .returns.every(
          (index: { lots: { [session: string]: unknown } | ArrayLike<unknown> }) =>
            !Object.values(index.lots).some(Boolean),
        ),
    'returnescrowcollected',
  );
  const again = firstEntry.you.refinery.batches.length;
  firstEntry.ws.close();
  const reconnect = await peer('Refinery Alpha');
  assert.equal(reconnect.you.refinery.batches.length, again);
  assert.equal(reconnect.you.refinery.ready[0].units, 465);
  const offer = reconnect.you.refinery.offers.find(
    (options: { grade: string }) => options.grade === 'pure',
  );
  reconnect.send({ t: 'miningOrder', op: 'accept', id: offer!.id, port: feature.port });
  await until(() => reconnect.you.refinery.orders.length, 'reservedorder');
  const money = reconnect.you.credits;
  reconnect.send({ t: 'miningOrder', op: 'deliver', id: offer!.id, port: feature.port });
  await until(() => reconnect.you.credits === money + offer!.reward, 'exactpureorderdelivery');
  console.log(
    'ALL REFINERY REAL WS AUTH / PRIVATE ESCROW / QUOTE REPLAY / PARTIAL CLAIM / EXACT ORDER TESTS PASSED',
  );
} finally {
  for (const player of peers) player.ws.close();
  await feature.close(undefined);
}
