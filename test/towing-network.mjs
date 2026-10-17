import assert from 'node:assert/strict';
import { towingFixture, until } from './helpers/towing-play-fixture.mjs';
import { delay } from './helpers/browser-fixture.mjs';
const f = await towingFixture('towing-network'),
  peers = [];
async function peer(name, login = true) {
  const ws = new WebSocket(f.origin.replace('http', 'ws') + '/ws'),
    p = { ws, messages: [] };
  peers.push(p);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    p.messages.push(m);
    if (m.t === 'you') p.you = m.d;
    if (m.t === 'snap') p.snap = m;
  };
  await new Promise((r) => (ws.onopen = r));
  p.send = (m) => ws.send(JSON.stringify(m));
  if (login) {
    p.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => p.you, 'login');
  }
  return p;
}
function object(p) {
  return p.snap?.towing?.objects[0];
}
function request(p, op, extra = {}) {
  const o = object(p);
  p.send({ t: 'towing', op, id: o.id, revision: o.revision, ...extra });
}
try {
  const u = await peer('No Auth', false);
  u.send({ t: 'towing', op: 'attach', id: 1, revision: 1 });
  await delay(80);
  assert.ok(!u.you);
  const a = await peer('Tow Alpha'),
    b = await peer('Tow Bravo');
  for (const p of [a, b]) p.send({ t: 'depart' });
  await until(() => object(a) && object(b), 'snapshot');
  for (const p of [a, b]) p.send({ t: 'mining', op: 'survey' });
  await until(() => object(a).revealed && object(b).revealed, 'actual survey');
  request(a, 'attach', { owner: 'forged', lots: { pure: 999 } });
  await delay(100);
  assert.equal(object(a).status, 'available');
  request(a, 'attach');
  request(b, 'attach');
  await until(() => object(a).status === 'attached' && object(b).status === 'attached', 'race');
  const owner = object(a).owner === 'tow alpha' ? a : b;
  let other = owner === a ? b : a;
  assert.equal(f.read().world.slots.filter((x) => x.object?.status === 'attached').length, 1);
  assert.equal(other.snap.towing.attached, null);
  owner.send({ t: 'jump', to: 'sol' });
  await delay(100);
  assert.equal(owner.snap.sys || owner.you.sys, 'meridian');
  request(owner, 'offer', { to: other.you.name });
  await until(() => other.snap.towing.offers.length === 1, 'private offer');
  assert.equal(owner.snap.towing.offers.length, 0);
  assert.equal(object(owner).owner, owner.you.name.toLowerCase(), 'offer not consent');
  // The load, not only the two stationary tugs, must settle under the recipient cap.
  await until(
    () => Math.hypot(object(other).vx, object(other).vy) <= other.snap.towing.cap,
    'safe transfer relative motion',
  );
  request(other, 'accept');
  await until(() => other.snap.towing.attached === object(other).id, 'recipient acceptance');
  const reclaimName = other.you.name,
    loadId = object(other).id;
  other.ws.close();
  await until(
    () => object(owner).status === 'detached',
    'real disconnect releases external object',
  );
  const grace = object(owner).graceUntil;
  request(owner, 'attach');
  await delay(100);
  assert.equal(object(owner).status, 'detached', 'foreign owner grace denied');
  other = await peer(reclaimName);
  assert.equal(
    other.you.towing.objects.find((o) => o.id === loadId).graceUntil,
    grace,
    'reconnect no grace refresh',
  );
  other.send({ t: 'depart' });
  await until(() => object(other)?.id === loadId, 'complete reconnect snapshot');
  request(other, 'attach');
  await until(() => other.snap.towing.attached === loadId, 'owner reclaim');
  const p = object(other).ports[0];
  other.send({ t: 'input', seq: 1, th: 1, tu: 0 });
  await until(() => object(other).status === 'detached', 'full hold auto-release at port');
  other.send({ t: 'input', seq: 2, th: 0, tu: 0 });
  assert.equal(other.you.cargo.ore || 0, 0, 'no cargo lost or added on full hold');
  other.send({ t: 'jettison', cid: 'food', n: 1000 });
  await until(() => !other.you.cargo.food, 'real hold clearance');
  await until(
    () => Math.hypot(object(other).vx, object(other).vy) <= 10,
    'detached load stationary',
  );
  // Reconnect fixture spawns beside the preserved load; reclaim uses real ownership checks.
  other.ws.close();
  other = await peer(reclaimName);
  other.send({ t: 'depart' });
  await until(() => object(other)?.id === loadId, 'reload near reserved load');
  request(other, 'attach');
  await until(() => other.you.cargo.ore === 24, 'automatic once-only delivery after reclaim');
  request(other, 'deliver', { port: p });
  await delay(150);
  assert.equal(other.you.cargo.ore, 24);
  assert.deepEqual(other.you.cargoLots.byCommodity.ore, { common: 18, rich: 5, pure: 1 });
  console.log(
    'Real WS auth/forgery denials, two-captain attach race, private explicit transfer, capacity-first grade delivery and receipt replay.',
  );
} finally {
  for (const p of peers) p.ws.close();
  await f.close();
}
