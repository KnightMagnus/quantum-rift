import { GalaxyGraph } from './galaxy-graph.ts';
// faction story arcs. Three missions for each of seven powers, separate from the main story. Each arc is offered
// at that power's capital once you have earned some standing there, and ends in a unique Epic officer and specialist
// blueprints. Places are worked out from the map, so text uses {home}, {dest}, {s1} and {s2} placeholders.
import { SYSTEMS, SYS } from './galaxy.js';
const galaxyGraph = new GalaxyGraph(SYS);

/**
 * @typedef {Object} ArcStepRaw
 * @property {'carry'|'kill'|'board'|'boss'|string} type - Mission step archetype.
 * @property {string} title - Mission step title.
 * @property {string} text - Raw narrative text template.
 * @property {string} brief - Concise objective description template.
 * @property {string} done - Narrative epilogue upon completion.
 * @property {string} [progress] - Status message displayed during mission progress.
 * @property {number} [count] - Target count for kill or board objectives.
 * @property {number} [hull] - Target hull ID.
 * @property {string} [faction] - Faction allegiance of target ships.
 * @property {string} [bossName] - Display name of the boss flagship.
 */

/**
 * @typedef {Object} ArcTemplate
 * @property {string} name - Title of the faction story arc.
 * @property {number} spec - Blueprint hull ID unlocked upon arc completion.
 * @property {[string, string]} officer - Epic officer reward tuple [officerName, officerRole].
 * @property {ArcStepRaw[]} steps - Raw mission steps in the storyline arc.
 */

/**
 * @typedef {Object} ArcPlaces
 * @property {string} at - Stellar body ID of the faction capital station where missions originate.
 * @property {string} home - Name of the home station.
 * @property {string} homeSys - System ID of the faction capital.
 * @property {string} s1 - System ID of a friendly neighbouring system.
 * @property {string} s2 - System ID of a nearby dangerous system.
 * @property {string} dest - Destination stellar body ID.
 * @property {string} destName - Name of the destination stellar body.
 */

/**
 * @typedef {Object} ArcStep
 * @property {number} i - Step index (0, 1, or 2).
 * @property {string} title - Step title.
 * @property {string} text - Resolved story dialog text with placeholders filled.
 * @property {string} brief - Resolved mission brief text.
 * @property {string} done - Resolved completion text.
 * @property {string} [progress] - Step progress status text.
 * @property {string} at - Origin station ID.
 * @property {string} back - Turn-in station ID.
 * @property {string|null} dest - Destination station ID (for carry missions).
 * @property {string} sys - System ID where the mission objective is located.
 * @property {number} minRep - Minimum faction reputation required to accept this step.
 * @property {number} pay - Credit reward awarded upon completion.
 * @property {'carry'|'kill'|'board'|'boss'|string} type - Mission objective archetype.
 * @property {number} [count] - Target count of ships to defeat or board.
 * @property {number} [hull] - Target ship hull ID.
 * @property {string} [faction] - Target faction ID.
 * @property {string} [bossName] - Boss ship display name.
 */

/**
 * @typedef {Object} FactionArc
 * @property {string} fac - Faction identifier key.
 * @property {string} name - Title of the faction story arc.
 * @property {number} spec - Specialist blueprint hull ID awarded.
 * @property {[string, string]} officer - Unique Epic officer reward [name, role].
 * @property {ArcPlaces} places - Geographic locations where arc missions take place.
 * @property {ArcStep[]} steps - Instantiated 3-step storyline mission definitions.
 */

