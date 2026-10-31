import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
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

  const selectors = [
    '#login .loginbox',
    '#land .landbox',
    '#bankbox > .bank-panel',
    '#gmap .gbox',
    '#opts .optbox',
    '#chatprojection',
    '#functiondock',
    '#consolechat',
    '#consoleutilities',
  ];
  // Each surface keeps its own 300x180 probe and pixel checks. Capture the nine
  // independent probes together instead of rebuilding the document for each case.
  const probe = await browser.newPage({ viewport: { width: 1220, height: 860 } });
  await probe.setContent('<style>html,body{margin:0;background:transparent}</style>');
  const measurements = [];
  let captures = 0;
  for (const [width, height] of [
    [800, 650],
    [1280, 720],
    [1920, 1080],
    [2560, 1440],
  ]) {
    await page.setViewportSize({ width, height });
    const surfaces = await page.evaluate(
      (selectors) =>
        selectors.map((selector) => {
          const computed = getComputedStyle(document.querySelector(selector)!);
          return {
            selector,
            style: Object.fromEntries(
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
            ),
          };
        }),
      selectors,
    );
    for (const { selector, style } of surfaces)
      assert.match(style['border-image']!, /sculpted-frame\.svg/, selector);
    for (const background of ['transparent', 'rgb(221, 65, 193)', 'rgb(227, 239, 249)']) {
      await probe.evaluate(
        async ({ surfaces, background }) => {
          document.body.replaceChildren();
          document.body.style.background = background;
          const images = new Set<string>();
          for (const [index, { style }] of surfaces.entries()) {
            const frame = document.createElement('div');
            frame.className = 'frame';
            for (const [property, value] of Object.entries(style))
              frame.style.setProperty(property, value);
            Object.assign(frame.style, {
              position: 'absolute',
              left: `${80 + (index % 3) * 380}px`,
              top: `${80 + Math.floor(index / 3) * 260}px`,
              width: '300px',
              height: '180px',
              boxSizing: 'border-box',
            });
            document.body.append(frame);
            const source = getComputedStyle(frame).borderImageSource;
            const url = source.match(/url\(["']?(.*?)["']?\)/)?.[1];
            if (!url) throw Error('Frame image source is missing');
            images.add(url);
          }
          await Promise.all(
            [...images].map(async (url) => {
              const image = new Image();
              image.src = url;
              await image.decode();
            }),
          );
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          );
        },
        { surfaces, background },
      );
      const screenshot = await probe.screenshot({ omitBackground: true });
      captures++;
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
        return [...document.querySelectorAll('.frame')].map((frame) => {
          const { x, y } = frame.getBoundingClientRect();
          const borderWidth = parseFloat(getComputedStyle(frame).borderTopWidth);
          return {
            rail: pixel(x + 150, y + Math.ceil(borderWidth / 4)),
            corners: [
              [x, y],
              [x + 299, y],
              [x, y + 179],
              [x + 299, y + 179],
            ].map(([x, y]) => pixel(x!, y!)),
          };
        });
      }, screenshot.toString('base64'));
      assert.equal(rendered.length, selectors.length);
      const expected =
        background === 'transparent'
          ? [0, 0, 0, 0]
          : background === 'rgb(221, 65, 193)'
            ? [221, 65, 193, 255]
            : [227, 239, 249, 255];
      for (const [index, sample] of rendered.entries()) {
        const selector = selectors[index]!;
        const label = `${selector} ${width} ${background}`;
        assert.equal(sample.rail[3], 255, `${label}: rendered metal stays opaque`);
        assert.notDeepEqual(sample.rail, expected, `${label}: the frame is actually painted`);
        for (const pixel of sample.corners)
          assert.deepEqual(pixel, expected, `${label}: no rectangular corner backing`);
        measurements.push({ selector, width, height, background, ...sample });
      }
    }
  }
  assert.equal(measurements.length, 108);
  assert.equal(captures, 12);
  fileSystem.writeFileSync(
    path.join(fixture.out, 'frame-pixels.json'),
    JSON.stringify({ captures, measurements }, null, 2),
  );
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
