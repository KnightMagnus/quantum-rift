export type SocialConfig = {
  /** Maximum friends allowed per captain. */
  friendsMax: number;

  /** Maximum DMs retained for an offline captain per sender. */
  mailMax: number;

  /** Maximum character length of a direct message. */
  dmLen: number;

  /** Cooldown milliseconds between consecutive DMs from the same captain. */
  dmGapMs: number;

  /** Inactivity minutes before a captain is marked as Away. */
  awayMin: number;
};
export type ArmadaBuff = {
  /** Multiplier for shield recharge rate when sharing a system with members. */
  shieldRe: number;
  /** Multiplier for bounty rewards earned in the same system. */
  bounty: number;
};
export type ArmadaConfig = {
  /** Maximum number of captains allowed in an Armada. */
  max: number;

  /** Validation regular expression for Armada group names. */
  nameRe: RegExp;

  /** Expiration duration in minutes for pending invites. */
  inviteMin: number;

  /** Inactivity minutes before an unattended Armada disbands. */
  idleMin: number;

  /** Passive buffs applied to members sharing a system. */
  buff: ArmadaBuff;

  /** Share of bounties paid out to nearby armada members. */
  share: number;
};
export type TradeConfig = {
  /** Credit transfer fee percentage (e.g. 0.02 = 2%). */
  fee: number;
  /** Expiration duration in minutes for an idle station trade session. */
  idleMin: number;
  /** Maximum distinct item line items allowed per side. */
  maxLines: number;
};
export type DuelConfig = {
  /** Armor percentage threshold marking a disabled ship/duel defeat. */
  floor: number;
  /** Match time limit in minutes before a duel results in a draw. */
  minutes: number;
  /** Expiration duration in seconds for duel invitations. */
  inviteSec: number;
};
export type RescueConfig = {
  /** Seconds allowed for an Armada member to board and rescue a downed ship. */
  windowSec: number;
  /** Fraction of armor restored upon successful boarding rescue. */
  repair: number;
};
export type CoopHoldoutConfig = {
  /** Additional hostiles spawned per helper captain. */
  extraPerHelper: number;

  /** Percentage increase in hostile durability/stats per helper. */
  pctPerHelper: number;

  /** Fraction of wave rewards shared with Armada helpers. */
  helperShare: number;
};
export type WarbandConfig = {
  /** Name pool for warband kingpin flagships. */
  names: string[];

  /** Hull IDs of kingpin flagship hulls (Mk III refits). */
  leads: number[];

  /** Hull IDs of escort guard ships (Mk II refits). */
  guards: number[];

  /** Base number of escort guard ships. */
  guardsBase: number;

  /** Additional escort guards spawned per Armada member. */
  guardsPerMember: number;

  /** Scaling percentage per participating member. */
  pctPerMember: number;

  /** Base credit reward for defeating the warband. */
  rewardBase: number;

  /** Additional credit reward scaled by sector danger level. */
  rewardDanger: number;

  /** Minimum Armada members required to accept the contract. */
  minMembers: number;
};
// Quantum Rift: data, shared by server and client: Captain Friends and DMs, the Armada (a short co-op group
// of up to five captains and their wingmates), trading between Personal Stations, duels and Armada Duels, rescue,
// co-op Holdout and Armada contracts. All of it is for online games; a solo game hides it.

/**
 * Social messaging and friend list configuration limits.
 */
export const SOCIAL: SocialConfig = {
  friendsMax: 100, // friends per captain
  mailMax: 50, // DMs kept for an offline captain (per sender, newest kept)
  dmLen: 400, // characters per DM
  dmGapMs: 600, // between two DMs from one captain
  awayMin: 5, // no input for this long: shown as Away
};

/**
 * Armada co-op group rules, capacity, and proximity bonus settings.
 */
export const ARMADA: ArmadaConfig = {
  max: 5, // captains per Armada (each brings their own wingmates)
  nameRe: /^[A-Za-z0-9 '-]{3,24}$/,
  inviteMin: 5, // an invite lapses after this long
  idleMin: 30, // an Armada with nobody online for this long disbands
  buff: { shieldRe: 1.05, bounty: 1.05 }, // while another member shares your system: +5% shield recharge, +5% bounty
  share: 0.25, // members in the system get this share of each other's bounties (paid on top) and kill credit
};

/**
 * Station-to-station direct trading parameters and constraints.
 */
export const TRADE: TradeConfig = {
  fee: 0.02, // on credits sent, like the Exchange
  idleMin: 10, // an open trade with no change for this long is cancelled
  maxLines: 12, // different items one side can put up
};

/**
 * Ship dueling thresholds, time limits, and invitation rules.
 */
export const DUEL: DuelConfig = {
  floor: 0.12, // a duel ends at disabled: armor never drops below this share in a duel
  minutes: 5, // then it is a draw
  inviteSec: 60, // a challenge lapses after this long
};

/**
 * Downed captain rescue window and restoration constants.
 */
export const RESCUE: RescueConfig = {
  windowSec: 60, // a downed Armada captain can be boarded by a member this long before the insurers take over
  repair: 0.35, // armor restored by a rescue (shields come back on their own)
};

// co-op Holdout: each helper from your Armada adds hostiles to every wave and makes them tougher, and shares the rewards
/**
 * Scaling and reward multipliers for co-op Holdout defense missions.
 */
export const COOP_HOLDOUT: CoopHoldoutConfig = {
  extraPerHelper: 1,
  pctPerHelper: 15,
  helperShare: 0.6,
};

// Armada contracts: group kingpins who fly the Concord's old Mk II and Mk III refits (no longer sold to captains)
/**
 * Warband kingpin contract definitions, hull selections, and reward scales.
 */
export const WARBAND: WarbandConfig = {
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
