// Quantum Rift: questlines. Two kinds:
//  - CHAINS: generated multi-step jobs offered by recurring contacts at spaceport bars. Each contact remembers you.
//  - SIDE_STORIES: seven handcrafted stories that start at a particular world.
// A step is an ordinary job (cargo, survey, rescue, bounty, assassinate, passenger, smuggle, convoy, supply, patrol, salvage)
// plus the story around it. `where` picks the step's system: 'W' (the contact's), 'A' or 'B' (two systems nearby, B further).
// Text placeholders: {contact} {W} {Wsys} {A} {B} {X} (a port in A) {Y} (a port in B) {ship} {target} {n}.
// `beat` is told when that step is done, before the next one begins.

/**
 * @typedef {Object} QuestChainStep
 * @property {'survey'|'rescue'|'bounty'|'cargo'|'passenger'|'convoy'|'patrol'|'smuggle'|'assassinate'|'salvage'|string} type - Mission step archetype.
 * @property {'W'|'A'|'B'|string} where - Relative system locator ('W' = contact world, 'A' = near system, 'B' = distant system).
 * @property {string} title - Step title template.
 * @property {string} brief - Concise objective instructions template.
 * @property {string} [beat] - Narrative bridge text delivered upon completing this step.
 * @property {number} [qty] - Target commodity quantity.
 * @property {string} [cid] - Commodity ID for cargo/delivery objectives.
 * @property {number} [rush] - Rush mission delivery time limit in minutes.
 * @property {number} [pax] - Passenger count to transport.
 * @property {number} [need] - Target count of ships to destroy or board.
 * @property {string} [target] - Target enemy ship name.
 */

/**
 * @typedef {Object} QuestChain
 * @property {string} id - Unique quest chain identifier.
 * @property {string} name - Title of the quest storyline.
 * @property {'lawful'|'shady'|'wild'|'any'|string} kind - Contact archetype alignment required to offer this chain.
 * @property {string} intro - Initial bar patron dialogue offering the quest chain.
 * @property {QuestChainStep[]} steps - Progressive sequence of mission steps.
 * @property {string} end - Epilogue dialogue upon chain completion.
 */

/**
 * @typedef {Object} SideStoryStep
 * @property {string} type - Mission step archetype.
 * @property {string} [sys] - Target star system ID.
 * @property {string} [dest] - Destination port or stellar body ID.
 * @property {string} title - Mission step title.
 * @property {string} brief - Step objective brief.
 * @property {string} [beat] - Narrative beat text advancing the story.
 * @property {string} [target] - Target NPC name.
 * @property {number} [qty] - Cargo tonnage.
 * @property {string} [cid] - Cargo commodity identifier.
 * @property {number} [rush] - Delivery time limit in minutes.
 * @property {number} [hull] - Target ship hull ID.
 * @property {string} [faction] - Target faction ID.
 */

/**
 * @typedef {Object} SideStoryReward
 * @property {number} credits - Credit reward payout.
 * @property {string} [radio] Discovered station rewarded on completion.
 * @property {[string, number]} [crate] - Material crate reward tuple [materialType, grade].
 * @property {number} [bp] - Blueprint fragments rewarded.
 */

/**
 * @typedef {Object} SideStory
 * @property {string} id - Unique side story identifier.
 * @property {string} name - Story title.
 * @property {string} at - Starting port ID where quest giver is located.
 * @property {string} giver - Full name and title of the story NPC quest giver.
 * @property {string} intro - Initial quest offering dialog.
 * @property {SideStoryStep[]} steps - Progressive sequence of story mission steps.
 * @property {string} end - Concluding narrative text upon story completion.
 * @property {SideStoryReward} reward - Completion reward bundle.
 */

/**
 * Honorific title pools for bar contact archetypes.
 * @type {Object.<string, string[]>}
 */
export const CONTACT_TITLES = {
  lawful: [
    'Dockmaster',
    'Harbour Clerk',
    'Concord Liaison',
    'Insurance Assessor',
    'Shipping Agent',
    'Port Physician',
  ],
  shady: ['Fixer', 'Broker', 'Quartermaster', 'Fence', 'Old Smuggler'],
  wild: ['Prospector', 'Salvage Boss', 'Frontier Marshal', 'Retired Pilot'],
};

