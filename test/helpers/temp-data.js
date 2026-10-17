import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const owned = new Set();
process.once('exit', () => {
  for (const dir of owned) fs.rmSync(dir, { recursive: true, force: true });
});
export function tempDataDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  owned.add(dir);
  return dir;
}
