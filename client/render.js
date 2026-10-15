// Quantum Rift renderer: starfield, stellars, ships (EV Quantum sprite sheets), shots, beams, effects, radar.
import { planetSprite } from './planets.js';
import { missionTargets } from './missions.js';
import { ANOMALIES } from '/shared/fronts.js';
import { STATES } from '/shared/living.js';
import { SYS, STELLARS, FACTIONS, COMMODITIES } from '/shared/galaxy.js';
import { weaponParams, BEAM_COLORS, weaponColor, weaponLook, price } from '/shared/rules.js';
// ------------------------------------------------------------------ type definitions
/**
 * @typedef {Object} StellarBody
 * @property {string} id Unique identifier for the stellar body
 * @property {string} name Display name of the planet, station, or wormhole
 * @property {number} x World X coordinate
 * @property {number} y World Y coordinate
 * @property {number} r Radius in game units
 * @property {string[]} svc Service flags (e.g. 'L' land, 'T' trade, 'Y' shipyard, 'O' outfit)
 * @property {string} [desc] Lore description
 * @property {string} [faction] Controlling faction identifier
 * @property {number} [station] Station visual design index
 * @property {boolean} [hub] Whether this is a central hub station
 * @property {boolean} [wormhole] Whether this stellar body is a wormhole gate
 * @property {boolean} [site] Whether this is a special POI site
 */

/**
 * @typedef {Object} GalaxySystem
 * @property {string} id System identifier
 * @property {string} name System display name
 * @property {number} x Galactic coordinate X
 * @property {number} y Galactic coordinate Y
 * @property {string} faction Controlling faction ID
 * @property {number} danger Danger rating index
 * @property {string[]} links Connected system IDs
 * @property {StellarBody[]} stellars Stellar bodies located in this system
 * @property {string} [gate] Wormhole destination system ID if present
 */

/**
 * @typedef {Object} CameraState
 * @property {number} cx Camera center X world position
 * @property {number} cy Camera center Y world position
 * @property {number} z Zoom scale factor
 * @property {number} W Viewport width in pixels
 * @property {number} H Viewport height in pixels
 */

/**
 * @typedef {Object} VisualEffect
 * @property {string} type Effect kind ('boom' | 'spark' | 'flash' | 'blast' | 'dmg')
 * @property {number} x World X coordinate
 * @property {number} y World Y coordinate
 * @property {number} t Spawn timestamp (performance.now())
 * @property {number} d Duration in milliseconds
 * @property {number} [size] Radius or scale of explosion/blast
 * @property {string} [col] Color hex or CSS string for sparks
 * @property {number} [r] Blast radius
 * @property {number} [n] Damage number amount
 * @property {boolean} [mine] Whether damage was dealt by or to the local player
 */

/**
 * @typedef {Object} ShieldHit
 * @property {number} t Hit timestamp (performance.now())
 * @property {number} x World X coordinate of impact
 * @property {number} y World Y coordinate of impact
 */

/**
 * @typedef {Object} MapFit
 * @property {number} k Scale multiplier
 * @property {number} ox Pixel horizontal offset
 * @property {number} oy Pixel vertical offset
 */

/**
 * @typedef {Object} MapTransform
 * @property {(gx: number) => number} tx Transform galactic X to canvas X
 * @property {(gy: number) => number} ty Transform galactic Y to canvas Y
 * @property {number} k Zoom / scale factor
 */

/**
 * @typedef {Object} ShipHull
 * @property {string} id Hull identifier
 * @property {string} name Ship model display name
 * @property {number} size Hull collision / rendering radius
 * @property {boolean} [spr] True if rendered using multi-frame sprite sheet
 * @property {number} [frames] Total rotation frames (typically 36)
 * @property {number} [banks] Banking animation frames count
 */

/**
 * @typedef {Object} RenderEntity
 * @property {number} id Unique entity ID
 * @property {string} hull Hull design identifier
 * @property {number} rx Smoothed / interpolated world X coordinate
 * @property {number} ry Smoothed / interpolated world Y coordinate
 * @property {number} x Raw world X coordinate
 * @property {number} y Raw world Y coordinate
 * @property {number} a Heading angle in radians
 * @property {number} vx Velocity X component
 * @property {number} vy Velocity Y component
 * @property {number} fl Entity status flags (thrust, ab, disabled, friendly, etc.)
 * @property {number} sh Current shield amount
 * @property {number} ar Current armor amount
 * @property {string} fac Faction identifier
 * @property {string} [name] Captain or ship name
 * @property {number} [owner] Player owner ID if companion or drone
 * @property {number} [pw] Power level or aura
 * @property {number} [t] Timestamp of last update
 */

// 1.2 map views (after Endless Sky's map modes): colour each system by trade price, services, your standing, or danger
/**
 * Interpolates between two RGB color tuples.
 * @param {[number, number, number]} a Start RGB tuple
 * @param {[number, number, number]} b End RGB tuple
 * @param {number} t Interpolation factor (0 to 1)
 * @returns {string} Formatted rgb(r, g, b) string
 */
const lerpC = (a, b, t) =>
  `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t)))).join(',')})`;
/**
 * Computes the best price-to-base ratio for a given commodity across a system's trade ports.
 * @param {GalaxySystem} s System object
 * @param {string} cid Commodity identifier
 * @returns {number | null} Price ratio or null if no trade service available
 */
export function tradeRatio(s, cid) {
  const ps = s.stellars.filter((p) => p.svc && p.svc.includes('T') && !p.site);
  if (!ps.length) return null;
  const base = COMMODITIES.find((c) => c.id === cid).base;
  let best = null;
  for (const p of ps) {
    const v = price(p, cid);
    if (v !== null && (best === null || v < best)) best = v;
  }
  return best === null ? null : best / base;
}
/**
 * Determines system display color on the map according to the selected map mode.
 * @param {Record<string, any>} G Global client game state
 * @param {GalaxySystem} s System object
 * @param {boolean} seen Whether the system has been visited or discovered
 * @returns {string} CSS color string
 */
function viewColor(G, s, seen) {
  const mode = G.mapMode || 'factions';
  if (mode === 'factions') return FACTIONS[s.faction].color;
  if (!seen) return '#2a2e38';
  if (mode === 'trade') {
    const r = tradeRatio(s, G.mapCid || 'food');
    return r === null
      ? '#3a3e48'
      : r < 1
        ? lerpC([240, 220, 90], [60, 230, 110], (1 - r) / 0.25)
        : lerpC([240, 220, 90], [255, 80, 60], (r - 1) / 0.25);
  }
  if (mode === 'services') {
    const y = s.stellars.some((p) => p.svc && p.svc.includes('Y')),
      o = s.stellars.some((p) => p.svc && p.svc.includes('O'));
    return y && o ? '#c38aff' : y ? '#5ab0ff' : o ? '#ffaa4a' : '#3a3e48';
  }
  if (mode === 'standing') {
    const F = FACTIONS[s.faction];
    if (F.region) return '#5a5e68';
    const rep = (G.you && G.you.rep[s.faction]) || 0;
    return rep >= 0
      ? lerpC([200, 200, 120], [60, 230, 110], rep / 60)
      : lerpC([200, 200, 120], [255, 60, 50], -rep / 60);
  }
  if (mode === 'danger') return lerpC([90, 200, 120], [255, 50, 40], s.danger / 6);
  return FACTIONS[s.faction].color;
}

const FAC = Object.keys(FACTIONS);
const wormImg = new Image();
wormImg.src = 'assets/wormhole.png';
const sheets = new Map();
/**
 * Loads or retrieves a cached sprite sheet image for a given ship hull.
 * @param {ShipHull} H Ship hull specification object
 * @param {boolean} [glow] Whether to load the thruster glow variant
 * @returns {HTMLImageElement} Cached or newly requested HTML Image
 */
export function sheet(H, glow) {
  // 2.6: the sharper full-colour sheets (12 wide, with banking frames) where a hull has them
  const k = H.id + (glow ? 'g' : '');
  if (!sheets.has(k)) {
    const im = new Image();
    im.src = `assets/ships/${H.id}${glow ? '_glow' : ''}.${H.spr ? 'webp' : 'png'}`;
    sheets.set(k, im);
  }
  return sheets.get(k);
}
// 2.6: banking. Ships roll into the turn: turning clockwise (right) shows the set rolled right, anticlockwise the set rolled left.
/**
 * Computes bank frame index (0: straight, 1: bank right, 2: bank left) for turning ships.
 * @param {RenderEntity} e Render entity
 * @param {number} now Timestamp in milliseconds
 * @returns {number} Bank frame index (0, 1, or 2)
 */
function bankOf(e, now) {
  const pa = e._pa ?? e.a,
    dtm = Math.max(1, now - (e._pt || now - 16));
  let d = e.a - pa;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  e._pa = e.a;
  e._pt = now;
  e._br = (e._br || 0) * 0.82 + (d / dtm) * 1000 * 0.18;
  return e._br > 0.55 ? 1 : e._br < -0.55 ? 2 : 0;
}
const stationImgs = [0, 1, 2, 3, 4, 5].map((k) => {
  const im = new Image();
  im.src = `assets/stations/${k}.png`;
  return im;
});
const hubImg = new Image();
hubImg.src = 'assets/hub.png';
const HUB_FRAMES = 18,
  HUB_PERIOD = 150; // seconds for one full turn

/**
 * Creates a deterministic pseudorandom number generator function from a seed.
 * @param {number} seed Integer seed value
 * @returns {() => number} Generator returning floats in [0, 1)
 */
function seeded(seed) {
  let s = seed >>> 0 || 7;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/**
 * Hashes a string using 32-bit FNV-1a.
 * @param {string} str Input string
 * @returns {number} Unsigned 32-bit hash value
 */
function hashStr(str) {
  let h = 2166136261;
  for (const c of str) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ------------------------------------------------------------------ backdrops
const starCache = new Map();
/**
 * Generates and caches parallax star layers and faint nebulae for a solar system.
 * @param {string} sysId System identifier
 * @returns {{ layers: Array<{ L: Array<[number, number, number, number]>, depth: number, size: number }>, neb: Array<[number, number, number, number]> }} Star backdrop model
 */
function stars(sysId) {
  if (starCache.has(sysId)) return starCache.get(sysId);
  const r = seeded(hashStr(sysId)),
    layers = [];
  for (const [n, depth, size] of [
    [260, 0.15, 1],
    [160, 0.35, 1.3],
    [70, 0.6, 1.8],
  ]) {
    const L = [];
    for (let i = 0; i < n; i++) L.push([r() * 2048, r() * 2048, 0.35 + r() * 0.65, r()]);
    layers.push({ L, depth, size });
  }
  const neb = [];
  for (let i = 0; i < 4; i++)
    neb.push([r() * 6000 - 3000, r() * 6000 - 3000, 900 + r() * 1600, r()]);
  const v = { layers, neb };
  starCache.set(sysId, v);
  return v;
}
// ------------------------------------------------------------------ 2.2 scenery: every system gets its own sky and its own clutter, seeded from its id.
// 2.2 scenery: every system gets its own sky and its own clutter, seeded from its id.
// Far (barely moves): the system's star, galaxies, a black hole or pulsar, gas giants, megastructure arcs. Middle: gas clouds,
// asteroid drifts, ion storms. Near (in the system itself): abandoned stations, ancient wrecks, ring ruins, crystal formations,
// debris fields, comets, relay satellites, cargo pods and nav beacons.
const decorImgs = {};
/**
 * Loads and caches background decor assets by filename.
 * @param {string} n Asset filename key
 * @returns {HTMLImageElement} HTML Image instance
 */
function decorImg(n) {
  if (!decorImgs[n]) {
    const im = new Image();
    im.src = `assets/decor/${n}.webp`;
    decorImgs[n] = im;
  }
  return decorImgs[n];
}
/**
 * Checks whether an image has completely loaded and has positive natural dimensions.
 * @param {HTMLImageElement} im Image element to test
 * @returns {boolean} True if ready to draw
 */
const ready = (im) => im.complete && im.naturalWidth;
const decorCache = new Map();
const NEB_BY_FAC = {
  umbral: [7, 1],
  deep: [4, 7, 0],
  farside: [6, 5, 3],
  vashari: [3, 6],
  korrund: [2, 6],
  ylith: [0, 5, 3],
  thalassi: [0, 5],
  sarn: [2, 7],
  quevari: [6, 5, 0],
  hollow: [1, 7],
  frontier: [2, 3, 6],
};
const SUNS = [
  ['255,244,220', '255,200,120'],
  ['255,230,170', '255,160,70'],
  ['255,190,140', '255,110,60'],
  ['210,230,255', '140,180,255'],
  ['255,255,255', '200,220,255'],
];
const objImgs = {}; // 2.5: rendered asteroids and loot (tools/rift_objects.py)
/**
 * Loads and caches rendered 3D object images (asteroids, minerals, crates).
 * @param {string} n Object name identifier
 * @returns {HTMLImageElement} Cached or newly created image
 */
function objImg(n) {
  let im = objImgs[n];
  if (!im) {
    im = objImgs[n] = new Image();
    im.src = `assets/objects/${n}.webp`;
  }
  return im;
}
let rockSprites = null;
/**
 * Generates or retrieves procedural procedural canvas textures for background asteroids.
 * @param {number} k Asteroid variant index
 * @returns {HTMLCanvasElement} Off-screen canvas sprite
 */
function rockSprite(k) {
  // a few dark, lumpy background asteroids, drawn once
  if (!rockSprites)
    rockSprites = Array.from({ length: 6 }, (_, i) => {
      const r = seeded(77 + i),
        c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d');
      x.beginPath();
      const n = 9 + i;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * 6.283,
          d = 18 + r() * 12;
        j
          ? x.lineTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d)
          : x.moveTo(32 + Math.cos(a) * d, 32 + Math.sin(a) * d);
      }
      x.closePath();
      const g = x.createLinearGradient(10, 10, 54, 54);
      g.addColorStop(0, '#6a645e');
      g.addColorStop(1, '#1c1a19');
      x.fillStyle = g;
      x.fill();
      return c;
    });
  return rockSprites[k % 6];
}
/**
 * Procedurally generates and caches all ambient scenery and backdrop objects for a solar system.
 * @param {GalaxySystem} S Solar system specification
 * @returns {Record<string, any>} System scenery definitions object
 */
