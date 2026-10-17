import assert from 'node:assert/strict';
import { refineryFixture, until } from './helpers/refinery-play-fixture.mjs';
import { delay } from './helpers/browser-fixture.mjs';
const f = await refineryFixture('refinery-network'),
  peers = [];
async function peer(name, login = true) {
  const ws = new WebSocket(f.origin.replace('http', 'ws') + '/ws'),
    p = { ws, messages: [] };
  peers.push(p);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    p.messages.push(m);
    if (m.t === 'you') p.you = m.d;
    if (m.t === 'refineryQuote') p.quote = m.quote;
  };
  await new Promise((r) => (ws.onopen = r));
  p.send = (m) => ws.send(JSON.stringify(m));
  if (login) {
    p.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => p.you, 'authenticatedrefinerylogin');
  }
  return p;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'refinery', op: 'submit', id: 'q1' });
  await delay(60);
  assert.ok(!unauth.you);
  const a = await peer('Refinery Alpha'),
    b = await peer('Refinery Bravo');
  assert.ok(a.you.refinery.batches.length);
  assert.equal(b.you.refinery.batches.length, 0, 'owner-onlyjobs');
  assert.equal(a.you.refinery.ready[0].units, 765, 'offline maturity once');
  const before = JSON.stringify(f.read()?.refinery);
  a.send({ t: 'refinery', op: 'quote', recipe: 'alloy', n: 3, fee: 0 });
  a.send({ t: 'refinery', op: 'mint', n: 99 });
  await delay(80);
  assert.equal(a.quote, undefined, 'forgedauthorityfields denied');
  a.send({ t: 'refinery', op: 'claim', recipe: 'alloy' });
  await until(() => a.you.cargo.alloy_ingots === 1, 'realWSpartialclaim');
  assert.equal(a.you.refinery.ready[0].units, 465, 'onlyacceptedwholetonne debited');
  a.send({ t: 'refinery', op: 'quote', recipe: 'alloy', n: 3, grade: 'common', mode: 'stored' });
  await until(() => a.quote, 'bindingquote');
  const q = a.quote,
    credits = a.you.credits;
  b.send({ t: 'refinery', op: 'submit', id: q.id });
  await delay(60);
  assert.equal(b.you.refinery.batches.length, 0);
  a.send({ t: 'refinery', op: 'submit', id: q.id });
  a.send({ t: 'refinery', op: 'submit', id: q.id });
  await until(() => a.you.refinery.batches.length === 3, 'oneconfirmedbatch');
  assert.equal(a.you.credits, credits - q.fee);
  const batch = a.you.refinery.batches.at(-1);
  assert.equal(batch.status, 'queued');
  a.send({ t: 'refinery', op: 'cancel', id: batch.id });
  await until(() => a.you.refinery.batches.at(-1).status === 'cancelled', 'cancelexactescrow');
  a.send({ t: 'refinery', op: 'returns', id: batch.id });
  await until(
    () => a.you.refinery.batches.at(-1).returns.every((i) => !Object.values(i.lots).some(Boolean)),
    'returnescrowcollected',
  );
  const again = a.you.refinery.batches.length;
  a.ws.close();
  const reconnect = await peer('Refinery Alpha');
  assert.equal(reconnect.you.refinery.batches.length, again);
  assert.equal(reconnect.you.refinery.ready[0].units, 465);
  const offer = reconnect.you.refinery.offers.find((o) => o.grade === 'pure');
  reconnect.send({ t: 'miningOrder', op: 'accept', id: offer.id, port: f.port });
  await until(() => reconnect.you.refinery.orders.length, 'reservedorder');
  const money = reconnect.you.credits;
  reconnect.send({ t: 'miningOrder', op: 'deliver', id: offer.id, port: f.port });
  await until(() => reconnect.you.credits === money + offer.reward, 'exactpureorderdelivery');
  console.log(
    'ALL REFINERY REAL WS AUTH / PRIVATE ESCROW / QUOTE REPLAY / PARTIAL CLAIM / EXACT ORDER TESTS PASSED',
  );
} finally {
  for (const p of peers) p.ws.close();
  await f.close();
}
