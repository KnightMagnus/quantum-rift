// Quantum Rift 2.6 "Co-op" server feature operations:
//   Captain Friends (requests, online status, DMs with an offline mailbox, blocks)
//   the Armada: a short co-op group of up to five captains and their wingmates (private chat, no friendly fire,
//     small buffs, shared kill credit, follow-the-leader jumps). It replaces the 0.6 fleets.
//   trading between Personal Stations (both captains docked at their own station)
//   duels and Armada Duels (agreed fights that stop at disabled), and Armada rescue of a downed captain
//   co-op Holdout and Armada contracts (group kingpins in the old Mk II and Mk III refits)
//   the 2.6 save migration: refits, the Armada escort hulls, directives, fleets and territory were retired
import {
  SYS,
  STELLARS,
  MATERIALS,
  GRADES,
  COMMODITIES,
  MK2_OF,
  MK3_OF,
  ARMADA_HULLS,
} from '../shared/galaxy.js';
import { SOCIAL, ARMADA, TRADE, DUEL, RESCUE, COOP_HOLDOUT, WARBAND } from '../shared/coop.js';
import { credits, makeLoadout, shipStats, allOutfits } from '../shared/rules.js';

/**
 * Clamps a numeric value between a minimum and maximum bound.
 * @param {number} v - Numeric value to clamp.
 * @param {number} a - Minimum bound.
 * @param {number} b - Maximum bound.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * Mapping from refit hull ID to base hull info and refit generation.
 * @type {Record<number, { base: number, mk: number, via?: number }>}
 */
const BASE_OF = {};
for (const [b, m] of Object.entries(MK2_OF)) BASE_OF[m] = { base: +b, mk: 2 };
for (const [m2, m3] of Object.entries(MK3_OF))
  BASE_OF[m3] = { base: BASE_OF[m2] ? BASE_OF[m2].base : +m2, mk: 3, via: +m2 };

/**
 * Credit refund valuation for retired unused directive tiers.
 * @type {Record<number, number>}
 */
const DIRECTIVE_VALUE = { 1: 90000, 2: 240000, 3: 600000 };

/**
 * Sanitizes and truncates a captain name to 20 characters.
 * @param {string} [n] - Raw name string.
 * @returns {string} Trimmed and sanitized name.
 */
const cleanName = (n) =>
  String(n || '')
    .trim()
    .slice(0, 20);

/**
 * Server operations for cooperative play, captain friends, armadas, trading, duels, and group encounters.
 */
