// Developer-only analysis of actual recorded 30-minute sessions. Never manufacture rates.
import fileSystem from 'node:fs';
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
export interface RecordedSession {
  id: string;
  career: string;
  band: string;
  risk: string;
  profile: string;
  durationSeconds: number;
  activeSeconds: number;
  seed: number;
  openingCredits: number;
  closingCredits: number;
  externalCredits: number;
  externalDebits: number;
  capitalCredits: number;
  holdRequired: number;
  lossesCredits: number;
  nextUpgradeCost: number;
  closedLoop: boolean;
  unmeasuredCosts: string[];
  notes: string[];
}
const finite = (measurement: unknown): measurement is number =>
  typeof measurement === 'number' && Number.isFinite(measurement) && measurement >= 0;
export function analyseSessions(records: RecordedSession[], { allowPartial = false } = {}) {
  if (!Array.isArray(records)) throw Error('Expected an array of recorded sessions.');
  const sessionIds = new Set<string>(),
    rows = [];
  for (const recordedSession of records) {
    if (!recordedSession.id || sessionIds.has(recordedSession.id))
      throw Error('Session IDs must be unique.');
    sessionIds.add(recordedSession.id);
    if (
      !CAREERS.includes(recordedSession.career) ||
      !BANDS.includes(recordedSession.band) ||
      !RISKS.includes(recordedSession.risk)
    )
      throw Error('Unknown career, progression band or risk band.');
    if (recordedSession.profile !== 'standard' && recordedSession.profile !== 'stress-only')
      throw Error('Declare a standard or stress-only profile.');
    if (
      recordedSession.durationSeconds !== 1800 ||
      !finite(recordedSession.activeSeconds) ||
      !recordedSession.activeSeconds ||
      recordedSession.activeSeconds > 1800
    )
      throw Error('Each session needs 30 wall-clock minutes and a valid active-time count.');
    for (const entryKey of [
      'seed',
      'openingCredits',
      'closingCredits',
      'externalCredits',
      'externalDebits',
      'capitalCredits',
      'holdRequired',
      'lossesCredits',
      'nextUpgradeCost',
    ] as const)
      if (!finite(recordedSession[entryKey]))
        throw Error('Missing or invalid measurement: ' + entryKey);
    if (
      typeof recordedSession.closedLoop !== 'boolean' ||
      !Array.isArray(recordedSession.unmeasuredCosts) ||
      !Array.isArray(recordedSession.notes)
    )
      throw Error('Declare cargo/job closure, unmeasured costs and notes explicitly.');
    const netCredits =
      recordedSession.closingCredits -
      recordedSession.openingCredits -
      recordedSession.externalCredits +
      recordedSession.externalDebits;
    const rate = netCredits / (recordedSession.activeSeconds / 60);
    const comparable =
      recordedSession.profile === 'standard' &&
      recordedSession.closedLoop &&
      !recordedSession.unmeasuredCosts.length;
    rows.push({
      id: recordedSession.id,
      career: recordedSession.career,
      band: recordedSession.band,
      risk: recordedSession.risk,
      seed: recordedSession.seed,
      comparable,
      netCredits: netCredits,
      netPerActiveMinute: rate,
      netPerWallMinute: netCredits / 30,
      activeMinutes: recordedSession.activeSeconds / 60,
      idleMinutes: (1800 - recordedSession.activeSeconds) / 60,
      capitalCredits: recordedSession.capitalCredits,
      holdRequired: recordedSession.holdRequired,
      lossesCredits: recordedSession.lossesCredits,
      minutesToUpgrade:
        rate > 0
          ? Math.max(0, recordedSession.nextUpgradeCost - recordedSession.closingCredits) / rate
          : null,
      unmeasuredCosts: recordedSession.unmeasuredCosts,
      notes: recordedSession.notes,
    });
  }
  const missing = [];
  for (const band of BANDS)
    for (const risk of RISKS)
      for (const career of CAREERS)
        if (
          !rows.some(
            (recordedSession) =>
              recordedSession.band === band &&
              recordedSession.risk === risk &&
              recordedSession.career === career &&
              recordedSession.comparable,
          )
        )
          missing.push({ band, risk, career });
  if (missing.length && !allowPartial)
    throw Error(
      `Missing ${missing.length} comparable baseline sessions. No complete balance conclusion is available.`,
    );
  const review = [];
  const ratio = (firstValue: number, secondValue: number) =>
    firstValue === secondValue
      ? 1
      : !firstValue || !secondValue
        ? Infinity
        : Math.max(firstValue, secondValue) / Math.min(firstValue, secondValue);
  for (let firstSessionIndex = 0; firstSessionIndex < rows.length; firstSessionIndex++)
    for (
      let secondSessionIndex = firstSessionIndex + 1;
      secondSessionIndex < rows.length;
      secondSessionIndex++
    ) {
      const firstSession = rows[firstSessionIndex],
        secondSession = rows[secondSessionIndex];
      if (
        !firstSession.comparable ||
        !secondSession.comparable ||
        firstSession.band !== secondSession.band ||
        firstSession.risk !== secondSession.risk ||
        firstSession.seed !== secondSession.seed ||
        firstSession.career === secondSession.career
      )
        continue;
      if (
        ratio(firstSession.capitalCredits, secondSession.capitalCredits) > 1.25 ||
        ratio(firstSession.holdRequired, secondSession.holdRequired) > 1.25
      )
        continue;
      const smaller = Math.min(firstSession.netPerActiveMinute, secondSession.netPerActiveMinute),
        larger = Math.max(firstSession.netPerActiveMinute, secondSession.netPerActiveMinute);
      if ((smaller > 0 && larger > smaller * 1.25) || (smaller <= 0 && larger > 0))
        review.push({
          sessions: [firstSession.id, secondSession.id],
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
      'Usage: node tools/economy-baseline.ts measured-sessions.json report.json [--allow-partial]',
    );
  const report = analyseSessions(JSON.parse(fileSystem.readFileSync(input, 'utf8')), {
    allowPartial: flags.includes('--allow-partial'),
  });
  fileSystem.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(
    `${report.measuredSessions} recorded sessions; ${report.complete ? 'full matrix' : 'partial evidence only'}.`,
  );
}
