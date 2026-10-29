import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { chromium, type Page, type BrowserContext } from 'playwright';
import { delay } from './browser-fixture.ts';

/** Chromium extension's local tab API; no network or account permissions are needed. */
interface ZoomExtension {
  /** Browser-owned tab lookup and page-zoom control. */
  tabs: {
    /** Find the fixture game tab. */
    query(query: object): Promise<Array<{ id?: number; url?: string }>>;
    /** Apply browser page zoom, not CSS or emulated viewport scaling. */
    setZoom(id: number, zoom: number): Promise<void>;
  };
}

/** Real browser zoom against the same isolated dock fixture as the responsive matrix. */
export async function runLandedZoom(
  origin: string,
  output: string,
  directory: string,
  checkLayout: (page: Page, label: string, tab: string) => Promise<void>,
): Promise<void> {
  let context: BrowserContext | undefined;
  const display =
    !process.env.DISPLAY && process.platform === 'linux'
      ? spawn('Xvfb', ['-displayfd', '1', '-screen', '0', '1600x1000x24', '-nolisten', 'tcp'], {
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      : undefined;
  try {
    let displayName = process.env.DISPLAY;
    if (display) {
      displayName = await Promise.race([
        once(display.stdout!, 'data').then(([data]) => ':' + String(data).trim()),
        once(display, 'error').then(([error]) => {
          throw error;
        }),
        delay(5000).then(() => {
          throw Error('Xvfb did not provide a display');
        }),
      ]);
    }
    const extension = path.join(directory, 'zoom-extension');
    fs.mkdirSync(extension);
    fs.writeFileSync(
      path.join(extension, 'manifest.json'),
      JSON.stringify({
        manifest_version: 3,
        name: 'Offline browser zoom fixture',
        version: '1.0',
        permissions: ['tabs'],
        background: { service_worker: 'worker.js' },
      }),
    );
    fs.writeFileSync(
      path.join(extension, 'worker.js'),
      'chrome.tabs.onUpdated.addListener(() => {});',
    );
    context = await chromium.launchPersistentContext(path.join(directory, 'zoom-profile'), {
      headless: false,
      viewport: null,
      executablePath: process.env.CHROMIUM_EXECUTABLE,
      env: { ...process.env, ...(displayName ? { DISPLAY: displayName } : {}) },
      ignoreDefaultArgs: ['--disable-extensions'],
      args: [
        '--no-sandbox',
        '--window-size=1093,720',
        '--disable-extensions-except=' + extension,
        '--load-extension=' + extension,
      ],
    });
    await context.addInitScript(() => {
      // oxlint-disable-next-line typescript/unbound-method -- Keep the explicit receiver in call below.
      const read = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        if (key.startsWith('rift.onboarding.v1.') && read.call(this, key) === null)
          this.setItem(key, 'complete');
        return read.call(this, key);
      };
    });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const page = await context.newPage();
    await page.goto(origin);
    await page.fill('#lname', 'Layout Hub');
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 12 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.waitForFunction(
      () => !document.querySelector('#toasts > div:not(.newcomer-protection)'),
    );
    const baseline = await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      dpr: devicePixelRatio,
    }));
    const measurements: object[] = [];
    for (const zoom of [1, 1.25, 1.5]) {
      await worker.evaluate(
        async ({ origin, zoom }) => {
          const api = (globalThis as unknown as { chrome: ZoomExtension }).chrome;
          const tab = (await api.tabs.query({})).find((tab) => tab.url?.startsWith(origin));
          if (tab?.id === undefined) throw Error('Missing game tab for browser zoom');
          await api.tabs.setZoom(tab.id, zoom);
        },
        { origin, zoom },
      );
      await page.waitForFunction(
        (expected) => Math.abs(devicePixelRatio - expected) < 0.01,
        baseline.dpr * zoom,
      );
      const viewport = await page.evaluate(() => ({
        width: innerWidth,
        height: innerHeight,
        dpr: devicePixelRatio,
      }));
      assert.ok(
        viewport.width <= baseline.width / zoom + 1 &&
          viewport.height <= baseline.height / zoom + 1,
        'browser zoom changes the actual CSS viewport',
      );
      for (const scale of [1, 1.4]) {
        await page.evaluate((scale) => {
          document.documentElement.style.setProperty('--ui', String(scale));
          document.body.classList.toggle('scaled', scale !== 1);
        }, scale);
        for (const tab of ['crew', 'outfit', 'trade']) {
          const label = `zoom-${zoom}-ui-${scale}-${tab}`;
          await page.locator(`#ltabs [data-lt="${tab}"]`).click();
          await checkLayout(page, label, tab);
          await page.locator('#depart').hover();
          measurements.push({ zoom, scale, tab, viewport });
          fs.writeFileSync(path.join(output, 'zoom.json'), JSON.stringify(measurements, null, 2));
          await page.screenshot({ path: path.join(output, label + '.png') });
        }
      }
    }
    console.log(
      'Real browser page zoom: 100%, 125%, 150%, two UI scales, crew/outfit/trade passed.',
    );
  } catch (error) {
    fs.writeFileSync(path.join(output, 'zoom-failure.txt'), String(error));
    for (const [index, page] of (context?.pages() || []).entries())
      await page
        .screenshot({ path: path.join(output, `zoom-failure-${index}.png`), timeout: 3000 })
        .catch(() => {});
    throw error;
  } finally {
    await context?.close();
    if (display && display.exitCode === null) {
      display.kill('SIGTERM');
      await Promise.race([once(display, 'exit'), delay(2000)]);
      if (display.exitCode === null) display.kill('SIGKILL');
    }
  }
}
