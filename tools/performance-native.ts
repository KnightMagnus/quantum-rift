import fs from 'node:fs';
import { verifyNativeBuildProvenance } from './nakama-build-provenance.ts';
import { repository } from '../test/helpers/nakama-service.ts';
import {
  parseNativePerformanceArguments,
  runNativePerformance,
} from '../test/helpers/native-performance.ts';

const { options, output } = parseNativePerformanceArguments(process.argv.slice(2));
verifyNativeBuildProvenance(repository);
// Reserve the private report before starting services; never overwrite an earlier run.
const file = fs.openSync(output, 'wx', 0o600);
try {
  const result = await runNativePerformance(options);
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  if (result.status !== 'passed') process.exitCode = 1;
  console.log('Native numeric performance report written:', output);
} finally {
  fs.closeSync(file);
}
