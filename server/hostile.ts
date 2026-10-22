export interface HostileOperations {
  hostInit(this: HostileCapabilities, playerData: PlayerData): void;
  myPower(this: HostileCapabilities, playerData: PlayerData): number;
  maybeChest(
    this: HostileCapabilities,
    space: Space,
    session: Entity,
    entity: Entity | null | undefined,
  ): void;
  openChest(
    this: HostileCapabilities,
    session: Session,
    item: { chest?: string; lvl?: number },
  ): boolean;
  holdoutStart(this: HostileCapabilities, session: Session): void;
  holdoutTick(this: HostileCapabilities, session: Session): void;
  holdoutEnd(this: HostileCapabilities, session: Session, hasWon: boolean, reason?: string): void;
  onHoldoutKill(this: HostileCapabilities, _entity: Entity): void;
  eclipseChance(
    this: HostileCapabilities,
    system: SpaceSystem,
    message?: Record<string, number> | null,
  ): number;
}
import type { HostileCapabilities } from './features.ts';
import type { PlayerData, Session, SpaceSystem } from './game.ts';
import type { Entity, Space } from './space.ts';

// Quantum Rift: server feature operations: loot chests,
// Station Holdout, and Umbral Eclipse cells. Hostile levels are computed in Space (e.pw) and shown by the client.
import { STELLARS, MATERIALS, GRADES } from '../shared/galaxy.ts';
import { CHESTS, CHEST_CHANCE, HOLDOUT, ECLIPSE, levelOf, playerPower } from '../shared/hostile.ts';
import { SPEC_BY_KEY } from '../shared/specialty.ts';
import { credits } from '../shared/rules.ts';
import { COOP_HOLDOUT } from '../shared/coop.ts';

/** @import { PlayerData, Session, SpaceSystem } from './game.ts' */
/** @import { Entity, Space } from './space.ts' */

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} value - Value to clamp.
 * @param {number} firstValue - Minimum value.
 * @param {number} secondValue - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Select a random element from an array.
 * @template T
 * @param {T[]} firstValue - Array of items.
 * @returns {T} Selected item.
 */
const pick = <ValueType>(firstValue: ValueType[]): ValueType =>
  firstValue[Math.floor(Math.random() * firstValue.length)];

