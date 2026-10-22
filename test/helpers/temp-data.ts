import filesystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
const owned = new Set<string>();
process.once('exit', () => {
  for (const directory of owned) filesystem.rmSync(directory, { recursive: true, force: true });
});
export function tempDataDir(prefix: string) {
  const directory2 = filesystem.mkdtempSync(path.join(operatingSystem.tmpdir(), prefix));
  owned.add(directory2);
  return directory2;
}
