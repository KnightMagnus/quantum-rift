import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { refineryFixture } from './helpers/refinery-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await refineryFixture('cockpit-qol');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const login = async (name) => {
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
  };
  await page.goto(f.origin);
  await login('Refinery Alpha');
  await page.click('[data-lt="jobs"]');
  const offer = page.locator('#landbody .card:not(.story) [data-act="accept"]:enabled').first();
  await offer.waitFor();
  await offer.click();
  await page.waitForFunction(() => G.you.missions.length > 0);
  await page.click('#traytoggle');
  await page.click('#ctabs [data-tab="missions"]');
  const pin = page.locator('#mlist [data-pin]').first();
  await pin.click();
  const pinnedKey = await page.evaluate(() => G.pinnedObjective);
  assert.ok(pinnedKey);
  assert.equal(await page.locator('#pinned-objective').isVisible(), true);
  assert.equal(await page.locator('#pinned-objective').count(), 1);
  assert.ok(
    (await page.locator('#mlist .mcard').count()) > 0,
    'Pinning keeps other tracking available',
  );
  await page.click('#ctabs [data-tab="codex"]');
  await page.click('#cchips [data-c="Outfits"]');
  await page.fill('#cq', '');
  const list = page.locator('#clist');
  await list.evaluate((el) => {
    el.scrollTop = 160;
  });
  const firstVisible = page.locator('#clist .it').nth(5);
  await firstVisible.focus();
  const itemKey = await firstVisible.getAttribute('data-k');
  const scrollBefore = await list.evaluate((el) => el.scrollTop);
  await page.keyboard.press('Enter');
  await page.locator('#cback').waitFor();
  await page.keyboard.press('Enter');
  assert.equal(
    await page.evaluate(() => document.activeElement.dataset.k),
    itemKey,
    'Back restores the originating item focus',
  );
  assert.ok(
    Math.abs((await list.evaluate((el) => el.scrollTop)) - scrollBefore) < 4,
    'Back restores list position',
  );
  await page.fill('#cq', 'shield');
  await page.click('#ctabs [data-tab="missions"]');
  await page.click('#ctabs [data-tab="codex"]');
  assert.equal(await page.inputValue('#cq'), 'shield');
  assert.equal(await page.locator('#cchips .on').innerText(), 'Outfits');
  await page.click('[data-lt="yard"]');
  await page.selectOption('#ysort', 'cargo');
  await page.locator('#landbody').evaluate((el) => {
    el.scrollTop = 240;
  });
  const top = await page.locator('#landbody').evaluate((el) => el.scrollTop);
  await page.click('[data-lt="refinery"]');
  await page.click('[data-lt="yard"]');
  assert.equal(await page.inputValue('#ysort'), 'cargo');
  assert.ok(
    Math.abs((await page.locator('#landbody').evaluate((el) => el.scrollTop)) - top) < 4,
    'Each landed view retains its scroll',
  );
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem('rift.cockpit.refinery alpha'))?.values?.codexQuery ===
      'shield',
  );
  await page.reload();
  await login('Refinery Alpha');
  if ((await page.locator('#traytoggle').getAttribute('aria-expanded')) !== 'true')
    await page.click('#traytoggle');
  assert.equal(await page.evaluate(() => G.ctab), 'codex');
  assert.equal(await page.inputValue('#cq'), 'shield');
  assert.equal(await page.inputValue('#ysort'), 'cargo');
  assert.equal(
    await page.evaluate(() => G.pinnedObjective),
    pinnedKey,
    'The selected objective survives reconnect',
  );
  await page.click('#ctabs [data-tab="missions"]');
  await page.click('#pinned-objective [data-pin]');
  assert.equal(
    await page.locator('#pinned-objective').isVisible(),
    false,
    'Unpin never picks a replacement',
  );
  await page.click('[data-lt="refinery"]');
  await page.selectOption('#refgrade', 'pure');
  await page.fill('#refquantity', '9');
  await page.getByRole('button', { name: 'CHECK TRADE CARGO' }).click();
  assert.equal(
    await page.evaluate(() => G.ltab),
    'trade',
    'Insufficient grade links directly to the existing Trade view',
  );
  for (const [width, height, scale] of [
    [1500, 1050, 1],
    [1024, 768, 1.4],
    [760, 680, 1],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.body.classList.toggle('scaled', scale !== 1);
      document.documentElement.style.setProperty('--ui', scale);
    }, scale);
    await page.click('#ctabs [data-tab="missions"]');
    await page.locator('#mlist [data-pin]').first().click();
    const bounds = await page.locator('#pinned-objective').boundingBox();
    assert.ok(bounds && bounds.height > 0 && bounds.x >= 0 && bounds.x + bounds.width <= width + 2);
    assert.ok(
      await page.locator('#mlist').evaluate((el) => el.clientHeight > 35),
      'Pinned panel leaves the existing mission list usable',
    );
    assert.equal(
      await page.locator('#pinned-objective').evaluate((el) => el.scrollTop),
      0,
      'A newly pinned objective starts at its heading',
    );
    if (width === 760) {
      const head = await page.locator('.landhead').boundingBox(),
        frame = await page.locator('.landbox').boundingBox();
      assert.ok(
        head.width > frame.width * 0.75,
        'Compact landing header uses the available width, not a clipped implicit column',
      );
    }
    await page.screenshot({ path: path.join(f.out, `qol-${width}-${scale}.png`) });
    await page.locator('#pinned-objective [data-pin]').click();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const other = await browser.newPage();
  await other.goto(f.origin);
  await other.fill('#lname', 'Refinery Bravo');
  await other.fill('#lpass', 'fixture');
  await other.click('#lbtn');
  await other.waitForFunction(() => G.you && G.landed);
  assert.equal(
    await other.evaluate(() => G.pinnedObjective || ''),
    '',
    'Another captain never inherits the pin',
  );
  assert.equal(
    await other.evaluate(() => G.codexQuery || ''),
    '',
    'Another captain never inherits searches',
  );
  assert.deepEqual(errors, []);
  console.log(
    'QoL remembered views/reconnect/profile isolation, one explicit pin, native keyboard detail/back focus, grade next-action and narrow/scaled layouts passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
