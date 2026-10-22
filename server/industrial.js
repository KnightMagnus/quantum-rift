// @ts-check
import { INDUSTRIAL as R, CORONA_BANDS, coronaAt, inSweep } from '../shared/industrial-rules.js';
import { RECIPES } from '../shared/refinery-rules.js';
import { planTake, applyTake, addLots, commonLots } from '../shared/cargo-lots.js';

/** @import { Session } from './game.js' */
/** @import { IndustrialRequest, IndustrialWorld } from './industrial-contracts.js' */
/** @import { Entity, Space } from './space.js' */
/** @typedef {import('./industrial-contracts.js').IndustrialCapabilities} C */
/** @typedef {import('./industrial-contracts.js').IndustrialShip} State */
/** @typedef {import('./refinery-contracts.js').RefineryPlayer} Player */
/** @param {Player} playerData @returns {State} */
function state(playerData) {
  if (!playerData.ship.uid)
    playerData.ship.uid = `industrial-${playerData.name}-${(playerData.nextUid = (playerData.nextUid || 0) + 1)}`;
  const m = (playerData.ship.industrial ??= {
    version: 1,
    heat: 0,
    cutoff: false,
    workMs: 0,
    harvestMs: 0,
    outputs: {},
    recipe: 'alloy',
    grade: 'common',
    sweep: false,
    harvest: false,
    smelter: false,
    reason: 'OFF',
    inputs: { sweep: 0, smelter: 0, corona: 0 },
  });
  validate(m);
  return m;
}
/** @param {State} m */
function validate(m) {
  if (
    m.version !== 1 ||
    !['common', 'rich', 'pure'].includes(m.grade) ||
    !['alloy', 'cells', 'cut'].includes(m.recipe) ||
    ![m.heat, m.workMs, m.harvestMs].every((n) => Number.isFinite(n) && n >= 0) ||
    m.heat > 300 ||
    m.workMs > 10000.001 ||
    m.harvestMs > 3000.001 ||
    ![m.cutoff, m.sweep, m.harvest, m.smelter].every((x) => typeof x === 'boolean') ||
    !m.inputs ||
    !Object.values(m.inputs).every((n) => Number.isFinite(n) && n >= 0 && n <= 100) ||
    typeof m.reason !== 'string' ||
    !m.outputs ||
    Object.entries(m.outputs).some(
      ([k, n]) =>
        !['alloy_ingots', 'fuel_cells', 'cut_crystal'].includes(k) ||
        !Number.isSafeInteger(n) ||
        n < 0 ||
        n >= 300,
    )
  )
    throw Error('Invalid industrial ship save');
}
/** Staged whole cargo + finite-source change, same checkpoint as existing player/world economy.
 * @param {C} capabilities @param {Session} session @param {(d:Player,w:IndustrialWorld)=>void} fn */
