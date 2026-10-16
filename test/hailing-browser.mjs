// Optional browser check against disposable server: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node test/hailing-browser.mjs http://localhost:18766
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.argv[2] || 'http://localhost:18766',
  stamp = String(Date.now()).slice(-6);
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }),
  errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// Optional fallback to independently retained binaries for upstream unresolved LFS pointers only.
if (process.env.RIFT_ASSET_FALLBACK)
  await page.route('**/assets/**', async (route) => {
    const relative = decodeURIComponent(new URL(route.request().url()).pathname).slice(1);
    const file = path.join(process.env.RIFT_ASSET_FALLBACK, relative);
    if (fs.existsSync(file) && fs.statSync(file).isFile() && fs.statSync(file).size > 200)
      return route.fulfill({ path: file });
    return route.continue();
  });
// Retain the real socket only to enable normal privacy preference packets in this test.
await page.addInitScript(() => {
  const WS = window.WebSocket;
  window.WebSocket = class extends WS {
    constructor(...args) {
      super(...args);
      window.__testSocket = this;
    }
  };
});
const peer = new WebSocket(origin.replace('http', 'ws') + '/ws'),
  received = [];
let snap;
peer.onmessage = (e) => {
  const m = JSON.parse(e.data);
  received.push(m);
  if (m.t === 'snap') snap = m;
};
const send = (m) => peer.send(JSON.stringify(m));
try {
  await new Promise((r) => (peer.onopen = r));
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
  for (let i = 0; i < 10; i++) {
    if (!(await page.locator('#storybox').isVisible())) break;
    await page.locator('#storyb button').first().click();
  }
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  for (let i = 0; i < 100 && !snap; i++) await new Promise((r) => setTimeout(r, 30));
  assert.ok(snap);
  const id = await page.evaluate(() => G.myId),
    peerId = snap.me[0];
  await page.keyboard.press('ArrowUp');
  const before = await page.evaluate(() => G.view.ry);
  send({ t: 'hailin', op: 'send', id, text: '<b>Transmission</b> 😀' });
  await page.locator('#hailindicator').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#hailbox').isVisible(), false, 'arrival stays nonmodal');
  assert.notEqual(await page.evaluate(() => document.activeElement?.id), 'hailcompose');
  await page.locator('#hailindicator').click();
  await page.getByRole('button', { name: /RadioPeer.*captain/ }).click();
  await page.waitForFunction(
    () => document.querySelector('#hailtext').textContent === '<b>Transmission</b> 😀',
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
  assert.equal([...(await page.locator('#hailcompose').inputValue())].length, 100);
  await page.getByRole('button', { name: 'SEND', exact: true }).click();
  for (let i = 0; i < 100 && !received.some((m) => m.t === 'hailinbox' && m.entries.length); i++)
    await new Promise((r) => setTimeout(r, 30));
  const incoming = received.filter((m) => m.t === 'hailinbox' && m.entries.length).at(-1);
  assert.ok(incoming);
  send({ t: 'hailin', op: 'open', key: incoming.entries[0].key });
  for (
    let i = 0;
    i < 100 && !received.some((m) => m.t === 'hail' && m.key === incoming.entries[0].key);
    i++
  )
    await new Promise((r) => setTimeout(r, 30));
  assert.equal(
    [...received.find((m) => m.t === 'hail' && m.key === incoming.entries[0].key).text].length,
    100,
  );
  await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
  for (const size of [
    { width: 1024, height: 768, hud: 280 },
    { width: 1600, height: 900, hud: 520 },
  ]) {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.evaluate(
      (hud) => document.documentElement.style.setProperty('--hud', `${hud}px`),
      size.hud,
    );
    const b = await page.locator('#hailindicator').boundingBox(),
      v = await page.locator('#view').boundingBox();
    assert.ok(
      b.x >= v.x && b.x + b.width <= v.x + v.width && b.y >= 0 && b.y + b.height < size.height,
      'indicator inside resizable flight view',
    );
  }
  await page.keyboard.press('KeyU');
  assert.equal(await page.locator('#hailbox').isVisible(), true, 'remappable inbox action');
  await page.keyboard.press('Escape');
  const after = await page.evaluate(() => G.view.ry);
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
