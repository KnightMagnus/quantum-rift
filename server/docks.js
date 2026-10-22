// Docks: lettered docks at your Personal Station, each with a lead ship and wingmate ships chosen from your stored
// ships. The lead of the active dock is the ship you fly (d.ship); everything else waits in the hangar (d.dock).
// Wingmate slots carry their own officers (a captain and a crew member), who boost that ship.
import { STELLARS, WINGMATES } from '../shared/galaxy.js';
import {
  DOCK_LETTERS,
  DOCKS_BY_OPS,
  WINGS_PER_DOCK,
  WING_ONLY,
  WING_REPAIR_MIN,
  WING_REPAIR_COST,
  WING_CREW,
} from '../shared/docks.js';
import { BRIDGE_SLOTS } from '../shared/hangar.js';
import { officerBonus, makeLoadout, repairBasis, credits } from '../shared/rules.js';
import { SPEC } from '../shared/specialty.js';

/** @import { ShipLoadout } from '../shared/rules.js' */
/** @import { PlayerData, Session } from './game.js' */
/** @import { NetworkMessage } from './message-registry.js' */
/** @import { Entity } from './space.js' */

/** @type {number | undefined} Hull ID for the Herald specialty ship. */
const HERALD = (Object.values(SPEC).find((s) => s.key === 'herald') || {}).id;