const ARC_TEXT = {
  quantum: {
    name: 'The Concord Ledger',
    spec: 812,
    officer: ['Ada Castell', 'captain'],
    steps: [
      {
        type: 'carry',
        title: 'Sealed Orders',
        text: 'A Concord adjutant meets you at the dock with a locked case and an apologetic smile. "The Admiralty needs this in {dest} and the courier fleet is... compromised. We are told you are discreet."',
        brief: 'Carry the sealed case to {dest} ({s1}).',
        done: 'The case is signed for by a woman who never gives her name. "Tell {home} the ledger is safe," she says, and is gone.',
      },
      {
        type: 'kill',
        count: 3,
        hull: 711,
        faction: 'hollow',
        title: 'Cleaning House',
        text: 'The courier leak led somewhere: three Hollow ships are running Concord codes out of {s2}. The Admiralty wants them gone, quietly.',
        brief: 'Destroy the three Hollow ships using stolen codes in {s2}, then return to {home}.',
        progress: 'One of the code-runners breaks apart.',
        done: 'The stolen codes go dark one by one. In the Admiralty, someone is quietly arrested.',
      },
      {
        type: 'boss',
        hull: 716,
        faction: 'hollow',
        bossName: 'The Ledger Thief',
        title: 'The Ledger Thief',
        text: 'Behind the leak is a single captain with a warship and a grudge, now waiting in {s2}. Admiral Castell asks for you by name.',
        brief: 'Destroy the Ledger Thief in {s2}, then return to {home}.',
        progress: "The Ledger Thief's ship tears apart.",
        done: 'Admiral Ada Castell shakes your hand. "I am retiring from the Admiralty," she says, "and I would rather serve on a ship that gets things done." She brings the Bulwark plans with her.',
      },
    ],
  },
  spacer: {
    name: 'The Long Haul',
    spec: 811,
    officer: ['Tully Longstride', 'navigator'],
    steps: [
      {
        type: 'carry',
        title: 'Spare Parts',
        text: 'The Free Spacers\' guild-mother hands you a manifest. "A drive coil, for a family stranded at {dest}. Spacers look after Spacers."',
        brief: 'Deliver the drive coil to {dest} ({s1}).',
        done: 'A whole family cheers as the coil is fitted. The youngest makes you a crooked paper medal.',
      },
      {
        type: 'board',
        count: 2,
        hull: 704,
        faction: 'spacer',
        title: 'Adrift',
        text: 'Two Spacer haulers lost power in {s2}. Raiders will find them before the guild does, unless you get there first.',
        brief:
          'Board the two drifting Spacer haulers in {s2} (choose Rescue), then return to {home}.',
        progress: "The hauler's lights flicker back on.",
        done: 'The rescued crews toast you in the guildhall until well past the night shift.',
      },
      {
        type: 'boss',
        hull: 711,
        faction: 'hollow',
        bossName: 'Gallows Jack',
        title: 'Gallows Jack',
        text: 'The raider who has been picking off Spacer haulers, Gallows Jack, has been spotted in {s2}. The guild has had enough.',
        brief: 'Destroy Gallows Jack in {s2}, then return to {home}.',
        progress: 'Gallows Jack goes down in flames.',
        done: 'Tully Longstride, the guild\'s best navigator, signs on with you. "Anyone who does that much for the Spacers deserves a pilot who knows every back-lane." She brings Pathfinder charts.',
      },
    ],
  },
  vashari: {
    name: 'The Brood Debt',
    spec: 806,
    officer: ['Thrix Wingsworn', 'gunner'],
    steps: [
      {
        type: 'carry',
        title: 'Egg-Gift',
        text: 'The Vashari clutch-speaker clicks and hums. "A gift of eggs, warm, for the brood at {dest}. Carried by a stranger, it is a sign of trust between peoples."',
        brief: 'Carry the egg-gift to {dest} ({s1}).',
        done: 'The brood at {dest} sings a long, rasping song in your honour. It is, you are told, very rare.',
      },
      {
        type: 'kill',
        count: 4,
        hull: 718,
        faction: 'swarm',
        title: 'Feral Kin',
        text: 'Feral Swarm drones, kin gone wild, are attacking Vashari brood-ships in {s2}. The clutch-speaker asks you to end their suffering.',
        brief: 'Destroy four Feral Swarm drones in {s2}, then return to {home}.',
        progress: 'A feral drone falls silent.',
        done: 'The clutch-speaker bows its whole body to the floor. "Our debt grows," it says, "and debts must be paid."',
      },
      {
        type: 'boss',
        hull: 765,
        faction: 'swarm',
        bossName: 'The Brood-Mother',
        title: 'The Brood-Mother',
        text: 'At the heart of the feral swarm in {s2} is a brood-mother, vast and maddened. The Vashari cannot bring themselves to kill her. They ask you to.',
        brief: 'Destroy the Feral Brood-Mother in {s2}, then return to {home}.',
        progress: "The Brood-Mother's song ends.",
        done: 'Thrix Wingsworn, a Vashari gunner, steps forward. "I will fly with the one who freed our mother," he says. The Swarmbreaker plans are yours.',
      },
    ],
  },
  korrund: {
    name: 'Stone and Fire',
    spec: 805,
    officer: ['Basalt Harrowmere', 'engineer'],
    steps: [
      {
        type: 'carry',
        title: 'The Deep Core',
        text: 'A Korrund forge-elder slides a heavy crate across the table. "A core sample from our deepest mine. The assayers at {dest} must see it. Do not drop it."',
        brief: 'Carry the core sample to {dest} ({s1}).',
        done: 'The assayers go very quiet when they open the crate. Then they start shouting, happily, in three languages.',
      },
      {
        type: 'kill',
        count: 3,
        hull: 705,
        faction: 'hollow',
        title: 'Claim Jumpers',
        text: 'Word of the strike got out. Claim jumpers are circling the Korrund survey ships in {s2}.',
        brief: 'Drive off the three claim jumpers in {s2}, then return to {home}.',
        progress: 'A claim jumper is blown apart.',
        done: 'The forge-elder grunts, which from a Korrund is a standing ovation.',
      },
      {
        type: 'boss',
        hull: 716,
        faction: 'hollow',
        bossName: 'Iron Maw',
        title: 'Iron Maw',
        text: 'The claim jumpers answer to Iron Maw, a raider captain with a converted mining hulk in {s2}.',
        brief: 'Destroy Iron Maw in {s2}, then return to {home}.',
        progress: "Iron Maw's hulk splits open.",
        done: 'Basalt Harrowmere, a Korrund engineer, joins your crew with a set of Lodestar mining-ship plans. "Rich veins need a proper ship," she says.',
      },
    ],
  },
  ylith: {
    name: 'The Quiet Light',
    spec: 807,
    officer: ['Seren Of-The-Veil', 'scout'],
    steps: [
      {
        type: 'carry',
        title: 'A Whisper',
        text: 'An Ylith seer speaks without moving her lips. "A message. It must be spoken aloud only at {dest}. You will not understand it. That is the point."',
        brief: 'Carry the Ylith message to {dest} ({s1}).',
        done: 'You speak the strange words at {dest}. Somewhere far away, something listens.',
      },
      {
        type: 'kill',
        count: 3,
        hull: 761,
        faction: 'umbral',
        title: 'Shadows in the Veil',
        text: 'Umbral hunters have been seen in {s2}, putting out the lights of Ylith listening posts.',
        brief: 'Destroy three Umbral hunters in {s2}, then return to {home}.',
        progress: 'An Umbral hunter dissolves into the dark.',
        done: 'The listening posts light up again, one by one.',
      },
      {
        type: 'boss',
        hull: 763,
        faction: 'umbral',
        bossName: 'The Veil-Drinker',
        title: 'The Veil-Drinker',
        text: 'Something larger hunts in {s2} now, an Umbral ship the seers call the Veil-Drinker.',
        brief: 'Destroy the Veil-Drinker in {s2}, then return to {home}.',
        progress: 'The Veil-Drinker breaks apart.',
        done: 'Seren Of-The-Veil, an Ylith scout, chooses you. "I saw this," she says. "I have seen what comes next." The Nightglass plans are a gift.',
      },
    ],
  },
  sarn: {
    name: 'A Fair Price',
    spec: 814,
    officer: ['Merchant-Prince Odesh', 'quartermaster'],
    steps: [
      {
        type: 'carry',
        title: 'Contract Terms',
        text: 'A Sarn broker counts your teeth with her eyes. "A contract, for signature at {dest}. Timely delivery reflects well on all parties."',
        brief: 'Carry the Sarn contract to {dest} ({s1}).',
        done: 'The contract is signed. The broker sends a message: "Acceptable."',
      },
      {
        type: 'kill',
        count: 3,
        hull: 708,
        faction: 'hollow',
        title: 'Bad Debts',
        text: 'Three debtors have fled with Sarn credit and are hiding in {s2}. The broker would like the matter closed.',
        brief: "Destroy the three debtors' ships in {s2}, then return to {home}.",
        progress: 'A debt is settled, permanently.',
        done: 'The broker updates her ledger. "Paid in full," she says.',
      },
      {
        type: 'boss',
        hull: 716,
        faction: 'hollow',
        bossName: 'The Defaulter',
        title: 'The Defaulter',
        text: 'The man behind the debts, known only as the Defaulter, owes the Sarn a fortune and waits in {s2} with a warship.',
        brief: 'Destroy the Defaulter in {s2}, then return to {home}.',
        progress: "The Defaulter's account is closed.",
        done: 'Merchant-Prince Odesh signs on as your quartermaster. "I invest in winners," he says, and hands over Vanguard plans as a signing bonus.',
      },
    ],
  },
  thalassi: {
    name: 'The Tide-Song',
    spec: 810,
    officer: ['Maren Deepcurrent', 'engineer'],
    steps: [
      {
        type: 'carry',
        title: 'Water from Home',
        text: 'A Thalassi elder offers you a sealed flask. "Water from our home sea, for the colonists at {dest}. They have not tasted it in a generation."',
        brief: 'Carry the flask of home-water to {dest} ({s1}).',
        done: 'The colonists at {dest} share the water, a drop each. Many of them weep.',
      },
      {
        type: 'board',
        count: 2,
        hull: 707,
        faction: 'thalassi',
        title: 'Becalmed Singers',
        text: 'Two Thalassi song-ships went silent in {s2}. Their crews may still be alive.',
        brief: 'Board the two silent song-ships in {s2} (choose Rescue), then return to {home}.',
        progress: 'The song-ship hums back to life.',
        done: 'The rescued singers sing for you, and the whole station stops to listen.',
      },
      {
        type: 'boss',
        hull: 716,
        faction: 'hollow',
        bossName: 'The Wrecker',
        title: 'The Wrecker',
        text: 'The song-ships were not becalmed by accident. A raider called the Wrecker silenced them, and waits in {s2} for more.',
        brief: 'Destroy the Wrecker in {s2}, then return to {home}.',
        progress: 'The Wrecker is wrecked.',
        done: 'Maren Deepcurrent, a Thalassi engineer, joins you with Tidecaller plans. "The tide brought you to us," she says. "Now I go where the tide goes."',
      },
    ],
  },
};
/**
 * Faction keys possessing custom faction storyline arcs.
 * @type {string[]}
 */
