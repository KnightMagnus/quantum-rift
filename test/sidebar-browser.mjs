import fs from 'node:fs';
import os from 'node:os';
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
} from './helpers/browser-fixture.mjs';
const out = evidenceDir('sidebar');
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const { DB } = await import(repo + '/server/db.js');
const { Game } = await import(repo + '/server/game.js');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-sidebar-'));
const g = new Game(JSON.parse(fs.readFileSync(repo + '/shared/assets.json')), new DB(dir));
const d = g.db.create('Sidebar QA', 'test-only', g.fresh());
d.tut = 999;
g.db.touch();
g.db.flush();
const server = spawn(
  process.execPath,
  ['--import', path.join(repo, 'test/helpers/seed-random.mjs'), 'server/main.js'],
  {
    cwd: repo,
    env: {
      ...process.env,
      SOLO: '',
      PORT: String(port),
      DATA_DIR: dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const logfile = fs.createWriteStream(out + '/server.log');
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(origin);
  await page.locator('#lname').fill('Sidebar QA');
  await page.locator('#lpass').fill('test-only');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.locator('#depart').click();
  await page.waitForFunction(() => !G.landed && G.view);
  assert.equal(await page.evaluate(() => !!G.solo), false);
  await page.click('#traytoggle');
  const results = [];
  const shellResults = [];
  const measure = () =>
    page.evaluate(() => {
      const tabs = document.querySelector('#ctabs'),
        r = tabs.getBoundingClientRect(),
        hud = document.querySelector('#hud').getBoundingClientRect();
      return {
        viewport: innerWidth,
        scale: getComputedStyle(document.body).getPropertyValue('--ui'),
        hudWidth: hud.width,
        tabsWidth: r.width,
        scrollWidth: tabs.scrollWidth,
        clientWidth: tabs.clientWidth,
        scrollLeft: tabs.scrollLeft,
        overflow: getComputedStyle(tabs).overflowX,
        pageOverflow: document.documentElement.scrollWidth > innerWidth,
        canvasWidth: document.querySelector('#view').getBoundingClientRect().width,
        tabs: [...tabs.querySelectorAll('button')]
          .filter((b) => getComputedStyle(b).display !== 'none')
          .map((b) => {
            const v = b.getBoundingClientRect();
            return {
              name: b.innerText,
              left: v.left,
              right: v.right,
              top: v.top,
              bottom: v.bottom,
              visible:
                v.left >= r.left - 1 &&
                v.right <= r.right + 1 &&
                v.top >= r.top - 1 &&
                v.bottom <= r.bottom + 1,
            };
          }),
      };
    });
  for (const c of [
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
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.evaluate((c) => {
      document.documentElement.style.removeProperty('--tray-width');
      if (c.hud) document.documentElement.style.setProperty('--tray-width', c.hud + 'px');
      document.documentElement.style.setProperty('--ui', String(c.s));
      document.body.classList.toggle('scaled', c.s !== 1);
      document.querySelector('#ctabs').scrollLeft = 0;
      document.querySelector('#ctabs [data-tab=captains]').dataset.n = c.badge || '';
      dispatchEvent(new Event('resize'));
    }, c);
    await page.waitForTimeout(150);
    await page.locator('#radar').scrollIntoViewIfNeeded();
    const radar = await page.locator('#radar').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        width: r.width,
        height: r.height,
        parentWidth: el.parentElement.getBoundingClientRect().width,
        pixels: [el.width, el.height],
        dpr: devicePixelRatio,
      };
    });
    assert.ok(Math.abs(radar.width - radar.height) < 1, 'System radar remains square: ' + c.name);
    assert.equal(radar.pixels[0], radar.pixels[1], 'Radar backing is square without distortion');
    assert.ok(
      Math.abs(radar.width - radar.parentWidth + 10 * c.s) < 2,
      'Radar fills sidebar frame width',
    );
    if (c.name === 'default')
      assert.ok(radar.width > 400, 'Desktop radar is larger than the old height cap');
    await page.locator('#ctabs').scrollIntoViewIfNeeded();
    const before = await measure();
    assert.equal(before.pageOverflow, false);
    assert.equal(before.tabs.length, 7);
    assert.ok(Math.abs(before.hudWidth + before.canvasWidth - c.w) < 2);
    assert.ok(
      before.tabs.every((t) => t.visible),
      'Every tab is visible without scrolling: ' + JSON.stringify({ case: c.name, before }),
    );
    assert.ok(before.scrollWidth <= before.clientWidth + 1, 'No horizontal tab scrolling');
    for (let i = 0; i < before.tabs.length; i++)
      for (let j = i + 1; j < before.tabs.length; j++) {
        const a = before.tabs[i],
          b = before.tabs[j];
        assert.ok(
          a.right <= b.left + 1 ||
            b.right <= a.left + 1 ||
            a.bottom <= b.top + 1 ||
            b.bottom <= a.top + 1,
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
      ].includes(c.name)
    )
      assert.equal(new Set(before.tabs.map((t) => t.top)).size, 1, 'Desktop tabs fit a single row');
    const box = await page.locator('#ctabs').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.wheel(0, 1200);
    await page.waitForTimeout(180);
    const wheel = await measure();
    assert.ok(wheel.tabs.at(-1).visible, JSON.stringify(wheel));
    await page.locator('#ctabs button').first().focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.activeElement.dataset.tab), 'log');
    const keyboard = await measure();
    assert.ok(keyboard.tabs.at(-1).visible, JSON.stringify({ case: c.name, keyboard }));
    await page.screenshot({ path: out + '/' + c.name + '.png' });
    results.push({ case: c.name, before, wheel, keyboard });
  }
  // Check the actual shell in both states and after a real pointer drag. Chrome
  // stays outside the scrolling cockpit: the left fin and continuous red rail
  // cannot vanish when the narrower console needs vertical scrolling.
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--ui', '1');
    document.body.classList.remove('scaled');
    document.documentElement.style.setProperty('--tray-width', '520px');
  });
  for (const state of ['expanded', 'resized', 'closed']) {
    if (state === 'resized') {
      const grip = await page.locator('#hudgrip').boundingBox();
      await page.mouse.move(grip.x + 2, grip.y + 40);
      await page.mouse.down();
      await page.mouse.move(840, grip.y + 40, { steps: 8 });
      await page.mouse.up();
    }
    if (state === 'closed') await page.locator('#traytoggle').click();
    await page.locator('#cockpit').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.locator('#hud').evaluate((el) => {
      el.scrollTop = 0;
    });
    await page.waitForTimeout(160);
    const shell = await page.evaluate(() => {
      const box = (id) => {
        const el = document.querySelector(id),
          r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, position: getComputedStyle(el).position };
      };
      return {
        rail: box('#viewscreen-trim'),
        wing: box('.console-wing'),
        chat: box('#consolechat'),
        utility: box('#consoleutilities'),
        radar: box('#radar'),
        labels: [...document.querySelectorAll('#consoleutilities .cb')].map((el) => {
          const r = el.getBoundingClientRect();
          return { w: r.width, x: r.x, right: r.right, label: el.innerText };
        }),
        red: getComputedStyle(document.querySelector('.console-wing'), '::after').backgroundColor,
        railMaterial: getComputedStyle(document.querySelector('#viewscreen-trim')).backgroundImage,
      };
    });
    assert.equal(shell.rail.position, 'fixed');
    assert.equal(shell.wing.position, 'fixed');
    assert.ok(shell.wing.y < shell.rail.y && shell.wing.y + shell.wing.h > shell.rail.y);
    assert.ok(shell.chat.w <= 590, 'COMMS has a maximum width');
    assert.ok(
      shell.utility.x >= shell.chat.x + shell.chat.w,
      'Utilities have their own reserved track',
    );
    assert.ok(
      shell.labels.every((b) => b.w >= 48),
      'Utility icons and labels are not squished',
    );
    if (state === 'resized') {
      assert.ok(Math.abs(shell.radar.w - shell.radar.h) < 1);
      assert.ok(
        shell.radar.w > shellResults[0].shell.radar.w + 100,
        'Radar grows with pointer drag',
      );
    }
    const frame = await page.screenshot({ path: out + '/shell-' + state + '.png' });
    shell.redPixels = await page.evaluate(
      async ({ png, rail, wing }) => {
        const im = new Image();
        im.src = 'data:image/png;base64,' + png;
        await im.decode();
        const canvas = document.createElement('canvas');
        canvas.width = im.naturalWidth;
        canvas.height = im.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const pixel = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
        return [
          pixel(12, wing.y + 70),
          ...[0.1, 0.28, 0.31, 0.5, 0.7, 0.73, 0.9].map((f) => pixel(rail.w * f, rail.y + 2)),
        ];
      },
      { png: frame.toString('base64'), rail: shell.rail, wing: shell.wing },
    );
    assert.ok(
      shell.redPixels.every(([r, g, b]) => r > g * 1.2 && r > b * 1.2),
      'Actual red fin/continuous rail pixels survive every Tray state',
    );
    if (state !== 'closed')
      await page.locator('#radarwrap').screenshot({ path: out + '/shell-' + state + '-radar.png' });
    await page.screenshot({
      path: out + '/shell-' + state + '-console.png',
      clip: { x: 0, y: 760, width: Math.round(shell.rail.w), height: 240 },
    });
    await page.screenshot({
      path: out + '/shell-' + state + '-left-trim.png',
      clip: { x: 0, y: 600, width: 300, height: 220 },
    });
    shellResults.push({ state, shell });
  }
  assert.equal(
    new Set(shellResults.map((r) => r.shell.red)).size,
    1,
    'Left trim red does not change with Tray state',
  );
  assert.equal(
    new Set(shellResults.map((r) => r.shell.railMaterial)).size,
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
    saved.tabs.every((t) => t.visible),
    'Old 333px preference reflows all tabs',
  );
  await page.screenshot({ path: out + '/saved-333.png' });
  await page.locator('#ctabs button[data-tab=ops]').click();
  const panel = page.locator('#t-ops');
  await panel.hover();
  await page.mouse.wheel(0, 260);
  await page.waitForTimeout(120);
  await page.screenshot({ path: out + '/bulletin-red-scrollbars.png' });
  await page.locator('#ctabs button[data-tab=codex]').click();
  await page.locator('#t-codex').hover();
  await page.mouse.wheel(0, 180);
  await page.waitForTimeout(120);
  await page.screenshot({ path: out + '/codex-red-scrollbars.png' });
  await page.locator('#optbtn').click();
  await page.locator('#opts').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: out + '/options-red-scrollbars.png' });
  const styles = await page.evaluate(() => {
    const ids = ['ctabs', 't-ops', 't-codex', 'landbody', 'infobody', 'storein', 'opts'];
    return {
      menus: ids.map((id) => {
        const el = document.getElementById(id);
        const s = getComputedStyle(el);
        return { id, scrollbarColor: s.scrollbarColor, scrollbarWidth: s.scrollbarWidth };
      }),
      checkbox: getComputedStyle(document.querySelector('input[type=checkbox]')).accentColor,
      volume: getComputedStyle(document.querySelector('input[type=range]')).accentColor,
    };
  });
  for (const s of styles.menus) {
    assert.equal(s.scrollbarColor, 'rgb(208, 42, 34) rgb(8, 20, 25)');
    assert.equal(s.scrollbarWidth, 'thin');
  }
  assert.equal(styles.checkbox, 'rgb(208, 42, 34)');
  assert.equal(styles.volume, 'rgb(208, 42, 34)');
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    out + '/results.json',
    JSON.stringify({ results, shellResults, styles, savedWidth: 333, errors }, null, 2),
  );
  console.log(JSON.stringify({ cases: results.length, styles, savedWidth: 333, errors }));
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, logfile, dir);
}

process.exit(0);
