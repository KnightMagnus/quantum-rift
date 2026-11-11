import type { StoryMission } from './story.ts';
import type { StoryFlags } from '../server/save-contracts.ts';

export type PartTwoObjective = {
  type: 'carry' | 'board' | 'kill';
  sys?: string;
  dest?: string;
  back?: string;
  count?: number;
  hull?: number;
  faction?: string;
  brief: string;
  capture?: boolean;
  mark?: string;
  /** Named lead target; additional ships remain escorts. */
  targetName?: string;
};
const port = (id: string) => `mw-${id}`;
const haul = (dest: string, brief: string, mark?: string): PartTwoObjective => ({
  type: 'carry',
  dest,
  brief,
  mark,
});
const rescue = (
  sys: string,
  back: string,
  count: number,
  brief: string,
  mark?: string,
): PartTwoObjective => ({
  type: 'board',
  sys: port(sys),
  back,
  count,
  hull: 956,
  faction: 'confederation',
  brief,
  mark,
});
const fight = (
  sys: string,
  back: string,
  count: number,
  brief: string,
  mark?: string,
): PartTwoObjective => ({
  type: 'kill',
  sys: port(sys),
  back,
  count,
  hull: 955,
  faction: 'confederation',
  brief,
  mark,
});

const indexFight = (...args: Parameters<typeof fight>): PartTwoObjective => ({
  ...fight(...args),
  hull: 970,
  faction: 'index',
});
export const PART_TWO_OBJECTIVES: Record<string, PartTwoObjective[]> = {
  'p2-voice': [
    rescue(
      'sol',
      'cinder-anchorage',
      2,
      'Rescue the disabled evacuation tug crews beyond Neptune; report at Cinder Anchorage.',
      'evacuations',
    ),
  ],
  'p2-papers': [haul('vigils-rest', 'Carry Terran records to the hearing at Vigil’s Rest.')],
  'p2-seat': [
    haul('ferrum', 'Have Saye authenticate the records; carry Vey’s requisition to Ferrum.'),
  ],
  'p2-flag': [
    rescue(
      'saint-orra',
      'saint-orra',
      2,
      'Recover aid crews at the contested relay and report at Saint Orra.',
      'corridor',
    ),
  ],
  'p2-bread': [
    haul('ferrum', 'Collect machinery and the hospital manifests at Ferrum.'),
    haul('saint-orra', 'Deliver the allocated machinery and return the casualty manifests.'),
  ],
  'p2-ashes': [
    rescue(
      'pale-meridian',
      'pale-meridian',
      2,
      'Recover both record capsules at Pale Meridian: human testimony and Index telemetry.',
      'records',
    ),
  ],
  'p2-regiment': [
    rescue(
      'ferrum',
      'hearthline',
      3,
      'Recover the missing conscripts’ prison transports and take their crews to Hearthline.',
      'signatory',
    ),
  ],
  'p2-broadcast': [
    haul(
      'vigils-rest',
      'Bring both Pale Meridian records to the broadcast office at Vigil’s Rest.',
    ),
  ],
  'p2-observation': [
    rescue(
      'ledger-nine',
      'ledger-nine',
      2,
      'Under the local ceasefire rescue the human and Freefolk civilian crews. Report to Greta Tell.',
      'independent_backup',
    ),
  ],
  'p2-mind': [
    rescue(
      'sirius-bastion',
      'ledger-nine',
      1,
      'Recover the disabled relay’s archive crew before deciding the relay’s fate.',
    ),
  ],
  'p2-moon': [
    haul('vigils-rest', 'Compare the lunar observatory logs with Earthlight measurements.'),
    haul(
      'threshold',
      'At Threshold in the Rift, ask Terra to appoint a human delegation carrying recorded testimony from its Rift neighbours.',
    ),
    haul(
      'ledger-nine',
      'Carry Terra’s independently accredited delegates to Ledger Nine. No mandate transfers its sovereignty.',
      'terra_delegation',
    ),
  ],
  'p2-report': [
    haul('ledger-nine', 'Compare the original disappearance report with both casualty records.'),
  ],
  'p2-road': [
    rescue(
      'sirius-bastion',
      'ledger-nine',
      1,
      'Rescue the courier carrying one part of the deep-survey route.',
    ),
    haul('hearthline', 'Collect the human deep-survey bearing.'),
    haul(
      'black-anchorage',
      'Retune the Harness and take the narrow passage into the makers’ refuge.',
    ),
  ],
  'p2-makers': [
    haul(
      'black-anchorage',
      'Hear the Keeper of Departures and the Measure aboard Gargantua Prime.',
    ),
  ],
  'p2-freefolk': [
    {
      ...rescue(
        'ledger-nine',
        'ledger-nine',
        2,
        'Rescue Captain Lia Moss’s two stranded repair tenders, then meet her at Ledger Nine.',
        'freefolk_crews',
      ),
      hull: 1043,
      faction: 'freefolk',
    },
    haul(
      'ferrum',
      'Ask Holt for the replacement life-support pumps promised to the rescued crews.',
    ),
    haul(
      'ledger-nine',
      'Bring the pumps to Lia Moss; choose whether her crew repairs the shelter or the mobile clinic.',
      'freefolk_pumps',
    ),
  ],
  'p2-unsworn': [
    {
      ...rescue(
        'ferrum',
        'hearthline',
        2,
        'Recover Amara Dene’s two disabled Unsworn transports outside Ferrum, then bring the testimony to Hearthline.',
        'unsworn_survivors',
      ),
      hull: 1051,
      faction: 'unsworn',
    },
    haul(
      'vigils-rest',
      'Present Dene’s testimony to Saye. Choose a public hearing or protected private evidence.',
      'unsworn_testimony',
    ),
  ],
  'p2-aftercare': [
    haul(
      'saint-orra',
      'Deliver the reconstruction manifest to Saint Orra and meet Rooke at the memorial.',
      'aftercare',
    ),
  ],
  'p2-names': [haul('saint-orra', 'Visit Saint Orra’s memorial and the people who survived.')],
};

