import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { EventEmitter } from 'node:events';
import { Game } from '../../server/game.ts';
import type { Session } from '../../server/game.ts';
import { NakamaDatabase } from '../../server/nakama-storage.ts';
import { AuthorityCallbacks } from '../../server/authority-callbacks.ts';
import { HealthMonitor } from '../../shared/health.ts';
import type { StorageBackend } from '../../shared/nakama-contracts.ts';
import { SYS as systemsById } from '../../shared/galaxy.ts';
import { makeLoadout, weaponParams } from '../../shared/rules.ts';
import { mockWeaponMount } from './mocks.ts';
import { requiredFixtureValue } from './required.ts';

/** No sockets or payload retention: the harness exercises serialization but not network latency. */
class CountingConnection extends EventEmitter {
  open = true;
  backlog = 0;
  packets = 0;
  send(_message: string | object): void {
    this.packets++;
  }
  close(): void {
    this.open = false;
    this.emit('close');
  }
}
/** Fixed workloads; separate seeds prevent one scenario's RNG usage from affecting another. */
export const performanceScenarios = [
  'busy-combat',
  'mining-towing',
  'concentrated',
  'distributed',
  'reconnect',
  'soak',
] as const;
export type PerformanceScenario = (typeof performanceScenarios)[number];
/** Bounded in-process authoritative run, with deterministic RNG and wall-clock simulation time. */
export function runPerformanceScenario(name: PerformanceScenario, ticks: number, enabled = true) {
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 108000)
    throw new Error('ticks must be 1..108000');
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let seed = 820024 + performanceScenarios.indexOf(name);
  let simulatedNow = 1800000000000;
  let uuid = 0;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  Date.now = () => simulatedNow;
  try {
    const health = enabled ? new HealthMonitor(512, () => performance.now()) : undefined;
    const rows = new Map<string, { value: object; version: string }>();
    let writes = 0;
    const backend: StorageBackend = {
      read: (key) => rows.get(key) ?? null,
      write: (key, value, version) => {
        assert.equal(version, rows.get(key)?.version ?? '*');
        const next = String(++writes);
        rows.set(key, { value: structuredClone(value), version: next });
        return next;
      },
    };
    const database = new NakamaDatabase(backend, health);
    const callbacks = new AuthorityCallbacks(() => simulatedNow);
    const game = new Game(
      JSON.parse(
        filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8'),
      ),
      database,
      {
        health,
        automaticClock: false,
        seedDefinitions: [],
        randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
        defer: (callback, delay) => callbacks.schedule(callback, delay),
      },
    );
    function login(index: number): Session {
      const connection = new CountingConnection();
      game.connect(connection);
      const session = requiredFixtureValue([...game.sessions.values()].at(-1));
      const captain = 'Load Pilot ' + index;
      database.withAuthenticatedCaptain(captain, () =>
        game.onMessage(session, { t: 'hello', name: captain, pass: 'fixture-only' }),
      );
      assert.ok(session.data);
      session.data.tut = 999;
      session.data.sys = name === 'distributed' ? systemIds[index] : 'meridian';
      session.data.stellar = null;
      session.data.ship = makeLoadout(game.A, name === 'mining-towing' ? 815 : 704);
      game.spawnPlayer(session, 10000 + index * 100, 10000, 0, 0);
      return session;
    }
    const systemIds = Object.keys(systemsById).sort();
    const captainCount = name === 'concentrated' || name === 'distributed' ? 12 : 2;
    const captains = Array.from({ length: captainCount }, (_, index) => login(index));
    const space = game.spaces.meridian;
    let miningFrames = 0;
    let towingAttached = false;
    if (name === 'busy-combat') {
      space.spawnT = 1e9;
      for (let index = 0; index < 48; index++) {
        const entity = space.makeShip({
          hull: index % 2 ? 711 : 708,
          faction: index % 2 ? 'hollow' : 'quantum',
          x: (index % 8) * 70,
          y: Math.floor(index / 8) * 70,
          a: 0,
          ai: index % 2 ? 'raid' : 'patrol',
        });
        entity.graceT = 0;
      }
    }
    const miner = requiredFixtureValue(captains[0].ent);
    const rock = space.rocks.find((entry) => !entry.down);
    const miningWeapon = mockWeaponMount({
      w: 9102,
      n: 1,
      p: weaponParams(game.A.weapons[9102]),
      cd: 0,
      ammo: Infinity,
      snd: 'laser',
      sec: false,
      sndT: 0,
    });
    if (name === 'mining-towing') {
      assert.ok(rock);
      Object.assign(miner, {
        x: rock.x + rock.r + 100,
        y: rock.y,
        a: -Math.PI / 2,
        vx: 0,
        vy: 0,
        guns: [miningWeapon],
      });
      const tug = captains[1];
      game.features.towing.ensure('meridian');
      const object = requiredFixtureValue(
        database.world.towing?.slots.find((slot) => slot.sys === 'meridian')?.object,
      );
      const tugEntity = requiredFixtureValue(tug.ent);
      Object.assign(tugEntity, { x: object.x, y: object.y - 90, vx: 0, vy: 0, guns: [] });
      tug.data.miningSurvey = {
        version: 1,
        sys: 'meridian',
        x: tugEntity.x,
        y: tugEntity.y,
        revealUntil: requiredFixtureValue(database.world.mining).clock + 6,
        cooldownUntil: 0,
      };
      towingAttached = game.features.towing.command(tug, {
        t: 'towing',
        op: 'attach',
        id: object.id,
        revision: object.revision,
      });
      assert.equal(towingAttached, true);
    }
    // Warmup is reported separately: its samples are not mixed into the retained measurement monitor.
    for (let index = 0; index < 30; index++) {
      simulatedNow += 1000 / 30;
      callbacks.advance();
      game.tick();
    }
    const measured = enabled ? new HealthMonitor(512, () => performance.now()) : undefined;
    game.health = measured;
    database.health = measured;
    const started = performance.now();
    let reconnects = 0;
    for (let index = 0; index < ticks; index++) {
      simulatedNow += 1000 / 30;
      callbacks.advance();
      if (name === 'reconnect' && index % 90 === 0) {
        game.disconnect(captains[0]);
        captains[0] = login(0);
        reconnects++;
      }
      if (name === 'mining-towing' && rock && !rock.down) {
        space.fire(miner, miningWeapon, null, miner.a);
        miningFrames++;
      }
      game.tick();
      if (index % 450 === 0) {
        database.touch();
        database.flush();
      }
    }
    database.touch();
    database.flush();
    const elapsedMs = performance.now() - started;
    const report = measured?.report() ?? {};
    assert.equal(game.tickErr ?? 0, 0);
    assert.equal(report.tickFailures?.count ?? 0, 0);
    assert.equal(report.spaceFailures?.count ?? 0, 0);
    assert.equal(database.economicFrozen, false);
    return {
      scenario: name,
      seed: 820024 + performanceScenarios.indexOf(name),
      ticks,
      warmupTicks: 30,
      simulatedSeconds: ticks / 30,
      elapsedMs,
      captains: captainCount,
      reconnects,
      miningFrames,
      towingAttached,
      transport: 'in-process counting connection; no network latency',
      checkpoint: 'memory CAS + structuredClone; no PostgreSQL latency',
      metrics: report,
      outcome: {
        ticks: game.tickN,
        sessions: game.sessions.size,
        revisionWrites: writes,
        systems: Object.keys(game.live).length,
        entities: Object.values(game.live).reduce((sum, system) => sum + system.ships.size, 0),
        shots: Object.values(game.live).reduce((sum, system) => sum + system.shots.length, 0),
        physicalStates: Object.values(game.live).map((system) =>
          [...system.ships.values()].map((entity) => [
            entity.hull,
            entity.faction,
            entity.x,
            entity.y,
            entity.vx,
            entity.vy,
            entity.a,
            entity.shield,
            entity.armor,
            entity.fuel,
            ...entity.guns.map((weapon) => [weapon.w, weapon.ammo === Infinity ? -1 : weapon.ammo]),
          ]),
        ),
        credits: captains.map((session) => session.data.credits),
      },
    };
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}
