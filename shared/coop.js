// Quantum Rift: data, shared by server and client: Captain Friends and DMs, the Armada (a short co-op group
// of up to five captains and their wingmates), trading between Personal Stations, duels and Armada Duels, rescue,
// co-op Holdout and Armada contracts. All of it is for online games; a solo game hides it.

/**
 * @typedef {Object} SocialConfig
 * @property {number} friendsMax - Maximum friends allowed per captain.
 * @property {number} mailMax - Maximum DMs retained for an offline captain per sender.
 * @property {number} dmLen - Maximum character length of a direct message.
 * @property {number} dmGapMs - Cooldown milliseconds between consecutive DMs from the same captain.
 * @property {number} awayMin - Inactivity minutes before a captain is marked as Away.
 */

/**
 * @typedef {Object} ArmadaBuff
 * @property {number} shieldRe - Multiplier for shield recharge rate when sharing a system with members.
 * @property {number} bounty - Multiplier for bounty rewards earned in the same system.
 */

/**
 * @typedef {Object} ArmadaConfig
 * @property {number} max - Maximum number of captains allowed in an Armada.
 * @property {RegExp} nameRe - Validation regular expression for Armada group names.
 * @property {number} inviteMin - Expiration duration in minutes for pending invites.
 * @property {number} idleMin - Inactivity minutes before an unattended Armada disbands.
 * @property {ArmadaBuff} buff - Passive buffs applied to members sharing a system.
 * @property {number} share - Share of bounties paid out to nearby armada members.
 */

/**
 * @typedef {Object} TradeConfig
 * @property {number} fee - Credit transfer fee percentage (e.g. 0.02 = 2%).
 * @property {number} idleMin - Expiration duration in minutes for an idle station trade session.
 * @property {number} maxLines - Maximum distinct item line items allowed per side.
 */

/**
 * @typedef {Object} DuelConfig
 * @property {number} floor - Armor percentage threshold marking a disabled ship/duel defeat.
 * @property {number} minutes - Match time limit in minutes before a duel results in a draw.
 * @property {number} inviteSec - Expiration duration in seconds for duel invitations.
 */

/**
 * @typedef {Object} RescueConfig
 * @property {number} windowSec - Seconds allowed for an Armada member to board and rescue a downed ship.
 * @property {number} repair - Fraction of armor restored upon successful boarding rescue.
 */

/**
 * @typedef {Object} CoopHoldoutConfig
 * @property {number} extraPerHelper - Additional hostiles spawned per helper captain.
 * @property {number} pctPerHelper - Percentage increase in hostile durability/stats per helper.
 * @property {number} helperShare - Fraction of wave rewards shared with Armada helpers.
 */

/**
 * @typedef {Object} WarbandConfig
 * @property {string[]} names - Name pool for warband kingpin flagships.
 * @property {number[]} leads - Hull IDs of kingpin flagship hulls (Mk III refits).
 * @property {number[]} guards - Hull IDs of escort guard ships (Mk II refits).
 * @property {number} guardsBase - Base number of escort guard ships.
 * @property {number} guardsPerMember - Additional escort guards spawned per Armada member.
 * @property {number} pctPerMember - Scaling percentage per participating member.
 * @property {number} rewardBase - Base credit reward for defeating the warband.
 * @property {number} rewardDanger - Additional credit reward scaled by sector danger level.
 * @property {number} minMembers - Minimum Armada members required to accept the contract.
 */

/**
 * Social messaging and friend list configuration limits.
 * @type {SocialConfig}
 */
export const SOCIAL = {
  friendsMax: 100, // friends per captain
  mailMax: 50, // DMs kept for an offline captain (per sender, newest kept)
  dmLen: 400, // characters per DM
  dmGapMs: 600, // between two DMs from one captain
  awayMin: 5, // no input for this long: shown as Away
};

/**
 * Armada co-op group rules, capacity, and proximity bonus settings.
 * @type {ArmadaConfig}
 */
export const ARMADA = {
  max: 5, // captains per Armada (each brings their own wingmates)
  nameRe: /^[A-Za-z0-9 '\-]{3,24}$/,
  inviteMin: 5, // an invite lapses after this long
  idleMin: 30, // an Armada with nobody online for this long disbands
  buff: { shieldRe: 1.05, bounty: 1.05 }, // while another member shares your system: +5% shield recharge, +5% bounty
  share: 0.25, // members in the system get this share of each other's bounties (paid on top) and kill credit
};

/**
 * Station-to-station direct trading parameters and constraints.
 * @type {TradeConfig}
 */
export const TRADE = {
  fee: 0.02, // on credits sent, like the Exchange
  idleMin: 10, // an open trade with no change for this long is cancelled
  maxLines: 12, // different items one side can put up
};

/**
 * Ship dueling thresholds, time limits, and invitation rules.
 * @type {DuelConfig}
 */
export const DUEL = {
  floor: 0.12, // a duel ends at disabled: armor never drops below this share in a duel
  minutes: 5, // then it is a draw
  inviteSec: 60, // a challenge lapses after this long
};

/**
 * Downed captain rescue window and restoration constants.
 * @type {RescueConfig}
 */
export const RESCUE = {
  windowSec: 60, // a downed Armada captain can be boarded by a member this long before the insurers take over
  repair: 0.35, // armor restored by a rescue (shields come back on their own)
};

// co-op Holdout: each helper from your Armada adds hostiles to every wave and makes them tougher, and shares the rewards
/**
 * Scaling and reward multipliers for co-op Holdout defense missions.
 * @type {CoopHoldoutConfig}
 */
export const COOP_HOLDOUT = { extraPerHelper: 1, pctPerHelper: 15, helperShare: 0.6 };

// Armada contracts: group kingpins who fly the Concord's old Mk II and Mk III refits (no longer sold to captains)
/**
 * Warband kingpin contract definitions, hull selections, and reward scales.
 * @type {WarbandConfig}
 */
export const WARBAND = {
  names: [
    'Commodore Hask',
    'the Iron Abbess',
    'Rear Admiral Vey',
    'Captain Sorrow',
    'the Gilded Mutineer',
    'Admiral Kettering',
    'the Brass Saint',
    'Marshal Odo Fenn',
  ],
  leads: [745, 746, 747, 748, 749, 750], // Mk III
  guards: [720, 721, 723, 725, 728, 730, 732], // Mk II
  guardsBase: 3,
  guardsPerMember: 1,
  pctPerMember: 40,
  rewardBase: 90000,
  rewardDanger: 15000, // shared out between the members who take it
  minMembers: 2,
};
