import assert from 'node:assert/strict';
import { launchChromium } from './helpers/chromium.ts';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';

const fixture = await miningFixture('hud-frame-alpha');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(fixture.origin);
  const decoded = await page.evaluate(async () => {
    const image = new Image();
    image.src = 'assets/hud/pressure-hull/sculpted-frame.svg';
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = (x: number, y: number) => pixels[(y * canvas.width + x) * 4 + 3];
    const exterior = [];
    // These triangles are well outside the metal bevel, including its stroke.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x + y < 40; x++) {
        for (const [sampleX, sampleY] of [
          [x, y],
          [799 - x, y],
          [x, 599 - y],
          [799 - x, 599 - y],
        ])
          exterior.push(alpha(sampleX!, sampleY!));
      }
    }
    return {
      size: [image.width, image.height],
      exterior,
      metal: [
        [400, 15],
        [15, 300],
        [785, 300],
        [400, 585],
        [45, 45],
      ].map(([x, y]) => alpha(x!, y!)),
      interior: alpha(400, 300),
    };
  });
  assert.deepEqual(decoded.size, [800, 600]);
  assert.ok(
    decoded.exterior.every((alpha) => alpha === 0),
    'Exterior corner triangles are transparent',
  );
  assert.ok(
    decoded.metal.every((alpha) => alpha === 255),
    'Metal rails and fastener stay opaque',
  );
  assert.equal(decoded.interior, 255, 'The authored dark inner backing is preserved');

  const probe = await browser.newPage({ viewport: { width: 640, height: 480 } });
  for (const [width, height] of [
    [800, 650],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    for (const selector of [
      '#login .loginbox',
      '#land .landbox',
      '#gmap .gbox',
      '#opts .optbox',
      '#chatprojection',
      '#functiondock',
      '#consolechat',
      '#consoleutilities',
    ]) {
      const style = await page.locator(selector).evaluate((element) => {
        const computed = getComputedStyle(element);
        return Object.fromEntries(
          [
            'border-image',
            'border-width',
            'border-style',
            'border-color',
            'background-image',
            'background-color',
            'background-clip',
            'box-shadow',
            'border-radius',
          ].map((property) => [property, computed.getPropertyValue(property)]),
        );
      });
      assert.match(style['border-image']!, /sculpted-frame\.svg/, selector);
      for (const background of ['transparent', 'rgb(221, 65, 193)', 'rgb(227, 239, 249)']) {
        await probe.setContent(
          '<style>html,body{margin:0;background:transparent}</style><div id="frame"></div>',
        );
        await probe.evaluate(
          ({ style, background }) => {
            document.body.style.background = background;
            const frame = document.getElementById('frame')!;
            for (const [property, value] of Object.entries(style))
              frame.style.setProperty(property, value);
            Object.assign(frame.style, {
              position: 'absolute',
              left: '80px',
              top: '80px',
              width: '300px',
              height: '180px',
              boxSizing: 'border-box',
            });
          },
          { style, background },
        );
        const screenshot = await probe.screenshot({ omitBackground: true });
        const rendered = await probe.evaluate(async (encoded) => {
          const image = new Image();
          image.src = 'data:image/png;base64,' + encoded;
          await image.decode();
          const canvas = document.createElement('canvas');
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(image, 0, 0);
          const pixel = (x: number, y: number) => Array.from(context.getImageData(x, y, 1, 1).data);
          const borderWidth = parseFloat(
            getComputedStyle(document.getElementById('frame')!).borderTopWidth,
          );
          return {
            rail: pixel(230, 80 + Math.ceil(borderWidth / 4)),
            corners: [
              [80, 80],
              [379, 80],
              [80, 259],
              [379, 259],
            ].map(([x, y]) => pixel(x!, y!)),
          };
        }, screenshot.toString('base64'));
        const expected =
          background === 'transparent'
            ? [0, 0, 0, 0]
            : background === 'rgb(221, 65, 193)'
              ? [221, 65, 193, 255]
              : [227, 239, 249, 255];
        assert.equal(rendered.rail[3], 255, `${selector}: rendered metal stays opaque`);
        assert.notDeepEqual(rendered.rail, expected, `${selector}: the frame is actually painted`);
        for (const pixel of rendered.corners)
          assert.deepEqual(
            pixel,
            expected,
            `${selector} ${width} ${background}: no rectangular corner backing`,
          );
      }
    }
  }
  await probe.close();
  console.log(
    'PASS HUD frame: decoded exterior alpha, opaque metal/interior, and rendered transparent/light/magenta corners at four viewport sizes',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await fixture.close(browser);
}
