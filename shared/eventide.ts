import type { StarSystem, RawStellarBody as StellarBody, HazardDefinition } from './galaxy.ts';

// v2.9: authored destinations appended AFTER all legacy seeded generation.
// Stable docking positions: these scenes imply orbits, never move ports or apply gravity.
export type EventideDefinition = {
  id: string;
  name: string;
  dx: number;
  dy: number;
  danger: number;
  scene: import('./galaxy.ts').SceneDefinition;
  port: StellarBody;
  world: StellarBody;
};
export const EVENTIDE: EventideDefinition[] = [
  {
    id: 'lantern-twins',
    name: 'Lantern Twins',
    dx: -95,
    dy: -55,
    danger: 2,
    scene: { kind: 'binary' },
    port: {
      id: 'twins-exchange',
      name: 'Twins Exchange',
      kind: 'station',
      x: -480,
      y: 350,
      r: 76,
      color: '#b5b6c9',
      tech: 5,
      svc: 'LTOYB',
      prices: { food: 1, equipment: 1, medical: 1, crystal: -1 },
      desc: 'The expedition supply exchange hangs beneath two adjacent suns: an ember-red primary and a blue companion. Crews provision here before following the Eventide Chain.',
    },
    world: {
      id: 'twins-cinder',
      name: 'Cinder',
      kind: 'planet',
      x: 920,
      y: -760,
      r: 130,
      color: '#b47b64',
      svc: '',
      tech: 0,
      desc: 'A baked, uninhabited world beneath the twin stars. Instruments distinguish two overlapping days.',
    },
  },
  {
    id: 'aureole',
    name: 'Aureole',
    dx: -195,
    dy: -125,
    danger: 3,
    scene: { kind: 'blackhole' },
    port: {
      id: 'aureole-ring',
      name: 'Aureole Research Ring',
      kind: 'station',
      x: -540,
      y: 410,
      r: 86,
      color: '#d4c4ad',
      tech: 6,
      svc: 'LTOB',
      prices: { medical: 2, equipment: 2, gas: -1, crystal: -1 },
      desc: 'An inhabited research ring in a stable distant orbit around the dark primary. Its observation galleries face the accretion disk; shielded approach lanes remain clear. The ring does not enter the disk.',
    },
    world: {
      id: 'aureole-ash',
      name: 'Ashwatch',
      kind: 'moon',
      x: 1250,
      y: -840,
      r: 62,
      color: '#796f80',
      svc: '',
      tech: 0,
      desc: 'A cold, airless monitoring moon outside the luminous accretion disk.',
    },
  },
  {
    id: 'reliquary',
    name: 'Reliquary',
    dx: -285,
    dy: -55,
    danger: 3,
    scene: {
      kind: 'pulsar',
      hazard: { x: 900, y: 700, r: 440, period: 18, on: 4, warning: 3, drain: 24 },
    },
    port: {
      id: 'reliquary-watch',
      name: 'Graveyard Watch',
      kind: 'station',
      x: -850,
      y: -700,
      r: 74,
      color: '#8cadc3',
      tech: 4,
      svc: 'LTOB',
      prices: { medical: 2, equipment: 1, metal: -1, shards: -1 },
      desc: 'A shielded salvage watchpost beside the pulsar graveyard. The marked radiation pocket pulses for four seconds out of every eighteen: it drains shields only, never hull. All docking and arrival lanes lie outside it.',
    },
    world: {
      id: 'reliquary-husk',
      name: 'The Last Husk',
      kind: 'moon',
      x: 1500,
      y: -800,
      r: 58,
      color: '#93949e',
      svc: '',
      tech: 0,
      desc: 'A scorched moon surrounded by the remains of an abandoned salvage fleet.',
    },
  },
  {
    id: 'nightjar',
    name: 'Nightjar',
    dx: -285,
    dy: -190,
    danger: 2,
    scene: { kind: 'rogue' },
    port: {
      id: 'nightjar-refuge',
      name: 'Nightjar Refuge',
      kind: 'planet',
      x: -380,
      y: 220,
      r: 148,
      color: '#537b8d',
      tech: 4,
      svc: 'LTOB',
      land: 'l_ice1',
      prices: { food: 2, medical: 2, equipment: 1, gas: -1 },
      desc: 'A rogue world warmed by deep geothermal vents rather than a sun. Refuge domes and rescue hangars shelter crews from the dark lanes. The starless sky is a reminder to bring fuel.',
    },
    world: {
      id: 'nightjar-beacon',
      name: 'Refuge Beacon',
      kind: 'station',
      x: 1000,
      y: -900,
      r: 58,
      color: '#879dbb',
      svc: 'LB',
      tech: 2,
      desc: 'A staffed emergency beacon. Refuge crews coordinate searches and take survey reports here.',
    },
  },
  {
    id: 'glasswake',
    name: 'Glasswake',
    dx: -390,
    dy: -255,
    danger: 3,
    scene: { kind: 'shattered' },
    port: {
      id: 'glasswake-foundry',
      name: 'Shardwright Foundry',
      kind: 'station',
      x: -620,
      y: 500,
      r: 82,
      color: '#c8a68c',
      tech: 5,
      svc: 'LTOYB',
      prices: { equipment: 2, medical: 1, ore: -2, metal: -1, shards: -2 },
      desc: 'A working foundry overlooking the fragments of a shattered world. Its pilots trade marked salvage routes and carry machinery to the observatory. The dock is clear of the debris belt.',
    },
    world: {
      id: 'glasswake-remnant',
      name: 'Glasswake Remnant',
      kind: 'moon',
      x: 1160,
      y: -880,
      r: 92,
      color: '#b79583',
      svc: '',
      tech: 0,
      desc: 'The largest surviving fragment of the broken world. Fractures expose a cooling, mineral-rich interior.',
    },
  },
  {
    id: 'palinode',
    name: 'Palinode',
    dx: -490,
    dy: -325,
    danger: 4,
    scene: { kind: 'observatory' },
    port: {
      id: 'palinode-observatory',
      name: 'Palinode Observatory',
      kind: 'station',
      x: -420,
      y: 360,
      r: 78,
      color: '#a5bdd2',
      tech: 6,
      svc: 'LTOB',
      prices: { medical: 2, equipment: 2, food: 1, crystal: -2 },
      desc: "A settler research annex beside an ancient builders' observatory. Its patient arrays still measure something beyond the visible sky. Researchers need supplies and recovered readings, not a second Gateway. The old instruments keep their secrets.",
    },
    world: {
      id: 'palinode-listener',
      name: 'The Listener',
      kind: 'moon',
      x: 1200,
      y: -920,
      r: 66,
      color: '#8799a8',
      svc: '',
      tech: 0,
      desc: 'Silent receiver structures cross an empty moon. Survey crews work from the nearby inhabited annex.',
    },
  },
];
export const EVENTIDE_LINKS = [
  ['vesper-gate', 'lantern-twins'],
  ['lantern-twins', 'aureole'],
  ['aureole', 'reliquary'],
  ['aureole', 'nightjar'],
  ['reliquary', 'nightjar'],
  ['nightjar', 'glasswake'],
  ['glasswake', 'palinode'],
];
export function addEventide(systems: StarSystem[]) {
  const by = Object.fromEntries(systems.map((s) => [s.id, s])),
    origin = by['vesper-gate'];
  for (const E of EVENTIDE) {
    if (by[E.id]) continue;
    const sys: StarSystem = {
      id: E.id,
      name: E.name,
      x: origin.x + E.dx,
      y: origin.y + E.dy,
      faction: 'farside',
      farside: true,
      eventide: true,
      danger: E.danger,
      links: [],
      scene: E.scene,
      stellars: [{ ...E.port }, { ...E.world }],
      fields:
        E.id === 'glasswake'
          ? [
              {
                id: 'glasswake-shards',
                x: 1300,
                y: 600,
                r: 350,
                ore: 'shards',
                rich: 3,
                rocks: 14,
              },
              { id: 'glasswake-ore', x: -1400, y: -600, r: 300, ore: 'ore', rich: 3, rocks: 12 },
            ]
          : [],
    };
    systems.push(sys);
    by[E.id] = sys;
  }
  for (const [a, b] of EVENTIDE_LINKS) {
    if (!by[a].links.includes(b)) by[a].links.push(b);
    if (!by[b].links.includes(a)) by[b].links.push(a);
  }
  // A few authored main-galaxy examples; no destination, market, ID or RNG changes.
  for (const [id, kind] of [
    ['meridian', 'binary'],
    ['gloam', 'pulsar'],
    ['slagforge', 'shattered'],
  ])
    if (by[id]) by[id].scene = { kind };
}
export function eventideOffers(
  p: StellarBody & { system: string; svc: string },
  d: { missions: { id: string }[] },
  win: number,
) {
  const i = EVENTIDE.findIndex((s) => s.id === p.system);
  if (i < 0 || !p.svc.includes('B')) return [];
  const next = EVENTIDE[(i + 1) % EVENTIDE.length],
    other = EVENTIDE[(i + 2) % EVENTIDE.length],
    key = `eventide-${p.id}-${win}`;
  return [
    {
      id: key + '-supply',
      type: 'cargo',
      title: `EVENTIDE: Supply ${next.port.name}`,
      sys: next.id,
      dest: next.port.id,
      cid: i % 2 ? 'equipment' : 'medical',
      qty: 8,
      reward: 14500 + i * 1800,
      text: `Carry eight tons of ${i % 2 ? 'equipment' : 'medical supplies'} to ${next.port.name} in ${next.name}. This marked route keeps the Eventide research and rescue stations provisioned.`,
    },
    {
      id: key + '-rescue',
      type: 'rescue',
      eventide: true,
      rescuePoint: [-1100, 900] as [number, number],
      title: `EVENTIDE: Recover the ${other.name} survey crew`,
      sys: other.id,
      hull: 704,
      faction: 'farside',
      wreckName: `${other.name} Survey Tender`,
      reward: 18500 + i * 1800,
      text: `A survey tender lost power in ${other.name}. Board it, rescue the crew, then land at a staffed port for payment. No trip into the marked radiation pocket is required.`,
    },
  ].filter((o) => !d.missions.some((m) => m.id === o.id));
}
// Same wall-clock phase on authoritative server and renderer; harmless outside the marked circle.
export function eventidePulse(h: HazardDefinition, seconds: number) {
  const phase = ((seconds % h.period) + h.period) % h.period;
  return phase < h.on ? 'active' : phase >= h.period - h.warning ? 'warning' : 'quiet';
}
export function eventideDrain(
  sys: Pick<StarSystem, 'scene'>,
  e: { state: string; x: number; y: number },
  seconds: number,
) {
  const h = sys.scene?.hazard;
  return h &&
    e.state === 'fly' &&
    Math.hypot(e.x - h.x, e.y - h.y) < h.r &&
    eventidePulse(h, seconds) === 'active'
    ? h.drain
    : 0;
}