export function partTwoBattle(flags: StoryFlags): PartTwoObjective[] {
  const ending = flags.p2_campaign;
  const evacuation = rescue(
    'saint-orra',
    'saint-orra',
    3,
    'Recover replacement civilian transports and reopen the protected evacuation corridor.',
    'corridor',
  );
  if (ending === 'ascendant')
    return [
      evacuation,
      {
        ...rescue(
          'sirius-bastion',
          'sirius-bastion',
          2,
          'Board the disabled relay control platforms (Capture) and place them in human custody.',
          'captured_relay',
        ),
        capture: true,
      },
      {
        ...rescue(
          'ferrum',
          'ferrum',
          2,
          'Board the contested repair-yard control tenders (Capture); secure the yard physically.',
          'captured_yard',
        ),
        capture: true,
      },
      fight(
        'sol',
        'vigils-rest',
        3,
        'Defeat the remaining armed command escorts. You can abandon the offensive for the civilian border plan before reporting.',
        'final_strike',
      ),
    ];
  if (ending === 'ashfall')
    return [
      evacuation,
      indexFight(
        'sirius-bastion',
        'sirius-bastion',
        3,
        'Strike the archive-refuge defence line. Freefolk civilians live behind it. The losses cannot be undone.',
        'archive_strikes',
      ),
      indexFight(
        'ledger-nine',
        'ledger-nine',
        3,
        'Complete the final archive strikes, or abandon the extermination campaign before reporting.',
        'final_strike',
      ),
    ];
  if (ending === 'armistice' || ending === 'dormancy')
    return [
      evacuation,
      rescue(
        'ledger-nine',
        'ledger-nine',
        2,
        'Recover the inspection teams and deliver independent copies of both records.',
        'independent_records',
      ),
      fight(
        'sol',
        'vigils-rest',
        3,
        'Stop the hardliner command escorts before the last strike can launch.',
        'final_strike',
      ),
      haul(
        'ledger-nine',
        ending === 'dormancy'
          ? 'Deliver signed withdrawal terms, staged protected handovers and agreed reactivation conditions. The Index choose whether to sleep.'
          : 'Deliver the signed withdrawal orders to the independent relay.',
        'negotiated',
      ),
    ];
  return [
    evacuation,
    fight(
      'sol',
      'vigils-rest',
      3,
      'Break the armed pursuers and hold the civilian corridor while the fleets separate.',
      'final_strike',
    ),
  ];
}
export function partTwoEndings(flags: StoryFlags): string[] {
  const result = ['border'];
  if (
    ['publish', 'delegates'].includes(flags.p2_records || '') &&
    flags.p2_relay === 'independent' &&
    ['talks', 'stand_down'].includes(flags.p2_makers || '') &&
    flags.p2_objectives?.signatory &&
    flags.p2_objectives?.records
  )
    result.push(flags.p2_makers === 'stand_down' ? 'dormancy' : 'armistice');
  if (
    flags.p2_makers === 'maps' &&
    flags.p2_relay === 'custody' &&
    (flags.p2_route === 'command' || flags.p2_expedition === 'military')
  )
    result.push('ascendant');
  if (flags.p2_makers === 'maps' && flags.p2_relay === 'destroy') result.push('ashfall');
  return result;
}
/** Explain unavailable campaigns from the captain's recorded decisions. */
export function partTwoCampaignGuidance(flags: StoryFlags): string {
  const missingPeace: string[] = [];
  if (!['publish', 'delegates'].includes(flags.p2_records || ''))
    missingPeace.push('independent copies of both records');
  if (flags.p2_relay !== 'independent') missingPeace.push('an independent relay');
  if (!flags.p2_objectives?.signatory) missingPeace.push('a surviving conscript signatory');
  if (!flags.p2_objectives?.records) missingPeace.push('both Pale Meridian records');
  if (!['talks', 'stand_down'].includes(flags.p2_makers || ''))
    missingPeace.push('the makers’ agreement to talks or voluntary dormancy');
  const unavailable: string[] = [];
  if (missingPeace.length)
    unavailable.push(`Negotiated peace is unavailable: missing ${missingPeace.join(', ')}.`);
  if (!partTwoEndings(flags).includes('ascendant'))
    unavailable.push(
      'Conquest requires the makers’ maps, human custody of the relay, and fleet-command access or a military expedition.',
    );
  if (!partTwoEndings(flags).includes('ashfall'))
    unavailable.push(
      'The archive campaign requires the makers’ maps and destruction of the relay.',
    );
  return (
    '\n\n' +
    unavailable.join(' ') +
    '\n\nYou may withdraw from conquest or the archive campaign, but deaths and destroyed archives cannot be undone.'
  );
}

