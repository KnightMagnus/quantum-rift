import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Page } from 'playwright';
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

async function checkDockedLayout(page: Page, label: string, tab: string) {
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
      footerHorizontal: footer.scrollWidth - footer.clientWidth,
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
  assert.ok(
    metrics.footerHorizontal <= 2,
    `${label}: footer horizontal overflow ${metrics.footerHorizontal}`,
  );
  if (['crew', 'outfit', 'community'].includes(tab))
    assert.ok(metrics.horizontal <= 2, `${label}: avoidable form overflow ${metrics.horizontal}`);
  assert.ok(
    metrics.footer.bottom <= metrics.frame.bottom + 1 && metrics.head.top >= metrics.frame.top,
    `${label}: retained header/footer`,
  );
  if (tab === 'crew') {
    await page.locator('#landbody').hover();
    await page.mouse.wheel(0, 10000);
    await page.waitForFunction(() => {
      const body = document.querySelector<HTMLElement>('#landbody')!;
      return body.scrollHeight <= body.clientHeight || body.scrollTop > 0;
    });
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
}

const startedAt = performance.now();
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
            await checkDockedLayout(page, label, tab);
            if (['crew', 'outfit', 'overview'].includes(tab) && width === 800 && scale === 1.4) {
              if (tab === 'outfit') await page.locator('.outfit-table').scrollIntoViewIfNeeded();
              await page.screenshot({ path: path.join(output, label + '.png') });
            }
          }
        }
      }
    }
    if (account.name === 'Layout Hub') {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--ui', '1');
        document.body.classList.remove('scaled');
      });
      await page.locator('#traytoggle').click();
      await page.evaluate(async () => {
        const { ctab } = await import('/ui.js');
        ctab('captains');
      });
      const peer = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      peer.on('pageerror', (error) => errors.push(error.message));
      await peer.goto(origin);
      await peer.waitForFunction(() => document.querySelector('#lver')?.textContent);
      await peer.fill('#lname', 'Layout Owner');
      await peer.fill('#lpass', 'fixture');
      await peer.click('#lbtn');
      await peer.waitForFunction(() => window.G?.you && G.landed);
      for (let index = 0; index < 12 && (await peer.locator('#storybox').isVisible()); index++)
        await peer.locator('#storyb button').first().click();
      await peer.locator('#traytoggle').click();
      await peer.evaluate(async () => {
        const { ctab } = await import('/ui.js');
        ctab('captains');
      });
      await page.locator('[data-cs="friends"]').click();
      await page.locator('#fadd').fill('Layout Owner');
      await page.locator('[data-cact="fadd"]').click();
      await peer.locator('[data-cs="friends"]').click();
      await peer.locator('[data-cact="facc"]').click();
      await page.locator('[data-cact="dm"]').first().click();
      await page
        .locator('#dmin')
        .fill(
          'Synthetic layout fixture: a long message wraps across the narrow companion panel. This text contains no private correspondence. '.repeat(
            2,
          ),
        );
      await page.locator('[data-cact="dmsend"]').click();
      await page.locator('[data-cs="armada"]').click();
      await page.locator('#aname').fill('Layout Armada');
      await page.locator('[data-cact="aform"]').click();
      await page.locator('[data-cact="aleave"]').waitFor();
      await page.locator('#ainv').fill('Layout Owner');
      await page.locator('[data-cact="ainv2"]').click();
      await peer.locator('[data-cs="armada"]').click();
      await peer.locator('[data-cact="aacc"]').click();
      await peer.locator('[data-cact="aleave"]').waitFor();
      for (const [width, height, scale] of [
        [800, 650, 1.4],
        [1280, 720, 1],
        [1280, 720, 1.4],
      ]) {
        await page.setViewportSize({ width: width!, height: height! });
        await page.evaluate((value) => {
          document.documentElement.style.setProperty('--ui', String(value));
          document.body.classList.toggle('scaled', value !== 1);
        }, scale);
        if (
          !(await page
            .locator('body')
            .evaluate((element) => element.classList.contains('tray-open')))
        )
          await page.locator('#traytoggle').click();
        await page.locator('#ltabs [data-lt="crew"]').click();
        await checkDockedLayout(page, `expanded Tray ${width}x${height}/${scale}`, 'crew');
        await page.evaluate(async () => {
          const { ctab } = await import('/ui.js');
          ctab('captains');
        });
        for (const companion of ['friends', 'dm', 'armada', 'trade']) {
          await page.locator(`[data-cs="${companion}"]`).click();
          await checkDockedLayout(
            page,
            `companion ${companion} ${width}x${height}/${scale}`,
            'crew',
          );
          const controls = page.locator(
            '#capview button:not([disabled]), #capview input:not([disabled]), #capview select:not([disabled])',
          );
          if (await controls.count()) {
            const last = controls.last();
            if ((await controls.count()) > 1) {
              await controls.nth((await controls.count()) - 2).focus();
              await page.keyboard.press('Tab');
            } else await last.focus();
            assert.ok(
              await last.evaluate((element) => document.activeElement === element),
              `${companion}: final companion control receives focus`,
            );
            assert.ok(
              await last.evaluate((element) => {
                const rect = element.getBoundingClientRect();
                return element.contains(
                  document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
                );
              }),
              `${companion}: final companion control native hit test`,
            );
          }
        }
        await page.screenshot({
          path: path.join(output, `expanded-Tray-companions-${width}x${height}-${scale}.png`),
        });
        await page.locator('#traytoggle').click();
        assert.equal(await page.locator('#traytoggle').getAttribute('aria-expanded'), 'false');
        await peer.setViewportSize({ width: width!, height: height! });
        await peer.evaluate((value) => {
          document.documentElement.style.setProperty('--ui', String(value));
          document.body.classList.toggle('scaled', value !== 1);
        }, scale);
        await peer.locator('#ltabs [data-lt="crew"]').click();
        await checkDockedLayout(peer, `Armada member station ${width}x${height}/${scale}`, 'crew');
        const leave = peer.locator('[data-cact="aleave"]');
        await leave.focus();
        assert.ok(
          await leave.evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.contains(
              document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2),
            );
          }),
          'Member Leave Armada native hit test',
        );
      }
      await peer.close();
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    `Landed responsive matrix passed in ${((performance.now() - startedAt) / 1000).toFixed(1)}s: four destinations, six viewports, two UI scales, all available tabs/station departments and expanded-Tray companion controls.`,
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
