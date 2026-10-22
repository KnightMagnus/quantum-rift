export type DockWingAssignment = {
  uid: string | number;
  cap: string | null;
  crew: string | null;
  downUntil?: number;
};
export type DockSlot = { lead: string | number | null; wings: DockWingAssignment[] };
// Docks: your Personal Station has lettered docks (A-D). Each dock holds a lead ship and up to two wingmate ships,
// all chosen from your stored ships. You fly the lead of your active dock; its wingmates fly in formation with you.
// Wingmates are crewed by officers (a captain and one crew member each), who boost that ship.
import { WINGMATES } from './galaxy.ts';

/**
 * DockWingAssignment fields:
 * uid: - Unique ID of the stored ship assigned as a wingmate.
 * cap: - Officer ID assigned as captain, or null if unassigned.
 * crew: - Officer ID assigned as crew member, or null if unassigned.
 * [downUntil]: - Unix timestamp until which the wingmate remains disabled under repair.
 */

/**
 * DockSlot fields:
 * lead: - Unique ID of the lead ship for this dock, or null if empty.
 * wings: - Array of assigned wingmates in formation.
 */

/**
 * Letter designations assigned to Personal Station docks (A through D).
 */
export const DOCK_LETTERS: string[] = ['A', 'B', 'C', 'D'];

/**
 * Maximum number of lettered docks a Personal Station can support.
 */
export const MAX_DOCKS: number = 4;

/**
 * Number of docks unlocked per station Ops level index (0 through 5).
 * Without a station you have Dock A only.
 */
export const DOCKS_BY_OPS: number[] = [1, 1, 2, 3, 3, 4]; // docks per Ops level, A to D (without a station you have Dock A only)

/**
 * Next dock unlock requirements: maps current dock count to the Ops level required for the next dock.
 */
export const NEXT_DOCK_OPS: Record<number, number> = { 1: 2, 2: 3, 3: 5 }; // with this many docks, the next one opens at this Ops level

/**
 * Stored-ship hangar berths unlocked per station Ops level index (0 through 5).
 * The Drydock Annex research adds additional berths.
 */
export const HANGAR_BY_OPS: number[] = [0, 3, 5, 8, 11, 14]; // stored-ship berths per Ops level (the Drydock Annex research adds more)

/**
 * Standard number of wingmate slots per dock.
 * A Herald in the lead slot commands one more.
 */
export const WINGS_PER_DOCK: number = 2; // a Herald in the lead slot commands one more

/**
 * Hull IDs restricted to flying exclusively as station escorts/wingmates.
 */
export const WING_ONLY: number[] = [...WINGMATES]; // the station's escort hulls fly only as wingmates

/**
 * Time in minutes required to tow and repair a knocked-out wingmate at the station.
 */
export const WING_REPAIR_MIN: number = 10; // a wingmate knocked out of a fight is towed home and repaired

/**
 * Share of a wingmate's hull price required for immediate emergency field repair.
 */
export const WING_REPAIR_COST: number = 0.08; // ...or repaired at once for this share of its hull price

/**
 * Officer role slots assigned to each wingmate ship.
 */
export const WING_CREW: Array<'cap' | 'crew'> = ['cap', 'crew'];
