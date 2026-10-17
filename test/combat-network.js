// Against a disposable local server: node test/combat-network.js ws://localhost:18765/ws
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://localhost:18765/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(f) {
  for (let i = 0; i < 80; i++) {
    if (f()) return;
    await sleep(50);
  }
  assert.ok(f(), 'timed out waiting for server state');
}
async function captain(name) {
  const ws = new WebSocket(url),
    c = { ws, name, snap: null, you: null };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'you') c.you = m.d;
  };
  await new Promise((r) => (ws.onopen = r));
  c.send = (m) => ws.send(JSON.stringify(m));
  c.send({ t: 'hello', name, pass: 'secret' });
  await until(() => c.you);
  return c;
}
const stamp = String(Date.now()).slice(-6),
  a = await captain('Lead ' + stamp),
  b = await captain('Wing ' + stamp),
  c = await captain('Solo ' + stamp);
try {
  a.send({ t: 'armada', op: 'form', name: 'Assist ' + stamp });
  await until(() => a.you.armada?.id);
  const id = a.you.armada.id;
  for (const x of [b, c]) {
    a.send({ t: 'armada', op: 'invite', name: x.name });
    await sleep(100);
    x.send({ t: 'armada', op: 'accept', id });
    await until(() => x.you.armada?.id === id);
  }
  for (const x of [a, b, c]) x.send({ t: 'depart' });
  await until(() => a.snap && b.snap && c.snap);
  b.send({ t: 'armada', op: 'follow', on: true });
  a.send({ t: 'combat', op: 'coordinate', on: true });
  b.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => b.snap.combat.delegated);
  assert.equal(c.snap.combat.delegated, false);
  assert.equal(a.snap.combat.power, b.snap.combat.power);
  assert.ok(a.snap.combat.power > c.snap.combat.power);
  b.send({ t: 'input', seq: 1, th: 1 });
  await until(() => !b.snap.combat.consent);
  assert.equal(b.snap.combat.delegated, false);
  // Manual thrust now deliberately revokes Follow as well as combat consent.
  await until(() => b.you.armada.follow === false);
  b.send({ t: 'armada', op: 'follow', on: true });
  await until(() => b.you.armada.follow === true);
  b.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => b.snap.combat.delegated);
  b.send({ t: 'armada', op: 'follow', on: false });
  await until(() => !b.snap.combat.consent);
  b.send({ t: 'armada', op: 'follow', on: true });
  await sleep(150);
  assert.equal(b.snap.combat.delegated, false);
  b.send({ t: 'combat', op: 'delegate', on: true });
  await until(() => b.snap.combat.delegated);
  a.send({ t: 'armada', op: 'lead', name: c.name });
  await until(() => !b.snap.combat.consent);
  a.send({ t: 'combat', op: 'assist', on: true });
  await until(() => a.snap.combat.on);
  a.send({ t: 'order', o: 'holdfire' });
  await until(() => !a.snap.combat.on);
  console.log(
    'Real three-client WebSocket combat: consent-only delegation, group odds, independent isolation, input takeover, Follow revocation/rearm, leader transfer and Hold Fire passed.',
  );
} finally {
  for (const x of [a, b, c]) x.ws.close();
}
