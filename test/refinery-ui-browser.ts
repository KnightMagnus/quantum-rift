import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { refineryFixture, until } from './helpers/refinery-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await refineryFixture('refinery-ui');
let browser;
const errors: string[] = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
      viewport: { width: 1500, height: 1050 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    }),
    page = await context.newPage();
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.addInitScript(() => {
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.fixtureSocket = this;
      }
    };
    localStorage.setItem(
      'rift.opts',
      JSON.stringify({
        v21: true,
        keys: { fire2: 'KeyF' },
        preset: 'external-custom',
        scale: 1,
        cb: true,
        shake: false,
        mouseAim: true,
      }),
    );
  });
  await page.goto(feature.origin);
  await page.locator('#lname').fill('Refinery Alpha');
  await page.locator('#lpass').fill('fixture');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="refinery"]').click();
  await page.waitForSelector('#refrecipe');
  assert.ok(
    (await page.locator('#refquantity').boundingBox())!.height <= 40,
    'Tonnes input stays a compact single-line control',
  );
  assert.equal(
    await page.locator('#landbody').getByText('YOUR JOBS AND GOODS', { exact: false }).count(),
    1,
  );
  const initial = await page.evaluate(() => G.you!.refinery.ready[0].units);
  assert.equal(initial, 765);
  await page.locator('#landbody [data-refinery="claim"]').first().click();
  await page.waitForFunction(() => G.you!.cargo.alloy_ingots === 1);
  assert.equal(
    await page.evaluate(() => G.you!.refinery.ready[0].units),
    465,
    'realcapacity-limitedclaim',
  );
  await page.selectOption('#refmode', 'instant');
  await page.fill('#refquantity', '3');
  await page.waitForFunction(() => G.refineryQuote?.mode === 'instant');
  await page.selectOption('#refgrade', 'pure');
  await page.waitForFunction(() => G.refineryQuote?.inputs[0].lots.pure === 3);
  await page
    .locator('#refquote')
    .getByText('give no extra output here', { exact: false })
    .waitFor();
  await page.selectOption('#refgrade', 'common');
  await page.fill('#refquantity', '6');
  await page.waitForFunction(() => G.refineryQuote?.inputs[0].lots.common === 6);
  assert.equal(
    await page.locator('#refquantity').inputValue(),
    '6',
    'Automatic price refresh retains the quantity draft',
  );
  assert.equal(
    await page.locator('#refquantity').evaluate((element) => element === document.activeElement),
    true,
    'Automatic refresh does not steal quantity focus',
  );
  await page.fill('#refquantity', '3');
  await page.waitForFunction(() => G.refineryQuote?.inputs[0].lots.common === 3);
  assert.equal(
    await page.locator('[data-refinery="quote"]').count(),
    0,
    'No manual quote-management action',
  );
  assert.doesNotMatch(
    await page.locator('#refquote').innerText(),
    /binding|arbitrage|entitlement|quote q\d/i,
  );
  await page
    .locator('#refquote')
    .getByText('85% of the usable material', { exact: false })
    .waitFor();
  // Actual unrelated network reply between pointerdown/up must not replace confirm.
  const button = page.locator('#refquote [data-refinery="submit"]'),
    boundingBox2 = await button.boundingBox(),
    credits = await page.evaluate(() => G.you!.credits);
  const viewportBody = await page.locator('#landbody').boundingBox();
  assert.ok(
    boundingBox2!.y + boundingBox2!.height <= viewportBody!.y + viewportBody!.height,
    'Main refining action is visible without an extra desktop scroll',
  );
  await page.mouse.move(
    boundingBox2!.x + boundingBox2!.width / 2,
    boundingBox2!.y + boundingBox2!.height / 2,
  );
  await page.mouse.down();
  await page.evaluate(() => {
    // Simulate the loading sentinel until the server refreshes rivals.
    Object.assign(G, { rivals: null });
    window.fixtureSocket.send(JSON.stringify({ t: 'rivals' }));
  });
  await page.waitForFunction(() => Array.isArray(G.rivals));
  await page.mouse.up();
  await page.waitForFunction(() => G.you!.refinery.batches.length === 3);
  assert.ok((await page.evaluate(() => G.you!.credits)) < credits);
  await page.selectOption('#refmode', 'stored');
  await page.waitForFunction(() => G.refineryQuote?.mode === 'stored');
  await page.locator('#refquote [data-refinery="submit"]').click();
  await page.waitForFunction(() => G.you!.refinery.batches.at(-1)!.status === 'queued');
  await page.locator('#landbody [data-refinery="cancel"]').last().click();
  await page.waitForFunction(() => G.you!.refinery.batches.at(-1)!.status === 'cancelled');
  await page.locator('#landbody [data-refinery="returns"]').last().click();
  await page.waitForFunction(() =>
    G.you!.refinery.batches.at(-1)!.returns.every(
      (index) => !Object.values(index.lots).some(Boolean),
    ),
  );
  const fuel = await page.evaluate(() => G.you!.fuel);
  await page.locator('#landbody [data-refinery="fuelQuote"]').click();
  await page.waitForFunction(() => G.refineryFuelQuote?.gain === 100);
  await page.locator('#landbody [data-refinery="fuel"]').click();
  await page.waitForFunction(() => G.you!.cargo.fuel_cells === 1);
  assert.equal(await page.evaluate(() => G.you!.fuel), fuel + 100);
  for (const scale of [0.8, 1, 1.4]) {
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', String(scale));
    }, scale);
    await page.locator('#landbody').evaluate((entity) => (entity.scrollTop = 0));
    await page.screenshot({
      path: path.join(feature.out, `refinery-scale-${scale}.png`),
      fullPage: true,
    });
    assert.ok(await page.locator('#refrecipe').isVisible());
  }
  await page.evaluate(() => {
    G.opts.scale = 1;
    document.documentElement.style.setProperty('--ui', '1');
  });
  await page.locator('#depart').click();
  await page.waitForFunction(() => G.view && G.miningRocks);
  await page.keyboard.down('f');
  await until(
    () =>
      feature.read()?.pilots?.find((player: { name: string }) => player.name === 'Refinery Alpha')
        ?.drones?.length > 0,
    'actualFdrone launch',
  );
  await page.keyboard.up('f');
  await page.waitForTimeout(100);
  await page.keyboard.down('f');
  await until(
    () =>
      !feature.read()?.pilots?.find((player: { name: string }) => player.name === 'Refinery Alpha')
        ?.drones?.length,
    'actualFdrone recall',
  );
  await page.keyboard.up('f');
  assert.equal(await page.evaluate(() => G.opts.keys.fire2), 'KeyF');
  assert.equal(await page.evaluate(() => G.opts.preset), 'external-custom');
  await page.keyboard.press('v');
  await page.waitForFunction(() =>
    G.mining!.revealed.some((result) => result.hazard === 'volatile'),
  );
  const rock = await page.evaluate(() =>
    G.miningRocks!.rocks.find((result) => result.ore === 'gas'),
  );
  // Existing mouse-aim primary trigger invokes actual collision, not an authority endpoint.
  const position = await page.evaluate(async (rock) => {
    const { cam: camera } = await import('/render.js');
    const canvasBounds = document.querySelector('canvas')!.getBoundingClientRect();
    return {
      x: canvasBounds.left + ((rock!.x - camera.cx) * camera.z + camera.W / 2) / devicePixelRatio,
      y: canvasBounds.top + ((rock!.y - camera.cy) * camera.z + camera.H / 2) / devicePixelRatio,
    };
  }, rock);
  await page.mouse.move(position.x, position.y);
  await page.mouse.down();
  await page.waitForFunction(() => G.miningHazards?.length > 0);
  // Release and assert before capture latency can advance the volatile timer.
  await page.mouse.up();
  assert.ok((await page.evaluate(() => G.miningPressure!.noise)) >= 70);
  await page.screenshot({
    path: path.join(feature.out, 'volatile-countdown-pressure-hidpi.png'),
    fullPage: true,
  });
  assert.deepEqual(errors, []);
  console.log(
    'ALL REFINERY REAL BROWSER QUOTE / POINTER / PARTIAL / CANCEL / FUEL / SCALED HAZARD TESTS PASSED',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
