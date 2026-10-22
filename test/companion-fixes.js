// Release companion regressions: delivery destination identity and Terra save compatibility.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { SYS, STELLARS } from '../shared/galaxy.ts';
import { SIDE_STORIES } from '../shared/quests.ts';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-companion-'));
try {
  const A = JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url)));
  const game = new Game(A, new DB(dir)),
    d = game.fresh();
  d.name = 'Destination regression';
  const ports = Object.values(STELLARS).filter(
    (p) => p.svc.includes('B') && p.svc.includes('T') && !p.site,
  );
  for (const S of Object.values(SYS))
    game.db.world.states[S.id] = { kind: 'plague', until: Date.now() + 1e7, got: 0, need: 100 };
  let supplies = 0,
    inSystem = 0;
  for (const p of ports) {
    d.sys = p.system;
    d.stellar = p.id;
    const local = game.features.living.stateOffers(p, d, () => 0, [], 1);
    for (const job of local.filter((o) => o.type === 'supply')) {
      assert.notEqual(job.dest, p.id, `local medical delivery from ${p.name} requires flight`);
      assert.equal(STELLARS[job.dest].system, p.system);
      inSystem++;
    }
    for (const job of game.offers(p, d).filter((o) => o.type === 'supply')) {
      assert.notEqual(job.dest, p.id, `${p.name} cannot offer a delivery to itself`);
      supplies++;
    }
  }
  assert.ok(supplies > 20, 'relief delivery jobs remain available across galaxy');
  assert.ok(inSystem > 0, 'same-system flights to different destinations remain valid');
  const p = ports[0];
  game.features.fronts.moreOffers = () => [
    { id: 'bad-origin', type: 'cargo', dest: p.id, reward: 1 },
  ];
  assert.ok(
    !game.offers(p, d).some((o) => o.id === 'bad-origin'),
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
  fs.rmSync(dir, { recursive: true, force: true });
}

process.exit(0);
