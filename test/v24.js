// 2.4 tests: the living galaxy (system states, trade impact, supply jobs) and questlines (contacts, side stories, salvage).
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { DB } from '../server/db.js';
import { Game } from '../server/game.js';
import { SYS, STELLARS, SYSTEMS } from '../shared/galaxy.js';
import { CHAINS, SIDE_STORIES } from '../shared/quests.js';
import { STATES } from '../shared/living.js';
const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
const ok = (c, m) => {
  if (!c) {
    console.error('FAIL:', m);
    process.exit(1);
  }
  console.log('ok -', m);
};
process.env.SEEDS_FILE = '/nonexistent';
{
  const { execFileSync } = await import('node:child_process');
  const cdir = decodeURIComponent(new URL('../client/', import.meta.url).pathname);
  const bad = [];
  for (const f of fs.readdirSync(cdir).filter((f) => f.endsWith('.js'))) {
    try {
      execFileSync(process.execPath, ['--input-type=module', '--check'], {
        input: fs.readFileSync(cdir + f),
        stdio: ['pipe', 'ignore', 'ignore'],
      });
    } catch {
      bad.push(f);
    }
  }
  ok(!bad.length, `every client script parses${bad.length ? ': BAD ' + bad.join(', ') : ''}`);
}
const g = new Game(A, new DB('/tmp/rift-v24-' + Date.now()));
function fake(name) {
  const sock = new EventEmitter();
  sock.open = true;
  sock.backlog = 0;
  const out = [];
  sock.send = (m) => out.push(typeof m === 'string' ? JSON.parse(m) : m);
  sock.close = () => {};
  g.connect(sock, '7.7.8.' + name.length);
  const send = (m) => sock.emit('message', JSON.stringify(m));
  send({ t: 'hello', name, pass: 'secret' });
  const s = [...g.sessions.values()].pop();
  return {
    s,
    d: s.data,
    out,
    send,
    toasts: () => out.filter((m) => m.t === 'toast').map((m) => m.msg),
    stories: () => out.filter((m) => m.t === 'story'),
    you: () => out.filter((m) => m.t === 'you').pop().d,
  };
}
const at = (P, id) => {
  P.d.stellar = id;
  P.d.sys = STELLARS[id].system;
};

// ---- living galaxy
g.features.living.livingTick();
const st = g.features.living.statesPayload(),
  n = Object.keys(st).length;
ok(
  n >= 3 && Object.values(st).every((x) => STATES[x.k]),
  `${n} systems start in a state (famine, war, boom...)`,
);
const famSys = g.features.living
  .marketSystems()
  .find(
    (s) =>
      SYS[s].stellars.some((p) => p.svc.includes('T') && !p.site && p.svc.includes('B')) && !st[s],
  );
g.db.world.states[famSys] = {
  kind: 'famine',
  start: Date.now(),
  until: Date.now() + 3e6,
  got: 0,
  need: 140,
};
const port =
  STELLARS[
    SYS[famSys].stellars.find((p) => p.svc.includes('T') && !p.site && p.svc.includes('B')).id
  ];
const F = fake('Famine Runner');
at(F, port.id);
F.d.credits = 1e6;
const food = () => g.market(port).find((c) => c.id === 'food');
const before = food();
ok(
  before && before.price > 0 && before.moved >= 100,
  `food sells for double during the famine (+${before && before.moved}%)`,
);
F.d.ship.hull = 704;
F.d.cargo.food = 20;
g.trade(F.s, 'food', -20);
const after = food();
ok(
  after.price < before.price,
  `selling food lowers its local price (${before.price} -> ${after.price})`,
);
ok(g.db.world.states[famSys].got === 20, 'and counts toward ending the famine');
const offs = g.offers(port, F.d);
ok(
  offs.some((o) => o.type === 'supply' && o.state === 'famine'),
  'the famine posts supply jobs',
);

// ---- contacts and generated stories
const bars = Object.values(STELLARS).filter(
  (p) => p.svc.includes('B') && !p.site && !SYS[p.system].arena,
);
const C1 = g.features.quests.contactAt(bars[0]),
  C2 = g.features.quests.contactAt(bars[0]);
ok(
  C1 && C1.name === C2.name && C1.title,
  `every bar has a contact who stays the same (${C1.name}, ${C1.title})`,
);
ok(
  new Set(bars.slice(0, 40).map((p) => g.features.quests.contactAt(p).name)).size >= 25,
  'contacts are different people from bar to bar',
);
let built = 0,
  bad = [];
