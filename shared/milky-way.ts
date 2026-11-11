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
    prices: { food: 0, equipment: 0, medical: 0, metal: 0 },
    svc: kind === 'station' ? 'LTORBY' : 'L',
    tech: 3,
  };
}

/** Distance of the Rift's Sol mouth from the Sun: just beyond Uranus (22,000). */
const SOL_RIFT_MOUTH_ORBIT = 24400;
/** Bearing of the Rift's Sol mouth, alongside Uranus. */
const SOL_RIFT_MOUTH_ANGLE = 2.7;
/**
 * Sol moons by parent planet: [name, radius]. Radii follow real relative sizes on a compressed scale,
 * so Titan and the large Uranian moons read bigger than Mimas or Miranda.
 */
const SOL_MOONS: Record<string, [string, number][]> = {
  mars: [
    ['phobos', 40],
    ['deimos', 32],
  ],
  jupiter: [
    ['io', 42],
    ['europa', 42],
    ['ganymede', 42],
    ['callisto', 42],
  ],
  saturn: [
    ['mimas', 40],
    ['enceladus', 44],
    ['tethys', 54],
    ['dione', 55],
    ['rhea', 62],
    ['titan', 85],
    ['iapetus', 60],
    ['prometheus', 30],
    ['hyperion', 40],
    ['phoebe', 34],
  ],
  uranus: [
    ['miranda', 42],
    ['ariel', 56],
    ['umbriel', 56],
    ['titania', 63],
    ['oberon', 61],
    ['puck', 32],
  ],
  neptune: [['triton', 42]],
  pluto: [['charon', 42]],
};
/** Ring outer edge in planet radii, measured from the supplied Saturn and Uranus artwork. */
const SOL_RING_EXTENT: Record<string, number> = { saturn: 2.22, uranus: 1.8 };
/** Non-spherical Sol moons drawn with the shared irregular moon sprites. */
export const SOL_IRREGULAR_MOONS: Record<string, string> = {
  'mw-phobos': 'irr_0',
  'mw-deimos': 'irr_7',
  'mw-prometheus': 'irr_2',
  'mw-hyperion': 'irr_3',
  'mw-phoebe': 'irr_4',
  'mw-puck': 'irr_5',
};
/** Irregular moons that were already landable keep their port and authored art ID. */
const SOL_LANDABLE_IRREGULAR = new Set(['phobos', 'deimos']);

