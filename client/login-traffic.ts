/** Bounded subset of real catalog hulls used by the decorative login scene. */
export const LOGIN_HULLS = [
  { hull: 703, size: 30, strength: 4 },
  { hull: 704, size: 54, strength: 8 },
  { hull: 705, size: 38, strength: 30 },
  { hull: 780, size: 50, strength: 6 },
  { hull: 737, size: 24, strength: 8 },
  { hull: 770, size: 52, strength: 10 },
  { hull: 711, size: 88, strength: 180 },
  { hull: 713, size: 112, strength: 300 },
  { hull: 717, size: 220, strength: 900 },
  { hull: 736, size: 360, strength: 2400 },
] as const;
const COURIERS = [
  { hull: 703, lane: 0.19, phase: 0.12, speed: 0.019, right: true },
  { hull: 704, lane: 0.74, phase: 0.79, speed: 0.012, right: false },
  { hull: 705, lane: 0.38, phase: 0.83, speed: 0.016, right: true },
  { hull: 780, lane: 0.85, phase: 0.3, speed: 0.009, right: true },
  { hull: 737, lane: 0.53, phase: 0.08, speed: 0.022, right: false },
  { hull: 770, lane: 0.11, phase: 0.62, speed: 0.014, right: false },
];
const FLYBYS = [
  { start: 0.24, hull: 711, escorts: 2, right: true },
  { start: 0.44, hull: 713, escorts: 2, right: false },
  { start: 0.64, hull: 717, escorts: 4, right: true },
  { start: 0.84, hull: 736, escorts: 4, right: false },
];

/** Decorative positions derive from the actual looping music playback position. */
export function loginTraffic(seconds: number, width: number, height: number, duration = 180) {
  const trackDuration = Number.isFinite(duration) && duration > 0 ? duration : 180;
  const position = Number.isFinite(seconds)
    ? (Math.max(0, seconds) % trackDuration) / trackDuration
    : 0;
  const elapsed = position * trackDuration;
  const sceneWidth = Number.isFinite(width) ? Math.max(1, width) : 1;
  const sceneHeight = Number.isFinite(height) ? Math.max(1, height) : 1;
  const scale = Math.min(1.25, Math.max(0.6, sceneWidth / 1440));
  const catalog = (hull: number) => LOGIN_HULLS.find((ship) => ship.hull === hull)!;
  const size = (hull: number) => Math.max(32, Math.min(260, catalog(hull).size)) * scale;
  const ships = COURIERS.map((ship) => {
    const progress = (ship.phase + elapsed * ship.speed) % 1;
    return {
      ...ship,
      strength: catalog(ship.hull).strength,
      x: (ship.right ? progress : 1 - progress) * (sceneWidth + 240) - 120,
      y: ship.lane * sceneHeight,
      size: size(ship.hull),
      formation: false,
    };
  });
  for (const flyby of FLYBYS) {
    const progress = (position - flyby.start) / 0.16;
    if (progress < 0 || progress > 1) continue;
    const direction = flyby.right ? 1 : -1;
    const center = progress * (sceneWidth + 800) - 400;
    const leaderX = flyby.right ? center : sceneWidth - center;
    const leaderY = sceneHeight * 0.48;
    ships.push({
      hull: flyby.hull,
      lane: 0.48,
      phase: 0,
      speed: 0,
      right: flyby.right,
      strength: catalog(flyby.hull).strength,
      x: leaderX,
      y: leaderY,
      size: size(flyby.hull),
      formation: true,
    });
    const slots = [
      [-1, 1],
      [1, 1],
      [-2, 1.8],
      [2, 1.8],
    ];
    for (let index = 0; index < flyby.escorts; index++) {
      const [lateral, behind] = slots[index];
      const hull = index % 2 ? 705 : 703;
      const spacing = Math.min(sceneHeight * 0.12, 65 * scale);
      ships.push({
        hull,
        lane: 0.48,
        phase: 0,
        speed: 0,
        right: flyby.right,
        strength: catalog(hull).strength,
        x: leaderX - direction * behind * (size(flyby.hull) * 0.48 + 32 * scale),
        y: leaderY + lateral * spacing,
        size: size(hull),
        formation: true,
      });
    }
  }
  return ships;
}
