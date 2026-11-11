import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STORY } from '../shared/story.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { loadoutValue, makeLoadout } from '../shared/rules.ts';
import { Space } from '../server/space.ts';
import { ensureQuevariDefender } from '../server/quevari-defender.ts';

const game = refineryGame();
const pilot = refineryPilot(game, 'Awakening captain');
const capital = game.spaces[STELLARS.inalumen.system];
ensureQuevariDefender(capital);
assert.ok(![...capital.ships.values()].some((ship) => ship.hull === 744));
const chapter = STORY.find((mission) => mission.id === 'qv5')!;
pilot.data.sys = capital.id;
pilot.data.stellar = 'inalumen';
pilot.data.story = {
  step: STORY.indexOf(chapter),
  done: ['qv1', 'qv2', 'qv3', 'qv4'],
  active: null,
};
game.features.docks.docksInit(pilot.data);
const previous = structuredClone(pilot.data.ship);
const priorDock = structuredClone(pilot.data.dock);
game.onMessage(pilot, { t: 'storyacc', id: 'qv5' });
assert.ok(pilot.data.story.done.includes('qv5'));
assert.deepEqual(pilot.data.ship, previous, 'awakening does not replace or refit the player hull');
assert.deepEqual(pilot.data.dock, priorDock, 'no old ship sale or drydock capacity side effect');
ensureQuevariDefender(capital);
ensureQuevariDefender(capital);
const defenders = [...capital.ships.values()].filter((ship) => ship.hull === 744);
assert.equal(defenders.length, 1, 'one defender per capital, not per captain/arrival');
const defender = defenders[0];
assert.equal(defender.faction, 'quevari');
assert.ok(!defender.player);
assert.ok(!defender.owner);
assert.equal(defender.ai, 'patrol');
assert.equal(capital.mayFlee(defender), false);
defender.born = -1e10;
defender.think = 0;
capital.ai(defender);
assert.equal(defender.ai, 'patrol', 'local patrol does not expire into a jump-out');
for (const actor of capital.ships.values()) if (actor !== defender) capital.remove(actor);
const hostile = capital.makeShip({
  hull: 761,
  faction: 'umbral',
  ai: 'raid',
  x: defender.x + 200,
  y: defender.y,
});
defender.think = 0;
capital.ai(defender);
assert.equal(
  defender.target,
  hostile,
  'ordinary faction hostility makes the patrol defend its home',
);
const elsewhere = game.spaces.sol;
ensureQuevariDefender(elsewhere);
assert.ok(![...elsewhere.ships.values()].some((ship) => ship.hull === 744));
pilot.data.stellar = null;
game.spawnPlayer(pilot, defender.x, defender.y, 0, 0);
defender.disabled = true;
const creditsBeforeBoard = pilot.data.credits;
for (const act of ['capture', 'plunder', 'rescue'] as const)
  game.features.hangar.board(pilot, { id: defender.id, act });
assert.equal(pilot.data.credits, creditsBeforeBoard);
assert.ok(pilot.sock.out.some((packet) => packet.msg?.includes('cannot be boarded')));
assert.ok(!pilot.data.dock.some((stored) => Number(stored.ship.hull) === 744));
assert.ok(game.A.ships[744].npcOnly);
assert.ok(!(game.yard(STELLARS.inalumen, pilot.data) || []).includes(744));

