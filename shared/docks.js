// 2.1 Docks: your Personal Station has lettered docks (A-E). Each dock holds a lead ship and up to two wingmate ships,
// all chosen from your stored ships. You fly the lead of your active dock; its wingmates fly in formation with you.
// Wingmates are crewed by officers (a captain and one crew member each), who boost that ship.
import { WINGMATES } from './galaxy.js';
export const DOCK_LETTERS = ['A', 'B', 'C', 'D'];
export const MAX_DOCKS = 4;
export const DOCKS_BY_OPS = [1, 1, 2, 3, 3, 4];          // docks per Ops level, A to D (without a station you have Dock A only)
export const NEXT_DOCK_OPS = { 1: 2, 2: 3, 3: 5 };        // with this many docks, the next one opens at this Ops level
export const HANGAR_BY_OPS = [0, 3, 5, 8, 11, 14];        // stored-ship berths per Ops level (the Drydock Annex research adds more)
export const WINGS_PER_DOCK = 2;                          // a Herald in the lead slot commands one more
export const WING_ONLY = [...WINGMATES];                   // the station's escort hulls fly only as wingmates
export const WING_REPAIR_MIN = 10;                        // a wingmate knocked out of a fight is towed home and repaired
export const WING_REPAIR_COST = 0.08;                     // ...or repaired at once for this share of its hull price
export const WING_CREW = ['cap', 'crew'];
