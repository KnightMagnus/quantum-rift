import sceneAdditions from '../../shared/diversity-worlds.json' with { type: 'json' };
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import filesystem from 'node:fs';
import { EventEmitter } from 'node:events';
import { Game } from '../../server/game.ts';
import { NakamaDatabase } from '../../server/nakama-storage.ts';
import { AuthorityCallbacks } from '../../server/authority-callbacks.ts';
import type { StorageBackend } from '../../shared/nakama-contracts.ts';
import { SYS, STELLARS, RESEARCH } from '../../shared/galaxy.ts';
import { STORY } from '../../shared/story.ts';
import { TICK } from '../../shared/rules.ts';
import type { Entity } from '../../server/space.ts';

/** One fixed-seed, stock-loadout fleet exercising real arrival, traffic, AI and damage. */
export interface CombatPlayabilityScenario {
  /** Destination system ID. */
  system: string;
  /** Lead hull followed by up to two wing hulls. */
  fleet: number[];
  /** Independent unsigned random seed. */
  seed: number;
  /** Real simulated seconds after arrival (not accelerated physics). */
  seconds: number;
  /** Full station research and Epic level-10, rank-3 combat crew. */
  upgraded: boolean;
  /** Isolated authored Act I climax; ordinary traffic is excluded, story allies and wings retained. */
  storyEncounter?: {
    /** Override only for disclosed balance experiments; absent preserves production spawn. */
    bonusPct?: number;
    /** Add a disclosed modest defensive/mobility outfit package to the lead only. */
    fitted?: boolean;
    /** Common level-3 bridge crew plus first shield/hull research; no rank or late upgrades. */
    prepared?: boolean;
    /** Scripted manual stand-off distance; absent uses ordinary Assist. */
    standOff?: number;
  };
  /** Optional isolated two-ship experiment; normal arrivals remain the default. */
  experiment?: {
    /** Stock opponent hull ID. */
    opponent: number;
    /** Initial center distance in world units. */
    distance: number;
    /** Initial bearing in radians. */
    angle: number;
    /** Initial lateral target speed; production AI owns subsequent motion. */
    lateralSpeed: number;
    /** Real Assist or a disclosed scripted manual pursuit policy. */
    control: 'assist' | 'manual';
  };
}
/** Observable outcomes; survival alone is not proof of clearing a system. */
export interface CombatPlayabilityResult extends CombatPlayabilityScenario {
  /** Whether the captain remained alive through the duration cap or post-boss window. */
  survived: boolean;
  /** Seconds alive, capped at the requested duration. */
  aliveSeconds: number;
  /** Combat kills credited by production code. */
  kills: number;
  /** Unique hostiles disabled by positive player-root damage and confirmed by production AI. */
  disables: number;
  /** Maximum concurrently hostile ship count. */
  peakHostiles: number;
  /** Hostiles present immediately after a normal jump arrival. */
  arrivalHostiles: number;
  /** Final shield and armor fraction of the original lead hull. */
  remainingHullFraction: number;
  /** Combat damage suffered; proves the hold was contested. */
  damageTaken: number;
  /** Initial production fleet rating, including wing weighting. */
  power: number;
  /** Primary discharges by the lead (not wings or secondary weapons). */
  primaryShots: number;
  /** Direct beam discharges that caused positive damage; projectile contacts are separate. */
  beamHits: number;
  /** Direct beam discharges; beamHits/beamShots is the exact observed beam hit rate. */
  beamShots: number;
  /** Positive damage contacts by the lead, including projectile impacts and splash. */
  damageContacts: number;
  /** First kill/disable time, or null when no target was defeated. */
  firstDefeatSeconds: number | null;
  /** Maximum observed health recovery after a damaged tick. */
  recoveredHealth: number;
  /** Shared-host Game.tick p95; excludes fixture construction and is not native-host qualification. */
  tickP95Ms: number;
  /** Maximum measured Game.tick duration. */
  tickMaxMs: number;
  /** Authored encounter observations; damage is real applied damage, including shield hits. */
  storyOutcome?: {
    /** Whether the actual story boss was destroyed before the captain died or time expired. */
    bossDefeated: boolean;
    /** Simulated seconds after boss defeat, bounded at ten and the scenario duration cap. */
    postBossSeconds: number;
    /** Captain remains alive after the full ten-second post-boss window. */
    postBossSurvived: boolean;
    /** Boss health fraction remaining, capped at zero. */
    bossHealthFraction: number;
    /** Boss initial shield plus armor. */
    bossInitialHealth: number;
    /** Applied damage to the boss, separated by source; regeneration can make sums exceed initial health. */
    bossDamage: { lead: number; choir: number; wing: number; other: number };
    /** Applied damage suffered by the lead, attributed to boss versus other ships. */
    leadDamage: { boss: number; other: number };
    /** Tick-sampled lead-to-boss center distance while both are alive. */
    distance: { mean: number; min: number; max: number };
    /** Lead effective primary weapon ranges at spawn, after production unit scaling. */
    primaryRanges: number[];
  };
  /** Bounded initial loadouts/positions and important events for offline reproduction. */
  capture: {
    /** Capture format revision. */
    schema: number;
    /** Exact fixture parameters, including seed and scripted controls. */
    scenario: CombatPlayabilityScenario;
    /** Initial production entity state with actual fitted weapons. */
    actors: {
      hull: number;
      x: number;
      y: number;
      a: number;
      vx: number;
      vy: number;
      /** Initial shield and armor after production spawning. */
      shield: number;
      armor: number;
      /** Fitted weapon IDs and mount multiplicities, not just catalog hull defaults. */
      weapons: { weapon: number; count: number; secondary: boolean }[];
    }[];
    /** Bounded fire/damage/defeat events; omitted events are counted. */
    events: { tick: number; kind: string; actor: number; target: number; value: number }[];
    /** Events beyond the retained 256-entry cap. */
    droppedEvents: number;
  };
}
class DiscardConnection extends EventEmitter {
  open = true;
  backlog = 0;
  send(_message: string | object): void {}
  close(): void {
    this.open = false;
    this.emit('close');
  }
}
/** No timers, sockets, disk saves or disabled enemies; virtual time advances at production tick rate. */
export function simulateCombatPlayability(
  options: CombatPlayabilityScenario,
): CombatPlayabilityResult {
  assert.ok(SYS[options.system]);
  assert.ok(options.seconds > 0 && options.seconds <= 600);
  assert.ok(options.fleet.length > 0 && options.fleet.length <= 3);
  const originalRandom = Math.random;
  const originalNow = Date.now;
  let randomState = options.seed >>> 0;
  let now = 1800000000000;
  let uuid = 0;
  Math.random = () => {
    randomState = (Math.imul(1664525, randomState) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  Date.now = () => now;
  try {
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
    const database = new NakamaDatabase(backend);
    const callbacks = new AuthorityCallbacks(() => now);
    // Keep fixed combat seeds independent of unrelated market warmup additions.
    // Live market eligibility is covered by features.ts and system-diversity.ts.
    const addedMarkets = new Set(
      sceneAdditions.filter((entry) => entry.body.svc.includes('T')).map((entry) => entry.body.id),
    );
    const originalBodies = new Map(Object.values(SYS).map((system) => [system, system.stellars]));
    for (const system of Object.values(SYS))
      system.stellars = system.stellars.filter((body) => !addedMarkets.has(body.id));
    const game = (() => {
      try {
        return new Game(
          JSON.parse(
            filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8'),
          ),
          database,
          {
            automaticClock: false,
            seedDefinitions: [],
            randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
            defer: (callback, delay) => callbacks.schedule(callback, delay),
          },
        );
      } finally {
        for (const [system, bodies] of originalBodies) system.stellars = bodies;
      }
    })();
    game.connect(new DiscardConnection());
    const session = [...game.sessions.values()].at(-1)!;
    database.withAuthenticatedCaptain('Balance Pilot', () =>
      game.onMessage(session, { t: 'hello', name: 'Balance Pilot', pass: 'fixture-only' }),
    );
    assert.ok(session.data, 'real login creates captain');
    const data = session.data;
    data.tut = 999;
    data.noShield = true;
    data.credits = 1e9;
    data.station.ops = 5;
    assert.equal(game.newcomer(data), false, 'fixture has no newcomer protection');
    data.station.done = options.upgraded ? RESEARCH.map((research) => research.id) : [];
    const officer = (role: string) => ({
      name: 'Balance ' + role,
      role,
      rarity: options.upgraded ? 3 : 0,
      lv: options.upgraded ? 10 : 3,
    });
    // Exercise a real shipyard purchase before the disclosed fixture supplies wings/bonuses.
    const purchaseHull = 708;
    const yard = Object.values(STELLARS).find((port) =>
      game.yard(port, data)?.includes(purchaseHull),
    );
    assert.ok(yard, 'fixture lead is available at an ordinary shipyard');
    data.stellar = yard.id;
    const beforePurchase = data.credits;
    game.onMessage(session, { t: 'buyship', hull: purchaseHull });
    assert.equal(Number(data.ship.hull), purchaseHull, 'production purchase selects lead hull');
    assert.notEqual(data.credits, beforePurchase, 'production purchase settles credits');
    game.seedFleet(data, {
      docks: [{ lead: options.fleet[0], wings: options.fleet.slice(1) }],
      crew: options.upgraded
        ? [officer('gunner'), officer('engineer'), officer('gunner'), officer('engineer')]
        : [],
      spare:
        options.upgraded || options.storyEncounter?.prepared
          ? [officer('gunner'), officer('engineer'), officer('captain')]
          : [],
    });
    if (options.upgraded || options.storyEncounter?.prepared) {
      for (const member of data.officers) member.rank = options.upgraded ? 3 : 0;
      for (const [index, member] of data.officers.slice(-3).entries())
        data.bridge[['captain', 'bridge1', 'bridge2'][index]] = member.id;
    }
    if (options.storyEncounter?.prepared) {
      data.station.done = ['shield1', 'hull1'];
      for (const slot of ['captain', 'bridge1', 'bridge2']) {
        const member = data.officers.find((candidate) => candidate.id === data.bridge[slot]);
        assert.ok(member, 'declared preparation includes all three bridge officers');
        assert.equal(member.rarity, 0, 'prepared bridge officer is Common');
        assert.equal(member.lv, 3, 'prepared bridge officer is level 3');
        assert.equal(member.rank, 0, 'prepared bridge officer has no rank upgrades');
      }
    }
    if (options.storyEncounter) {
      assert.equal(options.system, 'umbra');
      data.story.step = STORY.findIndex((mission) => mission.id === 'qv4');
      data.story.active = { id: 'qv4', got: 0, ready: false, spawned: false };
      if (options.storyEncounter.fitted) {
        Object.assign(data.ship.outfits, { 563: 4, 567: 4, 572: 1, 576: 1 });
        assert.ok(
          game.features.shipStats.stats(data)!.free >= 0,
          'declared fit uses available outfit space',
        );
      }
    }
    const origin = SYS[options.system].links[0];
    assert.ok(origin, 'destination has a normal neighbouring arrival route');
    data.sys = origin;
    data.stellar = null;
    data.fuel = 100;
    game.spawnPlayer(session, 7000, 7000, 0, 0);
    const departing = session.ent!;
    departing.jumpTo = options.system;
    departing.jumpCost = 0;
    // finishJump is the production jump completion route: wakes destination before spawnPlayer.
    game.finishJump(departing, game.spaces[origin]);
    const space = game.spaces[options.system];
    session.inputScheduling = 'match';
    const lead = session.ent!;
    assert.equal(lead.player?.s, session);
    let boss: Entity | undefined;
    if (options.storyEncounter) {
      boss = [...space.ships.values()].find(
        (actor) => actor.story === session.id && actor.storyKill,
      );
      assert.ok(boss, 'production story arrival spawns Night Anchor');
      for (const actor of space.ships.values()) {
        const root = space.root(actor);
        if (actor !== lead && !actor.storyAlly && root !== lead && root.story !== session.id)
          space.remove(actor);
      }
      space.spawnT = Infinity;
      space.raidBudget = () => 0;
      const actors = [...space.ships.values()];
      const identities = new Map(actors.map((actor, index) => [actor.id, 1000000000 + index]));
      space.ships.clear();
      for (const actor of actors) {
        actor.id = identities.get(actor.id)!;
        if (actor.owner) actor.owner = identities.get(actor.owner) ?? actor.owner;
        actor.aggro.clear();
        space.ships.set(actor.id, actor);
      }
      if (options.storyEncounter.bonusPct !== undefined) {
        // Preserve every production boss weapon, movement and targeting rule.
        const multiplier = 1 + options.storyEncounter.bonusPct / 100;
        boss.st.shield = game.A.ships[boss.hull].shield * multiplier;
        boss.st.armor = game.A.ships[boss.hull].armor * multiplier;
        boss.shield = boss.st.shield;
        boss.armor = boss.st.armor;
      }
    }
    if (options.experiment) {
      assert.ok(options.experiment.distance > 0 && options.experiment.distance <= 3000);
      assert.ok(Number.isFinite(options.experiment.angle));
      assert.ok(Math.abs(options.experiment.lateralSpeed) <= 300);
      for (const actor of space.ships.values()) if (actor !== lead) space.remove(actor);
      // Controlled experiments isolate a two-ship encounter; normal haven runs do not.
      space.spawnT = Infinity;
      space.raidBudget = () => 0;
      lead.x = lead.y = lead.vx = lead.vy = 0;
      lead.a = options.experiment.angle;
      const opponent = space.makeShip({
        hull: options.experiment.opponent,
        faction: 'umbral',
        ai: 'raid',
        x: Math.sin(options.experiment.angle) * options.experiment.distance,
        y: -Math.cos(options.experiment.angle) * options.experiment.distance,
        vx: Math.cos(options.experiment.angle) * options.experiment.lateralSpeed,
        vy: Math.sin(options.experiment.angle) * options.experiment.lateralSpeed,
        a: options.experiment.angle + Math.PI,
      });
      // Capital broadside direction uses entity-ID parity. Give isolated actors
      // stable fixture IDs so preceding scenarios cannot change their maneuvers.
      space.ships.clear();
      lead.id = 1000000000;
      opponent.id = 1000000001;
      lead.aggro.clear();
      opponent.aggro.clear();
      space.ships.set(lead.id, lead);
      space.ships.set(opponent.id, opponent);
    }
    const power = game.features.hostile.myPower(data);
    let ticks = 0;
    let primaryShots = 0,
      beamShots = 0,
      beamHits = 0,
      damageContacts = 0;
    let firstDefeatSeconds: number | null = null;
    let recoveredHealth = 0;
    const tickTimes: number[] = [];
    const capture: CombatPlayabilityResult['capture'] = {
      schema: 1,
      scenario: structuredClone(options),
      actors: [...space.ships.values()].slice(0, 64).map((actor) => ({
        hull: Number(actor.hull),
        x: actor.x,
        y: actor.y,
        a: actor.a,
        vx: actor.vx,
        vy: actor.vy,
        shield: actor.shield,
        armor: actor.armor,
        weapons: actor.guns.map((mount) => ({
          weapon: mount.w,
          count: mount.n,
          secondary: mount.sec,
        })),
      })),
      events: [],
      droppedEvents: 0,
    };
    const actorIdentifiers = new Map(
      [...space.ships.values()].map((actor, index) => [actor.id, index + 1]),
    );
    const event = (kind: string, actor: number, target: number, value: number) => {
      if (capture.events.length < 256)
        capture.events.push({
          tick: ticks,
          kind,
          actor: actorIdentifiers.get(actor) ?? 0,
          target: actorIdentifiers.get(target) ?? 0,
          value,
        });
      else capture.droppedEvents++;
    };
    const fire = space.fire.bind(space);
    space.fire = (...parameters) => {
      const [actor, mount, target] = parameters;
      const before = damageContacts;
      if (actor === lead && !mount.sec && !mount.p.pd) primaryShots++;
      if (actor === lead && mount.p.beam) beamShots++;
      fire(...parameters);
      if (actor === lead && mount.p.beam && damageContacts > before) beamHits++;
      event('fire', actor.id, target?.id ?? 0, mount.w);
    };
    const hostiles = () =>
      [...space.ships.values()].filter((ship) => !ship.dead && space.isHostile(lead, ship));
    const disableCandidates = new Set<Entity>();
    const confirmedDisables = new Set<Entity>();
    const bossInitialHealth = boss ? boss.shield + boss.armor : 0;
    const bossDamage = { lead: 0, choir: 0, wing: 0, other: 0 };
    const leadDamage = { boss: 0, other: 0 };
    let distanceTotal = 0,
      distanceCount = 0,
      distanceMin = Infinity,
      distanceMax = 0;
    const primaryRanges = lead.guns
      .filter((mount) => !mount.sec && !mount.p.pd && !mount.p.bay)
      .map((mount) => mount.p.range);
    const applyDamage = space.damage.bind(space);
    // Observe real damage without changing its inputs, return value or production disable rule.
    space.damage = (...arguments_) => {
      const [target, , , attacker] = arguments_;
      const wasCombatReady =
        !target.dead &&
        !target.disabled &&
        !target.player &&
        !target.noDisable &&
        target.armor >= target.st.armor * 0.15;
      const playerAttack = !!attacker && space.root(attacker) === lead;
      const wasHostile = playerAttack && space.isHostile(lead, target);
      const result = applyDamage(...arguments_);
      if (result && result[0] > 0) {
        if (target === boss) {
          const source =
            attacker === lead
              ? 'lead'
              : attacker?.storyAlly
                ? 'choir'
                : attacker && space.root(attacker) === lead
                  ? 'wing'
                  : 'other';
          bossDamage[source] += result[0];
        }
        if (target === lead) leadDamage[attacker === boss ? 'boss' : 'other'] += result[0];
        if (attacker === lead) damageContacts++;
        event('damage', attacker?.id ?? 0, target.id, result[0]);
      }
      if (
        wasCombatReady &&
        wasHostile &&
        result &&
        result[0] > 0 &&
        target.armor > 0 &&
        target.armor < target.st.armor * 0.15
      )
        disableCandidates.add(target);
      return result;
    };
    const arrivalHostiles = hostiles().length;
    let peakHostiles = arrivalHostiles;
    let damageTaken = 0;
    let previousHealth = lead.shield + lead.armor;
    const originalHealth = previousHealth;
    let bossDefeatedTick: number | null = null;
    // Explicit nearest-hostile acquisition is the keyboard R equivalent. Assist flies and fires.
    for (; ticks < options.seconds * TICK; ticks++) {
      if (boss?.dead && bossDefeatedTick === null) bossDefeatedTick = ticks;
      if (lead.dead || session.ent !== lead) break;
      if (bossDefeatedTick !== null && ticks - bossDefeatedTick >= 10 * TICK) break;
      if (boss && !boss.dead) {
        const distance = Math.hypot(boss.x - lead.x, boss.y - lead.y);
        distanceTotal += distance;
        distanceCount++;
        distanceMin = Math.min(distanceMin, distance);
        distanceMax = Math.max(distanceMax, distance);
      }
      if (ticks % 3 === 0) {
        session.actT = now;
        const enemies = hostiles();
        peakHostiles = Math.max(peakHostiles, enemies.length);
        if (boss && !boss.dead && options.storyEncounter?.standOff) {
          const desired = options.storyEncounter.standOff;
          const distance = Math.hypot(boss.x - lead.x, boss.y - lead.y);
          const bearing = Math.atan2(boss.x - lead.x, -(boss.y - lead.y));
          const heading = bearing + (distance < desired * 0.9 ? Math.PI : 0);
          const difference = Math.atan2(Math.sin(heading - lead.a), Math.cos(heading - lead.a));
          game.onMessage(session, { t: 'target', id: boss.id });
          game.onMessage(session, {
            t: 'input',
            seq: ticks + 1,
            th: Math.abs(difference) < 0.4 && Math.abs(distance - desired) > desired * 0.1 ? 1 : 0,
            tu: Math.abs(difference) < 0.08 ? 0 : Math.sign(difference),
            f1: 1,
            f2: 1,
          });
        } else if (
          !lead.target ||
          lead.target.dead ||
          !space.ships.has(lead.target.id) ||
          !session.combat?.target
        ) {
          const nearest = enemies.sort(
            (a, b) =>
              Math.hypot(a.x - lead.x, a.y - lead.y) - Math.hypot(b.x - lead.x, b.y - lead.y),
          )[0];
          const approachX = nearest?.x ?? 0;
          const approachY = nearest?.y ?? 0;
          if (
            nearest &&
            options.experiment?.control !== 'manual' &&
            game.combatAssist.valid(space, lead, nearest)
          ) {
            event(
              'acquire',
              lead.id,
              nearest.id,
              Math.hypot(nearest.x - lead.x, nearest.y - lead.y),
            );
            game.onMessage(session, { t: 'target', id: nearest.id });
            game.onMessage(session, { t: 'combat', op: 'assist', on: true });
          } else {
            // Outside Assist acquisition range, fly toward the nearest hostile (or system center).
            const angle = Math.atan2(approachX - lead.x, -(approachY - lead.y));
            const difference = Math.atan2(Math.sin(angle - lead.a), Math.cos(angle - lead.a));
            game.onMessage(session, {
              t: 'input',
              seq: ticks + 1,
              th: Math.abs(difference) < 0.5 ? 1 : 0,
              tu: Math.abs(difference) < 0.12 ? 0 : Math.sign(difference),
              f1: options.experiment?.control === 'manual' ? 1 : 0,
            });
          }
        }
      }
      now += 1000 / TICK;
      callbacks.advance(now);
      const tickStarted = performance.now();
      game.tick();
      tickTimes.push(performance.now() - tickStarted);
      assert.equal(space.errs || 0, 0, 'no swallowed production Space tick errors');
      for (const target of disableCandidates)
        if (!target.dead && target.disabled) confirmedDisables.add(target);
      if (firstDefeatSeconds === null && (data.stats.kills > 0 || confirmedDisables.size > 0)) {
        firstDefeatSeconds = ticks / TICK;
        event('defeat', lead.id, 0, firstDefeatSeconds);
      }
      const health = lead.shield + lead.armor;
      if (previousHealth < originalHealth) recoveredHealth += Math.max(0, health - previousHealth);
      damageTaken += Math.max(0, previousHealth - health);
      previousHealth = health;
    }
    // Checkpoint and reconstruct the actual persisted captain after combat, not live entities.
    database.dirty = true;
    database.flush();
    const reopened = new NakamaDatabase(backend);
    assert.deepEqual(
      JSON.parse(JSON.stringify(reopened.players)),
      JSON.parse(JSON.stringify(database.players)),
      'combat captain survives checkpoint/restart',
    );
    tickTimes.sort((left, right) => left - right);
    return {
      ...options,
      ...(boss
        ? {
            storyOutcome: {
              bossDefeated: !!boss.dead,
              postBossSeconds: bossDefeatedTick === null ? 0 : (ticks - bossDefeatedTick) / TICK,
              postBossSurvived:
                bossDefeatedTick !== null &&
                ticks - bossDefeatedTick >= 10 * TICK &&
                !lead.dead &&
                session.ent === lead,
              bossHealthFraction: Math.max(0, (boss.shield + boss.armor) / bossInitialHealth),
              bossInitialHealth,
              bossDamage,
              leadDamage,
              distance: { mean: distanceTotal / distanceCount, min: distanceMin, max: distanceMax },
              primaryRanges,
            },
          }
        : {}),
      primaryShots,
      beamShots,
      beamHits,
      damageContacts,
      firstDefeatSeconds,
      recoveredHealth,
      tickP95Ms: tickTimes[Math.min(tickTimes.length - 1, Math.floor(tickTimes.length * 0.95))],
      tickMaxMs: tickTimes.at(-1)!,
      capture,
      survived: !lead.dead && session.ent === lead,
      aliveSeconds: Math.round((ticks / TICK) * 100) / 100,
      kills: data.stats.kills,
      disables: confirmedDisables.size,
      peakHostiles,
      arrivalHostiles,
      damageTaken: Math.round(damageTaken),
      remainingHullFraction: Math.max(0, (lead.shield + lead.armor) / originalHealth),
      power,
    };
  } finally {
    Math.random = originalRandom;
    Date.now = originalNow;
  }
}
