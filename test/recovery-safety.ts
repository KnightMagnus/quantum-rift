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
