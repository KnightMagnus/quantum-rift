import { STELLARS, SYS, FACTIONS } from './galaxy.ts';
import { STORY } from './story.ts';
import type { StoryStep } from './story.ts';
import type { SavedStory } from '../server/save-contracts.ts';

/** Combat reports without a pending choice can be filed at another public port of the same faction. */
export function storyReportPort(mission: StoryStep, portId: string): boolean {
  if (portId === mission.back) return true;
  if (mission.type !== 'kill' || mission.decision) return false;
  const destination = STELLARS[mission.back!];
  const port = STELLARS[portId];
  return !!(
    destination &&
    port &&
    !port.site &&
    port.svc.includes('L') &&
    SYS[port.system].faction === SYS[destination.system].faction
  );
}

/** Explain only an already-accepted combat report's alternate public completion points. */
export function storyReportGuidance(mission: StoryStep): string {
  if (mission.type !== 'kill' || mission.decision) return '';
  const destination = STELLARS[mission.back!];
  if (!destination) return '';
  const faction = SYS[destination.system].faction;
  return ` You can also file this completed combat report at any public ${FACTIONS[faction]?.name || faction} landing port.`;
}

/** Ordinary hauling on an accepted story's route earns a preparation premium, never a unique reward. */
export function storyPreparationPremium(
  story: SavedStory | undefined,
  portSystem: string,
): boolean {
  const active = story?.active;
  if (!active || active.ready) return false;
  const mission = STORY.find((entry) => entry.id === active.id);
  if (!mission) return false;
  return [mission.sys, STELLARS[mission.at]?.system, STELLARS[mission.dest!]?.system].includes(
    portSystem,
  );
}
