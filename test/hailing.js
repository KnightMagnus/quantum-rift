import { Space } from '../server/space.js';
import assert from 'node:assert/strict';
import { HailService, HAIL_LIMITS, hailText } from '../server/hail-service.js';
import { contextualHail } from '../server/hail-dialogue.js';
import { SYS } from '../shared/galaxy.js';
const sys = Object.keys(SYS)[0];
let now = 10000000;
const sent = [],
  toasts = [];
const sp = { id: sys, ships: new Map(), root: (e) => e, isHostile: (a, b) => !!a.hostile };
const player = (id, name) => {
  const s = {
    id,
    data: { name, sys, credits: 2000, fuel: 200, rep: {}, dmAll: true, blocks: [], friends: [] },
    ent: {
      id,
      x: 0,
      y: 0,
      state: 'fly',
      fuel: 200,
      armor: 100,
      st: { armor: 100, fuel: 300 },
      aggro: new Set(),
    },
  };
  s.ent.player = { s };
  sp.ships.set(id, s.ent);
  return s;
};
const a = player(1, 'Alpha'),
  b = player(2, 'Beta');
const g = {
  A: { ships: { 1: { name: 'Transport' } } },
  spaces: { [sys]: sp },
  live: { [sys]: sp },
  sessions: new Map([
    [1, a],
    [2, b],
  ]),
  send: (s, m) => sent.push({ to: s.id, ...m }),
  toast: (s, msg) => toasts.push(msg),
  you() {},
  db: { touch() {} },
  features: {
    coop: { blocked: (d, n) => d.blocks.includes(n), armadaOf: (d) => d.armada },
    rivals: { relOf: () => 40, rivalRel() {} },
  },
};
const service = (g.hails = new HailService(
  g,
  () => now,
  () => 0.5,
));
const npc = (id, more = {}) => {
  const e = {
    id,
    hull: 1,
    faction: 'spacer',
    x: 100,
    y: 0,
    ai: 'trade',
    state: 'fly',
    armor: 80,
    shield: 100,
    fuel: 20,
    st: { armor: 100, shield: 100, fuel: 200 },
    life: 300,
    ...more,
  };
  sp.ships.set(id, e);
  return e;
};
assert.equal(hailText('😀'.repeat(100)), '😀'.repeat(100));
assert.equal(hailText('😀'.repeat(101)), null);
for (const x of ['', '  ', {}, '\u0000']) assert.equal(hailText(x), null);
service.player(a, b.ent, '<img onerror=bad>');
let st = service.state(b);
assert.equal(st.queue.length, 1);
assert.equal(st.queue[0].text, '<img onerror=bad>');
const key = st.queue[0].key;
assert.ok(!sent.some((m) => m.to === b.id && m.t === 'hail'), 'arrival never opens popup');
service.request(a, { op: 'open', key });
assert.ok(!sent.some((m) => m.to === a.id && m.key === key), 'foreign key cannot open call');
service.request(b, { op: 'open', key });
assert.equal(sent.at(-1).player, a.ent.id);
service.player(a, b.ent, 'flood');
assert.equal(st.queue[0].text, '<img onerror=bad>');
now += 11000;
service.player(a, b.ent, 'second');
assert.equal(st.queue.length, 1);
assert.equal(st.queue[0].text, 'second');
b.data.blocks.push(a.data.name);
now += 11000;
service.player(a, b.ent, 'blocked');
assert.equal(st.queue[0].text, 'second');
service.tick();
assert.equal(st.queue.length, 0);
assert.equal(st.history.length, 0, 'blocked player messages never enter archive');
b.data.blocks = [];
a.data.blocks.push(b.data.name);
assert.equal(service.canContact(a, b), false);
a.data.blocks = [];
b.data.playerHails = false;
assert.equal(service.canContact(a, b), false);
b.data.playerHails = true;
b.data.dmAll = false;
assert.equal(service.canContact(a, b), false);
b.data.friends = ['Alpha'];
assert.equal(service.canContact(a, b), true);
b.data.dmAll = true;
b.data.sys = 'elsewhere';
assert.equal(service.canContact(a, b), false);
b.data.sys = sys;
const n1 = npc(10),
  n2 = npc(11);
