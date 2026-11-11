// Unsworn passage: the hail-offered courier job that opens Unsworn hulls at Confederation shipyards.
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { SYS as systemsById, STELLARS, type StellarBody } from '../shared/galaxy.ts';
import { storySystemVisible } from '../shared/story-world.ts';
import { UNSWORN_SOLD_IDS } from '../shared/ships-unsworn.ts';
import type { Mission, PlayerData } from './game.ts';
import type { Entity } from './space.ts';

/** Mission id prefix that marks the Unsworn passage job in the captain's job list. */
export const UNSWORN_PASSAGE_PREFIX = 'unsworn-passage';

/** Credits paid on delivery. The shipyard access is the main reward. */
export const UNSWORN_PASSAGE_REWARD = 3000;

/** Hail option key sent by the client. */
export const UNSWORN_PASSAGE_OPTION = 'unsworn-passage';

/** Job-list limit shared with the job board. */
const JOB_LIMIT = 6;

const galaxyGraph = new GalaxyGraph(systemsById);

/** Saved fields this feature reads and writes. */
type PassagePlayer = Pick<PlayerData, 'missions' | 'unswornYard' | 'story'>;

/**
 * Whether the captain has finished the passage job and may buy Unsworn hulls.
 * @param playerData Captain save.
 * @returns True once the job has been delivered.
 */
export function unswornYardOpen(playerData: Pick<PlayerData, 'unswornYard'> | undefined): boolean {
  return playerData?.unswornYard === true;
}

/**
 * Whether a mission is the Unsworn passage job.
 * @param mission Saved or offered mission.
 * @returns True for the passage job.
 */
export function isUnswornPassage(mission: Pick<Mission, 'id'>): boolean {
  return mission.id.startsWith(UNSWORN_PASSAGE_PREFIX + '-');
}

/**
 * Whether a hailed ship can offer the passage job: ordinary Unsworn traffic or its escort.
 * Player-owned, named, rival, mission, story and boss groups cannot.
 * @param source Hailed ship.
 * @param root Group leader of the hailed ship.
 * @returns True for ordinary Unsworn traffic.
 */
export function unswornPassageSource(source: Entity, root: Entity): boolean {
  return (
    source.faction === 'unsworn' &&
    root.faction === 'unsworn' &&
    !source.player &&
    !source.dead &&
    !source.disabled &&
    !root.player &&
    !root.owner &&
    !root.name &&
    !root.rival &&
    !root.mission &&
    !root.story &&
    !root.boss
  );
}

/**
 * Nearest Confederation shipyard at least one jump away. Ties go to the lower port id.
 * @param originSystemId System the captain is flying in.
 * @param playerData Captain save, for story-hidden systems.
 * @returns Delivery port, or null when none is reachable.
 */
export function unswornPassageDestination(
  originSystemId: string,
  playerData: Pick<PlayerData, 'story'>,
): StellarBody | null {
  const flags = playerData.story?.flags;
  const distances = galaxyGraph.distances(originSystemId, {
    canEnter: (systemId) => storySystemVisible(flags, systemId),
  });
  let best: { port: StellarBody; jumps: number } | null = null;
  for (const [systemId, jumps] of Object.entries(distances)) {
    const system = systemsById[systemId];
    if (jumps < 1 || system?.faction !== 'confederation') continue;
    for (const { id } of system.stellars) {
      const port = STELLARS[id];
      if (!port || port.site || !port.svc?.includes('L') || !port.svc.includes('Y')) continue;
      if (!best || jumps < best.jumps || (jumps === best.jumps && port.id < best.port.id))
        best = { port, jumps };
    }
  }
  return best?.port ?? null;
}

/**
 * Why the captain cannot take the passage job now, or null when they can.
 * @param playerData Captain save.
 * @returns Player-facing reason, or null.
 */
export function unswornPassageRefusal(playerData: PassagePlayer): string | null {
  if (unswornYardOpen(playerData))
    return 'You are already on our list, Captain. Confederation yards will sell you our hulls.';
  if (playerData.missions.some((mission) => isUnswornPassage(mission) && !mission.paid))
    return 'You already carry our papers. Deliver them first.';
  if (playerData.missions.length >= JOB_LIMIT)
    return 'You already have six jobs. Come back with room for one more.';
  return null;
}

/**
 * Build the passage job for a captain hailing from a system.
 * @param originSystemId System the captain is flying in.
 * @param playerData Captain save.
 * @param now Current time in milliseconds.
 * @returns The job, or null when no shipyard is reachable.
 */
export function unswornPassageMission(
  originSystemId: string,
  playerData: Pick<PlayerData, 'story'>,
  now: number,
): Mission | null {
  const port = unswornPassageDestination(originSystemId, playerData);
  if (!port) return null;
  const system = systemsById[port.system];
  return {
    id: `${UNSWORN_PASSAGE_PREFIX}-${now}`,
    type: 'cargo',
    title: 'Unsworn papers',
    giver: 'The Unsworn',
    sys: port.system,
    dest: port.id,
    qty: 0,
    reward: UNSWORN_PASSAGE_REWARD,
    taken: now,
    text: `Carry a sealed packet of Unsworn papers to ${port.name} in the ${system.name} system. It takes no hold space. Once it is delivered, Confederation shipyards will sell you Unsworn hulls.`,
  };
}

/**
 * Add the Unsworn hulls to a Confederation shipyard list for a captain who finished the job.
 * @param hullIds Hulls the yard already sells.
 * @param port Shipyard port.
 * @param playerData Captain save.
 * @returns The list, with Unsworn hulls added when allowed.
 */
export function withUnswornHulls(
  hullIds: Set<number>,
  port: StellarBody,
  playerData: Pick<PlayerData, 'unswornYard'> | undefined,
): Set<number> {
  if (!unswornYardOpen(playerData) || systemsById[port.system]?.faction !== 'confederation')
    return hullIds;
  for (const hullId of UNSWORN_SOLD_IDS) hullIds.add(hullId);
  return hullIds;
}
