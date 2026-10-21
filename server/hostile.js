// Quantum Rift 0.9 "Hostile Space" server feature operations: loot chests (2.6: directives and solo armadas removed),
// Station Holdout, and Umbral Eclipse cells. Hostile levels are computed in Space (e.pw) and shown by the client.
import { SYS, STELLARS, FACTIONS, MATERIALS, GRADES } from '../shared/galaxy.js';
import { CHESTS, CHEST_CHANCE, HOLDOUT, ECLIPSE, levelOf, playerPower } from '../shared/hostile.js';
import { SPECIALISTS, SPEC_BY_KEY, BP_NEED } from '../shared/specialty.js';
import { credits } from '../shared/rules.js';
import { COOP_HOLDOUT } from '../shared/coop.js';

/** @import { PlayerData, Session, SpaceSystem } from './game.js' */
/** @import { Entity, Space } from './space.js' */

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} v - Value to clamp.
 * @param {number} a - Minimum value.
 * @param {number} b - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Select a random element from an array.
 * @template T
 * @param {T[]} a - Array of items.
 * @returns {T} Selected item.
 */
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const HostileOperations = {
  /**
   * Initialize holdout tracking state on player data.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {void}
   */
  hostInit(playerData) {
    playerData.holdout = playerData.holdout || { best: 0, lastT: 0 };
  },
  /**
   * Calculate effective combat power of the player's active ship and wingmates.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Player power rating.
   */
  myPower(playerData) {
    return playerPower(
      this.A,
      playerData.ship.hull,
      this.bonus(playerData),
      this.wingHulls ? this.wingHulls(playerData) : [],
    );
  },

  // ------------------------------------------------------------------ chests (called from Space.kill)
  /**
   * Roll for and spawn a faction loot chest when an NPC ship is destroyed.
   * @param {Space} space - Space instance where the kill occurred.
   * @param {Session} session - Destroyed ship entity.
   * @param {Entity} entity - Attacking entity that destroyed the ship.
   * @returns {void}
   */
  maybeChest(space, session, entity) {
    const C = CHESTS[session.faction];
    if (!C || !entity || !entity.player) return;
    const always = session.boss || session.holdoutBoss || session.kingpin;
    if (!always && Math.random() > CHEST_CHANCE * (space.m ? space.m.chest : 1)) return;
    space.loot.push({
      id: space.nextLootId(),
      x: session.x,
      y: session.y,
      vx: session.vx * 0.2,
      vy: session.vy * 0.2,
      it: { chest: session.faction, lvl: levelOf(session.pw || session.strength || 10) },
      t: space.t,
      kind: 5,
    });
  },
  /**
   * Open a loot chest, awarding credits, crafting materials, blueprints, and specialty items.
   * @param {Session} session - Player session opening the chest.
   * @param {{chest: string, lvl?: number}} it - Loot item details.
   * @returns {boolean} True if opened successfully.
   */
  openChest(session, it) {
    const playerData = session.data,
      C = CHESTS[it.chest],
      lvl = it.lvl || 1,
      got = [],
      m = this.mods(playerData.sys);
    this.hostInit(playerData);
    this.specInit(playerData);
    this.tut(session, 'chest');
    const cr = Math.round((200 + lvl * lvl * 40) * (0.7 + Math.random() * 0.6));
    playerData.credits += cr;
    playerData.stats.earned += cr;
    got.push(`${credits(cr)} cr`);
    const g = clamp(Math.floor(lvl / 9), 0, 4),
      mt = pick(C.mats);
    playerData.mats[mt][g]++;
    got.push(`${mt} ${GRADES[g]}`);
    if (Math.random() < 0.5) {
      const sp = SPEC_BY_KEY[C.bp],
        n = 1 + Math.floor(Math.random() * 3);
      playerData.bp[sp.id] = (playerData.bp[sp.id] || 0) + n;
      got.push(`${n} ${sp.name} blueprint${n > 1 ? 's' : ''}`);
    }
    if (SPEC_BY_KEY[C.bp] && playerData.ship.hull === SPEC_BY_KEY[C.bp].id) {
      playerData.spec[C.res] = (playerData.spec[C.res] || 0) + 2;
      got.push(`2 ${C.res}`);
    }
    this.toast(session, `${C.name} (Lv ${lvl}): ${got.join(', ')}.`);
    this.you(session);
    return true;
  },

  // ------------------------------------------------------------------ Station Holdout (solo wave defense at your own station)
  /**
   * Start a Station Holdout wave defense activity from the player's personal station.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  holdoutStart(session) {
    const playerData = session.data,
      p = STELLARS[playerData.stellar];
    this.hostInit(playerData);
    if (!p || session.ent || !this.ownSite(playerData, p))
      return this.toast(session, 'Start a Holdout from your Personal Station.');
    if (playerData.station.ops < 2) return this.toast(session, 'Holdouts need Station Tier 2.');
    const wait = playerData.holdout.lastT + HOLDOUT.cooldownH * 3600000 - Date.now();
    if (wait > 0)
      return this.toast(
        session,
        `The defenders are still resupplying: ${Math.ceil(wait / 60000)} minutes.`,
      );
    playerData.holdout.active = {
      wave: 0,
      nextT: Date.now() + 4000,
      ids: [],
      platforms: [],
      cleared: 0,
    };
    this.depart(session);
    this.toast(
      session,
      'HOLDOUT: ten waves are inbound. Your defense platforms are deploying. Hold the station!',
    );
    if (this.holdoutAnnounce) this.holdoutAnnounce(session); // 2.6: the Armada is told and can fly in to help
    this.db.touch();
    this.you(session);
  },
  /**
   * Update the active holdout state, managing waves, platform defense, and completion checks.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  holdoutTick(session) {
    const playerData = session.data;
    this.hostInit(playerData);
    const H = playerData.holdout.active;
    if (!H) return;
    const site = STELLARS[playerData.station.site],
      here = session.ent && playerData.sys === site.system;
    if (!here) return this.holdoutEnd(session, false, 'You left the station.');
    const sp = this.spaces[site.system];
    if (!H.platforms.length) {
      // deploy the platforms around the station
      const n = HOLDOUT.platforms(playerData.station.defense);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2,
          x = site.x + Math.cos(a) * 220,
          y = site.y + Math.sin(a) * 220;
        const p = sp.makeShip({
          hull: 711,
          faction: 'quantum',
          x,
          y,
          ai: 'guard',
          owner: session.ent.id,
          name: 'Defense Platform',
          bonus: { armorPct: 150, shieldPct: 150, damagePct: 60 },
        });
        p.home = { x, y };
        p.life = 1e9;
        p.noDisable = true;
        p.platform = true;
        H.platforms.push(p.id);
      }
    }
    const alive = H.ids.filter((id) => sp.ships.has(id));
    if (H.wave && !alive.length) {
      H.cleared = H.wave;
      if (H.wave >= HOLDOUT.waves) return this.holdoutEnd(session, true);
      if (!H.nextT) {
        H.nextT = Date.now() + HOLDOUT.waveGap * 1000;
        this.toast(session, `Wave ${H.wave} cleared. Next wave in ${HOLDOUT.waveGap} seconds.`);
      }
    }
    if (H.wave && alive.length && Date.now() - H.waveT > HOLDOUT.timeoutMin * 60000)
      return this.holdoutEnd(session, false, `Wave ${H.wave} overran the defenses.`);
    if (H.nextT && Date.now() >= H.nextT && !alive.length) {
      H.wave++;
      H.nextT = 0;
      H.waveT = Date.now();
      H.ids = [];
      const helpers = this.holdoutHelpers ? this.holdoutHelpers(playerData, site) : []; // 2.6: co-op Holdout
      H.helpers = [...new Set([...(H.helpers || []), ...helpers.map((o) => o.data.name)])];
      const base = HOLDOUT.wave(H.wave),
        hulls = base.concat(
          Array.from(
            { length: helpers.length * COOP_HOLDOUT.extraPerHelper },
            (_, i) => base[i % base.length],
          ),
        );
      const ang = Math.random() * Math.PI * 2,
        scale = clamp(this.myPower(playerData) / 400, 0.6, 6),
        pct = (scale - 1) * 60 + H.wave * 8 + helpers.length * COOP_HOLDOUT.pctPerHelper;
      const defenders = [session.ent, ...helpers.map((o) => o.ent)];
      hulls.forEach((h, i) => {
        const a = ang + (i - hulls.length / 2) * 0.25,
          x = site.x + Math.cos(a) * 1600,
          y = site.y + Math.sin(a) * 1600;
        const fac = h >= 760 ? 'umbral' : 'hollow',
          e = sp.makeShip({
            hull: h,
            faction: fac,
            x,
            y,
            a: a + Math.PI,
            ai: 'raid',
            bonus: { shieldPct: pct, armorPct: pct },
          });
        e.life = 1e9;
        e.holdout = playerData.name;
        // Opt-in defense participants, not unrelated passing newcomers.
        e.combatOwners = defenders.map((defender) => defender.player.id);
        e.target = defenders[i % defenders.length];
        if (H.wave === 10 && i === 0) {
          e.holdoutBoss = true;
          e.name = 'Holdout Warlord';
          e.noDisable = true;
        }
        H.ids.push(e.id);
        sp.events.push(['flash', Math.round(x), Math.round(y)]);
      });
      this.toast(session, `Wave ${H.wave} of ${HOLDOUT.waves}: ${hulls.length} hostiles inbound.`);
      this.you(session);
    }
  },
  /**
   * Conclude a holdout event, despawn platforms/enemies, and distribute rewards.
   * @param {Session} session - Player session.
   * @param {boolean} won - Whether all ten waves were completed.
   * @param {string} [why] - Reason for termination if incomplete.
   * @returns {void}
   */
  holdoutEnd(session, won, why) {
    const playerData = session.data,
      H = playerData.holdout.active;
    if (!H) return;
    playerData.holdout.active = null;
    playerData.holdout.lastT = Date.now();
    const site = STELLARS[playerData.station.site],
      sp = this.live[site.system];
    if (sp)
      for (const id of [...H.platforms, ...H.ids]) {
        const e = sp.ships.get(id);
        if (e) sp.remove(e, 'jump');
      }
    const n = H.cleared;
    playerData.holdout.best = Math.max(playerData.holdout.best || 0, n);
    this.specInit(playerData);
    if (!n) {
      this.toast(session, `Holdout over. ${why || ''} No waves cleared.`);
      this.you(session);
      return;
    }
    const R = HOLDOUT.reward(n),
      got = [`${credits(R.credits)} cr`];
    playerData.credits += R.credits;
    playerData.stats.earned += R.credits;
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      const mt = MATERIALS[i % 3];
      playerData.mats[mt][R.grade]++;
      got.push(`${mt} ${GRADES[R.grade]}`);
    }
    const bw = SPEC_BY_KEY.bulwark;
    playerData.bp[bw.id] = (playerData.bp[bw.id] || 0) + n;
    got.push(`${n} Bulwark blueprints`);
    if (playerData.ship.hull === bw.id) {
      playerData.spec.insignia = (playerData.spec.insignia || 0) + R.insignia * 2;
      got.push(`${R.insignia * 2} Raider Insignia`);
    }
    if (won) {
      playerData.mats[MATERIALS[Math.floor(Math.random() * 3)]][4]++;
      playerData.bp[bw.id] += 5;
      got.push('a grade V crate', '5 more Bulwark blueprints');
    } // 2.6: was an Umbral Directive
    const msg = `${won ? 'HOLDOUT WON: all ten waves beaten!' : `Holdout over after ${n} wave${n > 1 ? 's' : ''}. ${why || ''}`} Rewards: ${got.join(', ')}.`;
    this.toast(session, msg);
    this.log(playerData, msg);
    this.notify(session, won ? 'Holdout won' : 'Holdout over', got.join(', '));
    if (this.holdoutReward) this.holdoutReward(playerData, H, n, won, R); // 2.6: Armada helpers share the rewards
    this.db.touch();
    this.you(session);
  },
  /**
   * Callback invoked when a ship is destroyed during a holdout.
   * @param {Entity} entity - Defeated ship entity.
   * @returns {void}
   */
  onHoldoutKill(entity) {}, // waves are tracked by id each tick

  // ------------------------------------------------------------------ the Umbral Eclipse (spawned by Space.spawnTraffic)
  /**
   * Compute the spawn probability for an Umbral Eclipse cell in a system.
   * @param {SpaceSystem} system - System metadata.
   * @param {Record<string, number>} [m] - Active sector modifiers.
   * @returns {number} Spawn probability.
   */
  eclipseChance(system, m) {
    if (system.farside) return 0;
    let c =
      system.danger >= 3 && ['umbral', 'deep', 'frontier'].includes(system.faction)
        ? ECLIPSE.chance
        : 0;
    if (m && m.eclipse > 1 && system.danger >= 1 && system.faction !== 'quantum')
      c += 0.08 * m.eclipse;
    return c;
  },
};
