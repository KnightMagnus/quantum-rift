import { COMMODITIES, FACTIONS, GRADES, MATERIALS, STELLARS, SYS } from '../shared/galaxy.ts';
import { OFFICER_NAMES } from '../shared/hangar.ts';
import { CHAINS, CONTACT_TITLES, SIDE_STORIES } from '../shared/quests.ts';
import type { QuestChain, QuestStep, SideStory } from '../shared/quests.ts';
import { RADIO_STATIONS, SCIENTIST_STORY } from '../shared/radio-stations.ts';
import type { GameAssets } from '../shared/rules.ts';
import { STORY } from '../shared/story.ts';
import type { StoryMission } from '../shared/story.ts';
import { CONTINUATION } from '../shared/story-continuation.ts';
import { STORY_QUESTS } from '../shared/story-quests.ts';
import type { ContentDiagnostic } from './content-validation.ts';

/** Composed narrative catalogs, injectable for offline malformed-content fixtures. */
export interface NarrativeContent {
  /** Ordered main-story steps; progression follows array order, not dialogue edges. */
  story: StoryMission[];
  /** Side stories, including their explicit completion prerequisites. */
  sides: SideStory[];
  /** Generated contact-chain templates with relative destinations. */
  chains: QuestChain[];
}

/** Use the same composed catalogs as the authoritative quest and story services. */
export function authoredNarrativeContent(): NarrativeContent {
  return { story: STORY, sides: SIDE_STORIES, chains: CHAINS };
}

