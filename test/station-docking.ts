// Personal Station docking: the owner is always cleared, visitors use the guest dock.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { legacySocket, type LegacyPacket } from './helpers/legacy-fixture.ts';
import { mockPlayerData } from './helpers/mocks.ts';
import { requiredFixtureValue } from './helpers/required.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { DB as Database } from '../server/db.ts';
import { Game, type Session } from '../server/game.ts';
import { STELLARS, SYS as systemsById } from '../shared/galaxy.ts';
import { landingRefused, LANDING_REFUSAL_STANDING } from '../shared/reputation.ts';
import type { GameAssets } from '../shared/rules.ts';

const assets: GameAssets = JSON.parse(
  filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
process.env.SEEDS_FILE = '/nonexistent';

// Pure clearance rule.
const now = 1_000_000;
const hostile = {
  standing: LANDING_REFUSAL_STANDING - 50,
  outlawPort: false,
  ownStation: false,
  passExpires: 0,
  now,
};
assert.equal(landingRefused(hostile), true, 'a hostile record is refused at a lawful port');
assert.equal(
  landingRefused({ ...hostile, ownStation: true }),
  false,
  'your own station clears you whatever your record',
);
assert.equal(landingRefused({ ...hostile, outlawPort: true }), false, 'outlaw ports ignore record');
assert.equal(
  landingRefused({ ...hostile, passExpires: now + 1 }),
  false,
  'a live landing pass clears you',
);
assert.equal(
  landingRefused({ ...hostile, passExpires: now }),
  true,
  'an expired landing pass does not',
);
assert.equal(
  landingRefused({ ...hostile, standing: LANDING_REFUSAL_STANDING + 1 }),
  false,
  'neutral standing is cleared',
);

// Full server flow with a claimed station in a system whose faction hates both captains.
const siteId = 'site-meridian';
const site = STELLARS[siteId];
const faction = systemsById[site.system].faction;
const directory = tempDataDir('rift-station-docking-');
{
  const seedGame = new Game(assets, new Database(directory));
  for (const name of ['Home Owner', 'Visitor']) {
    const playerData = seedGame.db.create(name, 'secret', mockPlayerData(seedGame.fresh()));
    playerData.sys = site.system;
    playerData.stellar = siteId;
    playerData.tut = 999;
    playerData.rep[faction] = -80;
  }
  const owner = requiredFixtureValue(seedGame.db.get('Home Owner'));
  owner.station.claimed = true;
  owner.station.site = siteId;
  owner.station.ops = 3;
  seedGame.db.world.sites[siteId] = seedGame.db.key('Home Owner');
  seedGame.db.touch();
  seedGame.db.flush();
}
const game = new Game(assets, new Database(directory));

function connect(name: string) {
  const socket = legacySocket();
  socket.open = true;
  socket.backlog = 0;
  const output: LegacyPacket[] = [];
  socket.send = (message: string) =>
    output.push(typeof message === 'string' ? JSON.parse(message) : message);
  socket.close = () => {};
  game.connect(socket, '7.7.8.' + name.length);
  socket.emit('message', JSON.stringify({ t: 'hello', name, pass: 'secret' }));
  const session: Session = requiredFixtureValue([...game.sessions.values()].pop());
  return { session, output };
}

/** Depart, then hover over the station slowly enough to land. */
function hoverAtSite(session: Session) {
  game.depart(session);
  const entity = requiredFixtureValue(session.ent);
  entity.x = site.x;
  entity.y = site.y;
  entity.vx = entity.vy = 0;
}
const lastOf = (output: LegacyPacket[], type: string) =>
  [...output].reverse().find((message) => message.t === type) as unknown as
    | Record<string, unknown>
    | undefined;
const toasts = (output: LegacyPacket[]) =>
  output.filter((message) => message.t === 'toast').map((message) => message.msg);

const owner = connect('Home Owner');
hoverAtSite(owner.session);
owner.output.length = 0;
game.land(owner.session, siteId);
assert.equal(owner.session.data.stellar, siteId, 'the owner lands at their own station');
assert.equal(
  toasts(owner.output).some((text) => /refuses you permission/.test(text)),
  false,
  'no refusal toast for the owner',
);
const ownerLanded = requiredFixtureValue(lastOf(owner.output, 'landed'));
assert.deepEqual(
  {
    own: (ownerLanded.site as { own: boolean }).own,
    guest: (ownerLanded.site as { guest: boolean }).guest,
  },
  { own: true, guest: false },
  'the owner docks at home, not at the guest dock',
);
const creditsBefore = owner.session.data.credits;
hoverAtSite(owner.session);
owner.output.length = 0;
game.features.hail.hailPlanet(owner.session, siteId);
const ownerHail = requiredFixtureValue(lastOf(owner.output, 'hail'));
assert.deepEqual(ownerHail.opts, [], 'docking control offers the owner no bribe');
assert.match(String(ownerHail.text), /Welcome home/, 'docking control welcomes the owner home');
game.features.hail.hailPlanetOpt(owner.session, { t: 'hailopt', stellar: siteId, k: 'bribe' });
assert.equal(owner.session.data.credits, creditsBefore, 'a forced bribe request costs nothing');
assert.equal(owner.session.data.landPass?.[siteId], undefined, 'and buys no landing pass');
game.land(owner.session, siteId);
assert.equal(
  game.features.refinery.payload(owner.session).available,
  true,
  'the home refinery stays open to the owner despite their record',
);

const visitor = connect('Visitor');
hoverAtSite(visitor.session);
visitor.output.length = 0;
game.land(visitor.session, siteId);
assert.equal(visitor.session.data.stellar, null, 'a hostile visitor is still refused');
assert.ok(
  toasts(visitor.output).some((text) => /refuses you permission/.test(text)),
  'the visitor is told to hail',
);
visitor.session.data.rep[faction] = 0;
visitor.output.length = 0;
game.land(visitor.session, siteId);
assert.equal(visitor.session.data.stellar, siteId, 'a cleared visitor lands');
const visitorLanded = requiredFixtureValue(lastOf(visitor.output, 'landed'));
const visitorSite = visitorLanded.site as { own: boolean; guest: boolean; owner: string };
assert.deepEqual(
  { own: visitorSite.own, guest: visitorSite.guest, owner: visitorSite.owner },
  { own: false, guest: true, owner: 'Home Owner' },
  'visitors berth at the guest dock',
);
assert.equal(visitorLanded.yard, null, "the owner's station shipyard is closed to guests");
assert.equal(visitorLanded.outfitter, null, "the owner's outfitter is closed to guests");
assert.equal(
  (visitorLanded.refinery as { available: boolean }).available,
  false,
  "the owner's refinery is closed to guests",
);

console.log('ok - station docking: owner always cleared, visitors use the guest dock');
process.exit(0);