function transaction(capabilities, session, fn) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Industrial economy requires recovery or unpause');
  const playerData = /** @type {Player} */ (session.data),
    old = { cargo: playerData.cargo, cargoLots: playerData.cargoLots, ship: playerData.ship },
    world = capabilities.db.world.industrial;
  playerData.cargo = structuredClone(playerData.cargo);
  playerData.cargoLots = structuredClone(playerData.cargoLots);
  playerData.ship = structuredClone(playerData.ship);
  capabilities.db.world.industrial = structuredClone(world);
  try {
    fn(
      /** @type {Player} */ (playerData),
      /** @type {IndustrialWorld} */ (capabilities.db.world.industrial),
    );
    capabilities.db.touch();
    capabilities.db.flush();
    capabilities.refresh(session);
  } catch (error) {
    if (!capabilities.db.economicFrozen) {
      Object.assign(playerData, old);
      capabilities.db.world.industrial = world;
    }
    throw error;
  }
}
/** @param {Space} space @param {Entity} entity */
function drones(space, entity) {
  return [...space.ships.values()].filter((x) => x.industrialRoot === entity.id);
}
/** @param {Space} space @param {Entity} entity @param {boolean} on */
function support(space, entity, on) {
  const old = drones(space, entity);
  if (!on) {
    for (const x of old) space.remove(x);
    return;
  }
  for (let i = old.length; i < 2; i++) {
    const x = space.makeShip({
      hull: R.droneHull,
      owner: entity.id,
      x: entity.x + (i ? 55 : -55),
      y: entity.y + 30,
      ai: 'industrial',
      name: `Industrial collector ${i + 1}`,
      faction: entity.faction,
    });
    x.industrialRoot = entity.id;
    x.guns = [];
    x.strength = 0;
    old.push(x);
  }
}
export const IndustrialOperations = {
  /** @this {C} */
  init() {
    const w = this.db.world.industrial;
    if (w) {
      if (
        w.version !== 1 ||
        !w.sources ||
        Object.values(w.sources).some(
          (x) =>
            !Number.isFinite(x.units) ||
            x.units < 0 ||
            x.units > R.sourceUnits ||
            !Number.isFinite(x.last) ||
            x.last < 0,
        )
      )
        throw Error('Invalid industrial world save');
    } else this.db.world.industrial = { version: 1, sources: {} };
    // Existing owned hulls retain heat/remainders, never requested automation across restart.
    for (const d of Object.values(this.db.players)) {
      for (const ship of [d.ship, ...(d.dock || []).map((x) => x.ship)].filter(Boolean))
        if (ship.industrial) {
          validate(ship.industrial);
          ship.industrial.sweep = ship.industrial.harvest = ship.industrial.smelter = false;
        }
    }
    this.db.touch();
  },
  /** @this {C} @param {Session} session */
  stop(session) {
    const m = session.data?.ship?.industrial;
    if (m) m.sweep = m.harvest = m.smelter = false;
    this.db.touch();
  },
  /** @this {C} @param {Session} session @param {IndustrialRequest} q */
  command(session, q) {
    try {
      if (
        session.data?.ship?.hull !== R.hull ||
        !session.ent ||
        session.ent.dead ||
        session.ent.state !== 'fly' ||
        session.data.stellar ||
        this.paused() ||
        this.db.economicFrozen
      )
        throw Error('Industrial controls require an active Star Dredge flight');
      if (Object.keys(q).some((k) => !['t', 'op', 'recipe', 'grade'].includes(k)))
        throw Error('Unknown industrial authority field');
      const m = state(/** @type {Player} */ (session.data));
      if (q.op === 'off') {
        m.sweep = m.harvest = m.smelter = false;
      } else if (q.op === 'recipe') {
        if (
          !['alloy', 'cells', 'cut'].includes(q.recipe || '') ||
          !['common', 'rich', 'pure'].includes(q.grade || '')
        )
          throw Error('Choose a mobile recipe and exact input grade');
        if (m.workMs > 0 && (q.recipe !== m.recipe || q.grade !== m.grade)) {
          const old = RECIPES.find((r) => r.id === m.recipe)?.inputs[0];
          const player = /** @type {Player} */ (session.data);
          if (old && (player.cargoLots?.byCommodity[old]?.[m.grade] || 0) > 0)
            throw Error('Finish earned work before switching input recipe/grade');
          // Unreserved input can be traded/jettisoned. Discard time, never transfer it.
          m.workMs = 0;
          this.toast(
            session,
            'Previous input is gone: discarded partial smelter work; outputs retained',
          );
        }
        m.recipe = /** @type {string} */ (q.recipe);
        m.grade = /** @type {'common'|'rich'|'pure'} */ (q.grade);
      } else if (q.op === 'sweep' || q.op === 'smelter' || q.op === 'harvest') {
        if (q.recipe !== undefined || q.grade !== undefined)
          throw Error('Mode request has no economic fields');
        if (
          q.op === 'harvest' &&
          !m.harvest &&
          (!coronaAt(session.data.sys, session.ent.x, session.ent.y) ||
            m.heat > 25 ||
            m.sweep ||
            m.smelter ||
            session.lastInput?.navigation ||
            session.ent.autoCombat)
        )
          throw Error(
            'Shallow bootstrap: enter marked band, heat ≤25, sweep/smelter/navigation OFF; leave outward within 10s after 15s harvest',
          );
        m[q.op] = !m[q.op];
      } else throw Error('Unknown industrial control');
      this.db.touch();
      this.refresh(session);
    } catch (error) {
      this.toast(session, String(error instanceof Error ? error.message : error));
    }
  },
  /** @this {C} @param {Space} space @param {number} dt */
  industrialTick(space, dt) {
    if (this.paused() || this.db.economicFrozen) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw Error('Invalid industrial timestep');
    const clock = this.db.world.mining?.clock || 0;
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const e of [...space.ships.values()]) {
      if (!e.player || e.hull !== R.hull) continue;
      const s = e.player.s,
        playerData = /** @type {Player} */ (s.data);
      let m = state(playerData);
      if (e.dead || e.disabled || e.state !== 'fly' || playerData.stellar) {
        support(space, e, false);
        continue;
      }
      const band = coronaAt(playerData.sys, e.x, e.y);
      if (s.lastInput?.navigation || e.autoCombat || e.towCap) {
        m.harvest = false;
      }
      if (m.heat >= R.cutoff) m.cutoff = true;
      if (m.cutoff && m.heat <= R.restart) m.cutoff = false;
      const forward = e.vx * Math.sin(e.a) - e.vy * Math.cos(e.a),
        room = this.room(playerData),
        recipe = RECIPES.find((r) => r.id === m.recipe),
        input = recipe?.inputs[0] || 'ore',
        have = playerData.cargoLots?.byCommodity[input]?.[m.grade] || 0,
        sweep = m.sweep && !m.cutoff && forward > R.minForward && room > 0,
        smelt = m.smelter && !m.cutoff && have > 0,
        harvest = m.harvest && !m.cutoff && !!band && room > 0;
      // Special power changes heat demand only, capped 20%; never output, rate or drone count.
      const efficiency = Math.max(0.8, 1 - (this.power(playerData) - 1) * 0.1);
      m.inputs = {
        sweep: sweep ? R.sweepHeat * efficiency : 0,
        smelter: smelt ? R.smelterHeat * efficiency : 0,
        corona: band ? R.coronaHeat : 0,
      };
      const rate = m.inputs.sweep + m.inputs.smelter + m.inputs.corona - R.cooling,
        start = m.heat,
        work = rate > 0 ? Math.max(0, Math.min(dt, (R.cutoff - start) / rate)) : dt;
      m.heat = Math.max(0, Math.min(300, start + rate * dt));
      // Once cutoff is reached, active demand ceases for remainder of the timestep.
      if (start < R.cutoff && m.heat >= R.cutoff) {
        m.heat = R.cutoff + (band ? R.coronaHeat - R.cooling : -R.cooling) * (dt - work);
        m.cutoff = true;
        m.harvest = false;
      }
      const first = start < R.cutoff ? work : dt,
        mid = start + rate * first;
      /** @type {(h0:number,h1:number,t:number,threshold:number)=>number} */
      const exposure = (h0, h1, t, threshold) =>
        h0 === h1
          ? h0 >= threshold
            ? t
            : 0
          : h0 < threshold && h1 < threshold
            ? 0
            : h0 >= threshold && h1 >= threshold
              ? t
              : (t * Math.max(0, Math.max(h0, h1) - threshold)) / Math.abs(h1 - h0);
      /** @param {number} threshold */
      const above = (threshold) =>
        exposure(start, mid, first, threshold) + exposure(mid, m.heat, dt - first, threshold);
      e.shield = Math.max(0, e.shield - R.shieldDrain * above(R.shield));
      e.armor = Math.max(0, e.armor - R.hullDrain * above(R.critical));
      if (e.armor <= 0) {
        space.kill(e);
        continue;
      }
      m.reason = m.cutoff
        ? 'THERMAL CUTOFF — cool to 65'
        : sweep
          ? 'SWEEP ACTIVE'
          : harvest
            ? 'HARVEST ACTIVE'
            : smelt
              ? 'SMELTER ACTIVE'
              : m.sweep && forward <= R.minForward
                ? 'SWEEP: move forward above 20'
                : room <= 0
                  ? 'HOLD FULL'
                  : band
                    ? 'ALL OFF'
                    : 'OFF / COOLING';
      if (band && R.coronaHeat > R.cooling && !sweep && !smelt && !harvest)
        m.reason += ' · CORONA HEATING — EXIT BAND';
      support(space, e, sweep);
      if (sweep && work > 0) {
        // Root cap shared across ship and both drones, not one cap per collector.
        let damage = R.sweepDamage * work;
        for (const rock of space.rocks) {
          if (damage <= 0) break;
          if (!rock.down && inSweep(e, rock, dt)) {
            const spent = this.sweep(space, rock, damage, playerData.name);
            damage -= spent;
          }
        }
      }
      // Drones are physical noncombat collectors; deterministic sequential selection avoids duplicate acceptance.
      for (const [i, x] of drones(space, e).entries()) {
        const target = space.loot.find((l) => !l.taken && inSweep(e, l, dt));
        const tx = target?.x ?? e.x + (i ? 65 : -65),
          ty = target?.y ?? e.y + 40,
          dist = Math.hypot(tx - x.x, ty - x.y),
          travel = Math.min(dist, 180 * dt);
        if (dist) {
          x.vx = ((tx - x.x) / dist) * 180;
          x.vy = ((ty - x.y) / dist) * 180;
          x.x += ((tx - x.x) / dist) * travel;
          x.y += ((ty - x.y) / dist) * travel;
        }
        if (target && dist < 35) {
          if (this.loot(e.player, target.it) !== false) {
            target.taken = true;
            space.events.push(['pickup', target.id]);
          }
        }
      }
      if (harvest && work > 0 && band) {
        const w = /** @type {IndustrialWorld} */ (this.db.world.industrial);
        const source = (w.sources[band.id] ??= { units: R.sourceUnits, last: clock });
        source.units = Math.min(
          R.sourceUnits,
          source.units + Math.max(0, clock - source.last) * R.renewPerSecond,
        );
        source.last = clock;
        if (source.units >= R.units) {
          m.harvestMs = Math.min(R.plasmaMs, m.harvestMs + work * 1000);
        } else m.reason = 'PLASMA SOURCE RECOVERING';
        if (m.harvestMs >= R.plasmaMs - 1e-6) {
          transaction(this, s, (p, w) => {
            const ms = state(p),
              src = w.sources[band.id];
            if (this.room(p) < 1 || src.units < R.units) return;
            addLots(p.cargo, p.cargoLots, commonLots('plasma', 1));
            src.units -= R.units;
            ms.harvestMs = 0;
          });
        }
      }
      m = state(playerData);
      if (smelt && work > 0 && recipe) {
        m.workMs = Math.min(R.workMs, m.workMs + work * 1000);
        if (m.workMs >= R.workMs - 1e-6)
          transaction(this, s, (p) => {
            const ms = state(p),
              take = planTake(p.cargo, p.cargoLots, input, 1, {
                common: ms.grade === 'common' ? 1 : 0,
                rich: ms.grade === 'rich' ? 1 : 0,
                pure: ms.grade === 'pure' ? 1 : 0,
              });
            applyTake(p.cargo, p.cargoLots, take);
            const units = (ms.outputs[recipe.output] || 0) + R.outputPerInput,
              n = Math.floor(units / R.units);
            if (n > this.room(p)) throw Error('Mobile output capacity exhausted');
            if (n) addLots(p.cargo, p.cargoLots, commonLots(recipe.output, n));
            ms.outputs[recipe.output] = units % R.units;
            ms.workMs = 0;
          });
      }
      this.db.touch();
    }
  },
  /** @this {C} @param {Session} session */
  payload(session) {
    if (session.data?.ship?.hull !== R.hull) return null;
    const m = state(/** @type {Player} */ (session.data)),
      entity = session.ent,
      band = entity ? coronaAt(session.data.sys, entity.x, entity.y) : null;
    return {
      ship: session.data.ship.uid,
      ...structuredClone(m),
      band: band?.id || null,
      safeSeconds: Math.max(
        0,
        (R.cutoff - m.heat) /
          Math.max(0.1, m.inputs.corona + m.inputs.sweep + m.inputs.smelter - R.cooling),
      ),
      bands: CORONA_BANDS.filter((b) => b.sys === session.data.sys),
      stock:
        'Sweep/smelter OFF, heat 0: 15s productive + 10s outward exit margin; entry faces east.',
    };
  },
};
