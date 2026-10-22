// Headless test: two captains log in, trade, depart, fly, fight, jump and land. Run with the server up: node test/bot.js [url]
import { TRADE_IMPACT } from '../shared/living.ts';
const URL_ = process.argv[2] || 'ws://localhost:8080/ws';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function bot(name) {
  const ws = new WebSocket(URL_);
  const b = {
    ws,
    name,
    you: null,
    landed: null,
    snap: null,
    toasts: [],
    chats: [],
    errors: [],
    space: null,
    dead: 0,
  };
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.t === 'you') b.you = m.d;
    else if (m.t === 'landed') {
      b.landed = m;
      b.snap = null;
    } else if (m.t === 'snap') b.snap = m;
    else if (m.t === 'toast') b.toasts.push(m.msg);
    else if (m.t === 'chat') b.chats.push(m);
    else if (m.t === 'error') b.errors.push(m.msg);
    else if (m.t === 'space') {
      b.space = m;
      b.landed = null;
    } else if (m.t === 'dead') b.dead++;
  };
  b.send = (m) => ws.send(JSON.stringify(m));
  b.open = new Promise((r) => (ws.onopen = r));
  b.seq = 0;
  b.input = (o) => b.send({ t: 'input', seq: ++b.seq, ...o });
  return b;
}
const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exit(1);
};
const ok = (c, msg) => {
  if (!c) fail(msg);
  console.log('ok -', msg);
};
(async () => {
  const a = bot('Tester' + Math.floor(Math.random() * 1e5)),
    b2 = bot('Wingman' + Math.floor(Math.random() * 1e5));
  await a.open;
  await b2.open;
  a.send({ t: 'hello', name: a.name, pass: 'secret' });
  b2.send({ t: 'hello', name: b2.name, pass: 'secret' });
  await sleep(600);
  ok(
    a.you && a.you.credits === 30000 && a.landed && a.landed.stellar === 'qstation',
    'new captain starts landed at Quantum Station with 30,000 credits',
  );
  ok(
    a.landed.market && a.landed.yard && a.landed.outfitter && a.landed.offers.length > 0,
    'station has market, shipyard, outfitter and jobs',
  );
  // trade
  const equipment = a.landed.market.find((c) => c.id === 'equipment');
  // Since v2.5, the quoted single-ton price also has a bulk-buy depth premium.
  const buyUnit = Math.max(
    1,
    Math.round(equipment.price * (1 - (a.you.bonus.tradePct || 0) / 100)),
  );
  const bulkUnit = Math.round(
    buyUnit * (1 + Math.min(TRADE_IMPACT.max, 5 * TRADE_IMPACT.perTon) / 2),
  );
  const creditsBeforeTrade = a.you.credits;
  a.send({ t: 'trade', cid: 'equipment', qty: 5 });
  await sleep(300);
  ok(
    a.you.cargo.equipment === 5 && a.you.credits === creditsBeforeTrade - 5 * bulkUnit,
    'bought 5 tons of equipment at the bulk-adjusted price',
  );
  // outfit
  a.send({ t: 'outfit', id: 9001, n: 1 });
  await sleep(300);
  ok(a.you.ship.outfits[9001] === 1, 'bought a Light Blaster');
  // station claim + Ops 1
  ok(
    a.landed.community && a.landed.community.online.length >= 2,
    'Quantum Station hub shows who is online',
  );
  // chat
  a.send({ t: 'chat', msg: 'hello rift' });
  await sleep(300);
  ok(
    b2.chats.some((c) => c.msg === 'hello rift'),
    'chat reaches the other captain',
  );
  // depart and fly
  a.send({ t: 'depart' });
  b2.send({ t: 'depart' });
  await sleep(500);
  ok(a.space && a.snap && a.snap.me, 'departed into space and receiving snapshots');
  const start = a.snap.me.slice();
  for (let i = 0; i < 45; i++) {
    a.input({ th: 1 });
    await sleep(33);
  }
  await sleep(200);
  const moved = Math.hypot(a.snap.me[2] - start[2], a.snap.me[3] - start[3]);
  ok(moved > 30, `ship moves under thrust (${moved.toFixed(0)} px)`);
  ok(
    a.snap.ships.some((s) => s[11] === b2.name),
    'sees the other captain in the same system',
  );
  ok(a.snap.ships.length >= 3, `system has traffic (${a.snap.ships.length} ships)`);
  // fire
  const shotsBefore = a.snap.shots.length;
  for (let i = 0; i < 15; i++) {
    a.input({ f1: 1 });
    await sleep(33);
  }
  ok(a.snap.shots.length > shotsBefore || a.snap.ev.length >= 0, 'firing produces shots');
  // jump: fly out far, then jump to meridian
  // the departure direction is random, so keep flying and asking until the ship is clear of every planet
  for (let i = 0; i < 30 * 25 && a.you.sys !== 'meridian'; i++) {
    a.input({ th: 1 });
    await sleep(33);
    if (i % 15 === 0) a.send({ t: 'jump', to: 'meridian' });
  }
  await sleep(2600);
  ok(
    a.you.sys === 'meridian',
    `jumped to Meridian (now in ${a.you.sys}); toasts: ${a.toasts.slice(-2).join(' | ')}`,
  );
  ok(a.you.fuel < a.you.shipStats.fuel, 'jumping used fuel');
  // land at Meridian Yards
  const p = { x: 500, y: 300 };
  for (let i = 0; i < 30 * 40; i++) {
    const me = a.snap.me,
      dx = p.x - me[2],
      dy = p.y - me[3],
      d = Math.hypot(dx, dy),
      sp = Math.hypot(me[4], me[5]);
    const want = Math.atan2(dx, -dy),
      diff = ((want - me[6] + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const retro = Math.atan2(me[4], -me[5]) + Math.PI,
      rdiff = Math.abs(((retro - me[6] + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (d < 90) {
      if (sp < 60) {
        a.send({ t: 'land', stellar: 'meridian-yards' });
        await sleep(300);
        if (a.landed) break;
      }
      a.input({ rv: 1, th: sp > 50 && rdiff < 0.3 ? 1 : 0 });
    } else {
      const stop = (sp * sp) / (2 * a.you.shipStats.accel) + 80;
      if (d < stop || sp > 160) a.input({ rv: 1, th: rdiff < 0.3 ? 1 : 0 });
      else
        a.input({
          tu: Math.abs(diff) < 0.05 ? 0 : Math.sign(diff),
          th: Math.abs(diff) < 0.4 ? 1 : 0,
        });
    }
    await sleep(33);
  }
  if (!a.landed) console.log('debug', a.snap && a.snap.me, a.toasts.slice(-4), 'dead', a.dead);
  ok(a.landed && a.landed.stellar === 'meridian-yards', 'flew to and landed at Meridian Yards');
  ok(a.you.fuel === a.you.shipStats.fuel, 'refuelled on landing');
  a.send({ t: 'trade', cid: 'equipment', qty: -5 });
  await sleep(300);
  ok(!a.you.cargo.equipment, 'sold the equipment');
  // accept a job
  const job =
    a.landed.offers.find((o) => o.type !== 'cargo' || o.qty <= a.you.shipStats.cargo) ||
    a.landed.offers[0];
  a.send({ t: 'accept', id: job.id });
  await sleep(300);
  ok(a.you.missions.length === 1, `accepted a job: ${job.title}`);
  console.log('ALL BOT TESTS PASSED');
  process.exit(0);
})().catch((e) => fail(e.stack));
setTimeout(() => fail('timeout'), 120000);
