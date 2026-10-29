import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { augmentAssets } from '../shared/rules.ts';
import { STELLARS, SYS, FACTIONS } from '../shared/galaxy.ts';
import { launchChromium } from './helpers/chromium.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

const directory = tempDataDir('rift-landed-responsive-');
const data = path.join(directory, 'data');
const output = evidenceDir('landed-responsive');
const assets = augmentAssets(
  JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'), 'utf8')),
);
const database = new DB(data);
const colony = Object.values(STELLARS).find(
  (place) =>
    place.kind === 'planet' &&
    place.svc.includes('L') &&
    FACTIONS[SYS[place.system].faction].region,
)!;
const accounts = [
  { name: 'Layout Hub', port: 'qstation' },
  { name: 'Layout Owner', port: 'site-qgate', station: true },
  { name: 'Layout Colony', port: colony.id, colony: true },
  { name: 'Layout Visitor', port: colony.id },
];
for (const account of accounts) {
  const player = {
    ...Game.prototype.fresh.call({ A: assets }),
    story: { done: ['start'], active: null, step: 0, flags: {} },
  };
  player.tut = 999;
  player.story = { done: ['start'], active: null, step: 0, flags: {} };
  player.stellar = account.port;
  player.sys = STELLARS[account.port].system;
  player.credits = 5000000;
  if (account.station) {
    player.station = { ...player.station, claimed: true, site: account.port, ops: 5 };
    database.world.sites[account.port] = database.key(account.name);
  }
  database.create(account.name, 'fixture', player);
}
database.world.colonies = {
  [colony.id]: {
    owner: database.key('Layout Colony'),
    name: 'Layout Farmstead',
    lv: 2,
    buildings: ['farm'],
    store: { food: 120, credits: 34000 },
    t: Date.now(),
  },
};
database.touch();
database.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    HOST_FRIENDS: '1',
    HOST_BIND: '127.0.0.1',
    HOST: '127.0.0.1',
    SOLO: '',
    PORT: String(port),
    FRIEND_DATA_DIR: data,
    HOST_PUBLIC_ORIGIN: origin,
    SEEDS_FILE: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fs.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  for (const account of accounts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(origin);
    await page.waitForFunction(() => document.querySelector('#lver')?.textContent);
    await page.fill('#lname', account.name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => window.G?.you && G.landed);
    for (let index = 0; index < 12 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    await page.waitForFunction(
      () => !document.querySelector('#toasts > div:not(.newcomer-protection)'),
    );
    const tabs = await page
      .locator('#ltabs [data-lt]')
      .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.lt!));
    for (const [width, height] of [
      [800, 650],
      [1280, 720],
      [1920, 1080],
      [2560, 1440],
      [3440, 1440],
      [390, 844],
    ]) {
      for (const scale of [1, 1.4]) {
        await page.setViewportSize({ width: width!, height: height! });
        await page.evaluate((value) => {
          document.documentElement.style.setProperty('--ui', String(value));
          document.body.classList.toggle('scaled', value !== 1);
        }, scale);
        for (const tab of tabs) {
          await page.locator(`#ltabs [data-lt="${tab}"]`).click();
          const sections =
            tab === 'station'
              ? await page
                  .locator('#landbody .stnav button:not([disabled])')
                  .evaluateAll((elements) =>
                    elements.map((element) => (element as HTMLElement).dataset.k!),
                  )
              : [''];
          for (const section of sections) {
            if (section) await page.locator(`#landbody .stnav [data-k="${section}"]`).click();
            const label = `${account.name}-${tab}-${section}-${width}x${height}-${scale}`;
            const metrics = await page.evaluate(() => {
              const body = document.querySelector<HTMLElement>('#landbody')!;
              const frame = document.querySelector<HTMLElement>('#land .landbox')!;
              const head = document.querySelector<HTMLElement>('#ltabs')!;
              const footer = document.querySelector<HTMLElement>('.landfoot')!;
              const rect = body.getBoundingClientRect();
              return {
                bodyHeight: rect.height,
                horizontal: body.scrollWidth - body.clientWidth,
                pageHorizontal: document.documentElement.scrollWidth - innerWidth,
                outerOverflow: frame.scrollHeight - frame.clientHeight,
                head: head.getBoundingClientRect().toJSON(),
                footer: footer.getBoundingClientRect().toJSON(),
                frame: frame.getBoundingClientRect().toJSON(),
              };
            });
            assert.ok(
              metrics.bodyHeight >= 100,
              `${label}: working content height ${JSON.stringify(metrics)}`,
            );
            assert.ok(
              metrics.outerOverflow <= 2,
              `${label}: outer frame must not scroll ${JSON.stringify(metrics)}`,
            );
            assert.ok(metrics.pageHorizontal <= 1, `${label}: page horizontal overflow`);
            if (['crew', 'outfit', 'community'].includes(tab))
              assert.ok(
                metrics.horizontal <= 2,
                `${label}: avoidable form overflow ${metrics.horizontal}`,
              );
            assert.ok(
              metrics.footer.bottom <= metrics.frame.bottom + 1 &&
                metrics.head.top >= metrics.frame.top,
              `${label}: retained header/footer`,
            );
            if (tab === 'crew') {
              await page.locator('#landbody').hover();
              await page.mouse.wheel(0, 10000);
              await page.waitForTimeout(60);
              const last = page.locator('#landbody button:not([disabled])').last();
              const controls = page.locator(
                '#landbody button:not([disabled]), #landbody select:not([disabled]), #landbody input:not([disabled])',
              );
              await controls.nth((await controls.count()) - 2).focus();
              await page.keyboard.press('Tab');
              assert.ok(
                await last.evaluate((element) => document.activeElement === element),
                `${label}: Tab reaches final action`,
              );
              assert.ok(
                await last.evaluate((element) => {
                  const rect = element.getBoundingClientRect();
                  return element.contains(
                    document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
                  );
                }),
                `${label}: final action native hit test`,
              );
            }
            assert.ok(
              await page.locator('#depart').evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return element.contains(
                  document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
                );
              }),
              `${label}: Depart is directly hittable`,
            );
            if (['crew', 'outfit', 'overview'].includes(tab) && width === 800 && scale === 1.4) {
              if (tab === 'outfit') await page.locator('.outfit-table').scrollIntoViewIfNeeded();
              await page.screenshot({ path: path.join(output, label + '.png') });
            }
          }
        }
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Landed responsive matrix passed: four destinations, six viewports, two UI scales, all available tabs and station departments.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