/** Check authored references and dialogue fields without starting gameplay or reading saves. */
export function validateNarrativeContent(
  assets: GameAssets,
  content: NarrativeContent = authoredNarrativeContent(),
): ContentDiagnostic[] {
  const diagnostics: ContentDiagnostic[] = [];
  const continuationIds = new Set(CONTINUATION.map((entry) => entry.id));
  const authoredSideIds = new Set(STORY_QUESTS.map((entry) => entry.id));
  let source = '';
  const report = (path: string, message: string) => diagnostics.push({ source, path, message });
  const text = (value: string, path: string) => {
    if (!value?.trim()) report(path, 'expected nonempty text');
  };
  const number = (value: number | undefined, path: string, positive = false) => {
    if (value !== undefined && (!Number.isFinite(value) || (positive ? value <= 0 : value < 0)))
      report(path, `expected a finite ${positive ? 'positive' : 'nonnegative'} number`);
  };
  const reference = (
    value: string | number | undefined,
    path: string,
    known: object,
    kind: string,
  ) => {
    if (value !== undefined && !Object.hasOwn(known, value))
      report(path, `unknown ${kind} reference ${value}`);
  };
  const commodities = Object.fromEntries(COMMODITIES.map((entry) => [entry.id, true]));
  const radios = Object.fromEntries(RADIO_STATIONS.map((entry) => [entry.id, true]));
  const crate = (value: [string, number] | undefined, path: string) => {
    if (!value) return;
    if (!MATERIALS.includes(value[0])) report(`${path}[0]`, 'unknown material reference');
    if (!Number.isInteger(value[1]) || value[1] < 0 || value[1] >= GRADES.length)
      report(`${path}[1]`, `expected a material grade index from 0 to ${GRADES.length - 1}`);
  };
  const uniqueIds = (entries: { id: string }[], path: string) => {
    const known = new Set<string>();
    entries.forEach((entry, index) => {
      text(entry.id, `${path}[${index}].id`);
      if (known.has(entry.id)) report(`${path}[${index}].id`, `duplicate id ${entry.id}`);
      known.add(entry.id);
    });
    return Object.fromEntries([...known].map((id) => [id, true]));
  };
  source = 'shared/story.ts (composed with shared/story-continuation.ts)';
  const mainIds = uniqueIds(content.story, 'story');
  source = 'shared/quests.ts (composed with shared/story-quests.ts)';
  const sideIds = uniqueIds(content.sides, 'sides');
  source = 'shared/quests.ts';
  uniqueIds(content.chains, 'chains');

  const decisions = new Map<string, Set<string>>();
  content.story.forEach((entry, index) => {
    source = continuationIds.has(entry.id) ? 'shared/story-continuation.ts' : 'shared/story.ts';
    const path = `story[${index}]`;
    for (const field of ['title', 'text', 'brief', 'acc', 'ref'] as const)
      text(entry[field], `${path}.${field}`);
    // Decisions may supply their completion text through the authoritative choice handler.
    if (entry.type !== 'decision') text(entry.done, `${path}.done`);
    reference(entry.at, `${path}.at`, STELLARS, 'stellar');
    for (const field of ['dest', 'back'] as const)
      reference(entry[field], `${path}.${field}`, STELLARS, 'stellar');
    reference(entry.sys, `${path}.sys`, SYS, 'system');
    reference(entry.hull, `${path}.hull`, assets.ships, 'hull');
    reference(entry.faction, `${path}.faction`, FACTIONS, 'faction');
    entry.allies?.forEach((hull, ally) =>
      reference(hull, `${path}.allies[${ally}]`, assets.ships, 'hull'),
    );
    for (const field of ['pay', 'rep', 'minRep', 'count'] as const)
      number(entry[field], `${path}.${field}`, field === 'count');
    crate(entry.crate, `${path}.crate`);
    if (!['carry', 'board', 'kill', 'boss', 'gift', 'decision'].includes(entry.type))
      report(`${path}.type`, 'unsupported main-story mission type');
    if (entry.type === 'carry' && !entry.dest)
      report(`${path}.dest`, 'carry requires a destination');
    if (
      (entry.type === 'decision' || entry.decision || entry.choices) &&
      (!entry.decision || !entry.choices?.length)
    )
      report(`${path}.choices`, 'decision requires a flag and at least one choice');
    if (entry.decision) {
      if (decisions.has(entry.decision)) report(`${path}.decision`, 'duplicate decision flag');
      const choices = new Set<string>();
      entry.choices?.forEach((choice, choiceIndex) => {
        text(choice.value, `${path}.choices[${choiceIndex}].value`);
        text(choice.label, `${path}.choices[${choiceIndex}].label`);
        if (choices.has(choice.value))
          report(`${path}.choices[${choiceIndex}].value`, 'duplicate decision choice');
        choices.add(choice.value);
      });
      decisions.set(entry.decision, choices);
    }
  });

  const step = (entry: QuestStep, path: string, relative: boolean) => {
    if (
      ![
        'cargo',
        'smuggle',
        'passenger',
        'supply',
        'survey',
        'salvage',
        'rescue',
        'bounty',
        'assassinate',
        'convoy',
        'patrol',
      ].includes(entry.type)
    )
      report(`${path}.type`, 'unsupported quest step type');
    text(entry.title, `${path}.title`);
    text(entry.brief, `${path}.brief`);
    if (relative && !['W', 'A', 'B'].includes(entry.where || ''))
      report(`${path}.where`, 'expected relative locator W, A or B');
    if (!relative && !entry.sys) report(`${path}.sys`, 'authored step requires a system');
    reference(entry.sys, `${path}.sys`, SYS, 'system');
    reference(entry.dest, `${path}.dest`, STELLARS, 'stellar');
    if (
      entry.sys &&
      entry.dest &&
      STELLARS[entry.dest] &&
      STELLARS[entry.dest].system !== entry.sys
    )
      report(`${path}.dest`, 'destination does not belong to the step system');
    reference(entry.hull, `${path}.hull`, assets.ships, 'hull');
    reference(entry.faction, `${path}.faction`, FACTIONS, 'faction');
    reference(entry.cid, `${path}.cid`, commodities, 'commodity');
    reference(entry.hostile, `${path}.hostile`, FACTIONS, 'faction');
    for (const field of ['qty', 'pax', 'need', 'rush'] as const)
      number(entry[field], `${path}.${field}`, true);
    const points = entry.points || (entry.point ? [entry.point] : []);
    points.forEach((point, pointIndex) => {
      if (point.length !== 2 || point.some((coordinate) => !Number.isFinite(coordinate)))
        report(
          `${path}.${entry.points ? `points[${pointIndex}]` : 'point'}`,
          'expected two finite coordinates',
        );
    });
  };
  content.chains.forEach((entry, index) => {
    source = 'shared/quests.ts';
    const path = `chains[${index}]`;
    if (entry.kind !== 'any') reference(entry.kind, `${path}.kind`, CONTACT_TITLES, 'contact kind');
    for (const field of ['name', 'intro', 'end'] as const) text(entry[field], `${path}.${field}`);
    if (!entry.steps.length) report(`${path}.steps`, 'expected at least one quest step');
    entry.steps.forEach((entry, index) => step(entry, `${path}.steps[${index}]`, true));
  });
  content.sides.forEach((entry, index) => {
    source = authoredSideIds.has(entry.id) ? 'shared/story-quests.ts' : 'shared/quests.ts';
    const path = `sides[${index}]`;
    for (const field of ['name', 'giver', 'intro', 'end'] as const)
      text(entry[field], `${path}.${field}`);
    reference(entry.at, `${path}.at`, STELLARS, 'stellar');
    for (const field of ['afterSides', 'afterStory'] as const)
      entry[field]?.forEach((id, prerequisite) =>
        reference(
          id,
          `${path}.${field}[${prerequisite}]`,
          field === 'afterSides' ? sideIds : mainIds,
          'prerequisite',
        ),
      );
    if (entry.flag && !decisions.get(entry.flag.key)?.has(entry.flag.value))
      report(`${path}.flag`, 'flag must name an authored decision and legal choice');
    number(entry.fragments, `${path}.fragments`, true);
    if (!entry.steps.length) report(`${path}.steps`, 'expected at least one quest step');
    entry.steps.forEach((entry, index) => step(entry, `${path}.steps[${index}]`, false));
    number(entry.reward.credits, `${path}.reward.credits`);
    number(entry.reward.bp, `${path}.reward.bp`);
    crate(entry.reward.crate, `${path}.reward.crate`);
    reference(entry.reward.radio, `${path}.reward.radio`, radios, 'radio');
    if (entry.reward.officer !== 'any')
      reference(entry.reward.officer, `${path}.reward.officer`, OFFICER_NAMES, 'officer race');
  });

  // Main progression follows array order. Only side prerequisites create graph edges.
  const sides = new Map(content.sides.map((entry) => [entry.id, entry]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visiting.add(id);
    const entry = sides.get(id)!;
    entry.afterSides?.forEach((prerequisite, index) => {
      if (visiting.has(prerequisite)) {
        source = authoredSideIds.has(id) ? 'shared/story-quests.ts' : 'shared/quests.ts';
        report(
          `sides[${content.sides.indexOf(entry)}].afterSides[${index}]`,
          'cyclic side-story prerequisite',
        );
      } else if (sides.has(prerequisite)) visit(prerequisite);
    });
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of sides.keys()) visit(id);
  source = 'shared/radio-stations.ts';
  reference(SCIENTIST_STORY, 'SCIENTIST_STORY', sideIds, 'side story');
  return diagnostics;
}
