import filesystem from 'node:fs';
import path from 'node:path';
import { Game } from '../../server/game.ts';
import { DB } from '../../server/db.ts';
import type { PlayerData } from '../../server/game.ts';

const [directory, replacementFile, boundary] = process.argv.slice(2);
const database = new DB(directory);
const instance = new Game(
  JSON.parse(filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8')),
  database,
  { seedDefinitions: [], automaticClock: false, defer: () => {}, randomUUID: () => 'import-crash' },
);
function crash(): never {
  filesystem.writeFileSync(path.join(directory, 'crash-boundary.txt'), boundary);
  process.kill(process.pid, 'SIGKILL');
  throw new Error('Fixture process survived forced termination');
}

const rename = filesystem.renameSync;
filesystem.renameSync = (source, target) => {
  if (boundary === 'before-journal' && target === database.journal) crash();
  rename(source, target);
  if (
    (boundary === 'after-journal' && target === database.journal) ||
    (boundary === 'after-players' && target === database.file)
  )
    crash();
};
const create = database.create.bind(database);
database.create = (...args) => {
  const result = create(...args);
  if (boundary === 'after-create') crash();
  return result;
};
instance.importSave(
  JSON.parse(filesystem.readFileSync(path.resolve(replacementFile), 'utf8')) as PlayerData,
);
throw new Error('Crash fixture did not reach its requested boundary');
