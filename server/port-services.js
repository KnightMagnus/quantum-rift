import { bindOperations } from './feature-service.js';
import {
  SYS,
  STELLARS,
  COMMODITIES,
  MATERIALS,
  SITE_PRICES,
  STATION_SHIPS,
  WINGMATES,
  FACTION_HULLS,
  FACTION_OUTFITS,
} from '../shared/galaxy.js';
import {
  price,
  credits,
  loadoutValue,
  makeLoadout,
  ensureStockOutfits,
  stockOutfitLimit,
  outfitSaleValue,
} from '../shared/rules.js';
import { purchaseUnit, saleValue } from './trade-pricing.js';
import { assertLots, addLots, commonLots, planTake, applyTake } from '../shared/cargo-lots.js';
import { recordEconomy } from '../shared/economy-receipt.js';
import { WING_ONLY } from '../shared/docks.js';

/** @import { GradeLots } from '../shared/cargo-contracts.js' */
/** @import { Game } from './game.js' */

/** @typedef {import('./game.js').Session} Session */
/** @typedef {import('./game.js').PlayerData} PlayerData */
/** @typedef {import('./game.js').StellarBody} StellarBody */
/** @typedef {import('./game.js').MarketItem} MarketItem */
/**
 * Ordinary port commerce owns commodity/material transactions, shipyard and
 * outfitter operations. Uses the existing account and shared pricing/grade rules;
 * there is no copied inventory, new save path or economic authority in the UI.
 * Legacy bodies remain unchecked; the capability signature is not wire validation.
 * @typedef {Pick<Game,
 *   'A' |
 *   'O' |
 *   'db' |
 *   'features' |
 *   'fitsJobs' |
 *   'holdUsed' |
 *   'jobBunks' |
 *   'landed' |
 *   'log' |
 *   'market' |
 *   'matsFor' |
 *   'outfitter' |
 *   'ownSite' |
 *   'siteOwner' |
 *   'toast' |
 *   'tradeIn' |
 *   'tut' |
 *   'yard' |
 *   'you'>} PortCapabilities
 * @typedef {Pick<Game,
 *   'market' |
 *   'trade' |
 *   'matsFor' |
 *   'buyMat' |
 *   'yard' |
 *   'tradeIn' |
 *   'buyShip' |
 *   'outfitter' |
 *   'outfit'>} PortService
 */

/** @param {PortCapabilities} capabilities @returns {PortService} */
export function createPortService(capabilities) {
  return bindOperations(PortOperations, capabilities);
}

const MAT_PRICE = [6000, 18000, 45000, 110000, 260000];

