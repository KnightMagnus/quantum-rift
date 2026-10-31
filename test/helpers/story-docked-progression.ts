import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../../server/game.ts';
import { DB } from '../../server/db.ts';
import type { QuestRecord } from '../../shared/quests.ts';
import { SIDE_STORIES } from '../../shared/quests.ts';
import { STORY } from '../../shared/story.ts';
import { STELLARS } from '../../shared/galaxy.ts';
import { mockPlayerData, mockSession } from './mocks.ts';

/** Check docked offers and same-port quest settlement through the real providers. */
export function verifyDockedProgression(game: Game): void {
  const packets: Array<Record<string, unknown>> = [];
  const data = mockPlayerData({ ...game.fresh(), name: 'Docked progression', tut: 999 });
  game.features.hangar.hangarInit(data);
  game.features.story.storyInit(data);
  game.features.quests.questInit(data);
  const session = mockSession({
    id: 74201,
    name: data.name,
    data,
    sock: {
      open: true,
      backlog: 0,
      send(value: string | object) {
        packets.push(typeof value === 'string' ? JSON.parse(value) : value);
      },
    },
  });
  game.sessions.set(session.id, session);
  function stage(id: string, port: string): void {
    const index = STORY.findIndex((step) => step.id === id);
    data.story = {
      step: index,
      done: STORY.slice(0, index).map((step) => step.id),
      active: { id, got: 0, spawned: false, ready: true },
      flags: { d2: 'umbral' },
    };
    data.sys = STELLARS[port].system;
    data.stellar = port;
    data.quests.sides['nhal-eye'] = 1;
    packets.length = 0;
  }
  function latestPort() {
    const packet = [...packets].reverse().find((candidate) => candidate.t === 'landed');
    assert.ok(packet, 'authoritative change refreshes the docked port');
    return packet;
  }
  function land(port: string): void {
    const body = STELLARS[port];
    data.sys = body.system;
    data.stellar = null;
    game.spawnPlayer(session, body.x, body.y, 0, 0);
    game.land(session, port);
    assert.equal(session.ent, null, 'real landing succeeded');
  }
  try {
    for (const [id, port, choice, next] of [
      ['berth', 'qstation', 'concord', 'shades-below'],
      ['shades-below', 'inalumen', 'umbral', 'kept-below'],
      ['dreamer', 'qstation', 'seal', 'choice'],
    ]) {
      stage(id, port);
      game.features.story.storyAccept(session, { id, choice });
      assert.equal((latestPort().story as { id: string }).id, next);
      assert.equal(data.story.active, null, 'the next optional chapter is not autoaccepted');
      const balance = data.credits;
      const count = packets.length;
      game.features.story.storyAccept(session, { id, choice });
      assert.equal(data.credits, balance, 'replayed choice grants no second reward');
      assert.equal(packets.length, count, 'replayed choice produces no popup or refresh storm');
    }
    stage('kept-below', 'glasswake-foundry');
    data.quests.sides['index-report'] = 1;
    land('glasswake-foundry');
    const port = latestPort();
    assert.equal((port.story as { id: string }).id, 'breach');
    assert.ok(
      (port.offers as Array<{ side?: string }>).some((offer) => offer.side === 'index-records'),
      'landing completion exposes newly unlocked side quests in the same port packet',
    );
    const balance = data.credits;
    game.features.story.storyOnLand(session, STELLARS['glasswake-foundry']);
    assert.equal(data.credits, balance, 'revisiting docked story state does not repay');

    for (const [side, port, step] of [
      ['index-records', 'qstation', 8],
      ['rift-harness', 'vigil-lamp', 0],
    ] as const) {
      const definition = SIDE_STORIES.find((candidate) => candidate.id === side)!;
      data.sys = STELLARS[port].system;
      data.stellar = port;
      data.story.flags = { main_ending: 'table' };
      const quest: QuestRecord = {
        qid: 's:' + side,
        side,
        name: definition.name,
        giver: definition.giver,
        at: definition.at,
        plan: { W: definition.at, Wsys: STELLARS[definition.at].system },
        steps: definition.steps.map((entry) => ({ ...entry })),
        step,
        started: 1,
        tries: 0,
      };
      data.quests.active = { [quest.qid]: quest };
      data.missions = [];
      game.features.quests.questPush(session, quest, true);
      data.missions[0].done = true;
      packets.length = 0;
      land(port);
      if (side === 'rift-harness') {
        assert.equal(data.ship.outfits[9021], 1, 'Harness is fitted on the survey return landing');
        assert.ok(data.quests.sides[side], 'same-port delivery completes its quest');
      } else {
        assert.equal(quest.step, 10, 'survey and same-port delivery settle together');
        assert.equal(data.missions.length, 1);
        assert.equal(
          data.missions[0].dest,
          'glasswake-foundry',
          'remote delivery still needs travel',
        );
      }
      const paid = data.credits;
      game.completeOnLanding(session, STELLARS[port]);
      assert.equal(data.credits, paid, 'repeated dock settlement cannot pay again');
      assert.ok(packets.filter((packet) => packet.t === 'story').length <= 3);
    }
    for (const [side, step] of [
      ['nhal-stirs', 0],
      ['nhal-soundings', 0],
      ['nhal-eye', 0],
      ['nhal-eye', 1],
      ['index-records', 8],
      ['rift-harness', 0],
    ] as const) {
      const definition = SIDE_STORIES.find((candidate) => candidate.id === side)!;
      const quest: QuestRecord = {
        qid: 's:' + side,
        side,
        name: definition.name,
        giver: definition.giver,
        at: definition.at,
        plan: { W: definition.at, Wsys: STELLARS[definition.at].system },
        steps: definition.steps.map((entry) => ({ ...entry })),
        step,
        started: 1,
        tries: 0,
      };
      data.quests.active = { [quest.qid]: quest };
      data.missions = [];
      game.features.quests.questPush(session, quest, true);
      const mission = data.missions[0];
      data.sys = mission.sys!;
      data.stellar = null;
      game.spawnPlayer(session, 0, 0, 0, 0);
      const lastPort = data.lastStellar;
      const balance = data.credits;
      assert.equal(
        game.completeRemoteQuest(session, mission),
        false,
        'unfinished observation denied',
      );
      mission.done = true;
      const flying = session.ent!;
      flying.dead = true;
      assert.equal(
        game.completeRemoteQuest(session, mission),
        false,
        'dead captains cannot settle',
      );
      flying.dead = false;
      const currentSystem = data.sys;
      data.sys = 'qgate';
      if (mission.sys !== data.sys)
        assert.equal(game.completeRemoteQuest(session, mission), false, 'wrong system denied');
      data.sys = currentSystem;
      const activeStep = quest.step;
      quest.step++;
      assert.equal(game.completeRemoteQuest(session, mission), false, 'stale objective denied');
      quest.step = activeStep;
      const authoredSide = quest.side;
      delete quest.side;
      assert.equal(
        game.completeRemoteQuest(session, mission),
        false,
        'ordinary quests remain landing paid',
      );
      quest.side = authoredSide;
      mission.done = false;
      const unrelated = { ...mission, id: 'ordinary-unrelated', quest: undefined, done: true };
      data.missions.push(unrelated);
      const oldCargo = data.cargo;
      if (side === 'nhal-eye' && step === 1) data.cargo = { food: 100000 };

      if (mission.type === 'survey') {
        mission.points = [[0, 0]];
        mission.seen = [];
        game.features.fronts.missionIdle(session);
      } else {
        assert.ok(game.features.quests.questLoot(session, { salvage: mission.id }));
        assert.equal(game.features.quests.questLoot(session, { salvage: mission.id }), false);
      }
      assert.equal(quest.step, step + 1, 'real survey or collection advances exactly one step');
      assert.equal(data.lastStellar, lastPort, 'remote completion does not invent a landing');
      assert.equal(data.credits, balance + mission.reward, 'existing step payout paid once');
      assert.ok(data.missions.includes(unrelated), 'simultaneous unrelated job remains unpaid');
      assert.equal(unrelated.paid, undefined);
      const next = data.missions.find((entry) => entry.quest?.qid === quest.qid)!;
      if (side === 'nhal-eye' && step === 1) {
        assert.equal(data.cargo.food, 100000, 'full hold loses no existing goods');
        assert.equal(next.type, 'cargo', 'physical delivery remains reserved with a full hold');
        data.cargo = oldCargo;
      }
      assert.equal(next.quest!.step, step + 1);
      const paid = data.credits;
      assert.equal(
        game.completeRemoteQuest(session, mission),
        false,
        'replayed notification denied',
      );
      if (next.type === 'cargo' || side === 'nhal-stirs') {
        next.done = true;
        assert.equal(
          game.completeRemoteQuest(session, next),
          false,
          'physical delivery or final scene stays docked',
        );
      }
      assert.equal(data.credits, paid);
      const restored = JSON.parse(JSON.stringify(data));
      assert.equal(restored.quests.active[quest.qid].step, step + 1);
      assert.ok(
        restored.missions.some((entry: { id: string }) => entry.id === next.id),
        'pending delivery survives save serialization',
      );
      game.spaces[data.sys].remove(session.ent!);
      session.ent = null;
    }
    const deliveryChain: QuestRecord = {
      qid: 'c:docked:chain',
      name: 'Docked delivery chain',
      giver: 'Port clerk',
      at: 'qstation',
      plan: { W: 'qstation', Wsys: 'qgate' },
      steps: [
        { type: 'survey', sys: 'qgate', title: 'Survey', brief: 'Survey the system.' },
        {
          type: 'cargo',
          sys: 'qgate',
          dest: 'qstation',
          cid: 'crystal',
          qty: 1,
          title: 'Deliver',
          brief: 'Deliver the record.',
        },
        {
          type: 'supply',
          sys: 'qgate',
          dest: 'qstation',
          cid: 'crystal',
          qty: 2,
          title: 'Supply',
          brief: 'Supply two crystals.',
        },
        {
          type: 'cargo',
          sys: 'qgate',
          dest: 'qstation',
          cid: 'crystal',
          qty: 1,
          title: 'Deliver',
          brief: 'Deliver the record.',
        },
      ],
      step: 0,
      started: 2,
      tries: 0,
    };
    data.sys = 'qgate';
    data.stellar = 'qstation';
    data.missions = [];
    data.cargo = {};
    data.quests.active = { [deliveryChain.qid]: deliveryChain };
    game.features.quests.questPush(session, deliveryChain, true);
    data.missions[0].done = true;
    game.completeOnLanding(session, STELLARS.qstation);
    assert.equal(deliveryChain.step, 2, 'same-port chaining stops at unmet supply requirements');
    assert.equal(data.missions.length, 1);
    assert.equal(data.missions[0].type, 'supply', 'the unmet step remains playable');
    const stoppedBalance = data.credits;
    game.completeOnLanding(session, STELLARS.qstation);
    assert.equal(data.credits, stoppedBalance, 'an unmet step cannot generate repeated rewards');

    stage('kept-below', 'glasswake-foundry');
    data.missions = [];
    data.quests.active = {};
    data.quests.sides['index-report'] = 1;
    game.db.create(data.name, 'dock-fixture', data);
    game.hello(session, { name: data.name, pass: 'dock-fixture' });
    assert.equal(
      (latestPort().story as { id: string }).id,
      'breach',
      'login projects completed docked story state',
    );
    const loggedInBalance = session.data.credits;
    packets.length = 0;
    game.hello(session, { name: data.name, pass: 'dock-fixture' });
    assert.equal(
      session.data.credits,
      loggedInBalance,
      'repeated login cannot repay docked completion',
    );
    verifyRemoteSettlementRestart(game);
  } finally {
    if (session.ent) game.spaces[data.sys].remove(session.ent);
    game.sessions.delete(session.id);
  }
}