export const HostileOperations = {
  /**
   * Initialize holdout tracking state on player data.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {void}
   */
  hostInit(this: HostileCapabilities, playerData: PlayerData) {
    playerData.holdout = playerData.holdout || { best: 0, lastT: 0 };
  },
  /**
   * Calculate effective combat power of the player's active ship and wingmates.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Player power rating.
   */
  myPower(this: HostileCapabilities, playerData: PlayerData) {
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
  maybeChest(
    this: HostileCapabilities,
    space: Space,
    session: Entity,
    entity: Entity | null | undefined,
  ) {
    const lootChestDef = CHESTS[session.faction];
    if (!lootChestDef || !entity || !entity.player) return;
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
   * @param {{chest: string, lvl?: number}} item - Loot item details.
   * @returns {boolean} True if opened successfully.
   */
  openChest(this: HostileCapabilities, session: Session, item: { chest?: string; lvl?: number }) {
    const playerData = session.data,
      lootChestDef = CHESTS[item.chest!],
      level = item.lvl || 1,
      received = [],
      _mods = this.mods(playerData.sys);
    this.hostInit(playerData);
    this.specInit(playerData);
    this.tut(session, 'chest');
    const credits2 = Math.round((200 + level * level * 40) * (0.7 + Math.random() * 0.6));
    playerData.credits += credits2;
    playerData.stats.earned += credits2;
    received.push(`${credits(credits2)} cr`);
    const clamp2 = clamp(Math.floor(level / 9), 0, 4),
      pick2 = pick(lootChestDef.mats);
    playerData.mats[pick2][clamp2]++;
    received.push(`${pick2} ${GRADES[clamp2]}`);
    if (Math.random() < 0.5) {
      const specialistShip = SPEC_BY_KEY[lootChestDef.bp],
        count = 1 + Math.floor(Math.random() * 3);
      playerData.bp[specialistShip.id] = (playerData.bp[specialistShip.id] || 0) + count;
      received.push(`${count} ${specialistShip.name} blueprint${count > 1 ? 's' : ''}`);
    }
    if (SPEC_BY_KEY[lootChestDef.bp] && playerData.ship.hull === SPEC_BY_KEY[lootChestDef.bp].id) {
      playerData.spec[lootChestDef.res] = (playerData.spec[lootChestDef.res] || 0) + 2;
      received.push(`2 ${lootChestDef.res}`);
    }
    this.toast(session, `${lootChestDef.name} (Lv ${level}): ${received.join(', ')}.`);
    this.you(session);
    return true;
  },

  // ------------------------------------------------------------------ Station Holdout (solo wave defense at your own station)
  /**
   * Start a Station Holdout wave defense activity from the player's personal station.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  holdoutStart(this: HostileCapabilities, session: Session) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    this.hostInit(playerData);
    if (!stellarBody || session.ent || !this.ownSite(playerData, stellarBody))
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
    if (this.holdoutAnnounce) this.holdoutAnnounce(session); // the Armada is told and can fly in to help
    this.db.touch();
    this.you(session);
  },
  /**
   * Update the active holdout state, managing waves, platform defense, and completion checks.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  holdoutTick(this: HostileCapabilities, session: Session) {
    const playerData = session.data;
    this.hostInit(playerData);
    const savedHoldoutRun = playerData.holdout.active;
    if (!savedHoldoutRun) return;
    const site = STELLARS[playerData.station.site!],
      here = session.ent && playerData.sys === site.system;
    if (!here) return this.holdoutEnd(session, false, 'You left the station.');
    const space = this.spaces[site.system];
    if (!savedHoldoutRun.platforms.length) {
      // deploy the platforms around the station
      const platforms2 = HOLDOUT.platforms(playerData.station.defense!);
      for (let index = 0; index < platforms2; index++) {
        const firstValue = (index / platforms2) * Math.PI * 2,
          positionX = site.x + Math.cos(firstValue) * 220,
          positionY = site.y + Math.sin(firstValue) * 220;
        const entity = space.makeShip({
          hull: 711,
          faction: 'quantum',
          x: positionX,
          y: positionY,
          ai: 'guard',
          owner: session.ent!.id,
          name: 'Defense Platform',
          bonus: { armorPct: 150, shieldPct: 150, damagePct: 60 },
        });
        entity.home = { x: positionX, y: positionY };
        entity.life = 1e9;
        entity.noDisable = true;
        entity.platform = true;
        savedHoldoutRun.platforms.push(entity.id);
      }
    }
    const alive = savedHoldoutRun.ids.filter((identifier) => space.ships.has(identifier));
    if (savedHoldoutRun.wave && !alive.length) {
      savedHoldoutRun.cleared = savedHoldoutRun.wave;
      if (savedHoldoutRun.wave >= HOLDOUT.waves) return this.holdoutEnd(session, true);
      if (!savedHoldoutRun.nextT) {
        savedHoldoutRun.nextT = Date.now() + HOLDOUT.waveGap * 1000;
        this.toast(
          session,
          `Wave ${savedHoldoutRun.wave} cleared. Next wave in ${HOLDOUT.waveGap} seconds.`,
        );
      }
    }
    if (
      savedHoldoutRun.wave &&
      alive.length &&
      Date.now() - savedHoldoutRun.waveT! > HOLDOUT.timeoutMin * 60000
    )
      return this.holdoutEnd(session, false, `Wave ${savedHoldoutRun.wave} overran the defenses.`);
    if (savedHoldoutRun.nextT && Date.now() >= savedHoldoutRun.nextT && !alive.length) {
      savedHoldoutRun.wave++;
      savedHoldoutRun.nextT = 0;
      savedHoldoutRun.waveT! = Date.now();
      savedHoldoutRun.ids = [];
      const helpers = this.holdoutHelpers ? this.holdoutHelpers(playerData, site) : []; // co-op Holdout
      savedHoldoutRun.helpers = [
        ...new Set([
          ...(savedHoldoutRun.helpers || []),
          ...helpers.map((session) => session.data.name),
        ]),
      ];
      const base = HOLDOUT.wave(savedHoldoutRun.wave),
        hulls = base.concat(
          Array.from(
            { length: helpers.length * COOP_HOLDOUT.extraPerHelper },
            (unused, index) => base[index % base.length],
          ),
        );
      const angle = Math.random() * Math.PI * 2,
        scale = clamp(this.myPower(playerData) / 400, 0.6, 6),
        percentage =
          (scale - 1) * 60 + savedHoldoutRun.wave * 8 + helpers.length * COOP_HOLDOUT.pctPerHelper;
      const defenders = [session.ent, ...helpers.map((session) => session.ent)];
      hulls.forEach((height, index) => {
        const firstValue = angle + (index - hulls.length / 2) * 0.25,
          positionX = site.x + Math.cos(firstValue) * 1600,
          positionY = site.y + Math.sin(firstValue) * 1600;
        const faction2 = height >= 760 ? 'umbral' : 'hollow',
          entity = space.makeShip({
            hull: height,
            faction: faction2,
            x: positionX,
            y: positionY,
            a: firstValue + Math.PI,
            ai: 'raid',
            bonus: { shieldPct: percentage, armorPct: percentage },
          });
        entity.life = 1e9;
        entity.holdout = playerData.name;
        // Opt-in defense participants, not unrelated passing newcomers.
        entity.combatOwners = defenders.map((defender) => defender!.player!.id);
        entity.target = defenders[index % defenders.length];
        if (savedHoldoutRun.wave === 10 && index === 0) {
          entity.holdoutBoss = true;
          entity.name = 'Holdout Warlord';
          entity.noDisable = true;
        }
        savedHoldoutRun.ids.push(entity.id);
        space.events.push(['flash', Math.round(positionX), Math.round(positionY)]);
      });
      this.toast(
        session,
        `Wave ${savedHoldoutRun.wave} of ${HOLDOUT.waves}: ${hulls.length} hostiles inbound.`,
      );
      this.you(session);
    }
  },
  /**
   * Conclude a holdout event, despawn platforms/enemies, and distribute rewards.
   * @param {Session} session - Player session.
   * @param {boolean} hasWon - Whether all ten waves were completed.
   * @param {string} [reason] - Reason for termination if incomplete.
   * @returns {void}
   */
  holdoutEnd(this: HostileCapabilities, session: Session, hasWon: boolean, reason?: string) {
    const playerData = session.data,
      savedHoldoutRun = playerData.holdout.active;
    if (!savedHoldoutRun) return;
    playerData.holdout.active = null;
    playerData.holdout.lastT = Date.now();
    const site = STELLARS[playerData.station.site!],
      space = this.live[site.system];
    if (space)
      for (const identifier of [...savedHoldoutRun.platforms, ...savedHoldoutRun.ids]) {
        const entity = space.ships.get(identifier);
        if (entity) space.remove(entity, 'jump');
      }
    const cleared2 = savedHoldoutRun.cleared;
    playerData.holdout.best = Math.max(playerData.holdout.best || 0, cleared2);
    this.specInit(playerData);
    if (!cleared2) {
      this.toast(session, `Holdout over. ${reason || ''} No waves cleared.`);
      this.you(session);
      return;
    }
    const holdoutReward2 = HOLDOUT.reward(cleared2),
      received = [`${credits(holdoutReward2.credits)} cr`];
    playerData.credits += holdoutReward2.credits;
    playerData.stats.earned += holdoutReward2.credits;
    for (let index = 0; index < Math.ceil(cleared2 / 3); index++) {
      const materials = MATERIALS[index % 3];
      playerData.mats[materials][holdoutReward2.grade]++;
      received.push(`${materials} ${GRADES[holdoutReward2.grade]}`);
    }
    const specialistShip = SPEC_BY_KEY.bulwark;
    playerData.bp[specialistShip.id] = (playerData.bp[specialistShip.id] || 0) + cleared2;
    received.push(`${cleared2} Bulwark blueprints`);
    if (playerData.ship.hull === specialistShip.id) {
      playerData.spec.insignia = (playerData.spec.insignia || 0) + holdoutReward2.insignia * 2;
      received.push(`${holdoutReward2.insignia * 2} Raider Insignia`);
    }
    if (hasWon) {
      playerData.mats[MATERIALS[Math.floor(Math.random() * 3)]][4]++;
      playerData.bp[specialistShip.id] += 5;
      received.push('a grade V crate', '5 more Bulwark blueprints');
    } // Grade V crate and five Bulwark blueprints.
    const message = `${hasWon ? 'HOLDOUT WON: all ten waves beaten!' : `Holdout over after ${cleared2} wave${cleared2 > 1 ? 's' : ''}. ${reason || ''}`} Rewards: ${received.join(', ')}.`;
    this.toast(session, message);
    this.log(playerData, message);
    this.notify(session, hasWon ? 'Holdout won' : 'Holdout over', received.join(', '));
    if (this.holdoutReward)
      this.holdoutReward(playerData, savedHoldoutRun, cleared2, hasWon, holdoutReward2); // Armada helpers share the rewards
    this.db.touch();
    this.you(session);
  },
  /**
   * Callback invoked when a ship is destroyed during a holdout.
   * @param {Entity} _entity - Defeated ship entity.
   * @returns {void}
   */
  onHoldoutKill(this: HostileCapabilities, _entity: Entity): void {}, // waves are tracked by id each tick

  // ------------------------------------------------------------------ the Umbral Eclipse (spawned by Space.spawnTraffic)
  /**
   * Compute the spawn probability for an Umbral Eclipse cell in a system.
   * @param {SpaceSystem} system - System metadata.
   * @param {Record<string, number>} [message] - Active sector modifiers.
   * @returns {number} Spawn probability.
   */
  eclipseChance(
    this: HostileCapabilities,
    system: SpaceSystem,
    message?: Record<string, number> | null,
  ) {
    if (system.farside) return 0;
    let component =
      system.danger >= 3 && ['umbral', 'deep', 'frontier'].includes(system.faction)
        ? ECLIPSE.chance
        : 0;
    if (message && message.eclipse > 1 && system.danger >= 1 && system.faction !== 'quantum')
      component += 0.08 * message.eclipse;
    return component;
  },
};