for (const p of bars) {
  const d = g.fresh();
  d.name = 'Plan ' + p.id;
  const C = g.features.quests.contactAt(p),
    cur = g.features.quests.contactStory(p, d, C);
  if (!cur) continue;
  const Q = { qid: 'test', plan: cur.plan, steps: cur.X.steps, started: 1, name: cur.X.name };
  cur.X.steps.forEach((s0, i) => {
    const m = g.features.quests.questStepJob(d, Q, i);
    built++;
    if (
      !SYS[m.sys] ||
      (m.dest && !STELLARS[m.dest]) ||
      !(m.reward > 0) ||
      /\{\w+\}/.test(m.title + m.text) ||
      (m.hull && !g.A.ships[m.hull])
    )
      bad.push(`${p.id}:${cur.X.id}:${i}`);
  });
}
ok(
  built > 300 && !bad.length,
  `${built} generated story steps across every bar are valid jobs${bad.length ? ' BAD ' + bad.slice(0, 5) : ''}`,
);
ok(
  CHAINS.every((X) => X.steps.length >= 3) && new Set(CHAINS.map((X) => X.kind)).size >= 3,
  `${CHAINS.length} story templates for lawful, shady and frontier contacts`,
);

const Q = fake('Quest Taker');
const qd = Q.d;
at(Q, 'concordia');
const board = g.offers(STELLARS.concordia, qd),
  qo = board.find((o) => o.type === 'quest' && o.story);
ok(qo && board[0].type === 'quest', `the contact's story leads the board: "${qo && qo.title}"`);
Q.send({ t: 'accept', id: qo.id });
const qid = Object.keys(qd.quests.active)[0],
  act = qd.quests.active[qid];
ok(
  act && qd.missions.some((m) => m.quest && m.quest.qid === qid && m.quest.step === 0),
  'accepting starts the story with step 1 as a job',
);
ok(
  !g.offers(STELLARS.concordia, qd).some((o) => o.type === 'quest' && o.story),
  'the contact has nothing more while their story is under way',
);
// play it through
let guard = 0;
while (qd.quests.active[qid] && guard++ < 10) {
  const m = qd.missions.find((x) => x.quest && x.quest.qid === qid);
  const dest = m.dest ? STELLARS[m.dest] : STELLARS.concordia;
  if (m.type === 'supply') qd.cargo[m.cid] = m.qty;
  m.done = true;
  at(Q, dest.id);
  g.completeOnLanding(Q.s, dest);
}
ok(
  !qd.quests.active[qid] && qd.quests.done.some((x) => x.id === qid),
  `the story plays through all ${act.steps.length} steps`,
);
ok(
  Q.stories().length === act.steps.length && Q.stories().pop().tag.includes('COMPLETE'),
  'each step ends with a story beat, and the finale with its rewards',
);
ok(
  qd.quests.contacts['c:concordia'].n === 1 && qd.quests.contacts['c:concordia'].cool > Date.now(),
  'the contact remembers you and needs a while before the next story',
);

// failing and retrying
qd.quests.contacts['c:concordia'].cool = 0;
at(Q, 'concordia');
const qo2 = g.offers(STELLARS.concordia, qd).find((o) => o.type === 'quest' && o.story);
ok(
  qo2 && qo2.standing === 'Acquaintance' && qo2.story !== qo.story,
  `the next story is a different one, and you are now an ${qo2 && qo2.standing}`,
);
Q.send({ t: 'accept', id: qo2.id });
const qid2 = Object.keys(qd.quests.active)[0];
qd.missions = qd.missions.filter((m) => !(m.quest && m.quest.qid === qid2));
g.features.quests.questSweep(Q.s);
ok(
  qd.quests.active[qid2] && qd.missions.some((m) => m.quest && m.quest.qid === qid2),
  'a step lost with your ship gets a second chance',
);
qd.missions = qd.missions.filter((m) => !(m.quest && m.quest.qid === qid2));
g.features.quests.questSweep(Q.s);
ok(!qd.quests.active[qid2], 'losing it twice ends the story');
qd.quests.contacts['c:concordia'].cool = 0;
const qo3 = g.offers(STELLARS.concordia, qd).find((o) => o.type === 'quest' && o.story);
Q.send({ t: 'accept', id: qo3.id });
const m3 = qd.missions.find((m) => m.quest);
Q.send({ t: 'abandon', id: m3.id });
ok(
  !Object.keys(qd.quests.active).length && !qd.missions.some((m) => m.quest),
  'abandoning a step ends its story',
);

