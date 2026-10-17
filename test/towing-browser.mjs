import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { towingFixture, until } from './helpers/towing-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await towingFixture('towing-browser');
let browser;
const errors = [],
  missing = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  async function pilot(name, keys) {
    const page = await browser.newPage({
      viewport: { width: 1500, height: 1100 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) missing.push(r.url());
    });
    await page.addInitScript(
      (keys) =>
        localStorage.setItem(
          'rift.opts',
          JSON.stringify({
            v21: true,
            keys,
            preset: 'tow-custom',
            cb: true,
            shake: false,
            mute: true,
            mouseAim: true,
          }),
        ),
      keys,
    );
    await page.goto(f.origin);
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
    await page.locator('#depart').click();
    await page.waitForFunction(() => G.view && G.towing?.objects.length);
    await page.waitForFunction(() => document.getElementById('towtoggle').textContent.length > 0);
    return page;
  }
  const page = await pilot('Tow Alpha', { fire2: 'KeyF', towToggle: 'Backquote' });
  assert.match(await page.locator('#towtoggle').textContent(), /Backquote/);
  await page.locator('#miningsurvey').click();
  await page.waitForFunction(() => G.towing.objects[0].revealed);
  // Select actual canvas motherlode, preserving combat target semantics.
  const xy = await page.evaluate(async () => {
    const { cam } = await import('/render.js');
    const o = G.towing.objects[0];
    return {
      x: ((o.x - cam.cx) * cam.z + cam.W / 2) / devicePixelRatio,
      y: ((o.y - cam.cy) * cam.z + cam.H / 2) / devicePixelRatio,
      id: o.id,
    };
  });
  await page.mouse.click(xy.x, xy.y);
  await page.waitForFunction((id) => G.towTarget === id, xy.id);
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => !!G.towing.attached);
  await page.waitForFunction(() =>
    document.getElementById('towstatus').textContent.includes('HARD TOW CAP 60'),
  );
  assert.match(await page.locator('#towstatus').textContent(), /HARD TOW CAP 60/);
  // F remains the fighter bay, not a towing shortcut.
  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () => f.read()?.pilots.find((x) => x.name === 'Tow Alpha')?.fighters.length > 0,
    'actual F fighter launch',
  );
  await until(
    () => f.read()?.pilots.find((x) => x.name === 'Tow Alpha')?.input2 === 0,
    'F released',
  );
  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () => f.read()?.pilots.find((x) => x.name === 'Tow Alpha')?.fighters.length === 0,
    'F fighter recall',
  );
  // Slow load is allowed to settle; screen capture never holds movement/fire input.
  await page.waitForFunction(
    () => Math.hypot(G.towing.objects[0].vx, G.towing.objects[0].vy) <= 10,
  );
  await page.locator('#towdeliver').click();
  await page.waitForFunction(() =>
    document.getElementById('toasts').textContent.includes('free hold'),
  );
  assert.equal(await page.evaluate(() => G.you.cargo.ore || 0), 0);
  for (const scale of [0.8, 1, 1.4]) {
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', scale);
    }, scale);
    await page.waitForTimeout(100);
    const b = await page.locator('#towcontrols').boundingBox();
    assert.ok(
      b.x >= 0 && b.y >= 0 && b.x + b.width <= 1501 && b.y + b.height <= 1101,
      'tow controls in viewport',
    );
    await page.screenshot({
      path: path.join(f.out, `tow-static-scale-${scale}.png`),
      animations: 'disabled',
    });
  }
  const other = await pilot('Tow Bravo', { fire2: 'KeyF', towToggle: null });
  assert.match(await other.locator('#towtoggle').textContent(), /assign key/);
  await page.locator('#towrecipient').fill('Tow Bravo');
  await page.locator('#towoffer').click();
  await other.waitForSelector('#towaccept:not([hidden])');
  assert.equal(await page.evaluate(() => G.towing.attached), xy.id);
  await other.locator('#towaccept').click();
  await other.waitForFunction(() => !!G.towing.attached);
  await other.waitForFunction(() =>
    document.getElementById('towstatus').textContent.includes('HARD TOW CAP 30'),
  );
  assert.match(await other.locator('#towstatus').textContent(), /HARD TOW CAP 30/);
  await other.locator('#towtoggle').click();
  await other.waitForFunction(
    () => !G.towing.attached && G.towing.objects[0].status === 'detached',
  );
  await other.waitForFunction(() =>
    document.getElementById('towstatus').textContent.includes('GRACE'),
  );
  assert.match(await other.locator('#towstatus').textContent(), /GRACE/);
  await other.locator('#towtoggle').click();
  await other.waitForFunction(() => !!G.towing.attached);
  await other.keyboard.press('i');
  await other.locator('[data-jet="food"][data-n="0"]').click();
  await other.keyboard.press('i');
  await other.waitForFunction(() => !G.you.cargo.food);
  await other.waitForFunction(
    () => Math.hypot(G.towing.objects[0].vx, G.towing.objects[0].vy) <= 10,
  );
  await other.locator('#towdeliver').click();
  await other.waitForFunction(() => G.you.cargo.ore === 24);
  assert.deepEqual(await other.evaluate(() => G.you.cargoLots.byCommodity.ore), {
    common: 18,
    rich: 5,
    pure: 1,
  });
  const art = await page.evaluate(async () => {
    const { MOTHERLODE_ART } = await import('/shared/towing-rules.js');
    return Promise.all(
      Object.values(MOTHERLODE_ART).map(async (a) => {
        const im = new Image();
        im.src = '/assets/objects/' + a.base;
        await im.decode();
        const c = document.createElement('canvas');
        c.width = im.naturalWidth;
        c.height = im.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(im, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        return {
          w: c.width,
          h: c.height,
          alpha: d.some((v, i) => i % 4 === 3 && v === 0),
          opaque: d.some((v, i) => i % 4 === 3 && v > 0),
        };
      }),
    );
  });
  assert.ok(art.every((a) => a.w > 0 && a.h > 0 && a.alpha && a.opaque));
  assert.deepEqual(missing, []);
  assert.deepEqual(errors, []);
  console.log(
    'Real canvas survey/selection, custom and unbound toggle, F fighters, static reduced-motion tether/scales, explicit two-browser transfer, full hold rejection and exact delivery, decoded transparent production rock variants.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
