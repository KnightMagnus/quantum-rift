import { portraitAsset } from '../shared/portraits.ts';
import { artworkUrl } from './artwork.ts';
import type { StoryMessage } from './protocol.ts';

/** A recurring story character, not an attribution of every line of narration. */
interface StoryCharacter {
  /** Dedicated non-selectable portrait identity. */
  portrait: string;
  /** Character and role shown beside the encounter text. */
  label: string;
}

const selani: StoryCharacter = { portrait: 'story-selani', label: 'Sel’ani · Que’vari watcher' };
const elders: StoryCharacter = { portrait: 'story-elders', label: 'The elders · Ina Lumen' };
const sailwright: StoryCharacter = {
  portrait: 'story-sailwright',
  label: 'The rescued sailwright · Que’vari',
};
const clerk: StoryCharacter = { portrait: 'story-clerk', label: 'The survey clerk · Northmark' };
const prisoner: StoryCharacter = { portrait: 'story-prisoner', label: 'The prisoner · Umbral' };

/** Only authored encounters choose portraits; unknown and unrelated stories remain text-only. */
export function storyCharacter(
  message: Pick<StoryMessage, 'id' | 'done' | 'arc'>,
): StoryCharacter | null {
  if (message.arc) return null;
  switch (message.id) {
    case 'qv1':
    case 'qv5':
      return selani;
    case 'qv2':
      return message.done ? sailwright : selani;
    case 'qv3':
      return elders;
    case 'qv4':
      return message.done ? elders : selani;
    case 'guests':
      return message.done ? null : clerk;
    case 'shades-below':
      return prisoner;
    default:
      return null;
  }
}

/** Clear the previous encounter before loading a new face, including on image failure. */
export function renderStoryPortrait(message: Pick<StoryMessage, 'id' | 'done' | 'arc'>): void {
  const panel = document.getElementById('storycharacter')!;
  const image = document.getElementById('storyportrait') as HTMLImageElement;
  const caption = document.getElementById('storycharactername')!;
  panel.classList.add('hidden');
  image.onerror = null;
  image.removeAttribute('src');
  image.alt = '';
  caption.textContent = '';
  const character = storyCharacter(message);
  if (!character) return;
  image.alt = character.label;
  caption.textContent = character.label;
  image.onerror = () => panel.classList.add('hidden');
  image.src = artworkUrl(portraitAsset(character.portrait));
  panel.classList.remove('hidden');
}