function decorFor(S) {
  if (decorCache.has(S.id)) return decorCache.get(S.id);
  if (S.arena) {
    // 2.6: the Crucible has its own look: a ring of pylons in Azure and Crimson, dark crimson nebulae, no borrowed worlds
    const r = seeded(hashStr('crucible')),
      D = {
        sun: { x: 380, y: -260, size: 110, core: '255,216,208', halo: '255,90,80', depth: 0.03 },
        gal: [],
        hole: null,
        pulsar: null,
        giant: null,
        arc: null,
        neb: [],
        belt: null,
        storm: null,
        derelict: [],
        wreck: [],
        ruin: [],
        crystal: [],
        debris: [],
        comet: null,
        sats: [],
        pods: [],
        beacons: [],
        bgp: [],
        meteorT: 99,
        arena: { R: 1150 },
      };
    D.neb.push(
      { img: 'nebula_7', x: -700, y: 100, size: 2600, rot: 0.4, a: 0.6, depth: 0.25 },
      { img: 'nebula_1', x: 800, y: 200, size: 2400, rot: 2.1, a: 0.5, depth: 0.25 },
    );
    D.arc = { img: 'arc_1', x: 0, y: -700, size: 1400, rot: 0, depth: 0.14 };
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * 6.283;
      D.beacons.push({
        x: Math.cos(a) * 1150,
        y: Math.sin(a) * 1150,
        col: Math.cos(a) < 0 ? '#5aa8ff' : '#ff5a4a',
        ph: i * 0.35,
      });
    }
    D.debris.push({
      x: 0,
      y: 0,
      spin: 0.002,
      bits: Array.from({ length: 18 }, () => ({
        a: r() * 6.283,
        d: 420 + r() * 700,
        s: 3 + r() * 6,
        sp: (r() - 0.5) * 0.03,
        rot: r() * 6,
      })),
    });
    decorCache.set(S.id, D);
    return D;
  }
  const r = seeded(hashStr('decor:' + S.id)),
    pick = (a) => a[Math.floor(r() * a.length)],
    wild = ['frontier', 'deep', 'umbral'].includes(S.faction) || S.farside;
  const D = {
    sun: null,
    gal: [],
    hole: null,
    pulsar: null,
    giant: null,
    arc: null,
    neb: [],
    belt: null,
    storm: null,
    derelict: [],
    wreck: [],
    ruin: [],
    crystal: [],
    debris: [],
    comet: null,
    sats: [],
    pods: [],
    beacons: [],
    meteorT: r() * 10,
  };
  const clear = (x, y, m) =>
    S.stellars.every((p) => Math.hypot(p.x - x, p.y - y) > (p.r || 80) + m) &&
    Math.hypot(x, y) > 500;
  const spot = (rmin, rmax, m) => {
    for (let i = 0; i < 30; i++) {
      const a = r() * 6.283,
        d = rmin + r() * (rmax - rmin),
        x = Math.cos(a) * d,
        y = Math.sin(a) * d;
      if (clear(x, y, m)) return [x, y];
    }
    return null;
  };
  const sc = pick(SUNS);
  D.sun = {
    x: (r() - 0.5) * 1800,
    y: (r() - 0.5) * 1400,
    size: 140 + r() * 220,
    core: sc[0],
    halo: sc[1],
    depth: 0.04,
  };
  const ng = r() < 0.18 ? 0 : r() < 0.7 ? 1 : 2;
  for (let i = 0; i < ng; i++)
    D.gal.push({
      img: 'galaxy_' + Math.floor(r() * 6),
      x: (r() - 0.5) * 2600,
      y: (r() - 0.5) * 2000,
      size: 120 + r() * 220,
      rot: r() * 6.283,
      squash: 0.35 + r() * 0.65,
      a: 0.28 + r() * 0.27,
      depth: 0.02 + r() * 0.03,
    });
  if (r() < (wild ? 0.25 : 0.04))
    D.hole = {
      x: (r() - 0.5) * 2400,
      y: (r() - 0.5) * 1800,
      size: 260 + r() * 260,
      rot: (r() - 0.5) * 0.8,
      depth: 0.05,
    };
  else if (r() < 0.06)
    D.pulsar = {
      x: (r() - 0.5) * 2400,
      y: (r() - 0.5) * 1800,
      spin: 0.6 + r() * 1.4,
      len: 260 + r() * 260,
      depth: 0.05,
    };
  D.bgp = []; // 2.4: background worlds painted by the planet renderer, unique to every system
  const BGT = [
    ['gas giant ringed rings', 0, 360, 0.35, 0.65],
    ['gas giant storm bands', 0, 360, 0.3, 0.55],
    ['ice giant gas giant', 180, 230, 0.25, 0.6],
    ['volcanic lava world', 0, 25, 0.6, 0.4],
    ['ocean world seas', 190, 225, 0.55, 0.45],
    ['desert dunes', 25, 45, 0.5, 0.55],
    ['toxic acid swamp', 70, 110, 0.5, 0.45],
    ['crystal glass world', 260, 320, 0.45, 0.6],
    ['barren airless rock', 0, 360, 0.05, 0.5],
    ['jungle garden world', 90, 140, 0.45, 0.4],
    ['frozen ice world', 185, 210, 0.15, 0.75],
  ];
  const hsl2hex = (h, s_, l) => {
    const k = (n) => (n + h / 30) % 12,
      a = s_ * Math.min(l, 1 - l),
      f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return (
      '#' +
      [f(0), f(8), f(4)]
        .map((v) =>
          Math.round(v * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')
    );
  };
  const bgWorld = (k, big) => {
    const T = big && r() < 0.62 ? BGT[Math.floor(r() * 3)] : BGT[Math.floor(r() * BGT.length)],
      h = T[1] + r() * (T[2] - T[1]),
      sat = Math.max(0.03, T[3] + (r() - 0.5) * 0.2),
      lum = T[4] + (r() - 0.5) * 0.15;
    return {
      p: {
        id: `bg:${S.id}:${k}`,
        kind: 'planet',
        color: hsl2hex(h, sat, lum),
        desc: T[0],
        name: '',
        r: big ? 120 + r() * 40 : 50 + r() * 40,
        svc: '',
        tech: 0,
      },
      x: (r() - 0.5) * 3200,
      y: (r() - 0.5) * 2600,
      size: big ? 260 + r() * 460 : 70 + r() * 120,
      depth: big ? 0.08 + r() * 0.05 : 0.03 + r() * 0.03,
      a: 0.8 + r() * 0.15,
    };
  };
  if (r() < 0.62) D.bgp.push(bgWorld(0, true));
  if (r() < 0.38) D.bgp.push(bgWorld(1, false));
  if (r() < 0.12) D.bgp.push(bgWorld(2, false));
  if (r() < (wild ? 0.2 : 0.07))
    D.arc = {
      img: 'arc_' + Math.floor(r() * 2),
      x: (r() - 0.5) * 4000,
      y: (r() - 0.5) * 3200,
      size: 900 + r() * 700,
      rot: r() * 6.283,
      depth: 0.14,
    }; // 2.5.2: smaller, now that it is detailed
  const fac = S.farside ? 'farside' : S.faction,
    pool = NEB_BY_FAC[fac] || [0, 1, 2, 3, 4, 5, 6, 7],
    nn = 1 + Math.floor(r() * 3) + (S.danger >= 3 ? 1 : 0);
  for (let i = 0; i < nn; i++)
    D.neb.push({
      img: 'nebula_' + (r() < 0.7 ? pick(pool) : Math.floor(r() * 8)),
      x: (r() - 0.5) * 7000,
      y: (r() - 0.5) * 7000,
      size: 1300 + r() * 1900,
      rot: r() * 6.283,
      a: 0.5 + r() * 0.35,
      depth: 0.18 + r() * 0.3,
    });
  if (r() < 0.38) {
    const a0 = r() * 6.283,
      R = 1800 + r() * 2200;
    D.belt = {
      depth: 0.7 + r() * 0.15,
      rocks: Array.from({ length: 30 + Math.floor(r() * 40) }, () => {
        const a = a0 + (r() - 0.5) * 1.6;
        return {
          x: Math.cos(a) * (R + (r() - 0.5) * 500),
          y: Math.sin(a) * (R + (r() - 0.5) * 500),
          s: 8 + r() * 34,
          k: Math.floor(r() * 6),
          rot: r() * 6,
          sp: (r() - 0.5) * 0.4,
        };
      }),
    };
  }
  if (r() < 0.08 + 0.05 * S.danger)
    D.storm = {
      x: (r() - 0.5) * 5000,
      y: (r() - 0.5) * 5000,
      R: 900 + r() * 900,
      img: 'nebula_' + pick([0, 5, 4]),
      depth: 0.9,
    };
  if (r() < 0.26) {
    const p = spot(1300, 3200, 600);
    if (p)
      D.derelict.push({
        img: 'derelict_' + Math.floor(r() * 4),
        x: p[0],
        y: p[1],
        size: 380 + r() * 260,
        rot: r() * 6.283,
        spin: (r() - 0.5) * 0.01,
      });
  }
  const wreckOdds = 0.32 + 0.1 * S.danger + (wild ? 0.2 : 0);
  for (let i = 0; i < 2; i++)
    if (r() < wreckOdds * (i ? 0.4 : 1)) {
      const p = spot(1200, 3400, 700);
      if (p)
        D.wreck.push({
          img: 'wreck_' + Math.floor(r() * 6),
          x: p[0],
          y: p[1],
          size: 650 + r() * 650,
          rot: r() * 6.283,
          spin: (r() - 0.5) * 0.004,
          bits: Array.from({ length: 10 + Math.floor(r() * 10) }, () => ({
            a: r() * 6.283,
            d: 0.35 + r() * 0.5,
            s: 3 + r() * 9,
            sp: (r() - 0.5) * 0.03,
            rot: r() * 6,
          })),
        });
    }
  if (r() < 0.13 + (S.farside ? 0.3 : 0)) {
    const p = spot(1600, 3600, 900);
    if (p)
      D.ruin.push({
        img: 'ruin_' + Math.floor(r() * 2),
        x: p[0],
        y: p[1],
        size: 1100 + r() * 700,
        rot: r() * 6.283,
        spin: (r() - 0.5) * 0.002,
      });
  }
  if (r() < (['ylith', 'frontier', 'deep'].includes(S.faction) || S.farside ? 0.45 : 0.14)) {
    const p = spot(900, 3200, 400);
    if (p)
      for (let i = 0, n = 1 + Math.floor(r() * 3); i < n; i++)
        D.crystal.push({
          img: 'crystal_' + Math.floor(r() * 3),
          x: p[0] + (r() - 0.5) * 500,
          y: p[1] + (r() - 0.5) * 500,
          size: 140 + r() * 220,
          rot: r() * 6.283,
          spin: (r() - 0.5) * 0.02,
          ph: r() * 6,
        });
  }
  if (r() < 0.3 + 0.06 * S.danger) {
    const p = spot(800, 3000, 300);
    if (p)
      D.debris.push({
        x: p[0],
        y: p[1],
        spin: (r() - 0.5) * 0.01,
        bits: Array.from({ length: 25 + Math.floor(r() * 30) }, () => ({
          a: r() * 6.283,
          d: r() * 420,
          s: 3 + r() * 14,
          rot: r() * 6,
          sp: (r() - 0.5) * 0.6,
          hot: r() < 0.12,
        })),
      });
  }
  if (r() < 0.3) {
    const a = r() * 6.283;
    D.comet = {
      x0: Math.cos(a) * 5200,
      y0: Math.sin(a) * 5200,
      vx: -Math.cos(a + (r() - 0.5) * 0.9) * (14 + r() * 16),
      vy: -Math.sin(a + (r() - 0.5) * 0.9) * (14 + r() * 16),
      len: 380 + r() * 520,
      hue: r() < 0.5 ? '170,220,255' : '190,255,230',
      period: 900,
    };
  }
  for (const p of S.stellars) {
    if (p.svc && p.svc.includes('L') && r() < 0.7)
      for (let i = 0; i < 2; i++)
        D.beacons.push({
          x: p.x + Math.cos(r() * 6.283) * ((p.r || 80) + 140 + r() * 140),
          y: p.y + Math.sin(r() * 6.283) * ((p.r || 80) + 140 + r() * 140),
          col: i ? '#ff4a3a' : '#5aff8a',
          ph: r() * 6.283,
        });
    if ((p.kind === 'planet' || p.kind === 'moon') && r() < 0.55)
      D.sats.push({
        cx: p.x,
        cy: p.y,
        R: (p.r || 100) + 90 + r() * 120,
        a: r() * 6.283,
        sp: (r() < 0.5 ? 1 : -1) * (0.02 + r() * 0.04),
        img: 'satellite_' + Math.floor(r() * 3),
        size: 30 + r() * 22,
      });
  }
  if (r() < 0.45)
    for (let i = 0, n = 2 + Math.floor(r() * 4); i < n; i++)
      D.pods.push({
        x: (r() - 0.5) * 5000,
        y: (r() - 0.5) * 5000,
        vx: (r() - 0.5) * 6,
        vy: (r() - 0.5) * 6,
        img: 'pod_' + Math.floor(r() * 3),
        size: 24 + r() * 18,
        rot: r() * 6,
        sp: (r() - 0.5) * 0.4,
      });
  decorCache.set(S.id, D);
  return D;
}
/**
 * Projects a distant background object's coordinates into screen space using parallax depth.
 * @param {{ x: number, y: number, depth: number }} o Object with position and depth factor
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} cx Camera center X
 * @param {number} cy Camera center Y
 * @param {number} zf Zoom scale factor for far objects
 * @returns {[number, number]} Screen coordinates [x, y]
 */
function farXY(o, W, H, cx, cy, zf) {
  return [W / 2 + (o.x - cx * o.depth) * zf, H / 2 + (o.y - cy * o.depth) * zf];
}
/**
 * Renders deepest background elements: primary star, distant galaxies, pulsars, and nebulae.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {GalaxySystem} S Solar system specification
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} z Camera zoom level
 * @param {number} cx Camera center X
 * @param {number} cy Camera center Y
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
function drawDecorFar(ctx, S, W, H, z, cx, cy, now) {
  const D = decorFor(S),
    zf = Math.pow(z, 0.25),
    t = now / 1000;
  {
    const s = D.sun,
      [x, y] = farXY(s, W, H, cx, cy, zf),
      R = s.size * zf; // the system's star, far off, with a soft lens flare
    if (x > -R * 3 && y > -R * 3 && x < W + R * 3 && y < H + R * 3) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, R * 2.4);
      g.addColorStop(0, `rgba(${s.core},.95)`);
      g.addColorStop(0.06, `rgba(${s.core},.75)`);
      g.addColorStop(0.2, `rgba(${s.halo},.22)`);
      g.addColorStop(1, `rgba(${s.halo},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R * 2.4, 0, 6.283);
      ctx.fill();
      const L = R * 3.2,
        h = ctx.createLinearGradient(x - L, y, x + L, y);
      h.addColorStop(0, `rgba(${s.halo},0)`);
      h.addColorStop(0.5, `rgba(${s.core},.35)`);
      h.addColorStop(1, `rgba(${s.halo},0)`);
      ctx.fillStyle = h;
      ctx.fillRect(x - L, y - 1.5, L * 2, 3);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const g of D.gal) {
    const im = decorImg(g.img);
    if (!ready(im)) continue;
    const [x, y] = farXY(g, W, H, cx, cy, zf),
      s = g.size * zf;
    if (x < -s || y < -s || x > W + s || y > H + s) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(g.rot);
    ctx.scale(1, g.squash);
    ctx.globalAlpha = g.a;
    ctx.drawImage(im, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  if (D.pulsar) {
    const p = D.pulsar,
      [x, y] = farXY(p, W, H, cx, cy, zf),
      L = p.len * zf,
      a = t * p.spin; // two lighthouse beams sweeping round
    if (x > -L && y > -L && x < W + L && y < H + L)
      for (const s2 of [0, Math.PI]) {
        const ux = Math.cos(a + s2),
          uy = Math.sin(a + s2) * 0.45,
          g = ctx.createLinearGradient(x, y, x + ux * L, y + uy * L);
        g.addColorStop(0, 'rgba(200,225,255,.6)');
        g.addColorStop(1, 'rgba(120,170,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + ux * L - uy * L * 0.08, y + uy * L + ux * L * 0.08);
        ctx.lineTo(x + ux * L + uy * L * 0.08, y + uy * L - ux * L * 0.08);
        ctx.closePath();
        ctx.fill();
      }
    ctx.fillStyle = 'rgba(230,240,255,.95)';
    ctx.beginPath();
    ctx.arc(x, y, 2.5, 0, 6.283);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  if (D.hole) {
    const h = D.hole,
      im = decorImg('blackhole_0');
    if (ready(im)) {
      const [x, y] = farXY(h, W, H, cx, cy, zf),
        s = h.size * zf;
      if (x > -s && y > -s && x < W + s && y < H + s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(h.rot + Math.sin(t / 40) * 0.03);
        ctx.drawImage(im, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
    }
  }
  for (const bp of [...D.bgp].sort((a, b) => a.depth - b.depth)) {
    // 2.4: unique background worlds, the farthest first
    const [x, y] = farXY(bp, W, H, cx, cy, zf),
      s = bp.size * zf;
    if (x < -s * 2 || y < -s * 2 || x > W + s * 2 || y > H + s * 2) continue;
    const P = planetSprite(bp.p, now);
    if (!P) continue;
    const w = (s * P.S) / P.D;
    ctx.globalAlpha = bp.a;
    ctx.drawImage(P.canvas, x - w / 2, y - w / 2, w, w);
    ctx.globalAlpha = 1;
  }
  if (D.arc) {
    const A_ = D.arc,
      im = decorImg(A_.img);
    if (ready(im)) {
      const k = Math.pow(z, 0.4),
        x = W / 2 + (A_.x - cx * A_.depth) * k,
        y = H / 2 + (A_.y - cy * A_.depth) * k,
        s = A_.size * k;
      if (x > -s && y > -s && x < W + s && y < H + s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(A_.rot);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(im, -s / 2, -s / 2, s, s);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const n of D.neb) {
    const im = decorImg(n.img);
    if (!ready(im)) continue;
    const k = Math.pow(z, 0.55),
      x = W / 2 + (n.x - cx * n.depth) * k * 0.6,
      y = H / 2 + (n.y - cy * n.depth) * k * 0.6,
      s = n.size * k;
    if (x < -s || y < -s || x > W + s || y > H + s) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(n.rot + now / 600000);
    ctx.globalAlpha = n.a;
    ctx.drawImage(im, -s / 2, -s / 2, s, s);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // a shooting star now and then, far behind everything
  {
    const per = 14,
      ph = (t + D.meteorT) % per;
    if (ph < 0.7) {
      const r = seeded(Math.floor((t + D.meteorT) / per) + hashStr(S.id)),
        x0 = r() * W,
        y0 = r() * H * 0.6,
        a = 0.4 + r() * 1.2,
        L = 120 + r() * 160,
        k = ph / 0.7;
      const x = x0 + Math.cos(a) * L * k * 2,
        y = y0 + Math.sin(a) * L * k * 2,
        g = ctx.createLinearGradient(x, y, x - Math.cos(a) * L, y - Math.sin(a) * L);
      g.addColorStop(0, `rgba(255,255,255,${0.7 * (1 - k)})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - Math.cos(a) * L, y - Math.sin(a) * L);
      ctx.stroke();
    }
  }
}
/**
 * Renders mid-distance background clutter: asteroid drift belts and ion storm fields with lightning.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {GalaxySystem} S Solar system specification
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} z Camera zoom factor
 * @param {number} cx Camera center X
 * @param {number} cy Camera center Y
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
function drawDecorMid(ctx, S, W, H, z, cx, cy, now) {
  const D = decorFor(S),
    t = now / 1000;
  if (D.belt) {
    const B = D.belt,
      k = z * B.depth + z * (1 - B.depth) * 0.6;
    ctx.globalAlpha = 0.6; // a drift of distant asteroids, a little behind the play field
    for (const rk of B.rocks) {
      const x = W / 2 + (rk.x - cx * B.depth) * k,
        y = H / 2 + (rk.y - cy * B.depth) * k,
        s = rk.s * k * 1.6;
      if (x < -s || y < -s || x > W + s || y > H + s) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rk.rot + t * rk.sp);
      ctx.drawImage(rockSprite(rk.k), -s / 2, -s / 2, s, s);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  if (D.storm) {
    const st = D.storm,
      k = z * st.depth + z * 0.1,
      x = W / 2 + (st.x - cx * st.depth) * k,
      y = H / 2 + (st.y - cy * st.depth) * k,
      R = st.R * k; // an ion storm: a charged cloud with lightning
    if (x > -R * 1.5 && y > -R * 1.5 && x < W + R * 1.5 && y < H + R * 1.5) {
      const im = decorImg(st.img);
      ctx.globalCompositeOperation = 'lighter';
      if (ready(im)) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(im, x - R, y - R, R * 2, R * 2);
        ctx.globalAlpha = 1;
      }
      const slot = Math.floor(t * 3),
        r = seeded(slot * 131 + hashStr(S.id));
      if (r() < 0.45) {
        let px = x + (r() - 0.5) * R,
          py = y + (r() - 0.5) * R;
        const flick = 1 - (t * 3 - slot);
        ctx.strokeStyle = `rgba(190,225,255,${0.85 * flick})`;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let i = 0; i < 9; i++) {
          px += (r() - 0.5) * R * 0.25;
          py += (r() - 0.3) * R * 0.18;
          ctx.lineTo(px, py);
        }
        ctx.stroke();
        const gl = ctx.createRadialGradient(x, y, 0, x, y, R);
        gl.addColorStop(0, `rgba(150,200,255,${0.12 * flick})`);
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl;
        ctx.beginPath();
        ctx.arc(x, y, R, 0, 6.283);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
/**
 * Renders in-system foreground clutter: comets, derelicts, ancient ruins, satellites, and nav beacons.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {GalaxySystem} S Solar system specification
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} z Camera zoom factor
 * @param {(wx: number) => number} sx Screen X projector function
 * @param {(wy: number) => number} sy Screen Y projector function
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
function drawDecorNear(ctx, S, W, H, z, sx, sy, now) {
  const D = decorFor(S),
    t = now / 1000,
    onS = (x, y, s) => x > -s && y > -s && x < W + s && y < H + s;
  const sprite = (o, alpha = 1, spin = o.spin || 0) => {
    const im = decorImg(o.img);
    if (!ready(im)) return;
    const x = sx(o.x),
      y = sy(o.y),
      s = o.size * z,
      sh = (s * im.naturalHeight) / im.naturalWidth;
    if (!onS(x, y, s)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((o.rot || 0) + t * spin);
    ctx.globalAlpha = alpha;
    ctx.drawImage(im, -s / 2, -sh / 2, s, sh);
    ctx.restore();
    ctx.globalAlpha = 1;
  };
  if (D.comet) {
    // a comet crossing the system, its tail streaming away from the star
    const c = D.comet,
      ph = (t % c.period) / c.period,
      x0 = c.x0 + c.vx * (t % c.period),
      y0 = c.y0 + c.vy * (t % c.period),
      x = sx(x0),
      y = sy(y0);
    const d = Math.hypot(x0, y0) || 1,
      ux = x0 / d,
      uy = y0 / d,
      L = c.len * z * (0.6 + 0.4 * Math.min(1, 3000 / d)),
      w = 10 * z + 2;
    if (onS(x, y, L) && ph < 0.98) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x, y, x + ux * L, y + uy * L);
      g.addColorStop(0, `rgba(${c.hue},.55)`);
      g.addColorStop(1, `rgba(${c.hue},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - uy * w, y + ux * w);
      ctx.lineTo(x + ux * L - uy * w * 3, y + uy * L + ux * w * 3);
      ctx.lineTo(x + ux * L + uy * w * 3, y + uy * L - ux * w * 3);
      ctx.lineTo(x + uy * w, y - ux * w);
      ctx.closePath();
      ctx.fill();
      const h = ctx.createRadialGradient(x, y, 0, x, y, w * 2.2);
      h.addColorStop(0, 'rgba(255,255,255,.95)');
      h.addColorStop(1, `rgba(${c.hue},0)`);
      ctx.fillStyle = h;
      ctx.beginPath();
      ctx.arc(x, y, w * 2.2, 0, 6.283);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  for (const R of D.ruin) sprite(R, 0.92);
  for (const o of D.derelict) sprite(o, 0.95);
  for (const w of D.wreck) {
    const im = decorImg(w.img);
    if (!ready(im)) continue;
    const x = sx(w.x),
      y = sy(w.y),
      s = w.size * z,
      sh = (s * im.naturalHeight) / im.naturalWidth;
    if (!onS(x, y, s)) continue;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(w.rot + t * w.spin);
    ctx.fillStyle = 'rgba(95,90,85,.9)';
    for (const b of w.bits) {
      const a = b.a + t * b.sp,
        bx = Math.cos(a) * s * b.d * 0.7,
        by = Math.sin(a) * s * b.d * 0.6;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.rot + t * b.sp * 8);
      ctx.fillRect(-b.s * z, -b.s * z * 0.4, b.s * 2 * z, b.s * 0.8 * z);
      ctx.restore();
    }
    ctx.drawImage(im, -s / 2, -sh / 2, s, sh);
    ctx.restore();
  }
  for (const f of D.debris) {
    const x = sx(f.x),
      y = sy(f.y);
    if (!onS(x, y, 480 * z)) continue; // a battle's leftovers, slowly turning
    for (const b of f.bits) {
      const a = b.a + t * f.spin,
        bx = x + Math.cos(a) * b.d * z,
        by = y + Math.sin(a) * b.d * z * 0.8;
      ctx.save();
      ctx.translate(bx, by);
      ctx.rotate(b.rot + t * b.sp);
      ctx.fillStyle = b.hot
        ? `rgba(255,${130 + 60 * Math.sin(t * 3 + b.rot)},60,.9)`
        : 'rgba(110,105,100,.95)';
      ctx.beginPath();
      ctx.moveTo(-b.s * z, -b.s * z * 0.3);
      ctx.lineTo(b.s * z * 0.7, -b.s * z * 0.5);
      ctx.lineTo(b.s * z, b.s * z * 0.4);
      ctx.lineTo(-b.s * z * 0.4, b.s * z * 0.3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  for (const c of D.crystal) {
    sprite(c, 0.95);
    const im = decorImg(c.img);
    if (ready(im)) {
      const x = sx(c.x),
        y = sy(c.y),
        s = c.size * z * 1.25;
      if (onS(x, y, s)) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.14 * Math.sin(t * 1.3 + c.ph);
        ctx.translate(x, y);
        ctx.rotate(c.rot + t * c.spin);
        ctx.drawImage(im, -s / 2, -s / 2, s, s);
        ctx.restore();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
  for (const sat of D.sats) {
    const a = sat.a + t * sat.sp;
    sprite({
      img: sat.img,
      x: sat.cx + Math.cos(a) * sat.R,
      y: sat.cy + Math.sin(a) * sat.R * 0.8,
      size: sat.size,
      rot: a + 1.57,
    });
  }
  for (const p of D.pods) {
    const span = 6000,
      px = ((((p.x + p.vx * t) % span) + span * 1.5) % span) - span / 2,
      py = ((((p.y + p.vy * t) % span) + span * 1.5) % span) - span / 2;
    sprite({ img: p.img, x: px, y: py, size: p.size, rot: p.rot + t * p.sp });
  }
  if (D.arena) {
    ctx.save();
    ctx.setLineDash([10 * z + 4, 14 * z + 6]);
    ctx.lineWidth = 1.5;
    for (const [col, a0] of [
      ['rgba(90,168,255,.35)', Math.PI / 2],
      ['rgba(255,90,74,.35)', -Math.PI / 2],
    ]) {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(sx(0), sy(0), D.arena.R * z, a0, a0 + Math.PI);
      ctx.stroke();
    }
    ctx.restore();
  } // 2.6: the Crucible's bounds
  for (const b of D.beacons) {
    const x = sx(b.x),
      y = sy(b.y);
    if (!onS(x, y, 20)) continue;
    const on = Math.sin(t * 2.2 + b.ph) > 0.55;
    ctx.fillStyle = '#556';
    ctx.fillRect(x - 1.5 * z - 1, y - 1.5 * z - 1, 3 * z + 2, 3 * z + 2);
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9 * z + 4);
      g.addColorStop(0, b.col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 9 * z + 4, 0, 6.283);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
const planetCache = new Map();
/**
 * Converts a hexadecimal color string to an RGB number triplet.
 * @param {string} h Hex color code (e.g. '#ff8800')
 * @returns {[number, number, number]} RGB color values [r, g, b]
 */
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
// 2.5: rendered station designs (tools/rift_stations.py), chosen by who built the station and what it is
const stImgs = {},
  stPick = new Map();
/**
 * Determines the architectural 3D station sprite model name for a station.
 * @param {StellarBody} p Station stellar body definition
 * @returns {string} Station design archetype name
 */
export function stationDesign(p) {
  if (stPick.has(p.id)) return stPick.get(p.id);
  const sysId = p.system || (STELLARS[p.id] && STELLARS[p.id].system),
    f = SYS[sysId] ? SYS[sysId].faction : '',
    d = ((p.desc || '') + ' ' + p.id).toLowerCase(),
    h = hashStr(p.id);
  const by =
    {
      vashari: 'hive',
      ylith: 'crystal',
      thalassi: 'reef',
      sarn: 'ring',
      quevari: 'spindle',
      umbral: 'disc',
      lamp: h % 2 ? 'twin' : 'disc',
    }[f] ||
    (f === 'korrund' ? (h % 3 ? 'rock' : 'forge') : null) ||
    (p.outlaw || (STELLARS[p.id] && STELLARS[p.id].outlaw) || f === 'hollow' ? 'junk' : null) ||
    (f === 'farside' ? (h % 2 ? 'junk' : 'twin') : null) ||
    (/shipyard|slipway|yards/.test(d) && f === 'quantum' ? 'yard' : null) ||
    ['cross', 'ring', 'spindle', 'disc', 'twin'][h % 5];
  stPick.set(p.id, by);
  return by;
}
/**
 * Retrieves the loaded HTMLImageElement for a station's rendered sprite model.
 * @param {StellarBody} p Station stellar body
 * @returns {HTMLImageElement | null} Loaded image or null if loading
 */
function stationSprite(p) {
  const k = stationDesign(p);
  let im = stImgs[k];
  if (!im) {
    im = stImgs[k] = new Image();
    im.src = `assets/stations/s_${k}.webp`;
  }
  return im.complete && im.naturalWidth ? im : null;
}
/**
 * Generates or retrieves a pre-rendered off-screen canvas sprite for a planet or station.
 * @param {StellarBody} p Stellar body specification
 * @returns {HTMLCanvasElement} Off-screen canvas containing the rendered body
 */
function planetImage(p) {
  if (planetCache.has(p.id)) return planetCache.get(p.id);
  const R = p.r,
    S = Math.ceil(R * 2.6),
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'),
    cx = S / 2,
    cy = S / 2,
    [r0, g0, b0] = hexToRgb(p.color || '#888'),
    rnd = seeded(hashStr(p.id));
  if (p.kind === 'station') {
    g.translate(cx, cy);
    const ring = (rad, w, col) => {
      g.beginPath();
      g.arc(0, 0, rad, 0, Math.PI * 2);
      g.lineWidth = w;
      g.strokeStyle = col;
      g.stroke();
    };
    ring(R * 0.92, R * 0.16, `rgb(${r0 * 0.6},${g0 * 0.6},${b0 * 0.6})`);
    ring(
      R * 0.92,
      R * 0.05,
      `rgb(${Math.min(255, r0 + 60)},${Math.min(255, g0 + 60)},${Math.min(255, b0 + 60)})`,
    );
    for (let k = 0; k < 6; k++) {
      g.save();
      g.rotate((k * Math.PI) / 3 + rnd());
      g.fillStyle = `rgb(${r0 * 0.5},${g0 * 0.5},${b0 * 0.5})`;
      g.fillRect(-R * 0.05, 0, R * 0.1, R * 0.86);
      g.restore();
    }
    const hub = g.createRadialGradient(-R * 0.1, -R * 0.1, 2, 0, 0, R * 0.4);
    hub.addColorStop(
      0,
      `rgb(${Math.min(255, r0 + 80)},${Math.min(255, g0 + 80)},${Math.min(255, b0 + 80)})`,
    );
    hub.addColorStop(1, `rgb(${r0 * 0.3},${g0 * 0.3},${b0 * 0.3})`);
    g.beginPath();
    g.arc(0, 0, R * 0.38, 0, Math.PI * 2);
    g.fillStyle = hub;
    g.fill();
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.fillStyle = rnd() < 0.5 ? '#ffd88a' : '#9cf';
      g.fillRect(Math.cos(a) * R * 0.92 - 1.5, Math.sin(a) * R * 0.92 - 1.5, 3, 3);
    }
  } else {
    const grd = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
    grd.addColorStop(
      0,
      `rgb(${Math.min(255, r0 + 70)},${Math.min(255, g0 + 70)},${Math.min(255, b0 + 70)})`,
    );
    grd.addColorStop(0.7, `rgb(${r0},${g0},${b0})`);
    grd.addColorStop(1, `rgb(${r0 * 0.25},${g0 * 0.25},${b0 * 0.25})`);
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = grd;
    g.fill();
    g.clip();
    for (let k = 0; k < 14; k++) {
      // cloud bands / continents
      g.globalAlpha = 0.08 + rnd() * 0.12;
      g.fillStyle = rnd() < 0.5 ? '#fff' : `rgb(${r0 * 0.5},${g0 * 0.5},${b0 * 0.5})`;
      g.beginPath();
      g.ellipse(
        cx + (rnd() - 0.5) * R * 1.6,
        cy + (rnd() - 0.5) * R * 1.8,
        R * (0.2 + rnd() * 0.6),
        R * (0.05 + rnd() * 0.15),
        (rnd() - 0.5) * 0.6,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    if (p.id === 'earth') {
      // Earth gets green-brown continents and white cloud swirls
      for (let k = 0; k < 9; k++) {
        g.globalAlpha = 0.9;
        g.fillStyle = rnd() < 0.7 ? '#4f7a3a' : '#8a7a4a';
        g.beginPath();
        const ex = cx + (rnd() - 0.5) * R * 1.5,
          ey = cy + (rnd() - 0.5) * R * 1.5;
        for (let j = 0; j < 7; j++) {
          const a2 = (j / 7) * Math.PI * 2,
            rr = R * (0.12 + rnd() * 0.22);
          g[j ? 'lineTo' : 'moveTo'](ex + Math.cos(a2) * rr * 1.4, ey + Math.sin(a2) * rr);
        }
        g.closePath();
        g.fill();
      }
      for (let k = 0; k < 10; k++) {
        g.globalAlpha = 0.45;
        g.fillStyle = '#fff';
        g.beginPath();
        g.ellipse(
          cx + (rnd() - 0.5) * R * 1.7,
          cy + (rnd() - 0.5) * R * 1.7,
          R * (0.15 + rnd() * 0.4),
          R * (0.03 + rnd() * 0.06),
          (rnd() - 0.5) * 0.8,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
    }
    g.globalAlpha = 1;
    const sh = g.createRadialGradient(cx - R * 0.6, cy - R * 0.6, R * 0.6, cx, cy, R * 1.25);
    sh.addColorStop(0, 'rgba(0,0,0,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = sh;
    g.fillRect(0, 0, S, S);
    g.restore();
    const atm = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 1.15);
    atm.addColorStop(0, `rgba(${r0},${g0},${b0},0.35)`);
    atm.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = atm;
    g.beginPath();
    g.arc(cx, cy, R * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  planetCache.set(p.id, c);
  return c;
}

// ------------------------------------------------------------------ effects
/**
 * Active transient visual effect particle objects.
 * @type {VisualEffect[]}
 */
export const fx = [];
const fxImgs = {}; // 2.5: rendered effects (tools/rift_fx.py)
/**
 * Loads or returns cached visual effect sprites.
 * @param {string} n Effect sprite name
 * @returns {HTMLImageElement} Effect sprite image
 */
function fxImg(n) {
  let im = fxImgs[n];
  if (!im) {
    im = fxImgs[n] = new Image();
    im.src = `assets/fx/${n}.webp`;
  }
  return im;
}
for (const n of ['boom_a', 'boom_b', 'boom_big', 'shards', 'flare']) fxImg(n);
/**
 * Spawns an explosion visual effect with fireballs, shockwaves, smoke, and debris.
 * @param {number} x World coordinate X
 * @param {number} y World coordinate Y
 * @param {number} [size=40] Explosion radius / size
 * @returns {void}
 */
export function boom(x, y, size) {
  size = Math.max(20, size || 40);
  const n = Math.min(70, 14 + size / 3);
  fx.push({ x, y, ball: true, life: 0.35 + size / 900, max: 0.35 + size / 900, r: size * 0.6 }); // flash
  {
    const big = size > 120,
      L = (big ? 1.5 : 0.95) + size / 700;
    fx.push({
      x,
      y,
      anim: big ? 'boom_big' : Math.random() < 0.5 ? 'boom_a' : 'boom_b',
      life: L,
      max: L,
      r: size * (big ? 1.35 : 1.1),
      rot: Math.random() * 6.283,
    });
  } // 2.5: a rendered fireball
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 6.283,
      v = 30 + Math.random() * (60 + size);
    fx.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.5 + Math.random() * 0.9,
      max: 1.4,
      c: Math.random() < 0.5 ? '#ffd27a' : '#ff6a3a',
      s: 1 + Math.random() * 2.5,
    });
  }
  for (let i = 0; i < Math.min(14, 3 + size / 25); i++) {
    const a = Math.random() * 6.283,
      v = 20 + Math.random() * 60;
    fx.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      smoke: true,
      life: 1.2 + Math.random(),
      max: 2.2,
      r: 8 + size * 0.15,
    });
  }
  for (let i = 0; i < Math.min(10, 2 + size / 30); i++) {
    const a = Math.random() * 6.283,
      v = 40 + Math.random() * 120;
    fx.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      debris: true,
      rot: Math.random() * 6,
      vr: (Math.random() - 0.5) * 12,
      life: 1.5 + Math.random(),
      max: 2.5,
      s: 2 + (Math.random() * size) / 40,
    });
  }
  fx.push({ x, y, ring: true, life: 0.5, max: 0.5, r: size * 1.1, c: '#fff1c0' });
  if (size > 120) fx.push({ x, y, ring: true, life: 0.9, max: 0.9, r: size * 2, c: '#ffb070' });
}
/**
 * Spawns directional weapon impact sparks and a momentary flash flare.
 * @param {number} x World coordinate X
 * @param {number} y World coordinate Y
 * @param {string} [col='#fff'] Spark color code
 * @returns {void}
 */