/** Hand-authored heliocentric positions, not a procedural scattering of the supplied Sol art. */
export function solBodies(): RawStellarBody[] {
  const bodies: RawStellarBody[] = [];
  const planets: [string, string, number, number, number][] = [
    // Compressed sizes keep the real order: Luna Prime (180) < Mercury < Mars < Venus < ice giants.
    ['mercury', 'Mercury', 1000, -0.8, 205],
    ['venus', 'Venus', 1700, 2.6, 260],
    ['mars', 'Mars', 3600, -2.1, 235],
    ['ceres', 'Ceres', 5000, 1.2, 65],
    ['jupiter', 'Jupiter', 8000, 0.65, 330],
    ['saturn', 'Saturn', 11000, -1.05, 290],
    ['uranus', 'Uranus', 22000, 2.7, 270],
    ['neptune', 'Neptune', 34500, -0.4, 270],
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
  for (const [planet, moons] of Object.entries(SOL_MOONS)) {
    const parent = bodies.find((entry) => entry.id === `mw-${planet}`)!;
    // Orbits start outside the drawn rings of Saturn and Uranus.
    const firstOrbit = Math.max(450, Math.round(parent.r * (SOL_RING_EXTENT[planet] || 0)) + 160);
    moons.forEach(([name, radius], index) => {
      const angle = index * 2.4 + 0.4;
      const distance = firstOrbit + index * 90;
      const irregular = SOL_IRREGULAR_MOONS[`mw-${name}`];
      bodies.push({
        ...body(
          `mw-${name}`,
          name[0].toUpperCase() + name.slice(1),
          Math.round(parent.x + Math.cos(angle) * distance),
          Math.round(parent.y + Math.sin(angle) * distance),
          radius,
          irregular && !SOL_LANDABLE_IRREGULAR.has(name) ? undefined : `sol_${name}`,
        ),
        // Small shepherd and captured moons are scenery, not ports.
        ...(irregular && !SOL_LANDABLE_IRREGULAR.has(name) ? { svc: '' } : {}),
      });
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
  // The passage opens just outside Uranus's orbit, so arrivals start near a landmark.
  bodies.push({
    id: 'mw-sol-rift-mouth',
    name: 'The Quantum Rift · Return Passage',
    kind: 'wormhole',
    x: Math.round(SOL_RIFT_MOUTH_ORBIT * Math.cos(SOL_RIFT_MOUTH_ANGLE)),
    y: Math.round(SOL_RIFT_MOUTH_ORBIT * Math.sin(SOL_RIFT_MOUTH_ANGLE)),
    r: 600,
    svc: '',
    tech: 0,
    wormhole: 'quantum-rift',
    exit: 'quantum-rift-mouth',
    desc: 'The passage home remains open.',
  });
  return bodies;
}

/** The port the arrival indicator leads to after crossing the Rift. */
export const SOL_ARRIVAL_PORT = 'vigils-rest';

/** Where a ship crossing from the Rift comes to rest in Sol, and the heading that faces Luna Prime. */
export interface SolRiftArrival {
  /** World X, beside the mouth on the Uranus side. */
  x: number;
  /** World Y, beside the mouth on the Uranus side. */
  y: number;
  /** Ship heading (0 points up the screen, clockwise) toward Vigil's Rest. */
  heading: number;
}

/**
 * Rest point for a Rift crossing into Sol: outside the mouth's aperture, between it and Uranus,
 * facing Vigil's Rest so the indicator and the ship agree.
 * @param stellars Sol's bodies.
 * @returns Arrival point and heading.
 */
export function solRiftArrival(stellars: RawStellarBody[]): SolRiftArrival {
  const mouth = stellars.find((stellar) => stellar.id === 'mw-sol-rift-mouth')!;
  const uranus = stellars.find((stellar) => stellar.id === 'mw-uranus')!;
  const port = stellars.find((stellar) => stellar.id === SOL_ARRIVAL_PORT)!;
  const towardUranus = Math.atan2(uranus.y - mouth.y, uranus.x - mouth.x);
  const clearance = mouth.r + 260;
  const x = Math.round(mouth.x + Math.cos(towardUranus) * clearance);
  const y = Math.round(mouth.y + Math.sin(towardUranus) * clearance);
  return { x, y, heading: Math.atan2(port.x - x, -(port.y - y)) };
}

/**
 * Body selected as the nav point on entering a system: Vigil's Rest in Sol, otherwise the first port.
 * @param system The system being entered.
 * @returns Stellar ID, or null where nothing can be landed on.
 */
export function defaultNavStellar(system: StarSystem): string | null {
  if (system.id === 'mw-sol') return SOL_ARRIVAL_PORT;
  return system.stellars.find((stellar) => stellar.svc?.includes('L'))?.id ?? null;
}

/** Local supplies reflect port work, not a captain’s private campaign outcome. */
const PORT_PROFILES: Record<string, { description: string; prices: Record<string, number> }> = {
  ferrum: {
    description:
      'Holt’s foundries stamp replacement hull plates beside the conscript transport berths. Metal and equipment leave on outgoing freighters; grain and medicine arrive under escort.',
    prices: { metal: -1, equipment: -1, food: 1, medical: 1 },
  },
  'saint-orra': {
    description:
      'Grain elevators share the quay with field hospitals and the civilian memorial. The port exports food but needs medical supplies and replacement machinery.',
    prices: { food: -1, medical: 1, equipment: 1 },
  },
  hearthline: {
    description:
      'Migrant human crews weld replacement habitats here. The docks sell repaired equipment and buy metal, food and medical supplies for the people waiting for berths.',
    prices: { equipment: -1, metal: 1, food: 1, medical: 1 },
  },
  'ledger-nine': {
    description:
      'Freefolk archivists and dockworkers live in the Index archive’s outer halls. Repair tenders trade recovered machinery for food and medicine; independent witnesses keep their records here.',
    prices: { equipment: -1, food: 1, medical: 1 },
  },
  'pale-meridian': {
    description:
      'Human recorder capsules and Index telemetry are recovered from the same debris field. The small dock buys medical supplies and equipment for salvage crews.',
    prices: { metal: -1, medical: 1, equipment: 1 },
  },
  'sirius-bastion': {
    description:
      'Freefolk casualty boats use the civilian docks outside the Index defensive shell. Life-support equipment and medicine pass through inspection before entering the refuge.',
    prices: { metal: -1, equipment: 1, medical: 1, food: 1 },
  },
};

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
      desc: `${entry.distance_ly ? `${entry.star}, ${entry.distance_ly} light-years from Sol` : entry.star}. The Milky Way's familiar band crosses the sky.`,
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
                prices: PORT_PROFILES[port]?.prices || {
                  food: 0,
                  equipment: 0,
                  medical: 0,
                  metal: 0,
                },
                desc:
                  PORT_PROFILES[port]?.description ||
                  (key === 'ledger_nine'
                    ? 'An Index archive whose outer halls are home to Freefolk archivists and dockworkers.'
                    : key === 'sirius_bastion'
                      ? 'An Index stronghold with Freefolk civilian docks outside its closed defensive shell.'
                      : key === 'hearthline'
                        ? 'A Confederation repair habitat built by migrant human crews, with a little Index help.'
                        : `${entry.place || entry.star}: a working port in the solar neighbourhood.`),
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