// ---- side stories
ok(
  SIDE_STORIES.length === 6 &&
    SIDE_STORIES.every(
      (X) =>
        STELLARS[X.at] && STELLARS[X.at].svc.includes('B') && X.steps.every((s0) => SYS[s0.sys]),
    ),
  'six side stories, each starting at a world with a bar',
);
ok(
  !SIDE_STORIES.some((X) =>
    ['threshold', 'inalumen', 'dimmer'].some(
      (k) => X.at.includes(k) || X.steps.some((s0) => s0.sys.includes(k)),
    ),
  ),
  "side stories stay clear of the main story's worlds",
);
const S = fake('Side Walker'),
  sd = S.d;
at(S, 'earth');
const so = g.offers(STELLARS.earth, sd).find((o) => o.side === 'farlight');
ok(so, 'a side story is offered where it begins');
S.send({ t: 'accept', id: so.id });
let sm = sd.missions.find((m) => m.quest);
sm.done = true;
at(S, 'earth');
g.completeOnLanding(S.s, STELLARS.earth);
sm = sd.missions.find((m) => m.quest);
ok(sm && sm.type === 'salvage' && sm.point, 'step 2 is a salvage job with a marked point');
// fly there and pick it up
at(S, 'coldharbor');
S.send({ t: 'depart' });
const sp = g.spaces.coldharbor,
  me = S.s.ent;
ok(me, 'launched in Coldharbor');
me.x = sm.point[0] + 400;
me.y = sm.point[1];
g.features.quests.questSalvageIdle(S.s);
const crate = sp.loot.find((l) => l.it.salvage === sm.id);
ok(crate, 'coming close puts the salvage crate on the scanner');
const other = fake('Claim Jumper');
ok(g.onLoot({ s: other.s }, crate.it) === false, 'nobody else can scoop up your salvage');
me.x = crate.x;
me.y = crate.y;
for (let i = 0; i < 10 && !sm.done; i++) sp.tick();
ok(sm.done, 'flying over it recovers the salvage');
sp.players = 0;
const cr0 = sd.credits;
g.completeOnLanding(S.s, STELLARS.coldharbor);
sm = sd.missions.find((m) => m.quest);
sm.done = true;
g.completeOnLanding(S.s, STELLARS.earth);
ok(
  sd.quests.sides.farlight &&
    sd.credits > cr0 + 85000 &&
    !g.offers(STELLARS.earth, sd).some((o) => o.side === 'farlight'),
  'finishing the side story pays its reward, and it is not offered again',
);
const Y = S.you();
ok(
  Y.quests && Y.quests.done.length === 1 && Y.quests.done[0].side,
  'the client gets the story journal',
);
// ---- combat AI
{
  const sp2 = g.spaces.halcyon;
  sp2.players = 1;
  const a = sp2.makeShip({
      hull: 705,
      faction: 'hollow',
      x: 0,
      y: 0,
      ai: 'raid',
      pers: 'cautious',
    }),
    b = sp2.makeShip({ hull: 705, faction: 'hollow', x: 600, y: 0, ai: 'raid' }),
    v = sp2.makeShip({ hull: 708, faction: 'quantum', x: -300, y: 0, ai: 'patrol' });
  ok(
    ['cautious', 'steady', 'reckless'].includes(b.pers),
    `NPC captains have a personality (${b.pers})`,
  );
  sp2.damage(a, 1, 1, v);
  ok(b.target === v, 'a ship under attack calls nearby friends to help');
  a.shield = 0;
  a.armor = a.st.armor * 0.3;
  a.think = 0;
  sp2.ai(a);
  ok(a.ai === 'flee' && !a.target, 'a cautious captain who is badly hurt runs for it');
  const boss = sp2.makeShip({
    hull: 705,
    faction: 'hollow',
    x: 0,
    y: 0,
    ai: 'raid',
    pers: 'cautious',
    mission: { id: 'x', owner: 0 },
  });
  boss.target = v;
  boss.shield = 0;
  boss.armor = boss.st.armor * 0.2;
  boss.think = 0;
  sp2.ai(boss);
  ok(boss.ai === 'raid', 'bounty targets fight to the end');
  sp2.players = 0;
}
console.log('ALL 2.4 TESTS PASSED');
process.exit(0);
