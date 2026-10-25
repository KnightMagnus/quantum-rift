export type StoryStep = StoryMission;
export type StoryMission = {
  /** Unique storyline step identifier (e.g. 'qv1'). */
  id: string;

  /** Mission title displayed in dialogs and mission log. */
  title: string;

  /** Station or location ID where the mission is offered. */
  at: string;

  /** Mission objective archetype. */
  type: string;

  /** Destination station ID for courier/transport missions. */
  dest?: string;

  /** Target system ID where the objective takes place. */
  sys?: string;

  /** Target count of ships to defeat or board. */
  count?: number;

  /** Target or reward hull ID. */
  hull?: number;

  /** Faction identifier of targets or allies. */
  faction?: string;

  /** Array of friendly escort hull IDs spawned during boss encounter. */
  allies?: number[];

  /** Station ID to return to upon objective completion. */
  back?: string;

  /** Credit reward awarded on completion. */
  pay: number;

  /** Reputation points awarded on completion. */
  rep: number;

  /** Minimum faction reputation prerequisite to accept the mission. */
  minRep?: number;

  /** Special item or commodity reward tuple [itemType, quantity]. */
  crate?: [string, number];

  /** Narrative dialog text presented when offered. */
  text: string;

  /** Concise objective summary for UI displays. */
  brief: string;

  /** Acceptance button prompt text. */
  acc: string;

  /** Rejection or postponement button prompt text. */
  ref: string;

  /** Status message displayed during mission progress. */
  progress?: string;

  /** Narrative epilogue displayed when claiming mission rewards. */
  done: string;
};
// Quantum Rift: the Que'vari storyline, as golden main-story missions.
// Each step: where it is offered, what you must do, and what it pays. Text is shown in landing pop-ups.

/**
 * Main Que'vari golden story mission chain progression.
 */
export const STORY: StoryMission[] = [
  {
    id: 'qv1',
    title: 'Light Through the Rift',
    at: 'threshold',
    type: 'carry',
    dest: 'inalumen',
    pay: 15000,
    rep: 8,
    text: 'A watcher in dawn-colored robes is waiting on the pad when you land. She studies your ship for a long moment, then you.\n\n"You are called by the door," she says, in careful, bell-clear words. "Our ships sail to a hundred ports, but a watcher waits for only one captain. The light pointed to you. I am Sel\'ani, of the Que\'vari. We are the People of Light. Will you carry me home to Ina Lumen? The elders will want to see you with their own eyes."',
    brief: "Carry Sel'ani to Ina Lumen in the Que'var system.",
    acc: 'Take her home',
    ref: 'Not now',
    done: 'Ina Lumen rises to meet you, white spires and rising light. The elders receive you in a hall roofed with sails. They ask a hundred questions about you and answer almost none of yours. When they are done, Sel\'ani presses a light-token into your hand. "That was their way of saying welcome," she whispers.',
  },
  {
    id: 'qv2',
    title: 'Becalmed',
    at: 'inalumen',
    type: 'board',
    sys: 'dimmer',
    count: 3,
    hull: 739,
    faction: 'quevari',
    back: 'inalumen',
    pay: 35000,
    rep: 10,
    crate: ['crystal', 2],
    text: 'Sel\'ani finds you as you land. "Three of our sloops went into Dimmer Reach and their light has gone out. Something there drinks light: the Umbral. Without light our sails cannot carry them home. Board them and wake their emitters, and they will follow the light back."',
    brief:
      "Board the three becalmed Que'vari sloops in Dimmer Reach (choose Rescue), then return to Ina Lumen.",
    acc: "I'll find them",
    ref: 'Not now',
    progress: "The sloop's sails flare light blue. It turns for home.",
    done: 'The sloop crews are carried into the garden-hall to cheering and song. One of them, an old sailwright, tells you what they saw in the Reach: dark ships with their running lights put out, waiting.',
  },
  {
    id: 'qv3',
    title: 'Shades on the Wind',
    at: 'inalumen',
    type: 'kill',
    sys: 'shoalight',
    count: 4,
    hull: 761,
    faction: 'umbral',
    back: 'inalumen',
    pay: 50000,
    rep: 12,
    minRep: 25,
    crate: ['isotope', 3],
    text: 'The elders are grave. "The Umbral hunt our trade-choirs in Shoalight now. They put out a ship\'s light and take everything inside. A choir is crossing tomorrow. Will you stand with it?"',
    brief: 'Destroy the four Umbral hunters waiting in Shoalight, then return to Ina Lumen.',
    acc: 'Stand with them',
    ref: 'Not yet',
    progress: 'An Umbral hunter breaks apart.',
    done: "The choir arrives at Ina Lumen in full voice. That night the elders speak of the Umbral's anchorage beyond Dimmer Reach, where their great dark ship waits. Sel'ani gives you their star-charts of the dark: the Deep is open to you now.",
  },
  {
    id: 'qv4',
    title: 'The Night Anchor',
    at: 'inalumen',
    type: 'boss',
    sys: 'umbra',
    hull: 764,
    faction: 'umbral',
    allies: [740, 741, 741, 742],
    back: 'inalumen',
    pay: 150000,
    rep: 15,
    minRep: 40,
    crate: ['crystal', 4],
    text: 'Every Que\'vari choir-of-war is gathering over Ina Lumen. "The Night Anchor has put out the light of a hundred ships," Sel\'ani says. "Tomorrow we go to Umbra and put an end to it. The elders ask you to lead us."',
    brief:
      "Lead the Que'vari choirs-of-war into Umbra and destroy the Night Anchor. Then return to Ina Lumen.",
    acc: 'Lead them',
    ref: 'Not yet',
    progress:
      'The Night Anchor breaks apart, and for the first time in an age, light spills across Umbra.',
    done: 'You return to an Ina Lumen lit from pole to pole. The elders say nothing at all. Instead they lead you up the highest spire, and point to the edge of the sky, where something enormous is waking.',
  },
  {
    id: 'qv5',
    title: "The Ina Que'var",
    at: 'inalumen',
    type: 'gift',
    hull: 744,
    pay: 0,
    rep: 20,
    text: 'Above Ina Lumen, the Ina Que\'var unfurls her sails: a great sail-ship like a whale of white pearl, her light-blue sails spreading one after another until they fill the sky.\n\n"She has slept since the Umbral came," Sel\'ani says. "She would not wake for us. She woke for you." The elders have given her to you, freely. Her old crew is already aboard, and they are singing.',
    brief: "Take the helm of the Ina Que'var.",
    acc: 'Take the helm',
    ref: 'Not yet',
    done: "The Ina Que'var is yours. Your old ship is waiting in your drydock (or was sold for you, if every berth was full).",
  },
];

/**
 * Hull ID of the legendary Ina Que'var reward ship awarded at the conclusion of the story.
 */
export const STORY_SHIP: number = 744;

/**
 * Storyline step identifier that unlocks navigation access to the Deep systems.
 */
export const DEEP_UNLOCK: string = 'qv3'; // the Que'vari charts of the dark open the Deep