/** The memorial recalls local consequences without repeating the campaign ending. */
export function partTwoMemorialText(flags: StoryFlags): string {
  const supplies =
    flags.p2_supply === 'grain'
      ? 'Saint Orra’s grain line was restored; the frontier battery went short.'
      : 'The frontier battery received machinery; Saint Orra endured delayed grain deliveries.';
  return `At Saint Orra, the memorial lists those who died beside the names of the people you brought home. ${supplies}`;
}

export function partTwoEndingText(flags: StoryFlags): string {
  switch (flags.p2_ending) {
    case 'armistice':
      return 'The Armistice of Two Skies: the final strike was stopped. Human borders and independent Index survey corridors are recognised. Freefolk join the inspections; the Unsworn can return without the oath. Holdouts remain. The makers answer as witnesses, not rulers.';
    case 'dormancy':
      return 'Voluntary dormancy: the Index accepted sleep after staged protected handovers. The treaty records when they may wake. No control key changed hands. Rauth’s holdouts can still break the peace.';
    case 'ascendant':
      return 'Sol Ascendant: human fleets hold the relay and repair yards. Independent Index cells survive elsewhere. Captured Freefolk are pressed into service and the Unsworn are hunted. The emergency government keeps its powers. Forced service is not equality.';
    case 'ashfall':
      return 'Ashfall: the archive refuges have been destroyed. Freefolk civilians died with them; unique minds and records are lost. Distant Index copies survive. Rauth claims victory while civilian infrastructure fails and military rule continues.';
    default:
      return 'The Border That Holds: the evacuation corridor stayed open long enough for civilians to leave. The fleets are separated across a watched ceasefire line, and the Rift crossing remains protected. Families can meet through controlled crossings. The war continues elsewhere.';
  }
}
/**
 * Credits paid when each Part II chapter completes. Pay starts at the top Act I
 * reward and climbs toward the final battle, so the whole part is worth about
 * the freight income a captain gives up while playing it. The memorial visit
 * pays only a token amount.
 */
