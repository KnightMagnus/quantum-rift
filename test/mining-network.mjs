import assert from 'node:assert/strict';
import { miningFixture, until } from './helpers/mining-fixture.mjs';
import { delay } from './helpers/browser-fixture.mjs';
const f = await miningFixture('mining-network'),
  peers = [];
async function peer(name, login = true) {
  const ws = new WebSocket(f.origin.replace('http', 'ws') + '/ws'),
    c = { ws, messages: [] };
  peers.push(c);
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.messages.push(m);
    if (m.t === 'you') c.you = m.d;
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'space') c.space = m;
  };
  await new Promise((r) => (ws.onopen = r));
  c.send = (m) => ws.send(JSON.stringify(m));
  if (login) {
    c.send({ t: 'hello', name, pass: 'fixture' });
    await until(() => c.you, 'authenticated login');
  }
  return c;
}
try {
  const unauth = await peer('Nobody', false);
  unauth.send({ t: 'mining', op: 'survey' });
  await delay(80);
  assert.ok(!f.read()?.pilots.some((p) => p.name === 'Nobody'));
  const a = await peer('Mining Alpha'),
    b = await peer('Mining Bravo');
  a.send({ t: 'depart' });
  b.send({ t: 'depart' });
  await until(() => a.snap?.miningRocks && b.snap?.mining, 'full mining snapshots');
  assert.equal(a.space.miningRocks.version, 1);
  assert.equal(a.snap.miningRocks.version, 1);
  a.send({ t: 'mining', op: 'contact', heat: 70, reward: 999 });
  a.send({ t: 'mining', op: 'survey', n: 999 });
  await delay(100);
  assert.equal(a.snap.mining.cooldownUntil, 0);
  a.send({ t: 'mining', op: 'survey' });
  await until(() => a.snap.mining.revealed.length, 'survey reveals local seams');
  assert.equal(b.snap.mining.revealed.length, 0, 'survey private across captains');
  const cooldown = a.snap.mining.cooldownUntil,
    expiry = a.snap.mining.revealUntil;
  a.send({ t: 'mining', op: 'survey' });
  await delay(100);
  assert.equal(a.snap.mining.cooldownUntil, cooldown);
  for (const r of a.snap.mining.revealed) {
    const rock = a.snap.miningRocks.rocks.find((k) => k.id === r.id);
    assert.ok(Math.hypot(rock.x - 10180, rock.y - 10000) <= 1500);
    assert.equal(r.hazard, 'none');
  }
  const target = a.snap.miningRocks.rocks.find((r) => r.x === 10000 && r.y === 10000),
    id = target.id;
  a.send({ t: 'input', seq: 1, f1: 1 });
  await until(
    () => a.snap.miningRocks.rocks.find((r) => r.id === id)?.heat >= 65,
    'real primary contact heats rock',
  );
  assert.ok(a.snap.miningRocks.rocks.find((r) => r.id === id).ready);
  a.send({ t: 'input', seq: 2, f1: 0 });
  await until(
    () => f.read()?.rocks.rocks.find((r) => r.id === id)?.lastCut === 'clean',
    'real contact release resolves clean',
  );
  const parcels = f.read().parcels.filter((p) => p.it.generationKey.includes('meridian:'));
  assert.ok(parcels.length >= 2 && parcels.length <= 4);
  assert.ok(parcels.every((p) => p.it.remainingLots));
  assert.equal(b.snap.mining.revealed.length, 0);
  // Late reconnect receives full generation/heat state, not transient-event-only state.
  a.ws.close();
  await delay(120);
  const re = await peer('Mining Alpha');
  re.send({ t: 'depart' });
  await until(() => re.snap?.miningRocks, 'reconnect full refresh');
  assert.ok(re.snap.miningRocks.rocks.some((r) => r.id === id && r.lastCut === 'clean'));
  assert.equal(re.snap.mining.cooldownUntil, cooldown);
  await until(() => re.snap.mining.now >= expiry, 'six-second reveal expiry');
  assert.equal(re.snap.mining.revealed.length, 0);
  assert.ok(re.snap.mining.cooldownUntil > re.snap.mining.now);
  console.log(
    'Real WS auth, forged authority denial, private radius/cooldown/reveal, real primary clean release and reconnect full refresh passed.',
  );
} finally {
  for (const p of peers) p.ws.close();
  await f.close();
}
