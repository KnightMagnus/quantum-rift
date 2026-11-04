import catalog from './milky-way-catalog.json' with { type: 'json' };
import type { RawStellarBody, StarSystem } from './galaxy.ts';

/** The local sky chart is separate from the Rift; bearings and distances follow the supplied atlas. */
export const milkyWayId = (key: string): string =>
  key === 'vigils_rest' ? 'mw-sol' : `mw-${key.replaceAll('_', '-')}`;

function body(
  id: string,
  name: string,
  x: number,
  y: number,
  r: number,
  art?: string,
  kind = 'planet',
): RawStellarBody {
  return {
    id,
    name,
    x,
    y,
    r,
    art,
    kind,
    color: '#8da8bc',
    prices: { food: 0, equipment: 0, medicine: 0, metal: 0 },
    svc: kind === 'station' ? 'LTORBY' : 'L',
    tech: 3,
  };
}

/** Hand-authored heliocentric positions, not a procedural scattering of the supplied Sol art. */
export function solBodies(): RawStellarBody[] {
  const bodies: RawStellarBody[] = [];
  const planets: [string, string, number, number, number][] = [
    ['mercury', 'Mercury', 1000, -0.8, 75],
    ['venus', 'Venus', 1700, 2.6, 120],
    ['mars', 'Mars', 3600, -2.1, 105],
    ['ceres', 'Ceres', 5000, 1.2, 65],
    ['jupiter', 'Jupiter', 8000, 0.65, 330],
    ['saturn', 'Saturn', 11000, -1.05, 290],
    ['uranus', 'Uranus', 22000, 2.7, 220],
    ['neptune', 'Neptune', 34500, -0.4, 220],
    ['pluto', 'Pluto', 45300, 1.7, 70],
  ];
  for (const [id, name, distance, angle, radius] of planets)
    bodies.push(
      body(
        `mw-${id}`,
        name,
        Math.round(distance * Math.cos(angle)),
        Math.round(distance * Math.sin(angle)),
        radius,
        `sol_${id}`,
      ),
    );
  bodies.push({
    ...body('vigils-rest', "Vigil's Rest · Luna Prime", 2600, 0, 180, 'sol_luna_prime'),
    svc: 'LTORBY',
    desc: 'The original Moon circles the Sun where Earth once travelled. The Hall of the Absent faces the empty sky. Earth is not here.',
  });
  const moons: Record<string, string[]> = {
    mars: ['phobos', 'deimos'],
    jupiter: ['io', 'europa', 'ganymede', 'callisto'],
    saturn: ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus'],
    uranus: ['miranda', 'ariel', 'umbriel', 'titania', 'oberon'],
    neptune: ['triton'],
    pluto: ['charon'],
  };
  for (const [planet, names] of Object.entries(moons)) {
    const parent = bodies.find((entry) => entry.id === `mw-${planet}`)!;
    names.forEach((name, index) => {
      const angle = index * 2.4 + 0.4;
      const distance = 450 + index * 90;
      bodies.push(
        body(
          `mw-${name}`,
          name[0].toUpperCase() + name.slice(1),
          Math.round(parent.x + Math.cos(angle) * distance),
          Math.round(parent.y + Math.sin(angle) * distance),
          name === 'titan' ? 85 : 42,
          `sol_${name}`,
        ),
      );
    });
  }
  const stations: [string, string, string, string][] = [
    ['caloris-works', 'Caloris Works', 'mercury', 'caloris'],
    ['cytherea-spire', 'Cytherea Spire', 'venus', 'cytherea'],
    ['ares-bastion', 'Ares Bastion', 'mars', 'ares'],
    ['jove-refinery', 'Jove Refinery', 'jupiter', 'jove'],
    ['cassini-hold', 'Cassini Hold', 'saturn', 'cassini'],
    ['herschel-relay', 'Herschel Relay', 'uranus', 'herschel'],
    ['triton-watch', 'Triton Watch', 'neptune', 'triton'],
    ['last-light', 'Last Light', 'pluto', 'last_light'],
  ];
  for (const [id, name, planet] of stations) {
    const parent = bodies.find((entry) => entry.id === `mw-${planet}`)!;
    bodies.push(
      body(id, name, parent.x + 500, parent.y - 340, 95, id.replaceAll('-', '_'), 'station'),
    );
  }
  bodies.push(body('helios-array', 'Helios Array', 600, 0, 115, 'helios_array', 'station'));
  bodies.push({
    id: 'mw-sol-rift-mouth',
    name: 'The Quantum Rift · Return Passage',
    kind: 'wormhole',
    x: 49000,
    y: 0,
    r: 600,
    svc: '',
    tech: 0,
    wormhole: 'quantum-rift',
    exit: 'quantum-rift-mouth',
    desc: 'The passage home remains open.',
  });
  return bodies;
}

