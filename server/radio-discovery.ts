import type { Game, PlayerData, Session, Mission } from './game.ts';
import type { StarSystem, StellarBody } from '../shared/galaxy.ts';
type RadioCapabilities = Pick<Game, 'toast' | 'log' | 'db'>;

import { fnv1a as hash } from '../shared/deterministic-random.ts';
import { GalaxyGraph } from '../shared/galaxy-graph.ts';
import { RADIO_STATIONS, STARTER_RADIO } from '../shared/radio-stations.ts';
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
const galaxyGraph = new GalaxyGraph(systemsById);
const tourSystemSafe = (system: StarSystem | undefined, playerData: PlayerData) =>
  !!system &&
  !system.farside &&
  !system.arena &&
  !['umbral', 'deep'].includes(system.faction) &&
  (playerData.rep?.[system.faction] || 0) > -20;
const known = new Set(RADIO_STATIONS.map((state) => state.id));
export function radioState(playerData: PlayerData) {
  playerData.radioStations = [
    ...new Set([
      STARTER_RADIO,
      ...(Array.isArray(playerData.radioStations)
        ? playerData.radioStations.filter((identifier) => known.has(identifier))
        : []),
    ]),
  ];
  return playerData.radioStations;
}
export function grantRadio(game: RadioCapabilities, session: Session, identifier: string) {
  const station = RADIO_STATIONS.find((state) => state.id === identifier);
  if (!station || radioState(session.data).includes(identifier)) return false;
  session.data.radioStations!.push(identifier);
  game.toast(
    session,
    `Discovered a new radio station: ${station.name}. Added to your radio console.`,
  );
  game.log(session.data, `Radio station discovered: ${station.name}.`);
  game.db.touch();
  return true;
}
export function discoverRadio(game: RadioCapabilities, session: Session) {
  const before = JSON.stringify(session.data.radioStations);
  radioState(session.data);
  if (systemsById[session.data.sys]?.faction === 'quevari') grantRadio(game, session, 'qvri');
  if (session.data.sys === 'lost-signal') grantRadio(game, session, 'signal-superposition');
  if (before !== JSON.stringify(session.data.radioStations)) game.db.touch();
  return [...session.data.radioStations!];
}
// Stable per captain/port/jump: reopening the board or reconnecting cannot reroll it.
export const TOUR_ODDS = 1000; // One in 1,000 eligible arrival boards.
export function tourRoute(origin: string, playerData: PlayerData) {
  if (!systemsById[origin]) return null;
  let current = origin;
  const seen = new Set([origin]),
    stops = [];
  for (let index = 0; index < 5; index++) {
    let port;
    for (const [identifier, distance] of galaxyGraph.walk(current, {
      maxDepth: 3,
      neighborOrder: 'sorted',
      canEnter: (next) => tourSystemSafe(systemsById[next], playerData),
    })) {
      const system = systemsById[identifier];
      if (!system) continue;
      if (distance > 0 && !seen.has(identifier) && tourSystemSafe(system, playerData))
        port = system.stellars.find(
          (stellarBody) =>
            !stellarBody.site &&
            !stellarBody.outlaw &&
            stellarBody.svc!.includes('L') &&
            stellarBody.svc!.includes('B'),
        );
      if (port) break;
    }
    if (!port) return null;
    stops.push(port.id);
    seen.add(STELLARS[port.id].system);
    current = STELLARS[port.id].system;
  }
  return stops;
}
export function radioTourOffer(stellarBody: StellarBody | null, playerData: PlayerData) {
  if (
    !stellarBody ||
    !stellarBody.svc.includes('B') ||
    stellarBody.site ||
    stellarBody.outlaw ||
    (Array.isArray(playerData.radioStations) && playerData.radioStations.includes('super-idol')) ||
    playerData.missions.some((mission) => mission.radioTour)
  )
    return null;
  const seed = `${playerData.name}:${stellarBody.id}:${playerData.stats.jumps || 0}:spacepop`;
  if (hash(seed) % TOUR_ODDS !== 0) return null;
  const stops = tourRoute(stellarBody.system, playerData);
  if (!stops) return null;
  return {
    id: `spacepop:${stellarBody.id}:${playerData.stats.jumps || 0}`,
    type: 'passenger',
    title: 'Spacepop: the five-stop tour',
    pax: 3,
    dest: stops[0],
    sys: STELLARS[stops[0]].system,
    reward: 60000,
    radioTour: { stops, stop: 0 },
    text:
      'Super-idols Lyra, Miri and Solenne need three passenger seats for five shows. Keep them aboard between stops. You receive 60,000 credits and their album for your radio after the final show. Stops: ' +
      stops
        .map(
          (identifier) =>
            `${STELLARS[identifier].name} (${systemsById[STELLARS[identifier].system].name})`,
        )
        .join(' → ') +
      '.',
  };
}
export function advanceRadioTour(
  game: RadioCapabilities,
  session: Session,
  mission: Mission,
  stellarBody: StellarBody,
) {
  const tour = mission.radioTour;
  if (!tour) return false;
  if (
    !Array.isArray(tour.stops) ||
    tour.stops.length !== 5 ||
    new Set(tour.stops.map((identifier) => STELLARS[identifier]?.system)).size !== 5 ||
    !Number.isInteger(tour.stop) ||
    tour.stop < 0 ||
    tour.stop > 4 ||
    tour.stops.some((identifier) => !STELLARS[identifier]) ||
    mission.dest !== tour.stops[tour.stop]
  ) {
    game.toast(session, 'This tour itinerary could not be verified. No reward was paid.');
    return true;
  }
  if (stellarBody.id !== mission.dest) return true;
  if (tour.stop === 4) return false; // The ordinary passenger completion pays once.
  tour.stop++;
  mission.dest = tour.stops[tour.stop];
  mission.sys = STELLARS[mission.dest].system;
  mission.title = `Spacepop tour: show ${tour.stop + 1} of 5`;
  mission.text = `The three super-idols are still aboard. Next show: ${STELLARS[mission.dest].name} in ${systemsById[mission.sys].name}. Credits and the album are awarded after show 5.`;
  game.toast(
    session,
    `Spacepop show ${tour.stop} of 5 complete. The idols stay aboard. Next: ${STELLARS[mission.dest].name} (${systemsById[mission.sys].name}).`,
  );
  game.db.touch();
  return true;
}
