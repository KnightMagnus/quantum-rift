import type { ShipLoadout } from '../shared/rules.ts';
import type { CoopMessage, TradeOffer, TradeState, DuelState } from './coop-contracts.ts';
import type { ArmadaState } from './db.ts';
import type { Mission, StellarBody, PlayerReference } from './game.ts';
import type { Entity, Space } from './space.ts';
import type { SavedHoldoutRun } from './save-contracts.ts';
import type { CoopCapabilities } from './features.ts';
import type { PlayerData, Session } from './game.ts';

import {
  proposeContract,
  respondContract,
  cleanContractPlans,
  completeTeamContract,
} from './warband-consent.ts';
import { migrateCargoLots, planTake, moveLots } from '../shared/cargo-lots.ts';
// Quantum Rift: server feature operations:
//   Captain Friends (requests, online status, DMs with an offline mailbox, blocks)
//   the Armada: a short co-op group of up to five captains and their wingmates (private chat, no friendly fire,
//     small buffs, shared kill credit, follow-the-leader jumps). It replaces the 0.6 fleets.
//   trading between Personal Stations (both captains docked at their own station)
//   duels and Armada Duels (agreed fights that stop at disabled), and Armada rescue of a downed captain
//   co-op Holdout and Armada contracts (group kingpins in the old Mk II and Mk III refits)
//   the 2.6 save migration: refits, the Armada escort hulls, directives, fleets and territory were retired
import {
  SYS as systemsById,
  STELLARS,
  MATERIALS,
  GRADES,
  COMMODITIES,
  MK2_OF,
  MK3_OF,
  ARMADA_HULLS,
} from '../shared/galaxy.ts';
import { SOCIAL, ARMADA, TRADE, DUEL, RESCUE, COOP_HOLDOUT, WARBAND } from '../shared/coop.ts';
import { credits, makeLoadout, shipStats, allOutfits } from '../shared/rules.ts';

/** @import { PlayerData, Session } from './game.ts' */

/**
 * Clamps a numeric value between a minimum and maximum bound.
 * @param {number} value - Numeric value to clamp.
 * @param {number} firstValue - Minimum bound.
 * @param {number} secondValue - Maximum bound.
 * @returns {number} Clamped value.
 */
const _clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));

/**
 * Mapping from refit hull ID to base hull info and refit generation.
 * @type {Record<number, { base: number, mk: number, via?: number }>}
 */
const BASE_OF: Record<string | number, { base: number; mk: number; via?: number }> = {};
for (const [secondValue, message] of Object.entries(MK2_OF))
  BASE_OF[message] = { base: +secondValue, mk: 2 };
for (const [message, message3] of Object.entries(MK3_OF))
  BASE_OF[message3] = {
    base: BASE_OF[message] ? BASE_OF[message].base : +message,
    mk: 3,
    via: +message,
  };

/**
 * Credit refund valuation for retired unused directive tiers.
 * @type {Record<number, number>}
 */
const DIRECTIVE_VALUE: Record<string | number, number> = { 1: 90000, 2: 240000, 3: 600000 };

/**
 * Sanitizes and truncates a captain name to 20 characters.
 * @param {string} [count] - Raw name string.
 * @returns {string} Trimmed and sanitized name.
 */
