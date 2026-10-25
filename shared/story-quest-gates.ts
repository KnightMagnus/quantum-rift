import type { SideStory } from './quests.ts';
import type { StoryFlags } from '../server/save-contracts.ts';
/** Only saved captain progress can unlock narrative jobs. */
export function sideStoryAvailable(
  story: SideStory,
  player: {
    story?: { done?: string[]; flags?: StoryFlags };
    quests?: { sides?: Record<string, number> };
    expd?: { n: number; lore?: number[] };
  },
): boolean {
  return (
    (story.afterSides || []).every((id) => !!player.quests?.sides?.[id]) &&
    (story.afterStory || []).every((id) => player.story?.done?.includes(id)) &&
    (!story.flag || player.story?.flags?.[story.flag.key] === story.flag.value) &&
    (!story.fragments || (player.expd?.lore || []).includes(story.fragments - 1))
  );
}
