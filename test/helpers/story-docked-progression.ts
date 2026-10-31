import assert from 'node:assert/strict';
import type { Game } from '../../server/game.ts';
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
  } finally {
    if (session.ent) game.spaces[data.sys].remove(session.ent);
    game.sessions.delete(session.id);
  }
}
