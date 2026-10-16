// Quantum Rift 0.8 "Specialists" server feature operations: specialty-ship abilities, unique resources, blueprints,
// building, parts, components and timed tier-ups.
import { SYS, STELLARS, FACTIONS, GRADES } from '../shared/galaxy.js';
import {
  SPEC,
  SPEC_RES,
  BP_NEED,
  BUILD,
  PART_RATE,
  COMPONENTS,
  TIER_MAX,
  COMP_COST,
  TIER_UP_MIN,
  specPower,
} from '../shared/specialty.js';
import { makeLoadout, credits } from '../shared/rules.js';

/** @type {Record<string, number>} Map of specialist keys to hull IDs. */
const KEY = Object.fromEntries(Object.values(SPEC).map((s) => [s.key, s.id]));

export const SpecialistOperations = {
  /**
   * Initialize specialist ship state and inventory on player data.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {void}
   */
  specInit(d) {
    d.spec = d.spec || {};
    d.bp = d.bp || {};
    d.parts = d.parts || {};
    d.specState = d.specState || {};
  },
  // the specialist the captain is flying, with its power (components + tier)
  /**
   * Get the specialist configuration and power rating of the player's active ship.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {(Record<string, any> & {power: number}) | null} Active specialist object or null.
   */
  specOf(d) {
    const S_ = SPEC[d.ship.hull];
    if (!S_) return null;
    this.specInit(d);
    return { ...S_, power: specPower(d.specState[S_.id]) };
  },
  /**
   * Check whether the player is currently piloting a specialist ship of the specified key.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} key - Specialist key.
   * @returns {boolean} True if flying the specified specialist.
   */
  flying(d, key) {
    return d && d.ship && d.ship.hull === KEY[key];
  },
  /**
   * Get the current specialist power multiplier.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {number} Power multiplier.
   */
  power(d) {
    const s = this.specOf(d);
    return s ? s.power : 1;
  },
  /**
   * Compute aggregated stat bonuses from base frontier stats plus active specialist components and traits.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, number>} Combined ship stat bonuses.
   */
  bonus(d) {
    const b = this.frontierBonus(d),
      sp = this.specOf(d);
    if (!sp) return b;
    const st = d.specState[sp.id] || { comp: {} };
    for (const [c, lv] of Object.entries(st.comp || {}))
      for (const [k, v] of Object.entries(COMPONENTS[c].bonus))
        if (k !== 'ability') b[k] = (b[k] || 0) + v * lv;
    if (sp.key === 'lodestar') b.miningPct = (b.miningPct || 0) + 200 * sp.power;
    if (sp.key === 'bulwark' && d.station.site && STELLARS[d.station.site].system === d.sys) {
      b.shieldPct = (b.shieldPct || 0) + 50 * sp.power;
      b.damagePct = (b.damagePct || 0) + 50 * sp.power;
    }
    return b;
  },
  // earn a specialty resource (only while flying that specialist) and/or blueprints (flying anything)
  /**
   * Award specialty resource and/or blueprint drops for activities.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} key - Specialist key.
   * @param {number} resN - Resource amount.
   * @param {number} bpChance - Blueprint chance.
   * @param {number} [bpN=1] - Number of blueprints.
   * @returns {void}
   */
  specGain(s, key, resN, bpChance, bpN = 1) {
    const d = s.data;
    this.specInit(d);
    const id = KEY[key],
      S_ = SPEC[id];
    let msg = [];
    if (resN && this.flying(d, key)) {
      const n = Math.max(1, Math.round(resN * this.power(d)));
      d.spec[S_.res] = (d.spec[S_.res] || 0) + n;
      msg.push(`+${n} ${SPEC_RES[S_.res].name}`);
    }
    if (bpChance && Math.random() < bpChance) {
      d.bp[id] = (d.bp[id] || 0) + bpN;
      msg.push(
        `+${bpN} ${S_.name} blueprint${bpN > 1 ? 's' : ''} (${Math.min(d.bp[id], BP_NEED)}/${BP_NEED})`,
      );
      if (d.bp[id] >= BP_NEED && d.bp[id] - bpN < BP_NEED)
        this.log(d, `Enough blueprints to build the ${S_.name}.`);
    }
    if (msg.length) this.toast(s, msg.join(' · '));
  },
  // damage multiplier from the attacker's specialty against this target (called by Space.damage)
  /**
   * Compute specialist weapon damage multiplier against a target.
   * @this {any}
   * @param {any} srcRoot - Attacking root entity.
   * @param {any} src - Direct projectile or damage source entity.
   * @param {any} t - Target entity taking damage.
   * @returns {number} Damage multiplier factor.
   */
  specMult(srcRoot, src, t) {
    if (!srcRoot || !srcRoot.player) return 1;
    const d = srcRoot.player.s && srcRoot.player.s.data;
    if (!d) return 1;
    const sp = this.specOf(d);
    if (!sp) return 1;
    const F = FACTIONS[t.faction] || {},
      own = src === srcRoot;
    if (sp.key === 'herald' && !own) return 1 + 0.25 * sp.power; // escorts fight harder
    if (!own) return 1;
    if (sp.key === 'swarmbreaker' && t.faction === 'swarm') return 1 + 0.6 * sp.power;
    if (sp.key === 'nightglass' && (t.faction === 'umbral' || t.boss)) return 1 + 0.5 * sp.power;
    if (sp.key === 'vanguard' && (F.pirate || F.alwaysHostile || t.mission || t.boss))
      return 1 + 0.4 * sp.power;
    return 1;
  },
  // hooks from the rest of the game
  /**
   * Hook called when an NPC ship is destroyed to grant specialist rewards.
   * @this {any}
   * @param {any} s - Player session.
   * @param {any} npc - Defeated NPC entity.
   * @param {any} space - Space instance.
   * @param {boolean} [byEscort] - True if escort ship scored the final blow.
   * @returns {void}
   */
  specOnKill(s, npc, space, byEscort) {
    const d = s.data;
    if (npc.faction === 'swarm')
      this.specGain(s, 'swarmbreaker', 1 + (Math.random() < 0.4 ? 1 : 0), 0.18);
    if (npc.faction === 'umbral')
      this.specGain(s, 'nightglass', 1 + Math.floor((npc.strength || 10) / 300), 0.12);
    if ((FACTIONS[npc.faction] || {}).pirate)
      this.specGain(
        s,
        'vanguard',
        npc.mission ? 3 : 1,
        npc.mission ? 0.6 : 0.03,
        npc.mission ? 3 : 1,
      );
    if (byEscort && this.wingHulls(d).length) this.specGain(s, 'herald', 1, 0.1);
    if (npc.wave) this.specGain(s, 'bulwark', 1, 0.2);
  },
  /**
   * Hook called when player boards a disabled vessel to reward Corsair materials.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  specOnBoard(s) {
    this.specGain(s, 'corsair', 2, 0.3, 1 + Math.floor(Math.random() * 3));
  },
  /**
   * Hook called when player scoops cargo loot to reward Tidecaller resources.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  specOnLoot(s) {
    this.specGain(s, 'tidecaller', 1, 0.06);
  },
  /**
   * Hook called when mining asteroid chunks to reward Lodestar resources.
   * @this {any}
   * @param {any} s - Player session.
   * @param {{rich?: number}} it - Mined item details.
   * @returns {void}
   */
  specOnMine(s, it) {
    if ((it.rich || 1) >= 2 && Math.random() < 0.5)
      this.specGain(s, 'lodestar', 1, 0.15, 1 + (Math.random() < 0.3 ? 1 : 0));
  },
  /**
   * Hook called when charting uncharted sectors to reward Pathfinder resources.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  specOnChart(s) {
    this.specGain(s, 'pathfinder', 2, 0.25);
  },
  /**
   * Hook called when defending or winning an outpost raid to reward Bulwark blueprints.
   * @this {any}
   * @param {any} s - Player session.
   * @param {boolean} won - True if raid was successful.
   * @returns {void}
   */
  specOnRaid(s, won) {
    if (won) this.specGain(s, 'bulwark', 3, 1, 3 + Math.floor(Math.random() * 3));
  },
  /**
   * Hook called upon completing jobs to reward specialized blueprints and resources.
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Mission object.
   * @returns {void}
   */
  specOnJob(s, m) {
    if (m.type === 'smuggle') this.specGain(s, 'wraith', 3, 1, 3 + Math.floor(Math.random() * 4));
    if (m.type === 'bounty' || m.type === 'assassinate')
      this.specGain(
        s,
        'vanguard',
        m.type === 'assassinate' ? 3 : 1,
        1,
        2 + Math.floor(Math.random() * 3),
      );
  },
  // every two seconds in space: the Pathfinder harvests samples while flying through an anomaly
  /**
   * Periodic idle check in space for Pathfinder research sample harvesting in anomalies.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  specIdle(s) {
    const d = s.data;
    if (!s.ent || !this.flying(d, 'pathfinder')) return;
    if (!this.anomalies()[d.sys]) return;
    d.sampleT = (d.sampleT || 0) + 2;
    if (d.sampleT >= 30) {
      d.sampleT = 0;
      this.specGain(s, 'pathfinder', 1, 0.08);
      this.you(s);
    }
  },
  // can this captain jump straight to `to`? (the Pathfinder skips one system along a route)
  /**
   * Evaluate whether Pathfinder ability can skip an intermediate hyperspace link.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} from - Departure system.
   * @param {string} to - Destination system.
   * @returns {string | null} Intermediate system skipped, or null if jump not possible.
   */
  pathfinderJump(d, from, to) {
    if (!this.flying(d, 'pathfinder')) return null;
    const mid = SYS[from].links.find((m) => SYS[m].links.includes(to));
    return mid || null;
  },

  // ------------------------------------------------------------------ the station: build, refine parts, upgrade, tier up
  /**
   * Handle personal station specialist shipyard actions (build, parts, comp, tierup).
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Inbound operation message.
   * @returns {void}
   */
  specOp(s, m) {
    const d = s.data,
      p = STELLARS[d.stellar];
    this.specInit(d);
    if (!p || s.ent || !this.ownSite(d, p))
      return this.toast(s, 'Specialist work happens at your Personal Station.');
    const S = d.station;
    switch (m.op) {
      case 'build': {
        const sp = SPEC[m.id | 0];
        if (!sp) return;
        if (S.ops < BUILD.ops) return this.toast(s, `Specialists are built at Ops ${BUILD.ops}.`);
        if ((d.bp[sp.id] || 0) < BP_NEED)
          return this.toast(
            s,
            `You need ${BP_NEED} ${sp.name} blueprints (you have ${d.bp[sp.id] || 0}).`,
          );
        const cost = sp.cost - this.tradeIn(d);
        if (d.credits < cost || !this.hasMats(d, BUILD.mats))
          return this.toast(
            s,
            `Building the ${sp.name} takes ${credits(cost)} credits (after trade-in) and ${BUILD.mats.map(([a, g, n]) => `${n} ${a} ${GRADES[g]}`).join(', ')}.`,
          );
        if (Object.values(d.cargo).reduce((a, b) => a + b, 0) > sp.cargo)
          return this.toast(s, 'Sell some cargo first.');
        d.credits -= cost;
        this.takeMats(d, BUILD.mats);
        d.bp[sp.id] -= BP_NEED;
        d.ship = makeLoadout(this.A, sp.id, sp.name);
        d.shipless = false;
        d.fuel = undefined;
        d.specState[sp.id] = d.specState[sp.id] || { tier: 1, comp: {} };
        this.log(d, `Built the specialist ${sp.name} (${sp.sub}).`);
        this.toast(s, `The ${sp.name} is yours: ${sp.ability}`);
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${d.name} launched a ${sp.name}, the Rift's newest ${sp.sub.toLowerCase()}.`,
        });
        break;
      }
      case 'parts': {
        const sp = SPEC[m.id | 0];
        if (!sp) return;
        const have = d.spec[sp.res] || 0,
          n = Math.floor(have / PART_RATE);
        if (!n)
          return this.toast(
            s,
            `You need ${PART_RATE} ${SPEC_RES[sp.res].name} per ${sp.name} part.`,
          );
        d.spec[sp.res] -= n * PART_RATE;
        d.parts[sp.id] = (d.parts[sp.id] || 0) + n;
        this.toast(
          s,
          `Refined ${n * PART_RATE} ${SPEC_RES[sp.res].name} into ${n} ${sp.name} part${n > 1 ? 's' : ''}.`,
        );
        break;
      }
      case 'comp': {
        const sp = SPEC[d.ship.hull];
        if (!sp) return this.toast(s, 'Fly the specialist you want to upgrade.');
        const st = (d.specState[sp.id] = d.specState[sp.id] || { tier: 1, comp: {} }),
          c = m.c;
        if (!COMPONENTS[c]) return;
        if (st.upT) return this.toast(s, 'She is in the drydock for her tier-up.');
        if ((st.comp[c] || 0) >= st.tier)
          return this.toast(
            s,
            `${COMPONENTS[c].name} is already upgraded for Tier ${st.tier}. Tier her up to go further.`,
          );
        const cost = COMP_COST(st.tier);
        if ((d.parts[sp.id] || 0) < cost.parts || d.credits < cost.credits)
          return this.toast(
            s,
            `That upgrade takes ${cost.parts} ${sp.name} parts and ${credits(cost.credits)} credits.`,
          );
        d.parts[sp.id] -= cost.parts;
        d.credits -= cost.credits;
        st.comp[c] = (st.comp[c] || 0) + 1;
        this.toast(s, `${sp.name} ${COMPONENTS[c].name} upgraded (level ${st.comp[c]}).`);
        break;
      }
      case 'tierup': {
        const sp = SPEC[d.ship.hull];
        if (!sp) return;
        const st = d.specState[sp.id];
        if (!st || st.upT) return;
        if (st.tier >= TIER_MAX) return this.toast(s, `The ${sp.name} is at Tier ${TIER_MAX}.`);
        if (Object.keys(COMPONENTS).some((c) => (st.comp[c] || 0) < st.tier))
          return this.toast(s, 'Upgrade every component for this tier first.');
        st.upT = Date.now() + TIER_UP_MIN[st.tier] * 60000;
        this.toast(
          s,
          `The ${sp.name} goes into the drydock for Tier ${st.tier + 1}: ${TIER_UP_MIN[st.tier]} minutes. She cannot fly until it is done.`,
        );
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  // tier-ups finish on their own (checked with the station)
  /**
   * Check and finalize completed drydock tier-ups for specialist ships.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {boolean} True if any tier-up was completed.
   */
  specCheck(d) {
    this.specInit(d);
    for (const [id, st] of Object.entries(d.specState))
      if (st.upT && Date.now() >= st.upT) {
        st.upT = null;
        st.tier++;
        this.log(d, `${SPEC[id].name} reached Tier ${st.tier}.`);
        return true;
      }
    return false;
  },
  /**
   * Check whether the player's active ship is currently undergoing a drydock tier-up.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {boolean} True if active ship is in drydock.
   */
  inDrydock(d) {
    const st = d.specState && d.specState[d.ship.hull];
    return !!(st && st.upT && Date.now() < st.upT);
  },
};