export function spark(x, y, col) {
  fx.push({ x, y, flare: true, life: 0.16, max: 0.16, r: 26, c: col });
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * 6.283,
      v = 40 + Math.random() * 90;
    fx.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.25,
      max: 0.25,
      c: col || '#fff',
      s: 1.6,
    });
  }
}
/**
 * Spawns a hyperspace jump departure or arrival visual flash effect.
 * @param {number} x World coordinate X
 * @param {number} y World coordinate Y
 * @returns {void}
 */
export function flash(x, y) {
  // 2.1: a ship entering or leaving hyperspace: a hot core, a lens streak and two shock rings
  fx.push({ x, y, hyper: true, life: 0.75, max: 0.75, r: 70 });
  fx.push({ x, y, ring: true, life: 0.55, max: 0.55, r: 150, c: '#bfe2ff' });
  fx.push({ x, y, ring: true, life: 0.9, max: 0.9, r: 260, c: '#7aa8ff' });
}
/**
 * Spawns an expanding circular blast wave effect.
 * @param {number} x World coordinate X
 * @param {number} y World coordinate Y
 * @param {number} r Maximum blast radius
 * @returns {void}
 */
export function blast(x, y, r) {
  fx.push({ x, y, ring: true, life: 0.35, max: 0.35, r, c: '#ffcf8a' });
}
// shield shimmer on the ship that was hit, and floating damage numbers
/**
 * Active shield hit shimmer animations mapped by entity ID.
 * @type {Map<number, ShieldHit>}
 */
