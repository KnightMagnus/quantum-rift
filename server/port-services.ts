export interface PortOperations {
  market(this: PortCapabilities, stellarBody: StellarBody): MarketItem[] | null;
  trade(
    this: PortCapabilities,
    session: Session,
    commodityId: string,
    quantity: number,
    selection?: GradeLots | 'common-first',
  ): void;
  matsFor(
    this: PortCapabilities,
    stellarBody: StellarBody,
    playerData?: PlayerData,
  ): Array<{ mat: string; grade: number; price: number }>;
  buyMat(
    this: PortCapabilities,
    session: Session,
    materialId: string,
    grade: number,
    quantity: number,
  ): void;
  yard(this: PortCapabilities, stellarBody: StellarBody, playerData?: PlayerData): number[] | null;
  tradeIn(this: PortCapabilities, playerData: PlayerData): number;
  buyShip(this: PortCapabilities, session: Session, hullId: number): void;
  outfitter(
    this: PortCapabilities,
    stellarBody: StellarBody,
    playerData?: PlayerData,
  ): number[] | null;
  outfit(
    this: PortCapabilities,
    session: Session,
    outfitId: number,
    quantity: number,
    fixed?: boolean,
  ): void;
  outfitInstallProblem(
    this: PortCapabilities,
    playerData: PlayerData,
    outfitId: number,
    quantity: number,
  ): string | null;
}
import type { GradeLots } from '../shared/cargo-contracts.ts';
import type { Game } from './game.ts';
export type Session = import('./game.ts').Session;
export type PlayerData = import('./game.ts').PlayerData;
export type StellarBody = import('./game.ts').StellarBody;
export type MarketItem = import('./game.ts').MarketItem;
export type PortCapabilities = Pick<
  Game,
  | 'A'
  | 'O'
  | 'db'
  | 'features'
  | 'fitsJobs'
  | 'holdUsed'
  | 'jobBunks'
  | 'landed'
  | 'log'
  | 'market'
  | 'matsFor'
  | 'outfitter'
  | 'ownSite'
  | 'siteOwner'
  | 'toast'
  | 'tradeIn'
  | 'tut'
  | 'yard'
  | 'you'
>;
export type PortService = Pick<
  Game,
  | 'market'
  | 'trade'
  | 'matsFor'
  | 'buyMat'
  | 'yard'
  | 'tradeIn'
  | 'buyShip'
  | 'outfitter'
  | 'outfit'
  | 'outfitInstallProblem'
>;

import { bindOperations } from './feature-service.ts';
import {
  SYS as systemsById,
  STELLARS,
  COMMODITIES,
  MATERIALS,
  SITE_PRICES,
  STATION_SHIPS,
  WINGMATES,
  FACTION_HULLS,
  FACTION_OUTFITS,
} from '../shared/galaxy.ts';
import {
  price,
  credits,
  loadoutValue,
  makeLoadout,
  ensureStockOutfits,
  outfitInstallProblem as sharedOutfitInstallProblem,
  outfitSaleValue,
  fixedWeaponSaleValue,
} from '../shared/rules.ts';
import { purchaseValue, saleValue, realizedTradeProfit } from './trade-pricing.ts';
import { assertLots, addLots, commonLots, planTake, applyTake } from '../shared/cargo-lots.ts';
import { recordEconomy } from '../shared/economy-receipt.ts';
import { WING_ONLY } from '../shared/docks.ts';

/**
 * Ordinary port commerce owns commodity/material transactions, shipyard and
 * outfitter operations. Uses the existing account and shared pricing/grade rules;
 * there is no copied inventory, new save path or economic authority in the UI.
 * Legacy bodies remain unchecked; the capability signature is not wire validation.

 */

export function createPortService(capabilities: PortCapabilities): PortService {
  return bindOperations(PortOperations, capabilities);
}

const MAT_PRICE = [6000, 18000, 45000, 110000, 260000];

