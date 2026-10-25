import { requiredFixtureValue } from './helpers/required.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { DB as Database } from '../server/db.ts';
import { SYS as systemsById, STELLARS, SITES, SYSTEMS, RESEARCH } from '../shared/galaxy.ts';
import { makeLoadout } from '../shared/rules.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
const root = path.resolve(import.meta.dirname, '..');
process.env.SEEDS_FILE = '/nonexistent';
const generated = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    `
import sys, json
sys.path.insert(0, 'test/Save Generator')
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
                {'tier':6}, {'tier':0}, {'location':'missing'}] + [{'ship':hull} for hull in range(900, 927)]:
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
const cases: { save: import('../server/game.ts').PlayerData }[] = JSON.parse(generated.stdout);
const game = refineryGame();
game.solo = true;
const catalog: {
  version: string;
  template: import('../server/game.ts').FreshPlayerData;
  ships: { id: number }[];
  sites: { id: string; system: string }[];
  locations: { id: string; system: string }[];
  research: unknown[];
  tutorialEnd: number;
  radio: string[];
} = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'test/Save Generator/catalog.json'), 'utf8'),
);
assert.equal(
  catalog.version,
  JSON.parse(fileSystem.readFileSync(path.join(root, 'package.json'), 'utf8')).version,
  'refresh generator version for each release',
);
assert.deepEqual(
  catalog.ships.map((ship) => ship.id),
  Object.values(game.A.ships)
    .filter((ship) => !ship.npcOnly)
    .map((ship) => ship.id),
  'generator must contain every player-eligible hull and no NPC-only hulls',
);
assert.ok(
  !catalog.ships.some((ship) => ship.id >= 900 && ship.id <= 926),
  'Index, Nhal and story-only ark hulls cannot be minted by the beta tool',
);
assert.deepEqual(
  catalog.sites.map(({ id: identifier, system }) => ({ id: identifier, system })),
  SITES.map(({ id: identifier, system }) => ({ id: identifier, system })),
);
assert.deepEqual(
  catalog.locations.map(({ id: identifier, system }) => ({ id: identifier, system })),
  SYSTEMS.flatMap((system) =>
    system.stellars
      .filter((port) => requiredFixtureValue(port.svc).includes('L') && !port.site)
      .map((port) => ({ id: port.id, system: system.id })),
  ),
);
assert.deepEqual(
  catalog.research,
  RESEARCH.map(({ id: identifier, ops: operations }) => ({ id: identifier, ops: operations })),
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
  assert.equal(requiredFixtureValue(captain).ship.hull, save.ship.hull);
  assert.equal(requiredFixtureValue(captain).credits, save.credits);
  assert.deepEqual(
    requiredFixtureValue(captain).ship.outfits,
    makeLoadout(game.A, save.ship.hull).outfits,
  );
  assert.equal(
    STELLARS[requiredFixtureValue(captain).stellar!].system,
    requiredFixtureValue(captain).sys,
  );
  assert.ok(systemsById[requiredFixtureValue(captain).sys]);
  if (save.station.claimed) assert.equal(game.siteOwner(save.station.site!), captain);
  const session = refineryPilot(game, name);
  assert.equal(requiredFixtureValue(session).data, captain);
  assert.ok(
    requiredFixtureValue(session).sock.out.some((packet: { t: string }) => packet.t === 'you'),
  );
  assert.ok(
    requiredFixtureValue(session).sock.out.some((packet: { t: string }) => packet.t === 'landed'),
  );
  assert.ok(
    !requiredFixtureValue(session).sock.out.some((packet: { t: string }) => packet.t === 'error'),
  );
  game.disconnect(session);
}
const stationSave = cases[0].save;
game.importSave(stationSave);
assert.equal(
  requiredFixtureValue(game.siteOwner(stationSave.station.site!)).name,
  stationSave.name,
);
assert.equal(
  new Database(game.db.dir).world.sites[stationSave.station.site!],
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
moved.station.site = requiredFixtureValue(
  SITES.find((site) => site.id !== stationSave.station.site),
).id;
game.importSave(moved);
assert.equal(game.siteOwner(stationSave.station.site!), null);
assert.equal(requiredFixtureValue(game.siteOwner(moved.station.site)).name, moved.name);
const noStation = structuredClone(cases.find(({ save }) => !save.station.claimed)!.save);
game.importSave(noStation);
assert.equal(
  game.siteOwner(moved.station.site),
  null,
  'removing station releases its old map claim',
);
// An older import missing a world-map entry must not be stolen either.
game.importSave(stationSave);
delete game.db.world.sites[stationSave.station.site!];
assert.throws(() => game.importSave({ ...stationSave, name: 'Other Captain' }), /another captain/);
const output = path.join(tempDataDir('rift-generator-cli-'), 'test.rift.json');
const commandLine = spawnSync(
  'python3',
  ['test/Save Generator/save_generator.py', '--output', output],
  {
    cwd: root,
  },
);
assert.equal(commandLine.status, 0, String(commandLine.stderr));
const first = fileSystem.readFileSync(output, 'utf8');
assert.equal(
  spawnSync('python3', ['test/Save Generator/save_generator.py', '--output', output], {
    cwd: root,
  }).status,
  2,
);
assert.equal(fileSystem.readFileSync(output, 'utf8'), first, 'CLI preserves existing files');
console.log(
  `PASS ${cases.length} generated saves imported and logged in; all player hulls/sites/tiers/ports, NPC-only hull denial, conflict/release/reload safety, invalid input and overwrite denial`,
);
process.exit(0);