export const shieldHits = new Map();
/**
 * Triggers a shield impact ripple shimmer effect on the target ship.
 * @param {number} id Ship entity ID
 * @param {number} x Impact world X
 * @param {number} y Impact world Y
 * @returns {void}
 */
export function shieldHit(id, x, y) {
  shieldHits.set(id, { t: 0.35, hx: x, hy: y });
}
/**
 * Creates or aggregates floating combat damage numbers on screen.
 * @param {number} x World coordinate X
 * @param {number} y World coordinate Y
 * @param {number} n Damage points
 * @param {boolean} mine Whether this damage was dealt by the local player
 * @returns {void}
 */
export function dmgNumber(x, y, n, mine) {
  if (n < 1) return;
  for (let i = fx.length - 1; i >= Math.max(0, fx.length - 300); i--) {
    const f = fx[i];
    if (f.num && f.mine === mine && f.life > f.max - 0.45 && Math.hypot(f.x - x, f.y - y) < 70) {
      f.num += Math.round(n);
      f.life = f.max;
      return;
    }
  } // 2.5: hits close together add up into one number
  fx.push({
    x: x + (Math.random() - 0.5) * 16,
    y,
    vx: 0,
    vy: -45,
    num: Math.round(n),
    mine,
    life: 0.9,
    max: 0.9,
  });
}
/**
 * Current camera screen shake intensity factor.
 * @type {number}
 */
export let shake = 0;
/**
 * Global active camera state.
 * @type {CameraState}
 */
export const cam = { cx: 0, cy: 0, z: 1, W: 1, H: 1 };
/**
 * Adds an impulse to the camera screen shake intensity.
 * @param {number} k Shake magnitude to add/clamp
 * @returns {void}
 */
export function addShake(k) {
  shake = Math.max(shake, k);
}

// projectile drawing by look
const glowC = new Map(); // 2.5: a soft additive glow behind every bolt, and a fading trail
/**
 * Generates or retrieves a radial glow sprite for projectile weapons.
 * @param {string} col Color hex string
 * @returns {HTMLCanvasElement} Radial glow canvas sprite
 */
function glowSprite(col) {
  let c = glowC.get(col);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d'),
      gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col);
    gr.addColorStop(0.25, col + 'aa');
    gr.addColorStop(1, col + '00');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowC.set(col, c);
  }
  return c;
}
/**
 * Draws an individual projectile or missile shot on the canvas.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {Record<string, any>} s Shot object definition
 * @param {number} x Screen coordinate X
 * @param {number} y Screen coordinate Y
 * @param {number} z Zoom scale factor
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
function drawShot(ctx, s, x, y, z, now) {
  const W_ = s.W,
    col = s.col,
    look = s.look,
    sp = Math.hypot(s.vx, s.vy) || 1,
    ux = s.vx / sp,
    uy = s.vy / sp;
  const zz = Math.max(0.7, z);
  if (/^#[0-9a-f]{6}$/i.test(col) && look !== 'missile' && look !== 'rocket') {
    ctx.globalCompositeOperation = 'lighter';
    const gs = (look === 'torp' || look === 'sing' ? 46 : 22) * zz;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(glowSprite(col), x - gs / 2, y - gs / 2, gs, gs);
    if (look !== 'rail') {
      const L = Math.min(40, sp * 0.03) * z,
        gr = ctx.createLinearGradient(x, y, x - ux * L, y - uy * L);
      gr.addColorStop(0, col + 'cc');
      gr.addColorStop(1, col + '00');
      ctx.strokeStyle = gr;
      ctx.lineWidth = 3 * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * L, y - uy * L);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.shadowColor = col;
  ctx.shadowBlur = 8;
  switch (look) {
    case 'rail': {
      const L = 26 * z;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2 * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * L, y - uy * L);
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * L * 0.6, y - uy * L * 0.6);
      ctx.stroke();
      break;
    }
    case 'pulse':
    case 'spit':
    case 'magma':
    case 'mining': {
      const r = (look === 'magma' ? 4.5 : look === 'spit' ? 3.5 : 3) * zz;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.45, 0, 6.283);
      ctx.fill();
      if (look === 'magma' && Math.random() < 0.5)
        fx.push({
          x: s.x,
          y: s.y,
          vx: (Math.random() - 0.5) * 20,
          vy: (Math.random() - 0.5) * 20,
          life: 0.35,
          max: 0.35,
          c: '#ff8a30',
          s: 1.6,
        });
      break;
    }
    case 'missile':
    case 'rocket': {
      ctx.strokeStyle = '#ddd';
      ctx.lineWidth = 2.5 * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * 7 * z, y - uy * 7 * z);
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x - ux * 8 * z, y - uy * 8 * z, 2.2 * zz, 0, 6.283);
      ctx.fill();
      if (Math.random() < 0.8)
        fx.push({
          x: s.x - ux * 8,
          y: s.y - uy * 8,
          vx: (Math.random() - 0.5) * 10,
          vy: (Math.random() - 0.5) * 10,
          smoke: true,
          life: 0.6,
          max: 0.6,
          r: 3,
        });
      break;
    }
    case 'torp':
    case 'sing': {
      const pulse = 1 + 0.25 * Math.sin(now / 70),
        r = (look === 'sing' ? 8 : 6) * zz * pulse;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      g.addColorStop(0, '#fff');
      g.addColorStop(0.3, col);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, 6.283);
      ctx.fill();
      if (look === 'sing') {
        ctx.fillStyle = '#05000a';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, 6.283);
        ctx.fill();
        ctx.strokeStyle = '#c090ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r * 1.1, now / 200, now / 200 + 4.5);
        ctx.stroke();
      }
      if (Math.random() < 0.6)
        fx.push({ x: s.x, y: s.y, vx: 0, vy: 0, life: 0.4, max: 0.4, c: col, s: 2.2 });
      break;
    }
    case 'mine': {
      const on = Math.floor(now / 300) % 2;
      ctx.fillStyle = '#555';
      ctx.beginPath();
      ctx.arc(x, y, 4 * zz, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = on ? '#ff3a2a' : '#401010';
      ctx.beginPath();
      ctx.arc(x, y, 1.8 * zz, 0, 6.283);
      ctx.fill();
      break;
    }
    case 'flak': {
      ctx.fillStyle = col;
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * 3 * z;
        ctx.fillRect(x - uy * o - 1.5, y + ux * o - 1.5, 3 * zz, 3 * zz);
      }
      break;
    }
    case 'pd': {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5 * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * 5 * z, y - uy * 5 * z);
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 90);
      ctx.fillStyle = col;
      const r = 4.5 * zz;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.55, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
    default: {
      // bolt: glowing streak with a white core
      const big = W_ && W_.dmgA + W_.dmgS > 40,
        L = (big ? 14 : 10) * z;
      ctx.strokeStyle = col;
      ctx.lineWidth = (big ? 4 : 2.6) * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * L, y - uy * L);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 1 * zz;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - ux * L * 0.7, y - uy * L * 0.7);
      ctx.stroke();
    }
  }
}

// ------------------------------------------------------------------ mining fields
const rockCache = new Map();
/**
 * Generates and caches an off-screen canvas sprite for a minable asteroid or gas deposit.
 * @param {Record<string, any>} k Mining rock or gas pocket definition
 * @returns {HTMLCanvasElement} Off-screen canvas sprite
 */
