import allocation from './scenery-allocation.json' with { type: 'json' };

/** Authored artwork does not change a body's services, faction or landing permissions. */
export interface BodyArtwork {
  /** Planet manifest ID or irregular moon sprite ID. */
  art: string;
  /** Non-spherical bodies use a rotating transparent sprite. */
  shape?: string;
  /** Landing illustration, without file extension. */
  landing?: string;
}
const bodies = new Map<string, BodyArtwork>();
for (const system of Object.values(allocation))
  for (const [id, artwork] of Object.entries(system.bodies)) bodies.set(id, artwork);

/** Return the authored choice, leaving unknown and player-created bodies on their fallback. */
export function bodyArtwork(id: string): BodyArtwork | undefined {
  return bodies.get(id);
}
