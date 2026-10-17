// Native controls stay native: real station navigation, assignment and keyboard input.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const out = evidenceDir('dropdowns');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-dropdowns-'));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', './test/seed-random.js', 'server/main.js'], {
  cwd: root,
  env: {
    ...process.env,
    SOLO: '',
    PORT: String(port),
    DATA_DIR: path.join(dir, 'data'),
    SEEDS_FILE: path.join(root, 'server/seeds.json'),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
const errors = [],
  inventory = [];
const baseline = process.env.RIFT_DROPDOWN_BASELINE === '1';
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
    colorScheme: 'light',
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  async function audit(surface, selector = 'select') {
    const styles = await page.locator(selector).evaluateAll((nodes) =>
      nodes.map((e) => {
        const s = getComputedStyle(e);
        return {
          id: e.id || e.outerHTML.slice(0, 100),
          background: s.backgroundColor,
          color: s.color,
          scheme: s.colorScheme,
          options: [...e.querySelectorAll('option, optgroup')].map((o) => ({
            background: getComputedStyle(o).backgroundColor,
            color: getComputedStyle(o).color,
          })),
        };
      }),
    );
    assert.ok(styles.length, surface);
    inventory.push({ surface, styles });
    if (!baseline)
      for (const s of styles) {
        assert.equal(s.background, 'rgb(0, 0, 0)', surface + ' closed background');
        assert.equal(s.color, 'rgb(255, 255, 255)', surface + ' closed text');
        assert.equal(s.scheme, 'dark', surface + ' native popup scheme');
        for (const o of s.options) {
          assert.equal(o.background, 'rgb(0, 0, 0)', surface + ' option background');
          assert.equal(o.color, 'rgb(255, 255, 255)', surface + ' option text');
        }
      }
  }
  async function capture(name) {
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
  }
  await page.goto(origin);
  await audit('login document / map commodity and initialized dynamic controls');
  await capture('login');
  await page.locator('#lname').fill('KNIGHT');
  await page.locator('#lpass').fill('1234');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 10 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="station"]').click();
  await audit('station relocation', '#relsite');
  await page.locator('#landbody [data-act="stab"][data-k="hangar"]').click();
  await page.locator('#landbody select[data-crew]').first().waitFor();
  await audit('hangar crew and shuttle jobs', '#landbody select');
  await capture('hangar-reference');
  await page.locator('#landbody [data-act="stab"][data-k="docks"]').click();
  const pick = page.locator('#landbody .dpick[data-dk="0"][data-slot="0"]');
  await pick.waitFor();
  await audit('dynamic docks ship selectors', '#landbody select');
  await capture('docks-closed');
  await pick.click();
  await capture('docks-open-attempt');
  await page.keyboard.press('Escape');
  const uid = await pick
    .locator('option')
    .evaluateAll((os) => os.find((o) => o.value && !o.selected).value);
  await pick.selectOption(uid);
  await page.waitForFunction((uid) => G.you.docks.list[0].wings[0]?.uid === uid, uid);
  await audit('docks re-render with captain and crew', '#landbody select');
  await pick.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  if (!baseline) {
    const focus = await pick.evaluate((e) => ({
      focused: e.matches(':focus-visible'),
      outline: getComputedStyle(e).outlineWidth,
    }));
    assert.equal(focus.focused, true);
    assert.equal(focus.outline, '2px');
  }
  await capture('docks-keyboard-focus');
  await page.locator('[data-lt="yard"]').click();
  await audit('shipyard sort', '#ysort');
  const wallet = await page.evaluate(() => ({ credits: G.you.credits, hull: G.you.ship.hull }));
  const card = page.locator('#landbody [data-act="sel"]').last();
  await card.scrollIntoViewIfNeeded();
  const selectedHull = Number(await card.getAttribute('data-h'));
  assert.ok(await page.locator('#landbody').evaluate((e) => e.scrollTop > 100));
  await capture('shipyard-scrolled-before-selection');
  await card.click();
  await page.waitForFunction((h) => G.sel === h, selectedHull);
  await capture('shipyard-selected-top');
  if (!baseline) assert.equal(await page.locator('#landbody').evaluate((e) => e.scrollTop), 0);
  if (!baseline) {
    const bounds = await page.locator('#landbody').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return [...e.querySelectorAll('.detail .kv, .detail button[data-act="buyhangar"]')].map(
        (n) => {
          const b = n.getBoundingClientRect();
          return b.top >= r.top && b.bottom <= r.bottom;
        },
      );
    });
    assert.ok(bounds.length > 3 && bounds.every(Boolean), 'purchase button and stats visible');
  }
  await page.locator('#landbody [data-act="sel"]').last().scrollIntoViewIfNeeded();
  const browsingTop = await page.locator('#landbody').evaluate((e) => e.scrollTop);
  // The production background renderer must not jump a captain back to details.
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await page.locator('#landbody').evaluate((e) => e.scrollTop), browsingTop);
  assert.equal(await page.evaluate(() => G.sel), selectedHull);
  assert.deepEqual(
    await page.evaluate(() => ({ credits: G.you.credits, hull: G.you.ship.hull })),
    wallet,
  );
  await page.locator('#ysort').scrollIntoViewIfNeeded();
  await page.locator('#ysort').focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () => G.ysort === document.querySelector('#ysort').value && G.ysort !== 'cost',
  );
  await capture('shipyard');
  await page.locator('[data-lt="refinery"]').click();
  await audit('refinery recipe grade service', '#landbody select');
  await page.selectOption('#refgrade', 'pure');
  assert.equal(await page.locator('#refgrade').inputValue(), 'pure');
  await capture('refinery');
  await page.locator('#optbtn').click();
  await capture('options-no-dropdowns');
  await page.locator('#optclose').click();
  await page.locator('#cbmap').click();
  await audit('map commodity', '#gcid');
  await capture('map');
  // Synthetic edge fixture only: no current optgroups/disabled options in game markup.
  await page.evaluate(() => {
    const s = document.createElement('select');
    s.id = 'dropdown-edge';
    s.innerHTML =
      '<optgroup label="Group"><option>Available</option><option disabled>Unavailable</option></optgroup>';
    document.body.append(s);
  });
  if (!baseline) {
    const edge = await page.locator('#dropdown-edge').evaluate((e) => {
      const o = e.querySelector('option:disabled');
      e.disabled = true;
      return {
        bg: getComputedStyle(e).backgroundColor,
        text: getComputedStyle(e).color,
        option: getComputedStyle(o).color,
        opacity: getComputedStyle(e).opacity,
        group: getComputedStyle(e.querySelector('optgroup')).backgroundColor,
      };
    });
    assert.deepEqual(edge, {
      bg: 'rgb(0, 0, 0)',
      text: 'rgb(170, 170, 170)',
      option: 'rgb(170, 170, 170)',
      opacity: '1',
      group: 'rgb(0, 0, 0)',
    });
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(out, 'styles.json'), JSON.stringify(inventory, null, 2));
  console.log(
    'PASS native dropdown theme, real dock assignment/re-render, keyboard sort/focus, representative screens',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