export function createMilkyWay(): StarSystem[] {
  const systems: StarSystem[] = Object.entries(catalog).map(([key, entry]) => {
    const id = milkyWayId(key);
    const angle = (entry.l * Math.PI) / 180;
    const indexSpace = ['ledger_nine', 'sirius_bastion', 'pale_meridian'].includes(key);
    const port = key.replaceAll('_', '-');
    return {
      id,
      gate: key === 'vigils_rest' ? 'quantum-rift' : undefined,
      region: 'milky-way',
      backdrop: `mw_${key}.jpg`,
      name:
        key === 'vigils_rest'
          ? 'Sol · Milky Way'
          : entry.place
            ? `${entry.place} · ${entry.star}`
            : entry.star,
      faction: indexSpace ? 'index' : 'confederation',
      danger: indexSpace ? 3 : 1,
      x: Math.round(Math.cos(angle) * entry.distance_ly * 36),
      y: Math.round(-Math.sin(angle) * entry.distance_ly * 36),
      links: [],
      desc: `${entry.star}, ${entry.distance_ly} light-years from Sol. The Milky Way's familiar band crosses the sky.`,
      stellars:
        key === 'vigils_rest'
          ? solBodies()
          : [
              body(`${id}-world`, entry.star, 0, 0, 160),
              {
                ...body(
                  port,
                  entry.place || `${entry.star} Anchorage`,
                  650,
                  -300,
                  95,
                  key === 'ledger_nine' || key === 'sirius_bastion' ? key : undefined,
                  'station',
                ),
                desc:
                  key === 'ledger_nine'
                    ? 'An Index archive whose outer halls are home to Freefolk archivists and dockworkers.'
                    : key === 'sirius_bastion'
                      ? 'An Index stronghold with Freefolk civilian docks outside its closed defensive shell.'
                      : key === 'hearthline'
                        ? 'A Confederation repair habitat built by migrant human crews, with a little Index help.'
                        : `${entry.place || entry.star}: a working port in the solar neighbourhood.`,
              },
            ],
    };
  });
  // Local lanes join nearby atlas bearings; the known survey road directly joins Sol and Cinder.
  const connect = (a: StarSystem, b: StarSystem) => {
    if (!a.links.includes(b.id)) a.links.push(b.id);
    if (!b.links.includes(a.id)) b.links.push(a.id);
  };
  for (const system of systems) {
    const nearest = systems
      .filter((other) => other !== system)
      .sort(
        (a, b) =>
          Math.hypot(a.x - system.x, a.y - system.y) - Math.hypot(b.x - system.x, b.y - system.y),
      );
    for (const neighbour of nearest.slice(0, 3)) connect(system, neighbour);
  }
  connect(
    systems[0],
    systems.find((system) => system.id === 'mw-cinder-anchorage')!,
  );
  // Keep every neighbourhood reachable even if a future atlas adds an isolated cluster.
  const reached = new Set([systems[0].id]);
  while (reached.size < systems.length) {
    for (const system of systems)
      if (reached.has(system.id)) for (const id of system.links) reached.add(id);
    if (reached.size === systems.length) break;
    const outside = systems.find((system) => !reached.has(system.id))!;
    const inside = systems
      .filter((system) => reached.has(system.id))
      .sort(
        (a, b) =>
          Math.hypot(a.x - outside.x, a.y - outside.y) -
          Math.hypot(b.x - outside.x, b.y - outside.y),
      )[0];
    connect(outside, inside);
  }
  return systems;
}
