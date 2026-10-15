// Quantum Rift 2.6 "Co-op" data, shared by server and client: Captain Friends and DMs, the Armada (a short co-op group
// of up to five captains and their wingmates), trading between Personal Stations, duels and Armada Duels, rescue,
// co-op Holdout and Armada contracts. All of it is for online games; a solo game hides it.

export const SOCIAL = {
  friendsMax: 100, // friends per captain
  mailMax: 50, // DMs kept for an offline captain (per sender, newest kept)
  dmLen: 400, // characters per DM
  dmGapMs: 600, // between two DMs from one captain
  awayMin: 5, // no input for this long: shown as Away
};

export const ARMADA = {
  max: 5, // captains per Armada (each brings their own wingmates)
  nameRe: /^[A-Za-z0-9 '\-]{3,24}$/,
  inviteMin: 5, // an invite lapses after this long
  idleMin: 30, // an Armada with nobody online for this long disbands
  buff: { shieldRe: 1.05, bounty: 1.05 }, // while another member shares your system: +5% shield recharge, +5% bounty
  share: 0.25, // members in the system get this share of each other's bounties (paid on top) and kill credit
};

export const TRADE = {
  fee: 0.02, // on credits sent, like the Exchange
  idleMin: 10, // an open trade with no change for this long is cancelled
  maxLines: 12, // different items one side can put up
};

export const DUEL = {
  floor: 0.12, // a duel ends at disabled: armor never drops below this share in a duel
  minutes: 5, // then it is a draw
  inviteSec: 60, // a challenge lapses after this long
};

export const RESCUE = {
  windowSec: 60, // a downed Armada captain can be boarded by a member this long before the insurers take over
  repair: 0.35, // armor restored by a rescue (shields come back on their own)
};

// co-op Holdout: each helper from your Armada adds hostiles to every wave and makes them tougher, and shares the rewards
export const COOP_HOLDOUT = { extraPerHelper: 1, pctPerHelper: 15, helperShare: 0.6 };

// Armada contracts: group kingpins who fly the Concord's old Mk II and Mk III refits (no longer sold to captains)
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
