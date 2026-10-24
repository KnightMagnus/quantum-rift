import fileSystem from 'node:fs';
import path from 'node:path';

/** Explicit lanes must all succeed on one workflow SHA; skipped/cancelled is not ready. */
export const releaseLanes = [
  'quality',
  'unit-regressions',
  'browser-regressions',
  'windows-startup',
  'save-generator-windows',
  'platform-browser-smoke',
  'archive-smoke',
] as const;
/** Parse GitHub's needs object without accepting missing or unexpected readiness lanes. */
export function readiness(needs: unknown, head: string) {
  if (!head || !needs || typeof needs !== 'object' || Array.isArray(needs))
    throw Error('Missing readiness commit or lanes');
  const statuses = Object.fromEntries(
    releaseLanes.map((name) => {
      const lane = Reflect.get(needs, name);
      const result: unknown =
        lane && typeof lane === 'object' ? Reflect.get(lane, 'result') : undefined;
      return [name, typeof result === 'string' ? result : 'missing'];
    }),
  );
  return {
    head,
    ready: Object.values(statuses).every((result) => result === 'success'),
    lanes: statuses,
  };
}
if (import.meta.main) {
  const report = readiness(
    JSON.parse(process.env.RELEASE_NEEDS || '{}'),
    process.env.GITHUB_SHA || '',
  );
  const output = process.env.RELEASE_READINESS_OUTPUT || '.artifacts/release-readiness.json';
  fileSystem.mkdirSync(path.dirname(output), { recursive: true });
  fileSystem.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!report.ready) process.exitCode = 1;
}
