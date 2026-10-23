// Deterministic characterization helper. REFERENCE_ROOT is only for regenerating
// a fixture from the documented original checkout, never needed to run tests.
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { EventEmitter } from 'node:events';
const root = process.env.REFERENCE_ROOT || fileURLToPath(new URL('../', import.meta.url));
const load = (file: string) => {
  // The optional reference checkout predates TypeScript; keep it usable.
  const source = path.join(root, file);
  const legacy = source.replace(/\.ts$/, '.js');
  return import(pathToFileURL(fileSystem.existsSync(source) ? source : legacy).href);
};
process.env.SEEDS_FILE = '/nonexistent';
delete process.env.INVASION_NOW;
Date.now = () => 1781503200000;
let random = 123456789;
Math.random = () => {
  random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
  return random / 4294967296;
};
globalThis.setInterval = (() => ({ unref() {} })) as unknown as typeof setInterval;
const { DB: Database } = await load('server/db.ts');
const { makeLoadout } = await load('shared/rules.ts');
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const trace: string[] = [];
const phases = {
  fronts: ['frontsInit'],
  coop: ['coopInit', 'coopMigrate', 'coopLogin'],
  frontier: ['frontierInit'],
  rivals: ['rivalsInit'],
  living: ['livingInit', 'livingTick'],
  hangar: ['hangarInit'],
  docks: ['docksInit'],
  hostile: ['hostInit'],
  story: ['storyInit'],
  syndicate: ['synInit'],
  arcs: ['arcsInit'],
};
for (const [file, methods] of Object.entries(phases)) {
  const module = await load(`server/${file}.ts`);
  const operations = Object.values(module).find(
    (value) =>
      value &&
      typeof value === 'object' &&
      typeof (value as Record<string, unknown>)[methods[0]] === 'function',
  ) as Record<string, (...args: unknown[]) => unknown>;
  for (const method of methods) {
    const original = operations[method];
    operations[method] = function (...args: unknown[]) {
      trace.push(method);
      return original.apply(this, args);
    };
  }
}
const { Game } = await load('server/game.ts');
const directory = fileSystem.mkdtempSync(
  path.join(operatingSystem.tmpdir(), 'rift-feature-fixture-'),
);
try {
  const game = new Game(assets, new Database(directory));
  const worldInit = trace.splice(0);
  const sock = new EventEmitter() as EventEmitter & {
    open: boolean;
    backlog: number;
    send: (message: string) => void;
    close: () => void;
  };
  sock.open = true;
  sock.backlog = 0;
  const messages = [];
  sock.send = (message: string) =>
    messages.push(typeof message === 'string' ? JSON.parse(message) : message);
  sock.close = () => {};
  game.connect(sock, '127.0.0.1');
  const session = [...game.sessions.values()][0];
  game.onMessage(session, { t: 'hello', name: 'Mixed Case', pass: 'secret' });
  const login = trace.splice(0);
  const operations = game.features
    ? {
        bonus: game.features.bonuses.bonus,
        stats: game.features.shipStats.stats,
        worldPayload: game.features.world.worldPayload,
        sessionOf: game.features.sessions.sessionOf,
      }
    : Object.fromEntries(
        ['bonus', 'stats', 'worldPayload', 'sessionOf'].map((propertyKey) => [
          propertyKey,
          game[propertyKey].bind(game),
        ]),
      );
  const saved = JSON.parse(
    JSON.stringify(session.data, (propertyKey, value) =>
      ['salt', 'hash'].includes(propertyKey) ? undefined : value,
    ),
  );
  const samples = [];
  for (const hull of [700, 704, 812, 818]) {
    if (!assets.ships[hull]) continue;
    session.data.ship = makeLoadout(assets, hull, 'Fixture');
    session.data.station.done = ['mining1', 'mining2'];
    session.data.mastery = { [hull]: 2500 };
    samples.push({
      hull,
      bonus: operations.bonus(session.data),
      stats: operations.stats(session.data),
    });
  }
  const world = operations.worldPayload();
  const lookup = ['Mixed Case', 'mixed case', 'MIXED CASE', 'missing'].map(
    (name) => !!operations.sessionOf(name),
  );
  process.stdout.write(
    JSON.stringify(
      {
        baseline: '47bea35a9f3d773efa9a9f075e5b361d9533b390',
        worldInit,
        login,
        saved,
        samples,
        world,
        lookup,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  fileSystem.rmSync(directory, { recursive: true, force: true });
}