/** Persist a collected objective, reopen storage, and finish its delivery after login. */
function verifyRemoteSettlementRestart(source: Game): void {
  const root = path.resolve('.artifacts/story-authority');
  filesystem.mkdirSync(root, { recursive: true });
  const directory = filesystem.mkdtempSync(path.join(root, 'remote-restart-'));
  try {
    const database = new DB(directory);
    const game = new Game(structuredClone(source.A), database);
    const data = database.create('Remote restart', 'restart-fixture', game.fresh());
    game.features.hangar.hangarInit(data);
    game.features.story.storyInit(data);
    game.features.quests.questInit(data);
    data.tut = 999;
    const definition = SIDE_STORIES.find((side) => side.id === 'nhal-eye')!;
    const quest: QuestRecord = {
      qid: 's:nhal-eye',
      side: definition.id,
      name: definition.name,
      giver: definition.giver,
      at: definition.at,
      plan: { W: definition.at, Wsys: STELLARS[definition.at].system },
      steps: definition.steps.map((step) => ({ ...step })),
      step: 1,
      started: 1,
      tries: 0,
    };
    data.quests.active[quest.qid] = quest;
    const session = mockSession({
      id: 74202,
      name: data.name,
      data,
      sock: { open: true, backlog: 0, send() {} },
    });
    game.sessions.set(session.id, session);
    game.features.quests.questPush(session, quest, true);
    const mission = data.missions[0];
    data.sys = mission.sys!;
    data.stellar = null;
    game.spawnPlayer(session, 0, 0, 0, 0);
    database.touch();
    database.flush();
    const initialCredits = data.credits;
    assert.equal(game.features.quests.questLoot(session, { salvage: mission.id }), true);
    assert.equal(data.credits, initialCredits + mission.reward);
    const delivery = data.missions[0];
    assert.equal(delivery.type, 'cargo');
    assert.equal(delivery.dest, 'tide');
    database.flush();

    const restoredDatabase = new DB(directory);
    const restoredGame = new Game(structuredClone(source.A), restoredDatabase);
    const restoredSession = mockSession({ id: 74203, sock: { open: true, backlog: 0, send() {} } });
    restoredGame.sessions.set(restoredSession.id, restoredSession);
    restoredGame.hello(restoredSession, { name: data.name, pass: 'restart-fixture' });
    const restored = restoredSession.data;
    assert.equal(
      restored.credits,
      initialCredits + mission.reward,
      'remote reward survives storage restart',
    );
    assert.equal(restored.quests.active[quest.qid].step, 2);
    assert.equal(restored.missions.length, 1, 'login retains one pending physical delivery');
    assert.equal(restored.missions[0].id, delivery.id);
    restoredGame.hello(restoredSession, { name: data.name, pass: 'restart-fixture' });
    assert.equal(
      restored.credits,
      initialCredits + mission.reward,
      'repeat login cannot repay remote completion',
    );
    assert.equal(restored.missions.length, 1);
    assert.equal(
      restoredGame.features.quests.questLoot(restoredSession, { salvage: mission.id }),
      false,
    );

    function landAtDestination(): void {
      const destination = STELLARS.tide;
      restored.sys = destination.system;
      restored.stellar = null;
      restoredGame.spawnPlayer(restoredSession, destination.x, destination.y, 0, 0);
      restoredGame.land(restoredSession, destination.id);
      assert.equal(restoredSession.ent, null, 'delivery completes through actual landing');
    }
    landAtDestination();
    const finalCredits =
      initialCredits + mission.reward + delivery.reward + definition.reward.credits;
    assert.equal(restored.credits, finalCredits, 'delivery and final quest rewards paid once');
    assert.equal(restored.quests.active[quest.qid], undefined);
    assert.ok(restored.quests.sides[definition.id]);
    assert.equal(restored.missions.length, 0);
    landAtDestination();
    assert.equal(
      restored.credits,
      finalCredits,
      'repeated landing cannot repay the restored quest',
    );
    restoredDatabase.flush();
    assert.equal(new DB(directory).get(data.name)!.credits, finalCredits, 'final payout persists');
  } finally {
    filesystem.rmSync(directory, { recursive: true, force: true });
  }
}