assert.notEqual(contextualHail(a, n1, sp), contextualHail(a, n2, sp));
n1.target = b.ent;
assert.match(
  contextualHail(a, n1, sp),
  /Weapons hot|live target|hostile contact|Combat channel|under fire|Contact engaged|firing arc|not quiet/,
);
n1.target = null;
assert.ok(service.offer(a, n1, 'fuel'));
const sta = service.state(a),
  call = sta.queue[0];
service.request(a, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(a.ent.fuel, 200, 'must open actual offer');
service.request(a, { op: 'open', key: call.key });
service.request(a, { op: 'answer', key: call.key, k: 'gift' });
assert.equal(a.data.credits, 2000, 'forged action rejected');
service.request(a, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(a.ent.fuel, 150);
assert.equal(n1.fuel, 70);
service.request(a, { op: 'answer', key: call.key, k: 'donateFuel' });
assert.equal(a.ent.fuel, 150, 'cannot resolve twice');
const poor = npc(12);
assert.ok(service.offer(a, poor, 'beg'));
let q = sta.queue.at(-1);
service.request(a, { op: 'open', key: q.key });
a.data.credits = 0;
service.request(a, { op: 'answer', key: q.key, k: 'gift' });
assert.equal(a.data.credits, 0);
a.data.credits = 2000;
service.request(a, { op: 'answer', key: q.key, k: 'gift' });
assert.equal(a.data.credits, 1900);
const damaged = npc(13, { armor: 20, disabled: true });
assert.ok(service.offer(a, damaged, 'distress'));
q = sta.queue.at(-1);
service.request(a, { op: 'open', key: q.key });
service.request(a, { op: 'answer', key: q.key, k: 'rendezvous' });
assert.ok(sent.some((m) => m.t === 'hailmark' && m.id === damaged.id));
service.request(a, { op: 'answer', key: q.key, k: 'repair' });
assert.equal(damaged.disabled, false);
assert.equal(damaged.armor, 55.00000000000001);
assert.equal(a.data.credits, 1650);
// Exercise the real disable path: Space.ai deliberately retains its old target.
const survivor = npc(34, { armor: 10, target: b.ent, think: 1 });
Space.prototype.ai.call({ ...sp, t: 5 }, survivor);
assert.equal(survivor.disabled, true);
assert.equal(survivor.target, b.ent, 'real disable flow retains combat pointer');
assert.ok(service.offer(a, survivor, 'distress'), 'friendly disabled survivor can ask for help');
service.request(a, { op: 'dismiss', key: sta.queue.at(-1).key });
const hostileSurvivor = npc(35, { armor: 10, target: b.ent, think: 1, hostile: true });
Space.prototype.ai.call({ ...sp, t: 5 }, hostileSurvivor);
assert.equal(hostileSurvivor.disabled, true);
assert.equal(
  service.offer(a, hostileSurvivor, 'distress'),
  false,
  'hostile survivors cannot bypass hostility',
);
const hauler = npc(14, { dest: { id: 'port', name: 'Port', x: 100, y: 0 } });
assert.ok(service.offer(a, hauler, 'escort'));
q = sta.queue.at(-1);
service.request(a, { op: 'open', key: q.key });
service.request(a, { op: 'answer', key: q.key, k: 'escort' });
assert.equal(a.data.credits, 1650, 'no reward on accepting');
service.landed(hauler, sp);
assert.equal(a.data.credits, 2400);
service.landed(hauler, sp);
assert.equal(a.data.credits, 2400, 'landing reward once');
const lost = npc(15, { dest: { id: 'port', name: 'Port', x: 100, y: 0 } });
service.offer(a, lost, 'escort');
q = sta.queue.at(-1);
service.request(a, { op: 'open', key: q.key });
service.request(a, { op: 'answer', key: q.key, k: 'escort' });
lost.x = 4000;
service.tick();
service.landed(lost, sp);
assert.equal(a.data.credits, 2400, 'separation fails escort');
const scout = npc(16),
  hostile = npc(17, { hostile: true, x: 1400 });
assert.ok(service.offer(a, scout, 'intel'));
q = sta.queue.at(-1);
service.request(a, { op: 'open', key: q.key });
service.request(a, { op: 'answer', key: q.key, k: 'intel' });
assert.ok(
  sent.some((m) => m.t === 'hailmark' && m.x === 1500 && !m.id),
  'intel is rounded point, not tracking',
);
sp.ships.delete(hostile.id);
for (let i = 20; i < 25; i++) service.enqueue(a, npc(i), 'greeting', 'Hello');
assert.equal(sta.queue.filter((q) => q.kind === 'npc').length, HAIL_LIMITS.npc);
now += HAIL_LIMITS.expires + 1;
service.tick();
assert.equal(sta.queue.length, 0);
assert.ok(sta.history.length > 0, 'expired incoming transmissions stay readable');
const archived = sta.history[0],
  creditsBeforeArchive = a.data.credits;
service.request(a, { op: 'open', key: archived.key });
assert.ok(sent.at(-1).text.includes(archived.text), 'opening inbox recovers original text');
assert.deepEqual(sent.at(-1).opts, [], 'archive has no actionable offers');
service.request(a, { op: 'answer', key: archived.key, k: 'gift' });
assert.equal(a.data.credits, creditsBeforeArchive, 'expired actions cannot spend credits');
service.request(a, { op: 'dismiss', key: archived.key });
assert.ok(!sta.history.some((q) => q.key === archived.key), 'archive can be dismissed');
for (let i = 0; i < HAIL_LIMITS.history + 2; i++)
  service.archive(sta, { key: `old-${i}`, text: 'Archived', kind: 'npc' });
assert.equal(sta.history.length, HAIL_LIMITS.history, 'archived history stays bounded');
service.enqueue(a, npc(30), 'greeting', 'Hello');
const pendingBeforePause = sta.queue[0],
  expiryBeforePause = pendingBeforePause.expires;
now += HAIL_LIMITS.expires * 2;
service.resume(HAIL_LIMITS.expires * 2);
assert.equal(pendingBeforePause.expires, expiryBeforePause + HAIL_LIMITS.expires * 2);
service.tick();
assert.ok(sta.queue.includes(pendingBeforePause), 'long solo pause preserves pending call');
a.ent = { ...a.ent, id: 31 };
service.state(a);
assert.equal(sta.queue.length, 0, 'respawn resets calls');
assert.equal(sta.history.length, 0, 'respawn clears archive');
assert.ok(!service.offer(a, npc(32, { owner: 10 }), 'beg'));
assert.ok(!service.offer(a, npc(33, { mission: {} }), 'beg'));
// Selecting a friendly ship to hail is not combat and must not suppress ordinary calls.
const attempted = [];
service.offer = (s, e, reason) => {
  attempted.push(reason);
  return false;
};
a.ent.target = b.ent;
sta.next = 0;
service.tick();
assert.ok(attempted.includes('beg'), 'friendly selected target permits routine opportunities');
attempted.length = 0;
const attacker = npc(40, { target: a.ent });
sta.next = 0;
service.tick();
assert.ok(attempted.length > 0);
assert.ok(
  attempted.every((reason) => ['security', 'distress'].includes(reason)),
  'attackers suppress routine opportunities',
);
sp.ships.delete(attacker.id);
// A docked captain must not reactivate an empty system through the lazy proxy.
let lazyReads = 0;
g.spaces = new Proxy(
  {},
  {
    get() {
      lazyReads++;
      throw new Error('unexpected lazy system wake');
    },
  },
);
a.ent = null;
b.ent = null;
delete g.live[sys];
service.tick();
assert.equal(lazyReads, 0, 'hailing uses live systems, never the waking proxy');
assert.equal(sta.space, null);
assert.equal(sta.queue.length, 0, 'landing clears pending calls');
assert.equal(service.state(a).space, null);
service.request(a, { op: 'send', id: 2, text: 'docked' });
assert.equal(lazyReads, 0, 'docked requests cannot wake sleeping space');
console.log(
  'Hailing: Unicode/escaping wire text, contextual variance/combat precedence, same-system privacy/blocks, no focus packet, sender ownership, rate limits/coalescing, once-only resource aid, distress repair/marker, actual landing escort/replay/separation, real rounded intel, queue cap/expiry/respawn and protected-source exclusions passed.',
);
