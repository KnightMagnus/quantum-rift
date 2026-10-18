import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';

const f = await miningFixture('chat-projection');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(f.origin);
  await page.fill('#lname', 'Mining Alpha');
  await page.fill('#lpass', 'fixture');
  await page.click('#lbtn');
  await page.waitForFunction(() => G.you && G.landed);
  for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
    await page.locator('#storyb button').first().click();
  await page.click('#depart');
  await page.waitForFunction(() => G.view && !G.landed);
  await page.evaluate(async () => {
    const { chatLine } = await import('/ui.js');
    const messages = [
      ['Meridian Control', 'Welcome to the Meridian sector. Keep the approach lanes clear.'],
      ['Wing Two', 'Formation checks complete. Holding on your starboard wing.'],
      ['Survey Team', 'The outer belt is quiet. Mineral readings look promising.'],
      ['Mining Alpha', 'Copy. We will survey before moving the fleet.'],
      ['Wing Two', 'Shields charged. Fuel reserves are good for the return trip.'],
      ['Meridian Control', 'Inbound convoy has cleared the jump point.'],
      ['Survey Team', 'Marking a rich ore seam near the edge of the field.'],
      ['Mining Alpha', 'Received the coordinates. Keep a safe distance from the rocks.'],
      ['Wing Two', 'Standing by for your next order.'],
      ['Survey Team', 'No hostile contacts on the local scan.'],
      ['Meridian Control', 'Landing clearance remains available at the station.'],
      ['Mining Alpha', 'We will return once the cargo hold is full.'],
    ];
    for (const [from, msg] of messages) chatLine({ from, msg, ch: 'sys' });
  });
  const count = await page.locator('#chatlog > div').count();
  const compactHeight = await page.locator('#chatlog').evaluate((el) => el.clientHeight);
  await page.screenshot({ path: path.join(f.out, 'chat-collapsed.png') });
  await page.locator('#chatexpand').focus();
  await page.keyboard.press('Enter');
  await page.waitForSelector('#chatprojection:not(.hidden)');
  assert.equal(await page.locator('#chatexpand').getAttribute('aria-expanded'), 'true');
  assert.equal(
    await page.getByRole('button', { name: 'Collapse chat history', exact: true }).count(),
    1,
    'Only the HUD toggle offers collapse',
  );
  assert.equal(await page.locator('#consolechat #chatexpand').count(), 1);
  assert.equal(
    await page.locator('#chatprojection button').count(),
    0,
    'Projection has no duplicate collapse control',
  );
  assert.equal(await page.locator('#chatlog').count(), 1, 'One live log, not a cloned history');
  assert.equal(await page.locator('#chatprojection #chatlog > div').count(), count);
  assert.ok((await page.locator('#chatlog').evaluate((el) => el.clientHeight)) > compactHeight * 3);
  await page.waitForFunction(
    () => !document.querySelector('#chatprojection').getAnimations().length,
  );
  await page.screenshot({ path: path.join(f.out, 'chat-expanded.png') });
  // The existing Enter/send route still works while history is projected.
  await page.fill('#chatin', 'Projection uplink confirmed.');
  await page.press('#chatin', 'Enter');
  await page.waitForFunction(() =>
    document.getElementById('chatlog').textContent.includes('Projection uplink confirmed.'),
  );
  // Untrusted inbound text is still escaped by the normal chat renderer.
  await page.evaluate(async () => {
    const { chatLine } = await import('/ui.js');
    chatLine({ from: 'Remote <pilot>', msg: '<img src=x onerror=alert(1)>', ch: 'sys' });
    for (let i = 0; i < 40; i++)
      chatLine({
        from: 'Survey Team',
        msg: 'Telemetry record ' + i + ': ' + 'signal '.repeat(10),
        ch: 'sys',
      });
  });
  assert.equal(await page.locator('#chatlog img').count(), 0);
  assert.equal(
    await page.locator('#chatlog > div').count(),
    40,
    'Existing retention bound preserved',
  );
  await page.locator('#chatlog').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.locator('#chatlog').focus();
  await page.keyboard.press('PageDown');
  await page.waitForFunction(() => document.getElementById('chatlog').scrollTop > 0);
  await page.locator('#chatlog').evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.evaluate(async () =>
    (await import('/ui.js')).chatLine({ msg: 'A new telemetry message.' }),
  );
  assert.equal(
    await page.locator('#chatlog').evaluate((el) => el.scrollTop),
    0,
    'Reading history does not jump on incoming messages',
  );
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#chatprojection').isVisible(), false);
  assert.equal(await page.locator('#chatexpand').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#chat > #chatlog').count(), 1);
  assert.equal(
    await page.locator('#quitbox').isVisible(),
    false,
    'Escape retracts projection instead of opening logout',
  );
  assert.equal(
    await page.locator('#chatexpand').evaluate((el) => el === document.activeElement),
    true,
  );
  // Menu priority: opening options retracts the projection and restores compact history.
  await page.click('#chatexpand');
  await page.click('#optbtn');
  await page.waitForSelector('#chatprojection.hidden', { state: 'attached' });
  assert.equal(await page.locator('#chat > #chatlog').count(), 1);
  await page.keyboard.press('Escape');
  // Real sidebar resizing plus narrow/scaled layouts retain a bounded projection and close control.
  for (const [width, height, scale, tray] of [
    [1440, 1000, 1, false],
    [1440, 1000, 1, true],
    [1024, 768, 1.4, true],
    [640, 700, 1.4, false],
    [640, 700, 1, true],
    [640, 480, 1.4, false],
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(
      ({ scale, tray }) => {
        document.documentElement.style.setProperty('--ui', scale);
        document.body.classList.toggle('scaled', scale !== 1);
        if (document.body.classList.contains('tray-open') !== tray)
          document.getElementById('traytoggle').click();
      },
      { scale, tray },
    );
    await page.locator('#chatexpand').scrollIntoViewIfNeeded();
    if ((await page.locator('#chatexpand').getAttribute('aria-expanded')) !== 'true')
      await page.click('#chatexpand');
    await page.waitForSelector('#chatprojection:not(.hidden)');
    const panel = await page.locator('#chatprojection').boundingBox();
    const cockpit = await page.locator('#cockpit').boundingBox();
    const anchor = await page.locator('#consolechat').boundingBox();
    assert.ok(
      panel.x >= 0 && panel.y >= 0 && panel.x + panel.width <= cockpit.x + cockpit.width + 1,
    );
    assert.ok(
      panel.y + panel.height <= anchor.y + 8,
      'Projection rises from the HUD without covering chat input',
    );
    const toggle = await page.locator('#chatexpand').boundingBox();
    assert.ok(toggle.x >= cockpit.x && toggle.x + toggle.width <= cockpit.x + cockpit.width);
    if (tray && width === 1440) {
      const grip = await page.locator('#hudgrip').boundingBox();
      await page.mouse.move(grip.x + 2, grip.y + 40);
      await page.mouse.down();
      await page.mouse.move(grip.x - 80, grip.y + 40, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() => {
        const p = document.getElementById('chatprojection').getBoundingClientRect();
        return p.right <= document.getElementById('hud').getBoundingClientRect().left + 1;
      });
      await page.screenshot({ path: path.join(f.out, 'chat-expanded-sidebar.png') });
    }
    await page.click('#chatexpand');
    assert.equal(await page.locator('#chatprojection').isVisible(), false);
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.click('#chatexpand');
  assert.equal(
    await page.locator('#chatprojection').evaluate((el) => getComputedStyle(el).animationName),
    'none',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Chat projection: live send/history, retention, scroll, escaped text, keyboard/Escape/menu priority, sidebar drag, six viewport/scale cases and reduced motion passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
