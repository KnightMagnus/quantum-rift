import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await miningFixture('polish');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto(f.origin);
  assert.equal(await page.evaluate(async () => (await import('/audio.js')).debug().ctx), null);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.screenshot({ path: path.join(f.out, 'landing.png') });
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  const proof = await page.evaluate(async () => {
    const { drawShip, sheet } = await import('/render.js');
    const { drawTowing } = await import('/towing_render.js');
    const audio = await import('/audio.js');
    const c = document.createElement('canvas');
    c.width = 600;
    c.height = 600;
    const ctx = c.getContext('2d');
    const hulls = [704, 815, 703];
    const checks = [];
    for (const hull of hulls) {
      const H = G.A.ships[hull];
      await Promise.all([sheet(H).decode(), sheet(H, true).decode()]);
      for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        const calls = [];
        const draw = ctx.drawImage.bind(ctx);
        ctx.drawImage = (...args) => {
          calls.push(args);
          draw(...args);
        };
        const e = { id: 998, hull, a, fl: 1 };
        drawShip({ ...G, _exhaustReduced: true }, ctx, e, 300, 300, 1, 100);
        const normal = calls.filter((v) => v[0] === sheet(H, true));
        calls.length = 0;
        e.fl = 3;
        drawShip({ ...G, _exhaustReduced: true }, ctx, e, 300, 300, 1, 100);
        const boost = calls.filter((v) => v[0] === sheet(H, true));
        calls.length = 0;
        e.fl = 0;
        drawShip({ ...G, _exhaustReduced: true }, ctx, e, 300, 300, 1, 100);
        const idle = calls.filter((v) => v[0] === sheet(H, true));
        const dx = normal[0][5] - normal.at(-1)[5],
          dy = normal[0][6] - normal.at(-1)[6];
        checks.push({
          normal: normal.length,
          boost: boost.length,
          idle: idle.length,
          aft: dx * -Math.sin(a) + dy * Math.cos(a),
          side: dx * Math.cos(a) + dy * Math.sin(a),
          longer:
            Math.hypot(boost[0][5] - boost.at(-1)[5], boost[0][6] - boost.at(-1)[6]) >
            Math.hypot(dx, dy),
        });
        ctx.drawImage = draw;
      }
    }
    function rock(ore, revealed) {
      ctx.clearRect(0, 0, 600, 600);
      drawTowing(
        {
          opts: {},
          towing: {
            objects: [
              {
                id: 1,
                x: 300,
                y: 300,
                ore,
                revealed,
                status: 'free',
                ports: [],
                field: { label: 'fixture' },
              },
            ],
          },
        },
        ctx,
        (v) => v,
        (v) => v,
        1,
        600,
        600,
      );
      return c.toDataURL();
    }
    const concealed = ['ore', 'gas', 'shards'].map((ore) => rock(ore, false));
    const colors = new Set();
    const pixels = ctx.getImageData(270, 270, 60, 60).data;
    for (let i = 0; i < pixels.length; i += 4)
      if (pixels[i + 3]) colors.add(pixels.slice(i, i + 3).join(','));
    const crystalImage = new Image();
    crystalImage.src = '/assets/objects/motherlode-shards.webp';
    await crystalImage.decode();
    if (crystalImage.naturalWidth < 64) throw Error('Crystal raster did not decode');
    rock('shards', true);
    await new Promise((r) => setTimeout(r, 300));
    const crystal = rock('shards', true);
    c.width = 900;
    c.height = 350;
    ctx.fillStyle = '#070b13';
    ctx.fillRect(0, 0, 900, 350);
    for (const [i, fl] of [0, 1, 3].entries()) {
      drawShip(
        { ...G, _exhaustReduced: true },
        ctx,
        { id: 998, hull: 815, a: 0, fl },
        150 + i * 220,
        150,
        1,
        100,
      );
      ctx.fillStyle = '#cddce8';
      ctx.font = '18px "Pixelify Sans"';
      ctx.fillText(['IDLE', 'THRUST', 'BOOST'][i], 100 + i * 220, 300);
    }
    window.polishArt = c.toDataURL();
    audio.stopMusic(0);
    audio.startMusic();
    audio.stopMusic(0);
    await new Promise((r) => setTimeout(r, 400));
    const stopped = !audio.debug().music;
    audio.startMusic();
    await new Promise((r) => setTimeout(r, 400));
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
    await new Promise((r) => setTimeout(r, 2100));
    return {
      checks,
      concealedEqual: concealed.every((v) => v === concealed[0]),
      colors: colors.size,
      crystalDifferent: crystal !== concealed[0],
      stopped,
      restarted,
      muted,
      amb: audio.debug().amb,
    };
  });
  for (const c of proof.checks) {
    assert.equal(c.normal, 13);
    assert.equal(c.boost, 13);
    assert.equal(c.idle, 0);
    assert.ok(c.aft > 0);
    assert.ok(Math.abs(c.side) < 0.001);
    assert.ok(c.longer);
  }
  assert.ok(proof.concealedEqual);
  assert.ok(proof.colors > 20);
  assert.ok(proof.crystalDifferent);
  assert.ok(proof.stopped);
  assert.ok(proof.restarted);
  assert.ok(proof.muted);
  assert.deepEqual(proof.amb, []);
  const art = await page.evaluate(() => window.polishArt);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(
    path.join(f.out, 'engine-comparison.png'),
    Buffer.from(art.split(',')[1], 'base64'),
  );
  await page.click('#traytoggle');
  await page.screenshot({ path: path.join(f.out, 'flight.png') });
  // Actual gameplay surface, with a disclosed presentation fixture for art comparison.
  await page.evaluate(() => {
    const objects = G.towing?.objects || G.you?.towing?.objects || [];
    const o = objects[0];
    if (o) {
      o.revealed = true;
      o.ore = 'shards';
    }
  });
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(300);
  await page.keyboard.up('Shift');
  await page.keyboard.up('ArrowUp');
  await page.screenshot({ path: path.join(f.out, 'crystal-flight.png') });
  console.log(
    'PASS: aft engine masks across three hulls/four headings, boost/idle, neutral texture concealment, crystal decode, gesture gating, music restart/cancellation, ambience teardown and mute.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