const PortOperations: PortOperations = {
  /**
   * Generates commodity market prices for a stellar port, applying flash and state modifiers.
   * @param stellarBody Stellar port.
   * @returns Array of traded commodities and pricing, or null.
   */
  market(this: PortCapabilities, stellarBody: StellarBody) {
    if (stellarBody.site) {
      const playerData = this.siteOwner(stellarBody.id);
      return playerData && playerData!.station.ops >= 1
        ? COMMODITIES.map((commodity) => ({
            id: commodity.id,
            name: commodity.name,
            ...(commodity.id === 'composite_plating'
              ? {
                  sellCap: this.features.refinery.sellRoom(stellarBody.id, Number.MAX_SAFE_INTEGER),
                }
              : {}),
            price: price({ ...stellarBody, prices: SITE_PRICES }, commodity.id),
          })).filter((marketItem) => marketItem.price !== null)
        : null;
    }
    if (!stellarBody.svc.includes('T')) return null;
    const currentTime = Date.now();
    return COMMODITIES.map((commodity) => {
      const basePrice = price(stellarBody, commodity.id, currentTime),
        marketMultiplier = this.features.living.livingMult(stellarBody, commodity.id);
      return {
        id: commodity.id,
        name: commodity.name,
        ...(commodity.id === 'composite_plating'
          ? { sellCap: this.features.refinery.sellRoom(stellarBody.id, Number.MAX_SAFE_INTEGER) }
          : {}),
        price:
          basePrice === null
            ? null
            : Math.round(
                basePrice *
                  this.features.rivals.flashMult(stellarBody.id, commodity.id) *
                  marketMultiplier,
              ),
        quoteBase:
          basePrice === null
            ? undefined
            : (basePrice *
                this.features.rivals.flashMult(stellarBody.id, commodity.id) *
                marketMultiplier) /
              (1 - this.features.living.impact(stellarBody.id, commodity.id)),
        impact: this.features.living.impact(stellarBody.id, commodity.id),
        flash: this.features.rivals.flashMult(stellarBody.id, commodity.id) !== 1,
        moved: Math.round((marketMultiplier - 1) * 100),
      };
    }).filter((marketItem) => marketItem.price !== null); // market flashes; 2.4: system states and what captains sold here
  },
  /**
   * Executes commodity purchase or sale transaction with market depth price impact.
   * @param session Player session.
   * @param commodityId Commodity ID.
   * @param quantity Amount to buy (>0) or sell (<0).
   */
  trade(
    this: PortCapabilities,
    session: Session,
    commodityId: string,
    quantity: number,
    selection: GradeLots | 'common-first' = 'common-first',
  ) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar!];
    if (!port || session.ent) return;
    try {
      assertLots(playerData.cargo, playerData.cargoLots);
    } catch {
      return this.toast(session, 'Cargo validation failed.');
    }
    if (this.db.economicFrozen) return;
    const pricingTime = Date.now();
    const basePrice = price(
      port.site ? { ...port, prices: SITE_PRICES } : port,
      commodityId,
      pricingTime,
    );
    if (basePrice === null || !quantity || !this.market(port)) return;
    const impact = port.site ? 0 : this.features.living.impact(port.id, commodityId);
    const unitPrice = port.site
      ? basePrice
      : (basePrice *
          this.features.rivals.flashMult(port.id, commodityId) *
          this.features.living.livingMult(port, commodityId)) /
        (1 - impact);
    const tradeBonus = this.features.bonuses.bonus(playerData).tradePct || 0;
    const sell = this.features.fronts.mods(port.system).sell;
    const shipStats = this.features.shipStats!.stats(playerData),
      usedHold = this.holdUsed(playerData);
    if (quantity > 0) {
      quantity = Math.min(quantity, shipStats!.cargo - usedHold);
      let lower = 0,
        upper = quantity;
      while (lower < upper) {
        const candidate = Math.ceil((lower + upper) / 2);
        if (
          purchaseValue(unitPrice, candidate, tradeBonus, !!port.site, sell, impact) <=
          playerData.credits
        )
          lower = candidate;
        else upper = candidate - 1;
      }
      quantity = lower;
      const purchaseTotal = purchaseValue(
        unitPrice,
        quantity,
        tradeBonus,
        !!port.site,
        sell,
        impact,
      );
      const purchasePrice = purchaseTotal / Math.max(1, quantity);
      if (quantity <= 0) return this.toast(session, 'No room or no money for that.');
      playerData.paid = playerData.paid || {};
      playerData.paid[commodityId] = Math.round(
        ((playerData.paid[commodityId] || purchasePrice) * (playerData.cargo[commodityId] || 0) +
          purchasePrice * quantity) /
          ((playerData.cargo[commodityId] || 0) + quantity),
      ); // what you paid, on average
      addLots(
        playerData.cargo,
        playerData.cargoLots,
        {
          ...commonLots(commodityId, quantity),
          basis: { common: purchaseTotal, rich: 0, pure: 0 },
        },
        Math.max(0, shipStats!.cargo - usedHold),
      );
      playerData.credits -= purchaseTotal;
      recordEconomy(playerData, port.id, 'purchases', purchaseTotal);
      if (!port.site) this.features.living.addImpact(port.id, commodityId, -quantity); // buying raises the local price
    } else {
      const availableQuantity = playerData.cargo[commodityId] || 0;
      quantity = Math.min(-quantity, availableQuantity);
      if (commodityId === 'composite_plating')
        quantity = this.features.refinery.sellRoom(port.id, quantity, pricingTime);
      if (!quantity)
        return this.toast(session, 'No sale inventory or finite buyer demand remaining.');
      let withdrawalPlan;
      try {
        withdrawalPlan = planTake(
          playerData.cargo,
          playerData.cargoLots,
          commodityId,
          quantity,
          selection,
        );
      } catch {
        return this.toast(session, 'Those cargo grades are unavailable.');
      }
      const saleProceeds = saleValue(
        unitPrice,
        withdrawalPlan.grades,
        this.features.bonuses.bonus(playerData).tradePct || 0,
        !!port.site,
        sell,
        impact,
      );
      applyTake(playerData.cargo, playerData.cargoLots, withdrawalPlan);
      if (commodityId === 'composite_plating')
        this.features.refinery.sold(port.id, quantity, pricingTime);
      const cost = withdrawalPlan.basis!;
      const profit = realizedTradeProfit(
        playerData,
        saleProceeds,
        cost.common + cost.rich + cost.pure,
      );
      this.features.fronts.goal(session, 'trade', profit);
      playerData.credits += saleProceeds;
      recordEconomy(playerData, port.id, 'sales', saleProceeds);
      if (!playerData.cargo[commodityId]) {
        delete playerData.cargo[commodityId];
        if (playerData.paid) delete playerData.paid[commodityId];
      }
      playerData.stats.earned += profit;
      this.tut(session, 'sell');
      if (!port.site) {
        this.features.living.addImpact(port.id, commodityId, quantity);
        this.features.living.stateProgress(session, port.system, 'cid:' + commodityId, quantity);
      } // selling lowers it, and feeds a famine or a rush
    }
    this.db.touch();
    this.you(session);
    this.landed(session);
  },
  /**
   * Lists upgrade materials for sale at a stellar body based on faction specialization.
   * @param stellarBody Stellar body.
   * @param playerData Player data.
   * @returns Upgrade materials available.
   */
  matsFor(this: PortCapabilities, stellarBody: StellarBody, playerData?: PlayerData) {
    const factionId = systemsById[stellarBody.system].faction,
      materialOffers: Array<{ mat: string; grade: number; price: number }> = [];
    if (
      stellarBody.hub ||
      (playerData && this.ownSite(playerData!, stellarBody) && playerData!.station.ops >= 1)
    )
      MATERIALS.forEach((materialId) =>
        [0, 1].forEach((gradeIndex) =>
          materialOffers.push({ mat: materialId, grade: gradeIndex, price: MAT_PRICE[gradeIndex] }),
        ),
      );
    if (stellarBody.site) return materialOffers;
    const specialtyOffer = (
      {
        korrund: ['alloy', 2],
        ylith: ['crystal', 2],
        thalassi: ['isotope', 2],
        quevari: ['crystal', 3],
      } satisfies Record<string, [string, number]>
    )[factionId as 'korrund' | 'ylith' | 'thalassi' | 'quevari'];
    if (specialtyOffer && stellarBody.svc.includes('T'))
      materialOffers.push({
        mat: specialtyOffer[0],
        grade: specialtyOffer[1],
        price: MAT_PRICE[specialtyOffer[1]],
      });
    return materialOffers;
  },
  /**
   * Executes purchase or sale of crafting and upgrade materials.
   * @param session Player session.
   * @param materialId Material name ('alloy', 'crystal', 'isotope').
   * @param grade Material grade index (0-4).
   * @param quantity Quantity to buy (>0) or sell (<0).
   */
  buyMat(
    this: PortCapabilities,
    session: Session,
    materialId: string,
    grade: number,
    quantity: number,
  ) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar!];
    if (!port || session.ent) return;
    const offer = this.matsFor(port, playerData).find(
      (materialOffer) => materialOffer.mat === materialId && materialOffer.grade === grade,
    );
    if (!offer) return;
    if (quantity > 0) {
      quantity = Math.min(quantity, Math.floor(playerData.credits / offer.price));
      if (!quantity) return this.toast(session, 'Not enough credits.');
      playerData.credits -= quantity * offer.price;
      playerData.mats[materialId][grade] += quantity;
    } else {
      quantity = Math.min(-quantity, playerData.mats[materialId][grade]);
      playerData.credits += Math.round(quantity * offer.price * 0.6);
      playerData.mats[materialId][grade] -= quantity;
    }
    this.db.touch();
    this.you(session);
  },

  // ------------------------------------------------------------------ shipyard and outfitter
  /**
   * Compiles list of ship hulls available for purchase at shipyard.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Array of hull IDs for sale, or null.
   */
  yard(this: PortCapabilities, stellarBody: StellarBody, playerData?: PlayerData) {
    if (stellarBody.site) {
      // your Personal Station sells the station ships for its Station Tier
      if (!this.ownSite(playerData!, stellarBody) || playerData!.station.ops < 3) return null;
      const hullIds = new Set<number>();
      for (const [stationTier, unlockedHullIds] of Object.entries(STATION_SHIPS))
        if (playerData!.station.ops >= +stationTier)
          unlockedHullIds.forEach((hullId) => hullIds.add(hullId));
      for (const hullId of [703, 704, 705, 706, 707, 708, 709, 710, 711, 712, 713])
        hullIds.add(hullId);
      if (playerData!.station.ops >= 4) WINGMATES.forEach((hullId) => hullIds.add(hullId)); // wingmate ships (2.6: the Armada escort hulls are retired)
      return [...hullIds].sort(
        (leftHullId, rightHullId) => this.A.ships[leftHullId].cost - this.A.ships[rightHullId].cost,
      );
    }
    if (!stellarBody.svc.includes('Y')) return null;
    const factionId = systemsById[stellarBody.system].faction,
      list = new Set<number>();
    for (const hullId of FACTION_HULLS[factionId] || []) {
      const hullDefinition = this.A.ships[hullId];
      if (
        hullDefinition &&
        (hullDefinition.tech! <= stellarBody.tech! || hullDefinition.tech! >= 400)
      )
        list.add(hullId);
    }
    if (factionId !== 'quevari' && factionId !== 'umbral')
      for (const hullId of [703, 704, 705, 706, 707, 708, 709, 710, 820, 821, 822])
        if (this.A.ships[hullId].tech! <= stellarBody.tech!) list.add(hullId); // the Wasp, Swift and Pelican are sold everywhere
    return [...list].sort(
      (leftHullId, rightHullId) => this.A.ships[leftHullId].cost - this.A.ships[rightHullId].cost,
    );
  },
  /**
   * Calculates credit trade-in value for captain's current ship and outfits (50% value).
   * @param playerData Player save data.
   * @returns Credit trade-in value of current ship and installed outfits.
   */
  tradeIn(this: PortCapabilities, playerData: PlayerData) {
    if (playerData.shipless) return 0;
    return loadoutValue(this.A, playerData.ship);
  },
  /**
   * Purchases a new flagship hull, applying trade-in credit for previous ship.
   * @param session Player session.
   * @param hullId Hull ID to purchase.
   */
  buyShip(this: PortCapabilities, session: Session, hullId: number) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar!];
    if (!port || session.ent) return;
    const availableHullIds = this.yard(port, playerData) || [];
    if (!availableHullIds.includes(hullId)) return;
    if (WING_ONLY.includes(hullId)) return this.features.docks.buyToHangar(session, hullId); // escort hulls go straight to the hangar
    const hullDefinition = this.A.ships[hullId],
      netCost = hullDefinition.cost - this.tradeIn(playerData);
    if (playerData.credits < netCost)
      return this.toast(session, `You need ${credits(netCost)} credits (after your trade-in).`);
    {
      const capacityProblem = this.fitsJobs(playerData, hullId);
      if (capacityProblem)
        return this.toast(session, capacityProblem + ' Sell cargo or finish jobs first.');
    }
    playerData.credits -= netCost;
    this.log(playerData, `Bought a ${hullDefinition.name} at ${port.name}.`);
    playerData.ship = makeLoadout(
      this.A,
      hullId,
      playerData.shipless ? 'Rift Runner' : playerData.ship.name,
    );
    playerData.shipless = false;
    playerData.fuel = undefined;
    this.features.docks.leadChanged(playerData);
    this.db.touch();
    this.you(session);
    this.landed(session);
    this.toast(session, `The ${hullDefinition.name} is yours.`);
  },
  /**
   * Compiles list of ship outfits available for purchase at outfitter.
   * @param stellarBody Stellar port.
   * @param playerData Player data.
   * @returns Array of outfit IDs for sale, or null.
   */
  outfitter(this: PortCapabilities, stellarBody: StellarBody, playerData?: PlayerData) {
    if (
      stellarBody.site &&
      !(playerData && this.ownSite(playerData!, stellarBody) && playerData!.station.ops >= 2)
    )
      return null;
    if (!stellarBody.site && !stellarBody.svc.includes('O')) return null;
    const factionId = stellarBody.site ? 'quantum' : systemsById[stellarBody.system].faction,
      outfitIds = [];
    for (const outfit of Object.values(this.O)) {
      if (outfit.id === 9021 || outfit.storeOnly) continue;
      if (outfit.faction && outfit.faction !== factionId) continue;
      const factionExclusive =
        FACTION_OUTFITS[factionId] && FACTION_OUTFITS[factionId].includes(outfit.id);
      if (
        factionExclusive ||
        ((outfit.tech! <= stellarBody.tech! || stellarBody.site) &&
          outfit.tech! < 100 &&
          !(factionId === 'umbral'))
      ) {
        if (
          outfit.tech! >= 7 &&
          !factionExclusive &&
          !(stellarBody.hub || stellarBody.site || factionId === 'quantum')
        )
          continue; // quantum tech only in Concord space
        outfitIds.push(outfit.id);
      }
    }
    return outfitIds.sort(
      (leftOutfitId, rightOutfitId) => this.O[leftOutfitId].cost - this.O[rightOutfitId].cost,
    );
  },
  /**
   * Checks whether the active ship can take more of a non-ammunition outfit.
   * Shared by outfitters and faction stores, which install store outfits directly.
   * @param playerData Player data.
   * @param outfitId Outfit ID.
   * @param quantity Number to install.
   * @returns A player-facing reason, or null when it fits.
   */
  outfitInstallProblem(
    this: PortCapabilities,
    playerData: PlayerData,
    outfitId: number,
    quantity: number,
  ): string | null {
    ensureStockOutfits(this.A, playerData.ship);
    return sharedOutfitInstallProblem(
      this.A,
      playerData.ship,
      this.features.shipStats!.stats(playerData)!,
      outfitId,
      quantity,
      !!playerData.shipless,
    );
  },
  /**
   * Purchases or sells a ship outfit or ammunition batch.
   * @param session Player session.
   * @param outfitId Outfit ID, or weapon ID for a built-in sale.
   * @param quantity Quantity to buy (>0) or sell (<0).
   * @param fixed Sell a built-in weapon instead of a modular outfit.
   */
  outfit(
    this: PortCapabilities,
    session: Session,
    outfitId: number,
    quantity: number,
    fixed = false,
  ) {
    const playerData = session.data,
      port = STELLARS[playerData.stellar!];
    if (!port || session.ent || !quantity) return;
    if (fixed) {
      if (quantity >= 0 || playerData.shipless || !this.outfitter(port, playerData)) return;
      // Legacy loadouts may omit fixed; materialize the same hull fallback used by shipStats.
      const banks =
        playerData.ship.fixed ??
        this.A.ships[playerData.ship.hull].weapons.map(([identifier, count, ammo]) => [
          identifier,
          count,
          ammo,
        ]);
      const bank = banks.find(
        ([identifier, count]) => Number(identifier) === outfitId && count > 0,
      );
      if (!bank || !this.A.weapons[outfitId]) return;
      const sold = Math.min(bank[1], -quantity);
      const refund = sold * fixedWeaponSaleValue(this.A, playerData.ship, outfitId);
      bank[1] -= sold;
      playerData.ship.fixed = banks.filter(([, count]) => count > 0);
      if (
        !playerData.ship.fixed.some(([identifier]) => Number(identifier) === outfitId) &&
        !Object.entries(playerData.ship.outfits).some(
          ([identifier, count]) => count > 0 && this.O[identifier]?.eff?.weapon === outfitId,
        )
      )
        delete playerData.ship.ammo[outfitId];
      playerData.credits += refund;
      this.db.touch();
      this.you(session);
      return;
    }
    const outfit = this.O[outfitId];
    if (!outfit) return;
    if (outfitId === 9021) return this.toast(session, 'The Rift Harness cannot be bought or sold.');
    if (playerData.shipless)
      return this.toast(
        session,
        'You have no active ship. Choose FLY THIS in your drydock, or buy one at a shipyard.',
      );
    const availableOutfitIds = this.outfitter(port, playerData);
    if (!availableOutfitIds) return this.toast(session, 'There is no outfitter here.');
    if (quantity > 0 && !availableOutfitIds.includes(outfitId)) return;
    const shipStats = this.features.shipStats!.stats(playerData);
    if (quantity > 0) {
      if (
        outfit.eff!.towRig &&
        (shipStats!.cargo < 60 ||
          ['fighter', 'interceptor'].includes(this.A.ships[playerData.ship.hull].role!))
      )
        return this.toast(session, 'Tow Rig requires a non-fighter hull with at least 60t cargo.');
      if (outfit.eff!.ammo) {
        // ammunition: needs the launcher
        const weaponId = outfit.eff!.ammo,
          _hullDefinition = this.A.ships[playerData.ship.hull];
        const launchers = shipStats!.weapons[weaponId] || 0;
        if (!launchers) return this.toast(session, 'You have nothing that fires that.');
        const loadedAmmo = playerData.ship.ammo[weaponId] ?? 0;
        const ammoCapacity = outfit.max! * launchers;
        const transferQuantity = Math.min(
          quantity,
          ammoCapacity - loadedAmmo,
          Math.floor(playerData.credits / outfit.cost),
        );
        if (transferQuantity <= 0)
          return this.toast(session, 'Magazines full or not enough credits.');
        playerData.ship.ammo[weaponId] = loadedAmmo + transferQuantity;
        playerData.credits -= transferQuantity * outfit.cost;
      } else {
        const problem = PortOperations.outfitInstallProblem.call(
          this,
          playerData,
          outfitId,
          quantity,
        );
        if (problem) return this.toast(session, problem);
        const installedQuantity = playerData.ship.outfits[outfitId] || 0;
        if (playerData.credits < outfit.cost * quantity)
          return this.toast(session, 'Not enough credits.');
        playerData.credits -= outfit.cost * quantity;
        playerData.ship.outfits[outfitId] = installedQuantity + quantity;
      }
    } else {
      const installedQuantity = playerData.ship.outfits[outfitId] || 0,
        transferQuantity = Math.min(installedQuantity, -quantity);
      if (!transferQuantity) return;
      if (
        outfit.eff!.cargo &&
        this.holdUsed(playerData) > shipStats!.cargo - outfit.eff!.cargo * transferQuantity
      )
        return this.toast(session, 'Sell cargo first.');
      if (
        outfit.eff!.passengerSeats &&
        this.jobBunks(playerData) >
          shipStats!.passengerSeats - outfit.eff!.passengerSeats * transferQuantity
      )
        return this.toast(session, 'Deliver your passengers before removing their seats.');
      const refund = outfitSaleValue(this.A, playerData.ship, outfitId, transferQuantity);
      playerData.ship.outfits[outfitId] = installedQuantity - transferQuantity;
      if (!playerData.ship.outfits[outfitId]) delete playerData.ship.outfits[outfitId];
      playerData.credits += refund;
    }
    this.db.touch();
    this.you(session);
  },
};
