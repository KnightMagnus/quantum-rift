import { clampStanding } from '../shared/reputation.js';
// Syndicate and Officers: Syndicate standing and the black market, officer promotions and traits, lower-deck
// crew, the bank (loans with a credit rating), passenger and rush jobs, and Syndicate contracts.
import { SYS, STELLARS, FACTIONS, MATERIALS, GRADES, TRAFFIC } from '../shared/galaxy.js';
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
} from '../shared/syndicate.js';
import { credits } from '../shared/rules.js';
import { occupiedPassengerSeats } from '../shared/passengers.js';

/** @import { Mission, PlayerData, Session, StellarBody } from './game.js' */

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} v - Value to clamp.
 * @param {number} a - Minimum value.
 * @param {number} b - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** @type {string[]} Mission types that complete upon reaching their destination. */
const DEST_TYPES = ['cargo', 'smuggle', 'passenger', 'expret', 'supply']; // supply jobs complete at their destination
/**
 * Check whether a mission completes at its destination.
 * @param {{type: string}} m - Mission object to check.
 * @returns {boolean} True if the mission completes at destination.
 */
export const destType = (m) => DEST_TYPES.includes(m.type);

export const SyndicateOperations = {
  /**
   * Initialize or default Syndicate standing, commendations, lower deck crew, and credit rating.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {PlayerData} Initialized player data.
   */
  synInit(playerData) {
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
   * @param {number} [mult=1] - Standing gain multiplier.
   * @returns {void}
   */
  synGain(session, kind, mult = 1) {
    const playerData = this.synInit(session.data),
      before = synTier(playerData.syn).i;
    playerData.syn += Math.round((SYN_GAIN[kind] || 0) * mult);
    const t = synTier(playerData.syn);
    if (t.i > before) {
      this.toast(
        session,
        `The Syndicate takes notice: you are now ${t.i === 1 ? 'an' : 'a'} ${t.name}.`,
      );
      this.log(playerData, `Syndicate standing: ${t.name}.`);
    }
    if (t.i >= 2 && Math.random() < 0.5)
      playerData.rep.quantum = clampStanding((playerData.rep.quantum || 0) - 1); // the Concord notices too
  },
  // ------------------------------------------------------------------ black market: outlaw worlds, and any spaceport bar once you are a Lieutenant
  /**
   * Check whether black market services are accessible at a given stellar body.
   * @param {StellarBody} stellarBody - Stellar body or station.
   * @param {PlayerData} playerData - Saved player data.
   * @returns {boolean} True if black market is accessible.
   */
  blackMarketAt(stellarBody, playerData) {
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
  blackMarket(stellarBody, playerData) {
    if (!this.blackMarketAt(stellarBody, playerData)) return null;
    const t = synTier(playerData.syn).i;
    return {
      tier: synTier(playerData.syn),
      items: BLACK_MARKET.map((x) => ({ ...x, locked: x.tier > t ? SYN_TIERS[x.tier][1] : null })),
    };
  },
  /**
   * Purchase an item or service from the black market fence.
   * @param {Session} session - Player session.
   * @param {string} id - Black market item identifier.
   * @returns {void}
   */
  bmBuy(session, id) {
    const playerData = this.synInit(session.data),
      p = STELLARS[playerData.stellar],
      it = BLACK_MARKET.find((x) => x.id === id);
    if (!it || !this.blackMarketAt(p, playerData)) return;
    if (synTier(playerData.syn).i < it.tier)
      return this.toast(
        session,
        `The fence won't sell that to anyone below ${SYN_TIERS[it.tier][1]}.`,
      );
    if (playerData.credits < it.price)
      return this.toast(session, `That costs ${credits(it.price)} credits.`);
    const g = it.give;
    if (g.papers) {
      // your worst grudge is quietly forgiven
      const worst = Object.entries(playerData.rep)
        .filter(
          ([f]) =>
            FACTIONS[f] && !FACTIONS[f].pirate && !FACTIONS[f].alwaysHostile && !FACTIONS[f].region,
        )
        .sort((a, b) => a[1] - b[1])[0];
      if (!worst || worst[1] >= -10)
        return this.toast(session, 'Nobody is looking for you badly enough to need papers.');
      playerData.rep[worst[0]] = -10;
      this.toast(
        session,
        `New papers. The ${FACTIONS[worst[0]].name} records now show only minor infractions.`,
      );
    }
    if (g.shards) playerData.shards += g.shards;
    if (g.bp) {
      playerData.bp = playerData.bp || {};
      playerData.bp[g.bp[0]] = (playerData.bp[g.bp[0]] || 0) + g.bp[1];
    }
    if (g.parts) {
      playerData.parts = playerData.parts || {};
      playerData.parts[g.parts[0]] = (playerData.parts[g.parts[0]] || 0) + g.parts[1];
    }
    if (g.crate != null) {
      const m = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
      playerData.mats[m][g.crate]++;
      this.toast(session, `Inside: a ${m} ${GRADES[g.crate]} crate.`);
    }
    playerData.credits -= it.price;
    if (!g.papers && g.crate == null) this.toast(session, `Bought: ${it.name}.`);
    this.log(playerData, `Black market: ${it.name} for ${credits(it.price)} credits.`);
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  // ------------------------------------------------------------------ officer promotions and the lower decks
  /**
   * Promote an officer to the next rank, consuming commendations and credits and granting a trait.
   * @param {Session} session - Player session.
   * @param {string} id - Officer identifier.
   * @returns {void}
   */
  promote(session, id) {
    const playerData = this.synInit(session.data),
      officer = (playerData.officers || []).find((x) => x.id === id);
    if (!officer) return;
    const r = (officer.rank || 0) + 1,
      P = PROMOTE[r];
    if (!P) return this.toast(session, `${officer.name} already holds the highest rank.`);
    if (officer.lv < P.lv)
      return this.toast(session, `${officer.name} needs level ${P.lv} to become ${RANKS_OFF[r]}.`);
    if (playerData.shards < P.shards || playerData.credits < P.credits)
      return this.toast(
        session,
        `Promotion to ${RANKS_OFF[r]} takes ${P.shards} commendations and ${credits(P.credits)} credits.`,
      );
    playerData.shards -= P.shards;
    playerData.credits -= P.credits;
    officer.rank = r;
    officer.traits = officer.traits || [];
    const pool = Object.keys(TRAITS).filter((t) => !officer.traits.includes(t)),
      t = pool[Math.floor(Math.random() * pool.length)];
    if (t) officer.traits.push(t);
    this.toast(
      session,
      `${officer.name} is promoted to ${RANKS_OFF[r]}${t ? ` and learns ${TRAITS[t].name}` : ''}.`,
    );
    this.log(playerData, `${officer.name} promoted to ${RANKS_OFF[r]}.`);
    this.db.touch();
    this.you(session);
    if (playerData.stellar) this.landed(session);
  },
  /**
   * Hire or dismiss lower-deck crew members.
   * @param {Session} session - Player session.
   * @param {{i: number, op: 'hire' | 'dismiss', kind: string}} m - Lower deck management message.
   * @returns {void}
   */
  lowerDeck(session, m) {
    const playerData = this.synInit(session.data),
      i = m.i | 0;
    if (i < 0 || i >= LOWER_SLOTS) return;
    if (m.op === 'hire') {
      const C = LOWER_DECK[m.kind];
      if (!C || !playerData.stellar) return;
      if (playerData.lower.includes(m.kind))
        return this.toast(session, `You already have a ${C.name} aboard.`);
      if (playerData.lower[i])
        return this.toast(session, 'That berth is taken. Dismiss its crew member first.'); // 2.0.3
      if (playerData.credits < C.cost)
        return this.toast(session, `Hiring a ${C.name} costs ${credits(C.cost)} credits.`);
      playerData.credits -= C.cost;
      playerData.lower[i] = m.kind;
      this.toast(session, `${C.name} hired for the lower deck (${C.desc}).`);
    } else if (m.op === 'dismiss') {
      if (playerData.lower[i])
        this.toast(session, `${LOWER_DECK[playerData.lower[i]].name} dismissed.`);
      playerData.lower[i] = null;
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
  bankAt(stellarBody) {
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
  bankInfo(playerData) {
    this.synInit(playerData);
    const L = playerData.loan;
    return {
      credit: playerData.credit,
      rate: loanRate(playerData.credit),
      max: maxLoan(playerData.credit, playerData.stats.earned),
      bal: L ? L.bal : 0,
      next: L ? L.next : 0,
      pay: L ? loanPayment(L.bal, playerData.credit) : 0,
      period: BANK.periodMin,
    };
  },
  /**
   * Process borrowing or loan repayment bank operations.
   * @param {Session} session - Player session.
   * @param {{op: 'borrow' | 'pay', amt: number | string}} m - Bank operation message.
   * @returns {void}
   */
  bankOp(session, m) {
    const playerData = this.synInit(session.data),
      p = STELLARS[playerData.stellar];
    if (!this.bankAt(p)) return this.toast(session, 'Banking is done at a trade port.');
    const B = this.bankInfo(playerData);
    if (m.op === 'borrow') {
      const amt = Math.floor(Math.max(0, +m.amt || 0) / 1000) * 1000;
      if (!amt) return;
      if (B.bal + amt > B.max)
        return this.toast(
          session,
          `The bank will lend you at most ${credits(B.max)} credits in total.`,
        );
      playerData.loan = playerData.loan || { bal: 0, next: Date.now() + BANK.periodMin * 60000 };
      playerData.loan.bal += amt;
      playerData.credits += amt;
      this.toast(
        session,
        `Loan approved: ${credits(amt)} credits. Payments of about ${credits(loanPayment(playerData.loan.bal, playerData.credit))} every ${BANK.periodMin} minutes of play.`,
      );
      this.log(playerData, `Borrowed ${credits(amt)} credits.`);
    } else if (m.op === 'pay') {
      if (!playerData.loan) return;
      const amt = Math.min(
        playerData.loan.bal,
        Math.max(0, Math.floor(+m.amt || 0)),
        playerData.credits,
      );
      if (!amt) return;
      playerData.credits -= amt;
      playerData.loan.bal -= amt;
      this.toast(session, `Paid ${credits(amt)} toward your loan.`);
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
  bankTick(session) {
    const playerData = session.data,
      L = playerData.loan;
    if (!L || Date.now() < L.next) return;
    L.next = Date.now() + BANK.periodMin * 60000;
    const interest = Math.ceil(L.bal * loanRate(playerData.credit)),
      pay = loanPayment(L.bal, playerData.credit);
    if (playerData.credits >= pay) {
      playerData.credits -= pay;
      L.bal = L.bal + interest - pay;
      playerData.credit = clamp(playerData.credit + 3, BANK.creditMin, BANK.creditMax);
      this.toast(
        session,
        `Loan payment: ${credits(pay)} credits. ${L.bal > 0 ? `${credits(L.bal)} left.` : ''}`,
      );
    } else {
      L.bal += interest;
      playerData.credit = clamp(playerData.credit - 8, BANK.creditMin, BANK.creditMax);
      this.toast(
        session,
        `Missed a loan payment of ${credits(pay)}. Interest added and your credit rating drops.`,
      );
      this.notify &&
        this.notify(session, 'Missed loan payment', `${credits(pay)} credits were due.`);
    }
    if (L.bal <= 0) {
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
   * @param {() => number} r - Random number generator function.
   * @param {Array<[string, number]>} near - Nearby systems and jump distances.
   * @param {number} win - Offer rotation time window.
   * @param {(sys: string) => StellarBody | null} pickDest - Function to select destination stellar in target system.
   * @returns {Array<Mission>} Extra job and contract offers.
   */
  extraOffers(stellarBody, playerData, r, near, win, pickDest) {
    const out = [];
    if (!near.length) return out;
    const one = (k) => near[Math.floor(r() * near.length)];
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
        label: ['Class trip', 'Business convention', 'Cultural exchange'][Math.floor(r() * 3)],
        min: 20,
        span: 21,
        reason: 'A group booking needs everyone transported together on the same ship.',
      },
    ];
    for (const group of passengerGroups) {
      const [sys, jumps] = one(),
        dest = pickDest(sys);
      if (!dest) continue;
      const pax = group.min + Math.floor(r() * group.span);
      out.push({
        id: `${stellarBody.id}-${win}-${group.key}`,
        type: 'passenger',
        title: `${group.label}: ${pax} passengers to ${dest.name}`,
        sys,
        dest: dest.id,
        pax,
        reward: Math.round(1500 + jumps * 1500 + pax * (600 + jumps * 150)),
        text: `${group.reason} Carry ${pax} passengers to ${dest.name} in the ${SYS[sys].name} system (${jumps} jump${jumps > 1 ? 's' : ''}). Each traveller occupies one dedicated passenger seat. Other passenger missions may share any remaining seats.`,
      });
    }
    if (r() < 0.5) {
      // rush delivery
      const [sys, jumps] = one(),
        dest = pickDest(sys);
      if (dest) {
        const qty = 3 + Math.floor(r() * 10),
          minutes = 5 + jumps * 4;
        out.push({
          id: `${stellarBody.id}-${win}-rush`,
          type: 'cargo',
          rush: minutes,
          cid: 'medical',
          title: `RUSH: ${qty} t of medical supplies to ${dest.name}`,
          sys,
          dest: dest.id,
          qty,
          reward: Math.round((1500 + jumps * 1600 + qty * 90) * RUSH_BONUS),
          text: `An outbreak on ${dest.name} (${SYS[sys].name}). Deliver ${qty} tons of medical supplies within ${minutes} minutes of accepting, or the job fails.`,
        });
      }
    }
    const shady =
      stellarBody.outlaw ||
      FACTIONS[SYS[stellarBody.system].faction].pirate ||
      SYS[stellarBody.system].danger >= 3;
    if (shady) {
      // Syndicate contracts
      const [sys, jumps] = one(),
        dest = pickDest(sys);
      if (dest && r() < 0.6) {
        const qty = 4 + Math.floor(r() * 8);
        out.push({
          id: `${stellarBody.id}-${win}-syn1`,
          type: 'smuggle',
          syn: 'contract',
          title: `SYNDICATE: move ${qty} t of "spare parts" to ${dest.name}`,
          sys,
          dest: dest.id,
          qty,
          reward: Math.round(14000 + jumps * 4000 + qty * 800),
          text: `The Syndicate needs a discreet hauler. Carry ${qty} tons of sealed crates to ${dest.name} in ${SYS[sys].name}. Lawful patrols may scan you.`,
        });
      }
      if (r() < 0.6) {
        const [sys2] = one(),
          fac = ['quantum', 'spacer', 'korrund'][Math.floor(r() * 3)],
          hull = (TRAFFIC[fac].traders || TRAFFIC.spacer.traders)[0] || 704,
          nm = `courier ${['Ostrava', 'Bellwether', 'Gilt Margin', 'Patience', 'Clerk Nine'][Math.floor(r() * 5)]}`;
        out.push({
          id: `${stellarBody.id}-${win}-syn2`,
          type: 'bounty',
          syn: 'hit',
          title: `SYNDICATE HIT: the ${nm}`,
          sys: sys2,
          hull,
          faction: fac,
          targetName: `the ${nm}`,
          reward: Math.round(22000 + (this.A.ships[hull] ? this.A.ships[hull].cost * 0.05 : 5000)),
          text: `The ${nm} carries ledgers the Syndicate wants gone. Destroy it in ${SYS[sys2].name}. The ${FACTIONS[fac].name} will not thank you.`,
        });
      }
    }
    return out;
  },
  /**
   * Verify whether the player meets requirements to accept a mission offer (e.g. passenger bunks).
   * @param {Session} session - Player session.
   * @param {Mission} mission - Mission offer being accepted.
   * @returns {boolean} True if offer requirements are met.
   */
  acceptCheck(session, mission) {
    const playerData = session.data;
    if (mission.type === 'passenger') {
      const cap = bunks(this.A.ships[playerData.ship.hull], playerData.ship),
        used = occupiedPassengerSeats(playerData.missions);
      if (used + mission.pax > cap) {
        this.toast(
          session,
          `Not enough passenger seats: ${used} of ${cap} are occupied; this mission needs ${mission.pax} more.`,
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
  missionDeadlines(session) {
    const playerData = session.data,
      now = Date.now();
    let gone = false;
    for (const m of playerData.missions)
      if (m.deadline && !m.done && !m.warned && m.deadline - now < 120000 && now <= m.deadline) {
        m.warned = true;
        this.toast(session, `⏱ Two minutes left: ${m.title}.`);
      } // 2.4
    for (const m of playerData.missions)
      if (m.deadline && !m.done && now > m.deadline) {
        m.failed = true;
        gone = true;
        const fac = SYS[m.sys] && SYS[m.sys].faction;
        if (m.qty && m.cid && playerData.cargo[m.cid]) {
        } // the cargo stays yours
        if (fac && playerData.rep[fac] != null)
          playerData.rep[fac] = clampStanding(playerData.rep[fac] - 3);
        this.toast(session, `Job failed: ${m.title}. You missed the deadline.`);
        this.log(playerData, `Failed (deadline): ${m.title}.`);
      }
    if (gone) {
      playerData.missions = playerData.missions.filter((m) => !m.failed);
      this.db.touch();
      this.you(session);
    }
  },
};
