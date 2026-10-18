// Developer-only analysis of actual recorded 30-minute sessions. Never manufacture rates.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
export const CAREERS = [
  'trade',
  'delivery',
  'patrol-bounty',
  'precision-mining',
  'refinery',
  'towing',
];
export const BANDS = ['early', 'mid', 'late'];
export const RISKS = ['low', 'higher'];
const finite = (n) => Number.isFinite(n) && n >= 0;
export function analyseSessions(records, { allowPartial = false } = {}) {
  if (!Array.isArray(records)) throw Error('Expected an array of recorded sessions.');
  const ids = new Set(),
    rows = [];
  for (const r of records) {
    if (!r.id || ids.has(r.id)) throw Error('Session IDs must be unique.');
    ids.add(r.id);
    if (!CAREERS.includes(r.career) || !BANDS.includes(r.band) || !RISKS.includes(r.risk))
      throw Error('Unknown career, progression band or risk band.');
    if (r.profile !== 'standard' && r.profile !== 'stress-only')
      throw Error('Declare a standard or stress-only profile.');
    if (
      r.durationSeconds !== 1800 ||
      !finite(r.activeSeconds) ||
      !r.activeSeconds ||
      r.activeSeconds > 1800
    )
      throw Error('Each session needs 30 wall-clock minutes and a valid active-time count.');
    for (const key of [
      'seed',
      'openingCredits',
      'closingCredits',
      'externalCredits',
      'externalDebits',
      'capitalCredits',
      'holdRequired',
      'lossesCredits',
      'nextUpgradeCost',
    ])
      if (!finite(r[key])) throw Error('Missing or invalid measurement: ' + key);
    if (
      typeof r.closedLoop !== 'boolean' ||
      !Array.isArray(r.unmeasuredCosts) ||
      !Array.isArray(r.notes)
    )
      throw Error('Declare cargo/job closure, unmeasured costs and notes explicitly.');
    const net = r.closingCredits - r.openingCredits - r.externalCredits + r.externalDebits;
    const rate = net / (r.activeSeconds / 60);
    const comparable = r.profile === 'standard' && r.closedLoop && !r.unmeasuredCosts.length;
    rows.push({
      id: r.id,
      career: r.career,
      band: r.band,
      risk: r.risk,
      seed: r.seed,
      comparable,
      netCredits: net,
      netPerActiveMinute: rate,
      netPerWallMinute: net / 30,
      activeMinutes: r.activeSeconds / 60,
      idleMinutes: (1800 - r.activeSeconds) / 60,
      capitalCredits: r.capitalCredits,
      holdRequired: r.holdRequired,
      lossesCredits: r.lossesCredits,
      minutesToUpgrade: rate > 0 ? Math.max(0, r.nextUpgradeCost - r.closingCredits) / rate : null,
      unmeasuredCosts: r.unmeasuredCosts,
      notes: r.notes,
    });
  }
  const missing = [];
  for (const band of BANDS)
    for (const risk of RISKS)
      for (const career of CAREERS)
        if (
          !rows.some(
            (r) => r.band === band && r.risk === risk && r.career === career && r.comparable,
          )
        )
          missing.push({ band, risk, career });
  if (missing.length && !allowPartial)
    throw Error(
      `Missing ${missing.length} comparable baseline sessions. No complete balance conclusion is available.`,
    );
  const review = [];
  const ratio = (a, b) => (a === b ? 1 : !a || !b ? Infinity : Math.max(a, b) / Math.min(a, b));
  for (let i = 0; i < rows.length; i++)
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i],
        b = rows[j];
      if (
        !a.comparable ||
        !b.comparable ||
        a.band !== b.band ||
        a.risk !== b.risk ||
        a.seed !== b.seed ||
        a.career === b.career
      )
        continue;
      if (
        ratio(a.capitalCredits, b.capitalCredits) > 1.25 ||
        ratio(a.holdRequired, b.holdRequired) > 1.25
      )
        continue;
      const smaller = Math.min(a.netPerActiveMinute, b.netPerActiveMinute),
        larger = Math.max(a.netPerActiveMinute, b.netPerActiveMinute);
      if ((smaller > 0 && larger > smaller * 1.25) || (smaller <= 0 && larger > 0))
        review.push({
          sessions: [a.id, b.id],
          reason:
            'Comparable risk/capital/hold with a rate gap: repeat and investigate; not automatic permission to change rewards.',
        });
    }
  return {
    complete: missing.length === 0,
    measuredSessions: rows.length,
    missing,
    rows,
    review,
    interpretation:
      'Net is settled cash change after removing external transfers. Cargo and outstanding jobs must close before ranking. Losses are descriptive and already included in cash change; never subtract them twice. Stress-only/KNIGHT-style profiles and unknown costs are not ordinary baselines. No claim that every career should pay equally.',
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [input, output, ...flags] = process.argv.slice(2);
  if (!input || !output)
    throw Error(
      'Usage: node tools/economy-baseline.mjs measured-sessions.json report.json [--allow-partial]',
    );
  const report = analyseSessions(JSON.parse(fs.readFileSync(input, 'utf8')), {
    allowPartial: flags.includes('--allow-partial'),
  });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `${report.measuredSessions} recorded sessions; ${report.complete ? 'full matrix' : 'partial evidence only'}.`,
  );
}
