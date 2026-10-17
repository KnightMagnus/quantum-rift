import assert from 'node:assert/strict';
import { dredgeFixture, until } from './helpers/dredge-play-fixture.mjs';
import { delay } from './helpers/browser-fixture.mjs';
const f = await dredgeFixture('dredge-network'),
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
    await until(() => p.you, 'hello');
  }
  return p;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'industrial', op: 'harvest' });
  await delay(60);
  assert.ok(!unauth.you);
  const a = await peer('Dredge Alpha'),
    b = await peer('Dredge Bravo');
  a.send({ t: 'spec', op: 'build', id: 815 });
  await until(() => a.you.ship.hull === 815, 'real no-plasma build');
  a.send({ t: 'depart' });
  b.send({ t: 'depart' });
  await until(() => a.snap?.industrial && b.snap, 'private industrial snapshots');
  assert.equal(b.snap.industrial, null);
  a.send({ t: 'industrial', op: 'harvest', heat: 0, n: 999 });
  await delay(70);
  assert.equal(a.snap.industrial.harvest, false);
  b.send({ t: 'industrial', op: 'harvest' });
  await delay(60);
  assert.equal(b.snap.industrial, null, 'wrong hull cannot harvest');
  a.send({ t: 'industrial', op: 'harvest' });
  await until(() => a.snap.industrial.harvest, 'server opt-in');
  await until(() => a.you.cargo.plasma >= 1, 'real finite harvest through WebSocket');
  assert.ok(
    !JSON.stringify(b.snap).includes('meridian-shallow'),
    'private ship mode/band estimates not leaked',
  );
  a.send({ t: 'industrial', op: 'off' });
  await until(() => !a.snap.industrial.harvest, 'safe off');
  const heat = a.snap.industrial.heat;
  a.ws.close();
  await delay(100);
  const again = await peer('Dredge Alpha');
  assert.equal(again.you.industrial.harvest, false);
  assert.ok(again.you.industrial.heat >= heat - 0.5, 'logout does not reset heat');
  console.log(
    'Real WS stock build, auth/wrong-hull/forged-authority denials, finite plasma, private modes and reconnect heat.',
  );
} finally {
  for (const p of peers) p.ws.close();
  await f.close();
}