/**
 * Procedurally-instantiated multi-step contact quest chains.
 * @type {QuestChain[]}
 */
export const CHAINS = [
  {
    id: 'freighter',
    name: 'The Missing Freighter',
    kind: 'lawful',
    intro:
      '{contact} slides a datapad across the table. "The {ship} was due in from {A} three days ago and never arrived. The insurers have given up. I haven\'t. Find out what happened."',
    steps: [
      {
        type: 'survey',
        where: 'A',
        title: 'Trace the {ship}',
        brief: 'Sweep three points in {A} where the {ship} last reported.',
        beat: 'Your sensors catch a faint transponder echo: the {ship} is still out there, drifting, her reactor cold.',
      },
      {
        type: 'rescue',
        where: 'A',
        title: 'Board the {ship}',
        brief: 'Find the drifting {ship} in {A}, board her and get her crew off.',
        beat: 'The crew is alive, just. The captain tells you raiders cut their engines and stripped the hold. One of them was called {target}.',
      },
      {
        type: 'bounty',
        where: 'B',
        title: 'Hunt down {target}',
        brief: '{target} is hiding out in {B}. Destroy them.',
        beat: "In the wreckage of {target}'s ship you find the {ship}'s flight recorder, still sealed.",
      },
      {
        type: 'cargo',
        where: 'W',
        qty: 1,
        cid: 'equipment',
        title: 'Bring the recorder to {contact}',
        brief: "Carry the {ship}'s flight recorder back to {W}.",
      },
    ],
    end: '{contact} turns the recorder over in their hands. "Now the insurers will have to pay out. You\'ve done more for that crew than anyone. If I ever have work worth doing, it\'s yours."',
  },
  {
    id: 'medicine',
    name: 'Fever Run',
    kind: 'any',
    intro:
      '{contact} looks exhausted. "There\'s a fever in {A}. Their clinic is out of everything. I can get you the first shipment, but I need a captain who doesn\'t ask for danger pay."',
    steps: [
      {
        type: 'cargo',
        where: 'A',
        qty: 6,
        cid: 'medical',
        rush: 14,
        title: 'Rush serum to {X}',
        brief: 'Deliver 6 tons of serum to {X} before it spoils.',
        beat: 'The clinic at {X} is overwhelmed. Their head doctor begs you to fetch a specialist from {Y}.',
      },
      {
        type: 'passenger',
        where: 'B',
        pax: 1,
        title: 'Fly Dr. Okonkwo to {Y}',
        brief:
          'Dr. Okonkwo, an epidemiologist, needs passage to the research labs at {Y} to culture the fever.',
        beat: 'Dr. Okonkwo\'s cultures come back within the hour, and she goes pale. "This needs a full supply run, not a dribble."',
      },
      {
        type: 'supply',
        where: 'A',
        qty: 12,
        cid: 'medical',
        title: 'Supply {X} with medicine',
        brief: 'Buy 12 tons of medical supplies anywhere and deliver them to {X}.',
      },
    ],
    end: 'Word reaches {contact} that the fever in {A} is breaking. "You flew into a plague for strangers. People will remember that. I will."',
  },
  {
    id: 'informant',
    name: 'The Informant',
    kind: 'shady',
    intro:
      '{contact} keeps their voice low. "A friend of mine knows too much about the wrong people. I need them moved, quietly, and I need the people hunting them to stop."',
    steps: [
      {
        type: 'smuggle',
        where: 'A',
        qty: 3,
        title: 'Deliver a false trail to {X}',
        brief:
          'Carry three tons of decoy crates to {X}. Let anyone watching think the informant went there.',
        beat: 'The decoy works. Somebody took the bait: a hunter called {target} is asking questions at {X}.',
      },
      {
        type: 'passenger',
        where: 'B',
        pax: 1,
        title: 'Move the informant to {Y}',
        brief: "Carry the informant to {Y}. Don't talk to them about where they've been.",
        beat: 'The informant gives you a name before they leave: {target}, and the system they hunt from.',
      },
      {
        type: 'assassinate',
        where: 'A',
        title: 'Silence {target}',
        brief: '{target} commands a raider capital in {A}. Make sure they stop hunting.',
      },
    ],
    end: '{contact} pours two drinks. "My friend is safe, and nobody is looking for them now. You\'re good at this. That makes you valuable, and dangerous. I like both."',
  },
  {
    id: 'ghost',
    name: 'Ghost Signal',
    kind: 'wild',
    intro:
      '{contact} plays you a recording: a looping distress call, decades old, from somewhere in {A}. "That ship went missing before I was born. The signal started again last week. I want to know why."',
    steps: [
      {
        type: 'survey',
        where: 'A',
        title: 'Triangulate the signal',
        brief: 'Fly to three points in {A} to triangulate the ghost signal.',
        beat: 'The signal resolves to a single point in empty space: a data core, still broadcasting.',
      },
      {
        type: 'salvage',
        where: 'A',
        title: 'Recover the data core',
        brief: 'Fly to the marked point in {A} and scoop up the data core.',
        beat: 'The core holds the old ship\'s last log. It ends with coordinates in {B}, and one line: "They followed us out of the dark."',
      },
      {
        type: 'bounty',
        where: 'B',
        hostile: 'umbral',
        title: 'What waits in {B}',
        brief: "Go to {B}. Something is waiting at the old ship's last coordinates. Destroy it.",
        beat: 'Whatever it was, it is gone now. The core goes quiet.',
      },
      {
        type: 'cargo',
        where: 'W',
        qty: 1,
        cid: 'equipment',
        title: 'Bring the core to {contact}',
        brief: 'Carry the silent data core back to {W}.',
      },
    ],
    end: '{contact} listens to the old log in silence. "Fifty years, and they finally made it home. Thank you, Captain."',
  },
  {
    id: 'claim',
    name: "Prospector's Claim",
    kind: 'wild',
    intro:
      '{contact} grins. "I\'ve found a seam in {A} that\'ll make us both rich. Help me prove the claim and haul the first load, and you get a cut."',
    steps: [
      {
        type: 'survey',
        where: 'A',
        title: 'Survey the seam',
        brief: 'Fly a survey of the claim in {A}: three marked points.',
        beat: "The seam is real, and it's rich. Now the Prospectors' Office wants ore in hand before they file the claim.",
      },
      {
        type: 'supply',
        where: 'A',
        qty: 20,
        cid: 'ore',
        title: 'Prove the claim',
        brief: 'Bring 20 tons of ore to {X}. Mine it yourself, or buy it.',
        beat: 'The claim is filed. Someone else has heard about it, though: claim-jumpers are gathering in {A}.',
      },
      {
        type: 'patrol',
        where: 'A',
        need: 3,
        title: 'Drive off the claim-jumpers',
        brief: 'Destroy 3 raiders in {A}, then land anywhere.',
      },
    ],
    end: "{contact} slaps the bar. \"Claim's ours! Here's your cut, partner, and the next round's on me.\"",
  },
  {
    id: 'escort',
    name: 'Dignitary Duty',
    kind: 'lawful',
    intro:
      '{contact} straightens their uniform. "A trade delegation is travelling through {A}, and the lanes there are not what they were. I need an escort captain with a clean record."',
    steps: [
      {
        type: 'convoy',
        where: 'A',
        title: 'Escort the delegation',
        brief: "Meet the delegation's freighter in {A} and keep her alive until she lands.",
        beat: 'The delegates are grateful, and rattled. They want the lanes cleared before their return trip.',
      },
      {
        type: 'patrol',
        where: 'A',
        need: 3,
        title: 'Clear the lanes',
        brief: 'Destroy 3 hostile ships in {A}, then land anywhere.',
        beat: 'With the lanes quiet, the head delegate asks for a private ride home.',
      },
      {
        type: 'passenger',
        where: 'W',
        pax: 2,
        title: 'Fly the delegates home',
        brief: 'Carry the two senior delegates to {W}.',
      },
    ],
    end: "{contact} reads the delegation's report and smiles. \"They called you 'the only competent thing in the sector.' From them, that's a medal.\"",
  },
  {
    id: 'debt',
    name: 'A Debt Repaid',
    kind: 'any',
    intro:
      "{contact} sighs. \"Years ago a captain saved my life and wouldn't take a credit for it. I've finally found where they ended up. They're in trouble, and I can't go myself.\"",
    steps: [
      {
        type: 'cargo',
        where: 'A',
        qty: 8,
        cid: 'equipment',
        title: 'Deliver spare parts to {X}',
        brief: "Carry 8 tons of spare parts to {X}, where the old captain's ship is grounded.",
        beat: "The old captain's ship is repaired, but they're not aboard: they went out after a missing crewmate in {B} and didn't come back.",
      },
      {
        type: 'rescue',
        where: 'B',
        title: 'Find the old captain',
        brief: "The old captain's shuttle is drifting in {B}. Board it.",
        beat: 'The old captain is weak but alive, and laughs when they hear who sent you. "Tell {contact} we\'re square. Better yet, take me to them."',
      },
      {
        type: 'passenger',
        where: 'W',
        pax: 1,
        title: 'Bring the old captain to {W}',
        brief: 'Carry the old captain to {W}.',
      },
    ],
    end: 'The two old friends embrace in the middle of the bar. {contact} wipes their eyes. "Some debts you\'re glad to pay. Thank you."',
  },
];