export const PART_TWO_PAY: Record<string, number> = {
  'p2-voice': 150000,
  'p2-papers': 150000,
  'p2-seat': 200000,
  'p2-flag': 250000,
  'p2-bread': 250000,
  'p2-ashes': 300000,
  'p2-regiment': 350000,
  'p2-broadcast': 300000,
  'p2-observation': 350000,
  'p2-mind': 400000,
  'p2-moon': 400000,
  'p2-report': 400000,
  'p2-road': 500000,
  'p2-makers': 500000,
  'p2-fleet': 1000000,
  'p2-names': 50000,
  'p2-freefolk': 400000,
  'p2-unsworn': 400000,
  'p2-aftercare': 300000,
};
const choices = (entries: string[][]) => entries.map(([value, label]) => ({ value, label }));
function mission(
  id: string,
  title: string,
  at: string,
  text: string,
  done: string,
  decision?: StoryMission['decision'],
  options?: string[][],
): StoryMission {
  const first = PART_TWO_OBJECTIVES[id]?.[0] || partTwoBattle({})[0];
  return {
    id,
    title,
    at,
    ...first,
    pay: PART_TWO_PAY[id] ?? 0,
    rep: 0,
    text,
    done,
    acc: 'Accept the assignment',
    ref: 'Not yet',
    decision,
    choices: options && choices(options),
  };
}
export const PART_TWO: StoryMission[] = [
  mission(
    'p2-voice',
    'A Human Voice',
    'cinder-anchorage',
    'A human tug calls from the outskirts of Sol. Index and human salvos cross its escape lane. Captain Tomas Rooke asks you to recover its disabled evacuation crews.',
    'Rooke logs the rescued crews by name. Cinder Anchorage grants them berths.',
  ),
  mission(
    'p2-papers',
    'Papers from Earth',
    'cinder-anchorage',
    'The patrol finds Terran records beside your Index survey core. Choose how to reach Saye’s hearing; this is a first reputation, not an oath.',
    'Your records reach the hearing intact.',
    'p2_entry',
    [
      ['hearing', 'Submit to the hearing'],
      ['salvage', 'Use the salvage lanes'],
      ['refugees', 'Travel under refugee protection'],
    ],
  ),
  mission(
    'p2-seat',
    'The Empty Seat',
    'vigils-rest',
    'Dr. Elian Saye matches your records to Earth three hundred years ago. The government announces a homecoming before you can explain. Vey offers protection; Rauth offers a place in his fleet. Neither has your consent to enter the Rift.',
    'Vey’s requisition reaches Quartermaster Nera Holt. The empty seat at Vigil’s Rest remains Terra’s to fill.',
  ),
  mission(
    'p2-flag',
    'No Safe Flag',
    'ferrum',
    'An aid convoy needs a route past the relay. Decide who may use the Harness calibration and authenticated transit procedure. Coordinates alone cannot make the crossing safe.',
    'The convoy crews reach Saint Orra. Choose access to the crossing.',
    'p2_route',
    [
      ['private', 'Keep the safe transit procedure private'],
      ['vey', 'Give Vey escorted, restricted access'],
      ['command', 'Give fleet command the complete procedure; invasion becomes possible'],
    ],
  ),
  mission(
    'p2-bread',
    'Bread Before Shells',
    'saint-orra',
    'Holt has machinery for one spare berth. Saint Orra’s grain line and a frontier battery both need it.',
    'Holt records where the machinery went. The other request remains unmet.',
    'p2_supply',
    [
      ['grain', 'Restore the grain line; the battery goes short'],
      ['battery', 'Supply the battery; grain deliveries stay delayed'],
    ],
  ),
  mission(
    'p2-ashes',
    'Ashes in the Ledger',
    'saint-orra',
    'Pale Meridian holds two records: a human recorder and Index telemetry. Recover both, including evidence neither side wants read.',
    'Both copies are secured. Index attacks killed civilians here. Earlier human attacks on survey ships are on the same record. Neither cancels the other.',
  ),
  mission(
    'p2-regiment',
    'The Empty Regiment',
    'pale-meridian',
    'The missing Ferrum conscripts refused a reprisal against civilians. Their prison transports are disabled. The Unsworn offer passage through a Freefolk lane.',
    'Rooke and Amara Dene record your decision about the prisoners.',
    'p2_prisoners',
    [
      ['free', 'Free the conscripts'],
      ['transfer', 'Arrange lawful transfer with Vey'],
      ['sentence', 'Let the sentence stand'],
      ['unsworn', 'Take the Freefolk escape lane'],
    ],
  ),
  mission(
    'p2-broadcast',
    'A Victory Broadcast',
    'hearthline',
    'Rauth meets you in the broadcast booth. “You saw what they did at Pale Meridian. Tell the fleet.” Saye sets the second recorder beside the first. “Then tell them what we did before that.” Rauth keeps his hand on the microphone. “There will be another attack while you argue.” Both records are in your custody. You must choose who receives copies.',
    'The broadcast office records your instructions.',
    'p2_records',
    [
      ['publish', 'Publish both records independently'],
      ['delegates', 'Give both records to independent civilian delegates'],
      ['official', 'Endorse the official account'],
    ],
  ),
  mission(
    'p2-observation',
    'Terms of Observation',
    'vigils-rest',
    'Greta Tell arranges a local ceasefire for a joint rescue. Human and Freefolk crews are stranded at Ledger Nine. War Ledger supplies telemetry identifying earlier Index civilian casualties. The rescue is evidence of cooperation, not absolution.',
    'War Ledger recognises your Harness core. It admits knowing about the war throughout your journey. An independent navigation backup is recorded before you answer.',
    'p2_witness',
    [
      ['reject', 'Reject its companionship; keep the independent navigation backup'],
      ['disclose', 'Demand full disclosure before further cooperation'],
      ['rebuild', 'Try rebuilding trust without granting forgiveness'],
    ],
  ),
  mission(
    'p2-mind',
    'A Mind in Pieces',
    'ledger-nine',
    'A relay archive is caught between the fleets. Recover its crew, then decide what happens to this relay. It cannot switch off the Index across the galaxy.',
    'The rescued crew witnesses your decision about the relay.',
    'p2_relay',
    [
      ['independent', 'Preserve its independent channel'],
      ['custody', 'Put the relay in human custody'],
      ['destroy', 'Destroy the relay permanently; negotiated peace becomes unavailable'],
    ],
  ),
  mission(
    'p2-moon',
    'What the Moon Saw',
    'ledger-nine',
    'The lunar instruments still catch Earthlight: the discarded outcome where Earth stayed, showing through the Deep. The living Earth is in the Rift. Terra must choose its own delegation and the terms of contact.',
    'Terra’s human delegates carry recorded testimony from their Rift neighbours. They authorise contact themselves; no one has ceded their sovereignty.',
    'p2_contact',
    [
      ['family', 'Protect family contact'],
      ['scholarly', 'Protect scholarly exchange'],
      ['disclosure', 'Support the delegates’ wider disclosure'],
    ],
  ),
  mission(
    'p2-report',
    'A Report Never Answered',
    'ledger-nine',
    'The original Index report shows surveyors watched Earth leave, then reported to makers who never answered. It does not excuse later atrocities. A trace points toward the galactic centre.',
    'The trace is authenticated. Decide who travels with you.',
    'p2_expedition',
    [
      ['joint', 'A small joint delegation'],
      ['military', 'A human military expedition'],
      ['private', 'Private contact'],
    ],
  ),
  mission(
    'p2-road',
    'The Black Road',
    'ledger-nine',
    'Three bearings are needed: an archive record, a courier’s log and a human deep-survey fix. Retune the Harness for the narrow passage. No fleet can safely follow it.',
    'Gargantua Prime lies whole inside the refuge. Its crystals are lit. The makers have chosen silence until now.',
  ),
  mission(
    'p2-makers',
    'The People Who Left',
    'black-anchorage',
    'The Keeper admits taking Earth and abandoning the surveyors. The Measure admits hiding after the war fleets refused recall. Moving Earth back risks both populations. Their old maps and translations are neither omniscience nor control keys. Projecting a fleet through this throat could destroy the refuge.',
    'The makers record the help you requested. They cannot enforce any agreement.',
    'p2_makers',
    [
      ['talks', 'Bring the makers as accountable witnesses to talks'],
      ['stand_down', 'Negotiate voluntary dormancy with staged handovers and reactivation terms'],
      ['maps', 'Give the Confederation the makers’ old maps'],
      ['border', 'Refuse the all-out campaigns; hold a civilian line'],
    ],
  ),
  mission(
    'p2-fleet',
    'The Homeward Fleet',
    'black-anchorage',
    'Rauth launches his offensive. Choose a campaign from the options your decisions permit. Every plan requires real civilian recovery and battle objectives. Conquest and extermination can still be abandoned for the border plan.',
    'The battle is over.',
  ),
  mission(
    'p2-names',
    'Names for the Living',
    'vigils-rest',
    'Go to Saint Orra. Read the memorial and meet the survivors before returning to flight.',
    'The memorial records the saved outcome, not the outcome anyone promised.',
  ),
  mission(
    'p2-freefolk',
    'People Between Ports',
    'saint-orra',
    'Lia Moss calls from a Freefolk repair tender. “Our ship has a human captain, a human crew and an Index engine. Everyone sees the engine first.” Two tenders have lost power near Ledger Nine. Recover their crews, then help Moss find replacement life-support pumps. She has promised the same pumps to a shelter and a mobile clinic.',
    'Moss signs the receipt herself. “Put our names on it. Not dependent assets. People.” The rescued crews can work again.',
    'p2_freefolk',
    [
      ['shelter', 'Repair the family shelter; the mobile clinic must wait'],
      ['clinic', 'Repair the mobile clinic; the shelter stays crowded'],
    ],
  ),
  mission(
    'p2-unsworn',
    'An Oath Not Taken',
    'ledger-nine',
    'Amara Dene waits beside the dock registry. “Refusing an oath did not make us stop being human. It made our names disappear from the passenger lists.” Two Unsworn transports are disabled near Ferrum. Rescue them and carry their testimony to Saye. Dene will not surrender their names without deciding how the evidence will be used.',
    'Saye accepts the testimony without demanding an oath. Dene checks that the witnesses, not command, hold the original.',
    'p2_unsworn',
    [
      ['public', 'Let the consenting witnesses speak at an open hearing'],
      ['protected', 'Keep the testimony sealed to protect their families'],
    ],
  ),
  mission(
    'p2-aftercare',
    'The Work That Remains',
    'vigils-rest',
    'Rooke brings a reconstruction manifest instead of a battle order. “The crews you saved still need somewhere to live. The crews we lost still have families.” Complete the recovery work your campaign left behind, then meet him at Saint Orra.',
    'At Saint Orra, Rooke reads the returned crews into the harbour register. Moss and Dene stand with their own people. The memorial keeps the names of those who did not return.',
  ),
];

