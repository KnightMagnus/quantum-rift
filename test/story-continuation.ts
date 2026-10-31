import assert from 'node:assert/strict';
import { verifyStoryClarity } from './helpers/story-clarity.ts';
import { verifyStorySeededMotion } from './helpers/story-seeded-motion.ts';
import { verifyStoryIntegrationEdges } from './helpers/story-integration-edge.ts';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import type { Session } from '../server/game.ts';
import type { StoryFlags } from '../server/save-contracts.ts';
import { STORY } from '../shared/story.ts';
import { SIDE_STORIES } from '../shared/quests.ts';
import { SYS, STELLARS } from '../shared/galaxy.ts';
import { mainEndings, storySystemVisible, storyDescription } from '../shared/story-world.ts';
import { sideStoryAvailable } from '../shared/story-quest-gates.ts';
import { mockPlayerData, mockSession } from './helpers/mocks.ts';

const root = path.resolve('.artifacts/story-authority');
filesystem.mkdirSync(root, { recursive: true });
const directory = filesystem.mkdtempSync(path.join(root, 'run-'));
try {
  const db = new DB(directory);
  const game = new Game(JSON.parse(filesystem.readFileSync('shared/assets.json', 'utf8')), db);
  const packets: Array<Record<string, unknown>> = [];
  function captain(name: string, id: number): Session {
    const data = mockPlayerData({ ...game.fresh(), name, tut: 999 });
    game.features.hangar.hangarInit(data);
    game.features.story.storyInit(data);
    game.features.quests.questInit(data);
    const session = mockSession({
      id,
      name,
      data,
      sock: {
        open: true,
        backlog: 0,
        send(value: string | object) {
          packets.push(
            typeof value === 'string' ? JSON.parse(value) : (value as Record<string, unknown>),
          );
        },
      },
    });
    game.sessions.set(id, session);
    return session;
  }
  const session = captain('Story authority', 28001);
  const innocent = captain('Other reality', 28002);
  const player = session.data;
  const active = () => session.data.story.active;
  function dock(at: string) {
    if (session.ent) {
      game.spaces[player.sys].remove(session.ent);
      session.ent = null;
    }
    player.stellar = at;
    player.sys = STELLARS[at].system;
    game.features.story.storyOnLand(session, STELLARS[at]);
  }
  function accept(id: string) {
    game.features.story.storyAccept(session, { id });
  }
  player.story.step = 5;
  player.story.done = STORY.slice(0, 5).map((mission) => mission.id);
  dock('qstation');
  accept('guests');
  assert.equal(player.story.active, null, 'a forged remote offer cannot start a chapter');
  dock('northmark-station');
  accept('guests');
  assert.equal(active()?.id, 'guests');
  dock('glasswake-foundry');
  assert.ok(player.story.done.includes('guests'));
  const pay = player.credits;
  accept('berth');
  game.features.story.storyAccept(session, { id: 'berth', choice: 'concord' });
  assert.equal(player.story.flags?.d1, undefined, 'choice before reaching the berth denied');
  dock('qstation');
  const decision = [...packets].reverse().find((packet) => packet.id === 'berth' && packet.choices);
  assert.ok(decision, 'arrival offers a landed completion choice');
  game.features.story.storyAccept(session, { id: 'berth', choice: 'forged' });
  assert.equal(player.story.flags?.d1, undefined);
  game.features.story.storyAccept(session, { id: 'berth', choice: 'concord' });
  assert.equal(player.story.flags?.d1, 'concord');
  assert.equal(player.credits, pay + 75000);
  game.features.story.storyAccept(session, { id: 'berth', choice: 'hollow' });
  assert.equal(player.credits, pay + 75000, 'replayed decision cannot repay or rewrite history');
  assert.equal(player.story.flags.d1, 'concord');
  assert.equal(innocent.data.story.flags?.d1, undefined, 'choices do not leak to another captain');
  accept('shades-below');
  dock('inalumen');
  game.features.story.storyAccept(session, { id: 'shades-below', choice: 'umbral' });
  assert.equal(player.story.flags.d2, 'umbral');
  accept('kept-below');
  dock('glasswake-foundry');
  assert.ok(player.story.done.includes('kept-below'));
  accept('breach');
  assert.equal(player.story.flags.breach_started, true);
  player.sys = 'dimmer';
  player.stellar = null;
  game.spawnPlayer(session, 0, 100, 0, 0);
  const border = game.spaces.dimmer;
  const enemies = [...border.ships.values()].filter(
    (entity) => entity.story === session.id && entity.storyKill,
  );
  assert.equal(enemies.length, 3);
  game.features.hail.hail(session, { id: enemies[0].id });
  const creatureHail = packets[packets.length - 1];
  assert.equal(
    creatureHail.machineHull,
    900,
    'a creature is shown as its actual hull, never a captain portrait',
  );
  assert.equal(creatureHail.portraitId, undefined);
  assert.deepEqual(creatureHail.opts, [], 'the Nhal offer no conversation or trade');
  const contactFuel = session.ent!.fuel;
  game.features.hail.hailOpt(session, { id: enemies[0].id, k: 'fuel' });
  assert.equal(session.ent!.fuel, contactFuel, 'forged creature dialogue options are inert');
  game.spawnPlayer(innocent, 0, 100, 0, 0);
  assert.equal(
    border.canHit(innocent.ent!, enemies[0]),
    false,
    'unrelated captain cannot consume personal encounter',
  );
  for (const enemy of enemies) border.kill(enemy, session.ent);
  assert.equal(active()?.ready, true, 'real Nhal kills update the personal mission');
  dock('qstation');
  accept('riftweavers');
  dock('glasswake-foundry');
  accept('dreamer');
  player.sys = 'maw';
  player.stellar = null;
  game.spawnPlayer(session, 0, 700, 0, 0);
  const deep = game.spaces.maw;
  const dreamer = [...deep.ships.values()].find(
    (entity) => entity.story === session.id && entity.hull === 908,
  )!;
  assert.ok(dreamer, 'real story-only Dreamer spawns');
  game.features.story.storyTick(session, deep, 31);
  assert.equal(active()?.ready, false, 'unprepared listening cannot bypass the boss');
  deep.kill(dreamer, session.ent);
  dock('qstation');
  game.features.story.storyAccept(session, { id: 'dreamer', choice: 'witness' });
  assert.equal(
    player.story.flags.nhal_ending,
    undefined,
    'unfinished investigations only permit kill',
  );
  game.features.story.storyAccept(session, { id: 'dreamer', choice: 'kill' });
  assert.equal(player.story.flags.nhal_ending, 'kill');
  game.features.story.storyAccept(session, { id: 'choice', choice: 'table' });
  assert.equal(player.story.flags.main_ending, undefined, 'locked finale rejected server-side');
  assert.ok(mainEndings(player.story.flags).includes('long_dream'));
  assert.deepEqual(mainEndings({}), ['unsettling']);
  for (const index of [undefined, 'survey_complete', 'concord_property', 'silence'] as const)
    for (const nhal of [undefined, 'kill', 'seal', 'witness'] as const)
      for (const d1 of ['concord', 'hollow', 'index'] as const)
        for (const d2 of ['umbral', 'quevari'] as const) {
          const flags: StoryFlags = { index_ending: index, nhal_ending: nhal, d1, d2 };
          const endings = mainEndings(flags);
          assert.equal(
            endings.includes('table'),
            index === 'survey_complete' && (nhal === 'witness' || nhal === 'seal'),
          );
          assert.equal(endings.includes('captains_watch'), nhal === 'witness' && d2 === 'quevari');
          assert.equal(
            endings.includes('long_dream'),
            d1 === 'concord' || index === 'survey_complete',
          );
        }
  assert.equal(storySystemVisible(player.story.flags, 'quantum-rift'), false);
  assert.equal(game.features.story.deepLocked(player, 'table'), true);
  const originalPrices = structuredClone(STELLARS.qstation.prices);
  assert.match(
    storyDescription({ main_ending: 'unsettling' }, 'qstation', 'Station'),
    /cold, silent crystal/,
  );
  assert.deepEqual(
    STELLARS.qstation.prices,
    originalPrices,
    'description lenses never mutate shared ports',
  );
  // Main endings and per-captain decisions survive a real journal checkpoint/reload.
  game.features.story.storyAccept(session, { id: 'choice', choice: 'long_dream' });
  assert.equal(player.story.flags.main_ending, 'long_dream');
  db.create(player.name, 'fixture', player);
  db.flush();
  assert.equal(new DB(directory).get(player.name)?.story.flags?.main_ending, 'long_dream');
  const restored = new DB(directory).get(player.name)!;
  assert.equal(restored.story.flags?.d1, 'concord');
  assert.equal(restored.story.flags?.d2, 'umbral');
  // Every authored objective resolves to a real world and destination, with no phantom jobs.
  for (const side of SIDE_STORIES) {
    assert.ok(STELLARS[side.at], side.id + ' real offering port');
    for (const step of side.steps) {
      assert.ok(!step.sys || SYS[step.sys], side.id + ' objective system');
      assert.ok(!step.dest || STELLARS[step.dest], side.id + ' destination');
      if (step.type === 'convoy')
        assert.ok(
          SYS[step.sys!].stellars.some((stellar) => stellar.svc?.includes('L') && !stellar.site),
          side.id + ' convoy landable destination',
        );
    }
  }
  const ring = SIDE_STORIES.find((side) => side.id === 'keepers-ring')!;
  assert.equal(sideStoryAvailable(ring, player), false);
  player.quests.sides['keepers-log'] = 1;
  player.expd = { n: 3, lore: [2] };
  assert.equal(sideStoryAvailable(ring, player), true, 'exact Fragment III read unlocks the ring');
  // A standalone native workgroup and dormant bosses cannot leak into reward-free story places.
  for (const system of ['table', 'quantum-rift', 'beyond-rift']) {
    const space = game.spaces[system];
    space.tick();
    assert.equal(
      [...space.ships.values()].filter((entity) => !entity.player).length,
      0,
      system + ' has no ambient traffic',
    );
  }
  // Harness is an actual installed outfit. Unfitted approach turns away; crossing changes no rewards.
  player.story.flags = { main_ending: 'table' };
  dock('qstation');
  player.sys = 'quantum-rift';
  player.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
  const rift = game.spaces['quantum-rift'];
  const mouth = rift.sys.stellars[0];
  const before = player.credits;
  game.wormholeTransit(session.ent!, rift, mouth);
  assert.equal(player.sys, 'quantum-rift');
  assert.ok(Math.hypot(session.ent!.x, session.ent!.y) > mouth.r, 'unfitted ship turned away');
  player.ship.outfits[9021] = 1;
  game.wormholeTransit(session.ent!, rift, mouth);
  assert.equal(player.sys, 'beyond-rift');
  assert.equal(player.story.flags.crossed_quantum_rift, true);
  assert.equal(player.credits, before, 'crossing grants no credits');
  assert.deepEqual(SYS['beyond-rift'].links, []);
  const arrival = game.spaces['beyond-rift'];
  game.wormholeTransit(session.ent!, arrival, arrival.sys.stellars[0]);
  assert.equal(player.sys, 'quantum-rift', 'manual return is playable');
  assert.equal(player.credits, before);
  const installed = player.ship.outfits[9021];
  dock('qstation');
  game.outfit(session, 9021, -1);
  assert.equal(player.ship.outfits[9021], installed, 'harness cannot be sold');
  const storedHarness = { ship: structuredClone(player.ship) };
  player.dock.push(storedHarness);
  delete player.ship.outfits[9021];
  player.story.flags.harness_built = true;
  dock('vigil-lamp');
  game.features.story.storyAccept(session, { id: 'harness-refit', choice: 'fit' });
  assert.equal(
    player.ship.outfits[9021],
    undefined,
    'a harness on a stored ship cannot be duplicated',
  );
  player.dock.pop();
  const refitBalance = player.credits;
  game.features.story.storyAccept(session, { id: 'harness-refit', choice: 'fit' });
  assert.equal(
    player.ship.outfits[9021],
    1,
    'a lost unique harness can be refitted without replaying rewards',
  );
  assert.equal(player.credits, refitBalance);
  const report = SIDE_STORIES.find((side) => side.id === 'index-report')!;
  dock('glasswake-foundry');
  game.features.quests.questStart(session, { side: report.id });
  assert.equal(
    player.quests.active['s:' + report.id],
    undefined,
    'side prerequisite enforced on direct start',
  );
  player.quests.sides['index-last-survey'] = 1;
  game.features.quests.questStart(session, { side: report.id });
  assert.ok(player.quests.active['s:' + report.id]);
  player.sys = 'qgate';
  player.stellar = 'qstation';
  game.completeOnLanding(session, STELLARS.qstation);
  assert.ok(player.quests.sides['index-report'], 'real delivery finishes Index report');
  // The forced departure is private, bounded, persistent and never grants a Harness.
  const finaleCaptain = captain('Table departure', 28003);
  const finalePlayer = finaleCaptain.data;
  finalePlayer.sys = 'qgate';
  finalePlayer.stellar = 'qstation';
  finalePlayer.story.step = STORY.findIndex((step) => step.id === 'choice');
  finalePlayer.story.done = STORY.slice(0, finalePlayer.story.step).map((step) => step.id);
  finalePlayer.story.flags = { index_ending: 'survey_complete', nhal_ending: 'witness' };
  finalePlayer.shipless = true;
  game.features.story.storyAccept(finaleCaptain, { id: 'choice', choice: 'table' });
  assert.equal(
    finalePlayer.story.flags.main_ending,
    undefined,
    'shipless Table cannot half-complete',
  );
  assert.equal(finalePlayer.story.done.includes('choice'), false);
  finalePlayer.shipless = false;
  const finaleBalance = finalePlayer.credits;
  game.features.story.storyAccept(finaleCaptain, { id: 'choice', choice: 'table' });
  assert.equal(finalePlayer.sys, 'quantum-rift');
  assert.equal(finalePlayer.stellar, null);
  assert.equal(finalePlayer.story.flight?.sys, 'quantum-rift');
  assert.equal(finaleCaptain.ent!.vx, 0);
  assert.equal(finaleCaptain.ent!.vy, 0);
  assert.equal(finalePlayer.ship.outfits[9021], undefined);
  const preparation = game.features.story.storyPayload(finalePlayer).preparation!;
  assert.equal(preparation.components.length, 5);
  assert.equal(preparation.components.filter((component) => component.complete).length, 0);
  assert.equal(
    Object.keys(finalePlayer.quests.active).length,
    0,
    'umbrella does not consume quest slots',
  );
  const protectedSpace = game.spaces['quantum-rift'];
  innocent.data.sys = 'quantum-rift';
  innocent.data.stellar = null;
  game.spawnPlayer(innocent, 2000, 2000, 0, 0);
  assert.equal(protectedSpace.canHit(innocent.ent!, finaleCaptain.ent!), false);
  assert.equal(protectedSpace.canHit(finaleCaptain.ent!, innocent.ent!), false);
  const unrelated = { x: innocent.ent!.x, y: innocent.ent!.y };
  innocent.ent!.vx = 50;
  const fixed = { x: finaleCaptain.ent!.x, y: finaleCaptain.ent!.y };
  finaleCaptain.ent!.vx = 100;
  game.onMessage(finaleCaptain, { t: 'input', seq: 1, th: 1, tu: 0, ab: 0, rv: 0, f1: 1, f2: 0 });
  protectedSpace.tick();
  assert.deepEqual({ x: finaleCaptain.ent!.x, y: finaleCaptain.ent!.y }, fixed);
  assert.equal(finaleCaptain.inputs.length, 0, 'movement packets cannot queue behind a cinematic');
  assert.notDeepEqual(
    { x: innocent.ent!.x, y: innocent.ent!.y },
    unrelated,
    'other captains in the same world keep simulating',
  );
  const outsider = protectedSpace.makeShip({
    loadout: structuredClone(finalePlayer.ship),
    faction: 'pirate',
    x: -1600,
    y: 700,
    a: 0,
  });
  assert.equal(
    protectedSpace.canHit(finaleCaptain.ent!, outsider),
    false,
    'protected captain cannot attack an NPC',
  );
  assert.equal(
    protectedSpace.canHit(outsider, finaleCaptain.ent!),
    false,
    'NPC damage is blocked too',
  );
  const protection = finaleCaptain.endingUntil;
  game.onMessage(finaleCaptain, { t: 'storyacc', id: 'table-departure-complete' });
  assert.equal(finaleCaptain.endingUntil, protection, 'early acknowledgment rejected');
  finaleCaptain.endingStartedAt = Date.now() - 122001;
  game.onMessage(finaleCaptain, { t: 'storyacc', id: 'table-departure-complete' });
  assert.equal(finaleCaptain.endingUntil, 0);
  assert.equal(
    protectedSpace.canHit(finaleCaptain.ent!, outsider),
    true,
    'ordinary combat policy resumes after acknowledgment',
  );
  game.onMessage(finaleCaptain, { t: 'storyacc', id: 'table-departure-complete' });
  assert.equal(finalePlayer.credits, finaleBalance, 'acknowledgment and replay grant no reward');
  finalePlayer.quests.sides['rift-alloy'] = 1;
  assert.equal(
    game.features.story.storyPayload(finalePlayer).preparation!.components[0].complete,
    true,
  );
  finalePlayer.story.flags.harness_built = true;
  assert.equal(game.features.story.storyPayload(finalePlayer).preparation!.harnessBuilt, true);
  db.create(finalePlayer.name, 'fixture', finalePlayer);
  db.flush();
  const storedFinale = new DB(directory).get(finalePlayer.name)!;
  assert.equal(storedFinale.story.flight?.sys, 'quantum-rift');
  assert.equal(
    game.features.story.storyPayload(storedFinale).preparation!.components[0].complete,
    true,
  );
  finalePlayer.story.flags.crossed_quantum_rift = true;
  assert.equal(game.features.story.storyPayload(finalePlayer).preparation, null);
  verifyStoryClarity(game, captain, packets);
  verifyStoryIntegrationEdges(game);
  verifyStorySeededMotion(game.A);
  console.log(
    'Story authority: main missions, exhaustive ending gates, personal combat, checkpoint choices, side prerequisites, hidden worlds and reward-free harness crossing passed.',
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}
process.exit(0);
