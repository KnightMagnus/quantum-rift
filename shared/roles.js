// Quantum Rift 0.8: ship roles and the class triangle (after STFC). Interceptors beat Battleships, Battleships beat
// Explorers, Explorers beat Interceptors. Survey ships are the miners and haulers; Carriers launch fighters.
export const ROLES_INFO = {
  interceptor: { name: 'Interceptor', short: 'INT', color: '#ff8a5a', icon: '▲', desc: 'Fast and agile. Strong against Battleships, weak against Explorers.' },
  explorer:    { name: 'Explorer',    short: 'EXP', color: '#7ad0ff', icon: '◆', desc: 'Balanced and far-ranging. Strong against Interceptors, weak against Battleships.' },
  battleship:  { name: 'Battleship',  short: 'BAT', color: '#ff5a5a', icon: '■', desc: 'Heavy armor and firepower. Strong against Explorers, weak against Interceptors.' },
  survey:      { name: 'Survey',      short: 'SRV', color: '#ffd27a', icon: '●', desc: 'Miners and haulers: +50% mining yield, but they fight poorly (-20% damage).' },
  carrier:     { name: 'Carrier',     short: 'CAR', color: '#c8a0ff', icon: '✚', desc: 'Launch fighters. Outside the triangle.' },
};
export const BEATS = { interceptor: 'battleship', battleship: 'explorer', explorer: 'interceptor' };
export const COUNTER = { dmg: 1.15, taken: 0.9, survey: 0.8, surveyMining: 50 };
const OVERRIDE = { 735: 'explorer', 716: 'battleship' };   // the Halo Surveyor is a scout, the Tempest a destroyer
export function roleOf(H, W) {
  if (!H) return 'explorer';
  if (H.role) return H.role;
  if (OVERRIDE[H.id]) return OVERRIDE[H.id];
  if (W && (H.weapons || []).some(([w]) => W[w] && W[w].type === 'bay')) return 'carrier';
  const dur = (H.shield || 0) + (H.armor || 0);
  if ((H.cargo || 0) >= 45 && H.cargo >= (H.strength || 0) * 0.9) return 'survey';
  if ((H.speed || 0) >= 450) return 'interceptor';
  if (dur >= 1900 && (H.speed || 0) <= 430) return 'battleship';
  return 'explorer';
}
// damage multiplier for an attacker of role a hitting a target of role t
export function roleMult(a, t) {
  if (!a || !t) return 1;
  let m = 1;
  if (BEATS[a] === t) m *= COUNTER.dmg;
  if (BEATS[t] === a) m *= COUNTER.taken;
  if (a === 'survey') m *= COUNTER.survey;
  return m;
}
