import type { PlayerData } from '../server/game.ts';
import type { GameAssets } from './rules.ts';

/** Career guide tutorial milestone definition. */
export type TutorialStep = {
  /** Event code triggering step completion (e.g. 'target', 'land2', 'sell', 'kill', 'site', 'job', 'chest'). */
  ev?: string;

  /** State condition evaluator receiving player data and asset registry. */
  check?: (arg0: PlayerData, arg1?: GameAssets) => boolean | undefined;

  /** Display title of the milestone. */
  title: string;

  /** Guidance instructions displayed to the player. */
  text: string;

  /** Credit reward awarded on completion. */
  reward: number;

  /** Optional material reward tuple [matName, gradeIndex, quantity]. */
  mat?: [string, number, number];
};

// The career guide (1.0): twenty goals from first flight to your first capital ship. The first five are the original
// first-flight tutorial (event goals); the rest are checked against your progress. The client shows the current one.

/**
 * Computes the total number of installed outfits on the player's active ship.
 * @param playerData - Player save data containing active ship state.
 * @returns Total count of equipped outfits.
 */
const outfits = (playerData: PlayerData) =>
  Object.values(playerData.ship.outfits || {}).reduce(
    (firstValue, secondValue) => firstValue + secondValue,
    0,
  );

/**
 * Ordered sequence of career guide tutorial steps.
 */