function rockImage(k) {
  const key = k.id;
  if (rockCache.has(key)) return rockCache.get(key);
  const R = k.r,
    S = Math.ceil(R * 2.6),
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'),
    rnd = seeded(k.id * 7919 + 13),
    cx = S / 2,
    cy = S / 2;
  if (k.ore === 'gas') {
    // a glowing pocket of volatile gas
    for (let i = 0; i < 7; i++) {
      const a = rnd() * 6.283,
        d = rnd() * R * 0.5,
        r = R * (0.5 + rnd() * 0.5),
        x = cx + Math.cos(a) * d,
        y = cy + Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(140,255,200,0.35)');
      gr.addColorStop(0.6, 'rgba(60,170,160,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    }
  } else if (k.ore === 'shards') {
    // a cluster of violet crystal
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const a = rnd() * 6.283,
        L = R * (0.6 + rnd() * 0.6),
        w = R * (0.14 + rnd() * 0.12),
        bx = cx + Math.cos(a + 1.6) * rnd() * R * 0.25,
        by = cy + Math.sin(a + 1.6) * rnd() * R * 0.25;
      g.save();
      g.translate(bx, by);
      g.rotate(a);
      const gr = g.createLinearGradient(-w, 0, w, 0);
      gr.addColorStop(0, '#5a3a8a');
      gr.addColorStop(0.5, '#e0c0ff');
      gr.addColorStop(1, '#7a50b0');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-w, 0);
      g.lineTo(0, -L);
      g.lineTo(w, 0);
      g.lineTo(0, w * 0.6);
      g.closePath();
      g.fill();
      g.restore();
    }
  } else {
    // a lumpy grey-brown asteroid
    const n = 11,
      pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283,
        r = R * (0.72 + rnd() * 0.32);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    const gr = g.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.1);
    gr.addColorStop(0, '#9a8e80');
    gr.addColorStop(0.7, '#5a524a');
    gr.addColorStop(1, '#2a2622');
    g.fillStyle = gr;
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    for (let i = 0; i < 5; i++) {
      const x = cx + (rnd() - 0.5) * R,
        y = cy + (rnd() - 0.5) * R,
        r = R * (0.08 + rnd() * 0.12);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.beginPath();
      g.arc(x, y, r, 0, 6.283);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.beginPath();
      g.arc(x - r * 0.3, y - r * 0.3, r * 0.6, 0, 6.283);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = '#c9a85a';
      g.fillRect(cx + (rnd() - 0.5) * R, cy + (rnd() - 0.5) * R, 2, 2);
    }
  }
  rockCache.set(key, c);
  return c;
}
const LOOT_COL = ['#ffd27a', '#7ad0ff', '#b0a090', '#8affc8', '#d0a0ff', '#ff5ae0']; // 5: hostile loot chest

// ------------------------------------------------------------------ main draw
let tagRects = []; // 2.6: name tags already drawn this frame, so close ships' tags stack instead of overlapping
/**
 * Master rendering pipeline: backdrop, stellar bodies, mining fields, loot, shots, beams, ships, effects, and HUD overlays.
 * @param {Record<string, any>} G Game state object
 * @param {CanvasRenderingContext2D} ctx Destination canvas rendering context
 * @param {number} W Viewport width in pixels
 * @param {number} H Viewport height in pixels
 * @param {number} dt Delta time in seconds since previous frame
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
export function draw(G, ctx, W, H, dt, now) {
  tagRects = [];
  const me = G.view,
    z = G.zoom,
    S = SYS[G.sys];
  let cx = (me ? me.rx : 0) + (G.lookX || 0),
    cy = (me ? me.ry : 0) + (G.lookY || 0); // 2.1: hold right-click to look ahead
  Object.assign(cam, { cx, cy, z, W, H }); // un-shaken camera, used for mouse picking
  if (shake && G.opts && G.opts.shake !== false) {
    cx += ((Math.random() - 0.5) * shake * 2) / z;
    cy += ((Math.random() - 0.5) * shake * 2) / z;
  }
  const sx = (x) => (x - cx) * z + W / 2,
    sy = (y) => (y - cy) * z + H / 2;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  if (!S) return;
  const st = stars(S.id),
    fcol = hexToRgb(FACTIONS[S.faction].color);
  for (const [nx, ny, nr, k] of st.neb) {
    // faint nebulae in the faction's colour
    const x = sx(nx * 0.4 + cx * 0.6),
      y = sy(ny * 0.4 + cy * 0.6),
      r = nr * z * 0.6;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${fcol[0]},${fcol[1]},${fcol[2]},${0.05 + k * 0.05})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  drawDecorFar(ctx, S, W, H, z, cx, cy, now); // 2.1: galaxies and gas clouds far behind the stars
  for (const { L, depth, size } of st.layers) {
    for (const [x0, y0, b, tw] of L) {
      let x = (x0 - cx * depth) % 2048,
        y = (y0 - cy * depth) % 2048;
      if (x < 0) x += 2048;
      if (y < 0) y += 2048;
      for (let ox = x; ox < W + 2048; ox += 2048)
        for (let oy = y; oy < H + 2048; oy += 2048) {
          if (ox > W || oy > H) continue;
          const v = Math.round(255 * b * (0.85 + 0.15 * Math.sin(now / 700 + tw * 20)));
          ctx.fillStyle = `rgb(${v},${v},${Math.min(255, v + 20)})`;
          ctx.fillRect(ox, oy, size, size);
        }
    }
  }
  drawDecorMid(ctx, S, W, H, z, cx, cy, now);
  drawDecorNear(ctx, S, W, H, z, sx, sy, now); // 2.2 scenery in the system itself
  // stellars
  let P_;
  for (const p of S.stellars) {
    const x = sx(p.x),
      y = sy(p.y);
    if (x < -p.r * 3 * z || y < -p.r * 3 * z || x > W + p.r * 3 * z || y > H + p.r * 3 * z)
      continue;
    let label = p.name;
    if (p.wormhole) {
      // the Sol Gateway: the mod's animated vortex, slowly turning
      if (wormImg.complete && wormImg.naturalWidth) {
        const f = Math.floor(now / 55) % 32,
          fs = wormImg.naturalWidth / 8,
          s = p.r * 2.6 * z;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(now / 9000);
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(wormImg, (f % 8) * fs, Math.floor(f / 8) * fs, fs, fs, -s / 2, -s / 2, s, s);
        ctx.restore();
      }
    } else if (p.hub) {
      // the Quantum Station hub turns slowly; neighbouring frames are cross-faded so the rotation is smooth
      if (hubImg.complete && hubImg.naturalWidth) {
        const fs = hubImg.naturalWidth / 6,
          s = p.r * 2.13 * z,
          t = (now / 1000 / HUB_PERIOD) * HUB_FRAMES,
          f0 = Math.floor(t) % HUB_FRAMES,
          f1 = (f0 + 1) % HUB_FRAMES,
          k = t - Math.floor(t);
        ctx.drawImage(
          hubImg,
          (f0 % 6) * fs,
          Math.floor(f0 / 6) * fs,
          fs,
          fs,
          x - s / 2,
          y - s / 2,
          s,
          s,
        );
        ctx.globalAlpha = k;
        ctx.drawImage(
          hubImg,
          (f1 % 6) * fs,
          Math.floor(f1 / 6) * fs,
          fs,
          fs,
          x - s / 2,
          y - s / 2,
          s,
          s,
        );
        ctx.globalAlpha = 1;
      }
    } else if (p.site) {
      const st = G.sites && G.sites[p.id],
        ops = st ? st.ops : 0,
        im = stationImgs[ops];
      if (im.complete && im.naturalWidth) {
        const s = p.r * (2.2 + ops * 0.25) * z;
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(im, x - s / 2, y - s / 2, s, s);
        ctx.globalCompositeOperation = 'source-over';
      }
      label = st
        ? `${st.owner}'s Personal Station · Ops ${ops}`
        : 'Derelict Station Hull (unclaimed)';
    } else if ((p.kind === 'planet' || p.kind === 'moon') && (P_ = planetSprite(p, now))) {
      const w = P_.S * P_.scale * z;
      ctx.drawImage(P_.canvas, x - w / 2, y - w / 2, w, w);
    } // 1.0.1: procedural planets (old art until built)
    else if (p.kind === 'station' && (P_ = stationSprite(p))) {
      const s2 = p.r * 2.5 * z;
      ctx.drawImage(P_, x - s2 / 2, y - s2 / 2, s2, s2);
    } // 2.5: rendered stations
    else {
      const im = planetImage(p);
      ctx.drawImage(
        im,
        x - (im.width * z) / 2,
        y - (im.height * z) / 2,
        im.width * z,
        im.height * z,
      );
    }
    if (G.hoverStellar === p.id && G.navStellar !== p.id) {
      ctx.strokeStyle = 'rgba(255,255,255,.25)';
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.arc(x, y, p.r * z * 1.15 + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (G.navStellar === p.id) {
      ctx.strokeStyle = 'rgba(120,200,255,.6)';
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(x, y, p.r * z * 1.15 + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = 'rgba(210,220,240,.8)';
    ctx.font = '13px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y + p.r * z + (p.hub ? -p.r * z * 0.25 : 18));
    const colOwner = G.world && G.world.colonies && G.world.colonies[p.id];
    if (colOwner) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = '12px Tahoma';
      ctx.fillText(`${colOwner}'s colony`, x, y + p.r * z + 34);
    }
  }
  // asteroids, gas pockets and crystal clusters
  for (const k of G.rocks || []) {
    if (!k.hp) continue;
    const x = sx(k.x),
      y = sy(k.y),
      R = k.r * z;
    if (x < -R * 2 || y < -R * 2 || x > W + R * 2 || y > H + R * 2) continue;
    const ri =
        k.ore !== 'gas' && objImg(k.ore === 'shards' ? 'crys' + (k.id % 4) : 'rock' + (k.id % 10)),
      rr = ri && ri.complete && ri.naturalWidth; // 2.5: rendered asteroids
    const im = rr ? ri : rockImage(k),
      s2 = rr ? k.r * 2.35 * z : im.width * z;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((now / 1000) * (k.ore === 'gas' ? 0.05 : 0.12) * (k.id % 2 ? 1 : -1) + k.id);
    ctx.globalAlpha = 0.45 + (0.55 * k.hp) / 100;
    if (k.ore === 'gas') ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(im, -s2 / 2, -s2 / 2, s2, s2);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (k.hp < 100 && k.hp > 0) {
      ctx.fillStyle = 'rgba(0,0,0,.6)';
      ctx.fillRect(x - R * 0.6, y + R + 4, R * 1.2, 3);
      ctx.fillStyle = '#e8c070';
      ctx.fillRect(x - R * 0.6, y + R + 4, (R * 1.2 * k.hp) / 100, 3);
    }
  }
  for (const [px_, py_] of salvagePoints(G)) {
    const x = sx(px_),
      y = sy(py_);
    ctx.strokeStyle = 'rgba(255,200,90,.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(x, y, 160 * z, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#ffc85a';
    ctx.font = '12px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('SALVAGE', x, y - 160 * z - 6);
  } // 2.4 quest salvage
  // survey points for an active survey job here
  for (const [px_, py_] of surveyPoints(G)) {
    const x = sx(px_),
      y = sy(py_);
    ctx.strokeStyle = 'rgba(90,216,255,.55)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.arc(x, y, 450 * z, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#5ad8ff';
    ctx.font = '12px Tahoma';
    ctx.textAlign = 'center';
    ctx.fillText('SURVEY POINT', x, y);
  }
  // loot: credits (gold), salvage crates (blue), ore (brown), gas (green), crystal shards (violet)
  for (const l of G.loot) {
    const x = sx(l.x),
      y = sy(l.y),
      li = objImg('loot' + Math.min(5, l.kind || 0)); // 2.5: rendered loot
    if (li.complete && li.naturalWidth) {
      const q = (l.kind === 5 ? 30 + Math.sin(now / 200) * 2 : 18) * Math.max(0.6, z);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(now / 900 + l.id);
      ctx.shadowColor = LOOT_COL[l.kind] || '#fff';
      ctx.shadowBlur = l.kind === 5 ? 18 : 9;
      ctx.drawImage(li, -q / 2, -q / 2, q, q);
      ctx.restore();
      continue;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now / 600 + l.id);
    ctx.fillStyle = LOOT_COL[l.kind] || '#fff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = l.kind === 5 ? 16 : 8;
    const q = l.kind === 5 ? 6 + Math.sin(now / 200) : l.kind >= 2 ? 3 : 4;
    ctx.fillRect(-q * z, -q * z, q * 2 * z, q * 2 * z);
    ctx.restore();
  }
  // shots
  ctx.lineCap = 'round';
  for (const s of G.shots) {
    const W_ = G.A.weapons[s.w];
    if (!s.col) {
      s.W = W_;
      s.col = weaponColor(W_);
      s.look = weaponLook(W_);
    }
    const x = sx(s.x),
      y = sy(s.y);
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) continue;
    drawShot(ctx, s, x, y, z, now);
  }
  ctx.shadowBlur = 0;
  // ships
  for (const e of G.ents.values()) drawShip(G, ctx, e, sx(e.rx), sy(e.ry), z, now);
  if (me && G.ents.get(me.id)) {
  } else if (me && G.myHull)
    drawShip(G, ctx, { ...me, hull: G.myHull, fl: me.fl, id: me.id }, sx(me.rx), sy(me.ry), z, now);
  // beams
  for (const b of G.beams) {
    const e = b.id === (me && me.id) ? me : G.ents.get(b.id);
    if (!e) continue;
    const W_ = G.A.weapons[b.w],
      col = weaponColor(W_);
    const x0 = sx(e.rx),
      y0 = sy(e.ry),
      a = b.a / 1000,
      x1 = x0 + Math.sin(a) * b.len * z,
      y1 = y0 - Math.cos(a) * b.len * z;
    ctx.strokeStyle = col;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 6 * Math.max(0.7, z);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  // shield shimmer: an arc of the shield bubble facing the hit
  for (const [id, h] of shieldHits) {
    h.t -= dt;
    if (h.t <= 0) {
      shieldHits.delete(id);
      continue;
    }
    const e = id === (me && me.id) ? me : G.ents.get(id);
    if (!e) continue;
    const Hh = G.A.ships[e.hull] || G.A.ships[G.myHull];
    const r = (Hh ? Hh.size : 60) * 0.42 * z * G.spriteScale;
    const x = sx(e.rx),
      y = sy(e.ry),
      a = Math.atan2(h.hy - e.ry, h.hx - e.rx),
      k = h.t / 0.35;
    ctx.strokeStyle = `rgba(120,200,255,${0.8 * k})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#7ad0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(x, y, r, a - 0.9, a + 0.9);
    ctx.stroke();
    ctx.strokeStyle = `rgba(120,200,255,${0.2 * k})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  // effects
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) {
      fx.splice(i, 1);
      continue;
    }
    const k = f.life / f.max,
      x = sx(f.x),
      y = sy(f.y);
    if (f.vx !== undefined) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
    }
    if (f.hyper) {
      // 2.1 hyperspace flash
      const e = 1 - k,
        R = f.r * z * (0.6 + e * 0.8),
        g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, `rgba(255,255,255,${k})`);
      g.addColorStop(0.25, `rgba(200,230,255,${k * 0.85})`);
      g.addColorStop(1, 'rgba(80,140,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, R, 0, 6.283);
      ctx.fill();
      const L = f.r * z * (2.5 + e * 5),
        hg = ctx.createLinearGradient(x - L, y, x + L, y);
      hg.addColorStop(0, 'rgba(120,180,255,0)');
      hg.addColorStop(0.5, `rgba(235,245,255,${k * 0.9})`);
      hg.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(x - L, y - Math.max(1, 2.2 * z * k), L * 2, Math.max(2, 4.4 * z * k));
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    if (f.ring) {
      ctx.globalAlpha = k;
      ctx.strokeStyle = f.c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, f.r * (1 - k) * z + 4, 0, Math.PI * 2);
      f.fill ? ((ctx.fillStyle = f.c), (ctx.globalAlpha = k * 0.5), ctx.fill()) : ctx.stroke();
      ctx.globalAlpha = 1;
      continue;
    }
    if (f.anim) {
      const im = fxImg(f.anim);
      if (im.complete && im.naturalWidth) {
        const fs = im.naturalWidth / 6,
          fr = Math.min(23, Math.floor((1 - k) * 24)),
          sz = f.r * 2.6 * z;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(f.rot);
        ctx.drawImage(im, (fr % 6) * fs, Math.floor(fr / 6) * fs, fs, fs, -sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }
      continue;
    }
    if (f.flare) {
      const im = fxImg('flare');
      if (im.complete && im.naturalWidth) {
        const sz = f.r * 2 * z * (0.6 + 0.4 * k);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.drawImage(im, x - sz / 2, y - sz / 2, sz, sz);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
      continue;
    }
    if (f.debris && fxImg('shards').complete && fxImg('shards').naturalWidth) {
      f.rot += f.vr * dt;
      const im = fxImg('shards'),
        si = f.si ?? (f.si = Math.floor(Math.random() * 8)),
        sz = Math.max(6, f.s * 5) * z;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.drawImage(im, si * 48, 0, 48, 48, -sz / 2, -sz / 2, sz, sz);
      if (k > 0.7) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = (k - 0.7) * 2;
        ctx.drawImage(im, si * 48, 0, 48, 48, -sz / 2, -sz / 2, sz, sz);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }
    if (f.ball) {
      const r = f.r * (0.35 + 0.65 * (1 - k * k)) * z,
        g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255,255,230,${k})`);
      g.addColorStop(0.35, `rgba(255,200,90,${k * 0.9})`);
      g.addColorStop(0.7, `rgba(255,90,30,${k * 0.6})`);
      g.addColorStop(1, 'rgba(80,20,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      continue;
    }
    if (f.smoke) {
      f.vx *= 0.97;
      f.vy *= 0.97;
      const r = f.r * (1.6 - k) * z;
      ctx.fillStyle = `rgba(90,85,80,${0.35 * k})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
      continue;
    }
    if (f.debris) {
      f.rot += f.vr * dt;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(f.rot);
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.fillStyle = k > 0.7 ? '#ffb060' : '#6a6a70';
      ctx.fillRect(-f.s * z, -f.s * z * 0.5, f.s * 2 * z, f.s * z);
      ctx.restore();
      ctx.globalAlpha = 1;
      continue;
    }
    if (f.num !== undefined) {
      ctx.globalAlpha = Math.min(1, k * 1.6);
      ctx.font = `bold ${f.mine ? 15 : 13}px Tahoma`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000';
      ctx.strokeText(f.num, x, y);
      ctx.fillStyle = f.mine ? '#ffd27a' : '#ff7a6a';
      ctx.fillText(f.num, x, y);
      ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = k;
    ctx.fillStyle = f.c;
    ctx.fillRect(x, y, f.s * z + 0.5, f.s * z + 0.5);
    ctx.globalAlpha = 1;
  }
  shake *= Math.pow(0.02, dt);
  if (shake < 0.2) shake = 0;
  hudOverlay(G, ctx, W, H, now, sx, sy, me);
}
// ------------------------------------------------------------------ 2.0 screen-space feedback: edge arrows, damage, jumps
/**
 * Renders an off-screen pointing arrow and label at the viewport perimeter.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} x World-to-screen projected X coordinate
 * @param {number} y World-to-screen projected Y coordinate
 * @param {string} col CSS color string
 * @param {string} label Display text
 * @param {number} dist Distance in kilometers
 * @returns {void}
 */