/** Personal recovery work follows the saved campaign; shared ports and hostility stay unchanged. */
export function partTwoAftercare(flags: StoryFlags): PartTwoObjective[] {
  const harsh = ['ashfall', 'ascendant'].includes(flags.p2_ending || '');
  return [
    {
      ...rescue(
        harsh ? 'pale-meridian' : 'sirius-bastion',
        'ledger-nine',
        harsh ? 3 : 2,
        harsh
          ? 'Recover the surviving archive crews displaced by your offensive; report at Ledger Nine.'
          : 'Recover the stranded ceasefire inspectors and report at Ledger Nine.',
        'aftercare_crews',
      ),
      hull: 1045,
      faction: 'freefolk',
    },
    haul(
      flags.p2_supply === 'battery' ? 'ferrum' : 'hearthline',
      flags.p2_supply === 'battery'
        ? 'Collect overdue grain-line machinery from Holt at Ferrum.'
        : 'Collect the frontier repair parts held at Hearthline.',
      'aftercare_supplies',
    ),
    ...PART_TWO_OBJECTIVES['p2-aftercare'],
  ];
}

/** Objective stages of a Part II chapter under the saved story choices. */
export function partTwoStages(flags: StoryFlags, chapterId: string): PartTwoObjective[] {
  if (chapterId === 'p2-aftercare') return partTwoAftercare(flags);
  if (chapterId === 'p2-fleet') return partTwoBattle(flags);
  return PART_TWO_OBJECTIVES[chapterId] || [];
}

