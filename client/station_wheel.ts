// Preserve Luna's original procedural wheel/core, shared by flight and landing.
// Deliberately retains the original color interpretation and seeded details.
const wheels = new Map<string, HTMLCanvasElement>();
function seeded(seed: number) {
  let state = seed >>> 0 || 7;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
/**
 * Hashes a string using 32-bit FNV-1a.
 * @param {string} text Input string
 * @returns {number} Unsigned 32-bit hash value
 */
function hashStr(text: string) {
  let height = 2166136261;
  for (const text2 of text) {
    height ^= text2.charCodeAt(0);
    height = Math.imul(height, 16777619);
  }
  return height >>> 0;
}

/** @param {{id: string, r: number, color?: string}} position */
export function stationWheel(position: { id: string; r: number; color?: string }) {
  const entryKey3 = `${position.id}:${position.r}:${position.color}`;
  if (wheels.has(entryKey3)) return wheels.get(entryKey3);
  const radius = position.r,
    state = Math.ceil(radius * 2.6),
    htmlCanvasElement = document.createElement('canvas');
  htmlCanvasElement.width = htmlCanvasElement.height = state;
  const canvasRenderingContext2D = htmlCanvasElement.getContext('2d')!,
    centerX = state / 2,
    centerY = state / 2;
  const parseInt2 = parseInt((position.color || '#888').slice(1), 16);
  const [radius0, game, secondValue] = [
    (parseInt2 >> 16) & 255,
    (parseInt2 >> 8) & 255,
    parseInt2 & 255,
  ];
  const randomGenerator = seeded(hashStr(position.id));
  canvasRenderingContext2D.translate(centerX, centerY);
  const ring = (radius: number, width: number, column: string) => {
    canvasRenderingContext2D.beginPath();
    canvasRenderingContext2D.arc(0, 0, radius, 0, Math.PI * 2);
    canvasRenderingContext2D.lineWidth = width;
    canvasRenderingContext2D.strokeStyle = column;
    canvasRenderingContext2D.stroke();
  };
  ring(radius * 0.92, radius * 0.16, `rgb(${radius0 * 0.6},${game * 0.6},${secondValue * 0.6})`);
  ring(
    radius * 0.92,
    radius * 0.05,
    `rgb(${Math.min(255, radius0 + 60)},${Math.min(255, game + 60)},${Math.min(255, secondValue + 60)})`,
  );
  for (let entryKey = 0; entryKey < 6; entryKey++) {
    canvasRenderingContext2D.save();
    canvasRenderingContext2D.rotate((entryKey * Math.PI) / 3 + randomGenerator());
    canvasRenderingContext2D.fillStyle = `rgb(${radius0 * 0.5},${game * 0.5},${secondValue * 0.5})`;
    canvasRenderingContext2D.fillRect(-radius * 0.05, 0, radius * 0.1, radius * 0.86);
    canvasRenderingContext2D.restore();
  }
  const canvasGradient = canvasRenderingContext2D.createRadialGradient(
    -radius * 0.1,
    -radius * 0.1,
    2,
    0,
    0,
    radius * 0.4,
  );
  canvasGradient.addColorStop(
    0,
    `rgb(${Math.min(255, radius0 + 80)},${Math.min(255, game + 80)},${Math.min(255, secondValue + 80)})`,
  );
  canvasGradient.addColorStop(1, `rgb(${radius0 * 0.3},${game * 0.3},${secondValue * 0.3})`);
  canvasRenderingContext2D.beginPath();
  canvasRenderingContext2D.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
  canvasRenderingContext2D.fillStyle = canvasGradient;
  canvasRenderingContext2D.fill();
  for (let entryKey = 0; entryKey < 24; entryKey++) {
    const firstValue = (entryKey / 24) * Math.PI * 2;
    canvasRenderingContext2D.fillStyle = randomGenerator() < 0.5 ? '#ffd88a' : '#9cf';
    canvasRenderingContext2D.fillRect(
      Math.cos(firstValue) * radius * 0.92 - 1.5,
      Math.sin(firstValue) * radius * 0.92 - 1.5,
      3,
      3,
    );
  }
  wheels.set(entryKey3, htmlCanvasElement);
  return htmlCanvasElement;
}
