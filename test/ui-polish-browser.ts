import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { type Page } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  ready,
  cleanup,
  evidenceDir,
  failureEvidence,
} from './helpers/browser-fixture.ts';
declare global {
  interface Window {
    /** Real Solo transport, captured only by this isolated browser fixture. */
    uiPolishSocket?: WebSocket;
  }
}
const directory = tempDataDir('ui-polish-');
const output = evidenceDir('ui-polish');
const db = new DB(path.join(directory, 'data'));
const assets = JSON.parse(filesystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
for (const name of ['Polish Pilot', 'Index Viewer']) {
  const player = Game.prototype.fresh.call({ A: assets });
  player.tut = 999;
  Object.assign(player, { story: { step: 0, active: null, done: ['start'] } });
  db.create(name, 'fixture', player);
}
db.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    '--import',
    './test/seed-random.ts',
    '--import',
    './test/fixtures/ui-polish-preload.ts',
    'server/local-main.ts',
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: db.dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = filesystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const measurements: object[] = [];
async function scale(page: Page, value: number) {
  await page.evaluate((value) => {
    document.documentElement.style.setProperty('--ui', String(value));
    document.body.classList.toggle('scaled', value !== 1);
  }, value);
}
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    // Capture finished menu transitions, not a transparent opening frame.
    await Promise.all(
      document
        .getAnimations()
        .filter((animation) => {
          const end = animation.effect?.getComputedTiming().endTime;
          return typeof end === 'number' && Number.isFinite(end) && end <= 1000;
        })
        .map((animation) => animation.finished.catch(() => {})),
    );
    const image = await window.RiftEngine.engine.screenshot(true);
    await image.decode();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await page.screenshot({ path: path.join(output, name + '.png') });
}
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 3440, height: 1440 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(origin);
  await page.locator('[data-slot="Polish Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  if (!(await page.locator('body').evaluate((body) => body.classList.contains('tray-open'))))
    await page.click('#traytoggle');
  await page.click('[data-lt="yard"]');
  for (const value of [0.8, 1, 1.4]) {
    await scale(page, value);
    const dimensions = await page.evaluate(() => {
      const usable = document.getElementById('land')!.getBoundingClientRect();
      const box = document.querySelector('#land .landbox')!.getBoundingClientRect();
      const sidebar = document.getElementById('hud')!.getBoundingClientRect();
      const cockpit = document.getElementById('cockpit')!.getBoundingClientRect();
      return {
        width: box.width / usable.width,
        expectedWidth: Math.min(2700, usable.width - 150) / usable.width,
        height: box.height / usable.height,
        expectedHeight: Math.min(1100, usable.height - 84) / usable.height,
        centeredX: Math.abs(box.x + box.width / 2 - usable.width / 2),
        centeredY: Math.abs(box.y + box.height / 2 - usable.height / 2),
        sidebarGap: sidebar.left - box.right,
        cockpitGap: cockpit.top - box.bottom,
      };
    });
    assert(
      Math.abs(dimensions.width - dimensions.expectedWidth) < 0.005,
      JSON.stringify({ value, dimensions }),
    );
    assert(Math.abs(dimensions.height - dimensions.expectedHeight) < 0.005);
    assert(dimensions.centeredX < 2 && dimensions.centeredY < 2);
    assert(dimensions.sidebarGap > 0 && dimensions.cockpitGap > 0);
    measurements.push({ viewport: '3440x1440', scale: value, ...dimensions });
    await capture(page, `landed-3440-scale-${value}`);
  }
  await scale(page, 1);
  await page.click('#cbhelp');
  const columns = async () =>
    page
      .locator('#ctrllist .ctrlgrid')
      .first()
      .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  assert.equal(await columns(), 2);
  const controls = await page.locator('#ctrlbox .ctrlin').boundingBox();
  assert(controls!.width >= 1000);
  const overflow = await page
    .locator('#ctrllist .ctrlbinding')
    .evaluateAll((rows) => rows.some((row) => row.scrollWidth > row.clientWidth));
  assert.equal(overflow, false, 'Paired key labels and descriptions fit their columns');
  await capture(page, 'controls-3440');
  await page.click('#ctrlclose');
  for (const [width, height, value] of [
    [1920, 1080, 1],
    [640, 780, 1.4],
  ]) {
    await page.setViewportSize({ width, height });
    await scale(page, value);
    const box = await page.locator('#land .landbox').boundingBox();
    assert(
      box && box.x >= 0 && box.y >= 0 && box.x + box.width <= width && box.y + box.height <= height,
    );
    await capture(page, `landed-${width}-scale-${value}`);
    await page.click('#cbhelp');
    if (width === 640) assert.equal(await columns(), 1);
    const containment = await page.locator('#ctrlbox .ctrlin').evaluate((element) => ({
      width: element.clientWidth,
      scroll: element.scrollWidth,
      hidden: element.parentElement!.className,
      overflowing: [...element.querySelectorAll<HTMLElement>('*')]
        .filter((child) => child.scrollWidth > child.clientWidth + 1)
        .map((child) => ({
          class: child.className,
          text: child.innerText.slice(0, 90),
          width: child.clientWidth,
          scroll: child.scrollWidth,
        })),
    }));
    filesystem.writeFileSync(
      path.join(output, `controls-${width}-containment.json`),
      JSON.stringify(containment, null, 2),
    );
    assert.equal(
      containment.scroll > containment.width + 1,
      false,
      'Controls content stays inside its frame at ordinary and narrow scaled sizes',
    );
    await capture(page, `controls-${width}-scale-${value}-top`);
    const close = page.locator('#ctrlclose');
    await close.scrollIntoViewIfNeeded();
    const bounds = await close.boundingBox();
    assert(bounds && bounds.y + bounds.height <= height);
    await capture(page, `controls-${width}-scale-${value}`);
    await close.click();
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await scale(page, 1);
  await page.click('[data-tab="codex"]');
  await page.click('#cchips [data-c="Outfits"]');
  assert.equal(await page.locator('#clist [data-k="o9021"]').count(), 0);
  assert(!(await page.locator('#clist').innerText()).includes('Rift Harness'));
  await page.fill('#cq', 'Rift Harness');
  assert.equal(await page.locator('#clist .it').count(), 0);
  await page.fill('#cq', '');
  const ordinary = page.locator('#clist .it').first();
  await ordinary.evaluate((row) => {
    (row as HTMLElement).dataset.k = 'o9021';
  });
  await ordinary.click();
  assert(
    !(await page.locator('#clist').innerText()).includes('Rift Harness'),
    'Stale detail navigation cannot reveal story equipment',
  );
  assert.equal(await page.locator('#cback').count(), 0);
  assert.equal(await page.evaluate(() => G.you!.story.done.includes('harness')), false);
  await page.close();

  const index = await browser.newPage({ viewport: { width: 3440, height: 1440 } });
  index.on('pageerror', (error) => errors.push(String(error)));
  await index.addInitScript(() => {
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.uiPolishSocket = this;
      }
    };
  });
  await index.goto(origin);
  await index.locator('[data-slot="Index Viewer"]').click();
  await index.waitForFunction(() => G.you && G.landed);
  await index.locator('#depart').click();
  await index.waitForFunction(
    () =>
      G.view &&
      !G.landed &&
      [...G.ents.values()].filter((entity) =>
        [910, 911, 912, 916, 919, 921, 923].includes(entity.hull),
      ).length >= 7,
  );
  await index.evaluate(() => {
    G.zoom = 0.35;
  });
  await index.waitForFunction(() => {
    const entities = [...G.ents.values()].filter((entity) =>
      [910, 911, 912, 916, 919, 921, 923].includes(entity.hull),
    );
    return entities.every((first, left) =>
      entities
        .slice(left + 1)
        .every(
          (second) =>
            Math.hypot(first.x - second.x, first.y - second.y) >
            (G.A!.ships[first.hull].size + G.A!.ships[second.hull].size) * 0.95 + 50,
        ),
    );
  });
  await capture(index, 'index-mixed-fleet-3440');
  await index.click('#hailindicator');
  await index.locator('#hailopts button').filter({ hasText: 'Index Mutable' }).first().click();
  await index.waitForFunction(() => {
    const image = document.getElementById('hailportrait') as HTMLImageElement;
    return image.src.includes('ships/912_yard.png') && image.complete && image.naturalWidth > 0;
  });
  await index.locator('#hailportrait').evaluate((image: HTMLImageElement) => image.decode());
  assert.match(
    (await index.locator('#hailportrait').getAttribute('src')) || '',
    /ships\/912_yard\.png/,
  );
  await capture(index, 'index-incoming-ship-hail');
  await index.locator('#hailopts button').filter({ hasText: 'CLOSE' }).last().click();
  await index.route('**/ships/912_yard.png*', (route) => route.abort());
  await index.evaluate(async () => {
    (await import('/artwork.js')).setArtworkVersion('missing-machine-fixture');
  });
  await index.click('#hailindicator');
  await index.locator('#hailopts button').filter({ hasText: 'Index Mutable' }).first().click();
  await index.waitForFunction(
    () =>
      (document.getElementById('hailportrait') as HTMLImageElement).src.includes('910_yard.png') &&
      (document.getElementById('hailportrait') as HTMLImageElement).complete,
  );
  assert(
    !((await index.locator('#hailportrait').getAttribute('src')) || '').includes('portraits/'),
  );
  await capture(index, 'index-missing-art-ship-fallback');
  await index.locator('#hailopts button').filter({ hasText: 'CLOSE' }).last().click();
  await index.route('**/ships/910_yard.png*', (route) => route.abort());
  await index.evaluate(async () => {
    (await import('/artwork.js')).setArtworkVersion('missing-all-machine-fixture');
  });
  // The inbox already hides the portrait; observe this conversation's failed requests first.
  const missingPrimary = index.waitForRequest((request) =>
    request.url().includes('912_yard.png?v=missing-all-machine-fixture'),
  );
  const missingFallback = index.waitForRequest((request) =>
    request.url().includes('910_yard.png?v=missing-all-machine-fixture'),
  );
  await index.click('#hailindicator');
  await index.locator('#hailopts button').filter({ hasText: 'Index Mutable' }).first().click();
  await Promise.all([missingPrimary, missingFallback]);
  await index.waitForFunction(
    () =>
      document.getElementById('hailportraitwindow')!.classList.contains('hidden') &&
      !document.getElementById('hailportrait')!.hasAttribute('src'),
  );
  assert.equal(await index.locator('#hailportrait').getAttribute('src'), null);
  assert.deepEqual(errors, []);
  filesystem.writeFileSync(
    path.join(output, 'measurements.json'),
    JSON.stringify(
      {
        measurements,
        errors,
        shipOnlyHails: true,
        missingArtNeverHumanoid: true,
        codexStoryItemHidden: true,
      },
      null,
      2,
    ),
  );
  console.log(
    'UI polish: usable-flight landing ratios, two-column/narrow Controls, Codex spoiler denial and actual separated Index fleet/ship-only hails with missing-art fallback passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
