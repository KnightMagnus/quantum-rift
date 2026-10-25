import { mockPlayerData, mockFronts } from './helpers/mocks.ts';
import type { LivingState } from '../server/world-contracts.ts';
// Release companion regressions: delivery destination identity and Terra save compatibility.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { DB as Database } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { SIDE_STORIES } from '../shared/quests.ts';
import { storySystemVisible } from '../shared/story-world.ts';

const directory = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-companion-'));
try {
  const assets = JSON.parse(
    filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
  );
  const game = new Game(assets, new Database(directory)),
    playerData = mockPlayerData(game.fresh());
  playerData.name = 'Destination regression';
  const ports = Object.values(STELLARS).filter(
    (player) => player.svc.includes('B') && player.svc.includes('T') && !player.site,
  );
  for (const system of Object.values(systemsById))
    game.db.world.states[system.id] = {
      kind: 'plague',
      until: Date.now() + 1e7,
      got: 0,
      need: 100,
    } as LivingState;
  let supplies = 0,
    inSystem = 0,
    ordinaryCargo = 0;
  for (const stellarBody of ports) {
    playerData.sys = stellarBody.system;
    playerData.stellar = stellarBody.id;
    game.features.story.storyInit(playerData);
    playerData.story.flags = stellarBody.system === 'table' ? { main_ending: 'table' } : {};
    const local = game.features.living.stateOffers(stellarBody, playerData, () => 0, [], 1);
    for (const mission of local.filter((options) => options.type === 'supply')) {
      assert.notEqual(
        mission.dest,
        stellarBody.id,
        `local medical delivery from ${stellarBody.name} requires flight`,
      );
      assert.equal(STELLARS[mission.dest!].system, stellarBody.system);
      inSystem++;
    }
    const board = game.offers(stellarBody, playerData);
    for (const cargo of board.filter((offer) => offer.type === 'cargo')) {
      ordinaryCargo++;
      assert.ok(
        !['nhal_bone', 'nhal_ichor', 'nhal_eye', 'index_core', 'index_parts'].includes(cargo.cid!),
        'ordinary cargo contracts never mint encounter salvage',
      );
    }
    for (const mission of board.filter((mission2) => mission2.type === 'supply')) {
      assert.notEqual(
        mission.dest,
        stellarBody.id,
        `${stellarBody.name} cannot offer a delivery to itself`,
      );
      supplies++;
    }
  }
  assert.ok(ordinaryCargo > 20, 'salvage exclusion covers working cargo boards across the galaxy');
  assert.ok(supplies > 20, 'relief delivery jobs remain available across galaxy');
  assert.ok(inSystem > 0, 'same-system flights to different destinations remain valid');
  const tablePort = STELLARS['table-station'];
  playerData.sys = tablePort.system;
  playerData.stellar = tablePort.id;
  playerData.story.flags = { main_ending: 'table' };
  const tableOffers = game.offers(tablePort, playerData);
  assert.ok(tableOffers.length > 0, 'unlocked Table station has a real working job board');
  assert.ok(
    tableOffers.every(
      (offer) => !offer.sys || storySystemVisible(playerData.story.flags, offer.sys),
    ),
  );
  playerData.story.flags = {};
  assert.deepEqual(
    game.offers(tablePort, playerData),
    [],
    'captains cannot query a locked personal port',
  );
  const stellarBody = ports[0];
  playerData.sys = stellarBody.system;
  playerData.stellar = stellarBody.id;
  game.features.fronts.moreOffers = mockFronts({
    moreOffers: () => [
      { id: 'bad-origin', type: 'cargo', dest: stellarBody.id, reward: 1 },
      { id: 'hidden-table', type: 'cargo', sys: 'table', dest: 'table-station', reward: 1 },
    ],
  }).moreOffers;
  assert.ok(
    !game.offers(stellarBody, playerData).some((mission) => mission.id === 'bad-origin'),
    'board rejects self-deliveries from other offer providers',
  );
  const publicOffers = game.offers(stellarBody, playerData);
  assert.ok(
    !publicOffers.some((offer) => offer.id === 'hidden-table'),
    'providers cannot leak a hidden destination through the public board',
  );
  assert.ok(
    publicOffers
      .filter((offer) => offer.type === 'cargo')
      .every(
        (offer) =>
          !['nhal_bone', 'nhal_ichor', 'nhal_eye', 'index_core', 'index_parts'].includes(
            offer.cid!,
          ),
      ),
    'ordinary cargo contracts do not mint combat salvage',
  );
  assert.equal(STELLARS.earth.name, 'Terra');
  assert.equal(
    STELLARS.earth.id,
    'earth',
    'existing save and mission destination ID remains stable',
  );
  assert.equal(STELLARS.earth.land, 'earth', 'original artwork lookup remains stable');
  assert.ok(
    JSON.stringify(SIDE_STORIES).includes('Terra'),
    'story copy uses new player-facing name',
  );
  assert.ok(
    !JSON.stringify(SIDE_STORIES).includes('Earth'),
    'old name is not exposed by side stories',
  );
  console.log(
    `Companion fixes: ${supplies} relief offers and ${inSystem} in-system routes require travel; Terra name preserves IDs/art references.`,
  );
} finally {
  filesystem.rmSync(directory, { recursive: true, force: true });
}

process.exit(0);
