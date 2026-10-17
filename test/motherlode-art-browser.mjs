import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { towingFixture } from './helpers/towing-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await towingFixture('motherlode-art-browser');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const broken of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
      reducedMotion: 'reduce',
    });
    if (broken) await page.route('**/assets/objects/motherlode-*.webp', (r) => r.abort());
    await page.goto(f.origin);
    const result = await page.evaluate(async (broken) => {
      const { drawTowing } = await import('/towing_render.js');
      const { MOTHERLODE_ART } = await import('/shared/towing-rules.js');
      document.body.innerHTML =
        '<h2 style="color:white">Motherlodes: ore / gas / shards / unknown</h2>';
      document.body.style.background = '#0b1019';
      const c = document.createElement('canvas');
      c.width = 1080;
      c.height = 780;
      document.body.append(c);
      const ctx = c.getContext('2d');
      const types = ['ore', 'gas', 'shards', 'future-resource'];
      const render = (ore, status, revealed, x, y, z = 1) => {
        const o = {
          id: 1,
          ore,
          status,
          revealed,
          mass: null,
          x,
          y,
          tug: { x: x - 85, y: y - 65 },
          field: { label: 'Fixture' },
          ports: [],
        };
        drawTowing(
          { opts: {}, towing: { objects: [o], attached: null } },
          ctx,
          (v) => v,
          (v) => v,
          z,
          c.width,
          c.height,
        );
      };
      // Trigger the production image cache, then allow its actual decode/failure to finish.
      for (const ore of types) render(ore, 'available', true, 130, 120);
      if (!broken)
        await Promise.all(
          Object.values(MOTHERLODE_ART).map(
            (a) =>
              new Promise((resolve, reject) => {
                const im = new Image();
                im.onload = resolve;
                im.onerror = reject;
                im.src = '/assets/objects/' + a.base;
              }),
          ),
        );
      await new Promise((r) => setTimeout(r, 100));
      ctx.clearRect(0, 0, c.width, c.height);
      const pixels = (ore, status, revealed, own = false) => {
        const off = document.createElement('canvas');
        off.width = 240;
        off.height = 220;
        const cx = off.getContext('2d');
        drawTowing(
          {
            opts: {},
            view: { x: 120, y: 210 },
            towing: {
              objects: [
                {
                  id: 1,
                  ore,
                  status,
                  revealed,
                  mass: null,
                  x: 120,
                  y: 110,
                  tug: { x: 120, y: 210 },
                },
              ],
              attached: own ? 1 : null,
            },
          },
          cx,
          (v) => v,
          (v) => v,
          1,
          240,
          220,
        );
        // Only material pixels: exclude status labels, selection frame and exterior tether.
        return Array.from(cx.getImageData(125, 100, 20, 30).data).join(',');
      };
      const known = types.map((t) => pixels(t, 'available', true));
      const hidden = types.map((t) => pixels(t, 'available', false));
      const attached = types.map((t) => pixels(t, 'attached', true));
      const owned = types.map((t) => pixels(t, 'attached', true, true));
      const detached = types.map((t) => pixels(t, 'detached', true));
      const hiddenAttached = types.map((t) => pixels(t, 'attached', false));
      for (let row = 0; row < 4; row++)
        for (let col = 0; col < 4; col++) {
          render(
            types[col],
            row === 1 ? 'attached' : row === 2 ? 'detached' : 'available',
            row !== 3,
            135 + col * 265,
            100 + row * 185,
            1.4,
          );
        }
      return { known, hidden, attached, owned, detached, hiddenAttached };
    }, broken);
    assert.equal(
      new Set(result.known).size,
      4,
      'distinct actual material pixels including fallback',
    );
    assert.equal(
      new Set(result.hidden).size,
      1,
      'unscanned resource composition cannot be inferred from art',
    );
    assert.deepEqual(result.attached, result.known, 'same material when attached or free');
    assert.deepEqual(result.owned, result.known, 'owner view uses same material');
    assert.deepEqual(result.detached, result.known, 'detached material parity');
    assert.deepEqual(
      result.hiddenAttached,
      result.hidden,
      'attachment does not reveal composition',
    );
    await page.screenshot({
      path: path.join(f.out, broken ? 'resource-fallbacks.png' : 'resource-materials.png'),
    });
    await page.close();
  }
  console.log(
    'Production canvas: all resources and unknown, hidden parity, attached/free parity, decoded rasters and failed-image geometry.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
