import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { Browser, Page, Locator } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { landscapeScene, colonyStage } from '../shared/landscapes.ts';
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

const output = evidenceDir('colony-exchange-layout');
const directory = tempDataDir('colony-exchange-');
const db = new DB(path.join(directory, 'data'));
const assets = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const game = new Game(assets, db, { ...db.gamePlatform(), automaticClock: false });
const worlds = Object.values(STELLARS).filter((body) => game.features.frontier.colonizable(body));
assert.ok(worlds.length >= 2);
const configs = [
  { name: 'Layout Owner', world: worlds[0], branch: 'owner' },
  { name: 'Layout Visitor', world: worlds[0], branch: 'visitor' },
  { name: 'Layout Open', world: worlds[1], branch: 'open' },
  { name: 'Layout Market A', world: STELLARS.qstation, branch: 'market' },
  { name: 'Layout Market B', world: STELLARS.qstation, branch: 'market' },
  { name: 'Layout Station', world: STELLARS['site-qgate'], branch: 'station' },
  { name: 'Layout Guest', world: STELLARS['site-qgate'], branch: 'guest' },
];
for (const config of configs) {
  const account = game.fresh();
  account.tut = 999;
  account.sys = config.world.system;
  account.stellar = config.world.id;
  Object.assign(account, { story: { done: ['start'], active: null, step: 0 } });
  account.credits = 5000000;
  if (config.branch === 'station') {
    account.station = { ...account.station, claimed: true, site: config.world.id, ops: 5 };
    db.world.sites[config.world.id] = db.key(config.name);
  }
  db.create(config.name, 'fixture', account);
}
db.world.colonies[worlds[0].id] = {
  owner: db.key('Layout Owner'),
  lv: 2,
  name: 'Long Settlement Name With Farms And A Busy Stockpile',
  buildings: ['farm'],
  store: { food: 120, credits: 34000 },
  t: Date.now(),
};
db.touch();
db.flush();
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', './test/seed-random.ts', 'server/main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    HOST_FRIENDS: '1',
    HOST_BIND: '127.0.0.1',
    HOST: '127.0.0.1',
    SOLO: '',
    PORT: String(port),
    FRIEND_DATA_DIR: db.dir,
    HOST_PUBLIC_ORIGIN: origin,
    SEEDS_FILE: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser: Browser | undefined;
