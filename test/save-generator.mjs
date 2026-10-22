import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DB } from '../server/db.ts';
import { SYS, STELLARS, SITES, SYSTEMS, RESEARCH } from '../shared/galaxy.ts';
import { makeLoadout } from '../shared/rules.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.js';
import { tempDataDir } from './helpers/temp-data.js';
const root = path.resolve(import.meta.dirname, '..');
process.env.SEEDS_FILE = '/nonexistent';
const generated = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    `
import sys, json
sys.path.insert(0, 'Testing/SaveGenerator')
from save_generator import create_save, CATALOG
cases = []
for ship in CATALOG['ships']:
    cases.append(create_save(ship=ship['id'], credits=123456, tier=5, research=True, all_radio=True))
for site in CATALOG['sites']:
    cases.append(create_save(site=site['id'], tier=3))
for tier in range(6):
    cases.append(create_save(tier=tier, location='qstation', research=True))
for port in CATALOG['locations']:
    cases.append(create_save(tier=0, location=port['id']))
for invalid in [{'name':'x'}, {'name':'constructor'}, {'credits':-1}, {'credits':1.5},
                {'credits':9007199254740992}, {'ship':-1}, {'site':'missing'},
                {'tier':6}, {'tier':0}, {'location':'missing'}]:
    try:
        create_save(**invalid)
        raise AssertionError('Accepted invalid input: ' + str(invalid))
    except ValueError:
        pass
print(json.dumps(cases))
`,
  ],
  { cwd: root, encoding: 'utf8', maxBuffer: 8e6 },
);
assert.equal(generated.status, 0, generated.stderr);
const cases = JSON.parse(generated.stdout);
const game = refineryGame();
game.solo = true;
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'Testing/SaveGenerator/catalog.json')));
assert.equal(
  catalog.version,
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version,
  'refresh generator version for each release',
);
assert.deepEqual(
  catalog.ships.map((ship) => ship.id),
  Object.values(game.A.ships).map((ship) => ship.id),
  'generator must contain every current hull',
);
assert.deepEqual(
  catalog.sites.map(({ id, system }) => ({ id, system })),
  SITES.map(({ id, system }) => ({ id, system })),
);
assert.deepEqual(
  catalog.locations.map(({ id, system }) => ({ id, system })),
  SYSTEMS.flatMap((system) =>
    system.stellars
      .filter((port) => port.svc.includes('L') && !port.site)
      .map((port) => ({ id: port.id, system: system.id })),
  ),
);
assert.deepEqual(
  catalog.research,
  RESEARCH.map(({ id, ops }) => ({ id, ops })),
);
assert.equal(catalog.tutorialEnd, TUTORIAL.length);
assert.deepEqual(
  catalog.radio,
  RADIO_STATIONS.map((station) => station.id),
);
const fresh = game.fresh();
fresh.station.refT = 0;
assert.deepEqual(catalog.template, fresh, 'refresh generator when fresh-save schema changes');
for (const { save } of cases) {
  const name = game.importSave(save);
  const captain = game.db.get(name);
  assert.equal(captain.ship.hull, save.ship.hull);
  assert.equal(captain.credits, save.credits);
  assert.deepEqual(captain.ship.outfits, makeLoadout(game.A, save.ship.hull).outfits);
  assert.equal(STELLARS[captain.stellar].system, captain.sys);
  assert.ok(SYS[captain.sys]);
  if (save.station.claimed) assert.equal(game.siteOwner(save.station.site), captain);
  const session = refineryPilot(game, name);
  assert.equal(session.data, captain);
  assert.ok(session.sock.out.some((packet) => packet.t === 'you'));
  assert.ok(session.sock.out.some((packet) => packet.t === 'landed'));
  assert.ok(!session.sock.out.some((packet) => packet.t === 'error'));
  game.disconnect(session);
}
const stationSave = cases[0].save;
game.importSave(stationSave);
assert.equal(game.siteOwner(stationSave.station.site).name, stationSave.name);
assert.equal(
  new DB(game.db.dir).world.sites[stationSave.station.site],
  game.db.key(stationSave.name),
);
const before = JSON.stringify({ players: game.db.players, world: game.db.world });
assert.throws(() => game.importSave({ ...stationSave, name: 'Other Captain' }), /another captain/);
assert.equal(JSON.stringify({ players: game.db.players, world: game.db.world }), before);
assert.throws(
  () => game.importSave({ ...stationSave, station: { ...stationSave.station, site: 'invalid' } }),
  /Unknown station/,
);
assert.equal(JSON.stringify({ players: game.db.players, world: game.db.world }), before);
const moved = structuredClone(stationSave);
moved.station.site = SITES.find((site) => site.id !== stationSave.station.site).id;
game.importSave(moved);
assert.equal(game.siteOwner(stationSave.station.site), null);
assert.equal(game.siteOwner(moved.station.site).name, moved.name);
const noStation = structuredClone(cases.find(({ save }) => !save.station.claimed).save);
game.importSave(noStation);
assert.equal(
  game.siteOwner(moved.station.site),
  null,
  'removing station releases its old map claim',
);
// An older import missing a world-map entry must not be stolen either.
game.importSave(stationSave);
delete game.db.world.sites[stationSave.station.site];
assert.throws(() => game.importSave({ ...stationSave, name: 'Other Captain' }), /another captain/);
const output = path.join(tempDataDir('rift-generator-cli-'), 'test.rift.json');
const cli = spawnSync('python3', ['Testing/SaveGenerator/save_generator.py', '--output', output], {
  cwd: root,
});
assert.equal(cli.status, 0, String(cli.stderr));
const first = fs.readFileSync(output, 'utf8');
assert.equal(
  spawnSync('python3', ['Testing/SaveGenerator/save_generator.py', '--output', output], {
    cwd: root,
  }).status,
  2,
);
assert.equal(fs.readFileSync(output, 'utf8'), first, 'CLI preserves existing files');
console.log(
  `PASS ${cases.length} generated saves imported and logged in; all hulls/sites/tiers/ports, conflict/release/reload safety, invalid input and overwrite denial`,
);
process.exit(0);
