// 2.1 "Docks": lettered docks at your Personal Station, each with a lead ship and wingmate ships chosen from your stored
// ships. The lead of the active dock is the ship you fly (d.ship); everything else waits in the hangar (d.dock).
// Wingmate slots carry their own officers (a captain and a crew member), who boost that ship.
import { STELLARS, WINGMATES } from '../shared/galaxy.js';
import {
  DOCK_LETTERS,
  DOCKS_BY_OPS,
  HANGAR_BY_OPS,
  WINGS_PER_DOCK,
  WING_ONLY,
  WING_REPAIR_MIN,
  WING_REPAIR_COST,
  WING_CREW,
} from '../shared/docks.js';
import { BRIDGE_SLOTS } from '../shared/hangar.js';
import { researchBonus, officerBonus, makeLoadout, repairBasis, credits } from '../shared/rules.js';
import { SPEC } from '../shared/specialty.js';

/** @type {number | undefined} Hull ID for the Herald specialty ship. */
const HERALD = (Object.values(SPEC).find((s) => s.key === 'herald') || {}).id;

export const DocksOperations = {
  // ------------------------------------------------------------------ save upgrade and bookkeeping
  /**
   * Migrate or repair docks structure in player data.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, any>} Initialized player data.
   */
  docksInit(d) {
    this.hangarInit(d);
    if (!d.shipless && d.ship && !d.ship.uid) d.ship.uid = this.shipUid(d);
    for (const x of d.dock) {
      if (!x.ship.uid) x.ship.uid = this.shipUid(d);
      if (x.escorts && x.escorts.length) {
        const v = x.escorts.length * 500;
        d.credits += v;
        this.log(
          d,
          `Escort presets retired: ${credits(v)} credits refunded for the hired escorts of a stored ship.`,
        );
      }
      delete x.escorts;
    }
    if (!Array.isArray(d.docks)) {
      // first load under 2.1: Dock A holds the ship you fly, and your hired escorts become ships
      d.docks = [{ lead: d.shipless ? null : d.ship.uid, wings: [] }];
      d.activeDock = 0;
      for (const h of d.escorts || []) {
        if (!this.A.ships[h]) continue;
        if (this.A.ships[h].npcOnly) {
          d.credits += 2500;
          this.log(
            d,
            `${this.A.ships[h].name} stood down (retired in 2.6). 2,500 credits refunded.`,
          );
          continue;
        }
        if (d.dock.length < this.dockSlots(d)) {
          const ship = makeLoadout(this.A, h, this.A.ships[h].name);
          ship.uid = this.shipUid(d);
          d.dock.push({ ship, bridge: {} });
          if (d.docks[0].wings.length < WINGS_PER_DOCK)
            d.docks[0].wings.push({ uid: ship.uid, cap: null, crew: null });
        } else {
          const v = WINGMATES.includes(h) ? 500 : 2500;
          d.credits += v;
          this.log(
            d,
            `${this.A.ships[h].name} stood down: no free berth. ${credits(v)} credits refunded.`,
          );
        }
      }
    }
    d.escorts = [];
    while (d.docks.length < this.dockCount(d)) d.docks.push({ lead: null, wings: [] });
    if (d.docks.length > this.dockCount(d)) {
      // 2.1: five docks became four; ships in a dock that closed simply wait in the hangar
      if (d.activeDock >= this.dockCount(d)) {
        const k = this.dockCount(d) - 1;
        d.docks[k] = { lead: d.shipless ? null : d.ship.uid, wings: d.docks[d.activeDock].wings };
        d.activeDock = k;
      }
      d.docks.length = this.dockCount(d);
    }
    if (!(d.activeDock >= 0 && d.activeDock < d.docks.length)) d.activeDock = 0;
    // repair anything inconsistent: unknown ships, ships in two slots, the active lead must be the ship you fly
    const owned = new Set(d.dock.map((x) => x.ship.uid));
    if (!d.shipless) owned.add(d.ship.uid);
    const seen = new Set(),
      oids = new Set(d.officers.map((o) => o.id)),
      crewSeen = new Set(Object.values(d.bridge || {}));
    d.docks.forEach((k, i) => {
      if (i === d.activeDock) k.lead = d.shipless ? null : d.ship.uid;
      else if (
        k.lead &&
        (!owned.has(k.lead) || seen.has(k.lead) || k.lead === (d.shipless ? null : d.ship.uid))
      )
        k.lead = null;
      if (k.lead) seen.add(k.lead);
      k.wings = (k.wings || []).map((w) => {
        if (
          !w ||
          !w.uid ||
          !owned.has(w.uid) ||
          seen.has(w.uid) ||
          w.uid === (d.shipless ? null : d.ship.uid)
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
    return d;
  },
  /**
   * Generate a unique ship UID.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {string} Unique ship identifier.
   */
  shipUid(d) {
    return 's' + this.uid(d);
  },
  /**
   * Get the number of available docks based on station Station Tier.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {number} Number of docks.
   */
  dockCount(d) {
    return d.station && d.station.site ? DOCKS_BY_OPS[d.station.ops] || 1 : 1;
  },
  /**
   * Look up a stored ship entry by its unique identifier.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string | null | undefined} uid - Ship unique identifier.
   * @returns {Record<string, any> | null} Stored ship record or null if not found.
   */
  stored(d, uid) {
    return uid ? d.dock.find((x) => x.ship.uid === uid) || null : null;
  },
  /**
   * Determine the maximum number of wingmates allowed for a dock.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {number} k - Dock index.
   * @returns {number} Maximum wingmate count.
   */
  wingMax(d, k) {
    const D = d.docks[k];
    if (!D) return 0;
    const lead =
      k === d.activeDock ? (d.shipless ? null : d.ship) : (this.stored(d, D.lead) || {}).ship;
    return WINGS_PER_DOCK + (lead && lead.hull === HERALD ? 1 : 0);
  },
  /**
   * Find the dock index and slot where a ship UID is assigned.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} uid - Ship unique identifier.
   * @returns {{k: number, slot: string | number} | null} Slot coordinates or null.
   */
  slotOf(d, uid) {
    for (const [i, k] of d.docks.entries()) {
      if (k.lead === uid) return { k: i, slot: 'lead' };
      const w = k.wings.findIndex((x) => x && x.uid === uid);
      if (w >= 0) return { k: i, slot: w };
    }
    return null;
  },
  /**
   * Remove a ship UID from all dock assignments (lead and wing slots).
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} uid - Ship unique identifier to unassign.
   * @returns {void}
   */
  unassign(d, uid) {
    for (const k of d.docks) {
      if (k.lead === uid) k.lead = null;
      k.wings = k.wings.map((w) => (w && w.uid === uid ? null : w));
    }
  },
  /**
   * Remove an officer from all wingmate crew assignments.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} oid - Officer identifier.
   * @returns {void}
   */
  unwingOfficer(d, oid) {
    for (const k of d.docks)
      for (const w of k.wings) if (w) for (const r of WING_CREW) if (w[r] === oid) w[r] = null;
  },
  /**
   * Look up where an officer is assigned among wingmates.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {string} oid - Officer identifier.
   * @returns {{k: number, w: number, r: string} | null} Assignment location or null.
   */
  wingOfficerAt(d, oid) {
    for (const [i, k] of d.docks.entries())
      for (const [j, w] of k.wings.entries())
        if (w) for (const r of WING_CREW) if (w[r] === oid) return { k: i, w: j, r };
    return null;
  },
  // the wingmates of the active dock that are ready to fly
  /**
   * Retrieve active dock wingmates that are currently repaired and ready to fly.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Array<{w: any, i: number, x: any}>} Array of active wingmate info objects.
   */
  activeWings(d) {
    const D = d.docks && d.docks[d.activeDock];
    if (!D || d.shipless) return [];
    const now = Date.now(),
      max = this.wingMax(d, d.activeDock);
    return D.wings
      .slice(0, max)
      .map((w, i) => ({ w, i, x: w && this.stored(d, w.uid) }))
      .filter((o) => o.x && !(o.x.repairT > now));
  },
  /**
   * Get an array of hull IDs for the active dock's ready wingmates.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {number[]} Array of hull IDs.
   */
  wingHulls(d) {
    return this.activeWings(d).map((o) => o.x.ship.hull);
  },
  /**
   * Calculate officer bonuses provided to a wingmate.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {{cap?: string | null, crew?: string | null}} w - Wingmate slot configuration.
   * @returns {Record<string, number>} Computed stat bonuses.
   */
  wingBonus(d, w) {
    return officerBonus(d.officers, { captain: w.cap, bridge1: w.crew });
  },
  // the new ship you fly took the active dock's lead slot (bought, rebuilt, rewarded)
  /**
   * Handle changes when the player's active ship changes lead slot.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {void}
   */
  leadChanged(d) {
    if (!d.ship.uid) d.ship.uid = this.shipUid(d);
    this.docksInit(d);
  },

  // ------------------------------------------------------------------ payload
  /**
   * Build the network payload for docks and hangar status.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, any>} Docks and stored ship overview payload.
   */
  docksPayload(d) {
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
    const flying = d.shipless
      ? null
      : { uid: d.ship.uid, hull: d.ship.hull, name: d.ship.name, repairT: 0, flying: true };
    return {
      active: d.activeDock,
      cap: this.dockSlots(d),
      count: this.dockCount(d),
      list: d.docks.slice(0, this.dockCount(d)).map((k, i) => ({
        letter: DOCK_LETTERS[i],
        lead: i === d.activeDock ? flying : info(this.stored(d, k.lead)),
        wingMax: this.wingMax(d, i),
        wings: Array.from({ length: this.wingMax(d, i) }, (_, j) => {
          const w = k.wings[j];
          return w
            ? { ...info(this.stored(d, w.uid)), cap: w.cap || null, crew: w.crew || null }
            : null;
        }),
      })),
      stored: d.dock.map((x) => ({
        ...info(x),
        at: (() => {
          const o = this.slotOf(d, x.ship.uid);
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
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} m - Inbound operation message.
   * @returns {void}
   */
  docksOp(s, m) {
    const d = this.docksInit(s.data),
      p = STELLARS[d.stellar];
    if (m.op === 'repair') return this.wingRepair(s, m.uid);
    if (m.op === 'outfitterRepair') {
      if (!p || s.ent || p.system !== d.sys || !this.outfitter(p, d))
        return this.toast(s, 'Land at a planet or station with an outfitter to repair wingmates.');
      return this.wingRepair(s, m.uid);
    }
    if (!p || s.ent || !this.ownSite(d, p))
      return this.toast(s, 'Dock assignments are made at your Personal Station.');
    const k = m.k | 0,
      D = d.docks[k];
    if (!D || k >= this.dockCount(d)) return;
    const name = (x) => `${this.A.ships[x.ship.hull].name} "${x.ship.name}"`;
    switch (m.op) {
      case 'activate': {
        // fly with another dock: its lead becomes your ship, and the old one goes back to its berth
        if (k === d.activeDock) return;
        const L = this.stored(d, D.lead);
        if (!L) return this.toast(s, `Dock ${DOCK_LETTERS[k]} has no lead ship. Assign one first.`);
        const why = this.fitsJobs(d, L.ship);
        if (why) return this.toast(s, why);
        if (d.specState && d.specState[L.ship.hull] && d.specState[L.ship.hull].upT > Date.now())
          return this.toast(s, 'That ship is in the drydock for her tier-up.');
        if (!d.shipless) {
          d.dock.push({ ship: d.ship, bridge: d.bridge });
          d.docks[d.activeDock].lead = d.ship.uid;
        }
        d.dock = d.dock.filter((x) => x !== L);
        d.ship = L.ship;
        d.bridge = this.cleanBridge(d, L.bridge);
        d.shipless = false;
        d.fuel = undefined;
        d.activeDock = k;
        this.toast(s, `Dock ${DOCK_LETTERS[k]} is your active dock. Now flying the ${name(L)}.`);
        break;
      }
      case 'assign': {
        // put a stored ship (or nothing) into a lead or wing slot
        const slot = m.slot === 'lead' ? 'lead' : m.slot | 0,
          X = m.uid ? this.stored(d, m.uid) : null;
        if (m.uid && !X)
          return this.toast(
            s,
            d.ship && d.ship.uid === m.uid
              ? "That's the ship you're flying. Switch to another dock first, or store her."
              : 'That ship is not in your hangar.',
          );
        if (slot === 'lead') {
          if (X && WING_ONLY.includes(X.ship.hull))
            return this.toast(s, `The ${this.A.ships[X.ship.hull].name} flies only as a wingmate.`);
          if (k === d.activeDock) {
            // changing the ship you fly
            if (X) {
              const why = this.fitsJobs(d, X.ship);
              if (why) return this.toast(s, why);
            } else if (
              Object.values(d.cargo).reduce((a, b) => a + b, 0) ||
              this.jobCargo(d) ||
              (d.missions || []).some((m) => m.type === 'passenger' && m.pax > 0)
            )
              return this.toast(
                s,
                'Unload your cargo and complete passenger and cargo missions before storing the ship you fly.',
              );
            if (!d.shipless) {
              if (!X && d.dock.length >= this.dockSlots(d))
                return this.toast(s, 'Every berth is taken.');
              d.dock.push({ ship: d.ship, bridge: d.bridge });
            }
            if (X) {
              this.unassign(d, X.ship.uid);
              d.dock = d.dock.filter((x) => x !== X);
              d.ship = X.ship;
              d.bridge = this.cleanBridge(d, X.bridge);
              d.shipless = false;
              this.toast(s, `Now flying the ${name(X)}.`);
            } else {
              d.ship = makeLoadout(this.A, 703, '');
              d.shipless = true;
              d.bridge = {};
              this.toast(
                s,
                'Ship stored. You have no active ship: assign a lead to this dock, or switch docks.',
              );
            }
            D.lead = d.shipless ? null : d.ship.uid;
            d.fuel = undefined;
          } else {
            if (X) this.unassign(d, X.ship.uid);
            D.lead = X ? X.ship.uid : null;
          } // the DOCKS screen shows the change; no toast
        } else {
          if (slot < 0 || slot >= this.wingMax(d, k)) return;
          const old = D.wings[slot] || { cap: null, crew: null };
          if (X) this.unassign(d, X.ship.uid);
          while (D.wings.length <= slot) D.wings.push(null);
          D.wings[slot] = X
            ? { uid: X.ship.uid, cap: old.cap || null, crew: old.crew || null }
            : null; // the slot keeps its officers
        }
        break;
      }
      case 'crew': {
        // officers for a wingmate: a captain and one crew member
        const w = D.wings[m.w | 0],
          role = WING_CREW.includes(m.role) ? m.role : null;
        if (!w || !role) return;
        if (!m.oid) {
          w[role] = null;
          break;
        }
        const o = d.officers.find((x) => x.id === m.oid);
        if (!o) return;
        if (d.shuttles.some((sh) => sh.crew === o.id && sh.state === 'out'))
          return this.toast(s, `${o.name} is out on a shuttle job.`);
        for (const k2 of BRIDGE_SLOTS) if (d.bridge[k2] === o.id) delete d.bridge[k2];
        for (const sh of d.shuttles) if (sh.crew === o.id) sh.crew = null;
        this.unwingOfficer(d, o.id);
        w[role] = o.id;
        break;
      }
      default:
        return;
    }
    this.docksInit(d);
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  // stored bridge presets may name officers who now serve elsewhere
  /**
   * Clean and validate bridge assignments against available officers.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @param {Record<string, string>} b - Bridge slot officer map.
   * @returns {Record<string, string>} Sanitized bridge map.
   */
  cleanBridge(d, b) {
    const out = {};
    for (const k of BRIDGE_SLOTS)
      if (b && b[k] && d.officers.some((o) => o.id === b[k]) && !this.wingOfficerAt(d, b[k]))
        out[k] = b[k];
    const used = new Set(Object.values(out));
    for (const x of d.dock)
      for (const k of BRIDGE_SLOTS) if (x.bridge && used.has(x.bridge[k])) delete x.bridge[k];
    return out;
  },
  /**
   * Instantly repair a damaged wingmate ship for a credit fee.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} uid - Unique ship identifier.
   * @returns {void}
   */
  wingRepair(s, uid) {
    const d = s.data,
      X = this.stored(d, uid);
    if (!X || !(X.repairT > Date.now())) return;
    const cost = Math.round(repairBasis(this.A, X.ship.hull) * WING_REPAIR_COST);
    if (d.credits < cost) return this.toast(s, `Rush repairs cost ${credits(cost)} credits.`);
    d.credits -= cost;
    X.repairT = 0;
    this.toast(s, `${X.ship.name} is repaired and ready to fly.`);
    this.db.touch();
    this.you(s);
  },
  // a wingmate knocked out in a fight is towed home for repairs
  /**
   * Handle a wingmate ship being disabled or destroyed in combat, setting repair timer.
   * @this {any}
   * @param {any} e - Wingmate ship entity that was defeated.
   * @returns {void}
   */
  onWingLost(e) {
    const s = [...this.sessions.values()].find((x) => x.id === e.wingOf);
    if (!s || !s.data) return;
    const X = this.stored(s.data, e.wingUid);
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
   * @this {any}
   * @param {any} s - Player session.
   * @param {number} hull - Hull ID to purchase.
   * @returns {void}
   */
  buyToHangar(s, hull) {
    const d = this.docksInit(s.data),
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const yard = this.yard(p, d) || [];
    if (!yard.includes(hull)) return;
    if (!d.station.site) return this.toast(s, 'You need a Personal Station to store ships.');
    if (d.dock.length >= this.dockSlots(d))
      return this.toast(
        s,
        `Your hangar is full (${this.dockSlots(d)} berths). Sell a stored ship or raise your station's Station Tier.`,
      );
    const H = this.A.ships[hull];
    if (
      WINGMATES.includes(hull) &&
      ((!d.shipless && d.ship.hull === hull) || d.dock.some((x) => x.ship.hull === hull))
    )
      return this.toast(
        s,
        `${H.name} is already in your fleet. Each named companion can be recruited once.`,
      );
    if (d.credits < H.cost) return this.toast(s, `You need ${credits(H.cost)} credits.`);
    d.credits -= H.cost;
    const ship = makeLoadout(this.A, hull, H.name);
    ship.uid = this.shipUid(d);
    d.dock.push({ ship, bridge: {} });
    this.log(d, `Bought a ${H.name} at ${p.name}, delivered to your hangar.`);
    this.toast(
      s,
      `The ${H.name} is in your hangar. Assign her to a dock at your Personal Station.`,
    );
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
};