/** Every recorded choice is acknowledged by the people affected, not by changing the shared world. */
export function partTwoMemorial(flags: StoryFlags): string {
  const lines: string[] = [
    'At Saint Orra, Rooke keeps two lists: crews returned and people still missing.',
  ];
  const responses: Array<[keyof StoryFlags, Record<string, string>]> = [
    [
      'p2_entry',
      {
        hearing:
          'Saye preserved the hearing transcript as the first public record of your arrival.',
        salvage:
          'The dockworkers who hid your arrival sign their real names below the salvage clearance.',
        refugees: 'The families who vouched for your arrival have a berth beside the memorial.',
      },
    ],
    [
      'p2_route',
      {
        private:
          'Vey’s visitors still request passage from you; command never received the calibration.',
        vey: 'Vey files each escorted crossing under the limits you gave her.',
        command:
          'Rauth’s transit authorisation is displayed beside the casualty report; you gave command the complete procedure.',
      },
    ],
    [
      'p2_supply',
      {
        grain:
          'The grain-line workers bring bread. Holt still has a queue for the frontier battery.',
        battery:
          'The battery crews send a repaired shield plate. The grain-line families still wait for machinery.',
      },
    ],
    [
      'p2_prisoners',
      {
        free: 'The freed conscripts attend in civilian clothes.',
        transfer: 'Vey returns the transferred prisoners’ signed custody receipts.',
        sentence:
          'Dene leaves empty places for the conscripts whose sentence you allowed to stand.',
        unsworn: 'The escaped conscripts arrive with Dene, without uniforms or an oath.',
      },
    ],
    [
      'p2_records',
      {
        publish: 'Both Pale Meridian records play in the public reading room.',
        delegates: 'Civilian delegates hold both original records; neither fleet can recall them.',
        official: 'Saye keeps the unbroadcast recorder beside the official account you endorsed.',
      },
    ],
    [
      'p2_witness',
      {
        reject:
          'Greta Tell brings the independent navigation backup; War Ledger does not speak for you.',
        disclose: 'War Ledger’s full disclosure is filed with the civilian witnesses.',
        rebuild:
          'War Ledger submits corrections to its account. Trust is still work, not a verdict.',
      },
    ],
    [
      'p2_relay',
      {
        independent:
          'The independent relay carries family messages between the inspection reports.',
        custody: 'The relay’s human custodians send their inspection log under your name.',
        destroy:
          'Moss brings a casing from the relay you destroyed; its local archive is not recoverable.',
      },
    ],
    [
      'p2_contact',
      {
        family: 'Terra’s first messages are read privately by the families who asked for them.',
        scholarly: 'Saye gives Terra’s researchers copies of the observatory logs.',
        disclosure:
          'The delegates publish their account in their own names, not as annexed citizens.',
      },
    ],
    [
      'p2_expedition',
      {
        joint: 'Human and Index witnesses sign the expedition log separately.',
        military: 'Vey returns the military expedition’s sealed orders to the public archive.',
        private: 'Your private expedition log is deposited with Saye, beyond fleet command.',
      },
    ],
    [
      'p2_makers',
      {
        talks:
          'The makers’ admissions remain on the hearing record; their testimony grants them no authority.',
        stand_down: 'The agreed waking conditions are copied beside the handover records.',
        maps: 'The old maps bear your release authorisation and the campaign casualty count.',
        border:
          'The border crews send the civilian line’s watch register, not a victory proclamation.',
      },
    ],
  ];
  for (const [field, options] of responses) {
    const value = flags[field];
    if (typeof value === 'string' && options[value]) lines.push(options[value]);
  }
  return lines.join('\n\n');
}
