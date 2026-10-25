import assert from 'node:assert/strict';
import type { Game } from '../../server/game.ts';
import { STELLARS, SYS } from '../../shared/galaxy.ts';
import { EXPEDITION_HULK, EXPEDITION_LORE } from '../../shared/expeditions.ts';
import { STORY } from '../../shared/story.ts';
import { mockSession, mockMission, mockPlayerData } from './mocks.ts';

/** Verify story groundwork using the Gateway suite's existing isolated game. */
export function verifyStoryFoundations(game: Game) {
  const gateway = STELLARS['sol-gateway'];
  assert.equal(gateway.system, 'qgate', 'legacy stellar ID resolves to Concordia');
  assert.equal(SYS.sol.gate, undefined);
  assert.equal(SYS.qgate.gate, 'coldharbor');
  assert.equal(SYS.coldharbor.gate, 'qgate');
  assert.equal(gateway.name, 'The Gateway');
  assert.equal(gateway.wormhole, 'coldharbor');
  assert.equal(STELLARS['coldharbor-gate'].wormhole, 'qgate');
  const dockDistance = Math.hypot(gateway.x - STELLARS.qstation.x, gateway.y - STELLARS.qstation.y);
  assert.ok(
    dockDistance >= 2500 && dockDistance <= 3000,
    'Gateway is a short cruise from Quantum Station',
  );
  for (const stellar of SYS.qgate.stellars)
    if (stellar.id !== gateway.id)
      assert.ok(
        Math.hypot(gateway.x - stellar.x, gateway.y - stellar.y) > gateway.r + stellar.r + 200,
      );
  for (const field of SYS.qgate.fields || [])
    assert.ok(Math.hypot(gateway.x - field.x, gateway.y - field.y) > gateway.r + field.r);
  assert.deepEqual(
    STORY.map(({ id, pay, rep }) => [id, pay, rep]),
    [
      ['qv1', 15000, 8],
      ['qv2', 35000, 10],
      ['qv3', 50000, 12],
      ['qv4', 150000, 15],
      ['qv5', 0, 20],
    ],
  );
  assert.match(STORY[0].text, /Our ships sail to a hundred ports/);
  assert.doesNotMatch(STORY[0].text, /first outsider/);
  assert.equal(EXPEDITION_LORE.length, 8);
  assert.equal(EXPEDITION_LORE[1].title, 'Fragment II: Kept Below');
  assert.match(EXPEDITION_LORE[6].text, /guests can see each other/);
  assert.doesNotMatch(
    EXPEDITION_LORE.map(({ text }) => text).join(' '),
    /Milky Way|Riftweavers|Gargantua/,
  );
  assert.equal(EXPEDITION_HULK.x, STELLARS['aureole-ring'].x);
  assert.ok(
    STELLARS['aureole-ring'].y - EXPEDITION_HULK.y >= 4000,
    'hulk lies well north of the research ring',
  );
  const player = mockPlayerData(game.fresh());
  const session = mockSession({
    id: 8871,
    name: 'Story foundations',
    data: player,
    sock: { open: true, backlog: 0, send() {} },
  });
  game.sessions.set(session.id, session);
  const home = SYS.coldharbor.stellars.find((stellar) => stellar.svc?.includes('B'))!;
  player.sys = 'coldharbor';
  player.stellar = home.id;
  for (const count of [0, 1, 7, 8, 19]) {
    player.expd = { n: count, lore: [] };
    const offer = game.features.arcs.expeditionOffer(STELLARS[home.id], player)!;
    assert.equal(
      offer.exp.b,
      EXPEDITION_HULK.system,
      'each new Farside expedition returns to the same hulk',
    );
  }
  // An accepted pre-update recovery retains its original destination on progression.
  game.features.arcs.expeditionNext(session, {
    exp: { n: 0, stage: 1, b: 'quietude', home: home.id },
  });
  assert.equal(player.missions.at(-1)!.sys, 'quietude');
  player.missions = [
    mockMission({
      id: 'exp-fixed',
      type: 'rescue',
      sys: 'aureole',
      hull: 704,
      faction: 'farside',
      wreckName: 'Hulk survey cradle',
      exp: { n: 0, stage: 2, b: 'aureole', home: home.id },
    }),
  ];
  player.sys = 'aureole';
  player.stellar = null;
  game.spawnPlayer(session, 0, 0, 0, 0);
  game.features.fronts.missionArrive(session, game.spaces.aureole);
  const cradle = [...game.spaces.aureole.ships.values()].find(
    (entity) => entity.rescueOf?.id === 'exp-fixed',
  )!;
  assert.ok(cradle.disabled);
  assert.equal(cradle.x, EXPEDITION_HULK.x + 1000);
  assert.equal(cradle.y, EXPEDITION_HULK.y);
  assert.ok(
    !Object.values(STELLARS).some(
      (stellar) =>
        stellar.system === 'aureole' &&
        stellar.x === EXPEDITION_HULK.x &&
        stellar.y === EXPEDITION_HULK.y,
    ),
    'hulk is scenery, never a dock or combat target',
  );
  console.log(
    'Story foundations: stable IDs/rewards, safe Gateway approach, spoiler bounds, fixed hulk and legacy mission compatibility passed.',
  );
}
