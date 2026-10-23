import type { RenderShip } from '../client/render.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('polish');
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=document-user-activation-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(feature.origin);
  const session = await page.context().newCDPSession(page);
  const initialAudio = await session.send('Runtime.evaluate', {
    expression: `(async () => ({ ctx: (await import('/audio.js')).debug().ctx, activated: navigator.userActivation.hasBeenActive }))()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false,
  });
  assert.equal(initialAudio.exceptionDetails, undefined);
  assert.deepEqual(
    initialAudio.result.value,
    { ctx: 'suspended', activated: false },
    'Page-load audio stays suspended before interaction when autoplay is blocked',
  );
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.screenshot({ path: path.join(feature.out, 'landing.png') });
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const proof = await page.evaluate(async () => {
    const { drawShip, sheet } = await import('/render.js');
    const { drawTowing } = await import('/towing_render.js');
    const audio = await import('/audio.js');
    const canvasElement = document.createElement('canvas');
    canvasElement.width = 600;
    canvasElement.height = 600;
    const context = canvasElement.getContext('2d');
    const hulls = [704, 815, 703];
    const checks = [];
    for (const hull of hulls) {
      const canvasHeight = G.A!.ships[hull];
      await Promise.all([sheet(canvasHeight).decode(), sheet(canvasHeight, true).decode()]);
      for (const firstCaptain of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const calls: [CanvasImageSource, ...number[]][] = [],
          filters: string[] = [];
        const draw = context!.drawImage.bind(context);
        context!.drawImage = (image: CanvasImageSource, ...coordinates: number[]) => {
          const args: [CanvasImageSource, ...number[]] = [image, ...coordinates];
          calls.push(args);
          filters.push(context!.filter);
          Reflect.apply(draw, context, args);
        };
        const entity = { id: 998, hull, a: firstCaptain, fl: 1 } as RenderShip;
        drawShip({ ...G, _exhaustReduced: true }, context!, entity, 300, 300, 1, 100);
        const normal = calls.filter((value) => value[0] === sheet(canvasHeight, true));
        calls.length = 0;
        entity.fl = 3;
        drawShip({ ...G, _exhaustReduced: true }, context!, entity, 300, 300, 1, 100);
        const boost = calls.filter((value) => value[0] === sheet(canvasHeight, true));
        calls.length = 0;
        entity.fl = 0;
        drawShip({ ...G, _exhaustReduced: true }, context!, entity, 300, 300, 1, 100);
        const idle = calls.filter((value) => value[0] === sheet(canvasHeight, true));
        const horizontalDelta = normal[0][5] - normal.at(-1)![5],
          verticalDelta = normal[0][6] - normal.at(-1)![6];
        checks.push({
          unfiltered: filters.every((filter) => filter === 'none'),
          normal: normal.length,
          boost: boost.length,
          idle: idle.length,
          aft: horizontalDelta * -Math.sin(firstCaptain) + verticalDelta * Math.cos(firstCaptain),
          side: horizontalDelta * Math.cos(firstCaptain) + verticalDelta * Math.sin(firstCaptain),
          longer:
            Math.hypot(boost[0][5] - boost.at(-1)![5], boost[0][6] - boost.at(-1)![6]) >
            Math.hypot(horizontalDelta, verticalDelta),
        });
        context!.drawImage = draw;
      }
    }
    function rock(oreRecord: string, revealed: boolean) {
      context!.clearRect(0, 0, 600, 600);
      drawTowing(
        {
          opts: {},
          towing: {
            objects: [
              {
                id: 1,
                x: 300,
                y: 300,
                ore: oreRecord,
                revealed,
                status: 'free',
                ports: [],
                field: { label: 'fixture' },
              },
            ],
          },
        },
        context!,
        (value) => value,
        (value) => value,
        1,
        600,
        600,
      );
      return canvasElement.toDataURL();
    }
    const concealed = ['ore', 'gas', 'shards'].map((oreRecord2) => rock(oreRecord2, false));
    const colors = new Set();
    const pixels = context!.getImageData(270, 270, 60, 60).data;
    for (let index = 0; index < pixels.length; index += 4)
      if (pixels[index + 3]) colors.add(pixels.slice(index, index + 3).join(','));
    const crystalImage = new Image();
    crystalImage.src = '/assets/objects/motherlode-shards.webp';
    await crystalImage.decode();
    if (crystalImage.naturalWidth < 64) throw Error('Crystal raster did not decode');
    rock('shards', true);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const crystal = rock('shards', true);
    canvasElement.width = 900;
    canvasElement.height = 350;
    context!.fillStyle = '#070b13';
    context!.fillRect(0, 0, 900, 350);
    for (const [index, flightState] of [0, 1, 3].entries()) {
      drawShip(
        { ...G, _exhaustReduced: true },
        context!,
        { id: 998, hull: 815, a: 0, fl: flightState } as RenderShip,
        150 + index * 220,
        150,
        1,
        100,
      );
      context!.fillStyle = '#cddce8';
      context!.font = '18px "Pixelify Sans"';
      context!.fillText(['IDLE', 'THRUST', 'BOOST'][index], 100 + index * 220, 300);
    }
    window.polishArt = canvasElement.toDataURL();
    audio.stopMusic(0);
    audio.startMusic();
    audio.stopMusic(0);
    await new Promise((resolve2) => setTimeout(resolve2, 400));
    const stopped = !audio.debug().music;
    audio.startMusic();
    await new Promise((resolve3) => setTimeout(resolve3, 400));
    const restarted = audio.debug().music;
    audio.startMusic();
    audio.stopMusic(0);
    audio.setAmbience('space');
    audio.setAmbience('station');
    audio.setAmbience(null);
    audio.setMix({ mute: true });
    audio.towing(true, 1);
    const muted = audio.debug().towGain === 0;
    audio.towing(false);
    await new Promise((resolve4) => setTimeout(resolve4, 2100));
    return {
      checks,
      concealedEqual: concealed.every((value) => value === concealed[0]),
      colors: colors.size,
      crystalDifferent: crystal !== concealed[0],
      stopped,
      restarted,
      muted,
      amb: audio.debug().amb,
    };
  });
  for (const renderProbe of proof.checks) {
    assert.ok(renderProbe.unfiltered, 'authored glow layers must not trigger per-pass blur');
    assert.equal(renderProbe.normal, 13);
    assert.equal(renderProbe.boost, 13);
    assert.equal(renderProbe.idle, 0);
    assert.ok(renderProbe.aft > 0);
    assert.ok(Math.abs(renderProbe.side) < 0.001);
    assert.ok(renderProbe.longer);
  }
  assert.ok(proof.concealedEqual);
  assert.ok(proof.colors > 20);
  assert.ok(proof.crystalDifferent);
  assert.ok(proof.stopped);
  assert.ok(proof.restarted);
  assert.ok(proof.muted);
  assert.deepEqual(proof.amb, []);
  const artwork = await page.evaluate(() => window.polishArt);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    path.join(feature.out, 'engine-comparison.png'),
    Buffer.from(artwork.split(',')[1], 'base64'),
  );
  await page.click('#traytoggle');
  await page.screenshot({ path: path.join(feature.out, 'flight.png') });
  // Actual gameplay surface, with a disclosed presentation fixture for art comparison.
  await page.evaluate(() => {
    const objects = G.towing?.objects || G.you?.towing?.objects || [];
    const options = objects[0];
    if (options) {
      options.revealed = true;
      options.ore = 'shards';
    }
  });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(300);
  await page.keyboard.up('Shift');
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: path.join(feature.out, 'crystal-flight.png') });
  console.log(
    'PASS: aft engine masks across three hulls/four headings, boost/idle, neutral texture concealment, crystal decode, gesture gating, music restart/cancellation, ambience teardown and mute.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