export const ARC_FACS = Object.keys(ARC_TEXT);

/**
 * Minimum faction reputation prerequisite per arc progression step [step1, step2, step3].
 * @type {number[]}
 */
export const ARC_MIN_REP = [15, 25, 35];

/**
 * Credit reward payout per arc progression step [step1, step2, step3].
 * @type {number[]}
 */
export const ARC_PAY = [20000, 45000, 120000];

// work out each arc's places: the capital (highest-tech world with a bar), a friendly neighbour, and a rougher system nearby
/**
 * Resolves origin, transit, and destination stations and systems for a faction's arc based on the galaxy map.
 * @param {string} fac - Faction ID key.
 * @returns {ArcPlaces|null} Resolved places for the storyline missions, or null if faction lacks valid worlds.
 */
function placesFor(fac) {
  const mine = SYSTEMS.filter((S) => S.faction === fac && !S.farside);
  const worlds = mine
    .flatMap((S) =>
      S.stellars
        .filter(
          (stellarBody) =>
            stellarBody.svc &&
            stellarBody.svc.includes('B') &&
            stellarBody.svc.includes('L') &&
            !stellarBody.site,
        )
        .map((stellarBody) => ({ p: stellarBody, S })),
    )
    .sort((a, b) => (b.p.tech || 0) - (a.p.tech || 0) || a.p.id.localeCompare(b.p.id));
  if (!worlds.length) return null;
  const home = worlds[0];
  let s1 = null,
    s2 = null;
  for (const [systemId, distance] of galaxyGraph.walk(home.S.id)) {
    if (!distance) continue;
    const S = SYS[systemId];
    if (S.arena || S.faction === 'deep' || S.farside) continue;
    if (
      !s1 &&
      S.faction === fac &&
      S.stellars.some(
        (stellarBody) => stellarBody.svc && stellarBody.svc.includes('L') && !stellarBody.site,
      )
    )
      s1 = S;
    if (!s2 && S.id !== home.S.id && S.danger >= 2 && S.faction !== 'quevari') s2 = S;
    if (s1 && s2) break;
  }
  s1 = s1 || home.S;
  s2 = s2 || s1;
  const dest =
    s1.stellars.find(
      (stellarBody) =>
        stellarBody.svc &&
        stellarBody.svc.includes('L') &&
        !stellarBody.site &&
        stellarBody.id !== home.p.id,
    ) || home.p;
  return {
    at: home.p.id,
    home: home.p.name,
    homeSys: home.S.id,
    s1: s1.id,
    s2: s2.id,
    dest: dest.id,
    destName: dest.name,
  };
}

