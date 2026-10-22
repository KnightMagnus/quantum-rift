import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await miningFixture('cursors');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(feature.origin);
  const proof = await page.evaluate(async () => {
    const cursor = (element: Element | null) => getComputedStyle(element!).cursor;
    const names = [
      'arrow',
      'pointer',
      'hostile',
      'friendly',
      'neutral',
      'aim',
      'land',
      'plot',
      'resize',
      'busy',
    ];
    const images = [];
    for (const name of names) {
      const image = new Image();
      image.src = '/assets/cursors/' + name + '.png';
      await image.decode();
      const captain = document.createElement('canvas');
      captain.width = captain.height = 32;
      const context = captain.getContext('2d');
      context!.drawImage(image, 0, 0);
      const pixels = context!.getImageData(0, 0, 32, 32).data;
      images.push({
        name,
        w: image.width,
        h: image.height,
        clear: pixels[3] === 0,
        ink: Array.from(pixels).filter((value, index) => index % 4 === 3 && value > 128).length,
      });
    }
    const button = document.querySelector<HTMLElement>('#lbtn');
    const enabled = cursor(button);
    (button! as HTMLButtonElement).disabled = true;
    const disabled = cursor(button);
    (button! as HTMLButtonElement).disabled = false;
    button!.setAttribute('aria-disabled', 'true');
    const aria = cursor(button);
    button!.removeAttribute('aria-disabled');
    const states: Record<string, string> = {};
    const view = document.querySelector<HTMLElement>('#view');
    for (const name of ['hostile', 'friendly', 'neutral', 'aim', 'land']) {
      view!.className = 'cur-' + name;
      states[name] = cursor(view);
    }
    view!.className = '';
    document.body.classList.add('busy');
    const busy = cursor(button);
    const busyMap = cursor(document.querySelector<HTMLCanvasElement>('#gcanvas'));
    const busyGrip = cursor(document.querySelector<HTMLElement>('#hudgrip'));
    document.body.classList.remove('busy');
    return {
      images,
      enabled,
      disabled,
      aria,
      states,
      busy,
      busyMap,
      busyGrip,
      input: cursor(document.querySelector<HTMLElement>('#lname')),
      resize: cursor(document.querySelector<HTMLElement>('#hudgrip')),
      plot: cursor(document.querySelector<HTMLCanvasElement>('#gcanvas')),
    };
  });
  for (const image of proof.images) {
    assert.equal(image.w, 32);
    assert.equal(image.h, 32);
    assert.ok(image.clear);
    assert.ok(image.ink > 30 && image.ink < 700, image.name + ' transparency and visible shape');
  }
  assert.match(proof.enabled, /pointer.png.*2 2, pointer/);
  assert.equal(proof.disabled, 'not-allowed');
  assert.equal(proof.aria, 'not-allowed');
  assert.equal(proof.input, 'text');
  assert.match(proof.resize, /resize.png.*16 16, col-resize/);
  assert.match(proof.plot, /plot.png.*16 16, crosshair/);
  for (const [name, value] of Object.entries(proof.states))
    assert.ok(
      value.includes(name + '.png') && value.includes(name === 'land' ? '16 18' : '16 16'),
      name + ' asset and hotspot',
    );
  for (const value of [proof.busy, proof.busyMap, proof.busyGrip])
    assert.match(value, /busy.png.*16 16, progress/);
  console.log(
    'PASS: ten decoded transparent 32px cursor assets; state-specific CSS, hotspots, disabled/ARIA denial, text, resize, map and busy precedence.',
  );
} catch (error) {
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
