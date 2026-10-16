// 1.2 "Syndicate and Officers": Syndicate standing and the black market, officer promotions and traits, lower-deck
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

/**
 * Clamp a numeric value between minimum and maximum bounds.
 * @param {number} v - Value to clamp.
 * @param {number} a - Minimum value.
 * @param {number} b - Maximum value.
 * @returns {number} Clamped value.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** @type {string[]} Mission types that complete upon reaching their destination. */
const DEST_TYPES = ['cargo', 'smuggle', 'passenger', 'expret', 'supply']; // 2.4: supply jobs complete at their destination
/**
 * Check whether a mission completes at its destination.
 * @param {{type: string}} m - Mission object to check.
 * @returns {boolean} True if the mission completes at destination.
 */
export const destType = (m) => DEST_TYPES.includes(m.type);

export const SyndicateOperations = {
  /**
   * Initialize or default Syndicate standing, commendations, lower deck crew, and credit rating.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, any>} Initialized player data.
   */
  synInit(d) {
    d.syn = d.syn || 0;
    d.shards = d.shards || 0;
    d.lower = d.lower || [];
    d.credit = d.credit || BANK.credit0;
    return d;
  },
  /**
   * Award Syndicate standing and notify player of rank increases.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} kind - Standing gain category.
   * @param {number} [mult=1] - Standing gain multiplier.
   * @returns {void}
   */
  synGain(s, kind, mult = 1) {
    const d = this.synInit(s.data),
      before = synTier(d.syn).i;
    d.syn += Math.round((SYN_GAIN[kind] || 0) * mult);
    const t = synTier(d.syn);
    if (t.i > before) {
      this.toast(s, `The Syndicate takes notice: you are now ${t.i === 1 ? 'an' : 'a'} ${t.name}.`);
      this.log(d, `Syndicate standing: ${t.name}.`);
    }
    if (t.i >= 2 && Math.random() < 0.5) d.rep.quantum = clamp((d.rep.quantum || 0) - 1, -100, 100); // the Concord notices too
  },
  // ------------------------------------------------------------------ black market: outlaw worlds, and any spaceport bar once you are a Lieutenant
  /**
   * Check whether black market services are accessible at a given stellar body.
   * @this {any}
   * @param {any} p - Stellar body or station.
   * @param {Record<string, any>} d - Saved player data.
   * @returns {boolean} True if black market is accessible.
   */
  blackMarketAt(p, d) {
    return !!p && !p.site && (p.outlaw || (p.svc.includes('B') && synTier(d.syn).i >= 3));
  },
  /**
   * Retrieve black market stock and tier access details for a stellar body.
   * @this {any}
   * @param {any} p - Stellar body or station.
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, any> | null} Black market inventory payload or null.
   */
  blackMarket(p, d) {
    if (!this.blackMarketAt(p, d)) return null;
    const t = synTier(d.syn).i;
    return {
      tier: synTier(d.syn),
      items: BLACK_MARKET.map((x) => ({ ...x, locked: x.tier > t ? SYN_TIERS[x.tier][1] : null })),
    };
  },
  /**
   * Purchase an item or service from the black market fence.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} id - Black market item identifier.
   * @returns {void}
   */
  bmBuy(s, id) {
    const d = this.synInit(s.data),
      p = STELLARS[d.stellar],
      it = BLACK_MARKET.find((x) => x.id === id);
    if (!it || !this.blackMarketAt(p, d)) return;
    if (synTier(d.syn).i < it.tier)
      return this.toast(s, `The fence won't sell that to anyone below ${SYN_TIERS[it.tier][1]}.`);
    if (d.credits < it.price) return this.toast(s, `That costs ${credits(it.price)} credits.`);
    const g = it.give;
    if (g.papers) {
      // your worst grudge is quietly forgiven
      const worst = Object.entries(d.rep)
        .filter(
          ([f]) =>
            FACTIONS[f] && !FACTIONS[f].pirate && !FACTIONS[f].alwaysHostile && !FACTIONS[f].region,
        )
        .sort((a, b) => a[1] - b[1])[0];
      if (!worst || worst[1] >= -10)
        return this.toast(s, 'Nobody is looking for you badly enough to need papers.');
      d.rep[worst[0]] = -10;
      this.toast(
        s,
        `New papers. The ${FACTIONS[worst[0]].name} records now show only minor infractions.`,
      );
    }
    if (g.shards) d.shards += g.shards;
    if (g.bp) {
      d.bp = d.bp || {};
      d.bp[g.bp[0]] = (d.bp[g.bp[0]] || 0) + g.bp[1];
    }
    if (g.parts) {
      d.parts = d.parts || {};
      d.parts[g.parts[0]] = (d.parts[g.parts[0]] || 0) + g.parts[1];
    }
    if (g.crate != null) {
      const m = MATERIALS[Math.floor(Math.random() * MATERIALS.length)];
      d.mats[m][g.crate]++;
      this.toast(s, `Inside: a ${m} ${GRADES[g.crate]} crate.`);
    }
    d.credits -= it.price;
    if (!g.papers && g.crate == null) this.toast(s, `Bought: ${it.name}.`);
    this.log(d, `Black market: ${it.name} for ${credits(it.price)} credits.`);
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  // ------------------------------------------------------------------ officer promotions and the lower decks
  /**
   * Promote an officer to the next rank, consuming commendations and credits and granting a trait.
   * @this {any}
   * @param {any} s - Player session.
   * @param {string} id - Officer identifier.
   * @returns {void}
   */
  promote(s, id) {
    const d = this.synInit(s.data),
      o = (d.officers || []).find((x) => x.id === id);
    if (!o) return;
    const r = (o.rank || 0) + 1,
      P = PROMOTE[r];
    if (!P) return this.toast(s, `${o.name} already holds the highest rank.`);
    if (o.lv < P.lv)
      return this.toast(s, `${o.name} needs level ${P.lv} to become ${RANKS_OFF[r]}.`);
    if (d.shards < P.shards || d.credits < P.credits)
      return this.toast(
        s,
        `Promotion to ${RANKS_OFF[r]} takes ${P.shards} commendations and ${credits(P.credits)} credits.`,
      );
    d.shards -= P.shards;
    d.credits -= P.credits;
    o.rank = r;
    o.traits = o.traits || [];
    const pool = Object.keys(TRAITS).filter((t) => !o.traits.includes(t)),
      t = pool[Math.floor(Math.random() * pool.length)];
    if (t) o.traits.push(t);
    this.toast(
      s,
      `${o.name} is promoted to ${RANKS_OFF[r]}${t ? ` and learns ${TRAITS[t].name}` : ''}.`,
    );
    this.log(d, `${o.name} promoted to ${RANKS_OFF[r]}.`);
    this.db.touch();
    this.you(s);
    if (d.stellar) this.landed(s);
  },
  /**
   * Hire or dismiss lower-deck crew members.
   * @this {any}
   * @param {any} s - Player session.
   * @param {{i: number, op: 'hire' | 'dismiss', kind: string}} m - Lower deck management message.
   * @returns {void}
   */
  lowerDeck(s, m) {
    const d = this.synInit(s.data),
      i = m.i | 0;
    if (i < 0 || i >= LOWER_SLOTS) return;
    if (m.op === 'hire') {
      const C = LOWER_DECK[m.kind];
      if (!C || !d.stellar) return;
      if (d.lower.includes(m.kind)) return this.toast(s, `You already have a ${C.name} aboard.`);
      if (d.lower[i]) return this.toast(s, 'That berth is taken. Dismiss its crew member first.'); // 2.0.3
      if (d.credits < C.cost)
        return this.toast(s, `Hiring a ${C.name} costs ${credits(C.cost)} credits.`);
      d.credits -= C.cost;
      d.lower[i] = m.kind;
      this.toast(s, `${C.name} hired for the lower deck (${C.desc}).`);
    } else if (m.op === 'dismiss') {
      if (d.lower[i]) this.toast(s, `${LOWER_DECK[d.lower[i]].name} dismissed.`);
      d.lower[i] = null;
    }
    this.db.touch();
    this.you(s);
    if (d.stellar) this.landed(s);
  },
  // ------------------------------------------------------------------ the bank
  /**
   * Check whether banking services are available at a stellar body.
   * @this {any}
   * @param {any} p - Stellar body or station.
   * @returns {boolean} True if banking services are available.
   */
  bankAt(p) {
    return !!p && !p.site && (p.hub || p.svc.includes('T')) && !p.outlaw;
  },
  /**
   * Retrieve bank account, loan balance, and payment schedule details.
   * @this {any}
   * @param {Record<string, any>} d - Saved player data.
   * @returns {Record<string, any>} Bank account and loan information.
   */
  bankInfo(d) {
    this.synInit(d);
    const L = d.loan;
    return {
      credit: d.credit,
      rate: loanRate(d.credit),
      max: maxLoan(d.credit, d.stats.earned),
      bal: L ? L.bal : 0,
      next: L ? L.next : 0,
      pay: L ? loanPayment(L.bal, d.credit) : 0,
      period: BANK.periodMin,
    };
  },
  /**
   * Process borrowing or loan repayment bank operations.
   * @this {any}
   * @param {any} s - Player session.
   * @param {{op: 'borrow' | 'pay', amt: number | string}} m - Bank operation message.
   * @returns {void}
   */
  bankOp(s, m) {
    const d = this.synInit(s.data),
      p = STELLARS[d.stellar];
    if (!this.bankAt(p)) return this.toast(s, 'Banking is done at a trade port.');
    const B = this.bankInfo(d);
    if (m.op === 'borrow') {
      const amt = Math.floor(Math.max(0, +m.amt || 0) / 1000) * 1000;
      if (!amt) return;
      if (B.bal + amt > B.max)
        return this.toast(s, `The bank will lend you at most ${credits(B.max)} credits in total.`);
      d.loan = d.loan || { bal: 0, next: Date.now() + BANK.periodMin * 60000 };
      d.loan.bal += amt;
      d.credits += amt;
      this.toast(
        s,
        `Loan approved: ${credits(amt)} credits. Payments of about ${credits(loanPayment(d.loan.bal, d.credit))} every ${BANK.periodMin} minutes of play.`,
      );
      this.log(d, `Borrowed ${credits(amt)} credits.`);
    } else if (m.op === 'pay') {
      if (!d.loan) return;
      const amt = Math.min(d.loan.bal, Math.max(0, Math.floor(+m.amt || 0)), d.credits);
      if (!amt) return;
      d.credits -= amt;
      d.loan.bal -= amt;
      this.toast(s, `Paid ${credits(amt)} toward your loan.`);
      if (d.loan.bal <= 0) {
        d.loan = null;
        d.credit = clamp(d.credit + 15, BANK.creditMin, BANK.creditMax);
        this.toast(s, 'Loan paid off. Your credit rating improves.');
      }
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  /**
   * Process periodic loan interest, scheduled payment deduction, and credit score changes.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  bankTick(s) {
    const d = s.data,
      L = d.loan;
    if (!L || Date.now() < L.next) return;
    L.next = Date.now() + BANK.periodMin * 60000;
    const interest = Math.ceil(L.bal * loanRate(d.credit)),
      pay = loanPayment(L.bal, d.credit);
    if (d.credits >= pay) {
      d.credits -= pay;
      L.bal = L.bal + interest - pay;
      d.credit = clamp(d.credit + 3, BANK.creditMin, BANK.creditMax);
      this.toast(
        s,
        `Loan payment: ${credits(pay)} credits. ${L.bal > 0 ? `${credits(L.bal)} left.` : ''}`,
      );
    } else {
      L.bal += interest;
      d.credit = clamp(d.credit - 8, BANK.creditMin, BANK.creditMax);
      this.toast(
        s,
        `Missed a loan payment of ${credits(pay)}. Interest added and your credit rating drops.`,
      );
      this.notify && this.notify(s, 'Missed loan payment', `${credits(pay)} credits were due.`);
    }
    if (L.bal <= 0) {
      d.loan = null;
      d.credit = clamp(d.credit + 15, BANK.creditMin, BANK.creditMax);
      this.toast(s, 'Loan paid off. Your credit rating improves.');
    }
    this.db.touch();
    this.you(s);
  },
  // ------------------------------------------------------------------ extra jobs: passengers, rush deliveries, Syndicate contracts
  /**
   * Generate extra mission offers including passenger transport, rush cargo deliveries, and Syndicate contracts.
   * @this {any}
   * @param {any} p - Current stellar body.
   * @param {Record<string, any>} d - Saved player data.
   * @param {() => number} r - Random number generator function.
   * @param {Array<[string, number]>} near - Nearby systems and jump distances.
   * @param {number} win - Offer rotation time window.
   * @param {(sys: string) => any} pickDest - Function to select destination stellar in target system.
   * @returns {Array<Record<string, any>>} Extra job and contract offers.
   */
  extraOffers(p, d, r, near, win, pickDest) {
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
        id: `${p.id}-${win}-${group.key}`,
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
          id: `${p.id}-${win}-rush`,
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
    const shady = p.outlaw || FACTIONS[SYS[p.system].faction].pirate || SYS[p.system].danger >= 3;
    if (shady) {
      // Syndicate contracts
      const [sys, jumps] = one(),
        dest = pickDest(sys);
      if (dest && r() < 0.6) {
        const qty = 4 + Math.floor(r() * 8);
        out.push({
          id: `${p.id}-${win}-syn1`,
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
          id: `${p.id}-${win}-syn2`,
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
   * @this {any}
   * @param {any} s - Player session.
   * @param {Record<string, any>} o - Mission offer being accepted.
   * @returns {boolean} True if offer requirements are met.
   */
  acceptCheck(s, o) {
    const d = s.data;
    if (o.type === 'passenger') {
      const cap = bunks(this.A.ships[d.ship.hull], d.ship),
        used = occupiedPassengerSeats(d.missions);
      if (used + o.pax > cap) {
        this.toast(
          s,
          `Not enough passenger seats: ${used} of ${cap} are occupied; this mission needs ${o.pax} more.`,
        );
        return false;
      }
    }
    return true;
  },
  /**
   * Check active missions against their deadlines, notifying of impending expiration or penalizing failures.
   * @this {any}
   * @param {any} s - Player session.
   * @returns {void}
   */
  missionDeadlines(s) {
    const d = s.data,
      now = Date.now();
    let gone = false;
    for (const m of d.missions)
      if (m.deadline && !m.done && !m.warned && m.deadline - now < 120000 && now <= m.deadline) {
        m.warned = true;
        this.toast(s, `⏱ Two minutes left: ${m.title}.`);
      } // 2.4
    for (const m of d.missions)
      if (m.deadline && !m.done && now > m.deadline) {
        m.failed = true;
        gone = true;
        const fac = SYS[m.sys] && SYS[m.sys].faction;
        if (m.qty && m.cid && d.cargo[m.cid]) {
        } // the cargo stays yours
        if (fac && d.rep[fac] != null) d.rep[fac] = clamp(d.rep[fac] - 3, -100, 100);
        this.toast(s, `Job failed: ${m.title}. You missed the deadline.`);
        this.log(d, `Failed (deadline): ${m.title}.`);
      }
    if (gone) {
      d.missions = d.missions.filter((m) => !m.failed);
      this.db.touch();
      this.you(s);
    }
  },
};
