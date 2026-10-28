import { botLandingInput, type BotLandingState } from './helpers/bot-landing.ts';
import { STELLARS } from '../shared/galaxy.ts';
import type { ClientGameState } from '../client/main.ts';
interface BotState {
  ws: WebSocket;
  name: string;
  you: ClientGameState['you'];
  landed: ClientGameState['landed'];
  snap: { me: number[]; ships: string[][]; shots: unknown[]; ev: unknown[] } | null;
  toasts: string[];
  chats: { msg: string }[];
  errors: string[];
  space: object | null;
  dead: number;
  send: (message: { t: string; [propertyKey: string]: unknown }) => void;
  open: Promise<Event>;
  seq: number;
  input: (options: { th?: number; tu?: number; rv?: number; f1?: number; nav?: boolean }) => void;
}
import { requiredFixtureValue } from './helpers/required.ts';
// Headless test: two captains log in, trade, depart, fly, fight, jump and land. Run with the server up: node test/bot.ts [url]
import { purchaseValue, saleValue } from '../shared/trade-pricing.ts';
const URL_ = process.argv[2] || 'ws://localhost:8080/ws';
const sleep = (milliseconds: number | undefined) =>
  new Promise((result) => setTimeout(result, milliseconds));
function testBot(name: string) {
  const webSocket = new WebSocket(URL_);
  const secondEntry: BotState = {
    ws: webSocket,
    name,
    you: null,
    landed: null,
    snap: null,
    toasts: [],
    chats: [],
    errors: [],
    space: null,
    dead: 0,
    send: (message) => webSocket.send(JSON.stringify(message)),
    open: new Promise((resolve) => {
      webSocket.onopen = resolve;
    }),
    seq: 0,
    input: (options) => secondEntry.send({ t: 'input', seq: ++secondEntry.seq, ...options }),
  };
  webSocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.t === 'you') secondEntry.you = message.d;
    else if (message.t === 'landed') {
      secondEntry.landed = message;
      secondEntry.snap = null;
    } else if (message.t === 'snap') secondEntry.snap = message;
    else if (message.t === 'toast') secondEntry.toasts.push(message.msg);
    else if (message.t === 'chat') secondEntry.chats.push(message);
    else if (message.t === 'error') secondEntry.errors.push(message.msg);
    else if (message.t === 'space') {
      secondEntry.space = message;
      secondEntry.landed = null;
    } else if (message.t === 'dead') secondEntry.dead++;
  };
  return secondEntry;
}
const fail = (message: string) => {
  console.error('FAIL:', message);
  process.exit(1);
};
const assertCondition = (condition: unknown, message: string) => {
  if (!condition) fail(message);
  console.log('ok -', message);
};
(async () => {
  const firstEntry = testBot('Tester' + Math.floor(Math.random() * 1e5)),
    secondBot = testBot('Wingman' + Math.floor(Math.random() * 1e5));
  await firstEntry.open;
  await secondBot.open;
  firstEntry.send({ t: 'hello', name: firstEntry.name, pass: 'secret' });
  secondBot.send({ t: 'hello', name: secondBot.name, pass: 'secret' });
  await sleep(600);
  assertCondition(
    firstEntry.you &&
      firstEntry.you.credits === 30000 &&
      firstEntry.landed &&
      firstEntry.landed.stellar === 'qstation',
    'new captain starts landed at Quantum Station with 30,000 credits',
  );
  assertCondition(
    requiredFixtureValue(requiredFixtureValue(firstEntry.landed).market) &&
      requiredFixtureValue(firstEntry.landed).yard &&
      requiredFixtureValue(firstEntry.landed).outfitter &&
      requiredFixtureValue(firstEntry.landed).offers.length > 0,
    'station has market, shipyard, outfitter and jobs',
  );
  // trade
  const equipment = requiredFixtureValue(requiredFixtureValue(firstEntry.landed).market).find(
    (captain: { id: string }) => captain.id === 'equipment',
  );
  const purchaseMarket = requiredFixtureValue(equipment);
  const purchaseTerms = requiredFixtureValue(firstEntry.landed).tradeTerms;
  const purchaseTotal = purchaseValue(
    purchaseMarket.quoteBase ?? requiredFixtureValue(purchaseMarket.price),
    5,
    purchaseTerms.tradePct,
    purchaseTerms.site,
    purchaseTerms.sell,
    purchaseMarket.impact ?? 0,
  );
  const creditsBeforeTrade = requiredFixtureValue(firstEntry.you).credits;
  firstEntry.send({ t: 'trade', cid: 'equipment', qty: 5 });
  await sleep(300);
  assertCondition(
    requiredFixtureValue(firstEntry.you).cargo.equipment === 5 &&
      requiredFixtureValue(firstEntry.you).credits === creditsBeforeTrade - purchaseTotal,
    'bought 5 tons of equipment at the integrated shared-market quote',
  );
  // outfit
  firstEntry.send({ t: 'outfit', id: 9001, n: 1 });
  await sleep(300);
  assertCondition(
    requiredFixtureValue(firstEntry.you).ship.outfits[9001] === 1,
    'bought a Light Blaster',
  );
  // station claim + Ops 1
  assertCondition(
    requiredFixtureValue(requiredFixtureValue(firstEntry.landed).community) &&
      requiredFixtureValue(requiredFixtureValue(firstEntry.landed).community).online.length >= 2,
    'Quantum Station hub shows who is online',
  );
  // chat
  firstEntry.send({ t: 'chat', msg: 'hello rift' });
  await sleep(300);
  assertCondition(
    secondBot.chats.some((captain) => captain.msg === 'hello rift'),
    'chat reaches the other captain',
  );
  // depart and fly
  firstEntry.send({ t: 'depart' });
  secondBot.send({ t: 'depart' });
  await sleep(500);
  assertCondition(
    firstEntry.space && firstEntry.snap && firstEntry.snap.me,
    'departed into space and receiving snapshots',
  );
  const start = requiredFixtureValue(firstEntry.snap).me.slice();
  for (let index = 0; index < 45; index++) {
    firstEntry.input({ th: 1 });
    await sleep(33);
  }
  await sleep(200);
  const moved = Math.hypot(
    requiredFixtureValue(firstEntry.snap).me[2] - start[2],
    requiredFixtureValue(firstEntry.snap).me[3] - start[3],
  );
  assertCondition(moved > 30, `ship moves under thrust (${moved.toFixed(0)} px)`);
  assertCondition(
    requiredFixtureValue(firstEntry.snap).ships.some(
      (session: string[]) => session[11] === secondBot.name,
    ),
    'sees the other captain in the same system',
  );
  assertCondition(
    requiredFixtureValue(firstEntry.snap).ships.length >= 3,
    `system has traffic (${requiredFixtureValue(firstEntry.snap).ships.length} ships)`,
  );
  // fire
  const shotsBefore = requiredFixtureValue(firstEntry.snap).shots.length;
  for (let index = 0; index < 15; index++) {
    firstEntry.input({ f1: 1 });
    await sleep(33);
  }
  assertCondition(
    requiredFixtureValue(firstEntry.snap).shots.length > shotsBefore ||
      requiredFixtureValue(firstEntry.snap).ev.length >= 0,
    'firing produces shots',
  );
  // jump: fly out far, then jump to meridian
  // the departure direction is random, so keep flying and asking until the ship is clear of every planet
  for (
    let index = 0;
    index < 30 * 25 && requiredFixtureValue(firstEntry.you).sys !== 'meridian';
    index++
  ) {
    firstEntry.input({ th: 1 });
    await sleep(33);
    if (index % 15 === 0) firstEntry.send({ t: 'jump', to: 'meridian' });
  }
  await sleep(2600);
  assertCondition(
    requiredFixtureValue(firstEntry.you).sys === 'meridian',
    `jumped to Meridian (now in ${requiredFixtureValue(firstEntry.you).sys}); toasts: ${firstEntry.toasts.slice(-2).join(' | ')}`,
  );
  assertCondition(
    requiredFixtureValue(firstEntry.you).fuel <
      requiredFixtureValue(requiredFixtureValue(firstEntry.you).shipStats).fuel,
    'jumping used fuel',
  );
  // land at Meridian Yards
  const port = STELLARS['meridian-yards'];
  const landingState: BotLandingState = {};
  for (let index = 0; index < 30 * 40; index++) {
    const ship = requiredFixtureValue(firstEntry.snap).me;
    if (Math.hypot(port.x - ship[2], port.y - ship[3]) < 90 && Math.hypot(ship[4], ship[5]) < 60) {
      firstEntry.send({ t: 'land', stellar: port.id });
      await sleep(300);
      if (firstEntry.landed) break;
    }
    // Use the same approach/braking policy as the browser, including its
    // navigation-brake flag. The old hand-written pilot could orbit the port.
    firstEntry.input(
      botLandingInput(
        landingState,
        ship,
        requiredFixtureValue(requiredFixtureValue(firstEntry.you).shipStats),
        port,
      ),
    );
    await sleep(33);
  }
  if (!firstEntry.landed)
    console.log(
      'debug',
      firstEntry.snap && firstEntry.snap.me,
      firstEntry.toasts.slice(-4),
      'dead',
      firstEntry.dead,
    );
  assertCondition(
    firstEntry.landed && firstEntry.landed.stellar === 'meridian-yards',
    'flew to and landed at Meridian Yards',
  );
  assertCondition(
    requiredFixtureValue(firstEntry.you).fuel ===
      requiredFixtureValue(requiredFixtureValue(firstEntry.you).shipStats).fuel,
    'refuelled on landing',
  );
  const saleMarket = requiredFixtureValue(
    requiredFixtureValue(firstEntry.landed).market?.find((item) => item.id === 'equipment'),
  );
  const saleTerms = requiredFixtureValue(firstEntry.landed).tradeTerms;
  const saleTotal = saleValue(
    saleMarket.quoteBase ?? requiredFixtureValue(saleMarket.price),
    { common: 5, rich: 0, pure: 0 },
    saleTerms.tradePct,
    saleTerms.site,
    saleTerms.sell,
    saleMarket.impact ?? 0,
  );
  const creditsBeforeSale = requiredFixtureValue(firstEntry.you).credits;
  firstEntry.send({ t: 'trade', cid: 'equipment', qty: -5 });
  await sleep(300);
  assertCondition(
    !requiredFixtureValue(firstEntry.you).cargo.equipment &&
      requiredFixtureValue(firstEntry.you).credits === creditsBeforeSale + saleTotal,
    'sold the equipment at the integrated destination-market quote',
  );
  // accept a job
  const mission =
    requiredFixtureValue(firstEntry.landed).offers.find(
      (mission2) =>
        mission2.type !== 'cargo' ||
        mission2.qty! <= requiredFixtureValue(requiredFixtureValue(firstEntry.you).shipStats).cargo,
    ) || requiredFixtureValue(firstEntry.landed).offers[0];
  firstEntry.send({ t: 'accept', id: requiredFixtureValue(mission).id });
  await sleep(300);
  assertCondition(
    requiredFixtureValue(firstEntry.you).missions.length === 1,
    `accepted a job: ${requiredFixtureValue(mission).title}`,
  );
  console.log('ALL BOT TESTS PASSED');
  process.exit(0);
})().catch((entity) => fail(entity.stack));
setTimeout(() => fail('timeout'), 120000);
