// Quantum Rift 0.9 "Hostile Space" data: hostile levels and the "can I win?" scan, loot chests, Station Holdout
// waves, and the Umbral Eclipse. (2.6: directives and solo armadas were removed.)

// ------------------------------------------------------------------ levels: from a ship's effective strength
export function levelOf(power) {
  return Math.max(1, Math.round(4 * Math.log2(1 + Math.max(0, power) / 12)));
}
// odds of winning a straight fight between two effective strengths (a logistic on the level gap)
export function winOdds(mine, theirs) {
  const d = levelOf(mine) - levelOf(theirs);
  return 1 / (1 + Math.exp(-d / 2.5));
}
// a player's effective strength: hull strength scaled by their bonuses, plus a share of their escorts
export function playerPower(A, hull, bonus = {}, escorts = []) {
  const H = A.ships[hull];
  if (!H) return 10;
  const b = 1 + ((bonus.damagePct || 0) + (bonus.shieldPct || 0) + (bonus.armorPct || 0)) / 300;
  return (
    (H.strength || 10) * b +
    escorts.reduce((t, h) => t + ((A.ships[h] || {}).strength || 0) * 0.6, 0)
  );
}

// ------------------------------------------------------------------ loot chests: each hostile type drops its own
export const CHESTS = {
  hollow: {
    name: 'Hollow Cache',
    color: '#ff7a5a',
    bp: 'vanguard',
    res: 'warrants',
    mats: ['alloy'],
  },
  umbral: {
    name: 'Umbral Reliquary',
    color: '#b48aff',
    bp: 'nightglass',
    res: 'umbra',
    mats: ['crystal', 'isotope'],
  },
  swarm: {
    name: 'Swarm Nodule',
    color: '#a8c840',
    bp: 'swarmbreaker',
    res: 'chitin',
    mats: ['isotope'],
  },
  eclipse: {
    name: 'Eclipse Shard Cache',
    color: '#e682fa',
    bp: 'nightglass',
    res: 'umbra',
    mats: ['crystal'],
  },
};
export const CHEST_CHANCE = 0.3; // per hostile kill (bosses and kingpins always drop one)

// ------------------------------------------------------------------ Station Holdout: ten escalating waves at your own station
export const HOLDOUT = {
  waves: 10,
  cooldownH: 2,
  waveGap: 6,
  timeoutMin: 3,
  wave(n) {
    // wave n (1-10): which hulls attack
    const pools = [
      [705, 705, 708],
      [708, 708, 711],
      [708, 711, 711],
      [711, 711, 716],
      [711, 716, 761],
      [716, 716, 762],
      [716, 762, 762],
      [762, 762, 763],
      [762, 763, 763],
      [764, 763, 763, 762],
    ];
    const p = pools[n - 1];
    const out = [];
    for (let i = 0; i < 2 + Math.ceil(n / 2); i++) out.push(p[i % p.length]);
    if (n === 10) out[0] = 764;
    return out;
  },
  reward(n) {
    return { credits: 8000 * n * n, grade: Math.min(4, Math.floor(n / 3)), insignia: n };
  },
  platforms(defense) {
    return 1 + Math.min(5, defense || 0);
  },
};

// ------------------------------------------------------------------ the Umbral Eclipse: violet-lit Umbral cells that roam the dark
export const ECLIPSE = { hulls: [761, 762, 763], chance: 0.1, thursday: 0.25 };
