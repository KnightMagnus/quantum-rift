import { RADIO_STATIONS, STARTER_RADIO } from '../shared/radio-stations.js';
import { SYS, STELLARS } from '../shared/galaxy.js';
const tourSystemSafe = (system, d) =>
  system &&
  !system.farside &&
  !system.arena &&
  !['umbral', 'deep'].includes(system.faction) &&
  (d.rep?.[system.faction] || 0) > -20;
const known = new Set(RADIO_STATIONS.map((s) => s.id));
export function radioState(d) {
  d.radioStations = [
    ...new Set([
      STARTER_RADIO,
      ...(Array.isArray(d.radioStations) ? d.radioStations.filter((id) => known.has(id)) : []),
    ]),
  ];
  return d.radioStations;
}
export function grantRadio(game, session, id) {
  const station = RADIO_STATIONS.find((s) => s.id === id);
  if (!station || radioState(session.data).includes(id)) return false;
  session.data.radioStations.push(id);
  game.toast(
    session,
    `Discovered a new radio station: ${station.name}. Added to your radio console.`,
  );
  game.log(session.data, `Radio station discovered: ${station.name}.`);
  game.db.touch();
  return true;
}
export function discoverRadio(game, session) {
  const before = JSON.stringify(session.data.radioStations);
  radioState(session.data);
  if (SYS[session.data.sys]?.faction === 'quevari') grantRadio(game, session, 'qvri');
  if (session.data.sys === 'lost-signal') grantRadio(game, session, 'signal-superposition');
  if (before !== JSON.stringify(session.data.radioStations)) game.db.touch();
  return [...session.data.radioStations];
}
// Stable per captain/port/jump: reopening the board or reconnecting cannot reroll it.
const hash = (text) => {
  let n = 2166136261;
  for (const c of text) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
};
export const TOUR_ODDS = 1000; // One in 1,000 eligible arrival boards.
export function tourRoute(origin, d) {
  let current = origin;
  const seen = new Set([origin]),
    stops = [];
  for (let i = 0; i < 5; i++) {
    const pending = [[current, 0]],
      visited = new Set([current]);
    let port;
    while (pending.length && !port) {
      const [id, distance] = pending.shift(),
        system = SYS[id];
      if (!system) continue;
      if (distance > 0 && !seen.has(id) && tourSystemSafe(system, d))
        port = system.stellars.find(
          (stellarBody) =>
            !stellarBody.site &&
            !stellarBody.outlaw &&
            stellarBody.svc.includes('L') &&
            stellarBody.svc.includes('B'),
        );
      if (distance < 3)
        for (const next of [...system.links].sort())
          if (!visited.has(next) && tourSystemSafe(SYS[next], d)) {
            visited.add(next);
            pending.push([next, distance + 1]);
          }
    }
    if (!port) return null;
    stops.push(port.id);
    seen.add(STELLARS[port.id].system);
    current = STELLARS[port.id].system;
  }
  return stops;
}
export function radioTourOffer(p, d) {
  if (
    !p ||
    !p.svc.includes('B') ||
    p.site ||
    p.outlaw ||
    (Array.isArray(d.radioStations) && d.radioStations.includes('super-idol')) ||
    d.missions.some((m) => m.radioTour)
  )
    return null;
  const seed = `${d.name}:${p.id}:${d.stats.jumps || 0}:spacepop`;
  if (hash(seed) % TOUR_ODDS !== 0) return null;
  const stops = tourRoute(p.system, d);
  if (!stops) return null;
  return {
    id: `spacepop:${p.id}:${d.stats.jumps || 0}`,
    type: 'passenger',
    title: 'Spacepop: the five-stop tour',
    pax: 3,
    dest: stops[0],
    sys: STELLARS[stops[0]].system,
    reward: 60000,
    radioTour: { stops, stop: 0 },
    text:
      'Super-idols Lyra, Miri and Solenne need three passenger seats for five shows. Keep them aboard between stops. You receive 60,000 credits and their album for your radio after the final show. Stops: ' +
      stops.map((id) => `${STELLARS[id].name} (${SYS[STELLARS[id].system].name})`).join(' → ') +
      '.',
  };
}
export function advanceRadioTour(game, s, m, p) {
  const tour = m.radioTour;
  if (!tour) return false;
  if (
    !Array.isArray(tour.stops) ||
    tour.stops.length !== 5 ||
    new Set(tour.stops.map((id) => STELLARS[id]?.system)).size !== 5 ||
    !Number.isInteger(tour.stop) ||
    tour.stop < 0 ||
    tour.stop > 4 ||
    tour.stops.some((id) => !STELLARS[id]) ||
    m.dest !== tour.stops[tour.stop]
  ) {
    game.toast(s, 'This tour itinerary could not be verified. No reward was paid.');
    return true;
  }
  if (p.id !== m.dest) return true;
  if (tour.stop === 4) return false; // The ordinary passenger completion pays once.
  tour.stop++;
  m.dest = tour.stops[tour.stop];
  m.sys = STELLARS[m.dest].system;
  m.title = `Spacepop tour: show ${tour.stop + 1} of 5`;
  m.text = `The three super-idols are still aboard. Next show: ${STELLARS[m.dest].name} in ${SYS[m.sys].name}. Credits and the album are awarded after show 5.`;
  game.toast(
    s,
    `Spacepop show ${tour.stop} of 5 complete. The idols stay aboard. Next: ${STELLARS[m.dest].name} (${SYS[m.sys].name}).`,
  );
  game.db.touch();
  return true;
}