function edgeArrow(ctx, W, H, x, y, col, label, dist) {
  const m = 46,
    cxs = W / 2,
    cys = H / 2,
    dx = x - cxs,
    dy = y - cys;
  if (x > m && y > m && x < W - m && y < H - m) return;
  const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6)),
    ex = cxs + dx * k,
    ey = cys + dy * k,
    a = Math.atan2(dy, dx);
  ctx.save();
  ctx.translate(ex, ey);
  ctx.rotate(a);
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-6, -9);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-6, 9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.font = '11px Tahoma';
  ctx.textAlign = 'center';
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  const lx = ex - Math.cos(a) * 26,
    ly = ey - Math.sin(a) * 22 + 4;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,0,0,.7)';
  const t = `${label} · ${Math.round(dist)} km`;
  ctx.strokeText(t, lx, ly);
  ctx.fillText(t, lx, ly);
  ctx.globalAlpha = 1;
}
const STARS = Array.from({ length: 170 }, (_, i) => {
  const r = (n) => {
    const v = Math.sin(i * 127.1 + n * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  return { x: r(1), y: r(2), z: 0.35 + r(3) * 0.65, c: r(4) < 0.12 ? 'w' : r(4) < 0.4 ? 'b' : 'n' };
});
const STAR_COL = { n: '220,235,255', b: '150,195,255', w: '255,215,170' };
/**
 * Renders directional starfield velocity streaks during hyperspace transitions.
 * @param {CanvasRenderingContext2D} ctx 2D rendering context
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} a Ship heading angle
 * @param {number} len Streak length
 * @param {number} alpha Opacity factor
 * @param {number} drift Drift distance
 * @returns {void}
 */
function streaks(ctx, W, H, a, len, alpha, drift) {
  // star streaks lying along heading a, sliding backwards past you
  const ux = Math.sin(a),
    uy = -Math.cos(a),
    span = W + H;
  ctx.lineCap = 'round';
  for (const st of STARS) {
    let px = (st.x * span - ux * drift * st.z) % span,
      py = (st.y * span - uy * drift * st.z) % span;
    if (px < 0) px += span;
    if (py < 0) py += span;
    px -= (span - W) / 2;
    py -= (span - H) / 2;
    if (px < -200 || py < -200 || px > W + 200 || py > H + 200) continue;
    const l = len * st.z;
    ctx.strokeStyle = `rgba(${STAR_COL[st.c]},${alpha * st.z})`;
    ctx.lineWidth = 0.8 + st.z * 1.4;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ux * l, py - uy * l);
    ctx.stroke();
  }
}
/**
 * Renders hyperspace jump departure spool animation, rings, and flash.
 * @param {Record<string, any>} G Game state
 * @param {CanvasRenderingContext2D} ctx 2D context
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} now Timestamp in milliseconds
 * @param {number} x Ship screen X
 * @param {number} y Ship screen Y
 * @param {number} a Ship heading angle
 * @returns {void}
 */
function hyperOut(G, ctx, W, H, now, x, y, a) {
  const st = G.you && G.you.shipStats,
    dur = st && st.jumpFast ? 600 : 1600,
    k = Math.min(1, (now - (G._jumpStart || now)) / dur);
  // the edges darken as the drive spools
  const vg = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.25,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.7,
  );
  vg.addColorStop(0, 'rgba(0,0,10,0)');
  vg.addColorStop(1, `rgba(0,4,20,${0.55 * Math.min(1, k * 2)})`);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  if (k < 0.55)
    for (let i = 0; i < 3; i++) {
      // rings of energy closing in on the ship
      const q = (k / 0.55 + i / 3) % 1,
        r = 22 + (1 - q) * 170;
      ctx.strokeStyle = `rgba(150,200,255,${0.55 * q * (1 - (k / 0.55) * 0.6)})`;
      ctx.lineWidth = 1.5 + q * 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.stroke();
    }
  const core = ctx.createRadialGradient(x, y, 0, x, y, 40 + 90 * k);
  core.addColorStop(0, `rgba(220,240,255,${0.35 + 0.5 * k})`);
  core.addColorStop(1, 'rgba(90,140,255,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, 40 + 90 * k, 0, 6.283);
  ctx.fill();
  const s2 = Math.max(0, (k - 0.25) / 0.75); // the stars stretch into streaks along your heading
  if (s2 > 0)
    streaks(ctx, W, H, a, 6 + s2 * s2 * Math.max(W, H) * 0.9, 0.25 + 0.6 * s2, s2 * s2 * 2600);
  if (k > 0.82) {
    // the bloom and lens streak as you leave
    const b = (k - 0.82) / 0.18;
    ctx.fillStyle = `rgba(225,238,255,${0.85 * b * b})`;
    ctx.fillRect(0, 0, W, H);
    const L = W * (0.3 + b),
      hg = ctx.createLinearGradient(x - L, y, x + L, y);
    hg.addColorStop(0, 'rgba(120,180,255,0)');
    hg.addColorStop(0.5, `rgba(255,255,255,${0.9 * b})`);
    hg.addColorStop(1, 'rgba(120,180,255,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(x - L, y - 3 - 6 * b, L * 2, 6 + 12 * b);
  }
  ctx.globalCompositeOperation = 'source-over';
}
/**
 * Renders hyperspace jump arrival deceleration bloom and shockwave rings.
 * @param {Record<string, any>} G Game state
 * @param {CanvasRenderingContext2D} ctx 2D context
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} t Milliseconds elapsed since arrival
 * @param {number} x Ship screen X
 * @param {number} y Ship screen Y
 * @param {number} a Ship heading angle
 * @returns {void}
 */
function hyperIn(G, ctx, W, H, t, x, y, a) {
  const k = t / 1100; // 0 at arrival .. 1 settled
  ctx.globalCompositeOperation = 'lighter';
  const s2 = Math.max(0, 1 - k / 0.45);
  if (s2 > 0)
    streaks(ctx, W, H, a, 4 + s2 * s2 * Math.max(W, H) * 0.7, 0.8 * s2, 2600 + (1 - s2) * 900); // streaks collapse back into stars
  for (const [d, col] of [
    [0, '170,215,255'],
    [6, '255,170,200'],
  ]) {
    const r = 30 + k * Math.max(W, H) * 0.6 + d,
      al = 0.6 * (1 - k);
    ctx.strokeStyle = `rgba(${col},${al})`;
    ctx.lineWidth = 3 * (1 - k) + 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.stroke();
  }
  if (k < 0.5) {
    const c = ctx.createRadialGradient(x, y, 0, x, y, 160);
    c.addColorStop(0, `rgba(235,245,255,${0.8 * (1 - k * 2)})`);
    c.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, 160, 0, 6.283);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  if (k < 0.35) {
    ctx.fillStyle = `rgba(225,238,255,${0.75 * (1 - k / 0.35) ** 2})`;
    ctx.fillRect(0, 0, W, H);
  }
}
/**
 * Renders screen-space HUD indicators, off-screen arrows, and damage vignettes.
 * @param {Record<string, any>} G Game state
 * @param {CanvasRenderingContext2D} ctx 2D context
 * @param {number} W Viewport width
 * @param {number} H Viewport height
 * @param {number} now Timestamp in milliseconds
 * @param {(wx: number) => number} sx Screen X projector function
 * @param {(wy: number) => number} sy Screen Y projector function
 * @param {ClientView | null} me Current player view state
 * @returns {void}
 */
function hudOverlay(G, ctx, W, H, now, sx, sy, me) {
  if (!me) return;
  const S = SYS[G.sys];
  if (!S) return;
  // mission objectives in this system, your nav point, and your target
  const seen = new Set();
  for (const t of missionTargets(G))
    if (t.stellar && !seen.has(t.stellar)) {
      const p = S.stellars.find((x) => x.id === t.stellar);
      if (p) {
        seen.add(p.id);
        edgeArrow(
          ctx,
          W,
          H,
          sx(p.x),
          sy(p.y),
          t.kind === 'story' || t.kind === 'arc' ? '#ffd65a' : '#ffb86a',
          p.name,
          Math.hypot(p.x - me.rx, p.y - me.ry),
        );
      }
    }
  for (const [x, y] of salvagePoints(G))
    edgeArrow(ctx, W, H, sx(x), sy(y), '#ffc85a', 'Salvage', Math.hypot(x - me.rx, y - me.ry)); // 2.4
  if (G.navStellar && !seen.has(G.navStellar)) {
    const p = S.stellars.find((x) => x.id === G.navStellar);
    if (p)
      edgeArrow(
        ctx,
        W,
        H,
        sx(p.x),
        sy(p.y),
        '#7ad0ff',
        p.name,
        Math.hypot(p.x - me.rx, p.y - me.ry),
      );
  }
  if (Math.hypot(G.lookX || 0, G.lookY || 0) > 50)
    edgeArrow(ctx, W, H, sx(me.rx), sy(me.ry), '#9fe0ff', 'You', Math.hypot(G.lookX, G.lookY)); // 2.1 look-ahead
  const T = G.target && G.ents.get(G.target);
  if (T)
    edgeArrow(
      ctx,
      W,
      H,
      sx(T.rx),
      sy(T.ry),
      G.isAlly && G.isAlly(T) ? G.pal.ally : G.hostile(T) ? G.pal.hostile : G.pal.friend,
      (T.name || (G.A.ships[T.hull] || {}).name || 'target').split(' · ')[0],
      Math.hypot(T.rx - me.rx, T.ry - me.ry),
    );
  // 2.1 hyperspace: spool rings, star streaks along your heading, a white bloom; arrival plays it in reverse with a shockwave
  if (G._jumping || me.fl & 8) hyperOut(G, ctx, W, H, now, sx(me.rx), sy(me.ry), me.a);
  if (G._arriveT && now - G._arriveT < 1100)
    hyperIn(G, ctx, W, H, now - G._arriveT, sx(me.rx), sy(me.ry), me.a);
  // damage: a red flash when your hull is hit, and a slow pulse when armour is low
  const st = G.you && G.you.shipStats,
    ar = st ? me.armor / Math.max(1, st.armor) : 1,
    hurt = G._hurtT ? Math.max(0, 1 - (now - G._hurtT) / 450) : 0,
    low = ar < 0.3 ? (0.35 + 0.25 * Math.sin(now / 260)) * (1 - ar / 0.3) : 0,
    v = Math.max(hurt * 0.55, low);
  if (v > 0.01) {
    const g = ctx.createRadialGradient(
      W / 2,
      H / 2,
      Math.min(W, H) * 0.35,
      W / 2,
      H / 2,
      Math.max(W, H) * 0.75,
    );
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(200,10,0,${v})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}
/**
 * Renders an individual ship sprite, engine trails, shield/armor bars, and name tags.
 * @param {Record<string, any>} G Game state
 * @param {CanvasRenderingContext2D} ctx Destination canvas rendering context
 * @param {RenderEntity} e Ship entity to draw
 * @param {number} x Screen coordinate X
 * @param {number} y Screen coordinate Y
 * @param {number} z Zoom scale factor
 * @param {number} now Timestamp in milliseconds
 * @returns {void}
 */
function drawShip(G, ctx, e, x, y, z, now) {
  const H = G.A.ships[e.hull];
  if (!H) return;
  const sz = H.size,
    scale = z * G.spriteScale,
    w = sz * scale;
  if (x < -w || y < -w || x > ctx.canvas.width + w || y > ctx.canvas.height + w) return;
  const fr0 = ((Math.round(e.a / (Math.PI / 18)) % 36) + 36) % 36,
    SP = H.spr,
    fs = SP ? SP.fs : sz,
    cols = SP ? SP.cols : 6;
  const fr = fr0 + (SP && SP.banks && !(e.fl & 4) ? bankOf(e, now) * 36 : 0),
    srcX = (fr % cols) * fs,
    srcY = Math.floor(fr / cols) * fs;
  const im = sheet(H);
  if (e.fl & 8 && im.complete && im.naturalWidth) {
    // 2.1: a ship in hyperspace leaves a stretched, blue-shifted ghost trail
    const ux = Math.sin(e.a),
      uy = -Math.cos(e.a);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 6; i >= 1; i--) {
      ctx.globalAlpha = 0.22 * (1 - i / 7);
      const o = i * w * 0.32;
      ctx.drawImage(im, srcX, srcY, fs, fs, x - ux * o - w / 2, y - uy * o - w / 2, w, w);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(
      x + ux * w * 0.35,
      y + uy * w * 0.35,
      0,
      x + ux * w * 0.35,
      y + uy * w * 0.35,
      w * 0.6,
    );
    g.addColorStop(0, 'rgba(220,240,255,.85)');
    g.addColorStop(1, 'rgba(120,170,255,0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x + ux * w * 0.35, y + uy * w * 0.35, w * 0.6, 0, 6.283);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (e.fl & 32) {
    ctx.shadowColor = 'rgba(255,205,90,.95)';
    ctx.shadowBlur = Math.max(6, 16 * z);
  } // mastery Tier 5 gold trim
  if (im.complete && im.naturalWidth)
    ctx.drawImage(im, srcX, srcY, fs, fs, x - w / 2, y - w / 2, w, w);
  else {
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.arc(x, y, w / 4, 0, 6.28);
    ctx.fill();
  }
  ctx.shadowBlur = 0;
  if (e.fl & 1 && H.glow && (!SP || SP.glow)) {
    const g = sheet(H, true);
    if (g.complete && g.naturalWidth) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g, srcX, srcY, fs, fs, x - w / 2, y - w / 2, w, w);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
  if (
    fx.length < 1200 &&
    e.ar != null &&
    e.ar < 50 &&
    !(e.fl & 8) &&
    e.rx != null &&
    Math.random() < ((50 - e.ar) / 50) * 0.4
  ) {
    // 2.4: damaged ships trail smoke, and badly damaged ones burn
    const ox = (Math.random() - 0.5) * sz * 0.4,
      oy = (Math.random() - 0.5) * sz * 0.4;
    fx.push({
      x: e.rx + ox,
      y: e.ry + oy,
      vx: (e.vx || 0) * 0.3 + (Math.random() - 0.5) * 12,
      vy: (e.vy || 0) * 0.3 + (Math.random() - 0.5) * 12,
      smoke: true,
      life: 1.1,
      max: 1.1,
      r: 2.5 + sz * 0.03,
    });
    if (e.ar < 25 && Math.random() < 0.45)
      fx.push({
        x: e.rx + ox,
        y: e.ry + oy,
        vx: (Math.random() - 0.5) * 50,
        vy: (Math.random() - 0.5) * 50,
        life: 0.3,
        max: 0.3,
        c: Math.random() < 0.5 ? '#ffb040' : '#ff6a20',
        s: 1.4,
      });
  }
  if (e.fl & 4) {
    ctx.fillStyle = 'rgba(255,120,60,.8)';
    if (Math.random() < 0.3)
      ctx.fillRect(x + ((Math.random() - 0.5) * w) / 2, y + ((Math.random() - 0.5) * w) / 2, 2, 2);
  }
  if (G.hover === e.id && G.target !== e.id) {
    const r = w * 0.5 + 4;
    ctx.strokeStyle = 'rgba(255,255,255,.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, 6.283);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  const tgt = G.target === e.id;
  const ally = G.isAlly && G.isAlly(e);
  if (ally && !tgt) {
    // 2.6: Armada members and their wingmates carry a green marker
    const r = w * 0.55 + 5;
    ctx.strokeStyle = G.pal.ally;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(x, y, r, a - 0.28, a + 0.28);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (tgt) {
    const r = w * 0.55 + 6;
    ctx.strokeStyle = ally ? G.pal.ally : G.hostile(e) ? G.pal.hostile : G.pal.friend;
    ctx.lineWidth = 1.5;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x + dx * r, y + dy * r * 0.6);
      ctx.lineTo(x + dx * r, y + dy * r);
      ctx.lineTo(x + dx * r * 0.6, y + dy * r);
      ctx.stroke();
    }
  }
  if (e.name && (e.fl & 16 || e.fl & 64 || tgt || ally)) {
    ctx.fillStyle = ally
      ? G.pal.ally
      : e.fl & 16
        ? G.hostile(e)
          ? G.pal.hostile
          : '#9cf'
        : e.fl & 64
          ? '#f2c66a'
          : '#ddd'; // 1.1: rival captains carry gold name tags
    ctx.font = '13px Tahoma';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(e.name).width;
    let ty = y - w * 0.55 - 6;
    for (
      let k = 0;
      k < 6 &&
      tagRects.some((q) => Math.abs(q[0] - x) < (q[2] + tw) / 2 + 4 && Math.abs(q[1] - ty) < 14);
      k++
    )
      ty -= 14;
    tagRects.push([x, ty, tw]);
    ctx.fillText(e.name, x, ty);
  }
}

// ------------------------------------------------------------------ radar
/**
 * Renders the circular cockpit radar display with blips for ships, planets, loot, and asteroids.
 * @param {Record<string, any>} G Game state object
 * @param {CanvasRenderingContext2D} ctx Radar canvas rendering context
 * @returns {void}
 */
export function radar(G, ctx) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height,
    me = G.view;
  ctx.fillStyle = '#020408';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#0d2a1a';
  ctx.lineWidth = 1;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, (k * H) / 6, 0, 6.28);
    ctx.stroke();
  }
  if (!me) return;
  const S = SYS[G.sys],
    neb = G.world && G.world.anomalies && G.world.anomalies[G.sys] === 'nebula',
    R = 4200 * (neb ? 0.5 : 1),
    k = (H / 2 / R) * 1.15;
  G.radarR = R;
  const px = (x) => W / 2 + (x - me.rx) * k,
    py = (y) => H / 2 + (y - me.ry) * k;
  if (S)
    for (const p of S.stellars) {
      ctx.fillStyle = p.wormhole
        ? '#9ac8ff'
        : p.site
          ? G.sites && G.sites[p.id]
            ? '#a8f'
            : '#776'
          : p.hub
            ? '#9ab'
            : '#556';
      ctx.beginPath();
      ctx.arc(px(p.x), py(p.y), Math.max(2.5, p.r * k), 0, 6.28);
      ctx.fill();
    }
  for (const k of G.rocks || [])
    if (k.hp) {
      ctx.fillStyle = k.ore === 'gas' ? '#2a6a5a' : k.ore === 'shards' ? '#6a4a8a' : '#4a4640';
      ctx.fillRect(px(k.x) - 1, py(k.y) - 1, 2, 2);
    }
  for (const l of G.loot) {
    ctx.fillStyle = l.kind === 5 ? '#ff5ae0' : '#fff';
    const q = l.kind === 5 ? 2 : 1;
    ctx.fillRect(px(l.x) - q, py(l.y) - q, q * 2, q * 2);
  }
  for (const [x, y] of salvagePoints(G)) {
    ctx.strokeStyle = '#ffc85a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(px(x) - 4, py(y) - 4, 8, 8);
    ctx.stroke();
  }
  for (const [x, y] of surveyPoints(G)) {
    ctx.strokeStyle = '#5ad8ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px(x), py(y), 5, 0, 6.28);
    ctx.stroke();
  }
  if (neb) {
    ctx.fillStyle = 'rgba(150,120,255,.10)';
    ctx.fillRect(0, 0, W, H);
  }
  for (const e of G.ents.values()) {
    if (e.id === me.id) continue;
    const x = px(e.rx),
      y = py(e.ry);
    if (x < 0 || y < 0 || x > W || y > H) continue;
    const hos = G.hostile(e),
      al = G.isAlly && G.isAlly(e);
    ctx.fillStyle =
      e.owner === me.id
        ? G.pal.own
        : al
          ? G.pal.ally
          : e.fl & 16
            ? hos
              ? G.pal.hostile
              : G.pal.player
            : hos
              ? G.pal.hostile
              : G.pal.neutral;
    const s = e.id === G.target ? 4 : al ? 3.2 : 2.5;
    if (hos && G.opts.cb) {
      ctx.beginPath();
      ctx.moveTo(x, y - s);
      ctx.lineTo(x + s, y);
      ctx.lineTo(x, y + s);
      ctx.lineTo(x - s, y);
      ctx.fill();
    } // colour-blind mode: hostiles are diamonds too
    else ctx.fillRect(x - s / 2, y - s / 2, s, s);
  }
  ctx.fillStyle = '#fff';
  ctx.fillRect(W / 2 - 2, H / 2 - 2, 4, 4);
}

// ------------------------------------------------------------------ galaxy map (minimap and full map)
// opts.big: the full map (pan with drag, zoom with the wheel, view kept in G.mapView). Otherwise the companion minimap,
// centred on the current system. Systems you have not visited are drawn as hollow rings.
const SYS_LIST = Object.values(SYS);
const BOUNDS = (() => {
  const xs = SYS_LIST.map((s) => s.x),
    ys = SYS_LIST.map((s) => s.y);
  return {
    x0: Math.min(...xs) - 60,
    x1: Math.max(...xs) + 60,
    y0: Math.min(...ys) - 60,
    y1: Math.max(...ys) + 60,
  };
})();
/**
 * Calculates optimal galaxy map viewport centering and zoom factor to fit all systems.
 * @param {number} W Canvas pixel width
 * @param {number} H Canvas pixel height
 * @returns {MapFit & { cx: number, cy: number, fit: number }} Map bounds fit object
 */
export function mapFit(W, H) {
  const B = BOUNDS,
    k = Math.min(W / (B.x1 - B.x0), H / (B.y1 - B.y0));
  return { cx: (B.x0 + B.x1) / 2, cy: (B.y0 + B.y1) / 2, k, fit: k };
}
/**
 * Renders the 2D galaxy starmap or minimap including hyperspace lanes, faction territories, and route plots.
 * @param {Record<string, any>} G Game state object
 * @param {CanvasRenderingContext2D} ctx Starmap canvas rendering context
 * @param {{ big?: boolean }} [opts={}] Map render options (big: full interactive starmap)
 * @returns {void}
 */
export function galaxy(G, ctx, opts = {}) {
  const W = ctx.canvas.width,
    H = ctx.canvas.height,
    big = !!opts.big;
  ctx.fillStyle = '#02030a';
  ctx.fillRect(0, 0, W, H);
  let V;
  if (big) {
    if (!G.mapView || G.mapView.W !== W || G.mapView.H !== H) {
      const f = mapFit(W, H),
        old = G.mapView;
      G.mapView = Object.assign(old || {}, { W, H, fit: f.fit });
      if (!G.mapView.k) Object.assign(G.mapView, f);
      else if (old.prevFit) G.mapView.k *= f.fit / old.prevFit;
      G.mapView.prevFit = f.fit;
    }
    V = G.mapView;
  } // 1.0.1: keep the zoom when the canvas is resized
  else {
    const here = SYS[G.sys] || SYS_LIST[0];
    V = { cx: here.x, cy: here.y, k: Math.min(W, H) / 560 };
  }
  const P = (s) => [W / 2 + (s.x - V.cx) * V.k, H / 2 + (s.y - V.cy) * V.k];
  G[big ? 'mapXform' : 'miniXform'] = { cx: V.cx, cy: V.cy, k: V.k, W, H };
  const explored = new Set((G.you && G.you.explored) || []),
    zoom = big ? V.k / V.fit : 3;
  const on = (x, y, m = 40) => x > -m && y > -m && x < W + m && y < H + m;
  // territory shading
  ctx.globalCompositeOperation = 'lighter';
  if ((G.mapMode || 'factions') === 'factions' || !big)
    for (const s of SYS_LIST) {
      const F = FACTIONS[s.faction];
      if (F.region && s.faction !== 'deep') continue;
      const [x, y] = P(s);
      if (!on(x, y, 120 * V.k)) continue;
      const r = 95 * V.k;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r),
        c = hexToRgb(F.color);
      g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.10)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  ctx.globalCompositeOperation = 'source-over';
  // routes
  ctx.lineWidth = 1;
  for (const s of SYS_LIST)
    for (const l of s.links)
      if (l > s.id) {
        const [a, b] = P(s),
          [c, d] = P(SYS[l]);
        if (!on(a, b, 400) && !on(c, d, 400)) continue;
        const known = explored.has(s.id) || explored.has(l);
        ctx.strokeStyle = known ? '#34405a' : '#1c2232';
        ctx.beginPath();
        ctx.moveTo(a, b);
        ctx.lineTo(c, d);
        ctx.stroke();
      }
  // the Sol Gateway: a dashed, glowing link between Sol and the far mouth
  for (const s of SYS_LIST)
    if (s.gate && s.id < s.gate) {
      const [a, b] = P(s),
        [c, d] = P(SYS[s.gate]);
      ctx.strokeStyle = 'rgba(154,200,255,.55)';
      ctx.lineWidth = big ? 2 : 1.5;
      ctx.setLineDash([3, 6]);
      ctx.beginPath();
      ctx.moveTo(a, b);
      ctx.quadraticCurveTo((a + c) / 2 - (d - b) * 0.15, (b + d) / 2 + (c - a) * 0.15, c, d);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  const route = G.route || [];
  if (route.length && SYS[G.sys]) {
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = big ? 2.5 : 2;
    ctx.beginPath();
    let [a, b] = P(SYS[G.sys]);
    ctx.moveTo(a, b);
    for (const r of route) {
      [a, b] = P(SYS[r]);
      ctx.lineTo(a, b);
    }
    ctx.stroke();
  }
  const onRoute = new Set(route),
    sites = G.sites || {},
    myStSys =
      G.you &&
      G.you.station &&
      G.you.station.claimed &&
      G.you.station.site &&
      STELLARS[G.you.station.site]
        ? STELLARS[G.you.station.site].system
        : null;
  const allySys = {};
  for (const m of (G.you && G.you.armada && G.you.armada.members) || [])
    if (m.sysId && m.name !== G.myName) (allySys[m.sysId] = allySys[m.sysId] || []).push(m.name); // 2.6: where your Armada is
  for (const s of SYS_LIST) {
    const [x, y] = P(s);
    if (!on(x, y)) continue;
    const F = FACTIONS[s.faction],
      here = s.id === G.sys,
      seen = explored.has(s.id) || !G.you,
      r = big ? Math.max(3, Math.min(8, 3.2 * Math.sqrt(zoom))) : 4;
    if (seen || (big && G.mapMode && G.mapMode !== 'factions')) {
      ctx.fillStyle = big ? viewColor(G, s, seen) : F.color;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 6.283);
      ctx.fill();
    } else {
      ctx.strokeStyle = F.color;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, r - 0.5, 0, 6.283);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const site = s.stellars.find((p) => p.site);
    if (site && (big ? zoom > 0.9 : true)) {
      const own = sites[site.id];
      ctx.fillStyle = own ? '#c0a0ff' : '#8a70b0';
      const q = r + 2;
      ctx.beginPath();
      ctx.moveTo(x + q + 4, y - q);
      ctx.lineTo(x + q + 7, y - q + 3);
      ctx.lineTo(x + q + 4, y - q + 6);
      ctx.lineTo(x + q + 1, y - q + 3);
      ctx.fill();
    }
    if (myStSys === s.id) {
      // 2.5.2: your Personal Station: a gold station mark with its Ops level
      const q = r + 9,
        pulse2 = 0.6 + 0.4 * Math.sin(performance.now() / 500);
      ctx.strokeStyle = `rgba(255,210,110,${0.75 + 0.25 * pulse2})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, q, 0, 6.283);
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * (q - 3), y + Math.sin(a) * (q - 3));
        ctx.lineTo(x + Math.cos(a) * (q + 4), y + Math.sin(a) * (q + 4));
        ctx.stroke();
      }
      if (big) {
        ctx.font = 'bold 11px Tahoma';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#02030a';
        const t = `YOUR STATION · OPS ${(G.you.station && G.you.station.ops) || 0}`;
        ctx.strokeText(t, x, y - q - 6);
        ctx.fillStyle = '#ffd27a';
        ctx.fillText(t, x, y - q - 6);
      }
    }
    if (allySys[s.id]) {
      ctx.fillStyle = G.pal.ally;
      for (let k = 0; k < Math.min(5, allySys[s.id].length); k++) {
        ctx.beginPath();
        ctx.arc(x - r - 4 - k * 6, y + r + 3, 2.6, 0, 6.283);
        ctx.fill();
      }
      if (big && zoom > 0.8) {
        ctx.font = '10px Tahoma';
        ctx.textAlign = 'right';
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#02030a';
        const t = allySys[s.id].join(', ');
        ctx.strokeText(t, x - r - 4, y + r + 15);
        ctx.fillText(t, x - r - 4, y + r + 15);
      }
    }
    if (here) {
      ctx.strokeStyle = '#ff3a2a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r + 5, 0, 6.283);
      ctx.stroke();
    }
    if (G.hoverSys === s.id) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, r + 3, 0, 6.283);
      ctx.stroke();
    }
    const label =
      here ||
      G.hoverSys === s.id ||
      onRoute.has(s.id) ||
      (big
        ? zoom > 1.6 || (s.anchor && zoom > 0.95)
        : SYS[G.sys] && SYS[G.sys].links.includes(s.id));
    if (label) {
      ctx.font = (big ? (here || s.anchor ? 'bold 12px' : '11px') : '9px') + ' Tahoma';
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#02030a';
      ctx.strokeText(s.name, x, y - r - 5);
      ctx.fillStyle = here ? '#fff' : seen ? '#c8ccd8' : '#80869a';
      ctx.fillText(s.name, x, y - r - 5);
    }
  }
  // 0.6 overlays: the invasion, anomalies (2.6: territory claims removed)
  const Wd = G.world || {},
    pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
  for (const [sid, an] of Object.entries(Wd.anomalies || {})) {
    const S_ = SYS[sid],
      A_ = ANOMALIES[an];
    if (!S_ || !A_) continue;
    const [x, y] = P(S_);
    if (!on(x, y)) continue;
    ctx.font = (big ? 'bold 13px' : '10px') + ' Tahoma';
    ctx.textAlign = 'center';
    ctx.fillStyle = A_.color;
    ctx.fillText(A_.icon, x + (big ? 12 : 8), y + (big ? 4 : 3));
  }
  for (const [sid, st] of Object.entries(Wd.states || {})) {
    const S_ = SYS[sid],
      X = STATES[st.k];
    if (!S_ || !X) continue;
    const [x, y] = P(S_);
    if (!on(x, y)) continue; // 2.4: system states
    ctx.strokeStyle = X.color + 'aa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, big ? 10 : 7, 0, 6.283);
    ctx.stroke();
    if (big) {
      ctx.font = '12px Tahoma';
      ctx.textAlign = 'center';
      ctx.fillText(X.icon, x - 13, y + 4);
    }
  }
  if (Wd.invasion && SYS[Wd.invasion.sys]) {
    const [x, y] = P(SYS[Wd.invasion.sys]);
    ctx.strokeStyle = `rgba(255,60,40,${0.4 + 0.6 * pulse})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, (big ? 14 : 9) + pulse * 5, 0, 6.283);
    ctx.stroke();
    if (big) {
      ctx.font = 'bold 11px Tahoma';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5a40';
      ctx.fillText('INVASION', x, y + 30);
    }
  }
  // 1.0.1: active mission targets (gold diamond and ring; the main story is brighter)
  for (const t of missionTargets(G)) {
    const S_ = t.sys && SYS[t.sys];
    if (!S_) continue;
    const [x, y] = P(S_);
    if (!on(x, y)) continue;
    const q = (big ? 9 : 7) + pulse * 3,
      col = t.kind === 'story' ? '255,214,90' : '255,190,110';
    ctx.strokeStyle = `rgba(${col},${0.55 + 0.45 * pulse})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - q);
    ctx.lineTo(x + q, y);
    ctx.lineTo(x, y + q);
    ctx.lineTo(x - q, y);
    ctx.closePath();
    ctx.stroke();
    if (big) {
      const lab = t.kind === 'story' ? '★ ' + t.title : '◆ ' + t.title;
      ctx.font = 'bold 11px Tahoma';
      ctx.textAlign = 'left';
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#02030a';
      ctx.strokeText(lab.length > 38 ? lab.slice(0, 36) + '…' : lab, x + q + 4, y + 4);
      ctx.fillStyle = `rgb(${col})`;
      ctx.fillText(lab.length > 38 ? lab.slice(0, 36) + '…' : lab, x + q + 4, y + 4);
    }
  }
  if (big) {
    const ch = SYS.coldharbor;
    if (ch) {
      const [x, y] = P(ch);
      ctx.font = 'italic 12px Tahoma';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(216,200,144,.55)';
      ctx.fillText('beyond the Gateway', x - 20 * V.k, y + 50 * V.k + 14);
    }
  }
  if (big && G.mapLegend === false) return; // 2.4: the legend can be hidden
  if (big) {
    ctx.fillStyle = 'rgba(2,3,10,.82)';
    ctx.fillRect(0, H - (G.mapMode && G.mapMode !== 'factions' ? 26 : 42), W, 42);
  } // a backing strip so the legend never sits on top of system names
  if (big && G.mapMode && G.mapMode !== 'factions') {
    // legend for the alternative views
    const L =
      {
        trade: [
          [
            '#3ce66e',
            `cheap ${(COMMODITIES.find((c) => c.id === (G.mapCid || 'food')) || {}).name || ''}`,
          ],
          ['#f0dc5a', 'average'],
          ['#ff503c', 'expensive'],
          ['#3a3e48', 'no market'],
        ],
        services: [
          ['#5ab0ff', 'shipyard'],
          ['#ffaa4a', 'outfitter'],
          ['#c38aff', 'both'],
          ['#3a3e48', 'neither'],
        ],
        standing: [
          ['#3ce66e', 'liked'],
          ['#c8c878', 'neutral'],
          ['#ff3c32', 'hated'],
          ['#5a5e68', 'no power'],
        ],
        danger: [
          ['#5ac878', 'safe'],
          ['#ff3228', 'deadly'],
        ],
      }[G.mapMode] || [];
    let lx = 12,
      ly = H - 14;
    ctx.font = '11px Tahoma';
    ctx.textAlign = 'left';
    for (const [c, n] of L) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(lx + 4, ly - 4, 4, 0, 6.283);
      ctx.fill();
      ctx.fillStyle = '#aaa';
      ctx.fillText(n, lx + 12, ly);
      lx += ctx.measureText(n).width + 30;
    }
    ctx.fillStyle = '#666';
    ctx.fillText('unvisited systems show grey', lx, ly);
  } else if (big) {
    // legend
    let lx = 12,
      ly = H - 14;
    ctx.font = '11px Tahoma';
    ctx.textAlign = 'left';
    for (const [id, F] of Object.entries(FACTIONS)) {
      if (F.hidden) continue;
      ctx.fillStyle = F.color;
      ctx.fillRect(lx, ly - 8, 8, 8);
      ctx.fillStyle = '#aaa';
      ctx.fillText(F.short, lx + 12, ly);
      lx += ctx.measureText(F.short).width + 26;
    }
    ctx.strokeStyle = '#aaa';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(lx + 4, ly - 4, 3.5, 0, 6.283);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.fillText('not yet visited', lx + 12, ly);
    lx = 12;
    ly -= 16;
    ctx.fillStyle = '#ffd65a';
    ctx.fillText('◇ mission target', lx, ly);
    lx += 100;
    ctx.fillStyle = '#ffd27a';
    ctx.fillText('◎ your station', lx, ly);
    lx += 92;
    ctx.fillStyle = '#a890d0';
    ctx.fillText('◆ station hull', lx, ly);
    lx += 90;
    if (!G.solo && G.you && G.you.armada && G.you.armada.members) {
      ctx.fillStyle = G.pal.ally;
      ctx.fillText('● Armada member', lx, ly);
      lx += 104;
    }
    ctx.fillStyle = '#ff5a40';
    ctx.fillText('◯ invasion', lx, ly);
    lx += 70; // 2.4: no fleet claims in solo
    for (const A_ of Object.values(ANOMALIES)) {
      ctx.fillStyle = A_.color;
      ctx.fillText(`${A_.icon} ${A_.name}`, lx, ly);
      lx += ctx.measureText(`${A_.icon} ${A_.name}`).width + 14;
    }
  }
}
/**
 * Tests for system click selection hit at given screen coordinates on galaxy map or minimap.
 * @param {Record<string, any>} G Game state
 * @param {number} mx Screen X coordinate
 * @param {number} my Screen Y coordinate
 * @param {boolean} [mini] Whether testing against companion minimap
 * @returns {string | null} Hit solar system ID or null
 */
export function mapHit(G, mx, my, mini) {
  const t = mini ? G.miniXform : G.mapXform;
  if (!t) return null;
  let best = null,
    bd = 14;
  for (const s of SYS_LIST) {
    const x = t.W / 2 + (s.x - t.cx) * t.k,
      y = t.H / 2 + (s.y - t.cy) * t.k,
      d = Math.hypot(mx - x, my - y);
    if (d < bd) {
      bd = d;
      best = s.id;
    }
  }
  return best;
}
/**
 * Retrieves active salvage mission beacon world coordinates in current system.
 * @param {Record<string, any>} G Game state
 * @returns {Array<[number, number]>} Array of salvage point world coordinates [x, y]
 */
export function salvagePoints(G) {
  const out = [];
  for (const m of (G.you && G.you.missions) || [])
    if (m.type === 'salvage' && m.sys === G.sys && !m.done && m.point) out.push(m.point);
  return out;
}
/**
 * Retrieves unvisited planetary survey beacon coordinates for active missions in current system.
 * @param {Record<string, any>} G Game state
 * @returns {Array<[number, number]>} Array of survey point world coordinates [x, y]
 */
export function surveyPoints(G) {
  const out = [];
  if (!G.you) return out;
  for (const m of G.you.missions || [])
    if (m.type === 'survey' && m.sys === G.sys && !m.done)
      m.points.forEach((p, i) => {
        if (!(m.seen || []).includes(i)) out.push(p);
      });
  return out;
}
export { FAC };
