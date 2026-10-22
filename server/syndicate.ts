import type { RawStellarBody } from '../shared/galaxy.ts';
export interface SyndicateOperations {
  synInit(this: SyndicateCapabilities, playerData: PlayerData): PlayerData;
  synGain(this: SyndicateCapabilities, session: Session, kind: string, multiplier?: number): void;
  blackMarketAt(
    this: SyndicateCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
  ): boolean;
  blackMarket(
    this: SyndicateCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
  ): Record<string, string | number | boolean> | null;
  bmBuy(this: SyndicateCapabilities, session: Session, identifier: string): void;
  promote(this: SyndicateCapabilities, session: Session, identifier: string): void;
  lowerDeck(
    this: SyndicateCapabilities,
    session: Session,
    message: { i: number; op: 'hire' | 'dismiss'; kind: string },
  ): void;
  bankAt(this: SyndicateCapabilities, stellarBody: StellarBody): boolean | 0;
  bankInfo(
    this: SyndicateCapabilities,
    playerData: PlayerData,
  ): ReturnType<typeof SyndicateOperations.bankInfo>;
  bankOp(
    this: SyndicateCapabilities,
    session: Session,
    message: { op: 'borrow' | 'pay'; amt: number | string },
  ): void;
  bankTick(this: SyndicateCapabilities, session: Session): void;
  extraOffers(
    this: SyndicateCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
    pickDest: (starSystem?: string) => RawStellarBody | null,
  ): Array<Mission>;
  acceptCheck(this: SyndicateCapabilities, session: Session, mission: Mission): boolean;
  missionDeadlines(this: SyndicateCapabilities, session: Session): void;
}
import type { SyndicateCapabilities } from './features.ts';
import type { Mission, PlayerData, Session, StellarBody } from './game.ts';

import { clampStanding } from '../shared/reputation.ts';
// Syndicate and Officers: Syndicate standing and the black market, officer promotions and traits, lower-deck
// crew, the bank (loans with a credit rating), passenger and rush jobs, and Syndicate contracts.
import {
  SYS as systemsById,
  STELLARS,
  FACTIONS,
  MATERIALS,
  GRADES,
  TRAFFIC,
} from '../shared/galaxy.ts';
import {
  SYN_TIERS,
  synTier,
  SYN_GAIN,
  BLACK_MARKET,
  RANKS_OFF,
  PROMOTE,
  TRAITS,
  LOWER_DECK,
  LOWER_SLOTS,
  BANK,
  loanRate,
  maxLoan,
  loanPayment,
  bunks,
  RUSH_BONUS,
} from '../shared/syndicate.ts';
import { credits } from '../shared/rules.ts';
import { occupiedPassengerSeats } from '../shared/passengers.ts';

/** @import { Mission, PlayerData, Session, StellarBody } from './game.ts' */

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} value - Value to clamp.
 * @param {number} firstValue - Minimum value.
 * @param {number} secondValue - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (value: number, firstValue: number, secondValue: number): number =>
  Math.max(firstValue, Math.min(secondValue, value));
/** @type {string[]} Mission types that complete upon reaching their destination. */
const DEST_TYPES: string[] = ['cargo', 'smuggle', 'passenger', 'expret', 'supply']; // supply jobs complete at their destination
/**
 * Check whether a mission completes at its destination.
 * @param {{type: string}} message - Mission object to check.
 * @returns {boolean} True if the mission completes at destination.
 */
export const destType = (message: { type: string }): boolean => DEST_TYPES.includes(message.type);

