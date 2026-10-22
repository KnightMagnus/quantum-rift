import assert from 'node:assert/strict';
import path from 'node:path';
import { type Browser, chromium } from 'playwright';
import { towingFixture, until } from './helpers/towing-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await towingFixture('towing-browser');
let browser: Browser | undefined;
const errors: string[] = [],
  missing: string[] = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  async function pilot(name: string, keys: { fire2: string; towToggle: string | null }) {
    const page = await browser!.newPage({
      viewport: { width: 1500, height: 1100 },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('response', (result: { status: () => number; url: () => string }) => {
      if (result.status() >= 400 && result.url().includes('/assets/')) missing.push(result.url());
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
    await page.goto(feature.origin);
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.locator('#depart').click();
    await page.waitForFunction(() => G.view && G.towing?.objects.length);
    await page.locator('#miningindicator').click();
    await page.locator('#towingindicator').click();
    await page.waitForFunction(() => document.getElementById('towtoggle')!.textContent.length > 0);
    return page;
  }
  const page = await pilot('Tow Alpha', { fire2: 'KeyF', towToggle: 'Backquote' });
  assert.match((await page.locator('#towtoggle').textContent())!, /`/);
  await page.locator('#miningsurvey').click();
  await page.waitForFunction(() => G.towing!.objects[0].revealed);
  // Select actual canvas motherlode, preserving combat target semantics.
  const position = await page.evaluate(async () => {
    const { cam: camera } = await import('/render.js');
    const options = G.towing!.objects[0];
    return {
      x: ((options.x - camera.cx) * camera.z + camera.W / 2) / devicePixelRatio,
      y: ((options.y - camera.cy) * camera.z + camera.H / 2) / devicePixelRatio,
      id: options.id,
    };
  });
  await page.mouse.click(position.x, position.y);
  await page.waitForFunction(
    (identifier: number | undefined) => G.towTarget === identifier,
    position.id,
  );
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => !!G.towing!.attached);
  await page.waitForFunction(() =>
    document.getElementById('towstatus')!.textContent.includes('speed limit 60'),
  );
  assert.match((await page.locator('#towstatus').textContent())!, /speed limit 60/);
  const voice = await page.evaluate(async () => {
    const firstCaptain = await import('/audio.js');
    for (let index = 0; index < 20; index++) firstCaptain.towing(true, 0.5);
    const muted = firstCaptain.debug();
    firstCaptain.setMix({ mute: false, vol: 0.4, sfx: 0.5 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    const live = firstCaptain.debug();
    firstCaptain.setMix({ sfx: 0 });
    await new Promise((resolve2) => setTimeout(resolve2, 400));
    const silent = firstCaptain.debug();
    firstCaptain.setMix({ mute: true });
    return { muted, live, silent };
  });
  assert.equal(voice.muted.towVoices, 1);
  assert.equal(voice.muted.towGain, 0, 'tow voice respects master mute');
  assert.equal(voice.live.towVoices, 1);
  assert.ok(voice.silent.towGain < 0.00001, 'effects mixer attenuates tether voice');
  assert.ok(
    voice.live.towGain > 0 && voice.live.towGain <= 0.003,
    'restrained single voice respects master/effects buses',
  );

  // F remains the fighter bay, not a towing shortcut.
  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () =>
      feature
        .read()
        ?.pilots.find(
          (horizontalPosition: { name: string }) => horizontalPosition.name === 'Tow Alpha',
        )?.fighters.length > 0,
    'actual F fighter launch',
  );
  await until(
    () =>
      feature
        .read()
        ?.pilots.find(
          (horizontalPosition2: { name: string }) => horizontalPosition2.name === 'Tow Alpha',
        )?.input2 === 0,
    'F released',
  );
  await page.keyboard.press('KeyF', { delay: 150 });
  await until(
    () =>
      feature
        .read()
        ?.pilots.find(
          (horizontalPosition3: { name: string }) => horizontalPosition3.name === 'Tow Alpha',
        )?.fighters.length === 0,
    'F fighter recall',
  );
  // Slow load is allowed to settle; screen capture never holds movement/fire input.
  await page.waitForFunction(
    () => Math.hypot(G.towing!.objects[0].vx, G.towing!.objects[0].vy) <= 10,
  );
  await page.locator('#towdeliver').click();
  await page.waitForFunction(() =>
    document.getElementById('toasts')!.textContent.includes('collection zone'),
  );
  assert.equal(await page.evaluate(() => G.you!.cargo.ore || 0), 0);
  const zoomWidths = [];
  for (const scale of [0.8, 1, 1.4]) {
    await page.evaluate((scale: number) => {
      G.opts.scale = scale;
      document.documentElement.style.setProperty('--ui', String(scale));
      document.body.classList.toggle('scaled', scale !== 1);
    }, scale);
    await page.waitForTimeout(100);
    const zoom = await page.evaluate(() => ({
      value: Number(getComputedStyle(document.getElementById('hud')!).zoom),
      scaled: document.body.classList.contains('scaled'),
      width: document.querySelector('#status .lbl')!.getBoundingClientRect().width,
    }));
    assert.equal(zoom.scaled, scale !== 1);
    assert.ok(Math.abs(zoom.value - scale) < 0.001, 'actual production HUD zoom applied');
    zoomWidths.push(zoom.width);
    const secondCaptain = await page.locator('#towcontrols').boundingBox();
    assert.ok(
      secondCaptain!.x >= 0 &&
        secondCaptain!.y >= 0 &&
        secondCaptain!.x + secondCaptain!.width <= 1501 &&
        secondCaptain!.y + secondCaptain!.height <= 1101,
      'tow controls in viewport',
    );
    await page.screenshot({
      path: path.join(feature.out, `tow-static-scale-${scale}.png`),
      animations: 'disabled',
    });
  }
  assert.ok(zoomWidths[2] > zoomWidths[0] * 1.5, 'actual scaled overlay geometry changed');
  const other = await pilot('Tow Bravo', { fire2: 'KeyF', towToggle: null });
  assert.match((await other.locator('#towtoggle').textContent())!, /assign key/);
  await page.getByText('Transfer & towing help', { exact: true }).click();
  await page.locator('#towrecipient').fill('Tow Bravo');
  await page.locator('#towrecipient').blur();
  await page.keyboard.press('Home');
  await other.waitForSelector('#towaccept:not([hidden])');
  assert.equal(await page.evaluate(() => G.towing!.attached), position.id);
  await other.keyboard.press('End');
  await other.waitForFunction(() => !!G.towing!.attached);
  await other.waitForFunction(() =>
    document.getElementById('towstatus')!.textContent.includes('speed limit 30'),
  );
  assert.match((await other.locator('#towstatus').textContent())!, /speed limit 30/);
  await other.locator('#towtoggle').click();
  await other.waitForFunction(
    () => !G.towing!.attached && G.towing!.objects[0].status === 'detached',
  );
  await other.waitForFunction(() =>
    document.getElementById('towstatus')!.textContent.includes('Reserved for'),
  );
  assert.match((await other.locator('#towstatus').textContent())!, /Reserved for/);
  await other.locator('#towtoggle').click();
  await other.waitForFunction(() => !!G.towing!.attached);
  await other.keyboard.press('i');
  await other.locator('[data-jet="food"][data-n="0"]').click();
  await other.keyboard.press('i');
  await other.waitForFunction(() => !G.you!.cargo.food);
  const aimPort = async () => {
    const target = await other.evaluate(async () => {
      const { cam: camera2 } = await import('/render.js'),
        { STELLARS } = await import('/shared/galaxy.js');
      const player = STELLARS[G.towing!.objects[0].ports[0]],
        entity = G.view;
      const horizontalDelta = player.x - entity!.x,
        verticalDelta = player.y - entity!.y,
        playerData = Math.hypot(horizontalDelta, verticalDelta) || 1;
      return {
        x:
          ((entity!.x - camera2.cx) * camera2.z + camera2.W / 2) / devicePixelRatio +
          (horizontalDelta / playerData) * 150,
        y:
          ((entity!.y - camera2.cy) * camera2.z + camera2.H / 2) / devicePixelRatio +
          (verticalDelta / playerData) * 150,
      };
    });
    await other.mouse.move(target.x, target.y);
  };
  await aimPort();
  await other.waitForTimeout(1000);
  await other.keyboard.down('KeyW');
  try {
    await until(
      async () => {
        await aimPort();
        return other.evaluate(() => G.you!.cargo.ore === 24);
      },
      'moving automatic browser delivery',
      20000,
    );
  } finally {
    await other.keyboard.up('KeyW');
  }

  await other.screenshot({
    path: path.join(feature.out, 'automatic-motherlode-delivery.png'),
    animations: 'disabled',
  });
  assert.deepEqual(await other.evaluate(() => G.you!.cargoLots.byCommodity.ore), {
    common: 18,
    rich: 5,
    pure: 1,
  });
  await page.waitForFunction(async () => {
    const audioModule = await import('/audio.js');
    return audioModule.debug().towVoices === 0;
  });
  const artwork = await page.evaluate(async () => {
    const { MOTHERLODE_ART } = await import('/shared/towing-rules.js');
    const manifest = await fetch('/assets/objects/motherlodes.json').then((result) =>
      result.json(),
    );
    return Promise.all(
      Object.values(MOTHERLODE_ART).map(async (artworkAsset) => {
        const record = manifest.find(
          (horizontalPosition4: { file: string }) => horizontalPosition4.file === artworkAsset.base,
        );
        if (!record) throw Error('missing motherlode inventory');
        const bytes = await fetch('/assets/objects/' + artworkAsset.base).then((result) =>
          result.arrayBuffer(),
        );
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
          (digestByte) => digestByte.toString(16).padStart(2, '0'),
        ).join('');
        if (hash !== record.sha256) throw Error('motherlode hash mismatch');
        const image = new Image();
        image.src = '/assets/objects/' + artworkAsset.base;
        await image.decode();
        const captain = document.createElement('canvas');
        captain.width = image.naturalWidth;
        captain.height = image.naturalHeight;
        const context = captain.getContext('2d');
        context!.drawImage(image, 0, 0);
        const playerData = context!.getImageData(0, 0, captain.width, captain.height).data;
        return {
          w: captain.width,
          h: captain.height,
          alpha: playerData.some((value, index) => index % 4 === 3 && value === 0),
          opaque: playerData.some((value, index) => index % 4 === 3 && value > 0),
        };
      }),
    );
  });
  assert.ok(
    artwork.every(
      (imageEvidence) =>
        imageEvidence.w === 384 &&
        imageEvidence.h === 384 &&
        imageEvidence.alpha &&
        imageEvidence.opaque,
    ),
  );
  assert.deepEqual(missing, []);
  assert.deepEqual(errors, []);
  console.log(
    'Real canvas survey/selection, custom and unbound toggle, F fighters, static reduced-motion tether/scales, explicit two-browser transfer, out-of-range rejection and exact automatic delivery at speed, actual production scaling, bounded mixer-aware tether audio and decoded/hash-verified transparent motherlode rasters.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
