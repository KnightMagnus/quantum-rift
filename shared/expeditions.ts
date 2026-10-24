/** Fixed location of the silent Farside hulk; no landable or combat entity is created. */
export const EXPEDITION_HULK = { system: 'aureole', x: -540, y: -3600, size: 1800 } as const;

export type ExpeditionLoreFragment = {
  /** Title or header of the data core fragment. */
  title: string;
  /** Narrative text contents recovered from the data core. */
  text: string;
};
// what the Farside data cores say. Fragments only: they hint at the region's purpose without spending it.

/**
 * Lore fragments unlocked from recovered Farside data cores.
 */
export const EXPEDITION_LORE: ExpeditionLoreFragment[] = [
  {
    title: 'Fragment I: Not a Wormhole',
    text: 'The survey office reads the core twice to be sure. Its builders did not call the Gateway a wormhole. Their word for it translates, as near as anyone can tell, as "door we left open".',
  },
  {
    title: 'Fragment II: Kept Below',
    text: 'Most of the core is a ledger of things that never happened: ships that never launched, battles that went the other way, names of people who were never born. Every entry ends with the same mark. The settlers translate it as "kept below". They argue for a week about where below is. Nobody wins the argument.',
  },
  {
    title: 'Fragment III: Ten Lights',
    text: 'A star chart, older than any human map. The ten Farside systems are marked as lamps in a ring. A label sits in the empty middle of the ring, where there is no star at all. The survey office translates it, uncertainly, as "Uncharted".',
  },
  {
    title: "Fragment IV: The Builders' Hands",
    text: "Tool marks on the derelict match no known species. The office's xenologist says the hands that made them had too many joints, and were very, very patient.",
  },
  {
    title: 'Fragment V: Guests',
    text: 'A log, in a language the core helpfully translates: "The guests from the bright side have found the door. Let them settle. Watch what they build." The log is not old. It is dated last spring.',
  },
  {
    title: 'Fragment VI: The Second Door',
    text: "Coordinates, repeated in every format the core knows. They point past the edge of the Farside, into empty space that the settlers' scopes see as perfectly dark.",
  },
  {
    title: 'Fragment VII: Sleepers',
    text: 'A manifest. Most of the entries are crew. One is not crew, or cargo, or anything with a word. Its berth is marked "do not wake until the guests can see each other".',
  },
  {
    title: 'Fragment VIII: An Invitation',
    text: 'The last core is short. It is addressed to whoever reads it, by name. Your name. The survey office decides, very quickly, that this one is above their clearance.',
  },
];
