// Preserve Luna's original procedural wheel/core, shared by flight and landing.
// Deliberately retains the original color interpretation and seeded details.
const wheels = new Map();
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

/** @param {{id: string, r: number, color?: string}} p */
export function stationWheel(p) {
  const key = `${p.id}:${p.r}:${p.color}`;
  if (wheels.has(key)) return wheels.get(key);
  const R = p.r,
    S = Math.ceil(R * 2.6),
    c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'),
    cx = S / 2,
    cy = S / 2;
  const n = parseInt((p.color || '#888').slice(1), 16);
  const [r0, g0, b0] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const rnd = seeded(hashStr(p.id));
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
  wheels.set(key, c);
  return c;
}
