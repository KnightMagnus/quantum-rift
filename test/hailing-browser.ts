// Optional browser check against disposable server: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/hailing-browser.ts http://localhost:18766
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import path from 'node:path';
const { chromium } = (await import(
  process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
)) as typeof import('playwright');
const origin = process.argv[2] || 'http://localhost:18766',
  stamp = String(Date.now()).slice(-6);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors: string[] = [];
page.on('pageerror', (event) => errors.push(String(event)));
// Optional fallback to independently retained binaries for upstream unresolved LFS pointers only.
if (process.env.RIFT_ASSET_FALLBACK)
  await page.route('**/assets/**', async (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(process.env.RIFT_ASSET_FALLBACK!, relative);
    if (
      fileSystem.existsSync(file) &&
      fileSystem.statSync(file).isFile() &&
      fileSystem.statSync(file).size > 200
    )
      return route.fulfill({ path: file });
    return route.continue();
  });
// Retain the real socket only to enable normal privacy preference packets in this test.
await page.addInitScript(() => {
  const NativeWebSocket = window.WebSocket;
  window.WebSocket = class extends NativeWebSocket {
    constructor(...args: ConstructorParameters<typeof WebSocket>) {
      super(...args);
      window.__testSocket = this;
    }
  };
});
const peer = new WebSocket(origin.replace('http', 'ws') + '/ws'),
  received: { t: string; entries: { key: string }[]; key?: string; text: string }[] = [];
let snap: { me: number[] } | undefined;
peer.onmessage = (event2) => {
  const message = JSON.parse(String(event2.data));
  received.push(message);
  if (message.t === 'snap') snap = message;
};
const send = (message: object) => peer.send(JSON.stringify(message));
try {
  await new Promise((resolve) => (peer.onopen = resolve));
  send({ t: 'hello', name: 'RadioPeer ' + stamp, pass: 'secret' });
  await page.goto(origin);
  await page.fill('#lname', 'RadioUI ' + stamp);
  await page.fill('#lpass', 'secret');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  await page.evaluate(() =>
    window.__testSocket.send(
      JSON.stringify({ t: 'social', op: 'prefs', dmAll: true, hideSys: false }),
    ),
  );
  send({ t: 'social', op: 'prefs', dmAll: true, hideSys: false });
  send({ t: 'depart' });
  // Story overlays are unrelated to communications; close them before departure.
  for (let index = 0; index < 10; index++) {
    if (!(await page.locator('#storybox').isVisible())) break;
    await page.locator('#storyb button').first().click();
  }
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  for (let index = 0; index < 100 && !snap; index++)
    await new Promise((resolve2) => setTimeout(resolve2, 30));
  assert.ok(snap);
  const identifier = await page.evaluate(() => G.myId),
    _peerId = snap!.me[0];
  await page.keyboard.press('ArrowUp');
  const before = await page.evaluate(() => G.view!.ry);
  send({ t: 'hailin', op: 'send', id: identifier, text: '<b>Transmission</b> 😀' });
  await page.locator('#hailindicator').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#hailbox').isVisible(), false, 'arrival stays nonmodal');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'hailcompose');
  await page.locator('#hailindicator').click();
  await page.getByRole('button', { name: /RadioPeer.*captain/ }).click();
  await page.waitForFunction(
    () =>
      document.querySelector<HTMLElement>('#hailtext')!.textContent === '<b>Transmission</b> 😀',
  );
  assert.equal(await page.locator('#hailtext').innerText(), '<b>Transmission</b> 😀');
  assert.equal(await page.locator('#hailtext b').count(), 0, 'plain text only');
  await page.locator('#hailcompose').fill('test 🛰️');
  assert.equal(
    await page.locator('#hailbox').isVisible(),
    true,
    'letter t does not close composer',
  );
  await page.locator('#hailcompose').press('t');
  assert.equal(await page.locator('#hailbox').isVisible(), true);
  await page.locator('#hailcompose').fill('😀'.repeat(101));
  assert.equal(Array.from(await page.locator('#hailcompose').inputValue()).length, 100);
  await page.getByRole('button', { name: 'SEND', exact: true }).click();
  for (
    let index = 0;
    index < 100 && !received.some((message) => message.t === 'hailinbox' && message.entries.length);
    index++
  )
    await new Promise((resolve3) => setTimeout(resolve3, 30));
  const incoming = received
    .filter((message) => message.t === 'hailinbox' && message.entries.length)
    .at(-1);
  assert.ok(incoming);
  send({ t: 'hailin', op: 'open', key: incoming.entries[0].key });
  for (
    let index = 0;
    index < 100 &&
    !received.some((message) => message.t === 'hail' && message.key === incoming.entries[0].key);
    index++
  )
    await new Promise((resolve4) => setTimeout(resolve4, 30));
  assert.equal(
    Array.from(
      received.find((message) => message.t === 'hail' && message.key === incoming.entries[0].key)!
        .text,
    ).length,
    100,
  );
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
  for (const size of [
    { width: 1024, height: 768, hud: 280 },
    { width: 1600, height: 900, hud: 520 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate(
      (flightHud) => document.documentElement.style.setProperty('--hud', `${flightHud}px`),
      size.hud,
    );
    const secondCaptain = await page.locator('#hailindicator').boundingBox(),
      value = await page.locator('#view').boundingBox(),
      console = await page.locator('#cockpit').boundingBox();
    assert.ok(
      secondCaptain!.x >= value!.x &&
        secondCaptain!.x + secondCaptain!.width <= value!.x + value!.width &&
        secondCaptain!.y >= console!.y &&
        secondCaptain!.y + secondCaptain!.height <= console!.y + console!.height,
      'indicator reachable in cockpit under the resizable flight view',
    );
  }
  await page.keyboard.press('KeyU');
  assert.equal(await page.locator('#hailbox').isVisible(), true, 'remappable inbox action');
  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => G.view!.ry);
  assert.notEqual(before, after, 'simulation kept running');
  assert.deepEqual(errors, []);
  if (process.env.RIFT_BROWSER_SCREENSHOT)
    await page.screenshot({ path: process.env.RIFT_BROWSER_SCREENSHOT });
  console.log(
    'Browser hailing: real incoming badge/no modal/focus theft, escaped Unicode, 100-codepoint composer/reply, typing T safe, inbox key/Escape, two desktop/sidebar widths, continuous simulation, zero page errors.',
  );
} finally {
  peer.close();
  await browser.close();
}