const cleanName = (count?: string): string =>
  String(count || '')
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
  coopInit(this: CoopCapabilities) {
    const worldData = this.db.world;
    worldData.armadas = worldData.armadas || {};
    this.duels = this.duels || {};
    this.trades = this.trades || {};
    this.nextCoopId = this.nextCoopId || 1;
    // the 0.6 fleets are gone. Each fleet bank is shared out between its members, and the founder gets the fee back.
    if (worldData.fleets && Object.keys(worldData.fleets).length) {
      for (const legacyFleet of Object.values(worldData.fleets)) {
        const members = (legacyFleet.members || [])
            .map((count) => this.db.get(count))
            .filter((player): player is NonNullable<typeof player> => Boolean(player)),
          share = members.length ? Math.floor((legacyFleet.bank || 0) / members.length) : 0;
        for (const member of members) {
          member.credits += share;
          member.log = member.log || [];
          member.log.push({
            t: Date.now(),
            text: `Fleets were retired in 2.6 (the Armada replaces them). [${legacyFleet.tag}] ${legacyFleet.name} was wound up${share ? `: your share of the fleet bank, ${credits(share)} credits, was paid to you` : ''}.`,
          });
        }
        const playerAccount = this.db.get(legacyFleet.leader);
        if (playerAccount) {
          playerAccount.credits += 50000;
          playerAccount.log.push({
            t: Date.now(),
            text: 'The 50,000 credit fleet founding fee was refunded.',
          });
        }
      }
    }
    for (const entryKey of ['fleets', 'claims', 'cooldown'] as const) delete worldData[entryKey];
    this.db.touch();
  },
  /**
   * Migrates a player save to version 2.6, refunding retired refits, Armada escorts, and directives.
   * @param {PlayerData} playerData - Player save data.
   * @returns {void}
   */
  coopMigrate(this: CoopCapabilities, playerData: PlayerData) {
    if (playerData.v26) return;
    playerData.v26 = true;
    delete playerData.fleet;
    const allOutfits2 = allOutfits(this.A),
      notes = [];
    let refund = 0;
    const mats: Array<[string, number, number]> = [];
    // a refit goes back to its base hull; what the refit cost is refunded and outfits that no longer fit are bought back
    const revert = (ship: ShipLoadout) => {
      const secondValue = BASE_OF[ship.hull];
      if (!secondValue || !this.A.ships[secondValue.base]) return ship;
      const mkCost = (height: number | string, makeElement: boolean) =>
        Math.round(this.A.ships[height].cost * (makeElement ? 0.45 : 0.3));
      if (secondValue.mk === 3) {
        refund += mkCost(ship.hull, true) + mkCost(secondValue.via!, false);
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
      const name3 = this.A.ships[ship.hull].name,
        fresh = makeLoadout(this.A, secondValue.base, ship.name);
      fresh.uid = ship.uid;
      fresh.ammo = { ...fresh.ammo };
      for (const [identifier, count] of Object.entries(ship.outfits || {})) {
        let left = count - (fresh.outfits[identifier] || 0);
        while (left > 0) {
          fresh.outfits[identifier] = (fresh.outfits[identifier] || 0) + 1;
          const computedShipStats = shipStats(this.A, fresh)!;
          if (
            computedShipStats.free < 0 ||
            computedShipStats.guns > computedShipStats.maxGuns ||
            computedShipStats.turrets > computedShipStats.maxTurrets
          ) {
            fresh.outfits[identifier]--;
            if (!fresh.outfits[identifier]) delete fresh.outfits[identifier];
            break;
          }
          left--;
        }
        if (left > 0 && allOutfits2[identifier])
          refund += (allOutfits2[identifier].cost || 0) * left;
      }
      for (const [width, firstValue] of Object.entries(ship.ammo || {}))
        if (Object.keys(shipStats(this.A, fresh)!.weapons).includes(String(width)))
          fresh.ammo[width] = Math.max(fresh.ammo[width] || 0, firstValue);
      notes.push(
        `${ship.name || name3} (${name3}) is a ${this.A.ships[secondValue.base].name} again`,
      );
      return fresh;
    };
    if (!playerData.shipless && playerData.ship) playerData.ship = revert(playerData.ship);
    for (const storedShip of playerData.dock || []) storedShip.ship = revert(storedShip.ship);
    // the station's Armada escorts are retired: refunded at full price with their outfits
    const gone = (playerData.dock || []).filter((storedShip) =>
      ARMADA_HULLS.includes(storedShip.ship.hull as number),
    );
    for (const storedShip of gone) {
      refund += this.A.ships[storedShip.ship.hull].cost || 0;
      for (const [identifier, count] of Object.entries(storedShip.ship.outfits || {}))
        if (allOutfits2[identifier]) refund += (allOutfits2[identifier].cost || 0) * count;
      notes.push(`the ${this.A.ships[storedShip.ship.hull].name} stood down`);
    }
    if (gone.length) {
      playerData.dock = playerData.dock.filter((storedShip) => !gone.includes(storedShip));
      for (const savedDock of playerData.docks || []) {
        savedDock.wings = (savedDock.wings || []).map((savedDockWing) =>
          savedDockWing && gone.some((storedShip) => storedShip.ship.uid === savedDockWing.uid)
            ? null
            : savedDockWing,
        );
        if (gone.some((storedShip) => storedShip.ship.uid === savedDock.lead))
          savedDock.lead = null;
      }
    }
    if (
      !playerData.shipless &&
      playerData.ship &&
      ARMADA_HULLS.includes(playerData.ship.hull as number)
    ) {
      refund += this.A.ships[playerData.ship.hull].cost;
      playerData.ship = makeLoadout(this.A, 703, playerData.ship.name);
      notes.push('your Armada escort ship stood down (you fly a Gnat Skiff for now)');
    }
    // unused directives are bought back at their old store price
    if (playerData.directives) {
      for (const [time, count] of Object.entries(playerData.directives))
        if (count > 0) {
          refund += (DIRECTIVE_VALUE[time] || 0) * count;
          notes.push(`${count} unused directive${count > 1 ? 's' : ''} bought back`);
        }
      delete playerData.directives;
    }
    if (playerData.mats)
      for (const [message, game, count] of mats)
        if (playerData.mats[message]) playerData.mats[message][game] += count;
    if (refund || notes.length) {
      playerData.credits += refund;
      playerData.log = playerData.log || [];
      playerData.log.push({
        t: Date.now(),
        text: `2.6: refits, the Armada escorts and directives were retired. ${notes.join('; ')}.${refund ? ` Refunded ${credits(refund)} credits${mats.length ? ' and the refit materials' : ''}.` : ''}`,
      });
    }
  },

  // ------------------------------------------------------------------ helpers
  /**
   * Finds an active player session matching the specified captain name.
   * @param {string} name - Captain name to look up.
   * @returns {Session | null} Active session or null if not online.
   */
  sessionOf(this: CoopCapabilities, name: string) {
    const entryKey = this.db.key(name);
    for (const session of this.sessions.values())
      if (session.data && this.db.key(session.data.name) === entryKey) return session;
    return null;
  },
  /**
   * Ensures social data structures (friends, requests, blocks, mailbox) exist on a player profile.
   * @param {PlayerData} playerData - Player profile data.
   * @returns {PlayerData} The initialized player profile data.
   */
  socialInit(this: CoopCapabilities, playerData: PlayerData) {
    playerData.friends = playerData.friends || [];
    playerData.freqIn = playerData.freqIn || [];
    playerData.freqOut = playerData.freqOut || [];
    playerData.blocks = playerData.blocks || [];
    playerData.mail = playerData.mail || [];
    return playerData;
  },
  /**
   * Checks if a case-insensitive captain name is present in a list of names.
   * @param {string[]} list - List of captain names.
   * @param {string} name - Captain name to check.
   * @returns {boolean} True if the name is found in the list.
   */
  has(this: CoopCapabilities, list: string[], name: string) {
    const entryKey = this.db.key(name);
    return list.some((count) => this.db.key(count) === entryKey);
  },
  /**
   * Removes all entries matching a captain name from a list of names.
   * @param {string[]} list - List of captain names.
   * @param {string} name - Captain name to remove.
   * @returns {string[]} New list with matching names removed.
   */
  drop(this: CoopCapabilities, list: string[], name: string) {
    const entryKey = this.db.key(name);
    return list.filter((count) => this.db.key(count) !== entryKey);
  },
  /**
   * Checks whether a captain is blocked by the target player profile.
   * @param {PlayerData} [playerData] - Player profile data.
   * @param {string} name - Captain name to check against blocks.
   * @returns {boolean} True if the captain is blocked.
   */
  blocked(this: CoopCapabilities, playerData: PlayerData | null | undefined, name: string) {
    return !!(playerData && playerData.blocks && this.has(playerData.blocks, name));
  },
  /**
   * Determines the online, away, or offline status of a captain.
   * @param {string} name - Captain name to check.
   * @returns {'online'|'away'|'offline'} Captain presence status.
   */
  statusOf(this: CoopCapabilities, name: string) {
    const session = this.sessionOf(name);
    if (!session) return 'offline';
    return Date.now() - (session.actT || 0) > SOCIAL.awayMin * 60000 ? 'away' : 'online';
  },
  /**
   * Sends updated player state payload to an active captain session if online.
   * @param {string} name - Captain name to refresh.
   * @returns {void}
   */
  refreshPlayer(this: CoopCapabilities, name: string) {
    const session = this.sessionOf(name);
    if (session) this.you(session);
  },
  /**
   * Pushes the latest social and Armada payload to an active captain session.
   * @param {string} name - Captain name to push social data to.
   * @returns {void}
   */
  pushSocial(this: CoopCapabilities, name: string) {
    const session = this.sessionOf(name);
    if (session)
      this.send(session, {
        t: 'social',
        social: this.socialPayload(session.data),
        armada: this.armadaPayload(session.data),
      });
  },
  socialPayload(this: CoopCapabilities, playerData: PlayerData) {
    if (this.solo) return null;
    this.socialInit(playerData);
    const rowIndex = (count: string) => {
      const playerAccount = this.db.get(count);
      if (!playerAccount) return null;
      const statusOf2 = this.statusOf(count);
      return {
        name: playerAccount.name,
        status: statusOf2,
        sys:
          statusOf2 !== 'offline' && !playerAccount.hideSys && systemsById[playerAccount.sys]
            ? systemsById[playerAccount.sys].name
            : '',
        sysId: statusOf2 !== 'offline' && !playerAccount.hideSys ? playerAccount.sys : null,
        last: playerAccount.lastSeen || 0,
      };
    };
    return {
      friends: playerData.friends
        .map(rowIndex)
        .filter((rowIndex): rowIndex is NonNullable<typeof rowIndex> => Boolean(rowIndex))
        .sort(
          (firstValue, secondValue) =>
            ((firstValue.status === 'offline') as unknown as number) -
              ((secondValue.status === 'offline') as unknown as number) ||
            firstValue.name.localeCompare(secondValue.name),
        ),
      inReq: playerData.freqIn.slice(),
      outReq: playerData.freqOut.slice(),
      blocks: playerData.blocks.slice(),
      dmAll: !!playerData.dmAll,
      hideSys: !!playerData.hideSys,
    };
  },
  // tell a captain's online friends (and Armada) that their status changed
  presence(this: CoopCapabilities, playerData: PlayerData) {
    if (this.solo || !playerData) return;
    for (const session of this.sessions.values())
      if (
        session.data &&
        session.data !== playerData &&
        ((session.data.friends && this.has(session.data.friends, playerData.name)) ||
          (playerData.armada && session.data.armada === playerData.armada))
      )
        this.pushSocial(session.data.name);
  },
  coopLogin(this: CoopCapabilities, session: Session) {
    const playerData = this.socialInit(session.data);
    session.actT = Date.now();
    playerData.armadaFollow = false; // Flight consent never survives reconnects.
    session.armadaFormationLeader = null;
    if (this.solo) return;
    if (playerData.armada && !this.db.world.armadas[playerData.armada]) playerData.armada = null;
    if (playerData.mail.length) {
      this.send(session, { t: 'dms', list: playerData.mail });
      this.toast(
        session,
        `${playerData.mail.length} message${playerData.mail.length > 1 ? 's' : ''} arrived while you were away (ALLIES tab).`,
      );
      playerData.mail = [];
    }
    if (playerData.freqIn.length)
      this.toast(
        session,
        `Friend request${playerData.freqIn.length > 1 ? 's' : ''} from ${playerData.freqIn.join(', ')} (ALLIES tab).`,
      );
    const armadaState = this.armadaOf(playerData);
    if (armadaState) {
      armadaState.emptyT = 0;
      this.armadaChat(armadaState, `${playerData.name} is online.`, playerData.name);
    }
    this.presence(playerData);
  },
  coopLogout(this: CoopCapabilities, session: Session) {
    cleanContractPlans(this, session);
    const playerData = session.data;
    if (!playerData || this.solo) return;
    playerData.lastSeen = Date.now();
    if (session.duel) this.duelOut(session, 'left the Rift');
    if (session.trade) this.tradeCancel(session.trade, `${playerData.name} left the Rift.`);
    const armadaState = this.armadaOf(playerData);
    if (armadaState)
      this.armadaChat(armadaState, `${playerData.name} went offline.`, playerData.name);
    setTimeout(() => this.presence(playerData), 50);
  },

  // ------------------------------------------------------------------ Captain Friends and DMs
  socialOp(this: CoopCapabilities, session2: Session, coopMessage: CoopMessage) {
    const playerData = this.socialInit(session2.data);
    if (this.solo) return;
    const announce = (message: string) => this.toast(session2, message),
      name = cleanName(coopMessage.name),
      playerAccount = name ? this.db.get(name) : null;
    switch (coopMessage.op) {
      case 'add': {
        if (!playerAccount) return announce(`No captain called ${name}.`);
        if (playerAccount === playerData) return announce('That is you.');
        this.socialInit(playerAccount);
        if (this.has(playerData.friends, playerAccount.name))
          return announce(`${playerAccount.name} is already on your friends list.`);
        if (playerData.friends.length >= SOCIAL.friendsMax)
          return announce(`Your friends list is full (${SOCIAL.friendsMax}).`);
        if (this.has(playerData.freqIn, playerAccount.name))
          return this.socialOp(session2, { op: 'accept', name: playerAccount.name });
        if (this.blocked(playerData, playerAccount.name))
          playerData.blocks = this.drop(playerData.blocks, playerAccount.name);
        if (!this.has(playerData.freqOut, playerAccount.name))
          playerData.freqOut.push(playerAccount.name);
        if (
          !this.blocked(playerAccount, playerData.name) &&
          !this.has(playerAccount.freqIn, playerData.name)
        ) {
          playerAccount.freqIn.push(playerData.name);
          const session = this.sessionOf(playerAccount.name);
          if (session) {
            this.toast(session, `${playerData.name} wants to add you as a friend (ALLIES tab).`);
            this.pushSocial(playerAccount.name);
          }
        }
        announce(`Friend request sent to ${playerAccount.name}.`);
        break;
      }
      case 'accept': {
        if (!playerAccount || !this.has(playerData.freqIn, playerAccount.name)) return;
        this.socialInit(playerAccount);
        playerData.freqIn = this.drop(playerData.freqIn, playerAccount.name);
        playerAccount.freqOut = this.drop(playerAccount.freqOut, playerData.name);
        if (!this.has(playerData.friends, playerAccount.name))
          playerData.friends.push(playerAccount.name);
        if (!this.has(playerAccount.friends, playerData.name))
          playerAccount.friends.push(playerData.name);
        announce(`${playerAccount.name} is now your friend.`);
        const session = this.sessionOf(playerAccount.name);
        if (session) this.toast(session, `${playerData.name} accepted your friend request.`);
        this.pushSocial(playerAccount.name);
        break;
      }
      case 'decline':
        if (playerAccount) {
          this.socialInit(playerAccount);
          playerData.freqIn = this.drop(playerData.freqIn, playerAccount.name);
          playerAccount.freqOut = this.drop(playerAccount.freqOut, playerData.name);
          this.pushSocial(playerAccount.name);
        }
        break;
      case 'cancel':
        if (playerAccount) {
          this.socialInit(playerAccount);
          playerData.freqOut = this.drop(playerData.freqOut, playerAccount.name);
          playerAccount.freqIn = this.drop(playerAccount.freqIn, playerData.name);
          this.pushSocial(playerAccount.name);
        }
        break;
      case 'remove':
        if (playerAccount) {
          this.socialInit(playerAccount);
          playerData.friends = this.drop(playerData.friends, playerAccount.name);
          playerAccount.friends = this.drop(playerAccount.friends, playerData.name);
          announce(`${playerAccount.name} was removed from your friends.`);
          this.pushSocial(playerAccount.name);
        }
        break;
      case 'block': {
        if (!playerAccount || playerAccount === playerData) return;
        this.socialInit(playerAccount);
        if (!this.blocked(playerData, playerAccount.name))
          playerData.blocks.push(playerAccount.name);
        playerData.friends = this.drop(playerData.friends, playerAccount.name);
        playerAccount.friends = this.drop(playerAccount.friends, playerData.name);
        playerData.freqIn = this.drop(playerData.freqIn, playerAccount.name);
        playerData.freqOut = this.drop(playerData.freqOut, playerAccount.name);
        playerAccount.freqIn = this.drop(playerAccount.freqIn, playerData.name);
        playerAccount.freqOut = this.drop(playerAccount.freqOut, playerData.name);
        announce(
          `${playerAccount.name} is blocked: no messages, requests or invites from them, and you will not see their chat.`,
        );
        this.pushSocial(playerAccount.name);
        break;
      }
      case 'unblock':
        if (playerAccount) {
          playerData.blocks = this.drop(playerData.blocks, playerAccount.name);
          announce(`${playerAccount.name} is unblocked.`);
        }
        break;
      case 'prefs':
        playerData.dmAll = !!coopMessage.dmAll;
        playerData.hideSys = !!coopMessage.hideSys;
        this.presence(playerData);
        break;
      case 'dm':
        return this.dm(session2, playerAccount, coopMessage.msg);
      default:
        return;
    }
    this.db.touch();
    this.send(session2, { t: 'social', social: this.socialPayload(playerData) });
  },
  dm(
    this: CoopCapabilities,
    session2: Session,
    playerData: PlayerData | null | undefined,
    text?: string,
  ) {
    const playerData3 = session2.data,
      slice2 = String(text || '')
        // oxlint-disable-next-line no-control-regex -- Reject or sanitize control characters in player text.
        .replace(/[\u0000-\u001f]/g, ' ')
        .trim()
        .slice(0, SOCIAL.dmLen);
    if (!slice2) return;
    if (!playerData) return this.toast(session2, 'No captain by that name.');
    if (playerData === playerData3) return;
    const currentTime = Date.now();
    if (currentTime - (session2.dmT || 0) < SOCIAL.dmGapMs) return;
    session2.dmT = currentTime;
    this.socialInit(playerData);
    const friends = this.has(playerData3.friends, playerData.name),
      mates = playerData3.armada && playerData3.armada === playerData.armada;
    if (this.blocked(playerData, playerData3.name) || (!friends && !mates && !playerData.dmAll))
      return this.toast(
        session2,
        `${playerData.name} only takes messages from friends. Send a friend request first.`,
      );
    const note = { from: playerData3.name, to: playerData.name, msg: slice2, at: currentTime },
      session = this.sessionOf(playerData.name);
    if (session) this.send(session, { t: 'dm', ...note });
    else {
      playerData.mail.push(note);
      const mine = playerData.mail.filter((savedMail) => savedMail.from === playerData3.name);
      if (mine.length > SOCIAL.mailMax) playerData.mail.splice(playerData.mail.indexOf(mine[0]), 1);
      this.db.touch();
    }
    this.send(session2, { t: 'dm', ...note, sent: true, offline: !session });
  },

  // ------------------------------------------------------------------ the Armada
  armadaOf(this: CoopCapabilities, distance: Pick<PlayerData, 'armada'> | null | undefined) {
    return distance && distance.armada ? this.db.world.armadas[distance.armada] || null : null;
  },
  sameArmada(
    this: CoopCapabilities,
    playerReference: PlayerReference | null,
    playerReference2: PlayerReference | null,
  ) {
    const playerData = playerReference && playerReference.s && playerReference.s.data,
      playerData3 = playerReference2 && playerReference2.s && playerReference2.s.data;
    return !!(
      playerData &&
      playerData3 &&
      playerData.armada &&
      playerData.armada === playerData3.armada
    );
  },
  armadaChat(this: CoopCapabilities, armadaState: ArmadaState, message: string, skip?: string) {
    this.broadcast(
      { t: 'chat', from: '', msg: `[Armada] ${message}`, ch: 'armada' },
      (session) => session.data.armada === armadaState.id && session.data.name !== skip,
    );
  },
  armadaPayload(this: CoopCapabilities, playerData: PlayerData) {
    if (this.solo) return null;
    const worldData = this.db.world,
      armadaState = this.armadaOf(playerData);
    const invites = Object.values(worldData.armadas)
      .filter(
        (armadaState) =>
          armadaState.invites && armadaState.invites[this.db.key(playerData.name)] > Date.now(),
      )
      .map((armadaState) => ({
        id: armadaState.id,
        name: armadaState.name,
        leader: armadaState.leader,
        n: armadaState.members.length,
      }));
    if (!armadaState) return invites.length ? { none: true, invites } : null;
    const member = (count: string) => {
      const playerAccount = this.db.get(count),
        session = this.sessionOf(count);
      return {
        name: playerAccount ? playerAccount.name : count,
        online: !!session,
        sys:
          session && playerAccount && systemsById[playerAccount.sys]
            ? systemsById[playerAccount.sys].name
            : '',
        sysId: session && playerAccount ? playerAccount.sys : null,
        hull:
          playerAccount && !playerAccount.shipless && playerAccount.ship
            ? this.A.ships[playerAccount.ship.hull].name
            : '',
        landed: !!(session && !session.ent),
        jobSlots: playerAccount ? Math.max(0, 6 - playerAccount.missions.length) : 0,
      };
    };
    return {
      id: armadaState.id,
      name: armadaState.name,
      leader: armadaState.leader,
      members: armadaState.members.map(member),
      pending: Object.entries(armadaState.invites || {})
        .filter(([, time]) => time > Date.now())
        .map(([entryKey]) => (this.db.get(entryKey) || { name: entryKey }).name),
      follow: !!playerData.armadaFollow,
      followingFlight: !!this.sessionOf(playerData.name)?.armadaFormationTarget,
      invites,
      max: ARMADA.max,
    };
  },
  armadaPush(this: CoopCapabilities, armadaState: ArmadaState) {
    for (const member of armadaState.members) this.pushSocial(member);
  },
  armadaOp(this: CoopCapabilities, session2: Session, coopMessage: CoopMessage) {
    if (
      ['contractReady', 'contractDecline', 'contractStart', 'contractCancel'].includes(
        coopMessage.op,
      )
    )
      return respondContract(this, session2, coopMessage);
    if (this.solo) return this.toast(session2, 'The Armada is for online games.');
    const playerData = session2.data,
      worldData = this.db.world,
      armadaState = this.armadaOf(playerData),
      announce = (message: string) => this.toast(session2, message);
    switch (coopMessage.op) {
      case 'form': {
        if (armadaState) return announce('Leave your Armada first.');
        let name = String(coopMessage.name || '').trim();
        if (!name) name = `${playerData.name.slice(0, 15)}'s Armada`;
        if (!ARMADA.nameRe.test(name))
          return announce('An Armada name is 3-24 letters, numbers, spaces or dashes.');
        const identifier = 'a' + Date.now().toString(36) + this.nextCoopId++;
        worldData.armadas[identifier] = {
          id: identifier,
          name,
          leader: playerData.name,
          members: [playerData.name],
          invites: {},
          t: Date.now(),
          emptyT: 0,
        };
        playerData.armada = identifier;
        this.log(playerData, `Formed the Armada "${name}".`);
        announce(`Armada "${name}" formed. Invite up to ${ARMADA.max - 1} more captains.`);
        break;
      }
      case 'invite': {
        const playerAccount = this.db.get(cleanName(coopMessage.name)),
          session = playerAccount && this.sessionOf(playerAccount.name);
        if (!playerAccount || playerAccount === playerData)
          return announce('No captain by that name.');
        if (!session) return announce(`${playerAccount.name} is not online.`);
        let armadaState2 = armadaState;
        if (!armadaState2) {
          // inviting with no Armada forms one first
          const identifier = 'a' + Date.now().toString(36) + this.nextCoopId++;
          armadaState2 = worldData.armadas[identifier] = {
            id: identifier,
            name: `${playerData.name.slice(0, 15)}'s Armada`,
            leader: playerData.name,
            members: [playerData.name],
            invites: {},
            t: Date.now(),
            emptyT: 0,
          };
          playerData.armada = identifier;
          this.log(playerData, `Formed the Armada "${armadaState2.name}".`);
        }
        if (playerAccount.armada === armadaState2.id)
          return announce(`${playerAccount.name} is already in your Armada.`);
        this.socialInit(playerAccount);
        if (this.blocked(playerAccount, playerData.name))
          return announce(`${playerAccount.name} is not taking invites.`);
        const live = Object.values(armadaState2.invites).filter((time) => time > Date.now()).length;
        if (armadaState2.members.length + live >= ARMADA.max)
          return announce(`An Armada holds ${ARMADA.max} captains.`);
        armadaState2.invites[this.db.key(playerAccount.name)] =
          Date.now() + ARMADA.inviteMin * 60000;
        this.toast(
          session,
          `${playerData.name} invites you to the Armada "${armadaState2.name}" (ALLIES tab).`,
        );
        this.notify(
          session,
          'Armada invite',
          `${playerData.name} invites you to "${armadaState2.name}".`,
        );
        this.pushSocial(playerAccount.name);
        announce(`Invite sent to ${playerAccount.name}.`);
        break;
      }
      case 'accept': {
        const armadaState3 = worldData.armadas[coopMessage.id!];
        const entryKey = this.db.key(playerData.name);
        if (!armadaState3 || !(armadaState3.invites[entryKey] > Date.now()))
          return announce('That invite has lapsed.');
        if (armadaState) return announce('Leave your Armada first.');
        delete armadaState3.invites[entryKey];
        if (armadaState3.members.length >= ARMADA.max) return announce('That Armada is full.');
        armadaState3.members.push(playerData.name);
        playerData.armada = armadaState3.id;
        armadaState3.emptyT = 0;
        this.armadaChat(armadaState3, `${playerData.name} joined the Armada.`);
        this.log(playerData, `Joined the Armada "${armadaState3.name}".`);
        this.armadaPush(armadaState3);
        this.armadaRefresh(armadaState3);
        break;
      }
      case 'decline': {
        const armadaState = worldData.armadas[coopMessage.id!];
        if (armadaState) {
          delete armadaState.invites[this.db.key(playerData.name)];
          this.pushSocial(armadaState.leader);
        }
        break;
      }
      case 'leave':
        if (armadaState) this.armadaLeave(playerData, armadaState, 'left the Armada');
        break;
      case 'kick': {
        if (!armadaState || armadaState.leader !== playerData.name) return;
        const playerAccount = this.db.get(cleanName(coopMessage.name));
        if (
          !playerAccount ||
          playerAccount === playerData ||
          playerAccount.armada !== armadaState.id
        )
          return;
        this.armadaLeave(playerAccount, armadaState, 'was removed from the Armada');
        break;
      }
      case 'lead': {
        if (!armadaState || armadaState.leader !== playerData.name) return;
        const playerAccount = this.db.get(cleanName(coopMessage.name));
        if (!playerAccount || playerAccount.armada !== armadaState.id) return;
        armadaState.leader = playerAccount.name;
        this.armadaChat(armadaState, `${playerAccount.name} now leads the Armada.`);
        this.armadaPush(armadaState);
        break;
      }
      case 'rename': {
        if (!armadaState || armadaState.leader !== playerData.name) return;
        const name = String(coopMessage.name || '').trim();
        if (!ARMADA.nameRe.test(name))
          return announce('An Armada name is 3-24 letters, numbers, spaces or dashes.');
        armadaState.name = name;
        this.armadaChat(armadaState, `The Armada is now called "${name}".`);
        this.armadaPush(armadaState);
        break;
      }
      case 'uninvite':
        if (armadaState) {
          delete armadaState.invites[this.db.key(cleanName(coopMessage.name))];
        }
        break;
      case 'rally': {
        // call every member to your system: their course is plotted
        if (!armadaState) return;
        const currentTime = Date.now();
        if (currentTime - (session2.rallyT || 0) < 20000)
          return announce('Give them a moment before calling again.');
        session2.rallyT = currentTime;
        for (const member of armadaState.members) {
          const session = this.sessionOf(member);
          if (session && session !== session2)
            this.send(session, { t: 'rally', sys: playerData.sys, from: playerData.name });
        }
        this.armadaChat(
          armadaState,
          `${playerData.name} calls the Armada to ${systemsById[playerData.sys].name}.`,
        );
        return;
      }
      case 'follow':
        playerData.armadaFollow = !!coopMessage.on;
        session2.armadaFormationLeader = coopMessage.on && armadaState ? armadaState.leader : null;
        session2.armadaFormationTarget = null;
        session2.inputs = [];
        session2.lastInput = {};
        announce(
          coopMessage.on
            ? 'Following in V formation and following jumps. Manual flight or weapons input turns Follow off; Combat Assist takes priority.'
            : 'Follow the leader: off.',
        );
        break;
      default:
        return;
    }
    this.db.touch();
    this.you(session2);
  },
  armadaLeave(
    this: CoopCapabilities,
    playerData: PlayerData,
    armadaState: ArmadaState,
    reason: string,
  ) {
    armadaState.members = armadaState.members.filter(
      (count) => this.db.key(count) !== this.db.key(playerData.name),
    );
    playerData.armada = null;
    playerData.armadaFollow = false;
    this.log(playerData, `Left the Armada "${armadaState.name}".`);
    this.armadaChat(armadaState, `${playerData.name} ${reason}.`);
    const session = this.sessionOf(playerData.name);
    if (session) {
      this.toast(
        session,
        `You ${reason === 'left the Armada' ? 'left' : 'were removed from'} the Armada "${armadaState.name}".`,
      );
      this.you(session);
    }
    if (!armadaState.members.length) {
      delete this.db.world.armadas[armadaState.id];
      return;
    }
    if (this.db.key(armadaState.leader) === this.db.key(playerData.name)) {
      armadaState.leader = armadaState.members[0];
      this.armadaChat(armadaState, `${armadaState.leader} now leads the Armada.`);
    }
    this.armadaPush(armadaState);
    this.armadaRefresh(armadaState);
  },
  armadaForget(this: CoopCapabilities, name: string) {
    for (const armadaState of Object.values(this.db.world.armadas || {}))
      if (armadaState.members.some((count) => this.db.key(count) === this.db.key(name))) {
        const playerAccount = this.db.get(name);
        if (playerAccount) this.armadaLeave(playerAccount, armadaState, 'left the Armada');
      }
  },
  // members who share a system with another member get the buff; called when anyone arrives, leaves or joins
  armadaRefresh(this: CoopCapabilities, armadaState: ArmadaState) {
    for (const member of armadaState.members) {
      const session = this.sessionOf(member);
      if (session && session.ent)
        session.ent.coopRe = this.armadaNear(session.data) ? ARMADA.buff.shieldRe : 1;
    }
  },
  armadaNear(this: CoopCapabilities, playerData: PlayerData) {
    if (!playerData.armada) return 0;
    let count = 0;
    for (const session of this.sessions.values())
      if (
        session.data &&
        session.data !== playerData &&
        session.data.armada === playerData.armada &&
        session.data.sys === playerData.sys &&
        session.ent
      )
        count++;
    return count;
  },
  armadaBonus(this: CoopCapabilities, playerData: PlayerData, secondValue: Record<string, number>) {
    if (this.armadaNear(playerData))
      secondValue.armadaBounty = (secondValue.armadaBounty || 1) * ARMADA.buff.bounty;
  },
  // bounty: the killer gets +5% with a member nearby; members in the system get kill credit and a share (paid on top)
  shareBounty(
    this: CoopCapabilities,
    session: Session,
    amount: number,
    space: Space,
    _npc: Entity,
  ) {
    const playerData = session.data;
    if (!playerData.armada) return;
    const near = [...this.sessions.values()].filter(
      (session3) =>
        session3 !== session &&
        session3.data &&
        session3.data.armada === playerData.armada &&
        session3.ent &&
        session3.data.sys === space.id,
    );
    if (!near.length) return;
    const event = this.mods(space.id).armadaBounty || 1,
      extra = Math.round(amount * (ARMADA.buff.bounty - 1) * event);
    playerData.credits += extra;
    playerData.stats.earned += extra;
    for (const session3 of near) {
      const entryKey = Math.round(amount * ARMADA.share * event);
      session3.data.credits += entryKey;
      session3.data.stats.earned += entryKey;
      this.goal(session3, 'kills');
      for (const mission of session3.data.missions)
        if (mission.type === 'patrol' && mission.sys === space.id && !mission.done) {
          mission.got!++;
          if (mission.got! >= mission.need!) {
            mission.done = true;
            this.toast(session3, 'Patrol complete. Land anywhere to collect your pay.');
          }
        }
      this.toast(
        session3,
        `Armada share: ${credits(entryKey)} credits from ${playerData.name}'s kill.`,
      );
      this.you(session3);
    }
  },
  // follow the leader: members in the same system who opted in get the leader's destination for their autopilot
  armadaLeaderJump(this: CoopCapabilities, session: Session, destination: string) {
    const playerData = session.data,
      armadaState = this.armadaOf(playerData);
    if (!armadaState || this.db.key(armadaState.leader) !== this.db.key(playerData.name)) return;
    for (const session3 of this.sessions.values())
      if (
        session3 !== session &&
        session3.data &&
        session3.data.armada === armadaState.id &&
        session3.data.armadaFollow &&
        session3.data.sys === playerData.sys &&
        session3.ent
      )
        this.send(session3, { t: 'follow', to: destination, leader: playerData.name });
  },

  // ------------------------------------------------------------------ trading between Personal Stations
  atOwnStation(this: CoopCapabilities, playerData: PlayerData) {
    const stellarBody = STELLARS[playerData.stellar!];
    return !!(stellarBody && stellarBody.site && this.ownSite(playerData, stellarBody));
  },
  tradeOp(this: CoopCapabilities, session: Session, coopMessage: CoopMessage) {
    if (this.solo) return;
    const playerData = session.data,
      announce = (message: string) => this.toast(session, message);
    if (!this.atOwnStation(playerData))
      return announce('Trade from your own Personal Station: dock there first.');
    switch (coopMessage.op) {
      case 'open': {
        const playerAccount = this.db.get(cleanName(coopMessage.name)),
          session3 = playerAccount && this.sessionOf(playerAccount.name);
        if (!playerAccount || playerAccount === playerData)
          return announce('No captain by that name.');
        if (!session3) return announce(`${playerAccount.name} is not online.`);
        if (
          !(
            this.has(this.socialInit(playerData).friends, playerAccount.name) ||
            (playerData.armada && playerData.armada === playerAccount.armada)
          )
        )
          return announce('You can trade with friends and Armada members.');
        if (this.blocked(playerAccount, playerData.name))
          return announce(`${playerAccount.name} is not trading.`);
        if (session.trade || session3.trade)
          return announce(
            session.trade
              ? 'Finish your open trade first.'
              : `${playerAccount.name} is already trading.`,
          );
        if (!this.atOwnStation(playerAccount))
          return announce(
            `${playerAccount.name} needs to be docked at their own Personal Station.`,
          );
        const identifier = 't' + this.nextCoopId++;
        this.trades[identifier] = {
          id: identifier,
          a: playerData.name,
          b: playerAccount.name,
          give: { [playerData.name]: {}, [playerAccount.name]: {} },
          lock: {},
          ok: {},
          t: Date.now(),
        };
        session.trade = identifier;
        session3.trade = identifier;
        this.toast(session3, `${playerData.name} opened a trade with you (ALLIES tab).`);
        this.tradePush(identifier);
        return;
      }
      case 'offer': {
        const tradeState = this.trades[session.trade!];
        if (!tradeState) return;
        const tradeClean2 = this.tradeClean(playerData, coopMessage.give || {});
        if (typeof tradeClean2 === 'string') return announce(tradeClean2);
        if (JSON.stringify(tradeClean2) !== JSON.stringify(tradeState.give[playerData.name])) {
          tradeState.give[playerData.name] = tradeClean2;
          tradeState.lock = {};
          tradeState.ok = {};
        } // any real change unlocks both sides
        tradeState.t = Date.now();
        this.tradePush(tradeState.id);
        return;
      }
      case 'lock': {
        const tradeState = this.trades[session.trade!];
        if (!tradeState) return;
        tradeState.lock[playerData.name] = !!coopMessage.on;
        if (!coopMessage.on) tradeState.ok = {};
        tradeState.t = Date.now();
        this.tradePush(tradeState.id);
        return;
      }
      case 'confirm': {
        const tradeState = this.trades[session.trade!];
        if (!tradeState) return;
        if (!tradeState.lock[tradeState.a] || !tradeState.lock[tradeState.b])
          return announce('Both sides lock their offer first.');
        tradeState.ok[playerData.name] = true;
        tradeState.t = Date.now();
        if (tradeState.ok[tradeState.a] && tradeState.ok[tradeState.b])
          return this.tradeDo(tradeState);
        this.tradePush(tradeState.id);
        return;
      }
      case 'cancel':
        if (session.trade)
          this.tradeCancel(session.trade, `${playerData.name} cancelled the trade.`);
        return;
    }
  },
  // what a captain can put up: credits, goods in the hold, crates, specialist blueprints and parts
  tradeClean(this: CoopCapabilities, playerData: PlayerData, give: TradeOffer) {
    const tradeOffer: TradeOffer = {},
      count = (value: number | undefined) => Math.max(0, Math.floor(+value! || 0));
    let lines = 0;
    if (count(give.credits)) {
      if (count(give.credits) > playerData.credits) return 'You do not have that many credits.';
      tradeOffer.credits = count(give.credits);
    }
    for (const [entryKey, value] of Object.entries(give.items || {})) {
      const quantity = count(value);
      if (!quantity) continue;
      if (++lines > TRADE.maxLines) return `Up to ${TRADE.maxLines} different items per side.`;
      const [kind, firstValue, secondValue] = String(entryKey).split(':');
      if (kind === 'cargo') {
        try {
          planTake(
            playerData.cargo,
            playerData.cargoLots,
            firstValue,
            quantity,
            give.lots?.[firstValue],
          );
        } catch {
          return 'You do not have those cargo grades in your hold.';
        }
        if (give.lots?.[firstValue])
          (tradeOffer.lots = tradeOffer.lots || {})[firstValue] = { ...give.lots[firstValue] };
      } else if (kind === 'mat') {
        if (
          !MATERIALS.includes(firstValue) ||
          !(playerData.mats[firstValue] && playerData.mats[firstValue][+secondValue] >= quantity)
        )
          return 'You do not have those crates.';
      } else if (kind === 'bp') {
        if (!((playerData.bp || {})[firstValue] >= quantity))
          return 'You do not have those blueprints.';
      } else if (kind === 'parts') {
        if (!((playerData.parts || {})[firstValue] >= quantity))
          return 'You do not have those parts.';
      } else return 'That cannot be traded.';
      (tradeOffer.items = tradeOffer.items || {})[entryKey] = quantity;
    }
    return tradeOffer;
  },
  tradePush(this: CoopCapabilities, identifier: string) {
    const tradeState = this.trades[identifier];
    if (!tradeState) return;
    for (const [player, them] of [
      [tradeState.a, tradeState.b],
      [tradeState.b, tradeState.a],
    ] as const) {
      const session = this.sessionOf(player);
      if (session)
        this.send(session, {
          t: 'trade2',
          trade: {
            id: identifier,
            with: them,
            mine: tradeState.give[player],
            theirs: tradeState.give[them],
            lock: { me: !!tradeState.lock[player], them: !!tradeState.lock[them] },
            ok: { me: !!tradeState.ok[player], them: !!tradeState.ok[them] },
            fee: TRADE.fee,
          },
        });
    }
  },
  tradeCancel(this: CoopCapabilities, identifier: string, reason: string) {
    const tradeState = this.trades[identifier];
    if (!tradeState) return;
    delete this.trades[identifier];
    for (const count of [tradeState.a, tradeState.b]) {
      const session = this.sessionOf(count);
      if (session) {
        session.trade = null;
        this.send(session, { t: 'trade2', trade: null });
        if (reason) this.toast(session, reason);
      }
    }
  },
  tradeDo(this: CoopCapabilities, tradeState: TradeState) {
    const playerAccount = this.db.get(tradeState.a),
      playerAccount2 = this.db.get(tradeState.b),
      session = this.sessionOf(tradeState.a),
      session2 = this.sessionOf(tradeState.b);
    if (
      !playerAccount ||
      !playerAccount2 ||
      !session ||
      !session2 ||
      !this.atOwnStation(playerAccount) ||
      !this.atOwnStation(playerAccount2)
    )
      return this.tradeCancel(
        tradeState.id,
        'Trade cancelled: both captains must stay docked at their own stations.',
      );
    // check everything again at the moment of the swap, so a trade either completes fully or not at all
    for (const [playerAccount3, tradeOffer] of [
      [playerAccount, tradeState.give[tradeState.a]],
      [playerAccount2, tradeState.give[tradeState.b]],
    ] as const) {
      const tradeClean2 = this.tradeClean(playerAccount3, tradeOffer);
      if (typeof tradeClean2 === 'string')
        return this.tradeCancel(
          tradeState.id,
          `Trade cancelled: ${playerAccount3.name} no longer has everything offered.`,
        );
    }
    try {
      const playerAccount4 = structuredClone(playerAccount),
        playerAccount5 = structuredClone(playerAccount2);
      migrateCargoLots(playerAccount4);
      migrateCargoLots(playerAccount5);
      for (const [from, playerAccount, tradeOffer] of [
        [playerAccount4, playerAccount5, tradeState.give[tradeState.a]],
        [playerAccount5, playerAccount4, tradeState.give[tradeState.b]],
      ] as const)
        for (const [entryKey, quantity] of Object.entries(tradeOffer.items || {}))
          if (entryKey.startsWith('cargo:'))
            moveLots(
              from.cargo,
              from.cargoLots,
              playerAccount.storage,
              playerAccount.storageLots,
              entryKey.split(':')[1],
              quantity,
              tradeOffer.lots?.[entryKey.split(':')[1]],
            );
    } catch {
      return this.tradeCancel(tradeState.id, 'Trade cancelled: cargo validation failed.');
    }
    migrateCargoLots(playerAccount);
    migrateCargoLots(playerAccount2);
    const move = (from: PlayerData, playerData: PlayerData, tradeOffer: TradeOffer) => {
      const received = [];
      if (tradeOffer.credits) {
        from.credits -= tradeOffer.credits;
        const network = Math.round(tradeOffer.credits * (1 - TRADE.fee));
        playerData.credits += network;
        received.push(`${credits(network)} credits`);
      }
      for (const [entryKey, quantity] of Object.entries(tradeOffer.items || {})) {
        const [kind, firstValue, secondValue] = entryKey.split(':');
        if (kind === 'cargo') {
          moveLots(
            from.cargo,
            from.cargoLots,
            playerData.storage,
            playerData.storageLots,
            firstValue,
            quantity,
            tradeOffer.lots?.[firstValue],
          );
          const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === firstValue);
          received.push(`${quantity} t ${commodityDef ? commodityDef.name : firstValue}`);
        }
        if (kind === 'mat') {
          from.mats[firstValue][+secondValue] -= quantity;
          playerData.mats[firstValue][+secondValue] += quantity;
          received.push(`${quantity} ${firstValue} ${GRADES[+secondValue]}`);
        }
        if (kind === 'bp') {
          from.bp[firstValue] -= quantity;
          playerData.bp = playerData.bp || {};
          playerData.bp[firstValue] = (playerData.bp[firstValue] || 0) + quantity;
          received.push(
            `${quantity} ${this.A.ships[firstValue] ? this.A.ships[firstValue].name : ''} blueprints`,
          );
        }
        if (kind === 'parts') {
          from.parts[firstValue] -= quantity;
          playerData.parts = playerData.parts || {};
          playerData.parts[firstValue] = (playerData.parts[firstValue] || 0) + quantity;
          received.push(
            `${quantity} ${this.A.ships[firstValue] ? this.A.ships[firstValue].name : ''} parts`,
          );
        }
      }
      return received;
    };
    const move2 = move(playerAccount, playerAccount2, tradeState.give[tradeState.a]),
      move3 = move(playerAccount2, playerAccount, tradeState.give[tradeState.b]);
    // goods land in station storage, then go into the hold if there is room
    for (const [playerAccount7, _session] of [
      [playerAccount, session],
      [playerAccount2, session2],
    ] as const) {
      if (!playerAccount7.storage) continue;
      const computedShipStats = this.stats(playerAccount7)!;
      let room = computedShipStats.cargo - this.holdUsed(playerAccount7);
      for (const [entryKey, value] of Object.entries(playerAccount7.storage)) {
        const quantity = Math.min(value, Math.max(0, room));
        if (quantity > 0) {
          moveLots(
            playerAccount7.storage,
            playerAccount7.storageLots,
            playerAccount7.cargo,
            playerAccount7.cargoLots,
            entryKey,
            quantity,
            'common-first',
            Math.max(0, room),
          );
          room -= quantity;
          if (!playerAccount7.storage[entryKey]) delete playerAccount7.storage[entryKey];
        }
      }
    }
    const line = (received: string[]) => (received.length ? received.join(', ') : 'nothing');
    this.log(
      playerAccount,
      `Traded with ${playerAccount2.name}: gave ${line(move2)}; got ${line(move3)}.`,
    );
    this.log(
      playerAccount2,
      `Traded with ${playerAccount.name}: gave ${line(move3)}; got ${line(move2)}.`,
    );
    delete this.trades[tradeState.id];
    session.trade = session2.trade = null;
    for (const [session4, received, width] of [
      [session, move3, playerAccount2.name],
      [session2, move2, playerAccount.name],
    ] as const) {
      this.send(session4, { t: 'trade2', trade: null });
      this.toast(
        session4,
        `Trade with ${width} complete. You received ${line(received)}.${received.some((positionX) => / t /.test(positionX)) ? ' Goods that did not fit your hold wait in exchange storage.' : ''}`,
      );
      this.you(session4);
      this.landed(session4);
    }
    this.db.touch();
  },

  // ------------------------------------------------------------------ duels and Armada Duels
  duelOf(this: CoopCapabilities, session: Session) {
    return session && session.duel ? this.duels[session.duel] || null : null;
  },
  duelSide(this: CoopCapabilities, duelState: DuelState, name: string) {
    const entryKey = this.db.key(name);
    return duelState.sides.A.some((count) => this.db.key(count) === entryKey)
      ? 'A'
      : duelState.sides.B.some((count) => this.db.key(count) === entryKey)
        ? 'B'
        : null;
  },
  dueling(
    this: CoopCapabilities,
    playerReference: PlayerReference | null,
    playerReference2: PlayerReference | null,
  ) {
    const session = playerReference && playerReference.s,
      session3 = playerReference2 && playerReference2.s;
    if (!session || !session3 || !session.duel || session.duel !== session3.duel) return false;
    const duelState = this.duels[session.duel];
    if (!duelState || !duelState.on) return false;
    const duelSide2 = this.duelSide(duelState, playerReference.name),
      duelSide3 = this.duelSide(duelState, playerReference2.name);
    return !!(
      duelSide2 &&
      duelSide3 &&
      duelSide2 !== duelSide3 &&
      !duelState.out.has(this.db.key(playerReference.name)) &&
      !duelState.out.has(this.db.key(playerReference2.name))
    );
  },
  duelPayload(this: CoopCapabilities, session: Session) {
    const duelState = this.duelOf(session);
    if (!duelState) return session && session.duelInv ? { invite: session.duelInv } : null;
    const mine = this.duelSide(duelState, session.data.name),
      foes = duelState.sides[mine === 'A' ? 'B' : 'A'];
    return {
      id: duelState.id,
      armada: duelState.armada,
      on: duelState.on,
      with: foes.length === 1 ? foes[0] : null,
      foes,
      friends: duelState.sides[mine!],
      out: [...duelState.out],
      until: duelState.until,
    };
  },
  duelOp(this: CoopCapabilities, session2: Session, coopMessage: CoopMessage) {
    if (this.solo) return;
    const playerData = session2.data,
      announce = (message: string) => this.toast(session2, message);
    if (systemsById[playerData.sys] && systemsById[playerData.sys].arena)
      return announce('Not in the Crucible.');
    switch (coopMessage.op) {
      case 'challenge': {
        const playerAccount = this.db.get(cleanName(coopMessage.name)),
          session = playerAccount && this.sessionOf(playerAccount.name);
        if (!session || playerAccount === playerData)
          return announce('Challenge a captain who is online.');
        if (!session2.ent || !session.ent || session.data.sys !== playerData.sys)
          return announce('Both captains must be flying in the same system.');
        if (session2.duel || session.duel) return announce('One of you is already in a duel.');
        if (this.blocked(playerAccount, playerData.name))
          return announce(`${playerAccount.name} is not taking challenges.`);
        if (playerData.armada && playerData.armada === playerAccount.armada)
          return announce('Armada members cannot duel each other. Leave the Armada first.');
        const armada = !!coopMessage.armada;
        if (armada) {
          const armadaState = this.armadaOf(playerData),
            armadaState2 = this.armadaOf(playerAccount);
          if (!armadaState || !armadaState2)
            return announce('An Armada Duel is between two Armadas: both captains need one.');
          if (
            this.db.key(armadaState.leader) !== this.db.key(playerData.name) ||
            this.db.key(armadaState2.leader) !== this.db.key(playerAccount.name)
          )
            return announce('Armada Duels are agreed between the two leaders.');
        }
        session.duelInv = {
          from: playerData.name,
          armada,
          t: Date.now() + DUEL.inviteSec * 1000,
        };
        this.toast(
          session,
          `${playerData.name} challenges ${armada ? 'your Armada to an Armada Duel' : 'you to a duel'}: a fight to disabled, nothing lost. Accept in the ALLIES tab within ${DUEL.inviteSec} seconds.`,
        );
        this.you(session);
        announce(`Challenge sent to ${playerAccount.name}.`);
        return;
      }
      case 'accept': {
        const duelInvite = session2.duelInv;
        if (!duelInvite || duelInvite.t < Date.now()) {
          session2.duelInv = null;
          this.you(session2);
          return announce('That challenge has lapsed.');
        }
        const session = this.sessionOf(duelInvite.from);
        session2.duelInv = null;
        if (
          !session ||
          !session.ent ||
          !session2.ent ||
          session.data.sys !== playerData.sys ||
          session.duel ||
          session2.duel
        ) {
          this.you(session2);
          return announce('The challenger is no longer here.');
        }
        let firstValue = [session.data.name],
          secondValue = [playerData.name];
        if (duelInvite.armada) {
          const armadaState = this.armadaOf(session.data),
            armadaState4 = this.armadaOf(playerData);
          if (!armadaState || !armadaState4) return announce('Both captains need their Armadas.');
          const here = (armadaState5: ArmadaState) =>
            armadaState5.members
              .map((count) => this.sessionOf(count))
              .filter((session): session is Session =>
                Boolean(
                  session && session.ent && session.data.sys === playerData.sys && !session.duel,
                ),
              )
              .map((session) => session.data.name);
          firstValue = here(armadaState);
          secondValue = here(armadaState4);
        }
        const identifier = 'd' + this.nextCoopId++;
        const distance = (this.duels[identifier] = {
          id: identifier,
          armada: !!duelInvite.armada,
          sys: playerData.sys,
          sides: { A: firstValue, B: secondValue },
          out: new Set(),
          on: false,
          startT: Date.now() + 5000,
          until: Date.now() + 5000 + DUEL.minutes * 60000,
        });
        for (const count of [...firstValue, ...secondValue]) {
          const session = this.sessionOf(count);
          if (session) {
            session.duel = identifier;
            this.toast(
              session,
              `${distance.armada ? 'ARMADA DUEL' : 'DUEL'}: ${firstValue.join(', ')} against ${secondValue.join(', ')}. Weapons free in 5 seconds. It ends at disabled; nobody loses a ship.`,
            );
            this.you(session);
          }
        }
        return;
      }
      case 'decline':
        if (session2.duelInv) {
          const session = this.sessionOf(session2.duelInv.from);
          if (session) this.toast(session, `${playerData.name} declined the challenge.`);
          session2.duelInv = null;
          this.you(session2);
        }
        return;
      case 'yield':
        if (session2.duel) this.duelOut(session2, 'yielded');
        return;
    }
  },
  // a hit in a duel: armor never drops below the floor; a captain brought down to it is out of the duel
  duelHit(this: CoopCapabilities, srcRoot: Entity, ship: Entity, space: Space) {
    const root = space.root(ship);
    if (!this.dueling(srcRoot.player, root.player)) return false;
    const floor = ship.st.armor * DUEL.floor;
    if (ship.armor > floor) return false;
    ship.armor = floor;
    if (ship === root) {
      const session = root.player!.s;
      this.duelOut(session, `was disabled by ${srcRoot.player!.name}`);
    }
    return true;
  },
  duelOut(this: CoopCapabilities, session: Session, reason: string) {
    const duelState = this.duelOf(session);
    if (!duelState) return;
    const entryKey = this.db.key(session.data.name);
    if (!duelState.out.has(entryKey)) {
      duelState.out.add(entryKey);
      this.duelSay(duelState, `${session.data.name} ${reason}.`);
    }
    session.duel = null;
    this.you(session);
    const alive = (side: 'A' | 'B') =>
      duelState.sides[side].filter((count) => !duelState.out.has(this.db.key(count)));
    if (!alive('A').length || !alive('B').length)
      this.duelEnd(duelState, !alive('A').length ? 'B' : 'A');
  },
  duelSay(this: CoopCapabilities, duelState: DuelState, message: string) {
    for (const count of [...duelState.sides.A, ...duelState.sides.B]) {
      const session = this.sessionOf(count);
      if (session) this.toast(session, message);
    }
  },
  duelEnd(this: CoopCapabilities, duelState: DuelState, window: 'A' | 'B' | null) {
    if (!this.duels[duelState.id]) return;
    delete this.duels[duelState.id];
    const names = (side: 'A' | 'B') => duelState.sides[side].join(', ');
    const message = window
      ? `${duelState.armada ? 'Armada Duel' : 'Duel'} won by ${names(window)} against ${names(window === 'A' ? 'B' : 'A')}.`
      : `The ${duelState.armada ? 'Armada Duel' : 'duel'} between ${names('A')} and ${names('B')} ended in a draw.`;
    for (const count of [...duelState.sides.A, ...duelState.sides.B]) {
      const session = this.sessionOf(count);
      const playerAccount = this.db.get(count);
      if (playerAccount) {
        playerAccount.duels = playerAccount.duels || { w: 0, l: 0, d: 0 };
        const side = this.duelSide(duelState, count);
        playerAccount.duels[!window ? 'd' : side === window ? 'w' : 'l']++;
      }
      if (session) {
        if (session.duel === duelState.id) session.duel = null;
        this.toast(session, message);
        this.you(session);
      }
    }
    this.broadcast(
      { t: 'chat', from: '', msg: message, ch: 'sys', sys: duelState.sys },
      (session) => session.data.sys === duelState.sys,
    );
  },
  duelTick(this: CoopCapabilities) {
    const currentTime = Date.now();
    for (const duelState of Object.values(this.duels)) {
      if (!duelState.on && currentTime >= duelState.startT) {
        duelState.on = true;
        this.duelSay(duelState, 'Weapons free!');
        for (const count of [...duelState.sides.A, ...duelState.sides.B]) {
          const session = this.sessionOf(count);
          if (session) this.you(session);
        }
      }
      for (const count of [...duelState.sides.A, ...duelState.sides.B]) {
        if (duelState.out.has(this.db.key(count))) continue;
        const session = this.sessionOf(count);
        if (!session || !session.ent || session.data.sys !== duelState.sys) {
          if (session) this.duelOut(session, 'left the fight');
          else {
            duelState.out.add(this.db.key(count));
          }
        }
      }
      if (!this.duels[duelState.id]) continue;
      if (currentTime > duelState.until) this.duelEnd(duelState, null);
    }
    for (const session of this.sessions.values())
      if (session.duelInv && session.duelInv.t < currentTime) {
        session.duelInv = null;
        this.you(session);
      }
  },

  // ------------------------------------------------------------------ Armada rescue: a downed captain waits for a member to board them
  rescueHold(this: CoopCapabilities, entity: Entity, entity2: Entity | null, space: Space) {
    if (this.solo || !entity.player || space.sys.arena || entity.rescueT) return false;
    const session = entity.player.s,
      playerData = session && session.data;
    if (!playerData || !playerData.armada) return false;
    const mates = [...this.sessions.values()].filter(
      (session3) =>
        session3 !== session &&
        session3.data &&
        session3.data.armada === playerData.armada &&
        session3.ent &&
        session3.data.sys === playerData.sys,
    );
    if (!mates.length) return false;
    entity.armor = 1;
    entity.shield = 0;
    entity.disabled = true;
    entity.inp = { thrust: 0, turn: 0 };
    entity.rescueT = space.t + RESCUE.windowSec;
    entity.disT = space.t;
    this.toast(
      session,
      `Your ship is disabled! An Armada member can board you (B) within ${RESCUE.windowSec} seconds to patch you up. Nobody can fire on you meanwhile.`,
    );
    for (const session3 of mates) {
      this.toast(
        session3,
        `${playerData.name} is disabled in this system! Fly alongside, target them and board (B) to patch them up within ${RESCUE.windowSec} seconds.`,
      );
      this.notify(session3, 'Armada captain down', `${playerData.name} needs a rescue.`);
    }
    return true;
  },
  rescueBoard(this: CoopCapabilities, session: Session, entity: Entity) {
    const playerData = session.data,
      entity2 = session.ent!,
      space = this.spaces[playerData.sys];
    if (
      !entity.rescueT ||
      entity.rescueT < space.t ||
      !entity.player ||
      !entity.player.s ||
      !entity.player.s.data
    )
      return this.toast(session, 'Only disabled ships can be boarded.');
    if (!playerData.armada || entity.player.s.data.armada !== playerData.armada)
      return this.toast(session, "Only their Armada can board a captain's ship.");
    const distance = Math.hypot(entity.x - entity2.x, entity.y - entity2.y),
      relative = Math.hypot(entity.vx - entity2.vx, entity.vy - entity2.vy);
    if (distance > Math.max(120, (entity.st.size + entity2.st.size) * 0.5))
      return this.toast(session, 'Move alongside to board.');
    if (relative > 90) return this.toast(session, 'Match speed to board.');
    entity.disabled = false;
    entity.rescueT = 0;
    entity.armor = Math.max(entity.armor, entity.st.armor * RESCUE.repair);
    entity.graceT = space.t + 4;
    playerData.stats.rescues = (playerData.stats.rescues || 0) + 1;
    this.officerXp(session, 20);
    this.toast(session, `You patched up ${entity.player.name}'s ship.`);
    this.toast(
      entity.player.s,
      `${playerData.name} boarded and patched you up. Back in the fight!`,
    );
    this.log(playerData, `Rescued ${entity.player.name} in ${systemsById[playerData.sys].name}.`);
    this.log(
      entity.player.s.data,
      `${playerData.name} rescued you in ${systemsById[playerData.sys].name}.`,
    );
    this.db.touch();
    this.you(session);
  },
  rescueTick(this: CoopCapabilities) {
    for (const space of Object.values(this.live))
      // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
      for (const entity of [...space.ships.values()])
        if (entity.player && entity.rescueT && space.t > entity.rescueT) {
          entity.rescueT = 0;
          entity.disabled = false;
          entity.armor = 0;
          this.toast(entity.player.s, 'Nobody reached you in time. The insurers take over.');
          space.kill(entity, null);
        }
  },

  // ------------------------------------------------------------------ co-op Holdout: helpers from the host's Armada
  holdoutHelpers(this: CoopCapabilities, playerData: PlayerData, site: StellarBody) {
    if (this.solo || !playerData.armada) return [];
    return [...this.sessions.values()].filter(
      (session) =>
        session.data &&
        session.data !== playerData &&
        session.data.armada === playerData.armada &&
        session.ent &&
        session.data.sys === site.system,
    );
  },
  holdoutAnnounce(this: CoopCapabilities, session: Session) {
    const playerData = session.data,
      armadaState = this.armadaOf(playerData);
    if (!armadaState) return;
    const site = STELLARS[playerData.station.site!];
    this.armadaChat(
      armadaState,
      `${playerData.name} started a Station Holdout at their station in ${systemsById[site.system].name}. Fly in to help: every helper shares the rewards.`,
      playerData.name,
    );
  },
  holdoutReward(
    this: CoopCapabilities,
    host: PlayerData,
    savedHoldoutRun: SavedHoldoutRun,
    count: number,
    hasWon: boolean,
    radius: { credits: number; grade: number },
  ) {
    const site = STELLARS[host.station.site!];
    for (const name of savedHoldoutRun.helpers || []) {
      const session = this.sessionOf(name);
      if (!session || !session.ent || session.data.sys !== site.system) continue;
      const playerData = session.data,
        credits2 = Math.round(radius.credits * COOP_HOLDOUT.helperShare),
        materials = MATERIALS[Math.floor(Math.random() * 3)];
      playerData.credits += credits2;
      playerData.stats.earned += credits2;
      playerData.mats[materials][radius.grade]++;
      playerData.bp = playerData.bp || {};
      const message = `Holdout at ${host.name}'s station ${hasWon ? 'WON' : `over after ${count} wave${count > 1 ? 's' : ''}`}. Your share: ${credits(credits2)} cr and a ${materials} ${GRADES[radius.grade]} crate.`;
      this.toast(session, message);
      this.log(playerData, message);
      this.you(session);
    }
  },

  // ------------------------------------------------------------------ Armada contracts (group kingpins in the old refits)
  coopOffers(
    this: CoopCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
  ) {
    if (this.solo || !near.length) return [];
    const [starSystem, jumps] = near[Math.floor(radius() * near.length)],
      starSystem2 = systemsById[starSystem];
    const name2 = WARBAND.names[Math.floor(radius() * WARBAND.names.length)],
      lead = WARBAND.leads[Math.floor(radius() * WARBAND.leads.length)];
    if (!this.A.ships[lead]) return [];
    return [
      {
        id: `${stellarBody.id}-${window}-wb`,
        type: 'warband',
        title: `ARMADA CONTRACT: ${name2}`,
        sys: starSystem,
        hull: lead,
        faction: 'hollow',
        targetName: name2,
        reward: Math.round(
          WARBAND.rewardBase + starSystem2.danger * WARBAND.rewardDanger + jumps * 4000,
        ),
        text: `${name2} deserted with a squadron of the Concord's old refits and holds the ${starSystem2.name} system in a ${this.A.ships[lead].name}. Too much for one ship: this contract needs an Armada of ${WARBAND.minMembers} or more. Choose your team before starting. Only captains who agree join and share the contract pool.`,
      },
    ];
  },
  warbandAccept(this: CoopCapabilities, session: Session, mission: Mission) {
    return proposeContract(this, session, mission);
  },
  warbandArrive(this: CoopCapabilities, session: Session, space: Space) {
    for (const mission of session.data.missions) {
      if (mission.type !== 'warband' || mission.done || mission.sys !== session.data.sys) continue;
      if ([...space.ships.values()].some((entity) => entity.kingpin === mission.id)) continue;
      const members = Math.max(1, (this.armadaNear(session.data) || 0) + 1),
        percentage = (members - 1) * WARBAND.pctPerMember;
      const entity = space.spawnMissionTarget({ ...mission, owner: session.id })!;
      entity.kingpin = mission.id;
      if (mission.offerVersion === 1 && Array.isArray(mission.team))
        entity.contractTeam = [...mission.team];
      entity.noDisable = true;
      if (percentage) {
        entity.st.shield *= 1 + percentage / 100;
        entity.st.armor *= 1 + percentage / 100;
        entity.shield = entity.st.shield;
        entity.armor = entity.st.armor;
      }
      const count = WARBAND.guardsBase + members * WARBAND.guardsPerMember;
      for (let index = 0; index < count; index++) {
        const guard = WARBAND.guards[index % WARBAND.guards.length],
          firstValue = (index / count) * Math.PI * 2;
        const entity2 = space.makeShip({
          hull: guard,
          faction: 'hollow',
          x: entity.x + Math.cos(firstValue) * 160,
          y: entity.y + Math.sin(firstValue) * 160,
          ai: 'escort',
          owner: entity.id,
          name: `${mission.targetName}'s ${this.A.ships[guard].name}`,
          bonus: { shieldPct: percentage * 0.5, armorPct: percentage * 0.5 },
        });
        entity2.life = 1e9;
        entity2.kingpinGuard = mission.id;
      }
      for (const session3 of this.sessions.values())
        if (
          session3.data &&
          session3.data.sys === session.data.sys &&
          session3.data.missions.some((mission2) => mission2.id === mission.id)
        )
          this.toast(
            session3,
            `${mission.targetName} is here in a ${this.A.ships[mission.hull!].name}, with ${count} refitted escorts.`,
          );
    }
  },
  warbandDown(this: CoopCapabilities, entity: Entity) {
    if (completeTeamContract(this, entity)) return;
    for (const session of this.sessions.values())
      if (session.data)
        for (const mission of session.data.missions)
          if (mission.type === 'warband' && mission.id === entity.kingpin && !mission.done) {
            mission.done = true;
            this.toast(
              session,
              `Armada contract complete: ${mission.targetName} is finished. Land anywhere to collect your ${credits(mission.reward)} credits.`,
            );
            this.you(session);
          }
  },

  // ------------------------------------------------------------------ every two seconds
  coopTick(this: CoopCapabilities) {
    if (this.solo) return;
    cleanContractPlans(this);
    const currentTime = Date.now(),
      worldData = this.db.world;
    for (const armadaState of Object.values(worldData.armadas)) {
      for (const [entryKey, time] of Object.entries(armadaState.invites || {}))
        if (time < currentTime) delete armadaState.invites[entryKey];
      const online = armadaState.members.some((count) => this.sessionOf(count));
      if (online) armadaState.emptyT = 0;
      else if (!armadaState.emptyT) armadaState.emptyT = currentTime;
      else if (currentTime - armadaState.emptyT > ARMADA.idleMin * 60000) {
        for (const member of armadaState.members) {
          const playerAccount = this.db.get(member);
          if (playerAccount && playerAccount.armada === armadaState.id) {
            playerAccount.armada = null;
            playerAccount.armadaFollow = false;
          }
        }
        delete worldData.armadas[armadaState.id];
        this.db.touch();
        continue;
      }
      this.armadaRefresh(armadaState);
    }
    for (const tradeState of Object.values(this.trades))
      if (currentTime - tradeState.t > TRADE.idleMin * 60000)
        this.tradeCancel(tradeState.id, 'The trade timed out.');
    this.duelTick();
    this.rescueTick();
  },
};
