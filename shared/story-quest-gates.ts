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
    sideStoryCompatible(story, player.story?.flags) &&
    (story.afterSides || []).every((id) => !!player.quests?.sides?.[id]) &&
    (story.afterStory || []).every((id) => player.story?.done?.includes(id)) &&
    (!story.flag || player.story?.flags?.[story.flag.key] === story.flag.value) &&
    (!story.fragments || (player.expd?.lore || []).includes(story.fragments - 1))
  );
}

/** Keeps offers and active optional work consistent with authored outcome exclusions. */
export function sideStoryCompatible(story: SideStory, flags?: StoryFlags): boolean {
  return !story.excludedEndings?.includes(flags?.main_ending || '');
}
