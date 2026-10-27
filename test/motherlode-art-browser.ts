import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';

import { towingFixture } from './helpers/towing-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await towingFixture('motherlode-art-browser');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  for (const broken of [false, true]) {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
      reducedMotion: 'reduce',
    });
    if (broken)
      await page.route('**/assets/objects/motherlode-*.webp', (assetRequest) =>
        assetRequest.abort(),
      );
    await page.goto(feature.origin);
    const result = await page.evaluate(async (broken) => {
      const { drawTowing } = await import('/towing_render.js');
      const { MOTHERLODE_ART } = await import('/shared/towing-rules.js');
      document.body.innerHTML =
        '<h2 style="color:white">Motherlodes: ore / gas / shards / unknown</h2>';
      document.body.style.background = '#0b1019';
      const canvasElement = document.createElement('canvas');
      canvasElement.width = 1080;
      canvasElement.height = 780;
      document.body.append(canvasElement);
      const context = canvasElement.getContext('2d');
      const types = ['ore', 'gas', 'shards', 'future-resource'];
      const render = (
        oreRecord: string,
        status: string,
        revealed: boolean,
        horizontalPosition: number,
        verticalPosition: number,
        zoom = 1,
      ) => {
        const options = {
          id: 1,
          ore: oreRecord,
          status,
          revealed,
          mass: null,
          x: horizontalPosition,
          y: verticalPosition,
          tug: { x: horizontalPosition - 85, y: verticalPosition - 65 },
          field: { label: 'Fixture' },
          ports: [],
        };
        drawTowing(
          { opts: {}, towing: { objects: [options], attached: null } },
          context!,
          (value) => value,
          (value) => value,
          zoom,
          canvasElement.width,
          canvasElement.height,
        );
      };
      // Trigger the production image cache, then allow its actual decode/failure to finish.
      for (const oreRecord2 of types) render(oreRecord2, 'available', true, 130, 120);
      if (!broken)
        await Promise.all(
          Object.values(MOTHERLODE_ART).map(
            (firstCaptain) =>
              new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = resolve;
                image.onerror = reject;
                image.src = '/assets/objects/' + firstCaptain.base;
              }),
          ),
        );
      await new Promise((resolve2) => setTimeout(resolve2, 100));
      context!.clearRect(0, 0, canvasElement.width, canvasElement.height);
      const pixels = (oreRecord3: string, status: string, revealed: boolean, ownShip = false) => {
        const disabledState = document.createElement('canvas');
        disabledState.width = 240;
        disabledState.height = 220;
        const cameraX = disabledState.getContext('2d');
        drawTowing(
          {
            opts: {},
            view: { x: 120, y: 210 },
            towing: {
              objects: [
                {
                  id: 1,
                  ore: oreRecord3,
                  status,
                  revealed,
                  mass: null,
                  x: 120,
                  y: 110,
                  tug: { x: 120, y: 210 },
                  field: { label: 'fixture' },
                  ports: [],
                },
              ],
              attached: ownShip ? 1 : null,
            },
          },
          cameraX!,
          (value) => value,
          (value) => value,
          1,
          240,
          220,
        );
        // Only material pixels: exclude status labels, selection frame and exterior tether.
        return Array.from(cameraX!.getImageData(125, 100, 20, 30).data).join(',');
      };
      const known = types.map((artType) => pixels(artType, 'available', true));
      const hidden = types.map((unrevealedBody) => pixels(unrevealedBody, 'available', false));
      const attached = types.map((visibleAttachedBody) =>
        pixels(visibleAttachedBody, 'attached', true),
      );
      const owned = types.map((fullAttachedBody) =>
        pixels(fullAttachedBody, 'attached', true, true),
      );
      const detached = types.map((detachedBody) => pixels(detachedBody, 'detached', true));
      const hiddenAttached = types.map((hiddenAttachedBody) =>
        pixels(hiddenAttachedBody, 'attached', false),
      );
      for (let record = 0; record < 4; record++)
        for (let color = 0; color < 4; color++) {
          render(
            types[color],
            record === 1 ? 'attached' : record === 2 ? 'detached' : 'available',
            record !== 3,
            135 + color * 265,
            100 + record * 185,
            1.4,
          );
        }
      const highlights = (eligible: boolean, active = false) => {
        const canvas = document.createElement('canvas');
        canvas.width = 400;
        canvas.height = 300;
        const drawing = canvas.getContext('2d')!;
        const labels: string[] = [];
        let frames = 0;
        const strokeRect = drawing.strokeRect.bind(drawing);
        drawing.strokeRect = (x, y, width, height) => {
          frames++;
          strokeRect(x, y, width, height);
        };
        const fillText = drawing.fillText.bind(drawing);
        drawing.fillText = (text, x, y) => {
          labels.push(text);
          fillText(text, x, y);
        };
        drawTowing(
          {
            opts: {},
            view: { x: 100, y: 100 },
            you: { ship: { hull: 1 }, shipStats: { cargo: 100 } },
            A: { ships: { 1: { role: eligible ? 'survey' : 'combat' } } },
            towing: {
              attached: active ? 1 : null,
              objects: [
                {
                  id: 1,
                  x: 200,
                  y: 100,
                  ore: 'ore',
                  status: 'available',
                  revealed: true,
                  field: { label: 'Fixture' },
                  ports: [],
                },
              ],
            },
          },
          drawing,
          (value) => value,
          (value) => value,
          1,
          400,
          300,
        );
        return { labels, frames, material: Array.from(drawing.getImageData(195, 95, 10, 10).data) };
      };
      const miner = highlights(true),
        fighter = highlights(false),
        towing = highlights(false, true);
      return { known, hidden, attached, owned, detached, hiddenAttached, miner, fighter, towing };
    }, broken);
    assert.ok(
      result.miner.labels.some((text) => text.startsWith('MOTHERLODE')),
      'Mining ship has deposit highlights',
    );
    assert.equal(result.fighter.frames, 0, 'Non-mining ship has no motherlode outline');
    assert.ok(result.miner.frames > 0, 'Mining ship has motherlode outlines');
    assert.equal(result.fighter.labels.length, 0, 'Non-mining ship has no motherlode labels');
    assert.deepEqual(
      result.fighter.material,
      result.miner.material,
      'Physical deposit stays visible to non-miners',
    );
    assert.ok(
      result.towing.labels.some((text) => text.startsWith('MOTHERLODE')),
      'Active towing retains its load highlight',
    );
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
      path: path.join(feature.out, broken ? 'resource-fallbacks.png' : 'resource-materials.png'),
    });
    await page.close();
  }
  console.log(
    'Production canvas: all resources and unknown, hidden parity, attached/free parity, decoded rasters and failed-image geometry.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
