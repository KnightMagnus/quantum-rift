import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
import { STELLARS } from '../shared/galaxy.js';
import { contractShares } from '../shared/mission-payouts.js';
import { DB } from '../server/db.js';
function setup(count) {
  const g = refineryGame(),
    pilots = Array.from({ length: count }, (_, i) => refineryPilot(g, `Team ${i + 1}`));
  const A = {
    id: 'fixture-team',
    name: 'Fixture Team',
    leader: pilots[0].data.name,
    members: pilots.map((s) => s.data.name),
    invites: {},
    emptyT: 0,
  };
  g.db.world.armadas[A.id] = A;
  for (const s of pilots) {
    s.data.armada = A.id;
    s.data.stellar = 'concordia';
    s.data.sys = STELLARS.concordia.system;
  }
  const offer = g.offers(STELLARS.concordia, pilots[0].data).find((o) => o.type === 'warband');
  assert.ok(offer);
  const last = (s) => s.sock.out.filter((m) => m.t === 'armadaContract').at(-1)?.plan;
  const begin = () => {
    g.accept(pilots[0], offer.id);
    return last(pilots[0]);
  };
  const reply = (s, op, p = last(s)) =>
    g.features.coop.armadaOp(s, { op, id: p?.id, revision: p?.revision });
  return { g, pilots, A, offer, last, begin, reply };
}
for (const count of [2, 4]) {
  const { g, pilots, A, offer, begin, reply } = setup(count),
    plan = begin();
  assert.ok(plan && plan.roster.length === count);
  assert.ok(
    pilots.every((s) => s.data.missions.length === 0),
    'A plan never assigns work',
  );
  reply(pilots[0], 'contractStart', plan);
  assert.ok(
    pilots.every((s) => s.data.missions.length === 0),
    'Start waits for every captain',
  );
  for (const s of pilots.slice(1)) reply(s, 'contractReady', plan);
  reply(pilots[0], 'contractStart', plan);
  const jobs = pilots.map((s) => s.data.missions.find((m) => m.id === offer.id));
  assert.ok(jobs.every(Boolean));
  assert.equal(
    jobs.reduce((n, m) => n + m.reward, 0),
    offer.reward,
    'Issuance equals the one contract pool',
  );
  assert.equal(jobs[0].offerVersion, 1);
  const before = pilots.map((s) => JSON.stringify(s.data.missions));
  reply(pilots[0], 'contractStart', plan);
  assert.deepEqual(
    pilots.map((s) => JSON.stringify(s.data.missions)),
    before,
    'Duplicate Start cannot assign or increase shares',
  );
  const offline = pilots.at(-1),
    fixed = jobs.at(-1).reward;
  g.features.coop.coopLogout(offline);
  g.sessions.delete(offline.id);
  A.members = A.members.filter((n) => n !== offline.data.name);
  g.features.coop.warbandDown({ kingpin: offer.id, contractTeam: pilots.map((s) => s.data.name) });
  assert.equal(offline.data.missions[0].done, true, 'Accepted offline teammates keep completion');
  assert.equal(
    offline.data.missions[0].reward,
    fixed,
    'Disconnect/leave never redistributes a fixed share',
  );
  g.db.flush();
  assert.equal(
    new DB(g.db.dir).get(offline.data.name).missions[0].done,
    true,
    'Offline completion persists',
  );
  const credits = pilots[0].data.credits,
    share = jobs[0].reward;
  g.completeOnLanding(pilots[0], STELLARS.concordia);
  g.completeOnLanding(pilots[0], STELLARS.concordia);
  assert.equal(
    pilots[0].data.credits - credits,
    share,
    'Duplicate turn-in pays a fixed share once',
  );
  const late = refineryPilot(g, 'Late Captain');
  late.data.armada = A.id;
  A.members.push(late.data.name);
  assert.equal(
    late.data.missions.length,
    0,
    'Late join does not assign a completed/accepted contract',
  );
}
assert.equal(
  contractShares(10003, ['C', 'A', 'D', 'B']).reduce((n, r) => n + r.share, 0),
  10003,
  'Rounding never creates or loses pool credits',
);
{
  const { g: _g, pilots, begin, reply, last, offer } = setup(4),
    old = begin();
  reply(pilots[1], 'contractDecline', old);
  const revised = last(pilots[0]);
  assert.equal(revised.roster.length, 3);
  assert.ok(revised.revision > old.revision);
  assert.ok(
    revised.roster.every((r) => !r.ready),
    'Changed shares require renewed consent',
  );
  reply(pilots[2], 'contractReady', old);
  assert.equal(
    last(pilots[2]).roster.find((r) => r.name === pilots[2].data.name).ready,
    false,
    'Stale consent cannot approve changed shares',
  );
  for (const s of [pilots[0], pilots[2], pilots[3]]) reply(s, 'contractReady', revised);
  reply(pilots[0], 'contractStart', revised);
  assert.equal(pilots[1].data.missions.length, 0, 'Refusal assigns nothing');
  assert.equal(
    pilots.reduce((n, s) => n + (s.data.missions.find((m) => m.id === offer.id)?.reward || 0), 0),
    offer.reward,
  );
}
{
  const { pilots, begin, reply, last } = setup(2),
    p = begin();
  pilots[1].data.missions = Array.from({ length: 6 }, (_, i) => ({
    id: 'other' + i,
    type: 'patrol',
    reward: 1,
  }));
  reply(pilots[1], 'contractReady', p);
  assert.equal(last(pilots[0]), null, 'Capacity changes end the plan cleanly');
  assert.equal(pilots[0].data.missions.length, 0);
  assert.equal(pilots[1].data.missions.length, 6);
}
{
  const { g, pilots, begin, reply, last } = setup(2),
    p = begin();
  g.features.coop.coopLogout(pilots[1]);
  g.sessions.delete(pilots[1].id);
  assert.equal(last(pilots[0]), null, 'Disconnect before Start cancels pending consent');
  reply(pilots[0], 'contractStart', p);
  assert.equal(pilots[0].data.missions.length, 0);
}
console.log(
  '2/4-captain consent, fixed exact-pool shares, refusal/revision, stale/duplicate Start, capacity, disconnect/leave/late join and offline completion/duplicate payout passed.',
);