// Forged hail choices still cross the normal wire/handler boundary.
defender.disabled = false;
defender.pw = 1;
defender.x = pilot.ent!.x = 3200;
defender.y = pilot.ent!.y = 0;
assert.ok(game.features.hostile.myPower(pilot.data) > defender.pw * 1.6);
game.onMessage(pilot, { t: 'hailopt', id: defender.id, k: 'threat' });
assert.ok(JSON.stringify(pilot.sock.out.at(-1)).includes('We will not leave.'));
assert.equal(defender.ai, 'patrol');
const creditsBeforeHire = pilot.data.credits;
game.onMessage(pilot, { t: 'hailopt', id: defender.id, k: 'mercenary' });
assert.equal(defender.owner, null, 'forged hire action cannot take control of the named defender');
assert.equal(pilot.data.credits, creditsBeforeHire);
for (const departure of ['flee', 'leave', 'trade', 'escort']) {
  defender.ai = departure;
  defender.dest = { x: 5000, y: 0, out: true };
  defender.target = null;
  defender.think = 0;
  defender.life = 0;
  defender.noDisable = false;
  capital.ai(defender);
  assert.equal(defender.ai, 'patrol', `${departure} cannot override the local patrol`);
  assert.equal(capital.ships.get(defender.id), defender);
  assert.equal(defender.dead, false);
  assert.equal(defender.life, Infinity);
  assert.equal(defender.noDisable, true);
}
const eventsBeforeJump = capital.events.length;
capital.remove(defender, 'jump');
assert.equal(
  capital.ships.get(defender.id),
  defender,
  'jump-removal boundary refuses capital defender travel',
);
assert.equal(defender.dead, false);
assert.equal(capital.events.length, eventsBeforeJump, 'denied departure emits no jump flash');

// Old owners retain an exact recovery record and receive the full assessed hull/fitting value.
const capitalWithoutResidentAccounts = new Space(game, capital.id);
const savedAccounts = game.db.players;
game.db.players = {};
ensureQuevariDefender(capitalWithoutResidentAccounts);
assert.equal(
  [...capitalWithoutResidentAccounts.ships.values()].filter((ship) => ship.hull === 744).length,
  1,
  'world unlock survives independently of resident accounts',
);
game.db.players = savedAccounts;

const legacy = makeLoadout(game.A, 744, 'Saved sailship');
legacy.uid = pilot.data.ship.uid;
legacy.outfits[9021] = 1;
legacy.outfits[9020] = 2;
legacy.outfits[579] = 1;
pilot.data.ship = legacy;
pilot.data.dock.push({ ship: makeLoadout(game.A, 744, 'Stored sailship'), bridge: { captain: 7 } });
const oldDock = structuredClone(pilot.data.dock);
const refund = 2 * (loadoutValue(game.A, legacy) + loadoutValue(game.A, oldDock.at(-1)!.ship));
const creditsBeforeMigration = pilot.data.credits;
const cargoBefore = structuredClone(pilot.data.cargo);
const bridgeBefore = structuredClone(pilot.data.bridge);
game.features.story.storyInit(pilot.data);
assert.equal(pilot.data.ship.hull, 783);
assert.equal(pilot.data.ship.uid, legacy.uid);
assert.equal(pilot.data.ship.outfits[9021], 1, 'unique progression outfit stays available');
assert.equal(pilot.data.ship.outfits[9020], 2);
assert.equal(pilot.data.ship.outfits[579], 1);
assert.deepEqual(pilot.data.cargo, cargoBefore);
assert.deepEqual(pilot.data.bridge, bridgeBefore);
assert.deepEqual(pilot.data.story.retiredFlagships![0].ship, legacy);
assert.equal(pilot.data.story.retiredFlagships!.length, 2);
assert.equal(pilot.data.credits, creditsBeforeMigration + refund);
assert.deepEqual(pilot.data.dock.at(-1)!.bridge, oldDock.at(-1)!.bridge);
game.features.story.storyInit(pilot.data);
assert.equal(pilot.data.credits, creditsBeforeMigration + refund, 'retirement refunds once');
assert.equal(pilot.data.story.retiredFlagships!.length, 2);
const reloaded = JSON.parse(JSON.stringify(pilot.data));
game.features.story.storyInit(reloaded);
assert.equal(reloaded.credits, pilot.data.credits, 'reload does not repeat compensation');
assert.deepEqual(reloaded.story.retiredFlagships, pilot.data.story.retiredFlagships);
console.log(
  'ok - capital defender awakening, local hostility, boarding denial and legacy retirement',
);
