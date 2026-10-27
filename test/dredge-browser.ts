import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';

import { dredgeFixture, until } from './helpers/dredge-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await dredgeFixture('dredge-browser');
let browser;
const errors: string[] = [],
  missing: string[] = [];
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1100 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  page.on('pageerror', (event) => errors.push(String(event)));
  page.on('response', (result) => {
    if (result.status() >= 400 && result.url().includes('815')) missing.push(result.url());
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      'rift.opts',
      JSON.stringify({
        v21: true,
        keys: { fire2: 'KeyF', dredgeSweep: 'Backquote' },
        preset: 'industrial-custom',
        cb: true,
        shake: false,
        mute: true,
        mouseAim: true,
      }),
    ),
  );
  await page.goto(feature.origin);
  await page.fill('#lname', 'Dredge Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="station"]').click();
  await page.locator('[data-act="stab"][data-k="specialists"]').click();
  await page.locator('#landbody [data-act="spec"][data-op="build"][data-id="815"]').click();
  await page.waitForFunction(() => G.you!.ship.hull === 815);
  assert.equal(await page.evaluate(() => G.you!.cargo.plasma || 0), 0);
  await page.screenshot({ path: path.join(feature.out, 'stock-built-shipyard.png') });
  await page.locator('#depart').click();
  await page.locator('#miningindicator').click();
  await page.locator('#industrialindicator').click();
  await page.waitForSelector('#industrialcontrols:not([hidden])');
  await page.waitForFunction(() => G.industrial?.version === 1);
  assert.match((await page.locator('#dredgeSweep').textContent())!, /`/);
  assert.match((await page.locator('#dredgeHarvest').textContent())!, /]/);
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => G.industrial!.sweep);
  await page.locator('#industrialoff').click();
  await page.waitForFunction(() => !G.industrial!.sweep);
  assert.match((await page.locator('#industrialoff').textContent())!, /ALL OFF/);
  // Already-active harvesting must stop even when stationary keep-out completes
  // FULL STOP in the same production input tick (the final auto mode is null).
  assert.ok(await page.evaluate(() => Math.hypot(G.view!.vx, G.view!.vy) < 6));
  await page.locator('#dredgeHarvest').click();
  await page.waitForFunction(() => G.industrial!.harvest);
  await page.evaluate(async () => {
    const { SYS: systemsById } = await import('/shared/galaxy.js');
    G.auto = { mode: 'land', id: systemsById[G.sys!].stellars[0].id };
  });
  await page.waitForFunction(() =>
    document.getElementById('toasts')!.textContent.includes('stellar collector keep-out'),
  );
  await page.waitForFunction(() => !G.auto);
  await page.waitForFunction(() => !G.industrial!.harvest);
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.industrial.harvest === false,
    'authoritative harvest cancelled after stationary rejected navigation',
  );

  await page.locator('#dredgeHarvest').click();
  await page.waitForFunction(() => G.industrial!.harvest);
  await page.waitForFunction(() => G.you!.cargo.plasma >= 5, {}, { timeout: 20000 });
  await page.locator('#industrialoff').click();
  await page.waitForFunction(() => !G.industrial!.harvest);
  await page.waitForFunction(() =>
    document.getElementById('industrialheat')!.textContent.includes('CORONA HEATING — EXIT BAND'),
  );

  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.fighters.length > 0,
    'fitted fighter bay F launches',
  );
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.input2 === 0,
    'first F release reached server',
  );
  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.fighters.length === 0,
    'F recalls fitted fighter, not industrial modes',
  );
  await page.locator('#dredgeSweep').click();
  await page.keyboard.down('KeyW');
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.drones.length === 2,
    'two real moving industrial collectors',
  );
  await page.keyboard.up('KeyW');
  await page.locator('#industrialoff').click();
  await until(
    () =>
      feature.read()?.pilots.find((player: { name: string }) => player.name === 'Dredge Alpha')
        ?.drones.length === 0,
    'utility recall',
  );
  assert.match((await page.locator('#industrialheat').textContent())!, /SHIP HEAT.*cutoff/);
  assert.equal(await page.locator('#industrialproperty').isVisible(), false);
  await page.getByText('Processing details', { exact: true }).click();
  assert.match(
    (await page.locator('#industrialproperty').textContent())!,
    /SWEEP.*SMELTER.*CORONA/,
  );
  await page.getByText('Processing details', { exact: true }).click();
  assert.match(
    (await page.locator('#miningmeter').textContent())!,
    /heat|contact|material|Scan to reveal/i,
  );
  assert.equal(await page.evaluate(() => G.opts.keys.fire2), 'KeyF');
  assert.equal(await page.evaluate(() => G.opts.preset), 'industrial-custom');
  for (const scale of [0.8, 1, 1.4]) {
    await page.evaluate((scale) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', String(scale));
    }, scale);
    await page.waitForTimeout(100);
    const bounds = await page.locator('#industrialcontrols').boundingBox();
    assert.ok(
      bounds!.x >= 0 &&
        bounds!.x + bounds!.width <= 1501 &&
        bounds!.y >= 0 &&
        bounds!.y + bounds!.height <= 1101,
      'all safe controls in viewport',
    );
    await page.screenshot({ path: path.join(feature.out, `industrial-scale-${scale}.png`) });
  }
  const sprites = await page.evaluate(async () => {
    const { sheet, drawShip } = await import('/render.js'),
      { shipBank } = await import('/ship_banking.js');
    const canvasHeight = G.A!.ships[815],
      image = sheet(canvasHeight),
      glow = sheet(canvasHeight, true);
    await Promise.all([image.decode(), glow.decode()]);
    if (
      image.naturalWidth !== 2400 ||
      image.naturalHeight !== 1800 ||
      glow.naturalWidth !== 2400 ||
      glow.naturalHeight !== 1800
    )
      throw Error('sprite dimensions');
    const scratch = document.createElement('canvas');
    scratch.width = scratch.height = 200;
    const context = scratch.getContext('2d'),
      hashes = [];
    let minMargin = 200;
    for (let index = 0; index < 108; index++) {
      context!.clearRect(0, 0, 200, 200);
      context!.drawImage(
        image,
        (index % 12) * 200,
        Math.floor(index / 12) * 200,
        200,
        200,
        0,
        0,
        200,
        200,
      );
      const data = context!.getImageData(0, 0, 200, 200).data;
      let opaque = 0;
      for (let verticalPosition = 0; verticalPosition < 200; verticalPosition++)
        for (let horizontalPosition = 0; horizontalPosition < 200; horizontalPosition++)
          if (data[(verticalPosition * 200 + horizontalPosition) * 4 + 3]) {
            opaque++;
            minMargin = Math.min(
              minMargin,
              horizontalPosition,
              verticalPosition,
              199 - horizontalPosition,
              199 - verticalPosition,
            );
          }
      if (!opaque) throw Error('empty frame');
      hashes.push(
        Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).join(','),
      );
    }
    const contact = document.createElement('canvas');
    contact.width = 2400;
    contact.height = 1800;
    const drawingContext = contact.getContext('2d');
    for (let bank = 0; bank < 3; bank++)
      for (let heading = 0; heading < 36; heading++) {
        const angle = (heading * Math.PI) / 18,
          delta = bank === 1 ? 0.3 : bank === 2 ? -0.3 : 0,
          entity: Partial<import('../client/render.ts').RenderShip> & {
            a: number;
            t: number;
            _bank?: import('../client/ship_banking.ts').BankState;
          } = { id: -99, hull: 815, a: angle - delta, fl: 1, t: 1000 };
        shipBank(entity, 1000);
        entity.a = angle;
        entity.t = 1200;
        const index = heading + bank * 36;
        drawShip(
          G,
          drawingContext!,
          entity as import('../client/render.ts').RenderShip,
          (index % 12) * 200 + 100,
          Math.floor(index / 12) * 200 + 100,
          1,
          1200,
        );
        if (entity._bank!.bank !== bank) throw Error('real bank derivation mismatch');
      }
    return {
      frames: 108,
      unique: new Set(hashes).size,
      minMargin,
      data: contact.toDataURL('image/png'),
    };
  });
  assert.equal(sprites.unique, 108);
  assert.ok(sprites.minMargin >= 8);
  fileSystem.writeFileSync(
    path.join(feature.out, 'runtime-108-headings-banks-glow.png'),
    Buffer.from(sprites.data.split(',')[1], 'base64'),
  );
  fileSystem.writeFileSync(
    path.join(feature.out, 'sprite-verification.json'),
    JSON.stringify({
      frames: sprites.frames,
      unique: sprites.unique,
      minMargin: sprites.minMargin,
    }),
  );
  for (const name of ['dredge-blueprint', 'dredge-plasma', 'dredge-part'])
    assert.equal(
      (await page.request.get(feature.origin + '/assets/icons/' + name + '.png')).status(),
      200,
    );
  assert.deepEqual(missing, []);
  assert.deepEqual(errors, []);
  console.log(
    'Actual stock shipyard build, custom/default controls, finite plasma, source-labelled heat, scales/reduced motion and 108 unique production-rendered heading/bank/glow frames.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
