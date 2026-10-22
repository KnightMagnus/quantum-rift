export type SocialConfig = {
  friendsMax: number;
  mailMax: number;
  dmLen: number;
  dmGapMs: number;
  awayMin: number;
};
export type ArmadaBuff = { shieldRe: number; bounty: number };
export type ArmadaConfig = {
  max: number;
  nameRe: RegExp;
  inviteMin: number;
  idleMin: number;
  buff: ArmadaBuff;
  share: number;
};
export type TradeConfig = { fee: number; idleMin: number; maxLines: number };
export type DuelConfig = { floor: number; minutes: number; inviteSec: number };
export type RescueConfig = { windowSec: number; repair: number };
export type CoopHoldoutConfig = {
  extraPerHelper: number;
  pctPerHelper: number;
  helperShare: number;
};
export type WarbandConfig = {
  names: string[];
  leads: number[];
  guards: number[];
  guardsBase: number;
  guardsPerMember: number;
  pctPerMember: number;
  rewardBase: number;
  rewardDanger: number;
  minMembers: number;
};
// Quantum Rift: data, shared by server and client: Captain Friends and DMs, the Armada (a short co-op group
// of up to five captains and their wingmates), trading between Personal Stations, duels and Armada Duels, rescue,
// co-op Holdout and Armada contracts. All of it is for online games; a solo game hides it.

/**
 * SocialConfig fields:
 * friendsMax: - Maximum friends allowed per captain.
 * mailMax: - Maximum DMs retained for an offline captain per sender.
 * dmLen: - Maximum character length of a direct message.
 * dmGapMs: - Cooldown milliseconds between consecutive DMs from the same captain.
 * awayMin: - Inactivity minutes before a captain is marked as Away.
 */

/**
 * ArmadaBuff fields:
 * shieldRe: - Multiplier for shield recharge rate when sharing a system with members.
 * bounty: - Multiplier for bounty rewards earned in the same system.
 */

/**
 * ArmadaConfig fields:
 * max: - Maximum number of captains allowed in an Armada.
 * nameRe: - Validation regular expression for Armada group names.
 * inviteMin: - Expiration duration in minutes for pending invites.
 * idleMin: - Inactivity minutes before an unattended Armada disbands.
 * buff: - Passive buffs applied to members sharing a system.
 * share: - Share of bounties paid out to nearby armada members.
 */

/**
 * TradeConfig fields:
 * fee: - Credit transfer fee percentage (e.g. 0.02 = 2%).
 * idleMin: - Expiration duration in minutes for an idle station trade session.
 * maxLines: - Maximum distinct item line items allowed per side.
 */

/**
 * DuelConfig fields:
 * floor: - Armor percentage threshold marking a disabled ship/duel defeat.
 * minutes: - Match time limit in minutes before a duel results in a draw.
 * inviteSec: - Expiration duration in seconds for duel invitations.
 */

/**
 * RescueConfig fields:
 * windowSec: - Seconds allowed for an Armada member to board and rescue a downed ship.
 * repair: - Fraction of armor restored upon successful boarding rescue.
 */

/**
 * CoopHoldoutConfig fields:
 * extraPerHelper: - Additional hostiles spawned per helper captain.
 * pctPerHelper: - Percentage increase in hostile durability/stats per helper.
 * helperShare: - Fraction of wave rewards shared with Armada helpers.
 */

/**
 * WarbandConfig fields:
 * names: - Name pool for warband kingpin flagships.
 * leads: - Hull IDs of kingpin flagship hulls (Mk III refits).
 * guards: - Hull IDs of escort guard ships (Mk II refits).
 * guardsBase: - Base number of escort guard ships.
 * guardsPerMember: - Additional escort guards spawned per Armada member.
 * pctPerMember: - Scaling percentage per participating member.
 * rewardBase: - Base credit reward for defeating the warband.
 * rewardDanger: - Additional credit reward scaled by sector danger level.
 * minMembers: - Minimum Armada members required to accept the contract.
 */

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
