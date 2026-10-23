export interface SpecialistOperations {
  specInit(this: SpecialistsCapabilities, playerData: PlayerData): void;
  specOf(
    this: SpecialistsCapabilities,
    playerData: PlayerData,
  ): ((typeof SPEC)[number] & { power: number }) | null;
  flying(this: SpecialistsCapabilities, playerData: PlayerData, entryKey: string): boolean;
  power(this: SpecialistsCapabilities, playerData: PlayerData): number;
  bonus(this: SpecialistsCapabilities, playerData: PlayerData): Record<string, number>;
  specGain(
    this: SpecialistsCapabilities,
    session: Session,
    entryKey: string,
    resourceCount: number,
    bpChance: number,
    blueprintCount?: number,
  ): void;
  specMult(this: SpecialistsCapabilities, srcRoot: Entity, entity2: Entity, entity: Entity): number;
  specOnKill(
    this: SpecialistsCapabilities,
    session: Session,
    entity: Entity,
    space: Space,
    byEscort?: boolean,
  ): void;
  specOnBoard(this: SpecialistsCapabilities, session: Session): void;
  specOnLoot(this: SpecialistsCapabilities, session: Session): void;
  specOnMine(this: SpecialistsCapabilities, session: Session, item: { rich?: number }): void;
  specOnChart(this: SpecialistsCapabilities, session: Session): void;
  specOnRaid(this: SpecialistsCapabilities, session: Session, hasWon: boolean): void;
  specOnJob(this: SpecialistsCapabilities, session: Session, mission: Mission): void;
  specIdle(this: SpecialistsCapabilities, session: Session): void;
  pathfinderJump(
    this: SpecialistsCapabilities,
    playerData: PlayerData,
    from: string,
    destination: string,
  ): string | null;
  specOp(this: SpecialistsCapabilities, session: Session, message: NetworkMessage): void;
  specCheck(this: SpecialistsCapabilities, playerData: PlayerData): boolean;
  inDrydock(this: SpecialistsCapabilities, playerData: PlayerData): boolean;
}
import type { SpecialistsCapabilities } from './features.ts';
import type { Mission, PlayerData, Session } from './game.ts';
import type { NetworkMessage } from './message-registry.ts';
import type { Entity, Space } from './space.ts';

// Quantum Rift: server feature operations: specialty-ship abilities, unique resources, blueprints,
// building, parts, components and timed tier-ups.
import { SYS as systemsById, STELLARS, FACTIONS, GRADES } from '../shared/galaxy.ts';
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
  specialistResource,
} from '../shared/specialty.ts';
import { planTake, applyTake } from '../shared/cargo-lots.ts';
import { makeLoadout, credits } from '../shared/rules.ts';

/**
 * Map of specialist keys to hull IDs.
 */
const fromEntries2: Record<string, number> = Object.fromEntries(
  Object.values(SPEC).map((specialistShip) => [specialistShip.key, specialistShip.id]),
);

