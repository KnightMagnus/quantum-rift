import type { StoredShip, SavedDockWing } from './save-contracts.ts';
export type DockShipPayload = {
  uid?: string;
  hull: string | number;
  name: string;
  repairT: number;
  flying?: boolean;
  outfits?: number;
  wingOnly?: boolean;
  at?: string | null;
  cap?: string | number | null;
  crew?: string | number | null;
};
export type DocksPayload = {
  active: number;
  cap: number;
  count: number;
  list: Array<{
    letter: string;
    lead: DockShipPayload | null;
    wingMax: number;
    wings: Array<DockShipPayload | null>;
  }>;
  stored: DockShipPayload[];
};
export interface DocksOperations {
  docksInit(this: DocksCapabilities, playerData: PlayerData): PlayerData;
  shipUid(this: DocksCapabilities, playerData: PlayerData): string;
  dockCount(this: DocksCapabilities, playerData: PlayerData): number;
  stored(
    this: DocksCapabilities,
    playerData: PlayerData,
    userId: string | null | undefined,
  ): StoredShip | null;
  wingMax(this: DocksCapabilities, playerData: PlayerData, entryKey: number): number;
  slotOf(
    this: DocksCapabilities,
    playerData: PlayerData,
    userId: string,
  ): { k: number; slot: 'lead' | number } | null;
  unassign(this: DocksCapabilities, playerData: PlayerData, userId: string): void;
  unwingOfficer(this: DocksCapabilities, playerData: PlayerData, officerId: string | number): void;
  wingOfficerAt(
    this: DocksCapabilities,
    playerData: PlayerData,
    officerId: string | number,
  ): { k: number; w: number; r: string } | null;
  activeWings(
    this: DocksCapabilities,
    playerData: PlayerData,
  ): Array<{ w: SavedDockWing; i: number; x: StoredShip }>;
  wingHulls(this: DocksCapabilities, playerData: PlayerData): Array<string | number>;
  wingBonus(
    this: DocksCapabilities,
    playerData: PlayerData,
    width: Pick<SavedDockWing, 'cap' | 'crew'>,
  ): Record<string, number>;
  leadChanged(this: DocksCapabilities, playerData: PlayerData): void;
  docksPayload(this: DocksCapabilities, playerData: PlayerData): DocksPayload;
  docksOp(this: DocksCapabilities, session: Session, message: NetworkMessage): void;
  cleanBridge(
    this: DocksCapabilities,
    playerData: PlayerData,
    secondValue: PlayerData['bridge'] | undefined,
  ): PlayerData['bridge'];
  wingRepair(this: DocksCapabilities, session: Session, userId: string): void;
  onWingLost(this: DocksCapabilities, entity: Entity): void;
  buyToHangar(this: DocksCapabilities, session: Session, hull: number): void;
}
import type { DocksCapabilities } from './features.ts';
import type { PlayerData, Session } from './game.ts';
import type { NetworkMessage } from './message-registry.ts';
import type { Entity } from './space.ts';

// Docks: lettered docks at your Personal Station, each with a lead ship and wingmate ships chosen from your stored
// ships. The lead of the active dock is the ship you fly (d.ship); everything else waits in the hangar (d.dock).
// Wingmate slots carry their own officers (a captain and a crew member), who boost that ship.
import { STELLARS, WINGMATES } from '../shared/galaxy.ts';
import {
  DOCK_LETTERS,
  DOCKS_BY_OPS,
  WINGS_PER_DOCK,
  WING_ONLY,
  WING_REPAIR_MIN,
  WING_REPAIR_COST,
  WING_CREW,
} from '../shared/docks.ts';
import { BRIDGE_SLOTS } from '../shared/hangar.ts';
import { officerBonus, makeLoadout, repairBasis, credits } from '../shared/rules.ts';
import { SPEC } from '../shared/specialty.ts';

/**
 * Hull ID for the Herald specialty ship.
 */
const HERALD: number | undefined = (
  Object.values(SPEC).find((specialistShip) => specialistShip.key === 'herald') || {}
).id;

