import { mockArmadaState, mockEntity, mockMission } from './helpers/mocks.ts';
import type { ContractPlan } from '../client/main.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import { type FixtureSession, refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { contractShares } from '../shared/mission-payouts.ts';
import { DB as Database } from '../server/db.ts';
function setup(count: number) {
  const game = refineryGame(),
    pilots = Array.from({ length: count }, (_unused, index) =>
      refineryPilot(game, `Team ${index + 1}`),
    );
  const assets = mockArmadaState({
    id: 'fixture-team',
    name: 'Fixture Team',
    leader: requiredFixtureValue(pilots[0]).data.name,
    members: pilots.map((session) => requiredFixtureValue(session).data.name),
    invites: {},
    emptyT: 0,
  });
  game.db.world.armadas[assets.id] = assets;
  for (const session of pilots) {
    requiredFixtureValue(session).data.armada = assets.id;
    requiredFixtureValue(session).data.stellar = 'concordia';
    requiredFixtureValue(session).data.sys = STELLARS.concordia.system;
  }
  const offer = game
    .offers(STELLARS.concordia, requiredFixtureValue(pilots[0]).data)
    .find((options) => options.type === 'warband');
  assert.ok(offer);
  const last = (session: FixtureSession | undefined) =>
    requiredFixtureValue(session)
      .sock.out.filter((message: { t: string }) => message.t === 'armadaContract')
      .at(-1)?.plan;
  const begin = () => {
    game.accept(pilots[0], offer.id);
    return requiredFixtureValue(last(pilots[0]));
  };
  const reply = (
    session: FixtureSession | undefined,
    operation: string,
    player: ContractPlan | null | undefined = last(session),
  ) =>
    game.features.coop.armadaOp(requiredFixtureValue(session), {
      op: operation,
      id: player?.id,
      revision: player?.revision,
    });
  return { g: game, pilots, A: assets, offer, last, begin, reply };
}
// Exercise expiration independently of the browser scenario's stable initial window.
const nativeNow = Date.now;
let boundaryTime = 1800000000000 + 599999;
try {
  Date.now = () => boundaryTime;
  const { g: game, pilots, offer, last } = setup(2);
  const before = pilots.map((session) => ({
    credits: requiredFixtureValue(session).data.credits,
    missions: structuredClone(requiredFixtureValue(session).data.missions),
  }));
  boundaryTime += 1;
  const currentOffer = game
    .offers(STELLARS.concordia, requiredFixtureValue(pilots[0]).data)
    .find((mission) => mission.type === 'warband');
  assert.ok(currentOffer);
  assert.notEqual(currentOffer.id, offer.id, 'Job IDs rotate at the real ten-minute boundary');
  game.accept(pilots[0], offer.id);
  assert.ok(
    pilots.every((session) => last(session) == null),
    'Expired offer creates no plan',
  );
  assert.deepEqual(
    pilots.map((session) => ({
      credits: requiredFixtureValue(session).data.credits,
      missions: requiredFixtureValue(session).data.missions,
    })),
    before,
    'Expired offer cannot assign jobs or change captain credits',
  );
  game.accept(pilots[0], currentOffer.id);
  assert.equal(
    last(pilots[0])?.roster.length,
    2,
    'Current replacement opens the real consent plan',
  );
  assert.ok(
    pilots.every((session) => requiredFixtureValue(session).data.missions.length === 0),
    'Refreshing an offer still cannot bypass Ready and Start',
  );
} finally {
  Date.now = nativeNow;
}
for (const count of [2, 4]) {
  const { g: game, pilots, A: message, offer, begin, reply } = setup(count),
    plan = begin();
  assert.ok(plan && plan.roster.length === count);
  assert.ok(
    pilots.every((session) => requiredFixtureValue(session).data.missions.length === 0),
    'A plan never assigns work',
  );
  reply(pilots[0], 'contractStart', plan);
  assert.ok(
    pilots.every((session) => requiredFixtureValue(session).data.missions.length === 0),
    'Start waits for every captain',
  );
  for (const session of pilots.slice(1)) reply(session, 'contractReady', plan);
  reply(pilots[0], 'contractStart', plan);
  const jobs = pilots.map((session) =>
    requiredFixtureValue(session).data.missions.find(
      (message3: { id: string }) => message3.id === offer.id,
    ),
  );
  assert.ok(jobs.every(Boolean));
  assert.equal(
    jobs.reduce((quantity, message2) => quantity + requiredFixtureValue(message2).reward, 0),
    offer.reward,
    'Issuance equals the one contract pool',
  );
  assert.equal(requiredFixtureValue(jobs[0]).offerVersion, 1);
  const before = pilots.map((session) =>
    JSON.stringify(requiredFixtureValue(session).data.missions),
  );
  reply(pilots[0], 'contractStart', plan);
  assert.deepEqual(
    pilots.map((session) => JSON.stringify(requiredFixtureValue(session).data.missions)),
    before,
    'Duplicate Start cannot assign or increase shares',
  );
  const offline = requiredFixtureValue(pilots.at(-1)),
    fixed = requiredFixtureValue(jobs.at(-1)).reward;
  game.features.coop.coopLogout(offline);
  game.sessions.delete(requiredFixtureValue(offline).id);
  message.members = message.members.filter(
    (quantity) => quantity !== requiredFixtureValue(offline).data.name,
  );
  game.features.coop.warbandDown(
    mockEntity({
      kingpin: offer.id,
      contractTeam: pilots.map((session) => requiredFixtureValue(session).data.name),
    }),
  );
  assert.equal(
    requiredFixtureValue(offline).data.missions[0].done,
    true,
    'Accepted offline teammates keep completion',
  );
  assert.equal(
    requiredFixtureValue(offline).data.missions[0].reward,
    fixed,
    'Disconnect/leave never redistributes a fixed share',
  );
  game.db.flush();
  assert.equal(
    requiredFixtureValue(new Database(game.db.dir).get(offline.data.name)).missions[0].done,
    true,
    'Offline completion persists',
  );
  const credits = requiredFixtureValue(pilots[0]).data.credits,
    share = requiredFixtureValue(jobs[0]).reward;
  game.completeOnLanding(pilots[0], STELLARS.concordia);
  game.completeOnLanding(pilots[0], STELLARS.concordia);
  assert.equal(
    requiredFixtureValue(pilots[0]).data.credits - credits,
    share,
    'Duplicate turn-in pays a fixed share once',
  );
  const late = refineryPilot(game, 'Late Captain');
  requiredFixtureValue(late).data.armada = message.id;
  message.members.push(requiredFixtureValue(late).data.name);
  assert.equal(
    requiredFixtureValue(late).data.missions.length,
    0,
    'Late join does not assign a completed/accepted contract',
  );
}
assert.equal(
  contractShares(10003, ['C', 'A', 'D', 'B']).reduce(
    (quantity, result) => quantity + result.share,
    0,
  ),
  10003,
  'Rounding never creates or loses pool credits',
);
{
  const { g: _game, pilots, begin, reply, last, offer } = setup(4),
    previousState = begin();
  reply(pilots[1], 'contractDecline', previousState);
  const revised = requiredFixtureValue(last(pilots[0]));
  assert.equal(revised.roster.length, 3);
  assert.ok(revised.revision > previousState.revision);
  assert.ok(
    revised.roster.every((result) => !result.ready),
    'Changed shares require renewed consent',
  );
  reply(pilots[2], 'contractReady', previousState);
  assert.equal(
    requiredFixtureValue(
      requiredFixtureValue(last(pilots[2])).roster.find(
        (result: { name: string }) => result.name === requiredFixtureValue(pilots[2]).data.name,
      ),
    ).ready,
    false,
    'Stale consent cannot approve changed shares',
  );
  for (const session of [pilots[0], pilots[2], pilots[3]]) reply(session, 'contractReady', revised);
  reply(pilots[0], 'contractStart', revised);
  assert.equal(requiredFixtureValue(pilots[1]).data.missions.length, 0, 'Refusal assigns nothing');
  assert.equal(
    pilots.reduce(
      (quantity, session) =>
        quantity +
        (requiredFixtureValue(session).data.missions.find(
          (message: { id: string }) => message.id === offer.id,
        )?.reward || 0),
      0,
    ),
    offer.reward,
  );
}
{
  const { pilots, begin, reply, last } = setup(2),
    player = begin();
  requiredFixtureValue(pilots[1]).data.missions = Array.from({ length: 6 }, (_unused, index) => ({
    id: 'other' + index,
    type: 'patrol',
    reward: 1,
  })).map(mockMission);
  reply(pilots[1], 'contractReady', player);
  assert.equal(last(pilots[0]), null, 'Capacity changes end the plan cleanly');
  assert.equal(requiredFixtureValue(pilots[0]).data.missions.length, 0);
  assert.equal(requiredFixtureValue(pilots[1]).data.missions.length, 6);
}
{
  const { g: game, pilots, begin, reply, last } = setup(2),
    player = begin();
  game.features.coop.coopLogout(pilots[1]);
  game.sessions.delete(requiredFixtureValue(pilots[1]).id);
  assert.equal(last(pilots[0]), null, 'Disconnect before Start cancels pending consent');
  reply(pilots[0], 'contractStart', player);
  assert.equal(requiredFixtureValue(pilots[0]).data.missions.length, 0);
}
console.log(
  '2/4-captain consent, fixed exact-pool shares, refusal/revision, stale/duplicate Start, capacity, disconnect/leave/late join and offline completion/duplicate payout passed.',
);
