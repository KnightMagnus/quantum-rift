// @ts-check
import { INDUSTRIAL as R, CORONA_BANDS, coronaAt, inSweep } from '../shared/industrial-rules.js';
import { RECIPES } from '../shared/refinery-rules.js';
import { planTake, applyTake, addLots, commonLots } from '../shared/cargo-lots.js';
/** @typedef {import('./industrial-contracts.js').IndustrialCapabilities} C */
/** @typedef {import('./industrial-contracts.js').IndustrialShip} State */
/** @typedef {import('./refinery-contracts.js').RefineryPlayer} Player */
/** @param {Player} d @returns {State} */
function state(d) {
  if (!d.ship.uid) d.ship.uid = `industrial-${d.name}-${(d.nextUid = (d.nextUid || 0) + 1)}`;
  const m = (d.ship.industrial ??= {
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
 * @param {C} c @param {import('./game.js').Session} s @param {(d:Player,w:import('./industrial-contracts.js').IndustrialWorld)=>void} fn */
function transaction(c, s, fn) {
  if (c.db.economicFrozen || c.paused())
    throw Error('Industrial economy requires recovery or unpause');
  const d = /** @type {Player} */ (s.data),
    old = { cargo: d.cargo, cargoLots: d.cargoLots, ship: d.ship },
    world = c.db.world.industrial;
  d.cargo = structuredClone(d.cargo);
  d.cargoLots = structuredClone(d.cargoLots);
  d.ship = structuredClone(d.ship);
  c.db.world.industrial = structuredClone(world);
  try {
    fn(
      /** @type {Player} */ (d),
      /** @type {import('./industrial-contracts.js').IndustrialWorld} */ (c.db.world.industrial),
    );
    c.db.touch();
    c.db.flush();
    c.refresh(s);
  } catch (error) {
    if (!c.db.economicFrozen) {
      Object.assign(d, old);
      c.db.world.industrial = world;
    }
    throw error;
  }
}
/** @param {import('./space.js').Space} sp @param {import('./space.js').Entity} e */
function drones(sp, e) {
  return [...sp.ships.values()].filter((x) => x.industrialRoot === e.id);
}
/** @param {import('./space.js').Space} sp @param {import('./space.js').Entity} e @param {boolean} on */
function support(sp, e, on) {
  const old = drones(sp, e);
  if (!on) {
    for (const x of old) sp.remove(x);
    return;
  }
  for (let i = old.length; i < 2; i++) {
    const x = sp.makeShip({
      hull: R.droneHull,
      owner: e.id,
      x: e.x + (i ? 55 : -55),
      y: e.y + 30,
      ai: 'industrial',
      name: `Industrial collector ${i + 1}`,
      faction: e.faction,
    });
    x.industrialRoot = e.id;
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
  /** @this {C} @param {import('./game.js').Session} s */
  stop(s) {
    const m = s.data?.ship?.industrial;
    if (m) m.sweep = m.harvest = m.smelter = false;
    this.db.touch();
  },
  /** @this {C} @param {import('./game.js').Session} s @param {import('./industrial-contracts.js').IndustrialRequest} q */
  command(s, q) {
    try {
      if (
        s.data?.ship?.hull !== R.hull ||
        !s.ent ||
        s.ent.dead ||
        s.ent.state !== 'fly' ||
        s.data.stellar ||
        this.paused() ||
        this.db.economicFrozen
      )
        throw Error('Industrial controls require an active Star Dredge flight');
      if (Object.keys(q).some((k) => !['t', 'op', 'recipe', 'grade'].includes(k)))
        throw Error('Unknown industrial authority field');
      const m = state(/** @type {Player} */ (s.data));
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
          const player = /** @type {Player} */ (s.data);
          if (old && (player.cargoLots?.byCommodity[old]?.[m.grade] || 0) > 0)
            throw Error('Finish earned work before switching input recipe/grade');
          // Unreserved input can be traded/jettisoned. Discard time, never transfer it.
          m.workMs = 0;
          this.toast(s, 'Previous input is gone: discarded partial smelter work; outputs retained');
        }
        m.recipe = /** @type {string} */ (q.recipe);
        m.grade = /** @type {'common'|'rich'|'pure'} */ (q.grade);
      } else if (q.op === 'sweep' || q.op === 'smelter' || q.op === 'harvest') {
        if (q.recipe !== undefined || q.grade !== undefined)
          throw Error('Mode request has no economic fields');
        if (
          q.op === 'harvest' &&
          !m.harvest &&
          (!coronaAt(s.data.sys, s.ent.x, s.ent.y) ||
            m.heat > 25 ||
            m.sweep ||
            m.smelter ||
            s.lastInput?.navigation ||
            s.ent.autoCombat)
        )
          throw Error(
            'Shallow bootstrap: enter marked band, heat ≤25, sweep/smelter/navigation OFF; leave outward within 10s after 15s harvest',
          );
        m[q.op] = !m[q.op];
      } else throw Error('Unknown industrial control');
      this.db.touch();
      this.refresh(s);
    } catch (error) {
      this.toast(s, String(error instanceof Error ? error.message : error));
    }
  },
  /** @this {C} @param {import('./space.js').Space} sp @param {number} dt */
  industrialTick(sp, dt) {
    if (this.paused() || this.db.economicFrozen) return;
    if (!Number.isFinite(dt) || dt <= 0 || dt > 1) throw Error('Invalid industrial timestep');
    const clock = this.db.world.mining?.clock || 0;
    for (const e of [...sp.ships.values()]) {
      if (!e.player || e.hull !== R.hull) continue;
      const s = e.player.s,
        d = /** @type {Player} */ (s.data);
      let m = state(d);
      if (e.dead || e.disabled || e.state !== 'fly' || d.stellar) {
        support(sp, e, false);
        continue;
      }
      const band = coronaAt(d.sys, e.x, e.y);
      if (s.lastInput?.navigation || e.autoCombat || e.towCap) {
        m.harvest = false;
      }
      if (m.heat >= R.cutoff) m.cutoff = true;
      if (m.cutoff && m.heat <= R.restart) m.cutoff = false;
      const forward = e.vx * Math.sin(e.a) - e.vy * Math.cos(e.a),
        room = this.room(d),
        recipe = RECIPES.find((r) => r.id === m.recipe),
        input = recipe?.inputs[0] || 'ore',
        have = d.cargoLots?.byCommodity[input]?.[m.grade] || 0,
        sweep = m.sweep && !m.cutoff && forward > R.minForward && room > 0,
        smelt = m.smelter && !m.cutoff && have > 0,
        harvest = m.harvest && !m.cutoff && !!band && room > 0;
      // Special power changes heat demand only, capped 20%; never output, rate or drone count.
      const efficiency = Math.max(0.8, 1 - (this.power(d) - 1) * 0.1);
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
        sp.kill(e);
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
      support(sp, e, sweep);
      if (sweep && work > 0) {
        // Root cap shared across ship and both drones, not one cap per collector.
        let damage = R.sweepDamage * work;
        for (const rock of sp.rocks) {
          if (damage <= 0) break;
          if (!rock.down && inSweep(e, rock, dt)) {
            const spent = this.sweep(sp, rock, damage, d.name);
            damage -= spent;
          }
        }
      }
      // Drones are physical noncombat collectors; deterministic sequential selection avoids duplicate acceptance.
      for (const [i, x] of drones(sp, e).entries()) {
        const target = sp.loot.find((l) => !l.taken && inSweep(e, l, dt));
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
            sp.events.push(['pickup', target.id]);
          }
        }
      }
      if (harvest && work > 0 && band) {
        const w = /** @type {import('./industrial-contracts.js').IndustrialWorld} */ (
          this.db.world.industrial
        );
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
      m = state(d);
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
  /** @this {C} @param {import('./game.js').Session} s */
  payload(s) {
    if (s.data?.ship?.hull !== R.hull) return null;
    const m = state(/** @type {Player} */ (s.data)),
      e = s.ent,
      band = e ? coronaAt(s.data.sys, e.x, e.y) : null;
    return {
      ship: s.data.ship.uid,
      ...structuredClone(m),
      band: band?.id || null,
      safeSeconds: Math.max(
        0,
        (R.cutoff - m.heat) /
          Math.max(0.1, m.inputs.corona + m.inputs.sweep + m.inputs.smelter - R.cooling),
      ),
      bands: CORONA_BANDS.filter((b) => b.sys === s.data.sys),
      stock:
        'Sweep/smelter OFF, heat 0: 15s productive + 10s outward exit margin; entry faces east.',
    };
  },
};
