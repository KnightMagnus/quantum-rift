// Disposable real-WebSocket test; start server/main.ts with a temporary DATA_DIR first.
import assert from 'node:assert/strict';
const url = process.argv[2] || 'ws://localhost:18766/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f) => {
  for (let i = 0; i < 100; i++) {
    if (f()) return;
    await sleep(40);
  }
  assert.ok(f(), 'timed out');
};
const suffix = String(Date.now()).slice(-6);
async function captain(name) {
  const ws = new WebSocket(url),
    c = { ws, name, messages: [], you: null, snap: null };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    c.messages.push(m);
    if (m.t === 'you') c.you = m.d;
    if (m.t === 'snap') c.snap = m;
    if (m.t === 'social') c.social = m;
  };
  await new Promise((r) => (ws.onopen = r));
  c.send = (m) => ws.send(JSON.stringify(m));
  c.send({ t: 'hello', name, pass: 'secret' });
  await until(() => c.you);
  return c;
}
const a = await captain('Hailer ' + suffix),
  b = await captain('Receiver ' + suffix);
try {
  for (const c of [a, b]) {
    c.send({ t: 'social', op: 'prefs', dmAll: true, hideSys: false });
    c.send({ t: 'depart' });
  }
  await until(() => a.snap?.me && b.snap?.me);
  const aid = a.snap.me[0],
    bid = b.snap.me[0];
  b.messages = [];
  a.send({ t: 'hail', id: bid });
  await until(() => a.messages.some((m) => m.t === 'hail' && m.player === bid));
  a.send({ t: 'hailin', op: 'send', id: bid, text: '<img src=x> 😀', sender: 'forged' });
  await until(() => b.messages.some((m) => m.t === 'hailinbox' && m.entries.length));
  const q = b.messages.filter((m) => m.t === 'hailinbox').at(-1).entries[0];
  assert.equal(q.who, a.name);
  assert.ok(!b.messages.some((m) => m.t === 'hail'), 'arrival nonmodal');
  b.send({ t: 'hailin', op: 'open', key: q.key });
  await until(() => b.messages.some((m) => m.t === 'hail' && m.key === q.key));
  const opened = b.messages.find((m) => m.t === 'hail' && m.key === q.key);
  assert.equal(opened.text, '<img src=x> 😀');
  assert.equal(opened.player, aid);
  b.send({ t: 'hailin', op: 'send', id: aid, text: 'Reply' });
  await until(() =>
    a.messages.some((m) => m.t === 'hailinbox' && m.entries.some((e) => e.who === b.name)),
  );
  a.send({ t: 'hailin', op: 'send', id: bid, text: 'flood' });
  await sleep(100);
  assert.ok(a.messages.some((m) => m.t === 'toast' && /moment/.test(m.msg)));
  b.send({ t: 'social', op: 'block', name: a.name });
  await sleep(100);
  await sleep(2000);
  assert.ok(
    b.messages
      .filter((m) => m.t === 'hailinbox')
      .at(-1)
      .entries.every((e) => e.kind !== 'player'),
    'blocking invalidates old calls',
  );
  a.send({ t: 'hailin', op: 'send', id: bid, text: 'blocked' });
  await sleep(100);
  assert.match(a.messages.filter((m) => m.t === 'toast').at(-1).msg, /not accepting/);
  const prior = a.you.credits;
  a.send({ t: 'hailopt', id: bid, k: 'bribe' });
  await sleep(100);
  assert.equal(a.you.credits, prior, 'forged legacy option cannot spend on player');
  console.log(
    'Real two-client hailing: outgoing player composer, authenticated identity, no automatic popup, plain Unicode text, reply, flood protection, block invalidation, forged player actions rejected.',
  );
} finally {
  a.ws.close();
  b.ws.close();
}
