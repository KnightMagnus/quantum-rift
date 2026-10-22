import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root as repo,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const output = evidenceDir('sidebar');
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const { DB: Database } = await import(repo + '/server/db.ts');
const { Game } = await import(repo + '/server/game.ts');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-sidebar-'));
// Seed once, then give the child server exclusive ownership of the temporary save.
// A ticking setup Game otherwise starts a second checkpoint writer after 15 seconds.
const nativeInterval = globalThis.setInterval,
  nativeTimeout = globalThis.setTimeout;
let game;
try {
  globalThis.setInterval = Object.assign(() => {
    const timer = nativeInterval(() => {}, 2147483647);
    clearInterval(timer);
    return timer;
  }, nativeInterval);
  globalThis.setTimeout = Object.assign(() => {
    const timer = nativeTimeout(() => {}, 2147483647);
    clearTimeout(timer);
    return timer;
  }, nativeTimeout);
  game = new Game(
    JSON.parse(fileSystem.readFileSync(repo + '/shared/assets.json', 'utf8')),
    new Database(directory),
  );
} finally {
  globalThis.setInterval = nativeInterval;
  globalThis.setTimeout = nativeTimeout;
}
const playerData = game.db.create('Sidebar QA', 'test-only', game.fresh());
playerData.tut = 999;
game.db.touch();
game.db.flush();
const server = spawn(
  process.execPath,
  ['--import', path.join(repo, 'test/helpers/seed-random.ts'), 'server/main.ts'],
  {
    cwd: repo,
    env: {
      ...process.env,
      SOLO: '',
      PORT: String(port),
      DATA_DIR: directory,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const logfile = fileSystem.createWriteStream(output + '/server.log');
server.stdout.pipe(logfile);
server.stderr.pipe(logfile);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({
    headless: true,
    ignoreDefaultArgs: ['--hide-scrollbars'],
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors: string[] = [];
  const stylesheetErrors: string[] = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('response', (response) => {
    if (response.request().resourceType() === 'stylesheet' && !response.ok())
      stylesheetErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', (request) => {
    if (request.resourceType() === 'stylesheet') stylesheetErrors.push(request.url());
  });
  await page.goto(origin);
  const styleCascade = await page.evaluate(() => {
    const sheet = [...document.styleSheets].find((session) =>
      /\/style\.css(?:\?|$)/.test(session.href!),
    );
    const imports = [...sheet!.cssRules].filter((rule) => rule.type === CSSRule.IMPORT_RULE);
    return imports.map((rule) => ({
      path: new URL((rule as CSSImportRule).href, rule.parentStyleSheet!.href!).pathname,
      rules: (rule as CSSImportRule).styleSheet!.cssRules.length,
    }));
  });
  assert.equal(
    styleCascade.length,
    10,
    'all ordered component stylesheets load in the real browser',
  );
  assert.ok(
    styleCascade.every((sheet) => sheet.rules > 0),
    'no empty or missing component styles',
  );
  assert.deepEqual(stylesheetErrors, []);
  fileSystem.writeFileSync(output + '/style-cascade.json', JSON.stringify(styleCascade, null, 2));
  await page.locator('#lname').fill('Sidebar QA');
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('#depart').click();
  await page.waitForFunction(() => !G.landed && G.view);
  assert.equal(await page.evaluate(() => !!G.solo), false);
  await page.click('#traytoggle');
  const captains = page.locator('#ctabs [data-tab=captains]');
  await captains.waitFor({ state: 'visible' });
  // Exercise the production Solo presentation class with the loaded cascade.
  // Server-side Solo restrictions remain covered by v26.js.
  await page.evaluate(() => document.body.classList.add('solo'));
  assert.equal(await captains.isVisible(), false, 'Solo hides the CAPTAINS tab');
  await page.evaluate(() => document.body.classList.remove('solo'));
  assert.equal(await captains.isVisible(), true, 'Online restores the CAPTAINS tab');
  const results = [];
  const shellResults: { state: string; shell: { radar: { w: number }; railMaterial: string } }[] =
    [];
  const measure = () =>
    page.evaluate(() => {
      const tabs = document.querySelector('#ctabs'),
        result = tabs!.getBoundingClientRect(),
        flightHud = document.querySelector('#hud')!.getBoundingClientRect();
      return {
        viewport: innerWidth,
        scale: getComputedStyle(document.body).getPropertyValue('--ui'),
        hudWidth: flightHud.width,
        tabsWidth: result.width,
        scrollWidth: tabs!.scrollWidth,
        clientWidth: tabs!.clientWidth,
        scrollLeft: tabs!.scrollLeft,
        overflow: getComputedStyle(tabs!).overflowX,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        canvasWidth: document.querySelector('#view')!.getBoundingClientRect().width,
        tabs: [...tabs!.querySelectorAll('button')]
          .filter((secondCaptain) => getComputedStyle(secondCaptain).display !== 'none')
          .map((controlElement) => {
            const value = controlElement.getBoundingClientRect();
            return {
              name: controlElement.innerText,
              left: value.left,
              right: value.right,
              top: value.top,
              bottom: value.bottom,
              visible:
                value.left >= result.left - 1 &&
                value.right <= result.right + 1 &&
                value.top >= result.top - 1 &&
                value.bottom <= result.bottom + 1,
            };
          }),
      };
    });
  for (const viewportScenario of [
    { name: 'default', w: 1440, h: 1000, s: 1 },
    { name: 'desktop-1280', w: 1280, h: 800, s: 1 },
    { name: 'unread-99', w: 1440, h: 1000, s: 1, badge: '99' },
    { name: 'unread-99-scaled', w: 1440, h: 1000, s: 1.4, badge: '99' },
    { name: 'compact-1024', w: 1024, h: 768, s: 1 },
    { name: 'short-1280', w: 1280, h: 650, s: 1 },
    { name: 'narrow', w: 1440, h: 1000, s: 1, hud: 280 },
    { name: 'scaled-small', w: 1280, h: 800, s: 1.4, hud: 280 },
    { name: 'scaled-default', w: 1440, h: 1000, s: 1.4 },
    { name: 'scaled-down', w: 1280, h: 800, s: 0.8 },
    { name: 'compact-640', w: 640, h: 700, s: 1 },
    { name: 'compact-640-scaled', w: 640, h: 700, s: 1.4 },
    { name: 'mobile-390-scaled', w: 390, h: 844, s: 1.4 },
  ]) {
    await page.setViewportSize({ width: viewportScenario.w, height: viewportScenario.h });
    await page.evaluate((savedCockpitState) => {
      document.documentElement.style.removeProperty('--tray-width');
      if (savedCockpitState.hud)
        document.documentElement.style.setProperty('--tray-width', savedCockpitState.hud + 'px');
      document.documentElement.style.setProperty('--ui', String(savedCockpitState.s));
      document.body.classList.toggle('scaled', savedCockpitState.s !== 1);
      document.querySelector('#ctabs')!.scrollLeft = 0;
      (document.querySelector('#ctabs [data-tab=captains]')! as HTMLElement).dataset.n =
        savedCockpitState.badge || '';
      dispatchEvent(new Event('resize'));
    }, viewportScenario);
    await page.waitForTimeout(150);
    await page.locator('#radar').scrollIntoViewIfNeeded();
    const radar = await page.locator('#radar').evaluate((element) => {
      const result = element.getBoundingClientRect();
      return {
        width: result.width,
        height: result.height,
        parentWidth: element.parentElement!.getBoundingClientRect().width,
        pixels: [(element as HTMLCanvasElement).width, (element as HTMLCanvasElement).height],
        dpr: devicePixelRatio,
      };
    });
    assert.ok(
      Math.abs(radar.width - radar.height) < 1,
      'System radar remains square: ' + viewportScenario.name,
    );
    assert.equal(radar.pixels[0], radar.pixels[1], 'Radar backing is square without distortion');
    assert.ok(
      Math.abs(radar.width - radar.parentWidth + 10 * viewportScenario.s) < 2,
      'Radar fills sidebar frame width',
    );
    if (viewportScenario.name === 'default')
      assert.ok(radar.width > 400, 'Desktop radar is larger than the old height cap');
    await page.locator('#ctabs').scrollIntoViewIfNeeded();
    const ventLayout = await page.evaluate(() => {
      const vent = document.querySelector('.console-vent');
      const value = vent!.getBoundingClientRect();
      const utilityButtonBounds = document
        .querySelector('#consoleutilities .cbtns')!
        .getBoundingClientRect();
      return {
        parent: vent!.parentElement!.id,
        visible: getComputedStyle(vent!).display !== 'none',
        centerDelta:
          value.x + value.width / 2 - utilityButtonBounds.x - utilityButtonBounds.width / 2,
        below: value.y >= utilityButtonBounds.bottom,
      };
    });
    assert.equal(ventLayout.parent, 'consoleutilities');
    if (ventLayout.visible) {
      assert.ok(
        Math.abs(ventLayout.centerDelta) < 1,
        'Scaled vent centered: ' + viewportScenario.name,
      );
      assert.ok(ventLayout.below);
    }
    const before = await measure();
    assert.equal(before.pageOverflow, false);
    assert.equal(before.tabs.length, 7);
    assert.ok(Math.abs(before.hudWidth + before.canvasWidth - viewportScenario.w) < 2);
    assert.ok(
      before.tabs.every((tabBounds2) => tabBounds2.visible),
      'Every tab is visible without scrolling: ' +
        JSON.stringify({ case: viewportScenario.name, before }),
    );
    assert.ok(before.scrollWidth <= before.clientWidth + 1, 'No horizontal tab scrolling');
    for (let index = 0; index < before.tabs.length; index++)
      for (let secondaryIndex = index + 1; secondaryIndex < before.tabs.length; secondaryIndex++) {
        const firstCaptain = before.tabs[index],
          neighborTab = before.tabs[secondaryIndex];
        assert.ok(
          firstCaptain.right <= neighborTab.left + 1 ||
            neighborTab.right <= firstCaptain.left + 1 ||
            firstCaptain.bottom <= neighborTab.top + 1 ||
            neighborTab.bottom <= firstCaptain.top + 1,
          'Tabs do not overlap',
        );
      }
    if (
      [
        'default',
        'desktop-1280',
        'scaled-default',
        'scaled-down',
        'unread-99',
        'unread-99-scaled',
      ].includes(viewportScenario.name)
    )
      assert.equal(
        new Set(before.tabs.map((tabBounds) => tabBounds.top)).size,
        1,
        'Desktop tabs fit a single row',
      );
    const boundingBox2 = await page.locator('#ctabs').boundingBox();
    await page.mouse.move(boundingBox2!.x + boundingBox2!.width / 2, boundingBox2!.y + 10);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(180);
    const wheel = await measure();
    assert.ok(wheel.tabs.at(-1)!.visible, JSON.stringify(wheel));
    await page.locator('#ctabs button').first().focus();
    for (let index = 0; index < 6; index++) await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    assert.equal(
      await page.evaluate(() => (document.activeElement! as HTMLElement).dataset.tab),
      'log',
    );
    const keyboard = await measure();
    assert.ok(
      keyboard.tabs.at(-1)!.visible,
      JSON.stringify({ case: viewportScenario.name, keyboard }),
    );
    await page.screenshot({ path: output + '/' + viewportScenario.name + '.png' });
    results.push({ case: viewportScenario.name, before, wheel, keyboard });
  }
  // Check the actual shell in both states and after a real pointer drag. Chrome
  // stays outside the scrolling cockpit: the continuous red rail cannot vanish
  // when the narrower console needs vertical scrolling. The decorative fin is removed.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui', '1');
    document.body.classList.remove('scaled');
    document.documentElement.style.setProperty('--tray-width', '520px');
  });
  for (const state of ['expanded', 'resized', 'closed']) {
    if (state === 'resized') {
      const grip = await page.locator('#hudgrip').boundingBox();
      await page.mouse.move(grip!.x + 2, grip!.y + 40);
      await page.mouse.down();
      await page.mouse.move(840, grip!.y + 40, { steps: 8 });
      await page.mouse.up();
    }
    if (state === 'closed') await page.locator('#traytoggle').click();
    await page.locator('#cockpit').evaluate((element2) => {
      element2.scrollTop = 0;
    });
    await page.locator('#hud').evaluate((element3) => {
      element3.scrollTop = 0;
    });
    await page.waitForTimeout(160);
    const shell = await page.evaluate(() => {
      const boundingBox3 = (identifier: string) => {
        const element4 = document.querySelector(identifier),
          result = element4!.getBoundingClientRect();
        return {
          x: result.x,
          y: result.y,
          w: result.width,
          h: result.height,
          position: getComputedStyle(element4!).position,
        };
      };
      return {
        rail: boundingBox3('#viewscreen-trim'),
        wingCount: document.querySelectorAll('.console-wing').length,
        chat: boundingBox3('#consolechat'),
        utility: boundingBox3('#consoleutilities'),
        buttons: boundingBox3('#consoleutilities .cbtns'),
        vent: boundingBox3('.console-vent'),
        radar: boundingBox3('#radar'),
        labels: [...document.querySelectorAll('#consoleutilities .cb')].map((element5) => {
          const result = element5.getBoundingClientRect();
          return {
            w: result.width,
            x: result.x,
            right: result.right,
            label: (element5 as HTMLElement).innerText,
          };
        }),
        railMaterial: getComputedStyle(document.querySelector('#viewscreen-trim')!).backgroundImage,
      };
    });
    assert.ok(
      Math.abs(shell.vent.x + shell.vent.w / 2 - shell.buttons.x - shell.buttons.w / 2) < 1,
      'Vent stays centered beneath utility buttons: ' + state,
    );
    assert.ok(shell.vent.y >= shell.buttons.y + shell.buttons.h, 'Vent stays below controls');
    assert.equal(shell.rail.position, 'fixed');
    assert.equal(shell.wingCount, 0, 'Decorative fin no longer overlaps the main HUD tray');
    assert.ok(shell.chat.w <= 590, 'COMMS has a maximum width');
    assert.ok(
      shell.utility.x >= shell.chat.x + shell.chat.w,
      'Utilities have their own reserved track',
    );
    assert.ok(
      shell.labels.every((controlBounds) => controlBounds.w >= 48),
      'Utility icons and labels are not squished',
    );
    if (state === 'resized') {
      assert.ok(Math.abs(shell.radar.w - shell.radar.h) < 1);
      assert.ok(
        shell.radar.w > shellResults[0].shell.radar.w + 100,
        'Radar grows with pointer drag',
      );
    }
    const frame = await page.screenshot({ path: output + '/shell-' + state + '.png' });
    const redPixels = await page.evaluate(
      async ({ png: pngImage, rail }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + pngImage;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const pixelContext = canvas.getContext('2d');
        pixelContext!.drawImage(image, 0, 0);
        const pixel = (horizontalPosition: number, verticalPosition: number) => [
          ...pixelContext!.getImageData(
            Math.round(horizontalPosition),
            Math.round(verticalPosition),
            1,
            1,
          ).data,
        ];
        return [0.1, 0.28, 0.31, 0.5, 0.7, 0.73, 0.9].map((feature) =>
          pixel(rail.w * feature, rail.y + 2),
        );
      },
      { png: frame.toString('base64'), rail: shell.rail },
    );
    assert.ok(
      redPixels.every(
        ([result, referenceGreen, referenceBlue]) =>
          result > referenceGreen * 1.2 && result > referenceBlue * 1.2,
      ),
      'Actual continuous red rail pixels survive every Tray state',
    );
    if (state !== 'closed')
      await page
        .locator('#radarwrap')
        .screenshot({ path: output + '/shell-' + state + '-radar.png' });
    await page.screenshot({
      path: output + '/shell-' + state + '-console.png',
      clip: { x: 0, y: 760, width: Math.round(shell.rail.w), height: 240 },
    });
    await page.screenshot({
      path: output + '/shell-' + state + '-left-trim.png',
      clip: { x: 0, y: 600, width: 300, height: 220 },
    });
    shellResults.push({ state, shell });
  }
  assert.equal(
    new Set(shellResults.map((result) => result.shell.railMaterial)).size,
    1,
    'Viewscreen rail material stays consistent',
  );
  await page.evaluate(() => {
    localStorage.setItem('rift.hud', '333');
    localStorage.setItem('rift.name', 'Sidebar QA');
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you);
  assert.equal(
    await page.evaluate(() => document.documentElement.style.getPropertyValue('--tray-width')),
    '333px',
  );
  if (await page.locator('#land').isVisible()) {
    await page.locator('#depart').click();
    await page.waitForFunction(() => !G.landed && G.view);
  }
  await page.click('#traytoggle');
  assert.ok(
    Math.abs((await measure()).hudWidth - 280) < 1,
    'Narrow reload temporarily caps, not discards, saved preference',
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  const saved = await measure();
  assert.ok(Math.abs(saved.hudWidth - 333) < 1, 'Preserved narrow preference');
  assert.ok(
    saved.tabs.every((utilityControl) => utilityControl.visible),
    'Old 333px preference reflows all tabs',
  );
  await page.screenshot({ path: output + '/saved-333.png' });
  await page.locator('#ctabs button[data-tab=ops]').click();
  const panel = page.locator('#t-ops');
  await panel.hover();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(120);
  await page.screenshot({ path: output + '/bulletin-red-scrollbars.png' });
  await page.locator('#ctabs button[data-tab=codex]').click();
  await page.locator('#t-codex').hover();
  await page.mouse.wheel(0, 180);
  await page.waitForTimeout(120);
  await page.screenshot({ path: output + '/codex-red-scrollbars.png' });
  await page.locator('#optbtn').click();
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: output + '/options-red-scrollbars.png' });
  const styles = await page.evaluate(() => {
    const identifiers = ['ctabs', 't-ops', 't-codex', 'landbody', 'infobody', 'storein', 'opts'];
    return {
      menus: identifiers.map((identifier) => {
        const element6 = document.getElementById(identifier);
        const session = getComputedStyle(element6!);
        return {
          id: identifier,
          scrollbarColor: session.scrollbarColor,
          scrollbarWidth: session.scrollbarWidth,
        };
      }),
      checkbox: getComputedStyle(document.querySelector('input[type=checkbox]')!).accentColor,
      volume: getComputedStyle(document.querySelector('input[type=range]')!).accentColor,
    };
  });
  for (const session of styles.menus) {
    assert.equal(session.scrollbarColor, 'rgb(208, 42, 34) rgb(8, 20, 25)');
    assert.equal(session.scrollbarWidth, 'thin');
  }
  assert.equal(styles.checkbox, 'rgb(208, 42, 34)');
  assert.equal(styles.volume, 'rgb(208, 42, 34)');
  assert.deepEqual(errors, []);
  assert.deepEqual(stylesheetErrors, []);
  fileSystem.writeFileSync(
    output + '/results.json',
    JSON.stringify({ results, shellResults, styles, savedWidth: 333, errors }, null, 2),
  );
  console.log(JSON.stringify({ cases: results.length, styles, savedWidth: 333, errors }));
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, logfile, directory);
}

process.exit(0);
