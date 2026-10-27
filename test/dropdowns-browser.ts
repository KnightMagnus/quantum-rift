import { launchChromium } from './helpers/chromium.ts';
// Native controls stay native: real station navigation, assignment and keyboard input.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const output = evidenceDir('dropdowns');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-dropdowns-'));
// Supply a progressed fixture explicitly; shipped startup has no testing accounts.
const fixtureSeeds = path.join(directory, 'seeds.json');
const captain = JSON.parse(
  fileSystem.readFileSync(path.join(root, 'test/seeds_knight.json'), 'utf8').toString(),
)[0];
Object.assign(captain, {
  name: 'Dropdown Captain',
  pass: 'fixture-pass',
  storedShips: 'specialists',
});
fileSystem.writeFileSync(fixtureSeeds, JSON.stringify([captain]));
const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  ['--import', './test/seed-random.ts', 'server/local-main.ts'],
  {
    cwd: root,
    env: {
      ...process.env,
      SOLO: '',
      PORT: String(port),
      DATA_DIR: path.join(directory, 'data'),
      SEEDS_FILE: fixtureSeeds,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
const errors: string[] = [],
  inventory = [];
const baseline = process.env.RIFT_DROPDOWN_BASELINE === '1';
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({
    viewport: { width: 1500, height: 1050 },
    colorScheme: 'light',
  });
  page.on('pageerror', (event) => errors.push(String(event)));
  async function audit(surface: string, selector = 'select') {
    // Query and inspect in one browser task. Locator.evaluateAll first snapshots
    // nodes; an arriving refinery preview can replace them before its callback.
    const styles = await page.evaluate(
      (selector) =>
        [...document.querySelectorAll<HTMLElement>(selector)].map((entity) => {
          const session = getComputedStyle(entity);
          return {
            id: entity.id || entity.outerHTML.slice(0, 100),
            background: session.backgroundColor,
            color: session.color,
            scheme: session.colorScheme,
            options: [...entity.querySelectorAll('option, optgroup')].map((options) => ({
              background: getComputedStyle(options).backgroundColor,
              color: getComputedStyle(options).color,
            })),
          };
        }),
      selector,
    );
    assert.ok(styles.length, surface);
    inventory.push({ surface, styles });
    if (!baseline)
      for (const session of styles) {
        assert.equal(session.background, 'rgb(4, 24, 45)', surface + ' closed background');
        assert.equal(session.color, 'rgb(213, 243, 255)', surface + ' closed text');
        assert.equal(session.scheme, 'dark', surface + ' native popup scheme');
        for (const options of session.options) {
          assert.equal(options.background, 'rgb(4, 24, 45)', surface + ' option background');
          assert.equal(options.color, 'rgb(213, 243, 255)', surface + ' option text');
        }
      }
  }
  async function capture(name: string) {
    await page.screenshot({ path: path.join(output, name + '.png'), fullPage: true });
  }
  await page.goto(origin);
  await audit('login document / map commodity and initialized dynamic controls');
  await capture('login');
  await page.locator('#lname').fill('Dropdown Captain');
  await page.locator('#lpass').fill('fixture-pass');
  await page.locator('#lbtn').click();
  await page.waitForFunction(() => G.you && G.landed);
  for (let index = 0; index < 10 && (await page.locator('#storybox').isVisible()); index++)
    await page.locator('#storyb button').first().click();
  await page.locator('[data-lt="station"]').click();
  await audit('station relocation', '#relsite');
  await page.locator('#landbody [data-act="stab"][data-k="hangar"]').click();
  await page.locator('#landbody select[data-crew]').first().waitFor();
  await audit('hangar crew and shuttle jobs', '#landbody select');
  await capture('hangar-reference');
  await page.locator('#landbody [data-act="stab"][data-k="docks"]').click();
  const pick = page.locator('#landbody .dpick[data-dk="0"][data-slot="0"]');
  await pick.waitFor();
  // Render production selectors with controlled names without mutating live game state.
  const labels = await page.evaluate(async () => {
    const { docksHtml } = await import('/docks_ui.js');
    const stored = [
      { uid: 'default', hull: 'fixture', name: 'Lodestar' },
      { uid: 'empty', hull: 'fixture', name: '' },
      { uid: 'missing', hull: 'fixture' },
      { uid: 'space', hull: 'fixture', name: '   ' },
      { uid: 'custom', hull: 'fixture', name: 'Aurora' },
      { uid: 'escaped', hull: 'fixture', name: '<Aurora & "Nova">' },
      { uid: 'wing', hull: 'fixture', name: 'Lodestar', wingOnly: true },
    ];
    const flying = { uid: 'flying', hull: 'fixture', name: 'Lodestar', flying: true };
    const fixture = {
      A: { ships: { fixture: { name: 'Lodestar', img: '' } } },
      you: {
        officers: [],
        docks: {
          count: 1,
          active: 0,
          cap: 10,
          stored,
          list: [{ letter: 'A', lead: flying, wings: [stored[4], null] }],
        },
      },
    };
    const host = document.createElement('div');
    host.innerHTML = docksHtml(
      fixture as unknown as import('../client/main.ts').ClientGameState,
      true,
    );
    return [...host.querySelectorAll('.dpick')].map((select) => ({
      slot: (select as HTMLElement).dataset.slot,
      selected: (select as HTMLInputElement).value,
      injected: !!select.querySelector('aurora'),
      options: [...(select as HTMLSelectElement).options].map((options) => ({
        value: options.value,
        text: options.textContent,
      })),
    }));
  });
  for (const select of labels) {
    assert.equal(select.injected, false, 'Custom names remain escaped text');
    for (const shipUid of ['default', 'empty', 'missing', 'space'])
      assert.equal(select.options.find((options) => options.value === shipUid)!.text, 'Lodestar');
    assert.equal(
      select.options.find((options) => options.value === 'custom')!.text,
      'Lodestar "Aurora"',
    );
    assert.equal(
      select.options.find((options) => options.value === 'escaped')!.text,
      'Lodestar "<Aurora & "Nova">"',
    );
    assert.equal(
      select.options.some((options) => options.value === 'wing'),
      select.slot !== 'lead',
    );
  }
  assert.equal(labels[0].selected, 'flying');
  assert.equal(
    labels[0].options.find((options) => options.value === 'flying')!.text,
    'Lodestar (flying)',
  );
  assert.equal(labels[1].selected, 'custom');
  inventory.push({
    surface: 'dock labels: default/empty/missing/custom/escaped and selection',
    labels,
  });
  await audit('dynamic docks ship selectors', '#landbody select');
  await pick.hover();
  if (!baseline)
    assert.equal(
      await pick.evaluate((entity) => getComputedStyle(entity).borderTopColor),
      'rgb(170, 170, 170)',
    );
  await capture('docks-closed');
  await pick.click();
  await capture('docks-open-attempt');
  await page.keyboard.press('Escape');
  const replacementWingUid = await pick
    .locator('option')
    .evaluateAll(
      (operatingSystem2) =>
        (
          operatingSystem2.find(
            (candidateOption) =>
              (candidateOption as HTMLInputElement).value &&
              !(candidateOption as HTMLOptionElement).selected,
          )! as HTMLInputElement
        ).value,
    );
  await pick.selectOption(replacementWingUid);
  await page.waitForFunction(
    (expectedWingUid) => G.you!.docks.list[0].wings[0]?.uid === expectedWingUid,
    replacementWingUid,
  );
  await audit('docks re-render with captain and crew', '#landbody select');
  await pick.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  if (!baseline) {
    const focus = await pick.evaluate((entity) => ({
      focused: entity.matches(':focus-visible'),
      outline: getComputedStyle(entity).outlineWidth,
    }));
    assert.equal(focus.focused, true);
    assert.equal(focus.outline, '2px');
  }
  await capture('docks-keyboard-focus');
  await page.locator('[data-lt="yard"]').click();
  await audit('shipyard sort', '#ysort');
  const wallet = await page.evaluate(() => ({ credits: G.you!.credits, hull: G.you!.ship.hull }));
  const card = page.locator('#landbody [data-act="sel"]').last();
  await card.scrollIntoViewIfNeeded();
  const selectedHull = Number(await card.getAttribute('data-h'));
  assert.ok(await page.locator('#landbody').evaluate((entity) => entity.scrollTop > 100));
  await capture('shipyard-scrolled-before-selection');
  await card.click();
  await page.waitForFunction((hull) => G.sel === hull, selectedHull);
  await capture('shipyard-selected-top');
  if (!baseline)
    assert.equal(await page.locator('#landbody').evaluate((entity) => entity.scrollTop), 0);
  if (!baseline) {
    const bounds = await page.locator('#landbody').evaluate((entity) => {
      const result = entity.getBoundingClientRect();
      return [...entity.querySelectorAll('.detail .kv, .detail button[data-act="buyhangar"]')].map(
        (quantity) => {
          const secondCaptain = quantity.getBoundingClientRect();
          return secondCaptain.top >= result.top && secondCaptain.bottom <= result.bottom;
        },
      );
    });
    assert.ok(bounds.length > 3 && bounds.every(Boolean), 'purchase button and stats visible');
  }
  await page.locator('#landbody [data-act="sel"]').last().scrollIntoViewIfNeeded();
  const browsingTop = await page.locator('#landbody').evaluate((entity) => entity.scrollTop);
  // The production background renderer must not jump a captain back to details.
  await page.evaluate(async () => (await import('/ui.js')).renderLanded());
  assert.equal(await page.locator('#landbody').evaluate((entity) => entity.scrollTop), browsingTop);
  assert.equal(await page.evaluate(() => G.sel), selectedHull);
  assert.deepEqual(
    await page.evaluate(() => ({ credits: G.you!.credits, hull: G.you!.ship.hull })),
    wallet,
  );
  await page.locator('#ysort').scrollIntoViewIfNeeded();
  await page.locator('#ysort').focus();
  await page.keyboard.press('End');
  await page.keyboard.press('Tab');
  await page.waitForFunction(
    () =>
      G.ysort === (document.querySelector<HTMLElement>('#ysort')! as HTMLInputElement).value &&
      G.ysort !== 'cost',
  );
  await capture('shipyard');
  await page.locator('[data-lt="refinery"]').click();
  await audit('refinery recipe grade service', '#landbody select');
  await page.selectOption('#refgrade', 'pure');
  assert.equal(await page.locator('#refgrade').inputValue(), 'pure');
  await capture('refinery');
  await page.locator('#optbtn').click();
  await capture('options-no-dropdowns');
  await page.locator('#optclose').click();
  await page.locator('#cbmap').click();
  await audit('map commodity', '#gcid');
  await capture('map');
  // Synthetic edge fixture only: no current optgroups/disabled options in game markup.
  await page.evaluate(() => {
    const session = document.createElement('select');
    session.id = 'dropdown-edge';
    session.innerHTML =
      '<optgroup label="Group"><option>Available</option><option disabled>Unavailable</option></optgroup>';
    document.body.append(session);
  });
  if (!baseline) {
    const edge = await page.locator('#dropdown-edge').evaluate((entity) => {
      const disabledOption = entity.querySelector('option:disabled');
      (entity as HTMLButtonElement).disabled = true;
      return {
        bg: getComputedStyle(entity).backgroundColor,
        text: getComputedStyle(entity).color,
        option: getComputedStyle(disabledOption!).color,
        opacity: getComputedStyle(entity).opacity,
        group: getComputedStyle(entity.querySelector('optgroup')!).backgroundColor,
      };
    });
    assert.deepEqual(edge, {
      bg: 'rgb(4, 24, 45)',
      text: 'rgb(170, 170, 170)',
      option: 'rgb(170, 170, 170)',
      opacity: '1',
      group: 'rgb(4, 24, 45)',
    });
  }
  assert.deepEqual(errors, []);
  fileSystem.writeFileSync(path.join(output, 'styles.json'), JSON.stringify(inventory, null, 2));
  console.log(
    'PASS native dropdown theme, real dock assignment/re-render, keyboard sort/focus, representative screens',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
