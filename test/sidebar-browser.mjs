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
              visible: v.left >= r.left - 1 && v.right <= r.right + 1,
            };
          }),
      };
    });
  for (const c of [
    { name: 'default', w: 1440, h: 1000, s: 1 },
    { name: 'desktop-1280', w: 1280, h: 800, s: 1 },
    { name: 'compact-1024', w: 1024, h: 768, s: 1 },
    { name: 'short-1280', w: 1280, h: 650, s: 1 },
    { name: 'narrow', w: 1440, h: 1000, s: 1, hud: 280 },
    { name: 'scaled-small', w: 1280, h: 800, s: 1.4, hud: 280 },
    { name: 'scaled-default', w: 1440, h: 1000, s: 1.4 },
    { name: 'scaled-down', w: 1280, h: 800, s: 0.8 },
  ]) {
    await page.setViewportSize({ width: c.w, height: c.h });
    await page.evaluate((c) => {
      document.documentElement.style.removeProperty('--tray-width');
      if (c.hud) document.documentElement.style.setProperty('--tray-width', c.hud + 'px');
      document.documentElement.style.setProperty('--ui', String(c.s));
      document.body.classList.toggle('scaled', c.s !== 1);
      document.querySelector('#ctabs').scrollLeft = 0;
      dispatchEvent(new Event('resize'));
    }, c);
    await page.waitForTimeout(150);
    await page.locator('#ctabs').scrollIntoViewIfNeeded();
    const before = await measure();
    assert.equal(before.pageOverflow, false);
    assert.equal(before.tabs.length, 7);
    assert.ok(Math.abs(before.hudWidth + before.canvasWidth - c.w) < 2);
    assert.ok(before.tabs[0].visible, 'Compact tray starts at the first tab');
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
  await page.evaluate(() => {
    localStorage.setItem('rift.hud', '333');
    localStorage.setItem('rift.name', 'Sidebar QA');
  });
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
    JSON.stringify({ results, styles, savedWidth: 333, errors }, null, 2),
  );
  console.log(JSON.stringify({ cases: results.length, styles, savedWidth: 333, errors }));
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, logfile, dir);
}

process.exit(0);