// ---- seven handcrafted side stories, each starting at a particular world
/**
 * Handcrafted narrative side quest storylines starting at specific worlds.
 * @type {SideStory[]}
 */
export const SIDE_STORIES = [
  {
    id: 'lantern',
    name: 'The Last Lantern',
    at: 'vigil-lamp',
    giver: 'Keeper Ansel Morrow',
    intro:
      'An old Lamplighter keeper in a patched coat beckons you over. "Every lighthouse in the Rift was lit by my order, once. One still burns that shouldn\'t: the Last Lantern, out past Gloam. Somebody is using it to lure ships onto raiders. I want it put out, and I want to know who lit it."',
    steps: [
      {
        type: 'survey',
        sys: 'waystation',
        title: 'Ask along the Waystation lanes',
        brief: 'Fly a sweep of Waystation, where the wrecks lured by the false light were found.',
        beat: 'The wreck pattern points straight at Gloam. Every lost ship followed the same false beacon.',
      },
      {
        type: 'rescue',
        sys: 'gloam',
        title: "The lure's latest victim",
        brief:
          'A trader followed the false light into Gloam. Find the drifting ship and board her.',
        beat: "The trader's captain says the beacon is run by a Hollow crew under a woman called the Lamp-Eater.",
      },
      {
        type: 'assassinate',
        sys: 'gloam',
        target: 'the Lamp-Eater',
        title: 'Put out the Last Lantern',
        brief:
          'The Lamp-Eater commands the false beacon from a raider capital in Gloam. Destroy her flagship.',
      },
    ],
    end: 'Keeper Morrow lights a small lamp on the bar and lets it burn down. "That was the last of the old lights. Better dark than a lie. Take this; the order has no more use for it."',
    reward: { credits: 90000, crate: ['crystal', 3], bp: 10 },
  },
  {
    id: 'saltiron',
    name: 'Salt and Iron',
    at: 'tide',
    giver: 'Tidewarden Ilua',
    intro:
      'A Thalassi tidewarden, robes still damp from the brine pools, bows to you. "The Korrund forges at Slagforge have been dumping slag into the trade lanes. Our reef-ships cannot pass. I would rather talk than fight. Will you carry our words, and our patience?"',
    steps: [
      {
        type: 'cargo',
        sys: 'slagforge',
        qty: 4,
        cid: 'silk',
        title: 'A gift for the Forgemaster',
        brief: 'Carry four tons of reef-silk to Slag as a peace gift.',
        beat: 'The Forgemaster accepts the gift, gruffly. "We dump slag because the ore haulers won\'t take it. Bring us a way to move it, and we\'ll stop."',
      },
      {
        type: 'supply',
        sys: 'slagforge',
        qty: 30,
        cid: 'industrial',
        title: 'Slag-movers for the forges',
        brief:
          'Buy 30 tons of industrial goods and deliver them to Slag so the forges can build slag haulers.',
        beat: 'The forges fire up new haulers. One last problem: raiders have been picking off the reef-ships while the lanes were blocked.',
      },
      {
        type: 'patrol',
        sys: 'tidepool',
        need: 4,
        title: 'Guard the reef-lanes',
        brief: 'Destroy 4 raiders in Tidepool so the reef-ships can sail again.',
      },
    ],
    end: 'Tidewarden Ilua presses a pearl of hardened brine into your hand. "Salt and iron, at peace, because one captain carried words instead of guns. The reef will sing of it."',
    reward: { credits: 80000, crate: ['isotope', 3], officer: 'thalassi' },
  },
  {
    id: 'caravan',
    name: 'The Clockwork Caravan',
    at: 'spoke',
    giver: 'Wheelmother Tess Varga',
    intro:
      'A Sarn wheelmother with brass rings in her ears taps the table. "Our oldest caravan, the Clockwork, broke a wheel between here and Caravanserai. A hundred families aboard. Help us bring them in, and you ride with the Sarn forever."',
    steps: [
      {
        type: 'cargo',
        sys: 'wheelwright',
        qty: 10,
        cid: 'metal',
        title: 'Spare wheel-steel',
        brief: 'Carry 10 tons of wheel-steel to Rest, where the Clockwork is stranded.',
        beat: 'The wheel is mended, but the caravan is too slow to outrun the raiders that have been circling it.',
      },
      {
        type: 'convoy',
        sys: 'wheelwright',
        title: 'Escort the Clockwork',
        brief: 'Keep the Clockwork alive until she lands safely.',
        beat: 'The Clockwork is safe. The families want to celebrate in Caravanserai, and they want you there.',
      },
      {
        type: 'passenger',
        sys: 'caravanserai',
        pax: 4,
        title: 'The guests of honour',
        brief: 'Carry four caravan elders to Serai for the celebration.',
      },
    ],
    end: 'The whole of Serai seems to turn out. Wheelmother Varga ties a brass ring to your ship\'s hatch. "Now every Sarn caravan knows your ship. You\'ll never pay for a bunk on the wheel again."',
    reward: { credits: 75000, crate: ['alloy', 3], officer: 'sarn' },
  },
  {
    id: 'hollowwar',
    name: 'Echoes of the Hollow War',
    at: 'waystation-hub',
    giver: 'Veteran Rook Halloran',
    intro:
      'A one-eyed veteran nurses a drink. "Forty years ago I lost my wingmate over Emberlight, fighting the Hollow. Her ship was never found. They say the old battle wrecks are surfacing again. I want to bring her home."',
    steps: [
      {
        type: 'survey',
        sys: 'emberlight',
        title: 'The old battlefield',
        brief: 'Survey the old Hollow War battlefield in Emberlight.',
        beat: "Among the old wrecks your scanners pick out a Concord fighter's transponder, still faintly ticking.",
      },
      {
        type: 'salvage',
        sys: 'emberlight',
        title: 'Recover her flight recorder',
        brief: 'Fly to the transponder in Emberlight and recover the old flight recorder.',
        beat: "The recorder's last minutes show her holding off three raiders so her squadron could escape. The raiders' leader still flies out of Gloam.",
      },
      {
        type: 'bounty',
        sys: 'gloam',
        target: 'Old Man Cauldry',
        title: 'An old debt',
        brief:
          'Old Man Cauldry led the raiders that killed her. He still flies out of Gloam. End it.',
      },
      {
        type: 'cargo',
        sys: 'waystation',
        qty: 1,
        cid: 'equipment',
        title: 'Bring her home',
        brief: 'Carry the flight recorder back to Waystation Hub.',
      },
    ],
    end: 'Rook Halloran listens to the recording twice, then switches it off. "She went out like she lived: buying time for everyone else. Thank you for bringing her home."',
    reward: { credits: 110000, crate: ['alloy', 4], bp: 15 },
  },
  {
    id: 'archive',
    name: 'The Concord Archive',
    at: 'meridian-yards',
    giver: 'Archivist Pell Ravensworth',
    intro:
      "An archivist in grey gloves squints at you. \"Somebody has been stealing the Concord's oldest records, the ones from before the Rift opened. They sell them to collectors. I've traced the thief's couriers. I need a pilot.\"",
    steps: [
      {
        type: 'survey',
        sys: 'halcyon',
        title: 'Shadow the courier',
        brief: "The thief's courier passed through Halcyon. Sweep the system for its trail.",
        beat: 'The trail leads to a courier ship drifting near Halcyon, abandoned in a hurry. Something is still aboard.',
      },
      {
        type: 'rescue',
        sys: 'halcyon',
        title: 'The abandoned courier',
        brief: 'Board the abandoned courier in Halcyon.',
        beat: "The courier's pilot was left to die by the thief. In exchange for rescue, she gives up her employer: a collector on Terra.",
      },
      {
        type: 'cargo',
        sys: 'sol',
        qty: 1,
        cid: 'luxury',
        title: 'Bait for a collector',
        brief: 'Carry a forged "lost archive" to Terra to draw the collector out.',
        beat: 'The collector takes the bait, and the Concord Watch takes the collector. The stolen records are recovered.',
      },
      {
        type: 'cargo',
        sys: 'meridian',
        qty: 2,
        cid: 'equipment',
        title: 'Return the archive',
        brief: 'Bring the recovered records back to Meridian Yards.',
      },
    ],
    end: 'Archivist Ravensworth handles the old records as if they might break. "Some of these are the only copies left of anything from before the Rift. You have saved history, Captain. The archive will remember your name."',
    reward: { credits: 95000, crate: ['crystal', 4], bp: 10 },
  },
  {
    id: 'farlight',
    name: 'Light Beyond the Gate',
    at: 'earth',
    giver: 'Dr. Mara Feld',
    intro:
      'An astronomer with ink-stained fingers spreads star charts across the bar. "Since the Gateway opened, something on the far side has been sending a signal back through it. Every eleven hours, like a heartbeat. I need someone to go through and listen."',
    steps: [
      {
        type: 'survey',
        sys: 'coldharbor',
        title: 'Listen at Coldharbor',
        brief: 'Pass through the Sol Gateway and survey Coldharbor, where the signal is loudest.',
        beat: 'The signal is coming from deeper in: an old relay buoy somewhere in Coldharbor.',
      },
      {
        type: 'salvage',
        sys: 'coldharbor',
        title: 'The heartbeat buoy',
        brief: 'Fly to the relay buoy in Coldharbor and recover its memory core.',
        beat: 'The buoy is older than anything in the Concord. Its core holds one repeating message, in no language anyone knows.',
      },
      {
        type: 'cargo',
        sys: 'sol',
        qty: 1,
        cid: 'crystal',
        title: 'Bring the core to Dr. Feld',
        brief: "Carry the buoy's memory core back to Terra.",
      },
    ],
    end: 'Dr. Feld plays the message for hours. "It\'s not a warning. I think it\'s a greeting." She looks up at you. "Whatever is out there, it has been waiting a long time for someone to answer."',
    reward: { credits: 85000, crate: ['isotope', 4], bp: 12 },
  },
  {
    id: 'sideways-apology',
    name: 'The Sideways Apology',
    at: 'ninefold-prime',
    giver: 'Professor Ivo Kett and his grandson Jem',
    intro:
      'A nervous young man waves you over to a ship with six kettles bolted to its hull and a cockpit pointing the wrong way. His grandfather, a scientist with a flask close at hand, is arguing with a hatch. "Granddad has been drinking again," Jem says quietly. "He needs help, and I cannot fix this thing alone." Professor Kett produces a short parts list: a phase coupler in Northmark and thermal filament in Quietude. "Bring those back here. I have something for your radio."',
    steps: [
      {
        type: 'salvage',
        sys: 'northmark',
        title: 'Recover a phase coupler',
        brief: 'Recover the marked parts cache in Northmark, then land to secure it.',
        beat: 'The coupler is intact. Jem sends a relieved message: "One down. The thermal filament is in Quietude. Please do not let him test the engine without it."',
      },
      {
        type: 'salvage',
        sys: 'quietude',
        title: 'Recover thermal filament',
        brief: 'Recover the marked parts cache in Quietude, then land to pack the repair kit.',
        beat: 'The filament is still sealed. Together with the coupler it makes a two-tonne repair kit. All that remains is to bring it to Ninefold Prime.',
      },
      {
        type: 'cargo',
        sys: 'ninefold',
        dest: 'ninefold-prime',
        qty: 2,
        cid: 'equipment',
        title: 'Repair the Sideways Apology',
        brief: 'Bring the repair kit to Professor Kett and Jem on Ninefold Prime.',
      },
    ],
    end: 'Jem fits the last connector while his grandfather puts the flask aside. The ship unfolds a wing in a direction you were not aware existed. "We can get home," Jem says, finally smiling. Professor Kett presses a small radio device into your hand. "Attach this to your radio console. It hears the stations between stations. Thank you, Captain." Your crew connects it for you. Interdimensional Radio is now available.',
    reward: { credits: 0, radio: 'interdimensional' },
  },
];