export const DocksOperations = {
  // ------------------------------------------------------------------ save upgrade and bookkeeping
  /**
   * Migrate or repair docks structure in player data.
   * @param playerData - Saved player data.
   * @returns Initialized player data.
   */
  docksInit(this: DocksCapabilities, playerData: PlayerData) {
    this.hangarInit(playerData);
    if (!playerData.shipless && playerData.ship && !playerData.ship.uid!)
      playerData.ship.uid! = this.shipUid(playerData);
    for (const storedShip of playerData.dock) {
      if (!storedShip.ship.uid!) storedShip.ship.uid! = this.shipUid(playerData);
      if (storedShip.escorts && storedShip.escorts.length) {
        const value = storedShip.escorts.length * 500;
        playerData.credits += value;
        this.log(
          playerData,
          `Escort presets retired: ${credits(value)} credits refunded for the hired escorts of a stored ship.`,
        );
      }
      delete storedShip.escorts;
    }
    if (!Array.isArray(playerData.docks)) {
      // first load under 2.1: Dock A holds the ship you fly, and your hired escorts become ships
      playerData.docks = [{ lead: playerData.shipless ? null : playerData.ship.uid!, wings: [] }];
      playerData.activeDock = 0;
      for (const height of playerData.escorts || []) {
        if (!this.A.ships[height]) continue;
        if (this.A.ships[height].npcOnly) {
          playerData.credits += 2500;
          this.log(
            playerData,
            `${this.A.ships[height].name} stood down (retired in 2.6). 2,500 credits refunded.`,
          );
          continue;
        }
        if (playerData.dock.length < this.dockSlots(playerData)) {
          const ship = makeLoadout(this.A, height, this.A.ships[height].name);
          ship.uid = this.shipUid(playerData);
          playerData.dock.push({ ship, bridge: {} });
          if (playerData.docks[0].wings.length < WINGS_PER_DOCK)
            playerData.docks[0].wings.push({ uid: ship.uid, cap: null, crew: null });
        } else {
          const value = WINGMATES.includes(height) ? 500 : 2500;
          playerData.credits += value;
          this.log(
            playerData,
            `${this.A.ships[height].name} stood down: no free berth. ${credits(value)} credits refunded.`,
          );
        }
      }
    }
    playerData.escorts = [];
    while (playerData.docks.length < this.dockCount(playerData))
      playerData.docks.push({ lead: null, wings: [] });
    if (playerData.docks.length > this.dockCount(playerData)) {
      // five docks became four; ships in a dock that closed simply wait in the hangar
      if (playerData.activeDock >= this.dockCount(playerData)) {
        const entryKey = this.dockCount(playerData) - 1;
        playerData.docks[entryKey] = {
          lead: playerData.shipless ? null : playerData.ship.uid!,
          wings: playerData.docks[playerData.activeDock].wings,
        };
        playerData.activeDock = entryKey;
      }
      playerData.docks.length = this.dockCount(playerData);
    }
    if (!(playerData.activeDock >= 0 && playerData.activeDock < playerData.docks.length))
      playerData.activeDock = 0;
    // repair anything inconsistent: unknown ships, ships in two slots, the active lead must be the ship you fly
    const owned = new Set(playerData.dock.map((storedShip) => storedShip.ship.uid!));
    if (!playerData.shipless) owned.add(playerData.ship.uid!);
    const seen = new Set(),
      oids = new Set(playerData.officers.map((officer) => officer.id)),
      crewSeen = new Set(Object.values(playerData.bridge || {}));
    playerData.docks.forEach((savedDock, index) => {
      if (index === playerData.activeDock)
        savedDock.lead = playerData.shipless ? null : playerData.ship.uid!;
      else if (
        savedDock.lead &&
        (!owned.has(savedDock.lead) ||
          seen.has(savedDock.lead) ||
          savedDock.lead === (playerData.shipless ? null : playerData.ship.uid!))
      )
        savedDock.lead = null;
      if (savedDock.lead) seen.add(savedDock.lead);
      savedDock.wings = (savedDock.wings || []).map((savedDockWing) => {
        if (
          !savedDockWing ||
          !savedDockWing.uid ||
          !owned.has(savedDockWing.uid) ||
          seen.has(savedDockWing.uid) ||
          savedDockWing.uid === (playerData.shipless ? null : playerData.ship.uid!)
        )
          return null;
        seen.add(savedDockWing.uid);
        for (const wING_CREW of WING_CREW) {
          if (
            savedDockWing[wING_CREW] &&
            (!oids.has(savedDockWing[wING_CREW]) || crewSeen.has(savedDockWing[wING_CREW]))
          )
            savedDockWing[wING_CREW] = null;
          if (savedDockWing[wING_CREW]) crewSeen.add(savedDockWing[wING_CREW]);
        }
        return savedDockWing;
      });
    });
    return playerData;
  },
  /**
   * Generate a unique ship UID.
   * @param playerData - Saved player data.
   * @returns Unique ship identifier.
   */
  shipUid(this: DocksCapabilities, playerData: PlayerData) {
    return 's' + this.uid(playerData);
  },
  /**
   * Get the number of available docks based on Station Tier.
   * @param playerData - Saved player data.
   * @returns Number of docks.
   */
  dockCount(this: DocksCapabilities, playerData: PlayerData) {
    return playerData.station && playerData.station.site
      ? DOCKS_BY_OPS[playerData.station.ops] || 1
      : 1;
  },
  /**
   * Look up a stored ship entry by its unique identifier.
   * @param playerData - Saved player data.
   * @param userId - Ship unique identifier.
   * @returns Stored ship record or null if not found.
   */
  stored(this: DocksCapabilities, playerData: PlayerData, userId: string | null | undefined) {
    return userId
      ? playerData.dock.find((storedShip) => storedShip.ship.uid! === userId) || null
      : null;
  },
  /**
   * Determine the maximum number of wingmates allowed for a dock.
   * @param playerData - Saved player data.
   * @param entryKey - Dock index.
   * @returns Maximum wingmate count.
   */
  wingMax(this: DocksCapabilities, playerData: PlayerData, entryKey: number) {
    const savedDock = playerData.docks[entryKey];
    if (!savedDock) return 0;
    const lead =
      entryKey === playerData.activeDock
        ? playerData.shipless
          ? null
          : playerData.ship
        : (this.stored(playerData, savedDock.lead) || {}).ship;
    return WINGS_PER_DOCK + (lead && lead.hull === HERALD ? 1 : 0);
  },
  /**
   * Find the dock index and slot where a ship UID is assigned.
   * @param playerData - Saved player data.
   * @param userId - Ship unique identifier.
   * @returns Slot coordinates or null.
   */
  slotOf(
    this: DocksCapabilities,
    playerData: PlayerData,
    userId: string,
  ): { k: number; slot: 'lead' | number } | null {
    for (const [index, savedDock] of playerData.docks.entries()) {
      if (savedDock.lead === userId) return { k: index, slot: 'lead' };
      const index2 = savedDock.wings.findIndex(
        (savedDockWing) => savedDockWing && savedDockWing.uid === userId,
      );
      if (index2 >= 0) return { k: index, slot: index2 };
    }
    return null;
  },
  /**
   * Remove a ship UID from all dock assignments (lead and wing slots).
   * @param playerData - Saved player data.
   * @param userId - Ship unique identifier to unassign.
   */
  unassign(this: DocksCapabilities, playerData: PlayerData, userId: string) {
    for (const savedDock of playerData.docks) {
      if (savedDock.lead === userId) savedDock.lead = null;
      savedDock.wings = savedDock.wings.map((savedDockWing) =>
        savedDockWing && savedDockWing.uid === userId ? null : savedDockWing,
      );
    }
  },
  /**
   * Remove an officer from all wingmate crew assignments.
   * @param playerData - Saved player data.
   * @param officerId - Officer identifier.
   */
  unwingOfficer(this: DocksCapabilities, playerData: PlayerData, officerId: string | number) {
    for (const savedDock of playerData.docks)
      for (const savedDockWing of savedDock.wings)
        if (savedDockWing)
          for (const wING_CREW of WING_CREW)
            if (savedDockWing[wING_CREW] === officerId) savedDockWing[wING_CREW] = null;
  },
  /**
   * Look up where an officer is assigned among wingmates.
   * @param playerData - Saved player data.
   * @param officerId - Officer identifier.
   * @returns Assignment location or null.
   */
  wingOfficerAt(this: DocksCapabilities, playerData: PlayerData, officerId: string | number) {
    for (const [index, savedDock] of playerData.docks.entries())
      for (const [innerIndex, savedDockWing] of savedDock.wings.entries())
        if (savedDockWing)
          for (const wING_CREW of WING_CREW)
            if (savedDockWing[wING_CREW] === officerId)
              return { k: index, w: innerIndex, r: wING_CREW };
    return null;
  },
  // the wingmates of the active dock that are ready to fly
  /**
   * Retrieve active dock wingmates that are currently repaired and ready to fly.
   * @param playerData - Saved player data.
   * @returns Array of active wingmate info objects.
   */
  activeWings(this: DocksCapabilities, playerData: PlayerData) {
    const savedDock = playerData.docks && playerData.docks[playerData.activeDock];
    if (!savedDock || playerData.shipless) return [];
    const currentTime = Date.now(),
      wingMax2 = this.wingMax(playerData, playerData.activeDock);
    return savedDock.wings
      .slice(0, wingMax2)
      .map((savedDockWing, index) => ({
        w: savedDockWing,
        i: index,
        x: savedDockWing && this.stored(playerData, savedDockWing.uid),
      }))
      .filter(
        (options): options is { w: SavedDockWing; i: number; x: StoredShip } =>
          !!(options.x && !(options.x.repairT! > currentTime)),
      );
  },
  /**
   * Get an array of hull IDs for the active dock's ready wingmates.
   * @param playerData - Saved player data.
   * @returns Array of hull IDs.
   */
  wingHulls(this: DocksCapabilities, playerData: PlayerData) {
    return this.activeWings(playerData).map((options) => options.x.ship.hull);
  },
  /**
   * Calculate officer bonuses provided to a wingmate.
   * @param playerData - Saved player data.
   * @param width - Wingmate slot configuration.
   * @returns Computed stat bonuses.
   */
  wingBonus(
    this: DocksCapabilities,
    playerData: PlayerData,
    width: Pick<SavedDockWing, 'cap' | 'crew'>,
  ) {
    return officerBonus(playerData.officers, { captain: width.cap, bridge1: width.crew });
  },
  // the new ship you fly took the active dock's lead slot (bought, rebuilt, rewarded)
  /**
   * Handle changes when the player's active ship changes lead slot.
   * @param playerData - Saved player data.
   */
  leadChanged(this: DocksCapabilities, playerData: PlayerData) {
    if (!playerData.ship.uid!) playerData.ship.uid! = this.shipUid(playerData);
    this.docksInit(playerData);
  },

  // ------------------------------------------------------------------ payload
  /**
   * Build the network payload for docks and hangar status.
   * @param playerData - Saved player data.
   * @returns Docks and stored ship overview payload.
   */
  docksPayload(this: DocksCapabilities, playerData: PlayerData): DocksPayload {
    const currentTime = Date.now(),
      info = (storedShip: StoredShip | null): DockShipPayload | null =>
        storedShip
          ? {
              uid: storedShip.ship.uid!,
              hull: storedShip.ship.hull,
              name: storedShip.ship.name,
              repairT: storedShip.repairT! > currentTime ? storedShip.repairT! : 0,
              outfits: Object.values(storedShip.ship.outfits || {}).reduce(
                (firstValue, secondValue) => firstValue + secondValue,
                0,
              ),
            }
          : null;
    const flying = playerData.shipless
      ? null
      : {
          uid: playerData.ship.uid!,
          hull: playerData.ship.hull,
          name: playerData.ship.name,
          repairT: 0,
          flying: true,
        };
    return {
      active: playerData.activeDock,
      cap: this.dockSlots(playerData),
      count: this.dockCount(playerData),
      list: playerData.docks.slice(0, this.dockCount(playerData)).map((savedDock, index) => ({
        letter: DOCK_LETTERS[index],
        lead:
          index === playerData.activeDock ? flying : info(this.stored(playerData, savedDock.lead)),
        wingMax: this.wingMax(playerData, index),
        wings: Array.from({ length: this.wingMax(playerData, index) }, (unused, innerIndex) => {
          const savedDockWing = savedDock.wings[innerIndex];
          return savedDockWing
            ? {
                ...info(this.stored(playerData, savedDockWing.uid))!,
                cap: savedDockWing.cap || null,
                crew: savedDockWing.crew || null,
              }
            : null;
        }),
      })),
      stored: playerData.dock.map((storedShip) => ({
        ...info(storedShip)!,
        at: (() => {
          const slotOf2 = this.slotOf(playerData, storedShip.ship.uid!);
          return slotOf2
            ? DOCK_LETTERS[slotOf2.k] +
                (slotOf2.slot === 'lead' ? ' lead' : ' wing ' + (slotOf2.slot + 1))
            : null;
        })(),
        wingOnly: WING_ONLY.includes(storedShip.ship.hull as number),
      })),
    };
  },

  // ------------------------------------------------------------------ operations (at your Personal Station)
  /**
   * Handle dock management operations (activate, assign, crew, repair).
   * @param session - Player session.
   * @param message - Inbound operation message.
   */
  docksOp(this: DocksCapabilities, session: Session, message: NetworkMessage) {
    const playerData = this.docksInit(session.data),
      stellarBody = STELLARS[playerData.stellar!];
    if (message.op === 'repair') return this.wingRepair(session, message.uid!);
    if (message.op === 'outfitterRepair') {
      if (
        !stellarBody ||
        session.ent ||
        stellarBody.system !== playerData.sys ||
        !this.outfitter(stellarBody, playerData)
      )
        return this.toast(
          session,
          'Land at a planet or station with an outfitter to repair wingmates.',
        );
      return this.wingRepair(session, message.uid!);
    }
    if (!stellarBody || session.ent || !this.ownSite(playerData, stellarBody))
      return this.toast(session, 'Dock assignments are made at your Personal Station.');
    const entryKey = (message.k as number) | 0,
      savedDock = playerData.docks[entryKey];
    if (!savedDock || entryKey >= this.dockCount(playerData)) return;
    const name = (storedShip: StoredShip) =>
      `${this.A.ships[storedShip.ship.hull].name} "${storedShip.ship.name}"`;
    // Check the prospective roster before unassigning any currently loaded carrier.
    if (message.op === 'assign' || message.op === 'crew') {
      const candidate = structuredClone(playerData);
      const dock = candidate.docks[entryKey];
      if (message.op === 'assign') {
        const slot = message.slot === 'lead' ? 'lead' : (message.slot as number) | 0;
        const stored = message.uid
          ? candidate.dock.find((ship) => ship.ship.uid === message.uid)
          : null;
        if (message.uid && !stored) return;
        if (slot !== 'lead' && (slot < 0 || slot >= this.wingMax(playerData, entryKey))) return;
        if (stored)
          for (const other of candidate.docks) {
            if (other.lead === stored.ship.uid) other.lead = null;
            other.wings = other.wings.map((wing) => (wing?.uid === stored.ship.uid ? null : wing));
          }
        if (slot === 'lead') {
          dock.lead = stored?.ship.uid || null;
          if (entryKey === candidate.activeDock) {
            candidate.ship = stored?.ship || candidate.ship;
            candidate.bridge = stored?.bridge || {};
            candidate.shipless = !stored;
          }
        } else
          dock.wings[slot] = stored
            ? {
                cap: dock.wings[slot]?.cap || null,
                crew: dock.wings[slot]?.crew || null,
                uid: stored.ship.uid!,
              }
            : null;
      } else {
        const wing = dock.wings[message.w! | 0];
        if (!wing || !WING_CREW.includes(message.role as 'cap' | 'crew')) return;
        const role = message.role as 'cap' | 'crew';
        const officer = message.oid;
        if (officer) {
          for (const slot of BRIDGE_SLOTS)
            if (candidate.bridge[slot] === officer) delete candidate.bridge[slot];
          for (const other of candidate.docks)
            for (const member of other.wings)
              if (member) {
                if (member.cap === officer) member.cap = null;
                if (member.crew === officer) member.crew = null;
              }
        }
        wing[role] = officer || null;
      }
      const problem = this.fitsJobs(candidate, candidate.ship);
      if (problem) return this.toast(session, problem);
    }
    switch (message.op) {
      case 'activate': {
        // fly with another dock: its lead becomes your ship, and the old one goes back to its berth
        if (entryKey === playerData.activeDock) return;
        const storedShip = this.stored(playerData, savedDock.lead);
        if (!storedShip)
          return this.toast(
            session,
            `Dock ${DOCK_LETTERS[entryKey]} has no lead ship. Assign one first.`,
          );
        const fitsJobs2 = this.fitsJobs(
          { ...playerData, bridge: storedShip.bridge || {} },
          storedShip.ship,
          true,
          entryKey,
        );
        if (fitsJobs2) return this.toast(session, fitsJobs2);
        if (
          playerData.specState &&
          playerData.specState[storedShip.ship.hull] &&
          playerData.specState[storedShip.ship.hull].upT! > Date.now()
        )
          return this.toast(session, 'That ship is in the drydock for her tier-up.');
        if (!playerData.shipless) {
          playerData.dock.push({ ship: playerData.ship, bridge: playerData.bridge });
          playerData.docks[playerData.activeDock].lead = playerData.ship.uid!;
        }
        playerData.dock = playerData.dock.filter((storedShip2) => storedShip2 !== storedShip);
        playerData.ship = storedShip.ship;
        playerData.bridge = this.cleanBridge(playerData, storedShip.bridge);
        playerData.shipless = false;
        playerData.fuel = undefined;
        playerData.activeDock = entryKey;
        this.toast(
          session,
          `Dock ${DOCK_LETTERS[entryKey]} is your active dock. Now flying the ${name(storedShip)}.`,
        );
        break;
      }
      case 'assign': {
        // put a stored ship (or nothing) into a lead or wing slot
        const slot = message.slot === 'lead' ? 'lead' : (message.slot as number) | 0,
          storedShip = message.uid ? this.stored(playerData, message.uid) : null;
        if (message.uid && !storedShip)
          return this.toast(
            session,
            playerData.ship && playerData.ship.uid! === message.uid
              ? "That's the ship you're flying. Switch to another dock first, or store her."
              : 'That ship is not in your hangar.',
          );
        if (slot === 'lead') {
          if (storedShip && WING_ONLY.includes(storedShip.ship.hull as number))
            return this.toast(
              session,
              `The ${this.A.ships[storedShip.ship.hull].name} flies only as a wingmate.`,
            );
          if (entryKey === playerData.activeDock) {
            // changing the ship you fly
            if (storedShip) {
              const fitsJobs3 = this.fitsJobs(
                { ...playerData, bridge: storedShip.bridge || {} },
                storedShip.ship,
                true,
                entryKey,
              );
              if (fitsJobs3) return this.toast(session, fitsJobs3);
            } else if (
              Object.values(playerData.cargo).reduce(
                (firstValue, secondValue) => firstValue + secondValue,
                0,
              ) ||
              this.jobCargo(playerData) ||
              (playerData.missions || []).some(
                (mission) => mission.type === 'passenger' && mission.pax! > 0,
              )
            )
              return this.toast(
                session,
                'Unload your cargo and complete passenger and cargo missions before storing the ship you fly.',
              );
            if (!playerData.shipless) {
              if (!storedShip && playerData.dock.length >= this.dockSlots(playerData))
                return this.toast(session, 'Every berth is taken.');
              playerData.dock.push({ ship: playerData.ship, bridge: playerData.bridge });
            }
            if (storedShip) {
              this.unassign(playerData, storedShip.ship.uid!);
              playerData.dock = playerData.dock.filter((storedShip3) => storedShip3 !== storedShip);
              playerData.ship = storedShip.ship;
              playerData.bridge = this.cleanBridge(playerData, storedShip.bridge);
              playerData.shipless = false;
              this.toast(session, `Now flying the ${name(storedShip)}.`);
            } else {
              playerData.ship = makeLoadout(this.A, 703, '');
              playerData.shipless = true;
              playerData.bridge = {};
              this.toast(
                session,
                'Ship stored. You have no active ship: assign a lead to this dock, or switch docks.',
              );
            }
            savedDock.lead = playerData.shipless ? null : playerData.ship.uid!;
            playerData.fuel = undefined;
          } else {
            if (storedShip) this.unassign(playerData, storedShip.ship.uid!);
            savedDock.lead = storedShip ? storedShip.ship.uid! : null;
          } // the DOCKS screen shows the change; no toast
        } else {
          if (slot < 0 || slot >= this.wingMax(playerData, entryKey)) return;
          const previousValue = savedDock.wings[slot] || { cap: null, crew: null };
          if (storedShip) this.unassign(playerData, storedShip.ship.uid!);
          while (savedDock.wings.length <= slot) savedDock.wings.push(null);
          savedDock.wings[slot] = storedShip
            ? {
                uid: storedShip.ship.uid!,
                cap: previousValue.cap || null,
                crew: previousValue.crew || null,
              }
            : null; // the slot keeps its officers
        }
        break;
      }
      case 'crew': {
        // officers for a wingmate: a captain and one crew member
        const savedDockWing = savedDock.wings[message.w! | 0],
          role = WING_CREW.includes(message.role as 'cap' | 'crew')
            ? (message.role as 'cap' | 'crew')
            : null;
        if (!savedDockWing || !role) return;
        if (!message.oid) {
          savedDockWing[role] = null;
          break;
        }
        const officer = playerData.officers.find(
          (officerRecord) => officerRecord.id === message.oid,
        );
        if (!officer) return;
        if (
          playerData.shuttles.some(
            (savedShuttle) => savedShuttle.crew === officer.id && savedShuttle.state === 'out',
          )
        )
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
          if (playerData.bridge[bRIDGE_SLOTS] === officer.id)
            delete playerData.bridge[bRIDGE_SLOTS];
        for (const savedShuttle of playerData.shuttles)
          if (savedShuttle.crew === officer.id) savedShuttle.crew = null;
        this.unwingOfficer(playerData, officer.id);
        savedDockWing[role] = officer.id;
        break;
      }
      default:
        return;
    }
    this.docksInit(playerData);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // stored bridge presets may name officers who now serve elsewhere
  /**
   * Clean and validate bridge assignments against available officers.
   * @param playerData - Saved player data.
   * @param secondValue - Bridge slot officer map.
   * @returns Sanitized bridge map.
   */
  cleanBridge(
    this: DocksCapabilities,
    playerData: PlayerData,
    secondValue: PlayerData['bridge'] | undefined,
  ) {
    const result: PlayerData['bridge'] = {};
    for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
      if (
        secondValue &&
        secondValue[bRIDGE_SLOTS] &&
        playerData.officers.some((officer) => officer.id === secondValue[bRIDGE_SLOTS]) &&
        !this.wingOfficerAt(playerData, secondValue[bRIDGE_SLOTS])
      )
        result[bRIDGE_SLOTS] = secondValue[bRIDGE_SLOTS];
    const used = new Set(Object.values(result));
    for (const storedShip of playerData.dock)
      for (const bRIDGE_SLOTS of BRIDGE_SLOTS)
        if (storedShip.bridge && used.has(storedShip.bridge[bRIDGE_SLOTS]))
          delete storedShip.bridge[bRIDGE_SLOTS];
    return result;
  },
  /**
   * Instantly repair a damaged wingmate ship for a credit fee.
   * @param session - Player session.
   * @param userId - Unique ship identifier.
   */
  wingRepair(this: DocksCapabilities, session: Session, userId: string) {
    const playerData = session.data,
      storedShip = this.stored(playerData, userId);
    if (!storedShip || !(storedShip.repairT! > Date.now())) return;
    const cost = Math.round(repairBasis(this.A, storedShip.ship.hull) * WING_REPAIR_COST);
    if (playerData.credits < cost)
      return this.toast(session, `Rush repairs cost ${credits(cost)} credits.`);
    playerData.credits -= cost;
    storedShip.repairT = 0;
    this.toast(session, `${storedShip.ship.name} is repaired and ready to fly.`);
    this.db.touch();
    this.you(session);
  },
  // a wingmate knocked out in a fight is towed home for repairs
  /**
   * Handle a wingmate ship being disabled or destroyed in combat, setting repair timer.
   * @param entity - Wingmate ship entity that was defeated.
   */
  onWingLost(this: DocksCapabilities, entity: Entity) {
    const session = [...this.sessions.values()].find((session) => session.id === entity.wingOf);
    if (!session || !session.data) return;
    const storedShip = this.stored(session.data, entity.wingUid);
    if (!storedShip) return;
    storedShip.repairT = Date.now() + WING_REPAIR_MIN * 60000;
    this.toast(
      session,
      `Wingmate ${storedShip.ship.name} was knocked out and towed home. Repairs take ${WING_REPAIR_MIN} minutes (or pay to rush them at DOCKS or any landed outfitter).`,
    );
    this.log(session.data, `Wingmate ${storedShip.ship.name} was knocked out of the fight.`);
    this.db.touch();
    this.you(session);
  },
  // buying a ship straight into your hangar (no trade-in)
  /**
   * Purchase a new ship directly into the hangar without trading in the active vessel.
   * @param session - Player session.
   * @param hull - Hull ID to purchase.
   */
  buyToHangar(this: DocksCapabilities, session: Session, hull: number) {
    const playerData = this.docksInit(session.data),
      stellarBody = STELLARS[playerData.stellar!];
    if (!stellarBody || session.ent) return;
    const yard = this.yard(stellarBody, playerData) || [];
    if (!yard.includes(hull)) return;
    if (!playerData.station.site)
      return this.toast(session, 'You need a Personal Station to store ships.');
    if (playerData.dock.length >= this.dockSlots(playerData))
      return this.toast(
        session,
        `Your hangar is full (${this.dockSlots(playerData)} berths). Sell a stored ship or raise your station's Station Tier.`,
      );
    const shipHullAsset = this.A.ships[hull];
    if (
      WINGMATES.includes(hull) &&
      ((!playerData.shipless && playerData.ship.hull === hull) ||
        playerData.dock.some((storedShip) => storedShip.ship.hull === hull))
    )
      return this.toast(
        session,
        `${shipHullAsset.name} is already in your fleet. Each named companion can be recruited once.`,
      );
    if (playerData.credits < shipHullAsset.cost)
      return this.toast(session, `You need ${credits(shipHullAsset.cost)} credits.`);
    playerData.credits -= shipHullAsset.cost;
    const ship = makeLoadout(this.A, hull, shipHullAsset.name);
    ship.uid = this.shipUid(playerData);
    playerData.dock.push({ ship, bridge: {} });
    this.log(
      playerData,
      `Bought a ${shipHullAsset.name} at ${stellarBody.name}, delivered to your hangar.`,
    );
    this.toast(
      session,
      `The ${shipHullAsset.name} is in your hangar. Assign her to a dock at your Personal Station.`,
    );
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
};
