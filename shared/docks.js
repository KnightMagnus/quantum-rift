// Docks: your Personal Station has lettered docks (A-D). Each dock holds a lead ship and up to two wingmate ships,
// all chosen from your stored ships. You fly the lead of your active dock; its wingmates fly in formation with you.
// Wingmates are crewed by officers (a captain and one crew member each), who boost that ship.
import { WINGMATES } from './galaxy.js';

/**
 * @typedef {Object} DockWingAssignment
 * @property {string|number} uid - Unique ID of the stored ship assigned as a wingmate.
 * @property {string|null} cap - Officer ID assigned as captain, or null if unassigned.
 * @property {string|null} crew - Officer ID assigned as crew member, or null if unassigned.
 * @property {number} [downUntil] - Unix timestamp until which the wingmate remains disabled under repair.
 */

/**
 * @typedef {Object} DockSlot
 * @property {string|number|null} lead - Unique ID of the lead ship for this dock, or null if empty.
 * @property {DockWingAssignment[]} wings - Array of assigned wingmates in formation.
 */

/**
 * Letter designations assigned to Personal Station docks (A through D).
 * @type {string[]}
 */
export const DOCK_LETTERS = ['A', 'B', 'C', 'D'];

/**
 * Maximum number of lettered docks a Personal Station can support.
 * @type {number}
 */
export const MAX_DOCKS = 4;

/**
 * Number of docks unlocked per station Ops level index (0 through 5).
 * Without a station you have Dock A only.
 * @type {number[]}
 */
export const DOCKS_BY_OPS = [1, 1, 2, 3, 3, 4]; // docks per Ops level, A to D (without a station you have Dock A only)

/**
 * Next dock unlock requirements: maps current dock count to the Ops level required for the next dock.
 * @type {Object.<number, number>}
 */
export const NEXT_DOCK_OPS = { 1: 2, 2: 3, 3: 5 }; // with this many docks, the next one opens at this Ops level

/**
 * Stored-ship hangar berths unlocked per station Ops level index (0 through 5).
 * The Drydock Annex research adds additional berths.
 * @type {number[]}
 */
export const HANGAR_BY_OPS = [0, 3, 5, 8, 11, 14]; // stored-ship berths per Ops level (the Drydock Annex research adds more)

/**
 * Standard number of wingmate slots per dock.
 * A Herald in the lead slot commands one more.
 * @type {number}
 */
export const WINGS_PER_DOCK = 2; // a Herald in the lead slot commands one more

/**
 * Hull IDs restricted to flying exclusively as station escorts/wingmates.
 * @type {number[]}
 */
export const WING_ONLY = [...WINGMATES]; // the station's escort hulls fly only as wingmates

/**
 * Time in minutes required to tow and repair a knocked-out wingmate at the station.
 * @type {number}
 */
export const WING_REPAIR_MIN = 10; // a wingmate knocked out of a fight is towed home and repaired

/**
 * Share of a wingmate's hull price required for immediate emergency field repair.
 * @type {number}
 */
export const WING_REPAIR_COST = 0.08; // ...or repaired at once for this share of its hull price

/**
 * Officer role slots assigned to each wingmate ship.
 * @type {string[]}
 */
export const WING_CREW = ['cap', 'crew'];
