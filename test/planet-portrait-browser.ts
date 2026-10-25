import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium, type Page } from 'playwright';
import { DB } from '../server/db.ts';
import { Game } from '../server/game.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { landscapeScene } from '../shared/landscapes.ts';
import { PLAYER_PORTRAITS } from '../shared/portraits.ts';
import { STORY } from '../shared/story.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';

type PortraitTestWindow = Window & {
  artSocket?: WebSocket;
  heldPortraits?: string[];
  portraitFault?: 'hold' | 'deny';
};

async function openProfile(page: Page) {
  if (!(await page.locator('#infobox').isVisible())) await page.click('#captainshortcut');
  await page.click('[data-it="profile"]');
  await page.locator('#captainprofile').waitFor({ state: 'visible' });
}

const output = evidenceDir('planet-portrait');
const directory = tempDataDir('planet-portrait-browser-');
const db = new DB(path.join(directory, 'data'));
const assets = JSON.parse(fs.readFileSync(path.join(root, 'shared/assets.json'), 'utf8'));
const game = new Game(assets, db, { ...db.gamePlatform(), automaticClock: false });
const planets = Object.values(STELLARS)
  .filter((body) => game.features.frontier.colonizable(body))
  .slice(0, 11);
assert.equal(planets.length, 11);
const fixtures: { name: string; world: string; level: number; own: boolean }[] = [];
for (let index = 0; index < 11; index++) {
  const name = `Art Captain ${index}`;
  const body = planets[index];
  const account = game.fresh();
  account.tut = 999;
  account.sys = body.system;
  account.stellar = body.id;
  Object.assign(account, { story: { done: ['start'], active: null, step: 0 } });
  db.create(name, 'fixture', account);
  const level = index < 10 ? (index % 5) + 1 : 0;
  const own = index < 5;
  if (level)
    db.world.colonies[body.id] = {
      owner: own ? db.key(name) : db.key('Art Captain 0'),
      lv: level,
      buildings: [],
      store: {},
      t: Date.now(),
      name: `${body.name} Colony`,
    };
  fixtures.push({ name, world: body.id, level, own });
}
db.touch();
db.flush();
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '1',
      PORT: String(port),
      DATA_DIR: db.dir,
      SEEDS_FILE: '/nonexistent',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const log = fs.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [index, fixture] of fixtures.entries()) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(String(error));
      console.error('Browser exception:', String(error));
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error('Browser console:', message.text());
    });
    page.on('requestfailed', (request) =>
      console.error('Browser request failed:', request.url(), request.failure()),
    );
    await page.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args: ConstructorParameters<typeof WebSocket>) {
          super(...args);
          (window as Window & { artSocket?: WebSocket }).artSocket = this;
        }
      };
    });
    await page.goto(origin);
    await page.waitForFunction(() => typeof G !== 'undefined');
    await page.fill('#lname', fixture.name);
    await page.click('#lbtn');
    await page.waitForFunction(() => !!G.landed);
    assert.equal(await page.evaluate(() => G.landed!.stellar), fixture.world);
    if (index === 0) {
      for (const encounter of [
        { id: 'qv1', portrait: 'story-selani' },
        { id: 'qv3', portrait: 'story-elders' },
        { id: 'qv2', done: true, portrait: 'story-sailwright' },
        { id: 'guests', portrait: 'story-clerk' },
        { id: 'shades-below', portrait: 'story-prisoner' },
      ]) {
        const mission = STORY.find((mission) => mission.id === encounter.id)!;
        await page.evaluate(
          ({ mission, done }) => {
            window.dispatchEvent(
              new CustomEvent('rift-story', {
                detail: {
                  t: 'story',
                  id: mission.id,
                  title: mission.title,
                  text: done ? mission.done : mission.text,
                  done,
                  acc: mission.acc,
                  ref: mission.ref,
                },
              }),
            );
          },
          { mission, done: encounter.done },
        );
        const portrait = page.locator('#storyportrait');
        await portrait.evaluate((image: HTMLImageElement) => image.decode());
        assert.ok((await portrait.getAttribute('src'))!.includes(encounter.portrait));
        assert.ok(await portrait.getAttribute('alt'));
        assert.equal(await page.locator('#storycharacter').isVisible(), true);
        if (encounter.id === 'qv1') {
          await page.locator('#storybox').evaluate((panel) => {
            for (const animation of panel.getAnimations({ subtree: true })) {
              if (animation.effect?.getComputedTiming().iterations !== Infinity) animation.finish();
            }
          });
          await page.screenshot({ path: path.join(output, 'main-story-portrait.png') });
          await page.setViewportSize({ width: 390, height: 640 });
          await page.locator('#storyyes').scrollIntoViewIfNeeded();
          const button = await page.locator('#storyyes').boundingBox();
          assert.ok(button && button.y >= 0 && button.y + button.height <= 640);
          const panel = await page.locator('#storybox .storyin').boundingBox();
          assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 390);
          await page.setViewportSize({ width: 1280, height: 900 });
        }
        await page.click(encounter.done ? '#storyok' : '#storyno');
      }
      await page.evaluate(() =>
        window.dispatchEvent(
          new CustomEvent('rift-story', {
            detail: {
              t: 'story',
              id: 'unknown-story',
              title: 'A text-only encounter',
              text: 'No character portrait belongs to this encounter.',
              done: true,
            },
          }),
        ),
      );
      assert.equal(await page.locator('#storycharacter').isVisible(), false);
      assert.equal(await page.locator('#storyportrait').getAttribute('src'), null);
      assert.equal(await page.locator('#storycharactername').textContent(), '');
      await page.click('#storyok');
    }
    await page.locator('[data-lt="colony"]').click();
    const illustration = page.locator('.colony-illustration img');
    await illustration.evaluate((image: HTMLImageElement) => image.decode());
    const dimensions = await illustration.evaluate((image: HTMLImageElement) => [
      image.naturalWidth,
      image.naturalHeight,
    ]);
    assert.deepEqual(dimensions, [612, 285]);
    assert.ok(
      (await illustration.getAttribute('src'))!.includes(
        landscapeScene(STELLARS[fixture.world], fixture.level) + '.jpg',
      ),
    );
    if (fixture.level)
      assert.equal(
        await page.locator('[data-op="upgrade"]').count(),
        fixture.own && fixture.level < 5 ? 1 : 0,
      );
    else assert.equal(await page.locator('[data-op="found"]').count(), 1);
    await page.locator('[data-lt="overview"]').click();
    await page.locator('[data-lt="colony"]').click();
    assert.ok(
      (await illustration.getAttribute('src'))!.includes(
        landscapeScene(STELLARS[fixture.world], fixture.level),
      ),
    );
    if (index === 4) {
      await page.screenshot({ path: path.join(output, 'colony-stage3.png') });
      await openProfile(page);
      await page.locator('#portraitpreview').evaluate((image: HTMLImageElement) => image.decode());
      await page.locator(`input[value="${PLAYER_PORTRAITS.at(-1)!.id}"]`).check();
      assert.match(await page.locator('#portraitstatus').innerText(), /not saved/);
      await page.click('#portraitsave');
      await page.waitForFunction(
        () => document.getElementById('portraitstatus')!.textContent === 'Saved.',
      );
      await page.locator('#captainprofile').evaluate((panel) => {
        panel.scrollTop = 0;
      });
      await page.screenshot({ path: path.join(output, 'profile-chooser.png') });
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#captainprofile').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'captainshortcut');
      await page.reload();
      await page.waitForFunction(() => typeof G !== 'undefined');
      await page.fill('#lname', fixture.name);
      await page.click('#lbtn');
      await page.waitForFunction(() => !!G.landed);
      assert.equal(await page.evaluate(() => G.you!.portraitId), PLAYER_PORTRAITS.at(-1)!.id);
      // Fault the transport, not the chooser: denial and missing acknowledgements must recover.
      await page.evaluate(() => {
        const testWindow = window as PortraitTestWindow;
        const socket = testWindow.artSocket!;
        const originalSend = socket.send.bind(socket);
        testWindow.heldPortraits = [];
        socket.send = (data) => {
          if (typeof data === 'string') {
            const packet = JSON.parse(data);
            if (packet.t === 'portrait' && testWindow.portraitFault === 'hold') {
              testWindow.heldPortraits!.push(data);
              return;
            }
            if (packet.t === 'portrait' && testWindow.portraitFault === 'deny') {
              originalSend(JSON.stringify({ ...packet, portraitId: '../denied.png' }));
              return;
            }
          }
          originalSend(data);
        };
        testWindow.portraitFault = 'deny';
      });
      await openProfile(page);
      await page.click('#portraitsave');
      await page.waitForFunction(() =>
        document.getElementById('portraitstatus')!.textContent!.includes('was not saved'),
      );
      assert.equal(await page.locator('#portraitsave').isEnabled(), true);
      assert.equal(await page.evaluate(() => G.you!.portraitId), PLAYER_PORTRAITS.at(-1)!.id);
      await page.evaluate(() => ((window as PortraitTestWindow).portraitFault = 'hold'));
      await page.locator('#portraitchoices input').nth(3).check();
      await page.click('#portraitsave');
      assert.equal(await page.locator('#portraitsave').isDisabled(), true);
      await page.locator('#portraitchoices input:checked').focus();
      await page.keyboard.press('Tab');
      assert.equal(
        await page
          .locator('[data-it="ship"]')
          .evaluate((element) => element === document.activeElement),
        true,
        'Pending-save radio group wraps Tab to Captain navigation',
      );
      await page.keyboard.press('Shift+Tab');
      assert.equal(
        await page
          .locator('#portraitchoices input:checked')
          .evaluate((element) => element === document.activeElement),
        true,
        'Reverse Tab returns to the checked portrait, not another radio',
      );
      await page.waitForFunction(
        () => document.getElementById('portraitstatus')!.textContent!.includes('No confirmation'),
        null,
        { timeout: 15000 },
      );
      assert.equal(await page.locator('#portraitsave').isEnabled(), true);
      await page.click('#portraitsave');
      await page.evaluate(() => {
        const testWindow = window as PortraitTestWindow;
        const old = JSON.parse(testWindow.heldPortraits![0]);
        testWindow.artSocket!.dispatchEvent(
          new MessageEvent('message', {
            data: JSON.stringify({ ...old, ok: true }),
          }),
        );
      });
      assert.equal(await page.locator('#portraitstatus').innerText(), 'Saving…');
      assert.equal(await page.locator('#portraitsave').isDisabled(), true);
      await page.keyboard.press('Escape');
      await openProfile(page);
      assert.equal(await page.locator('#portraitsave').isEnabled(), true);
      await page.click('#portraitsave');
      await page.evaluate(() => {
        const testWindow = window as PortraitTestWindow;
        const old = JSON.parse(testWindow.heldPortraits![1]);
        testWindow.artSocket!.dispatchEvent(
          new MessageEvent('message', { data: JSON.stringify({ ...old, ok: true }) }),
        );
      });
      assert.equal(await page.locator('#portraitsave').isDisabled(), true);
      assert.equal(await page.locator('#portraitstatus').innerText(), 'Saving…');
      await page.evaluate(() => {
        const testWindow = window as PortraitTestWindow;
        testWindow.portraitFault = undefined;
        testWindow.artSocket!.send(testWindow.heldPortraits!.at(-1)!);
      });
      await page.waitForFunction(
        () => document.getElementById('portraitstatus')!.textContent === 'Saved.',
      );
      assert.equal(await page.locator('#portraitsave').isEnabled(), true);
      await page.keyboard.press('Escape');
      // A real outgoing docking-control hail carries its server-assigned portrait.
      await page.evaluate(() => {
        (window as Window & { artSocket?: WebSocket }).artSocket!.send(
          JSON.stringify({ t: 'hail', stellar: G.landed!.stellar }),
        );
      });
      await page.waitForFunction(
        () => !document.getElementById('hailbox')!.classList.contains('hidden'),
      );
      await page.locator('#hailportrait').evaluate((image: HTMLImageElement) => image.decode());
      assert.equal(
        await page
          .locator('#hailportrait')
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
        512,
      );
      assert.equal(
        await page.evaluate(
          () =>
            getComputedStyle(document.getElementById('landpic')!, '::after').backgroundImage ===
            getComputedStyle(document.getElementById('hailportraitwindow')!, '::after')
              .backgroundImage,
        ),
        true,
        'hail uses the exact final landed-art static fuzz',
      );
      await page.screenshot({ path: path.join(output, 'docking-hail.png') });
      await openProfile(page);
      assert.equal(await page.locator('#captainprofile').isVisible(), true);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#captainprofile').isVisible(), false);
      assert.equal(
        await page.locator('#hailbox').isVisible(),
        true,
        'Escape closes only the topmost profile, not the underlying hail',
      );

      await page.getByRole('button', { name: 'INBOX', exact: true }).click();
      assert.equal(await page.locator('#hailportrait').getAttribute('src'), null);
      await page.getByRole('button', { name: 'CLOSE', exact: true }).click();
      await page.setViewportSize({ width: 600, height: 780 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      for (const scale of [0.8, 1, 1.4]) {
        await page.evaluate((value) => {
          document.documentElement.style.setProperty('--ui', String(value));
          document.body.classList.toggle('scaled', value !== 1);
        }, scale);
        const profileFits = await page.locator('#captainshortcut').evaluate((button) => {
          const label = document.createRange();
          label.selectNodeContents(button.querySelector('.function-label')!);
          const text = label.getBoundingClientRect();
          const bounds = button.querySelector('.function-label')!.getBoundingClientRect();
          return text.width <= bounds.width && bounds.width <= button.getBoundingClientRect().width;
        });
        assert.equal(profileFits, true, `Captain shortcut label fits at scale ${scale}`);
        if (scale === 1)
          await page.screenshot({ path: path.join(output, 'compact-profile-button.png') });
        await openProfile(page);
        await page.locator('#portraitchoices input:checked').focus();
        const priorChoice = await page.locator('#portraitchoices input:checked').inputValue();
        await page.keyboard.press('ArrowRight');
        assert.notEqual(
          await page.locator('#portraitchoices input:checked').inputValue(),
          priorChoice,
          'native radio keyboard navigation remains available',
        );
        assert.match(await page.locator('#portraitstatus').innerText(), /not saved/);
        await page.locator('#portraitsave').focus();
        const bounds = await page.locator('#portraitsave').boundingBox();
        const modal = await page.locator('#infobox .gbox').boundingBox();
        assert.ok(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 780);
        assert.ok(modal && modal.x >= 0 && modal.x + modal.width <= 600);
        await page.keyboard.press('Escape');
      }
      await page.evaluate(() => {
        document.documentElement.style.setProperty('--ui', '1');
        document.body.classList.remove('scaled');
      });
      await page.locator('[data-op="abandon"]').focus();
      const colonyControl = await page.locator('[data-op="abandon"]').boundingBox();
      assert.ok(
        colonyControl && colonyControl.y >= 0 && colonyControl.y + colonyControl.height < 780,
      );
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.click('#depart');
      await page.waitForFunction(() => !G.landed);
      const profileFits = await page.locator('#captainshortcut').evaluate((button) => {
        const label = document.createRange();
        label.selectNodeContents(button.querySelector('.function-label')!);
        return label.getBoundingClientRect().width <= button.getBoundingClientRect().width;
      });
      assert.equal(profileFits, true, 'Captain shortcut label fits desktop button');
      await page.screenshot({ path: path.join(output, 'flight-profile-button.png') });
      await openProfile(page);
      assert.equal(await page.locator('#captainprofile').isVisible(), true);
      await page.keyboard.press('Escape');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Actual own/foreign colony levels1–5 + unsettled, chooser save/relogin, docking hail decode and narrow controls passed.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, log, directory);
}
