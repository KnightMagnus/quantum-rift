import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { mockMission } from './helpers/mocks.ts';
import { STELLARS, FACTIONS } from '../shared/galaxy.ts';
import { BLACK_MARKET } from '../shared/syndicate.ts';

const game = refineryGame();
const session = refineryPilot(game, 'Syndicate safety');
const player = session.data;
player.sys = 'qgate';
player.stellar = null;
player.rep.quantum = player.rep.spacer = 0;
game.spawnPlayer(session, 10000, 10000, 0, 0);
assert.ok(session.ent);
const mission = mockMission({
  id: 'illegal-hit',
  type: 'bounty',
  syn: 'hit',
  owner: session.id,
  sys: player.sys,
  hull: 704,
  faction: 'quantum',
  targetName: 'Contract courier',
  reward: 22000,
  title: 'Test contract',
});
player.missions.push(mission);
const space = game.spaces[player.sys];
const target = space.spawnMissionTarget(mission);
assert.ok(target);
const startingCredits = player.credits;
const startingTokens = { ...player.tokens };
space.damage(target, 1e8, 1e8, session.ent);
assert.equal(mission.done, true, 'real mission target completes through production damage');
assert.equal(player.credits, startingCredits, 'illegal hit has no lawful kill bounty');
assert.equal(player.rep.quantum, -10);
assert.equal(player.rep.spacer, 0, 'illegal hit does not gain generic lawful kill standing');
const startingSyndicate = player.syn;
game.completeOnLanding(session, STELLARS.qstation);
assert.equal(player.credits, startingCredits + 22000, 'contract pay is awarded once');
assert.ok(player.syn > startingSyndicate);
assert.equal(player.rep.quantum, -10, 'turn-in does not repair the targeted faction standing');
assert.deepEqual(
  player.tokens || {},
  startingTokens,
  'illegal turn-in grants no lawful store tokens',
);
game.completeOnLanding(session, STELLARS.qstation);
assert.equal(player.credits, startingCredits + 22000);

const outlaw = Object.values(STELLARS).find((port) => port.outlaw)!;
player.stellar = outlaw.id;
player.sys = outlaw.system;
session.ent = null;
player.syn = 1000;
player.rep.quantum = -80;
player.rep.spacer = -40;
player.rep.hollow = -100;
const papers = game.features.syndicate
  .blackMarket(outlaw, player)!
  .items.find((item) => item.id === 'papers')!;
assert.match(papers.desc, new RegExp(FACTIONS.quantum.name));
assert.match(papers.desc, /-80 to -10/);
const beforePapers = player.credits;
game.features.syndicate.bmBuy(session, 'papers');
assert.equal(player.rep.quantum, -10);
assert.equal(player.rep.spacer, -40);
assert.equal(player.rep.hollow, -100);
assert.equal(
  player.credits,
  beforePapers - BLACK_MARKET.find((item) => item.id === 'papers')!.price,
);
player.rep.spacer = 0;
const noNeed = game.features.syndicate
  .blackMarket(outlaw, player)!
  .items.find((item) => item.id === 'papers')!;
// Clear any other eligible negative record before the denial check.
for (const faction of Object.keys(player.rep))
  if (!FACTIONS[faction]?.pirate) player.rep[faction] = 0;
assert.match(
  game.features.syndicate.blackMarket(outlaw, player)!.items.find((item) => item.id === 'papers')!
    .desc,
  /No eligible/,
);
const beforeDenied = player.credits;
game.features.syndicate.bmBuy(session, 'papers');
assert.equal(player.credits, beforeDenied);
assert.ok(noNeed);
console.log(
  'Syndicate contracts: unlawful kill consequences, once-only contract pay and exact papers preview/settlement passed.',
);
