import { launchChromium } from './helpers/chromium.ts';
// Measures planet render-cache memory over a multi-system tour in real Chromium and checks that
// the byte budgets evict idle worlds without invalidating the worlds currently on screen.
// Does not need accounts or a game server.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import http from 'node:http';
import path from 'node:path';

import { STELLARS } from '../shared/galaxy.ts';
import type { PlanetDef, PlanetCacheUsage } from '../client/planets.ts';
import { root, evidenceDir } from './helpers/browser-fixture.ts';

type CacheKind = 'procedural' | 'rendered';
type CacheUsage = Record<CacheKind | 'textures', PlanetCacheUsage>;
type SystemVisit = {
  /** Visited system identifier. */
  system: string;

  /** Worlds drawn while in this system. */
  worlds: number;

  /** Cache usage once every world in the system had settled. */
  usage: CacheUsage;

  /** Whether the system's worlds kept their cached sprite objects through eviction. */
  liveKept: boolean;
};

const output = evidenceDir('planet-cache-budget');
const MEGABYTE = 1024 * 1024;
// The registered run tours 12 systems to stay well inside the runner's program timeout;
// RIFT_PLANET_TOUR=24 reproduces the longer measurement in docs/PERFORMANCE.md.
const TOUR_LENGTH = Number(process.env.RIFT_PLANET_TOUR) || 12;

const worldsBySystem = new Map<string, PlanetDef[]>();
for (const body of Object.values(STELLARS) as Array<PlanetDef & { system?: string }>) {
  if ((body.kind !== 'planet' && body.kind !== 'moon') || !body.system) continue;
  const worlds = worldsBySystem.get(body.system) || [];
  worlds.push(body);
  worldsBySystem.set(body.system, worlds);
}
// The busiest systems first, then by id, so the tour is deterministic and starts with the
// heaviest single-system working set.
const tour = [...worldsBySystem]
  .sort(
    ([firstId, first], [secondId, second]) =>
      second.length - first.length || firstId.localeCompare(secondId),
  )
  .slice(0, TOUR_LENGTH);

const distRoot = path.join(root, 'dist');
const server = http.createServer((request, response) => {
  const relativePath = decodeURIComponent(new URL(request.url!, 'http://localhost').pathname);
  if (relativePath.endsWith('/')) return response.end('<!doctype html><body></body>');
  // Compiled modules come from dist/; artwork is served from the source tree.
  const compiled = path.resolve(distRoot, '.' + relativePath);
  const artwork = path.resolve(root, '.' + relativePath);
  const file =
    compiled.startsWith(distRoot + path.sep) && fileSystem.existsSync(compiled)
      ? compiled
      : artwork.startsWith(path.join(root, 'client', 'assets') + path.sep)
        ? artwork
        : null;
  if (!file || !fileSystem.statSync(file, { throwIfNoEntry: false })?.isFile())
    return response.writeHead(404).end();
  response.setHeader(
    'Content-Type',
    file.endsWith('.js')
      ? 'text/javascript'
      : file.endsWith('.json')
        ? 'application/json'
        : 'image/webp',
  );
  response.end(fileSystem.readFileSync(file));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const origin = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });

/**
 * Tours the systems in one fresh page and records cache usage after each system settles.
 * @param bounded Whether to keep the shipped budgets; false measures unbounded growth.
 * @param artwork Whether pre-rendered planet artwork loads; without it every world uses
 * the procedural fallback, as when artwork is missing or fails to decode.
 */
