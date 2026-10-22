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
    inSystem = 0;
  for (const stellarBody of ports) {
    playerData.sys = stellarBody.system;
    playerData.stellar = stellarBody.id;
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
    for (const mission of game
      .offers(stellarBody, playerData)
      .filter((mission2) => mission2.type === 'supply')) {
      assert.notEqual(
        mission.dest,
        stellarBody.id,
        `${stellarBody.name} cannot offer a delivery to itself`,
      );
      supplies++;
    }
  }
  assert.ok(supplies > 20, 'relief delivery jobs remain available across galaxy');
  assert.ok(inSystem > 0, 'same-system flights to different destinations remain valid');
  const stellarBody = ports[0];
  game.features.fronts.moreOffers = mockFronts({
    moreOffers: () => [{ id: 'bad-origin', type: 'cargo', dest: stellarBody.id, reward: 1 }],
  }).moreOffers;
  assert.ok(
    !game.offers(stellarBody, playerData).some((mission) => mission.id === 'bad-origin'),
    'board rejects self-deliveries from other offer providers',
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