/**
 * Replaces geographic template placeholders ({home}, {dest}, {s1}, {s2}) with resolved station and system names.
 * @param {string} t - Narrative text template containing placeholders.
 * @param {ArcPlaces} P - Resolved location metadata.
 * @returns {string} Text with all location placeholders populated.
 */
const fill = (t, P) =>
  (t || '')
    .replace(/\{home\}/g, P.home)
    .replace(/\{dest\}/g, P.destName)
    .replace(/\{s1\}/g, SYS[P.s1].name)
    .replace(/\{s2\}/g, SYS[P.s2].name);

/**
 * Complete collection of faction storyline arcs keyed by faction identifier.
 * @type {Object.<string, FactionArc>}
 */
export const ARCS = Object.fromEntries(
  ARC_FACS.map((f) => {
    const P = placesFor(f),
      T = ARC_TEXT[f];
    if (!P) return [f, null];
    return [
      f,
      {
        fac: f,
        name: T.name,
        spec: T.spec,
        officer: T.officer,
        places: P,
        steps: T.steps.map((st, i) => ({
          ...st,
          i,
          title: st.title,
          text: fill(st.text, P),
          brief: fill(st.brief, P),
          done: fill(st.done, P),
          progress: st.progress,
          at: P.at,
          back: P.at,
          dest: st.type === 'carry' ? P.dest : null,
          sys: st.type === 'carry' ? P.s1 : P.s2,
          minRep: ARC_MIN_REP[i],
          pay: ARC_PAY[i],
        })),
      },
    ];
  }).filter(([, v]) => v),
);
