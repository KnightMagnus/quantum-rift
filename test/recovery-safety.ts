import assert from 'node:assert/strict';
import { refineryGame, refineryPilot } from './helpers/refinery-fixture.ts';
import { STELLARS, START, SYS } from '../shared/galaxy.ts';
import { landingRefused } from '../shared/reputation.ts';
import { storySystemVisible } from '../shared/story-world.ts';

const originalRandom = Math.random;
let randomState = 7101;
Math.random = () =>
  (randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0) / 4294967296;
try {
  for (const wanted of [false, true]) {
    for (const ownedStation of [false, true]) {
      const game = refineryGame();
      const session = refineryPilot(game, 'Recovery test');
      const player = session.data;
      player.credits = 0;
      player.station.ops = 3;
      if (wanted) for (const faction of Object.keys(player.rep)) player.rep[faction] = -100;
      if (ownedStation) player.station.site = 'site-qgate';
      else player.station.site = undefined;
      player.sys = START.system;
      player.stellar = null;
      game.spawnPlayer(session, 0, 0, 0, 0);
      assert.ok(session.ent);
      session.retaliationVisit = { sys: player.sys, factions: new Set(['quantum']) };
      const previous = session.ent;
      const origin = game.spaces[player.sys];
      origin.remove(previous);
      game.onPlayerDeath(game.pref(session), origin);
      assert.equal(player.credits, 0);
      assert.equal(
        session.retaliationVisit,
        undefined,
        'prior fleet retaliation does not bypass rebuilt exit grace',
      );
      assert.ok(player.stellar);
      const recovery = STELLARS[player.stellar];
      assert.ok(
        storySystemVisible(undefined, recovery.system),
        'insurance never reveals a hidden system',
      );
      assert.equal(
        landingRefused({
          standing: player.rep[SYS[recovery.system].faction] || 0,
          outlawPort: !!recovery.outlaw,
          ownStation: game.ownSite(player, recovery),
          passExpires: 0,
          now: Date.now(),
        }),
        false,
      );
      if (ownedStation) assert.equal(recovery.id, 'site-qgate');
      else if (!wanted) assert.equal(recovery.id, START.stellar);
      else assert.ok(recovery.outlaw);
      game.depart(session);
      assert.ok(session.ent);
      // Run production movement/jump from the actual recovery berth; no location teleport.
      const entity = session.ent;
      entity.a = Math.atan2(entity.x - recovery.x, -(entity.y - recovery.y));
      const space = game.spaces[player.sys];
      const source = player.sys;
      const destination = SYS[source].links.find(
        (id) => !game.features.story.deepLocked(player, id),
      );
      assert.ok(destination);
      for (let ticks = 0; ticks < 1800 && session.ent && player.sys === source; ticks++) {
        entity.inp = { thrust: 1 };
        game.jump(session, destination);
        space.tick();
      }
      assert.ok(session.ent, 'captain survives the departure');
      assert.equal(
        player.sys,
        destination,
        'recovery provides an actual exit even when broke and wanted',
      );
    }
  }
} finally {
  Math.random = originalRandom;
}
console.log(
  'Recovery safety: eligible own/public/outlaw berths, depleted credits and real departure/jump passed.',
);

const graceGame = refineryGame();
const graceSession = refineryPilot(graceGame, 'Insurance grace');
graceSession.data.station.ops = 3;
graceSession.data.stellar = null;
graceGame.spawnPlayer(graceSession, 0, 0, 0, 0);
const graceSpace = graceGame.spaces[graceSession.data.sys];
graceGame.onPlayerDeath(graceGame.pref(graceSession), graceSpace);
graceGame.depart(graceSession);
assert.ok(graceSession.ent);
const rebuilt = graceSession.ent;
assert.equal(rebuilt.recoveryGraceT, graceSpace.t + 30);
assert.equal(graceSession.recoveryGrace, false, 'departure consumes the one-time grant');
const threat = graceSpace.makeShip({
  hull: 708,
  faction: 'umbral',
  x: 10000,
  y: 10000,
  ai: 'raid',
});
assert.equal(graceSpace.spared(threat, rebuilt), true);
assert.ok(rebuilt.guns[0]);
graceSpace.fire(rebuilt, rebuilt.guns[0], null, rebuilt.a);
assert.equal(rebuilt.graceT, 0, 'aggression immediately ends insurance grace');
assert.equal(graceSpace.spared(threat, rebuilt), false);
console.log('Insurance exit grace is one-time, NPC-only and ends on aggression.');

await import('./mercenary-contracts.ts');

await import('./encounter-feedback.ts');

