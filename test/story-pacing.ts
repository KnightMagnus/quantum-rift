import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import { STELLARS, SYS } from '../shared/galaxy.ts';
import { storyReportPort, storyPreparationPremium } from '../shared/story-pacing.ts';
const mission = STORY.find((entry) => entry.id === 'qv3')!;
const alternate = Object.values(STELLARS).find(
  (port) =>
    port.id !== mission.back &&
    !port.site &&
    port.svc.includes('L') &&
    SYS[port.system].faction === SYS[STELLARS[mission.back!].system].faction,
)!;
assert.ok(alternate);
assert.equal(storyReportPort(mission, alternate.id), true);
assert.equal(
  storyReportPort({ ...mission, decision: 'd1' }, alternate.id),
  false,
  'Choices retain authored contact gate',
);
assert.equal(
  storyReportPort({ ...mission, type: 'carry' }, alternate.id),
  false,
  'Delivery retains exact destination',
);
const game = refineryGame();
const captain = refineryPilot(game, 'Pacing');
const begin = () => {
  captain.data.story = {
    step: STORY.indexOf(mission),
    done: [],
    active: { id: mission.id, got: mission.count!, spawned: true, ready: true },
  };
};
begin();
captain.data.sys = alternate.system;
captain.data.stellar = alternate.id;
const credits = captain.data.credits;
game.features.story.storyOnLand(captain, alternate);
assert.equal(captain.data.story.active, null);
assert.equal(captain.data.credits, credits + mission.pay);
game.features.story.storyOnLand(captain, alternate);
assert.equal(
  captain.data.credits,
  credits + mission.pay,
  'Repeated report never duplicates reward',
);
begin();
captain.data.story.active!.ready = false;
game.features.story.storyOnLand(captain, alternate);
assert.equal(captain.data.story.active!.id, mission.id, 'Unfinished combat cannot turn in');
assert.equal(storyPreparationPremium(captain.data.story, mission.sys!), true);
assert.equal(storyPreparationPremium(undefined, mission.sys!), false);
const board = Object.values(STELLARS).find(
  (port) => port.system === STELLARS[mission.at].system && port.svc.includes('B'),
)!;
captain.data.story.active = null;
const ordinary = game.offers(board, captain.data);
begin();
captain.data.story.active!.ready = false;
const boosted = game.offers(board, captain.data);
let premiums = 0;
for (const offer of boosted) {
  const previous = ordinary.find((entry) => entry.id === offer.id);
  if (!previous) continue;
  if (!offer.quest && !offer.exp && ['cargo', 'passenger', 'supply'].includes(offer.type)) {
    assert.equal(offer.reward, Math.round(previous.reward * 1.25));
    assert.match(offer.text, /listed reward includes it/);
    premiums++;
  } else
    assert.equal(offer.reward, previous.reward, 'Unique story/side rewards are not multiplied');
}
assert.ok(premiums > 0);
console.log(
  'Story pacing: public same-faction non-choice reporting, owner-only one-time payout, unfinished denial and transport premium passed.',
);