const PortOperations = {
  /**
   * Generates commodity market prices for a stellar port, applying flash and state modifiers.
   * @param {StellarBody} p Stellar port.
   * @returns {MarketItem[] | null} Array of traded commodities and pricing, or null.
   * @this {PortCapabilities}
   */
  market(p) {
    if (p.site) {
      const o = this.siteOwner(p.id);
      return o && o.station.ops >= 1
        ? COMMODITIES.map((c) => ({
            id: c.id,
            name: c.name,
            ...(c.id === 'composite_plating'
              ? { sellCap: this.features.refinery.sellRoom(p.id, Number.MAX_SAFE_INTEGER) }
              : {}),
            price: price({ ...p, prices: SITE_PRICES }, c.id),
          })).filter((x) => x.price !== null)
        : null;
    }
    if (!p.svc.includes('T')) return null;
    const now = Date.now();
    return COMMODITIES.map((c) => {
      const pr = price(p, c.id, now),
        lm = this.features.living.livingMult(p, c.id);
      return {
        id: c.id,
        name: c.name,
        ...(c.id === 'composite_plating'
          ? { sellCap: this.features.refinery.sellRoom(p.id, Number.MAX_SAFE_INTEGER) }
          : {}),
        price:
          pr === null ? null : Math.round(pr * this.features.rivals.flashMult(p.id, c.id) * lm),
        flash: this.features.rivals.flashMult(p.id, c.id) !== 1,
        moved: Math.round((lm - 1) * 100),
      };
    }).filter((x) => x.price !== null); // 1.1: market flashes; 2.4: system states and what captains sold here
  },
  /**
   * Executes commodity purchase or sale transaction with market depth price impact.
   * @param {Session} s Player session.
   * @param {string} cid Commodity ID.
   * @param {number} qty Amount to buy (>0) or sell (<0).
   * @param {GradeLots|'common-first'} [selection]
   * @returns {void}
   * @this {PortCapabilities}
   */
  trade(s, cid, qty, selection = 'common-first') {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    try {
      assertLots(d.cargo, d.cargoLots);
    } catch {
      return this.toast(s, 'Cargo validation failed.');
    }
    if (this.db.economicFrozen) return;
    const captured = Date.now();
    const pr0 = price(p.site ? { ...p, prices: SITE_PRICES } : p, cid, captured);
    if (pr0 === null || !qty || !this.market(p)) return;
    const pr = p.site
      ? pr0
      : Math.round(
          pr0 * this.features.rivals.flashMult(p.id, cid) * this.features.living.livingMult(p, cid),
        );
    const st = this.features.shipStats.stats(d),
      used = this.holdUsed(d);
    if (qty > 0) {
      const tb = (this.features.bonuses.bonus(d).tradePct || 0) / 100;
      qty = Math.min(qty, st.cargo - used);
      while (qty > 0 && qty * purchaseUnit(pr, qty, tb * 100, !!p.site) > d.credits)
        qty = Math.min(qty - 1, Math.floor(d.credits / purchaseUnit(pr, qty, tb * 100, !!p.site)));
      const bp = purchaseUnit(pr, qty, tb * 100, !!p.site);
      if (qty <= 0) return this.toast(s, 'No room or no money for that.');
      d.paid = d.paid || {};
      d.paid[cid] = Math.round(
        ((d.paid[cid] || bp) * (d.cargo[cid] || 0) + bp * qty) / ((d.cargo[cid] || 0) + qty),
      ); // 2.4: what you paid, on average
      addLots(d.cargo, d.cargoLots, commonLots(cid, qty), Math.max(0, st.cargo - used));
      d.credits -= qty * bp;
      recordEconomy(d, p.id, 'purchases', qty * bp);
      if (!p.site) this.features.living.addImpact(p.id, cid, -qty); // 2.4: buying raises the local price
    } else {
      const have = d.cargo[cid] || 0;
      qty = Math.min(-qty, have);
      if (cid === 'composite_plating') qty = this.features.refinery.sellRoom(p.id, qty, captured);
      if (!qty) return this.toast(s, 'No sale inventory or finite buyer demand remaining.');
      let take;
      try {
        take = planTake(d.cargo, d.cargoLots, cid, qty, selection);
      } catch {
        return this.toast(s, 'Those cargo grades are unavailable.');
      }
      const sale = saleValue(
        pr,
        take.grades,
        this.features.bonuses.bonus(d).tradePct || 0,
        !!p.site,
        this.features.fronts.mods(p.system).sell,
      );
      applyTake(d.cargo, d.cargoLots, take);
      if (cid === 'composite_plating') this.features.refinery.sold(p.id, qty, captured);
      this.features.fronts.goal(s, 'trade', sale);
      d.credits += sale - qty * pr;
      d.credits += qty * pr;
      recordEconomy(d, p.id, 'sales', sale);
      if (!d.cargo[cid]) {
        delete d.cargo[cid];
        if (d.paid) delete d.paid[cid];
      }
      d.stats.earned += qty * pr;
      this.tut(s, 'sell');
      if (!p.site) {
        this.features.living.addImpact(p.id, cid, qty);
        this.features.living.stateProgress(s, p.system, 'cid:' + cid, qty);
      } // 2.4: selling lowers it, and feeds a famine or a rush
    }
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  /**
   * Lists upgrade materials for sale at a stellar body based on faction specialization.
   * @param {StellarBody} p Stellar body.
   * @param {PlayerData} [d] Player data.
   * @returns {Array<{mat: string, grade: number, price: number}>} Upgrade materials available.
   * @this {PortCapabilities}
   */
  matsFor(p, d) {
    const fac = SYS[p.system].faction,
      out = [];
    if (p.hub || (d && this.ownSite(d, p) && d.station.ops >= 1))
      MATERIALS.forEach((m) =>
        [0, 1].forEach((g) => out.push({ mat: m, grade: g, price: MAT_PRICE[g] })),
      );
    if (p.site) return out;
    const special = {
      korrund: ['alloy', 2],
      ylith: ['crystal', 2],
      thalassi: ['isotope', 2],
      quevari: ['crystal', 3],
    }[fac];
    if (special && p.svc.includes('T'))
      out.push({ mat: special[0], grade: special[1], price: MAT_PRICE[special[1]] });
    return out;
  },
  /**
   * Executes purchase or sale of crafting and upgrade materials.
   * @param {Session} s Player session.
   * @param {string} mat Material name ('alloy', 'crystal', 'isotope').
   * @param {number} grade Material grade index (0-4).
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   * @this {PortCapabilities}
   */
  buyMat(s, mat, grade, n) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const offer = this.matsFor(p, d).find((o) => o.mat === mat && o.grade === grade);
    if (!offer) return;
    if (n > 0) {
      n = Math.min(n, Math.floor(d.credits / offer.price));
      if (!n) return this.toast(s, 'Not enough credits.');
      d.credits -= n * offer.price;
      d.mats[mat][grade] += n;
    } else {
      n = Math.min(-n, d.mats[mat][grade]);
      d.credits += Math.round(n * offer.price * 0.6);
      d.mats[mat][grade] -= n;
    }
    this.db.touch();
    this.you(s);
  },

  // ------------------------------------------------------------------ shipyard and outfitter
  /**
   * Compiles list of ship hulls available for purchase at shipyard.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} [d] Player data.
   * @returns {number[] | null} Array of hull IDs for sale, or null.
   * @this {PortCapabilities}
   */
  yard(p, d) {
    if (p.site) {
      // your Personal Station sells the station ships for its Station Tier
      if (!this.ownSite(d, p) || d.station.ops < 3) return null;
      const list = new Set();
      for (const [lv, hs] of Object.entries(STATION_SHIPS))
        if (d.station.ops >= +lv) hs.forEach((h) => list.add(h));
      for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713]) list.add(h);
      if (d.station.ops >= 4) WINGMATES.forEach((h) => list.add(h)); // 2.1: wingmate ships (2.6: the Armada escort hulls are retired)
      return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
    }
    if (!p.svc.includes('Y')) return null;
    const fac = SYS[p.system].faction,
      list = new Set();
    for (const h of FACTION_HULLS[fac] || []) {
      const H = this.A.ships[h];
      if (H && (H.tech <= p.tech || H.tech >= 400)) list.add(h);
    }
    if (fac !== 'quevari' && fac !== 'umbral')
      for (const h of [703, 704, 705, 706, 707, 708, 709, 710, 820, 821, 822])
        if (this.A.ships[h].tech <= p.tech) list.add(h); // 2.3: the Wasp, Swift and Pelican are sold everywhere
    return [...list].sort((a, b) => this.A.ships[a].cost - this.A.ships[b].cost);
  },
  /**
   * Calculates credit trade-in value for captain's current ship and outfits (50% value).
   * @param {PlayerData} d Player save data.
   * @returns {number} Credit trade-in value of current ship and installed outfits.
   * @this {PortCapabilities}
   */
  tradeIn(d) {
    if (d.shipless) return 0;
    return loadoutValue(this.A, d.ship);
  },
  /**
   * Purchases a new flagship hull, applying trade-in credit for previous ship.
   * @param {Session} s Player session.
   * @param {number} hull Hull ID to purchase.
   * @returns {void}
   * @this {PortCapabilities}
   */
  buyShip(s, hull) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent) return;
    const yard = this.yard(p, d) || [];
    if (!yard.includes(hull)) return;
    if (WING_ONLY.includes(hull)) return this.features.docks.buyToHangar(s, hull); // 2.1: escort hulls go straight to the hangar
    const H = this.A.ships[hull],
      cost = H.cost - this.tradeIn(d);
    if (d.credits < cost)
      return this.toast(s, `You need ${credits(cost)} credits (after your trade-in).`);
    {
      const why = this.fitsJobs(d, hull);
      if (why) return this.toast(s, why + ' Sell cargo or finish jobs first.');
    }
    d.credits -= cost;
    this.log(d, `Bought a ${H.name} at ${p.name}.`);
    d.ship = makeLoadout(this.A, hull, d.shipless ? 'Rift Runner' : d.ship.name);
    d.shipless = false;
    d.fuel = undefined;
    this.features.docks.leadChanged(d);
    this.db.touch();
    this.you(s);
    this.landed(s);
    this.toast(s, `The ${H.name} is yours.`);
  },
  /**
   * Compiles list of ship outfits available for purchase at outfitter.
   * @param {StellarBody} p Stellar port.
   * @param {PlayerData} [d] Player data.
   * @returns {number[] | null} Array of outfit IDs for sale, or null.
   * @this {PortCapabilities}
   */
  outfitter(p, d) {
    if (p.site && !(d && this.ownSite(d, p) && d.station.ops >= 2)) return null;
    if (!p.site && !p.svc.includes('O')) return null;
    const fac = p.site ? 'quantum' : SYS[p.system].faction,
      list = [];
    for (const o of Object.values(this.O)) {
      if (o.faction && o.faction !== fac) continue;
      const special = FACTION_OUTFITS[fac] && FACTION_OUTFITS[fac].includes(o.id);
      if (special || ((o.tech <= p.tech || p.site) && o.tech < 100 && !(fac === 'umbral'))) {
        if (o.tech >= 7 && !special && !(p.hub || p.site || fac === 'quantum')) continue; // quantum tech only in Concord space
        list.push(o.id);
      }
    }
    return list.sort((a, b) => this.O[a].cost - this.O[b].cost);
  },
  /**
   * Purchases or sells a ship outfit or ammunition batch.
   * @param {Session} s Player session.
   * @param {number} id Outfit ID.
   * @param {number} n Quantity to buy (>0) or sell (<0).
   * @returns {void}
   * @this {PortCapabilities}
   */
  outfit(s, id, n) {
    const d = s.data,
      p = STELLARS[d.stellar];
    if (!p || s.ent || !n) return;
    const o = this.O[id];
    if (!o) return;
    if (d.shipless)
      return this.toast(
        s,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    const list = this.outfitter(p, d);
    if (!list) return this.toast(s, 'There is no outfitter here.');
    if (n > 0 && !list.includes(id)) return;
    const st = this.features.shipStats.stats(d);
    if (n > 0) {
      if (
        o.eff.towRig &&
        (st.cargo < 60 || ['fighter', 'interceptor'].includes(this.A.ships[d.ship.hull].role))
      )
        return this.toast(s, 'Tow Rig requires a non-fighter hull with at least 60t cargo.');
      if (o.eff.ammo) {
        // ammunition: needs the launcher
        const w = o.eff.ammo,
          H = this.A.ships[d.ship.hull];
        const launchers = st.weapons[w] || 0;
        if (!launchers) return this.toast(s, 'You have nothing that fires that.');
        const have = d.ship.ammo[w] ?? 0;
        const cap = o.max * launchers;
        const k = Math.min(n, cap - have, Math.floor(d.credits / o.cost));
        if (k <= 0) return this.toast(s, 'Magazines full or not enough credits.');
        d.ship.ammo[w] = have + k;
        d.credits -= k * o.cost;
      } else {
        ensureStockOutfits(this.A, d.ship);
        const cur = d.ship.outfits[id] || 0;
        const limit = stockOutfitLimit(this.A, d.ship, id);
        if (cur + n > limit) return this.toast(s, `You can carry at most ${limit}.`);
        if ((o.mass || 0) * n > st.free) return this.toast(s, 'Not enough free space.');
        if (o.eff.weapon && o.turret && st.turrets + n > st.maxTurrets)
          return this.toast(s, 'No free turret mounts.');
        if (o.eff.weapon && !o.turret && st.guns + n > st.maxGuns)
          return this.toast(s, 'No free gun mounts.');
        if (d.credits < o.cost * n) return this.toast(s, 'Not enough credits.');
        d.credits -= o.cost * n;
        d.ship.outfits[id] = cur + n;
      }
    } else {
      const cur = d.ship.outfits[id] || 0,
        k = Math.min(cur, -n);
      if (!k) return;
      if (o.eff.cargo && this.holdUsed(d) > st.cargo - o.eff.cargo * k)
        return this.toast(s, 'Sell cargo first.');
      if (o.eff.passengerSeats && this.jobBunks(d) > st.passengerSeats - o.eff.passengerSeats * k)
        return this.toast(s, 'Deliver your passengers before removing their seats.');
      const refund = outfitSaleValue(this.A, d.ship, id, k);
      d.ship.outfits[id] = cur - k;
      if (!d.ship.outfits[id]) delete d.ship.outfits[id];
      d.credits += refund;
    }
    this.db.touch();
    this.you(s);
  },
};