// Recovery stays near the loss unless the captain owns a recovery station.
const nearbyGame = refineryGame();
const nearbyCaptain = refineryPilot(nearbyGame, 'Nearby recovery');
const remotePort = Object.values(STELLARS).find(
  (port) =>
    port.system !== START.system &&
    port.svc.includes('L') &&
    !port.site &&
    storySystemVisible(undefined, port.system) &&
    SYS[port.system].faction !== 'deep' &&
    !landingRefused({
      standing: nearbyCaptain.data.rep[SYS[port.system].faction] || 0,
      outlawPort: !!port.outlaw,
      ownStation: false,
      passExpires: 0,
      now: Date.now(),
    }),
);
assert.ok(remotePort);
nearbyCaptain.data.station.site = undefined;
nearbyCaptain.data.sys = remotePort.system;
nearbyCaptain.data.stellar = null;
nearbyGame.spawnPlayer(nearbyCaptain, 0, 0, 0, 0);
nearbyGame.onPlayerDeath(nearbyGame.pref(nearbyCaptain), nearbyGame.spaces[remotePort.system]);
assert.equal(
  nearbyCaptain.data.sys,
  remotePort.system,
  'local eligible berth wins over distant starter port',
);

const lootGame = refineryGame();
const killer = refineryPilot(lootGame, 'Salvage killer');
const helper = refineryPilot(lootGame, 'Salvage support');
const outsider = refineryPilot(lootGame, 'Salvage outsider');
for (const captain of [killer, helper, outsider]) {
  captain.data.sys = START.system;
  captain.data.stellar = null;
  lootGame.spawnPlayer(captain, 0, 0, 0, 0);
}
killer.data.armada = helper.data.armada = 'salvage-party';
lootGame.db.world.armadas['salvage-party'] = {
  id: 'salvage-party',
  name: 'Salvage party',
  leader: killer.data.name,
  members: [killer.data.name, helper.data.name],
  invites: {},
  t: 0,
  emptyT: 0,
};
const lootSpace = lootGame.spaces[START.system];
const victim = lootSpace.makeShip({ hull: 708, faction: 'umbral', x: 0, y: 0, ai: 'raid' });
lootSpace.dropLoot(victim, killer.ent);
const protectedLoot = lootSpace.loot[0].it;
assert.ok(protectedLoot.credits);
assert.deepEqual(protectedLoot.combatPickup?.captains, [killer.data.name, helper.data.name]);
const outsiderCredits = outsider.data.credits;
assert.equal(lootGame.onLoot(lootGame.pref(outsider), protectedLoot), false);
assert.equal(outsider.data.credits, outsiderCredits, 'outsider cannot consume reserved loot');
// A late join does not rewrite the already-dropped parcel's claim.
lootGame.db.world.armadas['salvage-party'].members.push(outsider.data.name);
outsider.data.armada = 'salvage-party';
assert.equal(lootGame.onLoot(lootGame.pref(outsider), protectedLoot), false);
const helperCredits = helper.data.credits;
lootGame.onLoot(lootGame.pref(helper), protectedLoot);
assert.ok(helper.data.credits > helperCredits, 'support member may collect without last hit');
lootGame.db.world.armadas['salvage-party'].members.pop();
lootSpace.dropLoot(victim, killer.ent);
const expiringLoot = lootSpace.loot.at(-1)!.it;
assert.ok(expiringLoot.combatPickup);
lootSpace.t = expiringLoot.combatPickup.until - 0.001;
assert.equal(lootGame.onLoot(lootGame.pref(outsider), expiringLoot), false);
lootSpace.t = expiringLoot.combatPickup.until;
assert.notEqual(
  lootGame.onLoot(lootGame.pref(outsider), expiringLoot),
  false,
  'priority expires exactly at deadline',
);
outsider.data.sys = remotePort.system;
assert.equal(
  lootGame.onLoot(lootGame.pref(outsider), expiringLoot),
  false,
  'wrong-system pickup is denied even after expiry',
);
const wing = lootSpace.makeShip({ hull: 708, faction: 'player', x: 0, y: 0, ai: 'escort' });
wing.owner = killer.ent!.id;
lootSpace.dropLoot(victim, wing);
assert.equal(
  lootSpace.loot.at(-1)!.it.combatPickup?.captains[0],
  killer.data.name,
  'wing kills reserve salvage for the commanding captain',
);
lootSpace.dropLoot(victim);
assert.equal(
  lootSpace.loot.at(-1)!.it.combatPickup,
  undefined,
  'environmental kills stay unclaimed',
);
console.log('Nearby insurance and brief party salvage priority passed.');
