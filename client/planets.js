// 1.0.1: procedural planets. Each world gets a seamless surface texture built from 3D noise sampled on the sphere,
// chosen by type (from its description and colour), then is drawn as a lit sphere that slowly turns, with drifting
// clouds, night-side city lights or lava glow, an atmosphere rim and, for some giants, rings.
// planetSprite(p, now) -> { canvas, scale }: scale is world units per canvas pixel.

const TW = 512,
  TH = 256;

// ---------------------------------------------------------------- noise
function hash3(x, y, z, s) {
  let h =
    Math.imul(x, 374761393) ^
    Math.imul(y, 668265263) ^
    Math.imul(z, 1274126177) ^
    Math.imul(s, 144665);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
}
function vnoise(x, y, z, s) {
  const xi = Math.floor(x),
    yi = Math.floor(y),
    zi = Math.floor(z),
    xf = x - xi,
    yf = y - yi,
    zf = z - zi;
  const u = xf * xf * (3 - 2 * xf),
    v = yf * yf * (3 - 2 * yf),
    w = zf * zf * (3 - 2 * zf);
  const c = (a, b, d) => hash3(xi + a, yi + b, zi + d, s);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * u,
    x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * u;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * u,
    x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * u;
  const y0 = x00 + (x10 - x00) * v,
    y1 = x01 + (x11 - x01) * v;
  return y0 + (y1 - y0) * w;
}
function fbm(x, y, z, s, oct = 5) {
  let a = 0.5,
    f = 1,
    t = 0,
    n = 0;
  for (let o = 0; o < oct; o++) {
    t += a * vnoise(x * f, y * f, z * f, s + o * 31);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return t / n;
}
const ridge = (x, y, z, s, oct = 4) => {
  let a = 0.5,
    f = 1,
    t = 0,
    n = 0;
  for (let o = 0; o < oct; o++) {
    t += a * (1 - Math.abs(vnoise(x * f, y * f, z * f, s + o * 17) * 2 - 1));
    n += a;
    a *= 0.5;
    f *= 2.1;
  }
  return t / n;
};
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
function hashStr(t) {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const lift = (c, k) => [c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k];
function hexToRgb(h) {
  const n = parseInt((h || '#888').slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function hsl(c) {
  const r = c[0] / 255,
    g = c[1] / 255,
    b = c[2] / 255,
    mx = Math.max(r, g, b),
    mn = Math.min(r, g, b),
    l = (mx + mn) / 2,
    d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s, l];
}

// ---------------------------------------------------------------- what kind of world is it?
export function planetType(p) {
  if (p.id === 'earth') return 'earth';
  if (p.id === 'luna') return 'barren';
  const d = (p.desc || '').toLowerCase() + ' ' + (p.name || '').toLowerCase(),
    rnd = seeded(hashStr(p.id + 't'));
  const has = (...w) => w.some((x) => d.includes(x));
  if (has('volcan', 'lava', 'molten', 'magma', 'forge', 'smelt')) return 'lava';
  if (has('gas giant', 'giant', 'storm', 'rings', 'ring ')) return 'gas';
  if (has('crystal', 'glass')) return 'crystal';
  if (has('ice', 'frozen', 'snow', 'glacier', 'tundra')) return 'ice';
  if (has('desert', 'dune', 'sand', 'dust')) return 'desert';
  if (has('ocean', 'water', 'sea ', 'seas', 'reef', 'island')) return 'ocean';
  if (has('jungle', 'garden', 'farm', 'forest', 'orchard', 'green')) return 'terran';
  if (has('toxic', 'acid', 'poison', 'swamp')) return 'toxic';
  if (has('dead', 'barren', 'airless', 'mine', 'rock')) return 'barren';
  if (p.kind === 'moon') return rnd() < 0.3 ? 'ice' : 'barren';
  const [h, s, l] = hsl(hexToRgb(p.color));
  if (p.r >= 160 && rnd() < 0.6) return 'gas';
  if (s < 0.18) return l > 0.6 ? 'ice' : 'barren';
  if (h >= 180 && h < 250) return rnd() < 0.75 ? 'ocean' : 'ice';
  if (h >= 80 && h < 180) return rnd() < 0.7 ? 'terran' : 'toxic';
  if (h >= 250 && h < 330) return rnd() < 0.6 ? 'gas' : 'crystal';
  if (h < 20 || h >= 330) return rnd() < 0.55 ? 'lava' : 'desert';
  return rnd() < 0.7 ? 'desert' : 'gas';
}

// ---------------------------------------------------------------- surface textures
// returns { col: Uint8ClampedArray(TW*TH*3), emis: Uint8Array (night lights / glow), cloud: Uint8Array|null, atm: [r,g,b]|null, rings, spin }
function* buildTexture(p, type) {
  // a generator: yields every few rows so building never stalls a frame
  const seed = hashStr(p.id) & 0xffff,
    rnd = seeded(hashStr(p.id) ^ 0x9e3779b9),
    base = hexToRgb(p.color || '#888');
  const col = new Uint8ClampedArray(TW * TH * 3),
    emis = new Uint8Array(TW * TH);
  let cloud = null;
  const inhabited =
    /L/.test(p.svc || '') && (p.tech || 0) >= 2 && type !== 'gas' && type !== 'lava';
  const craters = [];
  if (type === 'barren' || type === 'desert' || type === 'ice')
    for (let i = 0; i < (type === 'barren' ? 46 : 14); i++) {
      const z = rnd() * 2 - 1,
        a = rnd() * 6.283,
        q = Math.sqrt(1 - z * z);
      craters.push([
        q * Math.cos(a),
        q * Math.sin(a),
        z,
        0.03 + Math.pow(rnd(), 2.5) * (type === 'barren' ? 0.28 : 0.14),
      ]);
    }
  const storms = [];
  if (type === 'gas')
    for (let i = 0; i < 1 + ((rnd() * 3) | 0); i++)
      storms.push([rnd() * 6.283, (rnd() - 0.5) * 1.6, 0.12 + rnd() * 0.22, rnd()]);
  const sea = type === 'earth' ? 0.53 : type === 'ocean' ? 0.6 : 0.47;
  // palettes, built around the planet's own colour
  const P = {
    deep: type === 'earth' ? [14, 38, 92] : shade(mix(base, [20, 60, 140], 0.5), 0.45),
    shallow: type === 'earth' ? [40, 110, 170] : mix(base, [60, 150, 200], 0.35),
    low:
      type === 'earth'
        ? [70, 120, 50]
        : type === 'terran'
          ? mix(base, [60, 130, 50], 0.5)
          : mix([180, 160, 110], base, 0.3),
    high: type === 'earth' ? [130, 110, 75] : mix(base, [120, 100, 80], 0.6),
    peak: [235, 235, 240],
  };
  const g1 = lift(base, 0.25),
    g2 = shade(base, 0.55),
    g3 = mix(base, [240, 220, 190], 0.5),
    g4 = mix(base, [120, 60, 40], 0.4); // gas bands
  const spinLon = rnd() * 6.283,
    bands = 5 + rnd() * 9;
  for (let j = 0; j < TH; j++) {
    const lat = (0.5 - (j + 0.5) / TH) * Math.PI,
      cl = Math.cos(lat),
      sl = Math.sin(lat);
    for (let i = 0; i < TW; i++) {
      const lon = (i / TW) * Math.PI * 2,
        x = cl * Math.cos(lon),
        y = cl * Math.sin(lon),
        z = sl,
        k = j * TW + i;
      let c,
        e = 0;
      if (type === 'gas') {
        const warp = fbm(x * 2.2, y * 2.2, z * 2.2, seed, 4) - 0.5,
          v = (z + warp * 0.35) * bands,
          t = 0.5 + 0.5 * Math.sin(v * Math.PI + fbm(x * 6, y * 6, z * 6, seed + 9, 3) * 2.5);
        c = mix(mix(g2, g1, t), t > 0.55 ? g3 : g4, 0.35 * Math.abs(Math.sin(v * 0.7)));
        c = shade(c, 0.85 + 0.3 * fbm(x * 14, y * 3, z * 14, seed + 4, 3));
        for (const [sl0, sz0, sr, st] of storms) {
          // oval storms
          let dl = lon - sl0;
          dl = Math.atan2(Math.sin(dl), Math.cos(dl));
          const dd = Math.hypot(dl / (sr * 1.8), (lat - sz0) / sr);
          if (dd < 1) {
            const sw = 0.5 + 0.5 * Math.sin(dd * 9 - Math.atan2(lat - sz0, dl) * 2);
            c = mix(
              c,
              mix(st > 0.5 ? [230, 140, 90] : lift(base, 0.5), shade(base, 0.5), sw * 0.5),
              smooth(1, 0.6, dd),
            );
          }
        }
      } else {
        const h = fbm(x * 1.6, y * 1.6, z * 1.6, seed, 6),
          dt = fbm(x * 9, y * 9, z * 9, seed + 77, 3);
        if (type === 'earth' || type === 'ocean' || type === 'terran') {
          if (h < sea + 0.012) {
            c = mix(P.deep, P.shallow, smooth(sea - 0.16, sea, h));
            if (h > sea) c = mix(c, [196, 182, 130], (h - sea) / 0.012);
          } else {
            const t = (h - sea) / (1 - sea);
            c =
              t < 0.12
                ? mix([196, 182, 130], P.low, t / 0.12)
                : t < 0.5
                  ? mix(P.low, P.high, (t - 0.12) / 0.38)
                  : mix(P.high, P.peak, smooth(0.62, 0.9, t));
            c = shade(c, 0.82 + 0.36 * dt);
            if (inhabited && dt > 0.58 && t < 0.45)
              e =
                clamp((dt - 0.58) * 6) *
                255 *
                (0.4 + 0.6 * vnoise(x * 60, y * 60, z * 60, seed + 5));
          }
          const cap = Math.abs(lat) + (h - 0.5) * 0.5;
          if (cap > 1.22) c = mix(c, [236, 242, 250], smooth(1.22, 1.32, cap));
        } else if (type === 'desert') {
          const dune =
            0.5 + 0.5 * Math.sin(lon * 22 + lat * 9 + fbm(x * 4, y * 4, z * 4, seed + 3, 3) * 9);
          c = mix(shade(base, 0.6), lift(base, 0.25), h * 0.8 + dune * 0.25);
          c = shade(c, 0.85 + 0.3 * dt);
          if (inhabited && dt > 0.66) e = clamp((dt - 0.66) * 7) * 200;
        } else if (type === 'ice') {
          const cr = ridge(x * 4, y * 4, z * 4, seed + 11, 3),
            cr2 = ridge(x * 11, y * 11, z * 11, seed + 12, 2);
          c = mix(
            mix(lift(mix(base, [170, 205, 240], 0.6), 0.2), [240, 247, 255], h),
            shade(mix(base, [190, 215, 240], 0.7), 0.9),
            0.35 * dt,
          );
          const crack = Math.max(smooth(0.9, 0.97, cr), 0.6 * smooth(0.93, 0.99, cr2));
          if (crack > 0) c = mix(c, mix(base, [90, 140, 190], 0.6), crack * 0.75);
        } else if (type === 'lava') {
          const cr = ridge(x * 2.6, y * 2.6, z * 2.6, seed + 13, 5);
          c = shade(mix(base, [50, 40, 38], 0.75), 0.5 + 0.6 * h);
          const hot = smooth(0.82, 0.95, cr);
          if (hot > 0) {
            c = mix(c, [255, 120 + 100 * hot, 30], hot);
            e = hot * 255;
          }
        } else if (type === 'toxic') {
          c = mix(
            shade(mix(base, [150, 170, 40], 0.4), 0.55),
            lift(mix(base, [200, 210, 80], 0.3), 0.15),
            h,
          );
          c = shade(c, 0.8 + 0.4 * dt);
        } else if (type === 'crystal') {
          const f = vnoise(x * 26, y * 26, z * 26, seed + 21),
            cr = ridge(x * 5, y * 5, z * 5, seed + 23, 3);
          c = mix(mix(lift(base, 0.35), [230, 235, 255], 0.3), shade(base, 0.6), h);
          if (cr > 0.8) c = lift(c, 0.4 * smooth(0.8, 0.95, cr));
          if (f > 0.9) e = (f - 0.9) * 2550;
        } else {
          // barren
          c = mix(
            shade(mix(base, [128, 124, 120], 0.6), 0.5),
            lift(mix(base, [150, 146, 140], 0.6), 0.2),
            h,
          );
          c = shade(c, 0.8 + 0.4 * dt);
        }
        for (const [cx, cy, cz, cr] of craters) {
          // impact craters: dark floor, bright rim
          const dd = Math.acos(clamp(x * cx + y * cy + z * cz, -1, 1)) / cr;
          if (dd < 1.15) {
            c = dd < 0.85 ? shade(c, 0.72 + 0.2 * dd) : lift(c, 0.25 * smooth(1.15, 0.9, dd));
          }
        }
      }
      col[k * 3] = c[0];
      col[k * 3 + 1] = c[1];
      col[k * 3 + 2] = c[2];
      emis[k] = e;
    }
    if (j % 3 === 2) yield;
  }
  if (
    type === 'earth' ||
    type === 'ocean' ||
    type === 'terran' ||
    type === 'toxic' ||
    (type === 'gas' && rnd() < 0.3)
  ) {
    cloud = new Uint8Array(TW * TH);
    const dens = type === 'toxic' ? 0.42 : type === 'gas' ? 0.6 : 0.5;
    for (let j = 0; j < TH; j++) {
      const lat = (0.5 - (j + 0.5) / TH) * Math.PI,
        cl = Math.cos(lat),
        sl = Math.sin(lat);
      for (let i = 0; i < TW; i++) {
        const lon = (i / TW) * Math.PI * 2,
          x = cl * Math.cos(lon),
          y = cl * Math.sin(lon),
          z = sl;
        const w = fbm(x * 2, y * 2, z * 2, seed + 101, 3),
          n = fbm(x * 3.5 + w * 2.2, y * 3.5 + w * 2.2, z * 6, seed + 202, 5);
        cloud[j * TW + i] = clamp((n - dens) * 3.2) * 235;
      }
      if (j % 4 === 3) yield;
    }
  }
  const atm =
    {
      earth: [110, 170, 255],
      ocean: lift(mix(base, [90, 160, 255], 0.5), 0.2),
      terran: [140, 200, 255],
      toxic: [190, 210, 90],
      gas: lift(base, 0.3),
      desert: lift(mix(base, [255, 200, 150], 0.4), 0.2),
      lava: [255, 120, 60],
      ice: [190, 220, 255],
      crystal: lift(base, 0.5),
    }[type] || null;
  const rings =
    type === 'gas' && (rnd() < 0.55 || /ring/.test((p.desc || '').toLowerCase()))
      ? {
          tilt: 0.18 + rnd() * 0.2,
          rot: (rnd() - 0.5) * 0.5,
          inner: 1.3 + rnd() * 0.15,
          outer: 1.9 + rnd() * 0.4,
          col: mix(lift(base, 0.35), [220, 205, 170], 0.5),
          seed,
        }
      : null;
  const period = type === 'gas' ? 140 + rnd() * 80 : 200 + rnd() * 220; // seconds per turn
  return {
    col,
    emis,
    cloud,
    atm,
    rings,
    spin: TW / period,
    cspin: (TW / period) * (0.6 + rnd() * 0.8),
    tilt: (rnd() - 0.5) * 0.5,
    spinLon,
  };
}

// ---------------------------------------------------------------- the sphere
const L = (() => {
  const v = [-0.55, -0.48, 0.68],
    n = Math.hypot(...v);
  return v.map((x) => x / n);
})(); // light from the upper left
const cache = new Map(),
  building = new Map();
let workT = 0,
  workMs = 0;
function* setup(p, T, type) {
  const D = Math.max(64, Math.min(320, Math.round(p.r * 2))),
    R = D / 2,
    pad = T.rings ? Math.ceil(R * (T.rings.outer + 0.15)) : Math.ceil(R * 1.22);
  const S = pad * 2,
    n = D * D,
    lu = new Int16Array(n),
    lv = new Int16Array(n),
    ls = new Float32Array(n),
    la = new Uint8Array(n),
    lf = new Float32Array(n),
    ln = new Float32Array(n);
  const ct = Math.cos(T.tilt),
    st = Math.sin(T.tilt);
  for (let py = 0; py < D; py++) {
    if (py % 12 === 11) yield;
    for (let px = 0; px < D; px++) {
      const k = py * D + px,
        x = (px + 0.5 - R) / R,
        y = (py + 0.5 - R) / R,
        rr = x * x + y * y;
      if (rr >= 1.0) {
        la[k] = 0;
        continue;
      }
      const z = Math.sqrt(1 - rr),
        lam = x * L[0] + y * L[1] + z * L[2];
      const xr = x * ct - y * st,
        yr = x * st + y * ct; // axial tilt
      const lat = Math.asin(clamp(-yr, -1, 1)),
        lon = Math.atan2(xr, z);
      lu[k] = Math.floor((lon / (Math.PI * 2) + 1) * TW) % TW;
      lv[k] = Math.min(TH - 1, Math.floor((0.5 - lat / Math.PI) * TH));
      ls[k] = lam;
      lf[k] = Math.pow(1 - z, 2.2);
      ln[k] = smooth(0.12, -0.18, lam); // fresnel rim, night mask
      la[k] = Math.round(clamp((1 - Math.sqrt(rr)) * R * 1.4) * 255);
    }
  }
  yield;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const disk = document.createElement('canvas');
  disk.width = disk.height = D;
  const dctx = disk.getContext('2d'),
    img = dctx.createImageData(D, D);
  // static layers: atmosphere halo and rings (back and front halves)
  const halo = document.createElement('canvas');
  halo.width = halo.height = S;
  if (T.atm) {
    const h = halo.getContext('2d'),
      gr = h.createRadialGradient(S / 2, S / 2, R * 0.92, S / 2, S / 2, R * 1.2),
      a = T.atm;
    gr.addColorStop(0, `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},0.55)`);
    gr.addColorStop(0.35, `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},0.18)`);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    h.fillStyle = gr;
    h.beginPath();
    h.arc(S / 2, S / 2, R * 1.22, 0, 6.283);
    h.fill();
  }
  yield;
  let ringBack = null,
    ringFront = null;
  if (T.rings) {
    const rg = T.rings,
      mk = (front) => {
        const c = document.createElement('canvas');
        c.width = c.height = S;
        const g = c.getContext('2d');
        g.translate(S / 2, S / 2);
        g.rotate(rg.rot);
        g.beginPath();
        front ? g.rect(-S, 0, S * 2, S) : g.rect(-S, -S, S * 2, S);
        g.clip();
        g.scale(1, rg.tilt);
        const rs = seeded(rg.seed + 7);
        for (let r = rg.inner; r < rg.outer; r += 0.012) {
          const band = rs();
          if (band < 0.12) continue;
          g.beginPath();
          g.arc(0, 0, R * r, 0, 6.283);
          g.lineWidth = ((R * 0.014) / rg.tilt) * rg.tilt + 1.2;
          g.strokeStyle = `rgba(${rg.col[0] | 0},${rg.col[1] | 0},${rg.col[2] | 0},${(0.18 + band * 0.5) * (1 - Math.abs((r - rg.inner) / (rg.outer - rg.inner) - 0.45))})`;
          g.stroke();
        }
        return c;
      };
    yield;
    ringBack = mk(false);
    yield;
    ringFront = mk(true);
  }
  const P = {
    type,
    T,
    D,
    R,
    S,
    lu,
    lv,
    ls,
    la,
    lf,
    ln,
    canvas,
    ctx: canvas.getContext('2d'),
    disk,
    dctx,
    img,
    halo,
    ringBack,
    ringFront,
    scale: p.r / R,
    lastU: -1,
    lastC: -1,
    fresh: true,
  };
  cache.set(p.id, P);
  return P;
}
// spend at most ~8 ms a frame (across all planets) building textures; until then the caller draws its old placeholder
function advance(p, now) {
  let b = building.get(p.id);
  if (!b) {
    const type = planetType(p);
    b = {
      type,
      gen: (function* () {
        const T = yield* buildTexture(p, type);
        return yield* setup(p, T, type);
      })(),
    };
    building.set(p.id, b);
  }
  if (now !== workT) {
    workT = now;
    workMs = 0;
  }
  const t0 = performance.now();
  while (workMs + (performance.now() - t0) < 8) {
    const r = b.gen.next();
    if (r.done) {
      building.delete(p.id);
      workMs += performance.now() - t0;
      return r.value;
    }
  }
  workMs += performance.now() - t0;
  return null;
}
function renderDisk(P, ru, rc) {
  const { D, lu, lv, ls, la, lf, ln, T, img } = P,
    d = img.data,
    col = T.col,
    emis = T.emis,
    cl = T.cloud,
    atm = T.atm || [0, 0, 0],
    n = D * D;
  for (let k = 0; k < n; k++) {
    const a = la[k];
    const o = k * 4;
    if (!a) {
      d[o + 3] = 0;
      continue;
    }
    const v = lv[k] * TW,
      ti = v + ((lu[k] + ru) % TW),
      lam = ls[k],
      day = lam > 0 ? 0.08 + 0.92 * Math.pow(lam, 0.85) : 0.08 * (1 + lam),
      f = lf[k];
    let r = col[ti * 3] * day,
      g = col[ti * 3 + 1] * day,
      b = col[ti * 3 + 2] * day;
    const e = emis[ti];
    if (e) {
      const night = P.type === 'lava' || P.type === 'crystal' ? 0.45 + 0.55 * ln[k] : ln[k];
      const ek = (e / 255) * night;
      r += 255 * ek;
      g += (P.type === 'lava' ? 140 : 205) * ek;
      b += (P.type === 'lava' ? 40 : P.type === 'crystal' ? 255 : 120) * ek;
    }
    if (cl) {
      const ca = cl[v + ((lu[k] + rc) % TW)] / 255;
      if (ca) {
        const cd = 0.1 + 0.95 * Math.max(0, lam);
        r = r * (1 - ca) + 245 * cd * ca;
        g = g * (1 - ca) + 247 * cd * ca;
        b = b * (1 - ca) + 252 * cd * ca;
      }
    }
    if (T.atm) {
      const rim = f * (0.35 + Math.max(0, lam) * 0.9);
      r += atm[0] * rim;
      g += atm[1] * rim;
      b += atm[2] * rim;
    }
    d[o] = r;
    d[o + 1] = g;
    d[o + 2] = b;
    d[o + 3] = a;
  }
  P.dctx.putImageData(img, 0, 0);
  const c = P.ctx,
    S = P.S;
  c.clearRect(0, 0, S, S);
  c.drawImage(P.halo, 0, 0);
  if (P.ringBack) c.drawImage(P.ringBack, 0, 0);
  c.drawImage(P.disk, (S - D) / 2, (S - D) / 2);
  if (P.ringFront) c.drawImage(P.ringFront, 0, 0);
}
let budget = 0,
  budgetT = 0;
// 2.5: pre-rendered planets (tools/rift_planets.py) in the EV Nova manner. Each world picks the rendered planet of its type
// whose colour is closest to its own; the procedural sphere above stays as the fallback while images load.
let MAN = null;
const imgs = new Map(),
  pick = new Map();
fetch('assets/planets/planets.json')
  .then((r) => r.json())
  .then((j) => {
    MAN = j;
  })
  .catch(() => {
    MAN = {};
  });
const TYPE_POOL = {
  earth: ['earth'],
  terran: ['terran', 'jungle'],
  ocean: ['ocean'],
  desert: ['desert'],
  ice: ['ice'],
  lava: ['lava'],
  barren: ['barren', 'sulfur'],
  gas: ['gas'],
  toxic: ['toxic'],
  crystal: ['crystal'],
};
function chooseRendered(p) {
  if (pick.has(p.id)) return pick.get(p.id);
  if (!MAN) return null;
  let type = planetType(p);
  const d = ((p.desc || '') + ' ' + (p.name || '')).toLowerCase();
  if (
    type === 'terran' &&
    /(city|capital|sprawl|metropol|ecumen|arcolog)/.test(d) &&
    (p.tech || 0) >= 3
  )
    type = 'city';
  const pool = Object.entries(MAN).filter(
    ([, m]) =>
      (type === 'city' ? m.type === 'city' : (TYPE_POOL[type] || [type]).includes(m.type)) &&
      (p.kind !== 'moon' || !m.rings),
  );
  if (!pool.length) {
    pick.set(p.id, null);
    return null;
  }
  const hue = hsl(hexToRgb(p.color))[0],
    hd = (a) => Math.min(Math.abs(a - hue), 360 - Math.abs(a - hue));
  pool.sort((a, b) => hd(a[1].hue) - hd(b[1].hue));
  const h = hashStr(p.id),
    top = pool.slice(0, Math.min(pool.length, p.id.startsWith('bg:') ? 4 : 2));
  const want =
    /ring/.test(d) && type === 'gas'
      ? top.find(([, m]) => m.rings) || top[h % top.length]
      : top[h % top.length];
  const o = { id: want[0], ...want[1] };
  pick.set(p.id, o);
  return o;
}
// 2.5.1: the rendered planets turn. tools/rift_planets.py bakes each world into surface maps (albedo; height, water,
// emissive and cloud), and they are lit here every time the surface turns a texel: bump relief, the soft terminator,
// ocean glint, cloud shadows, night lights and the atmosphere rim, as in the static renders. The halo and the rings are
// fixed layers rendered with the planet (_back and _front).
const TEX = new Map(),
  RCACHE = new Map();
function loadImg(src) {
  const im = new Image();
  im.src = src;
  return im;
}
function texFor(R) {
  let T = TEX.get(R.id);
  if (!T) {
    T = {
      R,
      tex: loadImg(`assets/planets/${R.id}_tex.webp`),
      aux: loadImg(`assets/planets/${R.id}_aux.webp`),
      back: loadImg(`assets/planets/${R.id}_back.webp`),
      front: R.rings ? loadImg(`assets/planets/${R.id}_front.webp`) : null,
      ready: false,
      used: 0,
    };
    TEX.set(R.id, T);
  }
  T.used = performance.now();
  if (!T.ready) {
    const ok = (im) => im && im.complete && im.naturalWidth;
    if (!ok(T.tex) || !ok(T.aux) || !ok(T.back) || (T.front && !ok(T.front))) return null;
    const grab = (im) => {
      const c = document.createElement('canvas');
      c.width = im.naturalWidth;
      c.height = im.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(im, 0, 0);
      return g.getImageData(0, 0, c.width, c.height).data;
    };
    const tw = T.tex.naturalWidth,
      th = T.tex.naturalHeight,
      aw = T.aux.naturalWidth,
      ah = T.aux.naturalHeight / 4,
      td = grab(T.tex),
      sd = grab(T.aux),
      na0 = aw * ah;
    const ad = new Uint8Array(na0 * 4);
    for (let c = 0; c < 4; c++) for (let i = 0; i < na0; i++) ad[i * 4 + c] = sd[(c * na0 + i) * 4]; // the four grey maps, interleaved
    const col = new Uint8Array(tw * th * 3);
    for (let i = 0, n = tw * th; i < n; i++) {
      col[i * 3] = td[i * 4];
      col[i * 3 + 1] = td[i * 4 + 1];
      col[i * 3 + 2] = td[i * 4 + 2];
    }
    const na = aw * ah,
      wat = new Uint8Array(na),
      emi = new Uint8Array(na),
      cld = new Uint8Array(na),
      ge = new Float32Array(na),
      gn = new Float32Array(na),
      rough = R.type === 'barren' || R.type === 'sulfur',
      bk = (R.bk || 0) * (rough ? 0.5 : 0.8),
      gmax = rough ? 0.7 : 0.9;
    for (let j = 0; j < ah; j++) {
      const lat = (0.5 - (j + 0.5) / ah) * Math.PI,
        cl = Math.max(0.15, Math.cos(lat));
      for (let i = 0; i < aw; i++) {
        const k = j * aw + i,
          h = (x, y) => ad[(((y + ah) % ah) * aw + ((x + aw) % aw)) * 4] / 255;
        wat[k] = ad[k * 4 + 1];
        emi[k] = ad[k * 4 + 2];
        cld[k] = ad[k * 4 + 3];
        if (bk) {
          ge[k] = clamp(
            (((h(i + 2, j) - h(i - 2, j)) * aw) / (8 * Math.PI) / cl) * bk,
            -gmax,
            gmax,
          );
          gn[k] = clamp(
            ((-(h(i, Math.min(ah - 1, j + 2)) - h(i, Math.max(0, j - 2))) * ah) / (4 * Math.PI)) *
              bk,
            -gmax,
            gmax,
          );
        }
      }
    }
    Object.assign(T, { tw, th, aw, ah, col, wat, emi, cld, ge, gn, ready: true });
    if (TEX.size > 18) {
      let old = null;
      for (const [k, v] of TEX)
        if (v !== T && (!old || v.used < old.used)) old = [k, v][1] && { k, used: v.used };
      if (old) {
        TEX.delete(old.k);
        for (const [pk, P] of RCACHE) if (P.T.R.id === old.k) RCACHE.delete(pk);
      }
    }
  }
  return T;
}
function setupRendered(p, T) {
  const R = T.R,
    rnd = seeded(hashStr(p.id) ^ 0x51ed),
    D = Math.max(64, Math.min(p.id.startsWith('bg:') ? 200 : 320, Math.round(p.r * 2))),
    Rr = D / 2,
    S = Math.ceil(D / R.r);
  const tilt = R.rings ? 0 : (rnd() - 0.5) * 0.5,
    ct = Math.cos(tilt),
    st = Math.sin(tilt),
    n = D * D;
  const lu = new Float32Array(n),
    lv = new Float32Array(n),
    ls = new Float32Array(n),
    le = new Float32Array(n),
    lnn = new Float32Array(n),
    sp = new Float32Array(n),
    rim = new Float32Array(n),
    lz = new Float32Array(n),
    la = new Uint8Array(n);
  const Hh = [L[0], L[1], L[2] + 1],
    hl = Math.hypot(...Hh);
  Hh[0] /= hl;
  Hh[1] /= hl;
  Hh[2] /= hl;
  for (let py = 0; py < D; py++)
    for (let px = 0; px < D; px++) {
      const k = py * D + px,
        x = (px + 0.5 - Rr) / Rr,
        y = (py + 0.5 - Rr) / Rr,
        rr = x * x + y * y;
      if (rr >= 1) continue;
      const z = Math.sqrt(1 - rr),
        xr = x * ct - y * st,
        yr = x * st + y * ct,
        lat = Math.asin(clamp(-yr, -1, 1)),
        lon = Math.atan2(xr, z);
      lu[k] = (lon / (Math.PI * 2) + 1) % 1;
      lv[k] = clamp(0.5 - lat / Math.PI, 0, 0.9999);
      const sl = Math.sin(lat),
        cl = Math.cos(lat),
        so = Math.sin(lon),
        co = Math.cos(lon);
      const er = [co, 0, -so],
        nr = [-sl * so, -cl, -sl * co]; // east and north in the tilted frame
      const ex = er[0] * ct + er[1] * st,
        ey = -er[0] * st + er[1] * ct,
        nx = nr[0] * ct + nr[1] * st,
        ny = -nr[0] * st + nr[1] * ct;
      ls[k] = x * L[0] + y * L[1] + z * L[2];
      le[k] = ex * L[0] + ey * L[1] + er[2] * L[2];
      lnn[k] = nx * L[0] + ny * L[1] + nr[2] * L[2];
      const sh = Math.max(0, x * Hh[0] + y * Hh[1] + z * Hh[2]);
      sp[k] = Math.pow(sh, 70) * 0.75 + Math.pow(sh, 12) * 0.08;
      rim[k] = Math.pow(1 - z, 2.6) * (R.atmk || 1);
      lz[k] = z;
      la[k] = Math.round(clamp((1 - Math.sqrt(rr)) * Rr * 1.4) * 255);
    }
  const stat = {
    term: new Float32Array(n),
    gasd: new Float32Array(n),
    atmR: new Float32Array(n),
    atmG: new Float32Array(n),
    atmB: new Float32Array(n),
    nightF: new Float32Array(n),
    clL: new Float32Array(n),
  }; // what does not change as it turns
  for (let k = 0; k < n; k++) {
    if (!la[k]) continue;
    const lam = ls[k];
    stat.term[k] = smoothJ(-0.12, 0.35, lam);
    stat.gasd[k] =
      (Math.pow(Math.max(0, lam), 0.8) * 0.95 + 0.03) * (0.55 + 0.45 * Math.pow(lz[k], 0.4));
    if (R.atm) {
      const q = rim[k] * (0.25 + 0.95 * smoothJ(-0.35, 0.5, lam));
      stat.atmR[k] = R.atm[0] * q;
      stat.atmG[k] = R.atm[1] * q;
      stat.atmB[k] = R.atm[2] * q;
    }
    stat.nightF[k] = R.night ? smoothJ(0.15, -0.2, lam) : 0.35 + 0.65 * smoothJ(0.3, -0.2, lam);
    stat.clL[k] = Math.pow(Math.max(0, lam), 0.8) * 0.95 + 0.04;
    sp[k] *= 1;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const disk = document.createElement('canvas');
  disk.width = disk.height = D;
  const dctx = disk.getContext('2d');
  const period = R.gas ? 160 + rnd() * 90 : 230 + rnd() * 200;
  const P = {
    T,
    D,
    S,
    lu,
    lv,
    ls,
    le,
    lnn,
    sp,
    rim,
    lz,
    la,
    canvas,
    ctx: canvas.getContext('2d'),
    disk,
    dctx,
    img: dctx.createImageData(D, D),
    st: stat,
    spin: 1 / period,
    off: rnd(),
    cdrift: (0.04 + rnd() * 0.06) / period,
    scale: p.r / Rr,
    lastU: -1,
    lastC: -1,
    rendered: true,
  };
  RCACHE.set(p.id, P);
  return P;
}
function cloudAt(cld, aw, ah, fu, fv) {
  fv = Math.max(0, Math.min(ah - 1.001, fv));
  const v0 = fv | 0,
    v1 = Math.min(ah - 1, v0 + 1),
    tv = fv - v0,
    fl = Math.floor(fu),
    u0 = ((fl % aw) + aw) % aw,
    u1 = (u0 + 1) % aw,
    tu = fu - fl;
  return (
    ((cld[v0 * aw + u0] * (1 - tu) + cld[v0 * aw + u1] * tu) * (1 - tv) +
      (cld[v1 * aw + u0] * (1 - tu) + cld[v1 * aw + u1] * tu) * tv) /
    255
  );
}
const smoothJ = (a, b, v) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
function renderRendered(P, uOff, cOff) {
  const { T, D, lu, lv, ls, le, lnn, sp, la, img, st } = P,
    R = T.R,
    d = img.data,
    { tw, th, aw, ah, col, wat, emi, cld, ge, gn } = T,
    n = D * D;
  const ec = R.ecol || [255, 200, 120],
    cc = R.cloud || [248, 249, 252],
    gas = R.gas,
    bump = R.bk > 0,
    ush = Math.round(aw * 0.004) + 1;
  const { term, gasd, atmR, atmG, atmB, nightF, clL } = st;
  for (let k = 0; k < n; k++) {
    const a = la[k],
      o = k * 4;
    if (!a) {
      d[o + 3] = 0;
      continue;
    }
    let u = lu[k] + uOff;
    if (u >= 1) u -= 1;
    const vt = lv[k],
      ti = (((vt * th) | 0) * tw + ((u * tw) | 0)) * 3,
      ak = ((vt * ah) | 0) * aw + ((u * aw) | 0),
      lam = ls[k],
      tm = term[k];
    let diff;
    if (gas) diff = gasd[k];
    else {
      let lb = lam;
      if (bump) {
        const g1 = ge[ak],
          g2 = gn[ak];
        if (g1 || g2) lb = (lam - (g1 * le[k] + g2 * lnn[k])) / Math.sqrt(1 + g1 * g1 + g2 * g2);
      }
      diff = (lb > 0 ? lb * (1.08 - 0.08 * lb) : 0) * 0.92 * tm + 0.035 + 0.03 * tm;
    }
    let r = col[ti] * diff,
      g = col[ti + 1] * diff,
      b = col[ti + 2] * diff;
    // clouds and their shadows (bilinear)
    let fv = vt * ah - 0.5;
    if (fv < 0) fv = 0;
    else if (fv > ah - 1.001) fv = ah - 1.001;
    const fu = u * aw - 0.5 + cOff,
      v0 = fv | 0,
      v1 = v0 + 1 < ah ? v0 + 1 : v0,
      tv = fv - v0,
      fl = Math.floor(fu),
      tu = fu - fl;
    let u0 = fl % aw;
    if (u0 < 0) u0 += aw;
    const u1 = u0 + 1 === aw ? 0 : u0 + 1,
      r0 = v0 * aw,
      r1 = v1 * aw;
    const ca =
      ((cld[r0 + u0] * (1 - tu) + cld[r0 + u1] * tu) * (1 - tv) +
        (cld[r1 + u0] * (1 - tu) + cld[r1 + u1] * tu) * tv) *
      0.0039215;
    let sv = v0 - ush;
    if (sv < 0) sv = 0;
    let su = u0 - ush;
    if (su < 0) su += aw;
    const cs = cld[sv * aw + su] * 0.0039215;
    if (cs) {
      const sh = 1 - cs * 0.45 * tm;
      r *= sh;
      g *= sh;
      b *= sh;
    }
    if (ca) {
      const cl = clL[k] * ca,
        ia = 1 - ca;
      r = r * ia + cc[0] * cl;
      g = g * ia + cc[1] * cl;
      b = b * ia + cc[2] * cl;
    }
    const w = wat[ak];
    if (w) {
      const s2 = sp[k] * w * (1 - ca);
      r += s2;
      g += s2 * 0.97;
      b += s2 * 0.9;
    }
    const e = emi[ak];
    if (e) {
      const ek = e * 0.0039215 * nightF[k] * (1 - ca * 0.7),
        hot = ek * ek * 0.5;
      r += (ec[0] + (255 - ec[0]) * hot) * ek;
      g += (ec[1] + (255 - ec[1]) * hot) * ek;
      b += (ec[2] + (255 - ec[2]) * hot) * ek;
    }
    d[o] = r + atmR[k];
    d[o + 1] = g + atmG[k];
    d[o + 2] = b + atmB[k];
    d[o + 3] = a;
  }
  P.dctx.putImageData(img, 0, 0);
  const c = P.ctx,
    S = P.S;
  c.clearRect(0, 0, S, S);
  c.drawImage(T.back, 0, 0, S, S);
  c.drawImage(P.disk, (S - D) / 2, (S - D) / 2);
  if (T.front) c.drawImage(T.front, 0, 0, S, S);
}
export function planetSprite(p, now) {
  const R = chooseRendered(p);
  if (R) {
    let P = RCACHE.get(p.id);
    if (!P) {
      const T = texFor(R);
      if (!T) {
        let im = imgs.get(R.id);
        if (!im) {
          im = loadImg(`assets/planets/${R.id}.webp`);
          imgs.set(R.id, im);
        } // the still render until the maps arrive
        if (im.complete && im.naturalWidth) {
          const S = im.naturalWidth,
            D = R.r * S;
          return { canvas: im, S, D, scale: (2 * p.r) / D };
        }
        return null;
      }
      P = setupRendered(p, T);
    } else texFor(R);
    if (RCACHE.size > 90)
      for (const k of RCACHE.keys()) {
        if (k !== p.id && k.startsWith('bg:')) {
          RCACHE.delete(k);
          break;
        }
      }
    const t = now / 1000,
      uo = (P.off + t * P.spin) % 1,
      ru = Math.floor(uo * P.T.tw),
      rc = Math.floor(t * P.cdrift * P.T.aw) % P.T.aw;
    if (ru !== P.lastU || rc !== P.lastC) {
      if (now - budgetT > 50) {
        budgetT = now;
        budget = 0;
      }
      if (P.lastU < 0 || budget < 2) {
        budget++;
        P.lastU = ru;
        P.lastC = rc;
        renderRendered(P, ru / P.T.tw, rc);
      }
    }
    return P;
  }
  return procSprite(p, now);
}
function procSprite(p, now) {
  const P = cache.get(p.id) || advance(p, now);
  if (!P) return null;
  if (cache.size > 70)
    for (const k of cache.keys()) {
      if (k !== p.id && k.startsWith('bg:')) {
        cache.delete(k);
        break;
      }
    } // 2.4: forget old background worlds
  const ru = Math.floor((P.T.spinLon / 6.283) * TW + (now / 1000) * P.T.spin) % TW,
    rc = Math.floor((now / 1000) * P.T.cspin) % TW;
  if (P.fresh) {
    P.fresh = false;
    return null;
  } // the first render waits for the next frame
  if (ru !== P.lastU || rc !== P.lastC) {
    // re-render only when the surface has turned a texel (a few times a second at most)
    if (now - budgetT > 50) {
      budgetT = now;
      budget = 0;
    }
    if (P.lastU < 0 || budget < 2) {
      budget++;
      P.lastU = ru;
      P.lastC = rc;
      renderDisk(P, ru, rc);
    }
  }
  return P;
}