export const CoopOperations = {
  // ------------------------------------------------------------------ start-up and save migration
  /**
   * Initializes co-op state on the world database, migrates legacy 0.6 fleets, and cleans obsolete tables.
   * @returns {void}
   */
  coopInit() {
    const W = this.db.world;
    W.armadas = W.armadas || {};
    this.duels = this.duels || {};
    this.trades = this.trades || {};
    this.nextCoopId = this.nextCoopId || 1;
    // 2.6: the 0.6 fleets are gone. Each fleet bank is shared out between its members, and the founder gets the fee back.
    if (W.fleets && Object.keys(W.fleets).length) {
      for (const F of Object.values(W.fleets)) {
        const members = (F.members || []).map((n) => this.db.get(n)).filter(Boolean),
          share = members.length ? Math.floor((F.bank || 0) / members.length) : 0;
        for (const p of members) {
          p.credits += share;
          p.log = p.log || [];
          p.log.push({
            t: Date.now(),
            text: `Fleets were retired in 2.6 (the Armada replaces them). [${F.tag}] ${F.name} was wound up${share ? `: your share of the fleet bank, ${credits(share)} credits, was paid to you` : ''}.`,
          });
        }
        const L = this.db.get(F.leader);
        if (L) {
          L.credits += 50000;
          L.log.push({ t: Date.now(), text: 'The 50,000 credit fleet founding fee was refunded.' });
        }
      }
    }
    for (const k of ['fleets', 'claims', 'cooldown']) delete W[k];
    this.db.touch();
  },
  /**
   * Migrates a player save to version 2.6, refunding retired refits, Armada escorts, and directives.
   * @param {import('./game.js').PlayerData} d - Player save data.
   * @returns {void}
   */
  coopMigrate(d) {
    if (d.v26) return;
    d.v26 = true;
    delete d.fleet;
    const O = allOutfits(this.A),
      notes = [];
    let refund = 0;
    const mats = [];
    // a refit goes back to its base hull; what the refit cost is refunded and outfits that no longer fit are bought back
    const revert = (ship) => {
      const B = BASE_OF[ship.hull];
      if (!B || !this.A.ships[B.base]) return ship;
      const mkCost = (h, mk3) => Math.round(this.A.ships[h].cost * (mk3 ? 0.45 : 0.3));
      if (B.mk === 3) {
        refund += mkCost(ship.hull, true) + mkCost(B.via, false);
        mats.push(
          ['alloy', 4, 1],
          ['crystal', 4, 1],
          ['isotope', 3, 1],
          ['alloy', 2, 1],
          ['crystal', 2, 1],
          ['isotope', 0, 1],
        );
      } else {
        refund += mkCost(ship.hull, false);
        mats.push(['alloy', 2, 1], ['crystal', 2, 1], ['isotope', 0, 1]);
      }
      const old = this.A.ships[ship.hull].name,
        fresh = makeLoadout(this.A, B.base, ship.name);
      fresh.uid = ship.uid;
      fresh.ammo = { ...(fresh.ammo || {}) };
      for (const [id, n] of Object.entries(ship.outfits || {})) {
        let left = n - (fresh.outfits[id] || 0);
        while (left > 0) {
          fresh.outfits[id] = (fresh.outfits[id] || 0) + 1;
          const st = shipStats(this.A, fresh);
          if (st.free < 0 || st.guns > st.maxGuns || st.turrets > st.maxTurrets) {
            fresh.outfits[id]--;
            if (!fresh.outfits[id]) delete fresh.outfits[id];
            break;
          }
          left--;
        }
        if (left > 0 && O[id]) refund += (O[id].cost || 0) * left;
      }
      for (const [w, a] of Object.entries(ship.ammo || {}))
        if (Object.keys(shipStats(this.A, fresh).weapons).includes(String(w)))
          fresh.ammo[w] = Math.max(fresh.ammo[w] || 0, a);
      notes.push(`${ship.name || old} (${old}) is a ${this.A.ships[B.base].name} again`);
      return fresh;
    };
    if (!d.shipless && d.ship) d.ship = revert(d.ship);
    for (const x of d.dock || []) x.ship = revert(x.ship);
    // the station's Armada escorts are retired: refunded at full price with their outfits
    const gone = (d.dock || []).filter((x) => ARMADA_HULLS.includes(x.ship.hull));
    for (const x of gone) {
      refund += this.A.ships[x.ship.hull].cost || 0;
      for (const [id, n] of Object.entries(x.ship.outfits || {}))
        if (O[id]) refund += (O[id].cost || 0) * n;
      notes.push(`the ${this.A.ships[x.ship.hull].name} stood down`);
    }
    if (gone.length) {
      d.dock = d.dock.filter((x) => !gone.includes(x));
      for (const k of d.docks || []) {
        k.wings = (k.wings || []).map((w) =>
          w && gone.some((x) => x.ship.uid === w.uid) ? null : w,
        );
        if (gone.some((x) => x.ship.uid === k.lead)) k.lead = null;
      }
    }
    if (!d.shipless && d.ship && ARMADA_HULLS.includes(d.ship.hull)) {
      refund += this.A.ships[d.ship.hull].cost;
      d.ship = makeLoadout(this.A, 703, d.ship.name);
      notes.push('your Armada escort ship stood down (you fly a Gnat Skiff for now)');
    }
    // unused directives are bought back at their old store price
    if (d.directives) {
      for (const [t, n] of Object.entries(d.directives))
        if (n > 0) {
          refund += (DIRECTIVE_VALUE[t] || 0) * n;
          notes.push(`${n} unused directive${n > 1 ? 's' : ''} bought back`);
        }
      delete d.directives;
    }
    if (d.mats) for (const [m, g, n] of mats) if (d.mats[m]) d.mats[m][g] += n;
    if (refund || notes.length) {
      d.credits += refund;
      d.log = d.log || [];
      d.log.push({
        t: Date.now(),
        text: `2.6: refits, the Armada escorts and directives were retired. ${notes.join('; ')}.${refund ? ` Refunded ${credits(refund)} credits${mats.length ? ' and the refit materials' : ''}.` : ''}`,
      });
    }
  },

  // ------------------------------------------------------------------ helpers
  /**
   * Finds an active player session matching the specified captain name.
   * @param {string} name - Captain name to look up.
   * @returns {import("./game.js").Session | null} Active session or null if not online.
   */
  sessionOf(name) {
    const k = this.db.key(name);
    for (const o of this.sessions.values()) if (o.data && this.db.key(o.data.name) === k) return o;
    return null;
  },
  /**
   * Ensures social data structures (friends, requests, blocks, mailbox) exist on a player profile.
   * @param {import('./game.js').PlayerData} d - Player profile data.
   * @returns {import("./game.js").PlayerData} The initialized player profile data.
   */
  socialInit(d) {
    d.friends = d.friends || [];
    d.freqIn = d.freqIn || [];
    d.freqOut = d.freqOut || [];
    d.blocks = d.blocks || [];
    d.mail = d.mail || [];
    return d;
  },
  /**
   * Checks if a case-insensitive captain name is present in a list of names.
   * @param {string[]} list - List of captain names.
   * @param {string} name - Captain name to check.
   * @returns {boolean} True if the name is found in the list.
   */
  has(list, name) {
    const k = this.db.key(name);
    return list.some((n) => this.db.key(n) === k);
  },
  /**
   * Removes all entries matching a captain name from a list of names.
   * @param {string[]} list - List of captain names.
   * @param {string} name - Captain name to remove.
   * @returns {string[]} New list with matching names removed.
   */
  drop(list, name) {
    const k = this.db.key(name);
    return list.filter((n) => this.db.key(n) !== k);
  },
  /**
   * Checks whether a captain is blocked by the target player profile.
   * @param {import('./game.js').PlayerData} [d] - Player profile data.
   * @param {string} name - Captain name to check against blocks.
   * @returns {boolean} True if the captain is blocked.
   */
  blocked(d, name) {
    return !!(d && d.blocks && this.has(d.blocks, name));
  },
  /**
   * Determines the online, away, or offline status of a captain.
   * @param {string} name - Captain name to check.
   * @returns {'online'|'away'|'offline'} Captain presence status.
   */
  statusOf(name) {
    const o = this.sessionOf(name);
    if (!o) return 'offline';
    return Date.now() - (o.actT || 0) > SOCIAL.awayMin * 60000 ? 'away' : 'online';
  },
  /**
   * Sends updated player state payload to an active captain session if online.
   * @param {string} name - Captain name to refresh.
   * @returns {void}
   */
  refreshPlayer(name) {
    const o = this.sessionOf(name);
    if (o) this.you(o);
  },
  /**
   * Pushes the latest social and Armada payload to an active captain session.
   * @param {string} name - Captain name to push social data to.
   * @returns {void}
   */
  pushSocial(name) {
    const o = this.sessionOf(name);
    if (o)
      this.send(o, {
        t: 'social',
        social: this.socialPayload(o.data),
        armada: this.armadaPayload(o.data),
      });
  },
  socialPayload(d) {
    if (this.solo) return null;
    this.socialInit(d);
    const row = (n) => {
      const p = this.db.get(n);
      if (!p) return null;
      const st = this.statusOf(n);
      return {
        name: p.name,
        status: st,
        sys: st !== 'offline' && !p.hideSys && SYS[p.sys] ? SYS[p.sys].name : '',
        sysId: st !== 'offline' && !p.hideSys ? p.sys : null,
        last: p.lastSeen || 0,
      };
    };
    return {
      friends: d.friends
        .map(row)
        .filter(Boolean)
        .sort(
          (a, b) =>
            (a.status === 'offline') - (b.status === 'offline') || a.name.localeCompare(b.name),
        ),
      inReq: d.freqIn.slice(),
      outReq: d.freqOut.slice(),
      blocks: d.blocks.slice(),
      dmAll: !!d.dmAll,
      hideSys: !!d.hideSys,
    };
  },
  // tell a captain's online friends (and Armada) that their status changed
  presence(d) {
    if (this.solo || !d) return;
    for (const o of this.sessions.values())
      if (
        o.data &&
        o.data !== d &&
        ((o.data.friends && this.has(o.data.friends, d.name)) ||
          (d.armada && o.data.armada === d.armada))
      )
        this.pushSocial(o.data.name);
  },
  coopLogin(s) {
    const d = this.socialInit(s.data);
    s.actT = Date.now();
    d.armadaFollow = false; // Flight consent never survives reconnects.
    s.armadaFormationLeader = null;
    if (this.solo) return;
    if (d.armada && !this.db.world.armadas[d.armada]) d.armada = null;
    if (d.mail.length) {
      this.send(s, { t: 'dms', list: d.mail });
      this.toast(
        s,
        `${d.mail.length} message${d.mail.length > 1 ? 's' : ''} arrived while you were away (ALLIES tab).`,
      );
      d.mail = [];
    }
    if (d.freqIn.length)
      this.toast(
        s,
        `Friend request${d.freqIn.length > 1 ? 's' : ''} from ${d.freqIn.join(', ')} (ALLIES tab).`,
      );
    const A = this.armadaOf(d);
    if (A) {
      A.emptyT = 0;
      this.armadaChat(A, `${d.name} is online.`, d.name);
    }
    this.presence(d);
  },
  coopLogout(s) {
    const d = s.data;
    if (!d || this.solo) return;
    d.lastSeen = Date.now();
    if (s.duel) this.duelOut(s, 'left the Rift');
    if (s.trade) this.tradeCancel(s.trade, `${d.name} left the Rift.`);
    const A = this.armadaOf(d);
    if (A) this.armadaChat(A, `${d.name} went offline.`, d.name);
    setTimeout(() => this.presence(d), 50);
  },

  // ------------------------------------------------------------------ Captain Friends and DMs
  socialOp(s, m) {
    const d = this.socialInit(s.data);
    if (this.solo) return;
    const say = (msg) => this.toast(s, msg),
      name = cleanName(m.name),
      p = name ? this.db.get(name) : null;
    switch (m.op) {
      case 'add': {
        if (!p) return say(`No captain called ${name}.`);
        if (p === d) return say('That is you.');
        this.socialInit(p);
        if (this.has(d.friends, p.name)) return say(`${p.name} is already on your friends list.`);
        if (d.friends.length >= SOCIAL.friendsMax)
          return say(`Your friends list is full (${SOCIAL.friendsMax}).`);
        if (this.has(d.freqIn, p.name)) return this.socialOp(s, { op: 'accept', name: p.name });
        if (this.blocked(d, p.name)) d.blocks = this.drop(d.blocks, p.name);
        if (!this.has(d.freqOut, p.name)) d.freqOut.push(p.name);
        if (!this.blocked(p, d.name) && !this.has(p.freqIn, d.name)) {
          p.freqIn.push(d.name);
          const o = this.sessionOf(p.name);
          if (o) {
            this.toast(o, `${d.name} wants to add you as a friend (ALLIES tab).`);
            this.pushSocial(p.name);
          }
        }
        say(`Friend request sent to ${p.name}.`);
        break;
      }
      case 'accept': {
        if (!p || !this.has(d.freqIn, p.name)) return;
        this.socialInit(p);
        d.freqIn = this.drop(d.freqIn, p.name);
        p.freqOut = this.drop(p.freqOut, d.name);
        if (!this.has(d.friends, p.name)) d.friends.push(p.name);
        if (!this.has(p.friends, d.name)) p.friends.push(d.name);
        say(`${p.name} is now your friend.`);
        const o = this.sessionOf(p.name);
        if (o) this.toast(o, `${d.name} accepted your friend request.`);
        this.pushSocial(p.name);
        break;
      }
      case 'decline':
        if (p) {
          this.socialInit(p);
          d.freqIn = this.drop(d.freqIn, p.name);
          p.freqOut = this.drop(p.freqOut, d.name);
          this.pushSocial(p.name);
        }
        break;
      case 'cancel':
        if (p) {
          this.socialInit(p);
          d.freqOut = this.drop(d.freqOut, p.name);
          p.freqIn = this.drop(p.freqIn, d.name);
          this.pushSocial(p.name);
        }
        break;
      case 'remove':
        if (p) {
          this.socialInit(p);
          d.friends = this.drop(d.friends, p.name);
          p.friends = this.drop(p.friends, d.name);
          say(`${p.name} was removed from your friends.`);
          this.pushSocial(p.name);
        }
        break;
      case 'block': {
        if (!p || p === d) return;
        this.socialInit(p);
        if (!this.blocked(d, p.name)) d.blocks.push(p.name);
        d.friends = this.drop(d.friends, p.name);
        p.friends = this.drop(p.friends, d.name);
        d.freqIn = this.drop(d.freqIn, p.name);
        d.freqOut = this.drop(d.freqOut, p.name);
        p.freqIn = this.drop(p.freqIn, d.name);
        p.freqOut = this.drop(p.freqOut, d.name);
        say(
          `${p.name} is blocked: no messages, requests or invites from them, and you will not see their chat.`,
        );
        this.pushSocial(p.name);
        break;
      }
      case 'unblock':
        if (p) {
          d.blocks = this.drop(d.blocks, p.name);
          say(`${p.name} is unblocked.`);
        }
        break;
      case 'prefs':
        d.dmAll = !!m.dmAll;
        d.hideSys = !!m.hideSys;
        this.presence(d);
        break;
      case 'dm':
        return this.dm(s, p, m.msg);
      default:
        return;
    }
    this.db.touch();
    this.send(s, { t: 'social', social: this.socialPayload(d) });
  },
  dm(s, p, text) {
    const d = s.data,
      msg = String(text || '')
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, SOCIAL.dmLen);
    if (!msg) return;
    if (!p) return this.toast(s, 'No captain by that name.');
    if (p === d) return;
    const now = Date.now();
    if (now - (s.dmT || 0) < SOCIAL.dmGapMs) return;
    s.dmT = now;
    this.socialInit(p);
    const friends = this.has(d.friends, p.name),
      mates = d.armada && d.armada === p.armada;
    if (this.blocked(p, d.name) || (!friends && !mates && !p.dmAll))
      return this.toast(
        s,
        `${p.name} only takes messages from friends. Send a friend request first.`,
      );
    const note = { from: d.name, to: p.name, msg, at: now },
      o = this.sessionOf(p.name);
    if (o) this.send(o, { t: 'dm', ...note });
    else {
      p.mail.push(note);
      const mine = p.mail.filter((x) => x.from === d.name);
      if (mine.length > SOCIAL.mailMax) p.mail.splice(p.mail.indexOf(mine[0]), 1);
      this.db.touch();
    }
    this.send(s, { t: 'dm', ...note, sent: true, offline: !o });
  },

  // ------------------------------------------------------------------ the Armada
  armadaOf(d) {
    return d && d.armada ? this.db.world.armadas[d.armada] || null : null;
  },
  sameArmada(pa, pb) {
    const a = pa && pa.s && pa.s.data,
      b = pb && pb.s && pb.s.data;
    return !!(a && b && a.armada && a.armada === b.armada);
  },
  armadaChat(A, msg, skip) {
    this.broadcast(
      { t: 'chat', from: '', msg: `[Armada] ${msg}`, ch: 'armada' },
      (o) => o.data.armada === A.id && o.data.name !== skip,
    );
  },
  armadaPayload(d) {
    if (this.solo) return null;
    const W = this.db.world,
      A = this.armadaOf(d);
    const invites = Object.values(W.armadas)
      .filter((X) => X.invites && X.invites[this.db.key(d.name)] > Date.now())
      .map((X) => ({ id: X.id, name: X.name, leader: X.leader, n: X.members.length }));
    if (!A) return invites.length ? { none: true, invites } : null;
    const member = (n) => {
      const p = this.db.get(n),
        o = this.sessionOf(n);
      return {
        name: p ? p.name : n,
        online: !!o,
        sys: o && p && SYS[p.sys] ? SYS[p.sys].name : '',
        sysId: o && p ? p.sys : null,
        hull: p && !p.shipless && p.ship ? this.A.ships[p.ship.hull].name : '',
        landed: !!(o && !o.ent),
      };
    };
    return {
      id: A.id,
      name: A.name,
      leader: A.leader,
      members: A.members.map(member),
      pending: Object.entries(A.invites || {})
        .filter(([, t]) => t > Date.now())
        .map(([k]) => (this.db.get(k) || { name: k }).name),
      follow: !!d.armadaFollow,
      followingFlight: !!this.sessionOf(d.name)?.armadaFormationTarget,
      invites,
      max: ARMADA.max,
    };
  },
  armadaPush(A) {
    for (const n of A.members) this.pushSocial(n);
  },
  armadaOp(s, m) {
    if (this.solo) return this.toast(s, 'The Armada is for online games.');
    const d = s.data,
      W = this.db.world,
      A = this.armadaOf(d),
      say = (msg) => this.toast(s, msg);
    switch (m.op) {
      case 'form': {
        if (A) return say('Leave your Armada first.');
        let name = String(m.name || '').trim();
        if (!name) name = `${d.name.slice(0, 15)}'s Armada`;
        if (!ARMADA.nameRe.test(name))
          return say('An Armada name is 3-24 letters, numbers, spaces or dashes.');
        const id = 'a' + Date.now().toString(36) + this.nextCoopId++;
        W.armadas[id] = {
          id,
          name,
          leader: d.name,
          members: [d.name],
          invites: {},
          t: Date.now(),
          emptyT: 0,
        };
        d.armada = id;
        this.log(d, `Formed the Armada "${name}".`);
        say(`Armada "${name}" formed. Invite up to ${ARMADA.max - 1} more captains.`);
        break;
      }
      case 'invite': {
        const p = this.db.get(cleanName(m.name)),
          o = p && this.sessionOf(p.name);
        if (!p || p === d) return say('No captain by that name.');
        if (!o) return say(`${p.name} is not online.`);
        let A_ = A;
        if (!A_) {
          // inviting with no Armada forms one first
          const id = 'a' + Date.now().toString(36) + this.nextCoopId++;
          A_ = W.armadas[id] = {
            id,
            name: `${d.name.slice(0, 15)}'s Armada`,
            leader: d.name,
            members: [d.name],
            invites: {},
            t: Date.now(),
            emptyT: 0,
          };
          d.armada = id;
          this.log(d, `Formed the Armada "${A_.name}".`);
        }
        if (p.armada === A_.id) return say(`${p.name} is already in your Armada.`);
        this.socialInit(p);
        if (this.blocked(p, d.name)) return say(`${p.name} is not taking invites.`);
        const live = Object.values(A_.invites).filter((t) => t > Date.now()).length;
        if (A_.members.length + live >= ARMADA.max)
          return say(`An Armada holds ${ARMADA.max} captains.`);
        A_.invites[this.db.key(p.name)] = Date.now() + ARMADA.inviteMin * 60000;
        this.toast(o, `${d.name} invites you to the Armada "${A_.name}" (ALLIES tab).`);
        this.notify(o, 'Armada invite', `${d.name} invites you to "${A_.name}".`);
        this.pushSocial(p.name);
        say(`Invite sent to ${p.name}.`);
        break;
      }
      case 'accept': {
        const X = W.armadas[m.id];
        const k = this.db.key(d.name);
        if (!X || !(X.invites[k] > Date.now())) return say('That invite has lapsed.');
        if (A) return say('Leave your Armada first.');
        delete X.invites[k];
        if (X.members.length >= ARMADA.max) return say('That Armada is full.');
        X.members.push(d.name);
        d.armada = X.id;
        X.emptyT = 0;
        this.armadaChat(X, `${d.name} joined the Armada.`);
        this.log(d, `Joined the Armada "${X.name}".`);
        this.armadaPush(X);
        this.armadaRefresh(X);
        break;
      }
      case 'decline': {
        const X = W.armadas[m.id];
        if (X) {
          delete X.invites[this.db.key(d.name)];
          this.pushSocial(X.leader);
        }
        break;
      }
      case 'leave':
        if (A) this.armadaLeave(d, A, 'left the Armada');
        break;
      case 'kick': {
        if (!A || A.leader !== d.name) return;
        const p = this.db.get(cleanName(m.name));
        if (!p || p === d || p.armada !== A.id) return;
        this.armadaLeave(p, A, 'was removed from the Armada');
        break;
      }
      case 'lead': {
        if (!A || A.leader !== d.name) return;
        const p = this.db.get(cleanName(m.name));
        if (!p || p.armada !== A.id) return;
        A.leader = p.name;
        this.armadaChat(A, `${p.name} now leads the Armada.`);
        this.armadaPush(A);
        break;
      }
      case 'rename': {
        if (!A || A.leader !== d.name) return;
        const name = String(m.name || '').trim();
        if (!ARMADA.nameRe.test(name))
          return say('An Armada name is 3-24 letters, numbers, spaces or dashes.');
        A.name = name;
        this.armadaChat(A, `The Armada is now called "${name}".`);
        this.armadaPush(A);
        break;
      }
      case 'uninvite':
        if (A) {
          delete A.invites[this.db.key(cleanName(m.name))];
        }
        break;
      case 'rally': {
        // call every member to your system: their course is plotted
        if (!A) return;
        const now = Date.now();
        if (now - (s.rallyT || 0) < 20000) return say('Give them a moment before calling again.');
        s.rallyT = now;
        for (const n of A.members) {
          const o = this.sessionOf(n);
          if (o && o !== s) this.send(o, { t: 'rally', sys: d.sys, from: d.name });
        }
        this.armadaChat(A, `${d.name} calls the Armada to ${SYS[d.sys].name}.`);
        return;
      }
      case 'follow':
        d.armadaFollow = !!m.on;
        s.armadaFormationLeader = m.on && A ? A.leader : null;
        s.armadaFormationTarget = null;
        s.inputs = [];
        s.lastInput = {};
        say(
          m.on
            ? 'Following in V formation and following jumps. Manual flight or weapons input turns Follow off; Combat Assist takes priority.'
            : 'Follow the leader: off.',
        );
        break;
      default:
        return;
    }
    this.db.touch();
    this.you(s);
  },
  armadaLeave(p, A, why) {
    A.members = A.members.filter((n) => this.db.key(n) !== this.db.key(p.name));
    p.armada = null;
    p.armadaFollow = false;
    this.log(p, `Left the Armada "${A.name}".`);
    this.armadaChat(A, `${p.name} ${why}.`);
    const o = this.sessionOf(p.name);
    if (o) {
      this.toast(
        o,
        `You ${why === 'left the Armada' ? 'left' : 'were removed from'} the Armada "${A.name}".`,
      );
      this.you(o);
    }
    if (!A.members.length) {
      delete this.db.world.armadas[A.id];
      return;
    }
    if (this.db.key(A.leader) === this.db.key(p.name)) {
      A.leader = A.members[0];
      this.armadaChat(A, `${A.leader} now leads the Armada.`);
    }
    this.armadaPush(A);
    this.armadaRefresh(A);
  },
  armadaForget(name) {
    for (const A of Object.values(this.db.world.armadas || {}))
      if (A.members.some((n) => this.db.key(n) === this.db.key(name))) {
        const p = this.db.get(name);
        if (p) this.armadaLeave(p, A, 'left the Armada');
      }
  },
  // members who share a system with another member get the buff; called when anyone arrives, leaves or joins
  armadaRefresh(A) {
    for (const n of A.members) {
      const o = this.sessionOf(n);
      if (o && o.ent) o.ent.coopRe = this.armadaNear(o.data) ? ARMADA.buff.shieldRe : 1;
    }
  },
  armadaNear(d) {
    if (!d.armada) return 0;
    let n = 0;
    for (const o of this.sessions.values())
      if (o.data && o.data !== d && o.data.armada === d.armada && o.data.sys === d.sys && o.ent)
        n++;
    return n;
  },
  armadaBonus(d, b) {
    if (this.armadaNear(d)) b.armadaBounty = (b.armadaBounty || 1) * ARMADA.buff.bounty;
  },
  // bounty: the killer gets +5% with a member nearby; members in the system get kill credit and a share (paid on top)
  shareBounty(s, amount, space, npc) {
    const d = s.data;
    if (!d.armada) return;
    const near = [...this.sessions.values()].filter(
      (o) => o !== s && o.data && o.data.armada === d.armada && o.ent && o.data.sys === space.id,
    );
    if (!near.length) return;
    const ev = this.mods(space.id).armadaBounty || 1,
      extra = Math.round(amount * (ARMADA.buff.bounty - 1) * ev);
    d.credits += extra;
    d.stats.earned += extra;
    for (const o of near) {
      const k = Math.round(amount * ARMADA.share * ev);
      o.data.credits += k;
      o.data.stats.earned += k;
      this.goal(o, 'kills');
      for (const m of o.data.missions)
        if (m.type === 'patrol' && m.sys === space.id && !m.done) {
          m.got++;
          if (m.got >= m.need) {
            m.done = true;
            this.toast(o, 'Patrol complete. Land anywhere to collect your pay.');
          }
        }
      this.toast(o, `Armada share: ${credits(k)} credits from ${d.name}'s kill.`);
      this.you(o);
    }
  },
  // follow the leader: members in the same system who opted in get the leader's destination for their autopilot
  armadaLeaderJump(s, to) {
    const d = s.data,
      A = this.armadaOf(d);
    if (!A || this.db.key(A.leader) !== this.db.key(d.name)) return;
    for (const o of this.sessions.values())
      if (
        o !== s &&
        o.data &&
        o.data.armada === A.id &&
        o.data.armadaFollow &&
        o.data.sys === d.sys &&
        o.ent
      )
        this.send(o, { t: 'follow', to, leader: d.name });
  },

  // ------------------------------------------------------------------ trading between Personal Stations
  atOwnStation(d) {
    const p = STELLARS[d.stellar];
    return !!(p && p.site && this.ownSite(d, p));
  },
  tradeOp(s, m) {
    if (this.solo) return;
    const d = s.data,
      say = (msg) => this.toast(s, msg);
    if (!this.atOwnStation(d))
      return say('Trade from your own Personal Station: dock there first.');
    switch (m.op) {
      case 'open': {
        const p = this.db.get(cleanName(m.name)),
          o = p && this.sessionOf(p.name);
        if (!p || p === d) return say('No captain by that name.');
        if (!o) return say(`${p.name} is not online.`);
        if (!(this.has(this.socialInit(d).friends, p.name) || (d.armada && d.armada === p.armada)))
          return say('You can trade with friends and Armada members.');
        if (this.blocked(p, d.name)) return say(`${p.name} is not trading.`);
        if (s.trade || o.trade)
          return say(s.trade ? 'Finish your open trade first.' : `${p.name} is already trading.`);
        if (!this.atOwnStation(p))
          return say(`${p.name} needs to be docked at their own Personal Station.`);
        const id = 't' + this.nextCoopId++;
        this.trades[id] = {
          id,
          a: d.name,
          b: p.name,
          give: { [d.name]: {}, [p.name]: {} },
          lock: {},
          ok: {},
          t: Date.now(),
        };
        s.trade = id;
        o.trade = id;
        this.toast(o, `${d.name} opened a trade with you (ALLIES tab).`);
        this.tradePush(id);
        return;
      }
      case 'offer': {
        const T = this.trades[s.trade];
        if (!T) return;
        const g = this.tradeClean(d, m.give || {});
        if (typeof g === 'string') return say(g);
        if (JSON.stringify(g) !== JSON.stringify(T.give[d.name])) {
          T.give[d.name] = g;
          T.lock = {};
          T.ok = {};
        } // any real change unlocks both sides
        T.t = Date.now();
        this.tradePush(T.id);
        return;
      }
      case 'lock': {
        const T = this.trades[s.trade];
        if (!T) return;
        T.lock[d.name] = !!m.on;
        if (!m.on) T.ok = {};
        T.t = Date.now();
        this.tradePush(T.id);
        return;
      }
      case 'confirm': {
        const T = this.trades[s.trade];
        if (!T) return;
        if (!T.lock[T.a] || !T.lock[T.b]) return say('Both sides lock their offer first.');
        T.ok[d.name] = true;
        T.t = Date.now();
        if (T.ok[T.a] && T.ok[T.b]) return this.tradeDo(T);
        this.tradePush(T.id);
        return;
      }
      case 'cancel':
        if (s.trade) this.tradeCancel(s.trade, `${d.name} cancelled the trade.`);
        return;
    }
  },
  // what a captain can put up: credits, goods in the hold, crates, specialist blueprints and parts
  tradeClean(d, give) {
    const g = {},
      n = (v) => Math.max(0, Math.floor(+v || 0));
    let lines = 0;
    if (n(give.credits)) {
      if (n(give.credits) > d.credits) return 'You do not have that many credits.';
      g.credits = n(give.credits);
    }
    for (const [k, v] of Object.entries(give.items || {})) {
      const q = n(v);
      if (!q) continue;
      if (++lines > TRADE.maxLines) return `Up to ${TRADE.maxLines} different items per side.`;
      const [kind, a, b] = String(k).split(':');
      if (kind === 'cargo') {
        if ((d.cargo[a] || 0) < q) return 'You do not have that much in your hold.';
      } else if (kind === 'mat') {
        if (!MATERIALS.includes(a) || !(d.mats[a] && d.mats[a][+b] >= q))
          return 'You do not have those crates.';
      } else if (kind === 'bp') {
        if (!((d.bp || {})[a] >= q)) return 'You do not have those blueprints.';
      } else if (kind === 'parts') {
        if (!((d.parts || {})[a] >= q)) return 'You do not have those parts.';
      } else return 'That cannot be traded.';
      (g.items = g.items || {})[k] = q;
    }
    return g;
  },
  tradePush(id) {
    const T = this.trades[id];
    if (!T) return;
    for (const [me, them] of [
      [T.a, T.b],
      [T.b, T.a],
    ]) {
      const o = this.sessionOf(me);
      if (o)
        this.send(o, {
          t: 'trade2',
          trade: {
            id,
            with: them,
            mine: T.give[me],
            theirs: T.give[them],
            lock: { me: !!T.lock[me], them: !!T.lock[them] },
            ok: { me: !!T.ok[me], them: !!T.ok[them] },
            fee: TRADE.fee,
          },
        });
    }
  },
  tradeCancel(id, why) {
    const T = this.trades[id];
    if (!T) return;
    delete this.trades[id];
    for (const n of [T.a, T.b]) {
      const o = this.sessionOf(n);
      if (o) {
        o.trade = null;
        this.send(o, { t: 'trade2', trade: null });
        if (why) this.toast(o, why);
      }
    }
  },
  tradeDo(T) {
    const pa = this.db.get(T.a),
      pb = this.db.get(T.b),
      sa = this.sessionOf(T.a),
      sb = this.sessionOf(T.b);
    if (!pa || !pb || !sa || !sb || !this.atOwnStation(pa) || !this.atOwnStation(pb))
      return this.tradeCancel(
        T.id,
        'Trade cancelled: both captains must stay docked at their own stations.',
      );
    // check everything again at the moment of the swap, so a trade either completes fully or not at all
    for (const [p, g] of [
      [pa, T.give[T.a]],
      [pb, T.give[T.b]],
    ]) {
      const c = this.tradeClean(p, g);
      if (typeof c === 'string')
        return this.tradeCancel(
          T.id,
          `Trade cancelled: ${p.name} no longer has everything offered.`,
        );
    }
    const move = (from, to, g) => {
      const got = [];
      if (g.credits) {
        from.credits -= g.credits;
        const net = Math.round(g.credits * (1 - TRADE.fee));
        to.credits += net;
        got.push(`${credits(net)} credits`);
      }
      for (const [k, q] of Object.entries(g.items || {})) {
        const [kind, a, b] = k.split(':');
        if (kind === 'cargo') {
          from.cargo[a] -= q;
          if (!from.cargo[a]) delete from.cargo[a];
          to.storage = to.storage || {};
          to.storage[a] = (to.storage[a] || 0) + q;
          const C = COMMODITIES.find((c) => c.id === a);
          got.push(`${q} t ${C ? C.name : a}`);
        }
        if (kind === 'mat') {
          from.mats[a][+b] -= q;
          to.mats[a][+b] += q;
          got.push(`${q} ${a} ${GRADES[+b]}`);
        }
        if (kind === 'bp') {
          from.bp[a] -= q;
          to.bp = to.bp || {};
          to.bp[a] = (to.bp[a] || 0) + q;
          got.push(`${q} ${this.A.ships[a] ? this.A.ships[a].name : ''} blueprints`);
        }
        if (kind === 'parts') {
          from.parts[a] -= q;
          to.parts = to.parts || {};
          to.parts[a] = (to.parts[a] || 0) + q;
          got.push(`${q} ${this.A.ships[a] ? this.A.ships[a].name : ''} parts`);
        }
      }
      return got;
    };
    const toB = move(pa, pb, T.give[T.a]),
      toA = move(pb, pa, T.give[T.b]);
    // goods land in station storage, then go into the hold if there is room
    for (const [p, o] of [
      [pa, sa],
      [pb, sb],
    ]) {
      if (!p.storage) continue;
      const st = this.stats(p);
      let room = st.cargo - this.holdUsed(p);
      for (const [k, v] of Object.entries(p.storage)) {
        const q = Math.min(v, Math.max(0, room));
        if (q > 0) {
          p.cargo[k] = (p.cargo[k] || 0) + q;
          p.storage[k] -= q;
          room -= q;
          if (!p.storage[k]) delete p.storage[k];
        }
      }
    }
    const line = (got) => (got.length ? got.join(', ') : 'nothing');
    this.log(pa, `Traded with ${pb.name}: gave ${line(toB)}; got ${line(toA)}.`);
    this.log(pb, `Traded with ${pa.name}: gave ${line(toA)}; got ${line(toB)}.`);
    delete this.trades[T.id];
    sa.trade = sb.trade = null;
    for (const [o, got, w] of [
      [sa, toA, pb.name],
      [sb, toB, pa.name],
    ]) {
      this.send(o, { t: 'trade2', trade: null });
      this.toast(
        o,
        `Trade with ${w} complete. You received ${line(got)}.${got.some((x) => / t /.test(x)) ? ' Goods that did not fit your hold wait in exchange storage.' : ''}`,
      );
      this.you(o);
      this.landed(o);
    }
    this.db.touch();
  },

  // ------------------------------------------------------------------ duels and Armada Duels
  duelOf(s) {
    return s && s.duel ? this.duels[s.duel] || null : null;
  },
  duelSide(D, name) {
    const k = this.db.key(name);
    return D.sides.A.some((n) => this.db.key(n) === k)
      ? 'A'
      : D.sides.B.some((n) => this.db.key(n) === k)
        ? 'B'
        : null;
  },
  dueling(pa, pb) {
    const a = pa && pa.s,
      b = pb && pb.s;
    if (!a || !b || !a.duel || a.duel !== b.duel) return false;
    const D = this.duels[a.duel];
    if (!D || !D.on) return false;
    const x = this.duelSide(D, pa.name),
      y = this.duelSide(D, pb.name);
    return !!(
      x &&
      y &&
      x !== y &&
      !D.out.has(this.db.key(pa.name)) &&
      !D.out.has(this.db.key(pb.name))
    );
  },
  duelPayload(s) {
    const D = this.duelOf(s);
    if (!D) return s && s.duelInv ? { invite: s.duelInv } : null;
    const mine = this.duelSide(D, s.data.name),
      foes = D.sides[mine === 'A' ? 'B' : 'A'];
    return {
      id: D.id,
      armada: D.armada,
      on: D.on,
      with: foes.length === 1 ? foes[0] : null,
      foes,
      friends: D.sides[mine],
      out: [...D.out],
      until: D.until,
    };
  },
  duelOp(s, m) {
    if (this.solo) return;
    const d = s.data,
      say = (msg) => this.toast(s, msg);
    if (SYS[d.sys] && SYS[d.sys].arena) return say('Not in the Crucible.');
    switch (m.op) {
      case 'challenge': {
        const p = this.db.get(cleanName(m.name)),
          o = p && this.sessionOf(p.name);
        if (!o || p === d) return say('Challenge a captain who is online.');
        if (!s.ent || !o.ent || o.data.sys !== d.sys)
          return say('Both captains must be flying in the same system.');
        if (s.duel || o.duel) return say('One of you is already in a duel.');
        if (this.blocked(p, d.name)) return say(`${p.name} is not taking challenges.`);
        if (d.armada && d.armada === p.armada)
          return say('Armada members cannot duel each other. Leave the Armada first.');
        const armada = !!m.armada;
        if (armada) {
          const A = this.armadaOf(d),
            B = this.armadaOf(p);
          if (!A || !B)
            return say('An Armada Duel is between two Armadas: both captains need one.');
          if (
            this.db.key(A.leader) !== this.db.key(d.name) ||
            this.db.key(B.leader) !== this.db.key(p.name)
          )
            return say('Armada Duels are agreed between the two leaders.');
        }
        o.duelInv = { from: d.name, armada, t: Date.now() + DUEL.inviteSec * 1000 };
        this.toast(
          o,
          `${d.name} challenges ${armada ? 'your Armada to an Armada Duel' : 'you to a duel'}: a fight to disabled, nothing lost. Accept in the ALLIES tab within ${DUEL.inviteSec} seconds.`,
        );
        this.you(o);
        say(`Challenge sent to ${p.name}.`);
        return;
      }
      case 'accept': {
        const I = s.duelInv;
        if (!I || I.t < Date.now()) {
          s.duelInv = null;
          this.you(s);
          return say('That challenge has lapsed.');
        }
        const o = this.sessionOf(I.from);
        s.duelInv = null;
        if (!o || !o.ent || !s.ent || o.data.sys !== d.sys || o.duel || s.duel) {
          this.you(s);
          return say('The challenger is no longer here.');
        }
        let A = [o.data.name],
          B = [d.name];
        if (I.armada) {
          const XA = this.armadaOf(o.data),
            XB = this.armadaOf(d);
          if (!XA || !XB) return say('Both captains need their Armadas.');
          const here = (X) =>
            X.members
              .map((n) => this.sessionOf(n))
              .filter((x) => x && x.ent && x.data.sys === d.sys && !x.duel)
              .map((x) => x.data.name);
          A = here(XA);
          B = here(XB);
        }
        const id = 'd' + this.nextCoopId++;
        const D = (this.duels[id] = {
          id,
          armada: !!I.armada,
          sys: d.sys,
          sides: { A, B },
          out: new Set(),
          on: false,
          startT: Date.now() + 5000,
          until: Date.now() + 5000 + DUEL.minutes * 60000,
        });
        for (const n of [...A, ...B]) {
          const x = this.sessionOf(n);
          if (x) {
            x.duel = id;
            this.toast(
              x,
              `${D.armada ? 'ARMADA DUEL' : 'DUEL'}: ${A.join(', ')} against ${B.join(', ')}. Weapons free in 5 seconds. It ends at disabled; nobody loses a ship.`,
            );
            this.you(x);
          }
        }
        return;
      }
      case 'decline':
        if (s.duelInv) {
          const o = this.sessionOf(s.duelInv.from);
          if (o) this.toast(o, `${d.name} declined the challenge.`);
          s.duelInv = null;
          this.you(s);
        }
        return;
      case 'yield':
        if (s.duel) this.duelOut(s, 'yielded');
        return;
    }
  },
  // a hit in a duel: armor never drops below the floor; a captain brought down to it is out of the duel
  duelHit(srcRoot, ship, space) {
    const root = space.root(ship);
    if (!this.dueling(srcRoot.player, root.player)) return false;
    const floor = ship.st.armor * DUEL.floor;
    if (ship.armor > floor) return false;
    ship.armor = floor;
    if (ship === root) {
      const o = root.player.s;
      this.duelOut(o, `was disabled by ${srcRoot.player.name}`);
    }
    return true;
  },
  duelOut(s, why) {
    const D = this.duelOf(s);
    if (!D) return;
    const k = this.db.key(s.data.name);
    if (!D.out.has(k)) {
      D.out.add(k);
      this.duelSay(D, `${s.data.name} ${why}.`);
    }
    s.duel = null;
    this.you(s);
    const alive = (side) => D.sides[side].filter((n) => !D.out.has(this.db.key(n)));
    if (!alive('A').length || !alive('B').length) this.duelEnd(D, !alive('A').length ? 'B' : 'A');
  },
  duelSay(D, msg) {
    for (const n of [...D.sides.A, ...D.sides.B]) {
      const o = this.sessionOf(n);
      if (o) this.toast(o, msg);
    }
  },
  duelEnd(D, win) {
    if (!this.duels[D.id]) return;
    delete this.duels[D.id];
    const names = (side) => D.sides[side].join(', ');
    const msg = win
      ? `${D.armada ? 'Armada Duel' : 'Duel'} won by ${names(win)} against ${names(win === 'A' ? 'B' : 'A')}.`
      : `The ${D.armada ? 'Armada Duel' : 'duel'} between ${names('A')} and ${names('B')} ended in a draw.`;
    for (const n of [...D.sides.A, ...D.sides.B]) {
      const o = this.sessionOf(n);
      const p = this.db.get(n);
      if (p) {
        p.duels = p.duels || { w: 0, l: 0, d: 0 };
        const side = this.duelSide(D, n);
        p.duels[!win ? 'd' : side === win ? 'w' : 'l']++;
      }
      if (o) {
        if (o.duel === D.id) o.duel = null;
        this.toast(o, msg);
        this.you(o);
      }
    }
    this.broadcast(
      { t: 'chat', from: '', msg, ch: 'sys', sys: D.sys },
      (o) => o.data.sys === D.sys,
    );
  },
  duelTick() {
    const now = Date.now();
    for (const D of Object.values(this.duels)) {
      if (!D.on && now >= D.startT) {
        D.on = true;
        this.duelSay(D, 'Weapons free!');
        for (const n of [...D.sides.A, ...D.sides.B]) {
          const o = this.sessionOf(n);
          if (o) this.you(o);
        }
      }
      for (const n of [...D.sides.A, ...D.sides.B]) {
        if (D.out.has(this.db.key(n))) continue;
        const o = this.sessionOf(n);
        if (!o || !o.ent || o.data.sys !== D.sys) {
          if (o) this.duelOut(o, 'left the fight');
          else {
            D.out.add(this.db.key(n));
          }
        }
      }
      if (!this.duels[D.id]) continue;
      if (now > D.until) this.duelEnd(D, null);
    }
    for (const o of this.sessions.values())
      if (o.duelInv && o.duelInv.t < now) {
        o.duelInv = null;
        this.you(o);
      }
  },

  // ------------------------------------------------------------------ Armada rescue: a downed captain waits for a member to board them
  rescueHold(e, by, space) {
    if (this.solo || !e.player || space.sys.arena || e.rescueT) return false;
    const s = e.player.s,
      d = s && s.data;
    if (!d || !d.armada) return false;
    const mates = [...this.sessions.values()].filter(
      (o) => o !== s && o.data && o.data.armada === d.armada && o.ent && o.data.sys === d.sys,
    );
    if (!mates.length) return false;
    e.armor = 1;
    e.shield = 0;
    e.disabled = true;
    e.inp = { thrust: 0, turn: 0 };
    e.rescueT = space.t + RESCUE.windowSec;
    e.disT = space.t;
    this.toast(
      s,
      `Your ship is disabled! An Armada member can board you (B) within ${RESCUE.windowSec} seconds to patch you up. Nobody can fire on you meanwhile.`,
    );
    for (const o of mates) {
      this.toast(
        o,
        `${d.name} is disabled in this system! Fly alongside, target them and board (B) to patch them up within ${RESCUE.windowSec} seconds.`,
      );
      this.notify(o, 'Armada captain down', `${d.name} needs a rescue.`);
    }
    return true;
  },
  rescueBoard(s, t) {
    const d = s.data,
      e = s.ent,
      sp = this.spaces[d.sys];
    if (!t.rescueT || t.rescueT < sp.t || !t.player || !t.player.s || !t.player.s.data)
      return this.toast(s, 'Only disabled ships can be boarded.');
    if (!d.armada || t.player.s.data.armada !== d.armada)
      return this.toast(s, "Only their Armada can board a captain's ship.");
    const dist = Math.hypot(t.x - e.x, t.y - e.y),
      rel = Math.hypot(t.vx - e.vx, t.vy - e.vy);
    if (dist > Math.max(120, (t.st.size + e.st.size) * 0.5))
      return this.toast(s, 'Move alongside to board.');
    if (rel > 90) return this.toast(s, 'Match speed to board.');
    t.disabled = false;
    t.rescueT = 0;
    t.armor = Math.max(t.armor, t.st.armor * RESCUE.repair);
    t.graceT = sp.t + 4;
    d.stats.rescues = (d.stats.rescues || 0) + 1;
    this.officerXp(s, 20);
    this.toast(s, `You patched up ${t.player.name}'s ship.`);
    this.toast(t.player.s, `${d.name} boarded and patched you up. Back in the fight!`);
    this.log(d, `Rescued ${t.player.name} in ${SYS[d.sys].name}.`);
    this.log(t.player.s.data, `${d.name} rescued you in ${SYS[d.sys].name}.`);
    this.db.touch();
    this.you(s);
  },
  rescueTick() {
    for (const sp of Object.values(this.live))
      for (const e of [...sp.ships.values()])
        if (e.player && e.rescueT && sp.t > e.rescueT) {
          e.rescueT = 0;
          e.disabled = false;
          e.armor = 0;
          this.toast(e.player.s, 'Nobody reached you in time. The insurers take over.');
          sp.kill(e, null);
        }
  },

  // ------------------------------------------------------------------ co-op Holdout: helpers from the host's Armada
  holdoutHelpers(d, site) {
    if (this.solo || !d.armada) return [];
    return [...this.sessions.values()].filter(
      (o) =>
        o.data && o.data !== d && o.data.armada === d.armada && o.ent && o.data.sys === site.system,
    );
  },
  holdoutAnnounce(s) {
    const d = s.data,
      A = this.armadaOf(d);
    if (!A) return;
    const site = STELLARS[d.station.site];
    this.armadaChat(
      A,
      `${d.name} started a Station Holdout at their station in ${SYS[site.system].name}. Fly in to help: every helper shares the rewards.`,
      d.name,
    );
  },
  holdoutReward(host, H, n, won, R) {
    const site = STELLARS[host.station.site];
    for (const name of H.helpers || []) {
      const o = this.sessionOf(name);
      if (!o || !o.ent || o.data.sys !== site.system) continue;
      const d = o.data,
        cr = Math.round(R.credits * COOP_HOLDOUT.helperShare),
        mt = MATERIALS[Math.floor(Math.random() * 3)];
      d.credits += cr;
      d.stats.earned += cr;
      d.mats[mt][R.grade]++;
      d.bp = d.bp || {};
      const msg = `Holdout at ${host.name}'s station ${won ? 'WON' : `over after ${n} wave${n > 1 ? 's' : ''}`}. Your share: ${credits(cr)} cr and a ${mt} ${GRADES[R.grade]} crate.`;
      this.toast(o, msg);
      this.log(d, msg);
      this.you(o);
    }
  },

  // ------------------------------------------------------------------ Armada contracts (group kingpins in the old refits)
  coopOffers(p, d, r, near, win) {
    if (this.solo || !near.length) return [];
    const [sys, jumps] = near[Math.floor(r() * near.length)],
      S = SYS[sys];
    const nm = WARBAND.names[Math.floor(r() * WARBAND.names.length)],
      lead = WARBAND.leads[Math.floor(r() * WARBAND.leads.length)];
    if (!this.A.ships[lead]) return [];
    return [
      {
        id: `${p.id}-${win}-wb`,
        type: 'warband',
        title: `ARMADA CONTRACT: ${nm}`,
        sys,
        hull: lead,
        faction: 'hollow',
        targetName: nm,
        reward: Math.round(WARBAND.rewardBase + S.danger * WARBAND.rewardDanger + jumps * 4000),
        text: `${nm} deserted with a squadron of the Concord's old refits and holds the ${S.name} system in a ${this.A.ships[lead].name}. Too much for one ship: this contract needs an Armada of ${WARBAND.minMembers} or more. Every member who takes it gets an equal share and standing.`,
      },
    ];
  },
  warbandAccept(s, o) {
    const d = s.data,
      A = this.armadaOf(d);
    const on = A ? A.members.map((n) => this.sessionOf(n)).filter(Boolean) : [];
    if (!A || on.length < WARBAND.minMembers)
      return this.toast(
        s,
        `Armada contracts need an Armada with at least ${WARBAND.minMembers} captains online.`,
      );
    const takers = on.filter(
        (x) => x.data.missions.length < 6 && !x.data.missions.some((m) => m.id === o.id),
      ),
      share = Math.round(o.reward / Math.max(1, takers.length));
    for (const x of takers) {
      x.data.missions.push({ ...o, reward: share, owner: x.id, armada: A.id, taken: Date.now() });
      this.log(x.data, `Accepted (with the Armada): ${o.title}.`);
      if (x !== s)
        this.toast(
          x,
          `${d.name} took an Armada contract for everyone: ${o.title} in ${SYS[o.sys].name}. Your share: ${credits(share)} credits.`,
        );
      this.you(x);
    }
    this.toast(
      s,
      `Armada contract taken for ${takers.length} captain${takers.length > 1 ? 's' : ''}. Each share pays ${credits(share)} credits.`,
    );
    this.db.touch();
    this.landed(s);
  },
  warbandArrive(s, sp) {
    for (const m of s.data.missions) {
      if (m.type !== 'warband' || m.done || m.sys !== s.data.sys) continue;
      if ([...sp.ships.values()].some((x) => x.kingpin === m.id)) continue;
      const members = Math.max(1, (this.armadaNear(s.data) || 0) + 1),
        pct = (members - 1) * WARBAND.pctPerMember;
      const t = sp.spawnMissionTarget({ ...m, owner: s.id });
      t.kingpin = m.id;
      t.noDisable = true;
      if (pct) {
        t.st.shield *= 1 + pct / 100;
        t.st.armor *= 1 + pct / 100;
        t.shield = t.st.shield;
        t.armor = t.st.armor;
      }
      const n = WARBAND.guardsBase + members * WARBAND.guardsPerMember;
      for (let i = 0; i < n; i++) {
        const h = WARBAND.guards[i % WARBAND.guards.length],
          a = (i / n) * Math.PI * 2;
        const g = sp.makeShip({
          hull: h,
          faction: 'hollow',
          x: t.x + Math.cos(a) * 160,
          y: t.y + Math.sin(a) * 160,
          ai: 'escort',
          owner: t.id,
          name: `${m.targetName}'s ${this.A.ships[h].name}`,
          bonus: { shieldPct: pct * 0.5, armorPct: pct * 0.5 },
        });
        g.life = 1e9;
        g.kingpinGuard = m.id;
      }
      for (const o of this.sessions.values())
        if (o.data && o.data.sys === s.data.sys && o.data.missions.some((x) => x.id === m.id))
          this.toast(
            o,
            `${m.targetName} is here in a ${this.A.ships[m.hull].name}, with ${n} refitted escorts.`,
          );
    }
  },
  warbandDown(npc) {
    for (const o of this.sessions.values())
      if (o.data)
        for (const m of o.data.missions)
          if (m.type === 'warband' && m.id === npc.kingpin && !m.done) {
            m.done = true;
            this.toast(
              o,
              `Armada contract complete: ${m.targetName} is finished. Land anywhere to collect your ${credits(m.reward)} credits.`,
            );
            this.you(o);
          }
  },

  // ------------------------------------------------------------------ every two seconds
  coopTick() {
    if (this.solo) return;
    const now = Date.now(),
      W = this.db.world;
    for (const A of Object.values(W.armadas)) {
      for (const [k, t] of Object.entries(A.invites || {})) if (t < now) delete A.invites[k];
      const online = A.members.some((n) => this.sessionOf(n));
      if (online) A.emptyT = 0;
      else if (!A.emptyT) A.emptyT = now;
      else if (now - A.emptyT > ARMADA.idleMin * 60000) {
        for (const n of A.members) {
          const p = this.db.get(n);
          if (p && p.armada === A.id) {
            p.armada = null;
            p.armadaFollow = false;
          }
        }
        delete W.armadas[A.id];
        this.db.touch();
        continue;
      }
      this.armadaRefresh(A);
    }
    for (const T of Object.values(this.trades))
      if (now - T.t > TRADE.idleMin * 60000) this.tradeCancel(T.id, 'The trade timed out.');
    this.duelTick();
    this.rescueTick();
  },
};
