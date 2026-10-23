import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { refineryFixture } from './helpers/refinery-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const fixture = await refineryFixture('sidebar-gauges', {
  serverPreloads: [fileURLToPath(new URL('./fixtures/sidebar-gauges-preload.ts', import.meta.url))],
});
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    const NativeSocket = WebSocket;
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as unknown as { gaugeSocket: WebSocket }).gaugeSocket = this;
      }
    };
  });
  await page.goto(fixture.origin);
  await page.fill('#lname', 'Refinery Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed && G.view.armor === 30 && G.view.fuel === 4);
  await page.waitForFunction(
    () => document.querySelectorAll('#flightstatus [role="meter"]').length === 3,
  );
  async function checkGauges() {
    await page.waitForFunction(() => {
      const meters = [...document.querySelectorAll('#flightstatus [role="meter"]')];
      return (
        meters.length === 3 &&
        meters.every(
          (meter, index) =>
            Math.abs(
              Number(meter.getAttribute('aria-valuenow')) -
                [G.view!.shield, G.view!.armor, G.view!.fuel][index],
            ) < 1,
        )
      );
    });
    const gauges = await page.locator('#flightstatus [role="meter"]').evaluateAll((meters) =>
      meters.map((meter) => ({
        value: Number(meter.getAttribute('aria-valuenow')),
        maximum: Number(meter.getAttribute('aria-valuemax')),
        width: parseFloat((meter.querySelector('i') as HTMLElement).style.width),
      })),
    );
    for (const gauge of gauges)
      assert.ok(Math.abs(gauge.width - (100 * gauge.value) / gauge.maximum) < 0.1);
  }
  await checkGauges();
  assert.equal(await page.locator('#flightstatus').isVisible(), true);
  await page.click('#traytoggle');
  assert.equal(
    await page.locator('#flightstatus').isVisible(),
    false,
    'Expanded tray exposes only its own status surface',
  );
  await page.click('#traytoggle');
  await page.waitForFunction(() => G.view!.armor === 20 && G.view!.fuel === 2);
  await checkGauges();
  await page.waitForFunction(() => G.view!.shield > 3, undefined, { timeout: 20000 });
  await checkGauges();
  await page.screenshot({ path: path.join(fixture.out, 'collapsed-authoritative-gauges.png') });
  const disconnected = await page.evaluate(async () => {
    const socket = (window as unknown as { gaugeSocket: WebSocket }).gaugeSocket;
    await new Promise<void>((resolve) => {
      socket.addEventListener('close', () => resolve(), { once: true });
      socket.close();
    });
    const status = document.getElementById('flightstatus')!;
    return { empty: status.textContent === '', hidden: status.classList.contains('hidden') };
  });
  assert.deepEqual(
    disconnected,
    { empty: true, hidden: true },
    'Real socket close clears stale gauges before reconnect',
  );
  await page.waitForFunction(() => !!G.landed, undefined, { timeout: 15000 });
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed && G.view.armor === 30 && G.view.fuel === 4);
  await checkGauges();
  await page.keyboard.press('Escape');
  await page.waitForSelector('#quitbox', { state: 'visible' });
  await page.click('#quitconfirm');
  await page.waitForFunction(() => !G.you);
  assert.equal(
    await page.locator('#flightstatus').innerText(),
    '',
    'Logout removes previous captain values, not just their visible surface',
  );
  await page.fill('#lname', 'Refinery Bravo');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you?.name === 'Refinery Bravo' && G.landed);
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed && G.view.armor === 50 && G.view.fuel === 8);
  await checkGauges();
  assert.match(
    await page.locator('#flightstatus').innerText(),
    /50 \/ 90/,
    'Another captain gets its own authoritative armor',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Collapsed shield/armor/fuel meters track authoritative damage, regeneration and fuel changes; expanded tray removes duplicate gauges.',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await fixture.close(browser);
}