export const DocksOperations = {
  // ------------------------------------------------------------------ save upgrade and bookkeeping
  /**
   * Migrate or repair docks structure in player data.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {PlayerData} Initialized player data.
   */
  docksInit(playerData) {
    this.hangarInit(playerData);
    if (!playerData.shipless && playerData.ship && !playerData.ship.uid)
      playerData.ship.uid = this.shipUid(playerData);
    for (const x of playerData.dock) {
      if (!x.ship.uid) x.ship.uid = this.shipUid(playerData);
      if (x.escorts && x.escorts.length) {
        const v = x.escorts.length * 500;
        playerData.credits += v;
        this.log(
          playerData,
          `Escort presets retired: ${credits(v)} credits refunded for the hired escorts of a stored ship.`,
        );
      }
      delete x.escorts;
    }
    if (!Array.isArray(playerData.docks)) {
      // first load under 2.1: Dock A holds the ship you fly, and your hired escorts become ships
      playerData.docks = [{ lead: playerData.shipless ? null : playerData.ship.uid, wings: [] }];
      playerData.activeDock = 0;
      for (const h of playerData.escorts || []) {
        if (!this.A.ships[h]) continue;
        if (this.A.ships[h].npcOnly) {
          playerData.credits += 2500;
          this.log(
            playerData,
            `${this.A.ships[h].name} stood down (retired in 2.6). 2,500 credits refunded.`,
          );
          continue;
        }
        if (playerData.dock.length < this.dockSlots(playerData)) {
          const ship = makeLoadout(this.A, h, this.A.ships[h].name);
          ship.uid = this.shipUid(playerData);
          playerData.dock.push({ ship, bridge: {} });
          if (playerData.docks[0].wings.length < WINGS_PER_DOCK)
            playerData.docks[0].wings.push({ uid: ship.uid, cap: null, crew: null });
        } else {
          const v = WINGMATES.includes(h) ? 500 : 2500;
          playerData.credits += v;
          this.log(
            playerData,
            `${this.A.ships[h].name} stood down: no free berth. ${credits(v)} credits refunded.`,
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
        const k = this.dockCount(playerData) - 1;
        playerData.docks[k] = {
          lead: playerData.shipless ? null : playerData.ship.uid,
          wings: playerData.docks[playerData.activeDock].wings,
        };
        playerData.activeDock = k;
      }
      playerData.docks.length = this.dockCount(playerData);
    }
    if (!(playerData.activeDock >= 0 && playerData.activeDock < playerData.docks.length))
      playerData.activeDock = 0;
    // repair anything inconsistent: unknown ships, ships in two slots, the active lead must be the ship you fly
    const owned = new Set(playerData.dock.map((x) => x.ship.uid));
    if (!playerData.shipless) owned.add(playerData.ship.uid);
    const seen = new Set(),
      oids = new Set(playerData.officers.map((officer) => officer.id)),
      crewSeen = new Set(Object.values(playerData.bridge || {}));
    playerData.docks.forEach((k, i) => {
      if (i === playerData.activeDock) k.lead = playerData.shipless ? null : playerData.ship.uid;
      else if (
        k.lead &&
        (!owned.has(k.lead) ||
          seen.has(k.lead) ||
          k.lead === (playerData.shipless ? null : playerData.ship.uid))
      )
        k.lead = null;
      if (k.lead) seen.add(k.lead);
      k.wings = (k.wings || []).map((w) => {
        if (
          !w ||
          !w.uid ||
          !owned.has(w.uid) ||
          seen.has(w.uid) ||
          w.uid === (playerData.shipless ? null : playerData.ship.uid)
        )
          return null;
        seen.add(w.uid);
        for (const r of WING_CREW) {
          if (w[r] && (!oids.has(w[r]) || crewSeen.has(w[r]))) w[r] = null;
          if (w[r]) crewSeen.add(w[r]);
        }
        return w;
      });
    });
    return playerData;
  },
  /**
   * Generate a unique ship UID.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {string} Unique ship identifier.
   */
  shipUid(playerData) {
    return 's' + this.uid(playerData);
  },
  /**
   * Get the number of available docks based on Station Tier.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number} Number of docks.
   */
  dockCount(playerData) {
    return playerData.station && playerData.station.site
      ? DOCKS_BY_OPS[playerData.station.ops] || 1
      : 1;
  },
  /**
   * Look up a stored ship entry by its unique identifier.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string | null | undefined} uid - Ship unique identifier.
   * @returns {{ship: ShipLoadout, escorts?: Array<{ship: ShipLoadout}>} | null} Stored ship record or null if not found.
   */
  stored(playerData, uid) {
    return uid ? playerData.dock.find((x) => x.ship.uid === uid) || null : null;
  },
  /**
   * Determine the maximum number of wingmates allowed for a dock.
   * @param {PlayerData} playerData - Saved player data.
   * @param {number} k - Dock index.
   * @returns {number} Maximum wingmate count.
   */
  wingMax(playerData, k) {
    const D = playerData.docks[k];
    if (!D) return 0;
    const lead =
      k === playerData.activeDock
        ? playerData.shipless
          ? null
          : playerData.ship
        : (this.stored(playerData, D.lead) || {}).ship;
    return WINGS_PER_DOCK + (lead && lead.hull === HERALD ? 1 : 0);
  },
  /**
   * Find the dock index and slot where a ship UID is assigned.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} uid - Ship unique identifier.
   * @returns {{k: number, slot: string | number} | null} Slot coordinates or null.
   */
  slotOf(playerData, uid) {
    for (const [i, k] of playerData.docks.entries()) {
      if (k.lead === uid) return { k: i, slot: 'lead' };
      const w = k.wings.findIndex((x) => x && x.uid === uid);
      if (w >= 0) return { k: i, slot: w };
    }
    return null;
  },
  /**
   * Remove a ship UID from all dock assignments (lead and wing slots).
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} uid - Ship unique identifier to unassign.
   * @returns {void}
   */
  unassign(playerData, uid) {
    for (const k of playerData.docks) {
      if (k.lead === uid) k.lead = null;
      k.wings = k.wings.map((w) => (w && w.uid === uid ? null : w));
    }
  },
  /**
   * Remove an officer from all wingmate crew assignments.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} oid - Officer identifier.
   * @returns {void}
   */
  unwingOfficer(playerData, oid) {
    for (const k of playerData.docks)
      for (const w of k.wings) if (w) for (const r of WING_CREW) if (w[r] === oid) w[r] = null;
  },
  /**
   * Look up where an officer is assigned among wingmates.
   * @param {PlayerData} playerData - Saved player data.
   * @param {string} oid - Officer identifier.
   * @returns {{k: number, w: number, r: string} | null} Assignment location or null.
   */
  wingOfficerAt(playerData, oid) {
    for (const [i, k] of playerData.docks.entries())
      for (const [j, w] of k.wings.entries())
        if (w) for (const r of WING_CREW) if (w[r] === oid) return { k: i, w: j, r };
    return null;
  },
  // the wingmates of the active dock that are ready to fly
  /**
   * Retrieve active dock wingmates that are currently repaired and ready to fly.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Array<{w: ShipLoadout, i: number, x: Record<string, string | number>}>} Array of active wingmate info objects.
   */
  activeWings(playerData) {
    const D = playerData.docks && playerData.docks[playerData.activeDock];
    if (!D || playerData.shipless) return [];
    const now = Date.now(),
      max = this.wingMax(playerData, playerData.activeDock);
    return D.wings
      .slice(0, max)
      .map((w, i) => ({ w, i, x: w && this.stored(playerData, w.uid) }))
      .filter((o) => o.x && !(o.x.repairT > now));
  },
  /**
   * Get an array of hull IDs for the active dock's ready wingmates.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {number[]} Array of hull IDs.
   */
  wingHulls(playerData) {
    return this.activeWings(playerData).map((o) => o.x.ship.hull);
  },
  /**
   * Calculate officer bonuses provided to a wingmate.
   * @param {PlayerData} playerData - Saved player data.
   * @param {{cap?: string | null, crew?: string | null}} w - Wingmate slot configuration.
   * @returns {Record<string, number>} Computed stat bonuses.
   */
  wingBonus(playerData, w) {
    return officerBonus(playerData.officers, { captain: w.cap, bridge1: w.crew });
  },
  // the new ship you fly took the active dock's lead slot (bought, rebuilt, rewarded)
  /**
   * Handle changes when the player's active ship changes lead slot.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {void}
   */
  leadChanged(playerData) {
    if (!playerData.ship.uid) playerData.ship.uid = this.shipUid(playerData);
    this.docksInit(playerData);
  },

  // ------------------------------------------------------------------ payload
  /**
   * Build the network payload for docks and hangar status.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {{activeDock: number, docks: Array<Record<string, string | number>>, dock: Array<Record<string, string | number>>, stored: Array<Record<string, string | number>>}} Docks and stored ship overview payload.
   */
  docksPayload(playerData) {
    const now = Date.now(),
      info = (x) =>
        x
          ? {
              uid: x.ship.uid,
              hull: x.ship.hull,
              name: x.ship.name,
              repairT: x.repairT > now ? x.repairT : 0,
              outfits: Object.values(x.ship.outfits || {}).reduce((a, b) => a + b, 0),
            }
          : null;
    const flying = playerData.shipless
      ? null
      : {
          uid: playerData.ship.uid,
          hull: playerData.ship.hull,
          name: playerData.ship.name,
          repairT: 0,
          flying: true,
        };
    return {
      active: playerData.activeDock,
      cap: this.dockSlots(playerData),
      count: this.dockCount(playerData),
      list: playerData.docks.slice(0, this.dockCount(playerData)).map((k, i) => ({
        letter: DOCK_LETTERS[i],
        lead: i === playerData.activeDock ? flying : info(this.stored(playerData, k.lead)),
        wingMax: this.wingMax(playerData, i),
        wings: Array.from({ length: this.wingMax(playerData, i) }, (_, j) => {
          const w = k.wings[j];
          return w
            ? { ...info(this.stored(playerData, w.uid)), cap: w.cap || null, crew: w.crew || null }
            : null;
        }),
      })),
      stored: playerData.dock.map((x) => ({
        ...info(x),
        at: (() => {
          const o = this.slotOf(playerData, x.ship.uid);
          return o
            ? DOCK_LETTERS[o.k] + (o.slot === 'lead' ? ' lead' : ' wing ' + (o.slot + 1))
            : null;
        })(),
        wingOnly: WING_ONLY.includes(x.ship.hull),
      })),
    };
  },

  // ------------------------------------------------------------------ operations (at your Personal Station)
  /**
   * Handle dock management operations (activate, assign, crew, repair).
   * @param {Session} session - Player session.
   * @param {NetworkMessage} message - Inbound operation message.
   * @returns {void}
   */
  docksOp(session, message) {
    const playerData = this.docksInit(session.data),
      p = STELLARS[playerData.stellar];
    if (message.op === 'repair') return this.wingRepair(session, message.uid);
    if (message.op === 'outfitterRepair') {
      if (!p || session.ent || p.system !== playerData.sys || !this.outfitter(p, playerData))
        return this.toast(
          session,
          'Land at a planet or station with an outfitter to repair wingmates.',
        );
      return this.wingRepair(session, message.uid);
    }
    if (!p || session.ent || !this.ownSite(playerData, p))
      return this.toast(session, 'Dock assignments are made at your Personal Station.');
    const k = message.k | 0,
      D = playerData.docks[k];
    if (!D || k >= this.dockCount(playerData)) return;
    const name = (x) => `${this.A.ships[x.ship.hull].name} "${x.ship.name}"`;
    switch (message.op) {
      case 'activate': {
        // fly with another dock: its lead becomes your ship, and the old one goes back to its berth
        if (k === playerData.activeDock) return;
        const L = this.stored(playerData, D.lead);
        if (!L)
          return this.toast(session, `Dock ${DOCK_LETTERS[k]} has no lead ship. Assign one first.`);
        const why = this.fitsJobs(playerData, L.ship);
        if (why) return this.toast(session, why);
        if (
          playerData.specState &&
          playerData.specState[L.ship.hull] &&
          playerData.specState[L.ship.hull].upT > Date.now()
        )
          return this.toast(session, 'That ship is in the drydock for her tier-up.');
        if (!playerData.shipless) {
          playerData.dock.push({ ship: playerData.ship, bridge: playerData.bridge });
          playerData.docks[playerData.activeDock].lead = playerData.ship.uid;
        }
        playerData.dock = playerData.dock.filter((x) => x !== L);
        playerData.ship = L.ship;
        playerData.bridge = this.cleanBridge(playerData, L.bridge);
        playerData.shipless = false;
        playerData.fuel = undefined;
        playerData.activeDock = k;
        this.toast(
          session,
          `Dock ${DOCK_LETTERS[k]} is your active dock. Now flying the ${name(L)}.`,
        );
        break;
      }
      case 'assign': {
        // put a stored ship (or nothing) into a lead or wing slot
        const slot = message.slot === 'lead' ? 'lead' : message.slot | 0,
          X = message.uid ? this.stored(playerData, message.uid) : null;
        if (message.uid && !X)
          return this.toast(
            session,
            playerData.ship && playerData.ship.uid === message.uid
              ? "That's the ship you're flying. Switch to another dock first, or store her."
              : 'That ship is not in your hangar.',
          );
        if (slot === 'lead') {
          if (X && WING_ONLY.includes(X.ship.hull))
            return this.toast(
              session,
              `The ${this.A.ships[X.ship.hull].name} flies only as a wingmate.`,
            );
          if (k === playerData.activeDock) {
            // changing the ship you fly
            if (X) {
              const why = this.fitsJobs(playerData, X.ship);
              if (why) return this.toast(session, why);
            } else if (
              Object.values(playerData.cargo).reduce((a, b) => a + b, 0) ||
              this.jobCargo(playerData) ||
              (playerData.missions || []).some((m) => m.type === 'passenger' && m.pax > 0)
            )
              return this.toast(
                session,
                'Unload your cargo and complete passenger and cargo missions before storing the ship you fly.',
              );
            if (!playerData.shipless) {
              if (!X && playerData.dock.length >= this.dockSlots(playerData))
                return this.toast(session, 'Every berth is taken.');
              playerData.dock.push({ ship: playerData.ship, bridge: playerData.bridge });
            }
            if (X) {
              this.unassign(playerData, X.ship.uid);
              playerData.dock = playerData.dock.filter((x) => x !== X);
              playerData.ship = X.ship;
              playerData.bridge = this.cleanBridge(playerData, X.bridge);
              playerData.shipless = false;
              this.toast(session, `Now flying the ${name(X)}.`);
            } else {
              playerData.ship = makeLoadout(this.A, 703, '');
              playerData.shipless = true;
              playerData.bridge = {};
              this.toast(
                session,
                'Ship stored. You have no active ship: assign a lead to this dock, or switch docks.',
              );
            }
            D.lead = playerData.shipless ? null : playerData.ship.uid;
            playerData.fuel = undefined;
          } else {
            if (X) this.unassign(playerData, X.ship.uid);
            D.lead = X ? X.ship.uid : null;
          } // the DOCKS screen shows the change; no toast
        } else {
          if (slot < 0 || slot >= this.wingMax(playerData, k)) return;
          const old = D.wings[slot] || { cap: null, crew: null };
          if (X) this.unassign(playerData, X.ship.uid);
          while (D.wings.length <= slot) D.wings.push(null);
          D.wings[slot] = X
            ? { uid: X.ship.uid, cap: old.cap || null, crew: old.crew || null }
            : null; // the slot keeps its officers
        }
        break;
      }
      case 'crew': {
        // officers for a wingmate: a captain and one crew member
        const w = D.wings[message.w | 0],
          role = WING_CREW.includes(message.role) ? message.role : null;
        if (!w || !role) return;
        if (!message.oid) {
          w[role] = null;
          break;
        }
        const officer = playerData.officers.find((x) => x.id === message.oid);
        if (!officer) return;
        if (playerData.shuttles.some((sh) => sh.crew === officer.id && sh.state === 'out'))
          return this.toast(session, `${officer.name} is out on a shuttle job.`);
        for (const k2 of BRIDGE_SLOTS)
          if (playerData.bridge[k2] === officer.id) delete playerData.bridge[k2];
        for (const sh of playerData.shuttles) if (sh.crew === officer.id) sh.crew = null;
        this.unwingOfficer(playerData, officer.id);
        w[role] = officer.id;
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
   * @param {PlayerData} playerData - Saved player data.
   * @param {Record<string, string>} b - Bridge slot officer map.
   * @returns {Record<string, string>} Sanitized bridge map.
   */
  cleanBridge(playerData, b) {
    const out = {};
    for (const k of BRIDGE_SLOTS)
      if (
        b &&
        b[k] &&
        playerData.officers.some((officer) => officer.id === b[k]) &&
        !this.wingOfficerAt(playerData, b[k])
      )
        out[k] = b[k];
    const used = new Set(Object.values(out));
    for (const x of playerData.dock)
      for (const k of BRIDGE_SLOTS) if (x.bridge && used.has(x.bridge[k])) delete x.bridge[k];
    return out;
  },
  /**
   * Instantly repair a damaged wingmate ship for a credit fee.
   * @param {Session} session - Player session.
   * @param {string} uid - Unique ship identifier.
   * @returns {void}
   */
  wingRepair(session, uid) {
    const playerData = session.data,
      X = this.stored(playerData, uid);
    if (!X || !(X.repairT > Date.now())) return;
    const cost = Math.round(repairBasis(this.A, X.ship.hull) * WING_REPAIR_COST);
    if (playerData.credits < cost)
      return this.toast(session, `Rush repairs cost ${credits(cost)} credits.`);
    playerData.credits -= cost;
    X.repairT = 0;
    this.toast(session, `${X.ship.name} is repaired and ready to fly.`);
    this.db.touch();
    this.you(session);
  },
  // a wingmate knocked out in a fight is towed home for repairs
  /**
   * Handle a wingmate ship being disabled or destroyed in combat, setting repair timer.
   * @param {Entity} entity - Wingmate ship entity that was defeated.
   * @returns {void}
   */
  onWingLost(entity) {
    const s = [...this.sessions.values()].find((x) => x.id === entity.wingOf);
    if (!s || !s.data) return;
    const X = this.stored(s.data, entity.wingUid);
    if (!X) return;
    X.repairT = Date.now() + WING_REPAIR_MIN * 60000;
    this.toast(
      s,
      `Wingmate ${X.ship.name} was knocked out and towed home. Repairs take ${WING_REPAIR_MIN} minutes (or pay to rush them at DOCKS or any landed outfitter).`,
    );
    this.log(s.data, `Wingmate ${X.ship.name} was knocked out of the fight.`);
    this.db.touch();
    this.you(s);
  },
  // buying a ship straight into your hangar (no trade-in)
  /**
   * Purchase a new ship directly into the hangar without trading in the active vessel.
   * @param {Session} session - Player session.
   * @param {number} hull - Hull ID to purchase.
   * @returns {void}
   */
  buyToHangar(session, hull) {
    const playerData = this.docksInit(session.data),
      p = STELLARS[playerData.stellar];
    if (!p || session.ent) return;
    const yard = this.yard(p, playerData) || [];
    if (!yard.includes(hull)) return;
    if (!playerData.station.site)
      return this.toast(session, 'You need a Personal Station to store ships.');
    if (playerData.dock.length >= this.dockSlots(playerData))
      return this.toast(
        session,
        `Your hangar is full (${this.dockSlots(playerData)} berths). Sell a stored ship or raise your station's Station Tier.`,
      );
    const H = this.A.ships[hull];
    if (
      WINGMATES.includes(hull) &&
      ((!playerData.shipless && playerData.ship.hull === hull) ||
        playerData.dock.some((x) => x.ship.hull === hull))
    )
      return this.toast(
        session,
        `${H.name} is already in your fleet. Each named companion can be recruited once.`,
      );
    if (playerData.credits < H.cost)
      return this.toast(session, `You need ${credits(H.cost)} credits.`);
    playerData.credits -= H.cost;
    const ship = makeLoadout(this.A, hull, H.name);
    ship.uid = this.shipUid(playerData);
    playerData.dock.push({ ship, bridge: {} });
    this.log(playerData, `Bought a ${H.name} at ${p.name}, delivered to your hangar.`);
    this.toast(
      session,
      `The ${H.name} is in your hangar. Assign her to a dock at your Personal Station.`,
    );
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
};