async function runTour(bounded: boolean, artwork: boolean): Promise<SystemVisit[]> {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  if (!artwork)
    await page.route('**/assets/planets/**', (route) =>
      route.fulfill({ status: 404, body: 'Unavailable' }),
    );
  try {
    await page.goto(`${origin}/client/`);
    await page.evaluate(async (bounded: boolean) => {
      const planets = await import('/client/planets.js');
      if (!bounded) planets.setPlanetCacheBudgets(Infinity, Infinity);
      window.planetProbe = { planets, worlds: [], sprites: new Map() };
      const frame = () => {
        const probe = window.planetProbe!;
        for (const world of probe.worlds) {
          const sprite = probe.planets.planetSprite(world, performance.now());
          if (sprite) probe.sprites.set(world.id, sprite);
        }
        requestAnimationFrame(frame);
      };
      frame();
    }, bounded);
    const visits: SystemVisit[] = [];
    for (const [system, worlds] of tour) {
      const visit = await page.evaluate(async (worlds: PlanetDef[]) => {
        const probe = window.planetProbe!;
        probe.worlds = worlds;
        probe.sprites.clear();
        // Settled: every world has a sprite and none has changed object for 20 frames
        // (procedural placeholders are replaced once pre-rendered maps decode).
        const deadline = performance.now() + 30000;
        let previous: unknown[] = [];
        let stableFrames = 0;
        while (stableFrames < 20) {
          if (performance.now() > deadline) throw Error('Worlds did not settle');
          await new Promise(requestAnimationFrame);
          const current = worlds.map((world) => probe.sprites.get(world.id));
          stableFrames =
            current.every(Boolean) && current.every((sprite, index) => sprite === previous[index])
              ? stableFrames + 1
              : 0;
          previous = current;
        }
        // Several more frames: the drawn worlds must keep their cached objects.
        for (let index = 0; index < 20; index++) await new Promise(requestAnimationFrame);
        const liveKept = worlds.every(
          (world, index) => probe.sprites.get(world.id) === previous[index],
        );
        return { worlds: worlds.length, usage: probe.planets.planetCacheUsage(), liveKept };
      }, worlds);
      visits.push({ system, ...visit });
      if (visits.length === 1)
        await page.evaluate(() => {
          const probe = window.planetProbe!;
          probe.firstSprites = new Map(probe.sprites);
        });
    }
    if (bounded) {
      // Returning to the first system after it was evicted rebuilds its worlds.
      const [system, firstWorlds] = tour[0];
      const rebuildMs = await page.evaluate(async (worlds: PlanetDef[]) => {
        const probe = window.planetProbe!;
        probe.worlds = worlds;
        probe.sprites.clear();
        const started = performance.now();
        while (performance.now() - started < 30000) {
          await new Promise(requestAnimationFrame);
          if (
            worlds.every((world) => {
              const sprite = probe.sprites.get(world.id);
              return sprite && sprite !== probe.firstSprites!.get(world.id);
            })
          )
            return performance.now() - started;
        }
        return null;
      }, firstWorlds);
      assert.ok(rebuildMs !== null, `${system}: evicted worlds rebuild on return`);
      rebuildTimes.push({ system, artwork, rebuildMs: Math.round(rebuildMs) });
    }
    assert.deepEqual(errors, []);
    return visits;
  } finally {
    await page.close();
  }
}

function megabytes(bytes: number): string {
  return (bytes / MEGABYTE).toFixed(1);
}

function retained(visit: SystemVisit, kind: CacheKind): number {
  return visit.usage[kind].bytes;
}

const results: Record<string, unknown> = {};
const rebuildTimes: { system: string; artwork: boolean; rebuildMs: number }[] = [];
const summaries: string[] = [];
try {
  for (const [kind, artwork] of [
    ['rendered', true],
    ['procedural', false],
  ] as const) {
    const unbounded = await runTour(false, artwork);
    const bounded = await runTour(true, artwork);
    // The heaviest single system: what one system's worlds add to an otherwise empty cache.
    const peakSystem = Math.max(
      ...unbounded.map(
        (visit, index) =>
          retained(visit, kind) - (index ? retained(unbounded[index - 1], kind) : 0),
      ),
    );
    const table = unbounded.map((visit, index) => ({
      system: visit.system,
      worlds: visit.worlds,
      unboundedMB: megabytes(retained(visit, kind)),
      boundedMB: megabytes(retained(bounded[index], kind)),
      textureMB: megabytes(visit.usage.textures.bytes),
    }));
    results[kind] = { tour: table, unbounded, bounded, peakSystemBytes: peakSystem };
    console.log(`${kind} worlds (${artwork ? 'artwork loads' : 'artwork missing'}):`);
    console.table(table);

    const budget = bounded[0].usage[kind].budgetBytes;
    assert.ok(Number.isFinite(budget), `${kind} cache has a byte budget`);
    // Texture-count eviction can release rendered worlds later in the tour.
    // The control must cross the byte budget, not remain above it at the final stop.
    assert.ok(
      Math.max(...unbounded.map((visit) => retained(visit, kind))) > budget,
      `${kind}: the unbounded tour outgrows the budget`,
    );
    for (const visit of bounded) {
      assert.ok(visit.liveKept, `${kind} ${visit.system}: on-screen worlds stay cached`);
      // Only the live system's worlds may push the cache past its budget.
      assert.ok(
        retained(visit, kind) <= budget + peakSystem,
        `${kind} ${visit.system}: ${megabytes(retained(visit, kind))} MB within budget`,
      );
    }
    summaries.push(
      `${kind} ${megabytes(retained(unbounded.at(-1)!, kind))} MB unbounded, ` +
        `${megabytes(retained(bounded.at(-1)!, kind))} MB within a ${megabytes(budget)} MB budget`,
    );
  }
  results.rebuildTimes = rebuildTimes;
  fileSystem.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
  console.table(rebuildTimes);
  console.log(
    `Planet caches over a ${TOUR_LENGTH}-system tour: ${summaries.join('; ')}. ` +
      'Live worlds kept and evicted worlds rebuilt.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