const errors: string[] = [];
const measurements: object[] = [];
const views = [
  [800, 650, 1],
  [1280, 720, 1],
  [1920, 1080, 1],
  [2560, 1440, 1],
  [3440, 1440, 1],
  [800, 650, 1.4],
  [1920, 1080, 1.4],
];
async function login(name: string) {
  const page = await browser!.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin);
  await page.fill('#lname', name);
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => !!G.you && !!G.landed);
  assert.equal(Boolean(await page.evaluate(() => G.solo)), false, 'Online controls remain enabled');
  for (let index = 0; index < 12 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  return page;
}
async function hit(locator: Locator) {
  assert.ok(
    await locator.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
      return !!target && (target === element || element.contains(target));
    }),
    'Action is pointer reachable',
  );
}
async function noOverflow(page: Page) {
  const metrics = await page
    .locator('#landbody')
    .evaluate((body) => ({ width: body.clientWidth, scrollWidth: body.scrollWidth }));
  assert.ok(
    metrics.scrollWidth <= metrics.width + 1,
    'No menu horizontal overflow: ' + JSON.stringify(metrics),
  );
}
try {
  await ready(server, origin);
  assert.equal((await (await fetch(origin + '/api/status')).json()).mode, 'friends');
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  for (const config of configs.slice(0, 3)) {
    const page = await login(config.name);
    await page.locator('[data-lt="colony"]').click();
    for (const [width, height, scale] of views) {
      await page.setViewportSize({ width, height });
      await page.evaluate((scale) => {
        document.documentElement.style.setProperty('--ui', String(scale));
        document.body.classList.toggle('scaled', scale !== 1);
      }, scale);
      await page.locator('#landbody').evaluate((body) => {
        body.scrollTop = 0;
      });
      const image = page.locator('.colony-illustration img');
      await image.evaluate((image: HTMLImageElement) => image.decode());
      const level = config.branch === 'open' ? 0 : 2;
      assert.ok((await image.getAttribute('src'))!.includes(landscapeScene(config.world, level)));
      assert.ok(
        (await image.getAttribute('alt'))!.includes(
          level ? `settlement stage ${colonyStage(level)}` : 'unsettled',
        ),
      );
      await noOverflow(page);
      const geometry = await page.locator('.colony-content').evaluate((content) => {
        const art = content.querySelector('.colony-illustration')!.getBoundingClientRect();
        const management = content.querySelector('.colony-management')!.getBoundingClientRect();
        return { width: content.clientWidth, art: art.toJSON(), management: management.toJSON() };
      });
      if (geometry.width >= 720)
        assert.ok(geometry.art.right < geometry.management.x, 'Side-by-side management');
      if (height <= 760) assert.ok(geometry.art.height <= 90 * scale + 1, 'Short-screen thumbnail');
      measurements.push({ branch: config.branch, width, height, scale, geometry });
      if (config.branch === 'owner') {
        const collect = page.locator('[data-op="collect"]');
        if (width >= 1920 && scale === 1) await hit(collect);
        const body = page.locator('#landbody');
        const box = (await body.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + Math.min(40, box.height / 2));
        await page.mouse.wheel(0, 2000);
        await page.waitForFunction(() => {
          const body = document.querySelector('#landbody')!;
          return body.scrollHeight <= body.clientHeight || body.scrollTop > 0;
        });
        const abandon = page.locator('[data-op="abandon"]');
        await abandon.focus();
        await hit(abandon);
        await page.locator('[data-op="upgrade"]').focus();
        await page.keyboard.press('Tab');
        assert.equal(await collect.evaluate((button) => button === document.activeElement), true);
        await hit(collect);
        assert.ok(await page.locator('[data-op="build"]').count());
        assert.ok(await page.locator('[data-op="upgrade"]').count());
      } else {
        assert.equal(await page.locator('[data-op="collect"]').count(), 0);
        assert.equal(
          await page.locator('[data-op="found"]').count(),
          config.branch === 'open' ? 1 : 0,
        );
      }
      await page.screenshot({
        path: path.join(output, `${config.branch}-${width}x${height}-s${scale}.png`),
      });
    }
    await page.close();
  }
  const market = await login('Layout Market A');
  const rival = await login('Layout Market B');
  await market.locator('[data-lt="exchange"]').click();
  await rival.locator('[data-lt="exchange"]').click();
  assert.ok((await market.locator('#landbody').innerText()).includes('No orders yet.'));
  for (const page of [market, rival]) {
    await page.selectOption('#xitem', 'com:food');
    await page.selectOption('#xside', 'buy');
    await page.fill('#xqty', '2');
    await page.fill('#xprice', '100');
    await page.locator('[data-act="xplace"]').click();
    await page.waitForFunction(() => G.landed!.exchange!.mine.length === 1);
  }
  for (const [width, height, scale] of views) {
    await market.setViewportSize({ width, height });
    await market.evaluate((scale) => {
      document.documentElement.style.setProperty('--ui', String(scale));
      document.body.classList.toggle('scaled', scale !== 1);
    }, scale);
    await market.locator('#landbody').evaluate((body) => {
      body.scrollTop = 0;
    });
    await noOverflow(market);
    for (const id of ['xitem', 'xside', 'xqty', 'xprice', 'xto', 'xamt'])
      assert.ok(await market.locator(`label[for="${id}"]`).count(), `Visible label for ${id}`);
    const submit = market.locator('[data-act="xplace"]');
    await market.locator('#xprice').focus();
    await market.keyboard.press('Tab');
    assert.equal(await submit.evaluate((button) => button === document.activeElement), true);
    await hit(submit);
    await market.screenshot({
      path: path.join(output, `exchange-order-${width}x${height}-s${scale}.png`),
    });
    const send = market.locator('[data-act="xsend"]');
    await market.locator('#xamt').focus();
    await market.keyboard.press('Tab');
    assert.equal(await send.evaluate((button) => button === document.activeElement), true);
    await hit(send);
    await market.screenshot({
      path: path.join(output, `exchange-${width}x${height}-s${scale}.png`),
    });
  }
  await market.locator('[data-act="xcancel"]').click();
  await market.waitForFunction(() => G.landed!.exchange!.mine.length === 0);
  await market.selectOption('#xitem', 'com:food');
  await market.selectOption('#xside', 'sell');
  await market.fill('#xqty', '9999');
  await market.fill('#xprice', '100');
  await market.locator('[data-act="xplace"]').click();
  await market.waitForFunction(() =>
    document
      .querySelector('#toasts')
      ?.textContent?.includes('You do not have that much in your hold.'),
  );
  assert.equal(
    await market.evaluate(() => G.landed!.exchange!.mine.length),
    0,
    'Goods denial preserved',
  );
  await rival.locator('[data-act="xcancel"]').click();
  await rival.waitForFunction(() => G.landed!.exchange!.mine.length === 0);
  for (const name of ['Layout Station', 'Layout Guest']) {
    const page = await login(name);
    assert.equal(
      Boolean(await page.evaluate(() => G.landed!.site!.own)),
      name === 'Layout Station',
    );
    await page.evaluate(async () => {
      const { ctab } = await import('/ui.js');
      ctab('captains');
    });
    await page.locator('[data-cs="trade"]').click();
    assert.ok(
      (await page.locator('#capview').innerText()).includes(
        'Both captains must be at their own Personal Station to trade.',
      ),
    );
    assert.equal(
      await page.locator('[data-cact="topen2"]').count(),
      name === 'Layout Station' ? 1 : 0,
      'Trade opening remains own-station only, not guest docking',
    );
    await page.screenshot({ path: path.join(output, name.replaceAll(' ', '-') + '-trade.png') });
    await page.close();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(path.join(output, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(
    'PASS colony branches, art stages, wheel/focus reachability, exchange labels/place/cancel/denial, and trade guidance',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