export const SpecialistOperations = {
  /**
   * Initialize specialist ship state and inventory on player data.
   * @param playerData - Saved player data.
   */
  specInit(this: SpecialistsCapabilities, playerData: PlayerData) {
    playerData.spec = playerData.spec || {};
    playerData.bp = playerData.bp || {};
    playerData.parts = playerData.parts || {};
    playerData.specState = playerData.specState || {};
  },
  // the specialist the captain is flying, with its power (components + tier)
  /**
   * Get the specialist configuration and power rating of the player's active ship.
   * @param playerData - Saved player data.
   * @returns Active specialist object or null.
   */
  specOf(this: SpecialistsCapabilities, playerData: PlayerData) {
    const specialistShip = SPEC[playerData.ship.hull];
    if (!specialistShip) return null;
    this.specInit(playerData);
    return { ...specialistShip, power: specPower(playerData.specState[specialistShip.id]) };
  },
  /**
   * Check whether the player is currently piloting a specialist ship of the specified key.
   * @param playerData - Saved player data.
   * @param entryKey - Specialist key.
   * @returns True if flying the specified specialist.
   */
  flying(this: SpecialistsCapabilities, playerData: PlayerData, entryKey: string) {
    return playerData && playerData.ship && playerData.ship.hull === fromEntries2[entryKey!];
  },
  /**
   * Get the current specialist power multiplier.
   * @param playerData - Saved player data.
   * @returns Power multiplier.
   */
  power(this: SpecialistsCapabilities, playerData: PlayerData) {
    const specOf2 = this.specOf(playerData);
    return specOf2 ? specOf2.power : 1;
  },
  /**
   * Compute aggregated stat bonuses from base frontier stats plus active specialist components and traits.
   * @param playerData - Saved player data.
   * @returns Combined ship stat bonuses.
   */
  bonus(this: SpecialistsCapabilities, playerData: PlayerData) {
    const frontierBonus2 = this.frontierBonus(playerData),
      specOf2 = this.specOf(playerData);
    if (!specOf2) return frontierBonus2;
    const savedSpecialist = playerData.specState[specOf2.id] || { comp: {} };
    for (const [component, level] of Object.entries(savedSpecialist.comp || {}))
      for (const [entryKey, value] of Object.entries(COMPONENTS[component].bonus))
        if (entryKey !== 'ability')
          frontierBonus2[entryKey] = (frontierBonus2[entryKey] || 0) + value * level;
    if (specOf2.key === 'lodestar')
      frontierBonus2.miningPct = (frontierBonus2.miningPct || 0) + 200 * specOf2.power;
    if (
      specOf2.key === 'bulwark' &&
      playerData.station.site &&
      STELLARS[playerData.station.site].system === playerData.sys
    ) {
      frontierBonus2.shieldPct = (frontierBonus2.shieldPct || 0) + 50 * specOf2.power;
      frontierBonus2.damagePct = (frontierBonus2.damagePct || 0) + 50 * specOf2.power;
    }
    return frontierBonus2;
  },
  // earn a specialty resource (only while flying that specialist) and/or blueprints (flying anything)
  /**
   * Award specialty resource and/or blueprint drops for activities.
   * @param session - Player session.
   * @param entryKey - Specialist key.
   * @param resourceCount - Resource amount.
   * @param bpChance - Blueprint chance.
   * @param blueprintCount - Number of blueprints.
   */
  specGain(
    this: SpecialistsCapabilities,
    session: Session,
    entryKey: string,
    resourceCount: number,
    bpChance: number,
    blueprintCount: number = 1,
  ) {
    const playerData = session.data;
    this.specInit(playerData);
    const fromEntries = fromEntries2[entryKey!],
      specialistShip = SPEC[fromEntries];
    let message = [];
    if (resourceCount && this.flying(playerData, entryKey)) {
      const count = Math.max(1, Math.round(resourceCount * this.power(playerData)));
      playerData.spec[specialistShip.res] = (playerData.spec[specialistShip.res] || 0) + count;
      message.push(`+${count} ${SPEC_RES[specialistShip.res].name}`);
    }
    if (bpChance && Math.random() < bpChance) {
      playerData.bp[fromEntries] = (playerData.bp[fromEntries] || 0) + blueprintCount;
      message.push(
        `+${blueprintCount} ${specialistShip.name} blueprint${blueprintCount > 1 ? 's' : ''} (${Math.min(playerData.bp[fromEntries], BP_NEED)}/${BP_NEED})`,
      );
      if (
        playerData.bp[fromEntries] >= BP_NEED &&
        playerData.bp[fromEntries] - blueprintCount < BP_NEED
      )
        this.log(playerData, `Enough blueprints to build the ${specialistShip.name}.`);
    }
    if (message.length) this.toast(session, message.join(' · '));
  },
  // damage multiplier from the attacker's specialty against this target (called by Space.damage)
  /**
   * Compute specialist weapon damage multiplier against a target.
   * @param srcRoot - Attacking root entity.
   * @param entity2 - Direct projectile or damage source entity.
   * @param entity - Target entity taking damage.
   * @returns Damage multiplier factor.
   */
  specMult(this: SpecialistsCapabilities, srcRoot: Entity, entity2: Entity, entity: Entity) {
    if (!srcRoot || !srcRoot.player) return 1;
    const playerData = srcRoot.player.s && srcRoot.player.s.data;
    if (!playerData) return 1;
    const specOf2 = this.specOf(playerData);
    if (!specOf2) return 1;
    const factionDef = FACTIONS[entity.faction] || {},
      owner = entity2 === srcRoot;
    if (specOf2.key === 'herald' && !owner) return 1 + 0.25 * specOf2.power; // escorts fight harder
    if (!owner) return 1;
    if (specOf2.key === 'swarmbreaker' && entity.faction === 'swarm')
      return 1 + 0.6 * specOf2.power;
    if (specOf2.key === 'nightglass' && (entity.faction === 'umbral' || entity.boss))
      return 1 + 0.5 * specOf2.power;
    if (
      specOf2.key === 'vanguard' &&
      (factionDef.pirate || factionDef.alwaysHostile || entity.mission || entity.boss)
    )
      return 1 + 0.4 * specOf2.power;
    return 1;
  },
  // hooks from the rest of the game
  /**
   * Hook called when an NPC ship is destroyed to grant specialist rewards.
   * @param session - Player session.
   * @param entity2 - Defeated NPC entity.
   * @param space - Space instance.
   * @param byEscort - True if escort ship scored the final blow.
   */
  specOnKill(
    this: SpecialistsCapabilities,
    session: Session,
    entity: Entity,
    space: Space,
    byEscort?: boolean,
  ) {
    const playerData = session.data;
    if (entity.faction === 'swarm')
      this.specGain(session, 'swarmbreaker', 1 + (Math.random() < 0.4 ? 1 : 0), 0.18);
    if (entity.faction === 'umbral')
      this.specGain(session, 'nightglass', 1 + Math.floor((entity.strength || 10) / 300), 0.12);
    if ((FACTIONS[entity.faction] || {}).pirate)
      this.specGain(
        session,
        'vanguard',
        entity.mission ? 3 : 1,
        entity.mission ? 0.6 : 0.03,
        entity.mission ? 3 : 1,
      );
    if (byEscort && this.wingHulls(playerData).length) this.specGain(session, 'herald', 1, 0.1);
    if (entity.wave) this.specGain(session, 'bulwark', 1, 0.2);
  },
  /**
   * Hook called when player boards a disabled vessel to reward Corsair materials.
   * @param session - Player session.
   */
  specOnBoard(this: SpecialistsCapabilities, session: Session) {
    this.specGain(session, 'corsair', 2, 0.3, 1 + Math.floor(Math.random() * 3));
  },
  /**
   * Hook called when player scoops cargo loot to reward Tidecaller resources.
   * @param session - Player session.
   */
  specOnLoot(this: SpecialistsCapabilities, session: Session) {
    this.specGain(session, 'tidecaller', 1, 0.06);
  },
  /**
   * Hook called when mining asteroid chunks to reward Lodestar resources.
   * @param session - Player session.
   * @param item - Mined item details.
   */
  specOnMine(this: SpecialistsCapabilities, session: Session, item: { rich?: number }) {
    if ((item.rich || 1) >= 2 && Math.random() < 0.5)
      this.specGain(session, 'lodestar', 1, 0.15, 1 + (Math.random() < 0.3 ? 1 : 0));
  },
  /**
   * Hook called when charting uncharted sectors to reward Pathfinder resources.
   * @param session - Player session.
   */
  specOnChart(this: SpecialistsCapabilities, session: Session) {
    this.specGain(session, 'pathfinder', 2, 0.25);
  },
  /**
   * Hook called when defending or winning an outpost raid to reward Bulwark blueprints.
   * @param session - Player session.
   * @param hasWon - True if raid was successful.
   */
  specOnRaid(this: SpecialistsCapabilities, session: Session, hasWon: boolean) {
    if (hasWon) this.specGain(session, 'bulwark', 3, 1, 3 + Math.floor(Math.random() * 3));
  },
  /**
   * Hook called upon completing jobs to reward specialized blueprints and resources.
   * @param session - Player session.
   * @param mission - Mission object.
   */
  specOnJob(this: SpecialistsCapabilities, session: Session, mission: Mission) {
    if (mission.type === 'smuggle')
      this.specGain(session, 'wraith', 3, 1, 3 + Math.floor(Math.random() * 4));
    if (mission.type === 'bounty' || mission.type === 'assassinate')
      this.specGain(
        session,
        'vanguard',
        mission.type === 'assassinate' ? 3 : 1,
        1,
        2 + Math.floor(Math.random() * 3),
      );
  },
  // every two seconds in space: the Pathfinder harvests samples while flying through an anomaly
  /**
   * Periodic idle check in space for Pathfinder research sample harvesting in anomalies.
   * @param session - Player session.
   */
  specIdle(this: SpecialistsCapabilities, session: Session) {
    const playerData = session.data;
    if (!session.ent || !this.flying(playerData, 'pathfinder')) return;
    if (!this.anomalies()[playerData.sys]) return;
    playerData.sampleT = (playerData.sampleT || 0) + 2;
    if (playerData.sampleT >= 30) {
      playerData.sampleT = 0;
      this.specGain(session, 'pathfinder', 1, 0.08);
      this.you(session);
    }
  },
  // can this captain jump straight to `to`? (the Pathfinder skips one system along a route)
  /**
   * Evaluate whether Pathfinder ability can skip an intermediate hyperspace link.
   * @param playerData - Saved player data.
   * @param from - Departure system.
   * @param destination - Destination system.
   * @returns Intermediate system skipped, or null if jump not possible.
   */
  pathfinderJump(
    this: SpecialistsCapabilities,
    playerData: PlayerData,
    from: string,
    destination: string,
  ) {
    if (!this.flying(playerData, 'pathfinder')) return null;
    const midpoint = systemsById[from].links.find((message) =>
      systemsById[message].links.includes(destination),
    );
    return midpoint || null;
  },

  // ------------------------------------------------------------------ the station: build, refine parts, upgrade, tier up
  /**
   * Handle personal station specialist shipyard actions (build, parts, comp, tierup).
   * @param session - Player session.
   * @param message - Inbound operation message.
   */
  specOp(this: SpecialistsCapabilities, session: Session, message: NetworkMessage) {
    const playerData = session.data,
      stellarBody = STELLARS[playerData.stellar!];
    this.specInit(playerData);
    if (!stellarBody || session.ent || !this.ownSite(playerData, stellarBody))
      return this.toast(session, 'Specialist work happens at your Personal Station.');
    const stationState = playerData.station;
    switch (message.op) {
      case 'build': {
        const specialistShip = SPEC[(message.id as number) | 0];
        if (!specialistShip) return;
        if (stationState.ops < BUILD.ops)
          return this.toast(session, `Specialists are built at Station Tier ${BUILD.ops}.`);
        if ((playerData.bp[specialistShip.id] || 0) < BP_NEED)
          return this.toast(
            session,
            `You need ${BP_NEED} ${specialistShip.name} blueprints (you have ${playerData.bp[specialistShip.id] || 0}).`,
          );
        const cost = specialistShip.cost - this.tradeIn(playerData);
        if (playerData.credits < cost || !this.hasMats(playerData, BUILD.mats))
          return this.toast(
            session,
            `Building the ${specialistShip.name} takes ${credits(cost)} credits (after trade-in) and ${BUILD.mats.map(([firstValue, game, count]) => `${count} ${firstValue} ${GRADES[game]}`).join(', ')}.`,
          );
        if (
          this.fitsJobs(playerData, makeLoadout(this.A, specialistShip.id, specialistShip.name)) ||
          this.holdUsed(playerData) > specialistShip.cargo
        )
          return this.toast(session, 'Sell some cargo first.');
        playerData.credits -= cost;
        this.takeMats(playerData, BUILD.mats);
        playerData.bp[specialistShip.id] -= BP_NEED;
        playerData.ship = makeLoadout(this.A, specialistShip.id, specialistShip.name);
        playerData.shipless = false;
        playerData.fuel = undefined;
        playerData.specState[specialistShip.id] = playerData.specState[specialistShip.id] || {
          tier: 1,
          comp: {},
        };
        this.log(
          playerData,
          `Built the specialist ${specialistShip.name} (${specialistShip.sub}).`,
        );
        this.toast(session, `The ${specialistShip.name} is yours: ${specialistShip.ability}`);
        this.broadcast({
          t: 'chat',
          from: '',
          msg: `${playerData.name} launched a ${specialistShip.name}, the Rift's newest ${specialistShip.sub.toLowerCase()}.`,
        });
        break;
      }
      case 'parts': {
        const specialistShip = SPEC[(message.id as number) | 0];
        if (!specialistShip) return;
        const have = specialistResource(playerData, specialistShip),
          count = Math.floor(have / PART_RATE);
        if (!count)
          return this.toast(
            session,
            `You need ${PART_RATE} ${SPEC_RES[specialistShip.res].name} per ${specialistShip.name} part.`,
          );
        if (specialistShip.key === 'star_dredge') {
          const take = planTake(
            playerData.cargo,
            playerData.cargoLots,
            'plasma',
            count * PART_RATE,
          );
          applyTake(playerData.cargo, playerData.cargoLots, take);
        } else playerData.spec[specialistShip.res] -= count * PART_RATE;
        playerData.parts[specialistShip.id] = (playerData.parts[specialistShip.id] || 0) + count;
        this.toast(
          session,
          `Refined ${count * PART_RATE} ${SPEC_RES[specialistShip.res].name} into ${count} ${specialistShip.name} part${count > 1 ? 's' : ''}.`,
        );
        break;
      }
      case 'comp': {
        const specialistShip = SPEC[playerData.ship.hull];
        if (!specialistShip) return this.toast(session, 'Fly the specialist you want to upgrade.');
        const savedSpecialist = (playerData.specState[specialistShip.id] = playerData.specState[
            specialistShip.id
          ] || {
            tier: 1,
            comp: {},
          }),
          component = message.c!;
        if (!COMPONENTS[component]) return;
        if (savedSpecialist.upT)
          return this.toast(session, 'She is in the drydock for her tier-up.');
        if ((savedSpecialist.comp[component] || 0) >= savedSpecialist.tier)
          return this.toast(
            session,
            `${COMPONENTS[component].name} is already upgraded for Tier ${savedSpecialist.tier}. Tier her up to go further.`,
          );
        const cost = COMP_COST(savedSpecialist.tier);
        if (
          (playerData.parts[specialistShip.id] || 0) < cost.parts ||
          playerData.credits < cost.credits
        )
          return this.toast(
            session,
            `That upgrade takes ${cost.parts} ${specialistShip.name} parts and ${credits(cost.credits)} credits.`,
          );
        playerData.parts[specialistShip.id] -= cost.parts;
        playerData.credits -= cost.credits;
        savedSpecialist.comp[component] = (savedSpecialist.comp[component] || 0) + 1;
        this.toast(
          session,
          `${specialistShip.name} ${COMPONENTS[component].name} upgraded (level ${savedSpecialist.comp[component]}).`,
        );
        break;
      }
      case 'tierup': {
        const specialistShip = SPEC[playerData.ship.hull];
        if (!specialistShip) return;
        const savedSpecialist = playerData.specState[specialistShip.id];
        if (!savedSpecialist || savedSpecialist.upT) return;
        if (savedSpecialist.tier >= TIER_MAX)
          return this.toast(session, `The ${specialistShip.name} is at Tier ${TIER_MAX}.`);
        if (
          Object.keys(COMPONENTS).some(
            (component) => (savedSpecialist.comp[component] || 0) < savedSpecialist.tier,
          )
        )
          return this.toast(session, 'Upgrade every component for this tier first.');
        savedSpecialist.upT = Date.now() + TIER_UP_MIN[savedSpecialist.tier] * 60000;
        this.toast(
          session,
          `The ${specialistShip.name} goes into the drydock for Tier ${savedSpecialist.tier + 1}: ${TIER_UP_MIN[savedSpecialist.tier]} minutes. She cannot fly until it is done.`,
        );
        break;
      }
      default:
        return;
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // tier-ups finish on their own (checked with the station)
  /**
   * Check and finalize completed drydock tier-ups for specialist ships.
   * @param playerData - Saved player data.
   * @returns True if any tier-up was completed.
   */
  specCheck(this: SpecialistsCapabilities, playerData: PlayerData) {
    this.specInit(playerData);
    for (const [identifier, savedSpecialist] of Object.entries(playerData.specState))
      if (savedSpecialist.upT && Date.now() >= savedSpecialist.upT) {
        savedSpecialist.upT = null;
        savedSpecialist.tier++;
        this.log(playerData, `${SPEC[identifier].name} reached Tier ${savedSpecialist.tier}.`);
        return true;
      }
    return false;
  },
  /**
   * Check whether the player's active ship is currently undergoing a drydock tier-up.
   * @param playerData - Saved player data.
   * @returns True if active ship is in drydock.
   */
  inDrydock(this: SpecialistsCapabilities, playerData: PlayerData) {
    const savedSpecialist = playerData.specState && playerData.specState[playerData.ship.hull];
    return !!(savedSpecialist && savedSpecialist.upT && Date.now() < savedSpecialist.upT);
  },
};