export const SyndicateOperations = {
  /**
   * Initialize or default Syndicate standing, commendations, lower deck crew, and credit rating.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {PlayerData} Initialized player data.
   */
  synInit(this: SyndicateCapabilities, playerData: PlayerData) {
    playerData.syn = playerData.syn || 0;
    playerData.shards = playerData.shards || 0;
    playerData.lower = playerData.lower || [];
    playerData.credit = playerData.credit || BANK.credit0;
    return playerData;
  },
  /**
   * Award Syndicate standing and notify player of rank increases.
   * @param {Session} session - Player session.
   * @param {string} kind - Standing gain category.
   * @param {number} [multiplier=1] - Standing gain multiplier.
   * @returns {void}
   */
  synGain(this: SyndicateCapabilities, session: Session, kind: string, multiplier: number = 1) {
    const playerData = this.synInit(session.data),
      before = synTier(playerData.syn).i;
    playerData.syn += Math.round((SYN_GAIN[kind] || 0) * multiplier);
    const syndicateTierInfo = synTier(playerData.syn);
    if (syndicateTierInfo.i > before) {
      this.toast(
        session,
        `The Syndicate takes notice: you are now ${syndicateTierInfo.i === 1 ? 'an' : 'a'} ${syndicateTierInfo.name}.`,
      );
      this.log(playerData, `Syndicate standing: ${syndicateTierInfo.name}.`);
    }
    if (syndicateTierInfo.i >= 2 && Math.random() < 0.5)
      playerData.rep.quantum = clampStanding((playerData.rep.quantum || 0) - 1); // the Concord notices too
  },
  // ------------------------------------------------------------------ black market: outlaw worlds, and any spaceport bar once you are a Lieutenant
  /**
   * Check whether black market services are accessible at a given stellar body.
   * @param {StellarBody} stellarBody - Stellar body or station.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {boolean} True if black market is accessible.
   */
  blackMarketAt(this: SyndicateCapabilities, stellarBody: StellarBody, playerData: PlayerData) {
    return (
      !!stellarBody &&
      !stellarBody.site &&
      (stellarBody.outlaw || (stellarBody.svc.includes('B') && synTier(playerData.syn).i >= 3))
    );
  },
  /**
   * Retrieve black market stock and tier access details for a stellar body.
   * @param {StellarBody} stellarBody - Stellar body or station.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, string | number | boolean> | null} Black market inventory payload or null.
   */
  blackMarket(this: SyndicateCapabilities, stellarBody: StellarBody, playerData: PlayerData) {
    if (!this.blackMarketAt(stellarBody, playerData)) return null;
    const time = synTier(playerData.syn).i;
    return {
      tier: synTier(playerData.syn),
      items: BLACK_MARKET.map((blackMarketItem) => ({
        ...blackMarketItem,
        locked: blackMarketItem.tier > time ? SYN_TIERS[blackMarketItem.tier][1] : null,
      })),
    };
  },
  /**
   * Purchase an item or service from the black market fence.
   * @param {Session} session - Player session.
   * @param {string} identifier - Black market item identifier.
   * @returns {void}
   */
  bmBuy(this: SyndicateCapabilities, session: Session, identifier: string) {
    const playerData = this.synInit(session.data),
      stellarBody = STELLARS[playerData.stellar!],
      blackMarketItem = BLACK_MARKET.find((blackMarketItem) => blackMarketItem.id === identifier);
    if (!blackMarketItem || !this.blackMarketAt(stellarBody, playerData)) return;
    if (synTier(playerData.syn).i < blackMarketItem.tier)
      return this.toast(
        session,
        `The fence won't sell that to anyone below ${SYN_TIERS[blackMarketItem.tier][1]}.`,
      );
    if (playerData.credits < blackMarketItem.price)
      return this.toast(session, `That costs ${credits(blackMarketItem.price)} credits.`);
    const game = blackMarketItem.give as {
      papers?: number;
      shards?: number;
      bp?: [number, number];
      parts?: [number, number];
      crate?: number;
    };
    if (game.papers) {
      // your worst grudge is quietly forgiven
      const worst = Object.entries(playerData.rep)
        .filter(
          ([factionId]) =>
            FACTIONS[factionId] &&
            !FACTIONS[factionId].pirate &&
            !FACTIONS[factionId].alwaysHostile &&
            !FACTIONS[factionId].region,
        )
        .sort((firstValue, secondValue) => firstValue[1] - secondValue[1])[0];
      if (!worst || worst[1] >= -10)
        return this.toast(session, 'Nobody is looking for you badly enough to need papers.');
      playerData.rep[worst[0]] = -10;
      this.toast(
        session,
        `New papers. The ${FACTIONS[worst[0]].name} records now show only minor infractions.`,
      );
    }
    if (game.shards) playerData.shards += game.shards;
    if (game.bp) {
      playerData.bp = playerData.bp || {};
      playerData.bp[game.bp[0]] = (playerData.bp[game.bp[0]] || 0) + game.bp[1];
    }
    if (game.parts) {
      playerData.parts = playerData.parts || {};
      playerData.parts[game.parts[0]] = (playerData.parts[game.parts[0]] || 0) + game.parts[1];
    }
    if (game.crate != null) {
      const materials = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
      playerData.mats[materials][game.crate]++;
      this.toast(session, `Inside: a ${materials} ${GRADES[game.crate]} crate.`);
    }
    playerData.credits -= blackMarketItem.price;
    if (!game.papers && game.crate == null) this.toast(session, `Bought: ${blackMarketItem.name}.`);
    this.log(
      playerData,
      `Black market: ${blackMarketItem.name} for ${credits(blackMarketItem.price)} credits.`,
    );
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // ------------------------------------------------------------------ officer promotions and the lower decks
  /**
   * Promote an officer to the next rank, consuming commendations and credits and granting a trait.
   * @param {Session} session - Player session.
   * @param {string} identifier - Officer identifier.
   * @returns {void}
   */
  promote(this: SyndicateCapabilities, session: Session, identifier: string) {
    const playerData = this.synInit(session.data),
      officer = (playerData.officers || []).find(
        (officerRecord) => officerRecord.id === identifier,
      );
    if (!officer) return;
    const radius = (officer.rank || 0) + 1,
      officerPromotionCost = PROMOTE[radius];
    if (!officerPromotionCost)
      return this.toast(session, `${officer.name} already holds the highest rank.`);
    if (officer.lv < officerPromotionCost.lv)
      return this.toast(
        session,
        `${officer.name} needs level ${officerPromotionCost.lv} to become ${RANKS_OFF[radius]}.`,
      );
    if (
      playerData.shards < officerPromotionCost.shards ||
      playerData.credits < officerPromotionCost.credits
    )
      return this.toast(
        session,
        `Promotion to ${RANKS_OFF[radius]} takes ${officerPromotionCost.shards} commendations and ${credits(officerPromotionCost.credits)} credits.`,
      );
    playerData.shards -= officerPromotionCost.shards;
    playerData.credits -= officerPromotionCost.credits;
    officer.rank = radius;
    officer.traits = officer.traits || [];
    const pool = Object.keys(TRAITS).filter((time) => !officer.traits!.includes(time)),
      pool2 = pool[Math.floor(Math.random() * pool.length)];
    if (pool2) officer.traits.push(pool2);
    this.toast(
      session,
      `${officer.name} is promoted to ${RANKS_OFF[radius]}${pool2 ? ` and learns ${TRAITS[pool2].name}` : ''}.`,
    );
    this.log(playerData, `${officer.name} promoted to ${RANKS_OFF[radius]}.`);
    this.db.touch();
    this.you(session);
    if (playerData.stellar) this.landed(session);
  },
  /**
   * Hire or dismiss lower-deck crew members.
   * @param {Session} session - Player session.
   * @param {{i: number, op: 'hire' | 'dismiss', kind: string}} message - Lower deck management message.
   * @returns {void}
   */
  lowerDeck(
    this: SyndicateCapabilities,
    session: Session,
    message: { i: number; op: 'hire' | 'dismiss'; kind: string },
  ) {
    const playerData = this.synInit(session.data),
      index = message.i | 0;
    if (index < 0 || index >= LOWER_SLOTS) return;
    if (message.op === 'hire') {
      const lowerDeckRole = LOWER_DECK[message.kind];
      if (!lowerDeckRole || !playerData.stellar) return;
      if (playerData.lower.includes(message.kind))
        return this.toast(session, `You already have a ${lowerDeckRole.name} aboard.`);
      if (playerData.lower[index])
        return this.toast(session, 'That berth is taken. Dismiss its crew member first.'); // 2.0.3
      if (playerData.credits < lowerDeckRole.cost)
        return this.toast(
          session,
          `Hiring a ${lowerDeckRole.name} costs ${credits(lowerDeckRole.cost)} credits.`,
        );
      playerData.credits -= lowerDeckRole.cost;
      playerData.lower[index] = message.kind;
      this.toast(
        session,
        `${lowerDeckRole.name} hired for the lower deck (${lowerDeckRole.desc}).`,
      );
    } else if (message.op === 'dismiss') {
      if (playerData.lower[index])
        this.toast(session, `${LOWER_DECK[playerData.lower[index]].name} dismissed.`);
      playerData.lower[index] = null;
    }
    this.db.touch();
    this.you(session);
    if (playerData.stellar) this.landed(session);
  },
  // ------------------------------------------------------------------ the bank
  /**
   * Check whether banking services are available at a stellar body.
   * @param {StellarBody} stellarBody - Stellar body or station.
   * @returns {boolean} True if banking services are available.
   */
  bankAt(this: SyndicateCapabilities, stellarBody: StellarBody) {
    return (
      !!stellarBody &&
      !stellarBody.site &&
      (stellarBody.hub || stellarBody.svc.includes('T')) &&
      !stellarBody.outlaw
    );
  },
  /**
   * Retrieve bank account, loan balance, and payment schedule details.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {Record<string, number | string>} Bank account and loan information.
   */
  bankInfo(this: SyndicateCapabilities, playerData: PlayerData) {
    this.synInit(playerData);
    const loan2 = playerData.loan;
    return {
      credit: playerData.credit,
      rate: loanRate(playerData.credit),
      max: maxLoan(playerData.credit, playerData.stats.earned),
      bal: loan2 ? loan2.bal : 0,
      next: loan2 ? loan2.next : 0,
      pay: loan2 ? loanPayment(loan2.bal, playerData.credit) : 0,
      period: BANK.periodMin,
    };
  },
  /**
   * Process borrowing or loan repayment bank operations.
   * @param {Session} session - Player session.
   * @param {{op: 'borrow' | 'pay', amt: number | string}} message - Bank operation message.
   * @returns {void}
   */
  bankOp(
    this: SyndicateCapabilities,
    session: Session,
    message: { op: 'borrow' | 'pay'; amt: number | string },
  ) {
    const playerData = this.synInit(session.data),
      stellarBody = STELLARS[playerData.stellar!];
    if (!this.bankAt(stellarBody)) return this.toast(session, 'Banking is done at a trade port.');
    const bankInfo2 = this.bankInfo(playerData);
    if (message.op === 'borrow') {
      const amount = Math.floor(Math.max(0, +message.amt || 0) / 1000) * 1000;
      if (!amount) return;
      if (bankInfo2.bal + amount > bankInfo2.max)
        return this.toast(
          session,
          `The bank will lend you at most ${credits(bankInfo2.max)} credits in total.`,
        );
      playerData.loan = playerData.loan || { bal: 0, next: Date.now() + BANK.periodMin * 60000 };
      playerData.loan.bal += amount;
      playerData.credits += amount;
      this.toast(
        session,
        `Loan approved: ${credits(amount)} credits. Payments of about ${credits(loanPayment(playerData.loan.bal, playerData.credit))} every ${BANK.periodMin} minutes of play.`,
      );
      this.log(playerData, `Borrowed ${credits(amount)} credits.`);
    } else if (message.op === 'pay') {
      if (!playerData.loan) return;
      const amount = Math.min(
        playerData.loan.bal,
        Math.max(0, Math.floor(+message.amt || 0)),
        playerData.credits,
      );
      if (!amount) return;
      playerData.credits -= amount;
      playerData.loan.bal -= amount;
      this.toast(session, `Paid ${credits(amount)} toward your loan.`);
      if (playerData.loan.bal <= 0) {
        playerData.loan = null;
        playerData.credit = clamp(playerData.credit + 15, BANK.creditMin, BANK.creditMax);
        this.toast(session, 'Loan paid off. Your credit rating improves.');
      }
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Process periodic loan interest, scheduled payment deduction, and credit score changes.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  bankTick(this: SyndicateCapabilities, session: Session) {
    const playerData = session.data,
      loan2 = playerData.loan;
    if (!loan2 || Date.now() < loan2.next) return;
    loan2.next = Date.now() + BANK.periodMin * 60000;
    const interest = Math.ceil(loan2.bal * loanRate(playerData.credit)),
      loanPayment2 = loanPayment(loan2.bal, playerData.credit);
    if (playerData.credits >= loanPayment2) {
      playerData.credits -= loanPayment2;
      loan2.bal = loan2.bal + interest - loanPayment2;
      playerData.credit = clamp(playerData.credit + 3, BANK.creditMin, BANK.creditMax);
      this.toast(
        session,
        `Loan payment: ${credits(loanPayment2)} credits. ${loan2.bal > 0 ? `${credits(loan2.bal)} left.` : ''}`,
      );
    } else {
      loan2.bal += interest;
      playerData.credit = clamp(playerData.credit - 8, BANK.creditMin, BANK.creditMax);
      this.toast(
        session,
        `Missed a loan payment of ${credits(loanPayment2)}. Interest added and your credit rating drops.`,
      );
      this.notify &&
        this.notify(session, 'Missed loan payment', `${credits(loanPayment2)} credits were due.`);
    }
    if (loan2.bal <= 0) {
      playerData.loan = null;
      playerData.credit = clamp(playerData.credit + 15, BANK.creditMin, BANK.creditMax);
      this.toast(session, 'Loan paid off. Your credit rating improves.');
    }
    this.db.touch();
    this.you(session);
  },
  // ------------------------------------------------------------------ extra jobs: passengers, rush deliveries, Syndicate contracts
  /**
   * Generate extra mission offers including passenger transport, rush cargo deliveries, and Syndicate contracts.
   * @param {StellarBody} stellarBody - Current stellar body.
   * @param {PlayerData} playerData - Saved player data.
   * @param {() => number} radius - Random number generator function.
   * @param {Array<[string, number]>} near - Nearby systems and jump distances.
   * @param {number} window - Offer rotation time window.
   * @param {(sys?: string) => RawStellarBody | null} pickDest - Function to select destination stellar in target system.
   * @returns {Array<Mission>} Extra job and contract offers.
   */
  extraOffers(
    this: SyndicateCapabilities,
    stellarBody: StellarBody,
    playerData: PlayerData,
    radius: () => number,
    near: Array<[string, number]>,
    window: number,
    pickDest: (starSystem?: string) => RawStellarBody | null,
  ) {
    const missions: Mission[] = [];
    if (!near.length) return missions;
    const firstEntry = (_entryKey?: string) => near[Math.floor(radius() * near.length)];
    // Each board has both small parties and group charters, regardless of the current hull.
    // A captain can combine destinations and fill a liner with several accepted missions.
    const passengerGroups = [
      {
        key: 'pax',
        label: 'Independent travellers',
        min: 1,
        span: 6,
        reason: 'Travellers are sharing the fare for a scheduled passage.',
      },
      {
        key: 'science',
        label: 'Science delegation',
        min: 8,
        span: 11,
        reason: 'A research team and its support staff are travelling to a symposium.',
      },
      {
        key: 'charter',
        label: ['Class trip', 'Business convention', 'Cultural exchange'][Math.floor(radius() * 3)],
        min: 20,
        span: 21,
        reason: 'A group booking needs everyone transported together on the same ship.',
      },
    ];
    for (const group of passengerGroups) {
      const [starSystem, jumps] = firstEntry(),
        rawStellarBody = pickDest(starSystem);
      if (!rawStellarBody) continue;
      const passengers = group.min + Math.floor(radius() * group.span);
      missions.push({
        id: `${stellarBody.id}-${window}-${group.key}`,
        type: 'passenger',
        title: `${group.label}: ${passengers} passengers to ${rawStellarBody.name}`,
        sys: starSystem,
        dest: rawStellarBody.id,
        pax: passengers,
        reward: Math.round(1500 + jumps * 1500 + passengers * (600 + jumps * 150)),
        text: `${group.reason} Carry ${passengers} passengers to ${rawStellarBody.name} in the ${systemsById[starSystem].name} system (${jumps} jump${jumps > 1 ? 's' : ''}). Each traveller occupies one dedicated passenger seat. Other passenger missions may share any remaining seats.`,
      });
    }
    if (radius() < 0.5) {
      // rush delivery
      const [starSystem, jumps] = firstEntry(),
        rawStellarBody = pickDest(starSystem);
      if (rawStellarBody) {
        const quantity = 3 + Math.floor(radius() * 10),
          minutes = 5 + jumps * 4;
        missions.push({
          id: `${stellarBody.id}-${window}-rush`,
          type: 'cargo',
          rush: minutes,
          cid: 'medical',
          title: `RUSH: ${quantity} t of medical supplies to ${rawStellarBody.name}`,
          sys: starSystem,
          dest: rawStellarBody.id,
          qty: quantity,
          reward: Math.round((1500 + jumps * 1600 + quantity * 90) * RUSH_BONUS),
          text: `An outbreak on ${rawStellarBody.name} (${systemsById[starSystem].name}). Deliver ${quantity} tons of medical supplies within ${minutes} minutes of accepting, or the job fails.`,
        });
      }
    }
    const shady =
      stellarBody.outlaw ||
      FACTIONS[systemsById[stellarBody.system].faction].pirate ||
      systemsById[stellarBody.system].danger >= 3;
    if (shady) {
      // Syndicate contracts
      const [starSystem, jumps] = firstEntry(),
        rawStellarBody = pickDest(starSystem);
      if (rawStellarBody && radius() < 0.6) {
        const quantity = 4 + Math.floor(radius() * 8);
        missions.push({
          id: `${stellarBody.id}-${window}-syn1`,
          type: 'smuggle',
          syn: 'contract',
          title: `SYNDICATE: move ${quantity} t of "spare parts" to ${rawStellarBody.name}`,
          sys: starSystem,
          dest: rawStellarBody.id,
          qty: quantity,
          reward: Math.round(14000 + jumps * 4000 + quantity * 800),
          text: `The Syndicate needs a discreet hauler. Carry ${quantity} tons of sealed crates to ${rawStellarBody.name} in ${systemsById[starSystem].name}. Lawful patrols may scan you.`,
        });
      }
      if (radius() < 0.6) {
        const [sys2] = firstEntry(),
          faction2 = ['quantum', 'spacer', 'korrund'][Math.floor(radius() * 3)],
          hull = (TRAFFIC[faction2].traders || TRAFFIC.spacer.traders)[0] || 704,
          name2 = `courier ${['Ostrava', 'Bellwether', 'Gilt Margin', 'Patience', 'Clerk Nine'][Math.floor(radius() * 5)]}`;
        missions.push({
          id: `${stellarBody.id}-${window}-syn2`,
          type: 'bounty',
          syn: 'hit',
          title: `SYNDICATE HIT: the ${name2}`,
          sys: sys2,
          hull,
          faction: faction2,
          targetName: `the ${name2}`,
          reward: Math.round(22000 + (this.A.ships[hull] ? this.A.ships[hull].cost * 0.05 : 5000)),
          text: `The ${name2} carries ledgers the Syndicate wants gone. Destroy it in ${systemsById[sys2].name}. The ${FACTIONS[faction2].name} will not thank you.`,
        });
      }
    }
    return missions;
  },
  /**
   * Verify whether the player meets requirements to accept a mission offer (e.g. passenger bunks).
   * @param {Session} session - Player session.
   * @param {Mission} mission - Mission offer being accepted.
   * @returns {boolean} True if offer requirements are met.
   */
  acceptCheck(this: SyndicateCapabilities, session: Session, mission: Mission) {
    const playerData = session.data;
    if (mission.type === 'passenger') {
      const bunks2 = bunks(this.A.ships[playerData.ship.hull], playerData.ship),
        used = occupiedPassengerSeats(playerData.missions);
      if (used + mission.pax! > bunks2) {
        this.toast(
          session,
          `Not enough passenger seats: ${used} of ${bunks2} are occupied; this mission needs ${mission.pax} more.`,
        );
        return false;
      }
    }
    return true;
  },
  /**
   * Check active missions against their deadlines, notifying of impending expiration or penalizing failures.
   * @param {Session} session - Player session.
   * @returns {void}
   */
  missionDeadlines(this: SyndicateCapabilities, session: Session) {
    const playerData = session.data,
      currentTime = Date.now();
    let gone = false;
    for (const mission of playerData.missions)
      if (
        mission.deadline &&
        !mission.done &&
        !mission.warned &&
        mission.deadline - currentTime < 120000 &&
        currentTime <= mission.deadline
      ) {
        mission.warned = true;
        this.toast(session, `⏱ Two minutes left: ${mission.title}.`);
      } // 2.4
    for (const mission of playerData.missions)
      if (mission.deadline && !mission.done && currentTime > mission.deadline) {
        mission.failed = true;
        gone = true;
        const faction2 = systemsById[mission.sys] && systemsById[mission.sys].faction;
        if (mission.qty && mission.cid && playerData.cargo[mission.cid]) {
        } // the cargo stays yours
        if (faction2 && playerData.rep[faction2] != null)
          playerData.rep[faction2] = clampStanding(playerData.rep[faction2] - 3);
        this.toast(session, `Job failed: ${mission.title}. You missed the deadline.`);
        this.log(playerData, `Failed (deadline): ${mission.title}.`);
      }
    if (gone) {
      playerData.missions = playerData.missions.filter((mission) => !mission.failed);
      this.db.touch();
      this.you(session);
    }
  },
};