export const TUTORIAL: TutorialStep[] = [
  {
    ev: 'target',
    title: 'Pick a target',
    text: 'Undock (DEPART), then click any ship, or press Tab, to target it.',
    reward: 1500,
  },
  {
    ev: 'land2',
    title: 'Your first jump',
    text: 'Open the map (M), click a neighbouring system, fly clear of planets and press J. Land anywhere there (double-click or L).',
    reward: 4000,
  },
  {
    ev: 'sell',
    title: 'Make a trade',
    text: 'Buy cargo in a Trade tab and sell it at another market. Prices differ from world to world.',
    reward: 3000,
  },
  {
    ev: 'kill',
    title: 'Clear a raider',
    text: 'Destroy a pirate or bounty target. After your next jump a lone Hollow straggler comes for you; R targets the nearest hostile.',
    reward: 6000,
  },
  {
    ev: 'site',
    title: 'Find a station hull',
    text: 'Land on a derelict station hull (the purple diamonds on the map).',
    reward: 5000,
    mat: ['alloy', 0, 1],
  },
  {
    check: (playerData) => playerData.station!.claimed && !!playerData.station!.site,
    title: 'Claim it',
    text: 'In the STATION tab of a derelict hull, claim it. It becomes your Personal Station.',
    reward: 5000,
  },
  {
    check: (playerData) => outfits(playerData) >= 3,
    title: 'Kit out your ship',
    text: 'Buy two more outfits at an outfitter: weapons, shields, armor or cargo pods.',
    reward: 6000,
  },
  {
    check: (playerData) => playerData.station!.ops >= 1,
    title: 'Restore docking (Station Tier 1)',
    text: 'At your station, build Station Tier 1. It needs credits and an Alloy I crate.',
    reward: 10000,
  },
  {
    ev: 'job',
    title: 'Do a job',
    text: 'Take any job from a job board and finish it.',
    reward: 8000,
  },
  {
    check: (playerData) =>
      !!(
        playerData.quests &&
        (Object.keys(playerData.quests.active || {}).length ||
          (playerData.quests.done || []).length)
      ),
    title: 'Meet a contact',
    text: 'Every spaceport bar has a contact (see AT THE BAR on the landing overview). Take on their story from the JOBS tab.',
    reward: 8000,
  },
  {
    check: (playerData) => (playerData.stats!.stateHelp || 0) >= 1,
    title: 'Help a troubled system',
    text: 'The OPS tab lists famines, wars and other troubles near you. Sell what a troubled system needs there, take one of its jobs, or fight its raiders.',
    reward: 10000,
  },
  {
    check: (playerData) => (playerData.stats!.mined || 0) >= 10,
    title: 'Mine 10 tons',
    text: 'Buy a Mining Laser and break rocks in an asteroid field. Fly over the ore to scoop it into your hold (ships with no hold need a Cargo Compression outfit first).',
    reward: 8000,
  },
  {
    check: (playerData, assets) => (assets!.ships[playerData.ship.hull].strength || 0) >= 80,
    title: 'A real warship',
    text: 'Buy a fighting ship: a Cutlass Interceptor or better.',
    reward: 15000,
  },
  {
    check: (playerData) => (playerData.officers || []).length >= 1,
    title: 'Hire an officer',
    text: 'Visit the CREW tab on an inhabited world and hire an officer for your bridge.',
    reward: 10000,
  },
  {
    check: (playerData) => playerData.station!.ops >= 2,
    title: 'Market and Workshop (Station Tier 2)',
    text: 'Build Station Tier 2 at your station: it opens the research lab and the hangar.',
    reward: 20000,
  },
  {
    check: (playerData) =>
      (playerData.shuttles || []).some(
        (savedShuttle) => savedShuttle.runs > 0 || savedShuttle.state === 'out',
      ),
    title: 'Launch a shuttle',
    text: 'Build a shuttle in your station HANGAR and send it on a job from the hangar board.',
    reward: 15000,
  },
  {
    check: (playerData) => playerData.station!.done.length > 0 || !!playerData.station!.active,
    title: 'Start research',
    text: 'Open the RESEARCH LAB at your station and start a project.',
    reward: 15000,
  },
  {
    ev: 'chest',
    title: 'Open a loot chest',
    text: 'Hostiles sometimes drop glowing pink loot chests. Destroy pirates or the Swarm and fly over one.',
    reward: 15000,
  },
  {
    check: (playerData) => !!(playerData.quests && (playerData.quests.done || []).length),
    title: 'Finish a story',
    text: "See a contact's story through to its end. Your progress is on the CAREER page of the ship and captain panel (I).",
    reward: 20000,
  },
  {
    check: (playerData) =>
      !!(playerData.story && playerData.story.done && playerData.story.done.includes('qv1')),
    title: 'The Threshold Spire',
    text: 'Someone is waiting at the Threshold Spire in Far Mouth. Land there.',
    reward: 20000,
  },
  {
    check: (playerData) => playerData.station!.ops >= 3,
    title: 'Shipyard and lab (Station Tier 3)',
    text: 'Build Station Tier 3: the drydock, the station shipyard and specialist building.',
    reward: 40000,
    mat: ['crystal', 1, 1],
  },
  {
    check: (playerData) => playerData.holdout && playerData.holdout.best >= 3,
    title: 'Hold the line',
    text: 'Clear three waves of a Station Holdout (station DEFENSE). Your Armada can defend it with you.',
    reward: 50000,
  },
  {
    check: (playerData, assets) =>
      (assets!.ships[playerData.ship.hull].cost || 0) >= 1000000 ||
      assets!.ships[playerData.ship.hull].kind === 'specialist',
    title: 'Captain of a capital',
    text: 'Fly a ship worth a million credits or more, or build a specialist.',
    reward: 100000,
    mat: ['alloy', 3, 1],
  },
];
// three steps were added; saves from before move to the same goal in the longer list

/**
 * Current version number of the tutorial progression sequence.
 */
export const TUT_VERSION: number = 2;

/**
 * Migrates a player save file's tutorial index if saved under an older tutorial version.
 * @param playerData - Player save data object containing tutorial progress.
 */
export function tutMigrate(playerData: PlayerData): void {
  if ((playerData.tutV || 1) >= TUT_VERSION) return;
  if (playerData.tut != null)
    playerData.tut =
      playerData.tut <= 8
        ? playerData.tut
        : playerData.tut <= 15
          ? playerData.tut + 2
          : playerData.tut + 3;
  playerData.tutV = TUT_VERSION;
}
