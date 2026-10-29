import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { launchChromium } from './helpers/chromium.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

declare global {
  interface Window {
    /** Packets observed only in this isolated onboarding regression. */
    onboardingPackets: Array<{ t: string; [key: string]: unknown }>;
  }
}
const output = evidenceDir('onboarding');
const directory = tempDataDir('onboarding-');
const database = new DB(path.join(directory, 'data'));
const assets = JSON.parse(fileSystem.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const account = Game.prototype.fresh.call({ A: assets }) as ReturnType<Game['fresh']>;
Object.assign(account, { story: { done: ['start'], active: null, step: 0 } });
database.create('Orientation Pilot', 'fixture', account);
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: database.dir,
      SEEDS_FILE: path.join(directory, 'no-seeds'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'], onboarding: true });
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'quantum-rift-onboarding-regression',
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('rift.opts', JSON.stringify({ mute: true, keys: { thrust: 'KeyV' } }));
    window.onboardingPackets = [];
    // oxlint-disable-next-line typescript/unbound-method -- Preserve the receiver for explicit call below.
    const original = WebSocket.prototype.send;
    WebSocket.prototype.send = function (data) {
      if (typeof data === 'string') window.onboardingPackets.push(JSON.parse(data));
      return original.call(this, data);
    };
  });
  await page.goto(origin);
  await page.locator('[data-slot="Orientation Pilot"]').click();
  await page.waitForFunction(
    () => G.you && G.landed && !document.getElementById('onboarding')!.classList.contains('hidden'),
  );
  assert.equal(
    await page.locator('#hud').evaluate((element) => (element as HTMLElement).inert),
    false,
  );
  assert.equal(await page.locator('#land').isVisible(), false);
  assert.equal(await page.locator('#tut').isVisible(), false);
  await page.evaluate(() => (window.onboardingPackets = []));
  for (const key of ['w', 'Space', 'l', 'j', 'r']) await page.keyboard.press(key);
  await page.locator('#cbmap').click({ force: true });
  assert.equal(await page.locator('#gmap').isVisible(), false);
  assert.equal(await page.evaluate(() => !!G.landed), true);
  assert.deepEqual(
    await page.evaluate(() =>
      window.onboardingPackets.filter((packet) => !['input', 'ping'].includes(packet.t)),
    ),
    [],
    'onboarding never sends a gameplay action',
  );
  const geometry = async () =>
    page.evaluate(() => {
      const card = document.querySelector('.intro-callout')!.getBoundingClientRect();
      const spot = document.querySelector('.intro-spot')!.getBoundingClientRect();
      return {
        title: document.getElementById('onboarding-title')!.textContent,
        inside:
          card.left >= 0 && card.top >= 0 && card.right <= innerWidth && card.bottom <= innerHeight,
        overlap:
          Math.max(0, Math.min(card.right, spot.right) - Math.max(card.left, spot.left)) *
          Math.max(0, Math.min(card.bottom, spot.bottom) - Math.max(card.top, spot.top)),
      };
    });
  // The Space press advances through native button activation. Replay starts at the first step.
  await page.locator('[data-intro="skip"]').click();
  await page.locator('[data-intro="skip"]').click();
  assert.equal(await page.locator('#land').isVisible(), true);
  await page.locator('#cbhelp').click();
  await page.locator('#introreplay').click();
  await page.waitForTimeout(250);
  const expectedSidebarTabs = await page
    .locator('#ctabs > button:visible')
    .evaluateAll((buttons) =>
      buttons.map((button) => `[data-tab="${(button as HTMLElement).dataset.tab}"]`),
    );
  const visibleCockpitButtons = await page
    .locator(
      '#functiondock > button:visible, #consoleutilities button:visible, #chatexpand, #traytoggle, #jumpholo, #cchan > button:visible',
    )
    .evaluateAll((buttons) =>
      buttons.map((button) =>
        button.id ? '#' + button.id : `[data-ch="${(button as HTMLElement).dataset.ch}"]`,
      ),
    );
  const tourTargets: string[] = [];
  let steps = 0;
  while ((await page.locator('#onboarding').getAttribute('data-stage')) === 'tour') {
    await page.waitForTimeout(40);
    const target = (await page.locator('#onboarding').getAttribute('data-tour-target'))!;
    tourTargets.push(target);
    const heading = (await page.locator('#onboarding-title').textContent())!;
    assert(
      heading.split(' ').every((word) => /^[A-Z]/.test(word)),
      heading,
    );
    const spotlightMatchesTarget = await page.locator(target).evaluate((element) => {
      const targetRect = element.getBoundingClientRect();
      const spotRect = document.querySelector('.intro-spot')!.getBoundingClientRect();
      return {
        targetRect: targetRect.toJSON(),
        spotRect: spotRect.toJSON(),
        matches:
          spotRect.left <= targetRect.left &&
          spotRect.top <= targetRect.top &&
          spotRect.right >= targetRect.right &&
          spotRect.bottom >= targetRect.bottom,
      };
    });
    assert(
      spotlightMatchesTarget.matches,
      `spotlight covers the actual ${target} control: ${JSON.stringify(spotlightMatchesTarget)}`,
    );
    if (target === '#ejectshortcut')
      await page.screenshot({ path: path.join(output, 'eject-tour-1920.png') });
    if (target === '#shipshortcut')
      await page.screenshot({ path: path.join(output, 'ship-details-tour-1920.png') });
    const result = await geometry();
    assert(result.inside, JSON.stringify(result));
    assert.equal(result.overlap, 0, JSON.stringify(result));
    await page.locator('[data-intro="next"]').click();
    steps++;
    assert(steps < 50);
  }
  assert.deepEqual(
    tourTargets.slice(0, 4),
    ['#radarwrap', '#status', '#target', '#nav'],
    'start at minimap, then descend through ship status, targeting and navigation',
  );
  assert.deepEqual(
    tourTargets.slice(4, 4 + expectedSidebarTabs.length),
    expectedSidebarTabs,
    'cover every visible sidebar menu in its displayed order before moving to the bottom HUD',
  );
  for (const target of visibleCockpitButtons)
    assert(tourTargets.includes(target), `tour explains every visible cockpit button: ${target}`);
  assert(tourTargets.includes('#shipshortcut'), 'explain the separate ship information button');
  assert(tourTargets.includes('#attentionindicator'), 'explain the targeting/scan alert indicator');
  assert.deepEqual(
    tourTargets.slice(tourTargets.indexOf('#captainshortcut')),
    [
      '#captainshortcut',
      '#hailindicator',
      '#fleetindicator',
      '#combatindicator',
      '#dronesindicator',
      '#attentionindicator',
      '#miningindicator',
      '#industrialindicator',
      '#towingindicator',
      '#cbmap',
      '#ejectshortcut',
      '#shipshortcut',
      '#jumpholo',
    ],
    'tour follows both cockpit rows left to right, starting Captain then Mining, and ends at JUMP',
  );
  assert.equal(new Set(tourTargets).size, tourTargets.length, 'no repeated controls');
  assert.equal(
    await page.locator('#jumpholo').isDisabled(),
    true,
    'tour never enables docked JUMP',
  );
  const sizes: Array<{ width: number; height: number }> = [];
  for (let slide = 0; slide < 10; slide++) {
    await page.waitForFunction(() =>
      [...document.querySelectorAll<HTMLImageElement>('#onboarding img')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    sizes.push(
      await page
        .locator('.intro-image')
        .evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight })),
    );
    if (slide === 3 || slide === 4) {
      assert.equal(
        await page.locator('.intro-image img').getAttribute('src'),
        `assets/onboarding/${slide === 3 ? 'combat' : 'mining'}.webp`,
        'combat and mining use gameplay captures rather than menu screenshots',
      );
      assert(
        (await page.locator('.intro-annotation').count()) > 0,
        'gameplay examples have gold markups',
      );
    }
    if (slide < 3) {
      assert.equal(
        await page.locator('#onboarding-title').textContent(),
        ['Welcome to the Rift', 'Activities', 'Flight Controls'][slide],
      );
      if (slide === 1)
        assert.equal(
          await page.locator('.intro-image img').getAttribute('src'),
          'assets/onboarding/jobs.webp',
        );
      if (slide === 2)
        assert.equal(
          await page.locator('.intro-annotation').count(),
          0,
          'flight has no Your ship annotation',
        );
      await page.screenshot({ path: path.join(output, `briefing-${slide + 1}-1920.png`) });
    }
    if (slide === 2)
      assert(
        (await page.locator('.intro-bindings kbd').allTextContents()).includes('V'),
        'custom key binding is displayed',
      );
    if (slide === 8)
      assert(
        (await page.locator('#onboarding').textContent())!.includes(
          'Visit other star systems to discover new locations.',
        ),
      );
    if (slide >= 6) {
      assert.equal(
        await page.locator('#onboarding-title').textContent(),
        ['Jump Travel', 'Personal Stations', 'Exploration', 'Explore the Rift!'][slide - 6],
      );
      assert.equal(
        await page.locator('.intro-image img').getAttribute('src'),
        `assets/onboarding/${['jump', 'station-hull', 'map', 'station'][slide - 6]}.webp`,
      );
      assert.match(await page.locator('.intro-deck-count').innerText(), /10/);
    }
    if (slide === 6)
      assert.deepEqual(await page.locator('.intro-bindings span').allTextContents(), [
        'Open galaxy map',
        'Initiate jump',
      ]);
    if (slide === 9) {
      assert.equal(await page.locator('.intro-signature').textContent(), '- MAGNUS');
      assert.match(
        await page.locator('.intro-disclosure').innerText(),
        /Claude Opus 5.5, ChatGPT Sol/,
      );
      assert.match(await page.locator('[data-intro="next"]').innerText(), /Finish/);
      await page.locator('[data-intro="back"]').click();
      assert.equal(await page.locator('#onboarding-title').textContent(), 'Exploration');
      await page.locator('[data-intro="next"]').click();
    }
    await page.locator('[data-intro="next"]').click();
  }
  assert(
    sizes.every(
      (size) =>
        Math.abs(size.width / sizes[0]!.width - 1) < 0.01 &&
        Math.abs(size.height / sizes[0]!.height - 1) < 0.01,
    ),
    'every slide uses the same image frame',
  );
  assert.equal(await page.locator('#land').isVisible(), true);
  await page.reload();
  await page.locator('[data-slot="Orientation Pilot"]').click();
  await page.waitForFunction(() => G.you && G.landed);
  assert.equal(await page.locator('#onboarding').isVisible(), false, 'completion remembered');
  await page.locator('#cbhelp').click();
  await page.locator('#introreplay').click();
  await page.setViewportSize({ width: 800, height: 650 });
  await page.waitForTimeout(250);
  const narrow = await geometry();
  assert(narrow.inside, JSON.stringify(narrow));
  assert.equal(narrow.overlap, 0, JSON.stringify(narrow));
  const rootSize = await page.locator('#onboarding').boundingBox();
  assert.equal(rootSize!.width, 800);
  assert.equal(rootSize!.height, 650);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').getAttribute('data-stage'), 'briefing');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').isVisible(), false);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.locator('#captainshortcut').click();
  assert.equal(await page.locator('#infotitle').textContent(), 'CAPTAIN');
  assert.equal(await page.locator('#captainprofile').isVisible(), true);
  assert.equal(await page.locator('#itabs [data-it="ship"]').count(), 0);
  await page.locator('#shipshortcut').click();
  assert.equal(await page.locator('#infotitle').textContent(), 'SHIP DETAILS');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, 'ship-details-menu-1920.png') });
  assert.match((await page.locator('#shipshortcut img').getAttribute('src'))!, /ship-info\.svg$/);
  assert.equal(await page.locator('#itabs').isVisible(), false);
  assert.equal(await page.locator('#infobody').isVisible(), true);
  assert.equal(await page.locator('#captainprofile').isVisible(), false);
  await page.locator('#captainshortcut').click();
  assert.equal(await page.locator('#infotitle').textContent(), 'CAPTAIN');
  assert.equal(await page.locator('#captainprofile').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#infobox').isVisible(), false);
  await page.locator('#shipshortcut').click();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'shipshortcut');
  await page.keyboard.press('KeyI');
  assert.equal(await page.locator('#infotitle').textContent(), 'SHIP DETAILS');
  await page.keyboard.press('KeyO');
  assert.equal(await page.locator('#infotitle').textContent(), 'CAPTAIN');
  await page.keyboard.press('KeyO');
  assert.equal(await page.locator('#infobox').isVisible(), false);
  await page.keyboard.press('KeyI');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#shipshortcut .function-label').textContent(), 'INFO');
  assert.equal(await page.locator('#industrialindicator .function-label').textContent(), 'Refine');
  await page.locator('#ejectshortcut').click();
  assert.equal(await page.locator('#quitbox').isVisible(), true);
  assert.equal(await page.evaluate(() => !!G.you), true, 'EJECT does not log out');
  await page.waitForFunction(() => G.paused);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, 'eject-quit-menu-1920.png') });
  await page.locator('#quitcancel').click();
  await page.waitForFunction(() => !G.paused);
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'ejectshortcut');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#quitbox').isVisible(), true, 'Escape still opens quit menu');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !G.paused);
  assert.equal(await page.locator('#quitbox').isVisible(), false);
  const gridEvidence = [];
  for (const [width, height] of [
    [1920, 1080],
    [1366, 768],
    [800, 650],
    [480, 800],
  ]) {
    await page.setViewportSize({ width, height });
    for (const configuration of [
      { trayOpen: false, scale: 1 },
      { trayOpen: true, scale: 1 },
      { trayOpen: false, scale: 1.5 },
      { trayOpen: true, scale: 1.5 },
    ]) {
      const { trayOpen, scale } = configuration;
      await page.evaluate((value) => {
        document.documentElement.style.setProperty('--ui', String(value));
        document.body.classList.toggle('scaled', value !== 1);
      }, scale);
      await page.evaluate((open) => document.body.classList.toggle('tray-open', open), trayOpen);
      await page.waitForTimeout(250);
      const geometry = await page.evaluate(() => {
        const rect = (id: string) => document.getElementById(id)!.getBoundingClientRect();
        const frame = rect('cockpit'),
          dock = rect('functiondock'),
          chat = rect('consolechat');
        const alert = rect('attentionindicator'),
          ship = rect('shipshortcut');
        const tiles = [...document.querySelectorAll<HTMLElement>('#functiondock > *')].map(
          (tile) => {
            const bounds = tile.getBoundingClientRect();
            const label = tile.querySelector('.function-label')!.getBoundingClientRect();
            return {
              id: tile.id,
              inside:
                bounds.left >= dock.left &&
                bounds.right <= dock.right + 1 &&
                bounds.top >= dock.top &&
                label.bottom <= dock.bottom + 1 &&
                label.left >= bounds.left - 1 &&
                label.right <= bounds.right + 1,
            };
          },
        );
        return {
          tiles,
          completeGrid: tiles.length === 12,
          frame: frame.toJSON(),
          dock: dock.toJSON(),
          chat: chat.toJSON(),
          column: Math.abs(alert.left - ship.left) < 1 && ship.top > alert.top,
          contained:
            dock.left >= frame.left &&
            dock.right <= frame.right &&
            dock.bottom <= frame.bottom &&
            (dock.right <= chat.left || dock.top >= chat.bottom || dock.bottom <= chat.top),
          jumpSeparate: !document
            .getElementById('functiondock')!
            .contains(document.getElementById('jumpholo')),
        };
      });
      assert(
        geometry.completeGrid && geometry.column && geometry.contained && geometry.jumpSeparate,
        JSON.stringify({ width, trayOpen, geometry }),
      );
      assert(
        geometry.tiles.every((tile) => tile.inside),
        JSON.stringify({ width, trayOpen, geometry }),
      );
      gridEvidence.push({ width, height, trayOpen, scale, ...geometry });
    }
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.evaluate(() => {
    document.body.classList.remove('tray-open', 'scaled');
    document.documentElement.style.setProperty('--ui', '1');
  });
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && !G.landed);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, 'hud-grid-1920.png') });
  await page.locator('#traytoggle').click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(output, 'hud-grid-tray-1920.png') });
  fileSystem.writeFileSync(
    path.join(output, 'hud-grid.json'),
    JSON.stringify(gridEvidence, null, 2),
  );
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        steps,
        slides: 10,
        tourTargets,
        everyCockpitButtonCovered: true,
        uniformImageFrames: true,
        completionAndReplay: true,
        blocksGameplay: true,
        narrow,
        clientErrors: errors,
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS onboarding: startup, clockwise complete menu tour, tour geometry, input denial, gameplay examples, uniform slides, live bindings, skip, replay, completion and resize',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
