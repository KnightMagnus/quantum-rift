import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { Buffer } from 'node:buffer';
import fileSystem from 'node:fs';
import { type Page } from 'playwright';
import { refineryFixture } from './helpers/refinery-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const feature = await refineryFixture('mission-board', { stableJobWindow: true });
let browser;
const diagnosticPages: Page[] = [];
const events: { at: number; captain: number; direction: string; message: unknown }[] = [];
const errors: string[] = [];
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.addInitScript(() => {
    window.pointerTrace = [];
    for (const type of ['pointerdown', 'pointerup', 'click'])
      document.addEventListener(
        type,
        (event) => {
          window.pointerTrace.push({
            at: performance.now(),
            type,
            target: (event.target as HTMLElement).outerHTML?.slice(0, 500),
            x: (event as MouseEvent).clientX,
            y: (event as MouseEvent).clientY,
          });
        },
        true,
      );
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args: ConstructorParameters<typeof WebSocket>) {
        super(...args);
        window.fixtureSocket = this;
      }
    };
  });
  const firstCaptain = await context.newPage(),
    secondCaptain = await context.newPage(),
    courier = await context.newPage();
  diagnosticPages.push(firstCaptain, secondCaptain, courier);
  for (const [captain, page] of diagnosticPages.entries()) {
    page.on('pageerror', (event) => errors.push(String(event)));
    page.on('websocket', (socket) => {
      const record = (direction: string, { payload }: { payload: string | Buffer }) => {
        try {
          const message = JSON.parse(String(payload));
          if (
            ['accept', 'armada', 'armadaContract', 'social', 'toast', 'landed'].includes(message.t)
          )
            events.push({ at: Date.now(), captain, direction, message });
        } catch {}
      };
      socket.on('framesent', (frame) => record('sent', frame));
      socket.on('framereceived', (frame) => record('received', frame));
    });
  }
  const login = async (page: Page, name: string) => {
    await page.goto(feature.origin);
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
  };
  const send = (page: Page, message: { t: string; op: string; name?: string; id?: string }) =>
    page.evaluate(
      (outgoingPacket) => window.fixtureSocket.send(JSON.stringify(outgoingPacket)),
      message,
    );
  const tray = async (page: Page) => {
    if ((await page.locator('#traytoggle').getAttribute('aria-expanded'))! !== 'true')
      await page.click('#traytoggle');
  };
  await login(firstCaptain, 'Refinery Alpha');
  await login(secondCaptain, 'Refinery Bravo');
  const availability = await firstCaptain.evaluate(async () => {
    const { missionDetails, filterMissions } = await import('/mission-details.js');
    const base = {
      ...G,
      you: {
        ...G.you!,
        missions: [],
        cargoUsed: 68,
        shipStats: { ...G.you!.shipStats!, cargo: 70 },
      },
    };
    const cargo = { id: 'fixture-cargo', type: 'cargo', qty: 5, sys: G.sys!, reward: 100 };
    const combat = {
      id: 'fixture-combat',
      type: 'patrol',
      sys: G.sys!,
      reward: 100,
      text: 'Patrol fixture',
      title: 'Patrol fixture',
    };
    return [
      missionDetails(base, cargo).reasons.some((result) => result.includes('free hold')),
      missionDetails(
        { ...base, you: { ...base.you, missions: Array.from({ length: 6 }, () => combat) } },
        combat,
      ).reasons.some((result) => result.includes('six')),
      missionDetails(base, { type: 'passenger', pax: 100, sys: G.sys }, true).reasons.some(
        (result) => result.includes('passenger seats'),
      ),
      missionDetails(
        { ...base, you: { ...base.you, shipStats: { ...base.you.shipStats, cargo: 0 } } },
        { ...cargo, done: true },
        true,
      ).reasons.length === 0,
      filterMissions({ ...base, jobType: 'all', jobFeasible: true, jobNearby: true }, [
        cargo,
        combat,
      ])
        .map((options: { id: string }) => options.id)
        .join(',') === 'fixture-combat',
    ];
  });
  assert.deepEqual(
    availability,
    [true, true, true, true, true],
    'Capacity/slots/seats, completed collection and feasible-nearby filtering have explicit boundary coverage',
  );
  const escapedMission = await firstCaptain.evaluate(async () => {
    const { missionsHtml } = await import('/missions.js');
    const title = `Pilot's <img data-injected="true"> & "cargo" 🚀`;
    const entryKey = `quote" data-injected="true`;
    const root = document.createElement('div');
    root.innerHTML = missionsHtml({
      ...G,
      missionType: 'all',
      missionFeasible: false,
      missionNearby: false,
      you: {
        ...G.you!,
        missions: [
          { id: entryKey, title, text: title, reward: 0, type: 'patrol', sys: G.sys!, need: 1 },
        ],
      },
    });
    const card = [...root.querySelectorAll('[data-mission-key]')].find(
      (element) => (element as HTMLElement).dataset.missionKey === entryKey,
    );
    return {
      title: card?.querySelector('.t')!.textContent,
      expected: title,
      injected: !!root.querySelector('[data-injected]'),
      titleElements: card?.querySelector('.t')!.childElementCount,
    };
  });
  assert.equal(escapedMission.title, escapedMission.expected);
  assert.equal(escapedMission.titleElements, 0);
  assert.equal(
    escapedMission.injected,
    false,
    'Shared escaping preserves text and attribute boundaries',
  );

  await login(courier, 'Courier review');
  await courier.click('[data-lt="jobs"]');
  const courierOffers = await courier.evaluate(() => ({
    capacity: G.you!.shipStats!.cargo,
    small: G.landed!.offers.filter((options: { id: string }) =>
      options.id.includes('-freight-courier-'),
    ),
    large: G.landed!.offers.find((options: { id: string }) =>
      options.id.includes('-freight-bulk-4'),
    ),
  }));
  assert.equal(courierOffers.capacity, 15, 'Unmodified fresh starter, not rich fixture hull');
  assert.equal(courierOffers.small.length, 2);
  const largeButton = courier.locator(`[data-act="accept"][data-id="${courierOffers.large!.id}"]`);
  assert.ok(
    await largeButton.isDisabled(),
    'Large-hauler jobs show the existing hold-space denial',
  );
  const smallButton = (options: { id: string }) =>
    courier.locator(`[data-act="accept"][data-id="${options.id}"]`);
  await smallButton(courierOffers.small[0]).scrollIntoViewIfNeeded();
  await courier.screenshot({ path: path.join(feature.out, 'courier-small-and-bulk.png') });
  for (const [index, options] of courierOffers.small.entries()) {
    assert.equal(await smallButton(options).isDisabled(), false);
    await smallButton(options).click();
    await courier.waitForFunction((count) => G.you!.missions.length === count, index + 1);
  }
  assert.equal(
    await courier.evaluate(() =>
      G.you!.missions.reduce((quantity, options) => quantity + options.qty!, 0),
    ),
    courierOffers.small.reduce((quantity, options) => quantity + options.qty!, 0),
    'Real HUD accepts both supplied shipments without buying commodities',
  );
  await courier.close();

  await firstCaptain.click('[data-lt="jobs"]');
  const team = firstCaptain.locator('[data-offer-type="warband"]');
  await team.waitFor();
  assert.equal(
    await team.locator('[data-act="accept"]').isDisabled(),
    true,
    'Unavailable team offers remain visible with an explanation',
  );
  await team.getByText('Needs two online Armada captains', { exact: false }).waitFor();
  assert.match(await team.innerText(), /Travel:.*Danger:.*Hold needed:.*Turn in:.*Your pay:/s);
  await firstCaptain.selectOption('[data-mission-filter="jobType"]', 'team');
  assert.equal(await firstCaptain.locator('[data-offer-type]').count(), 1);
  await firstCaptain.check('[data-mission-filter="jobFeasible"]');
  assert.equal(await firstCaptain.locator('[data-offer-type]').count(), 0);
  await firstCaptain.getByText('No jobs match these filters', { exact: false }).waitFor();
  await firstCaptain.uncheck('[data-mission-filter="jobFeasible"]');
  await send(firstCaptain, { t: 'social', op: 'add', name: 'Refinery Bravo' });
  await secondCaptain.waitForFunction(() =>
    G.social?.inReq?.some((result) => result === 'Refinery Alpha'),
  );
  await send(secondCaptain, { t: 'social', op: 'accept', name: 'Refinery Alpha' });
  await firstCaptain.waitForFunction(() =>
    G.social?.friends?.some((result) => result.name === 'Refinery Bravo'),
  );
  await send(firstCaptain, { t: 'armada', op: 'form' });
  await firstCaptain.waitForFunction(() => G.you!.armada?.id);
  await send(firstCaptain, { t: 'armada', op: 'invite', name: 'Refinery Bravo' });
  await secondCaptain.waitForFunction(() => G.you!.armada?.invites?.length);
  const identifier = await secondCaptain.evaluate(() => G.you!.armada!.invites[0].id);
  await send(secondCaptain, { t: 'armada', op: 'accept', id: identifier });
  await firstCaptain.waitForFunction(() => G.you!.armada?.members?.length === 2);
  // The offer's preview uses current eligible captain capacity, not the whole pool as personal pay.
  await firstCaptain.click('[data-lt="overview"]');
  await firstCaptain.click('[data-lt="jobs"]');
  assert.equal(
    await firstCaptain.inputValue('[data-mission-filter="jobType"]'),
    'team',
    'Job filters survive tab changes',
  );
  assert.match(await team.innerText(), /about .*eligible captains join/);
  await firstCaptain.waitForFunction(() => !document.querySelector('#toasts')!.children.length);
  await firstCaptain.screenshot({ path: path.join(feature.out, 'jobs-details.png') });
  await secondCaptain.locator('#chatin').focus();
  await team.getByRole('button', { name: 'PLAN TEAM CONTRACT' }).click();
  await firstCaptain.waitForFunction(() => G.contractPlan?.roster.length === 2);
  await secondCaptain.waitForFunction(() => G.contractPlan?.roster.length === 2);
  assert.equal(
    await secondCaptain.evaluate(() => document.activeElement!.id),
    'chatin',
    'The team invitation never captures focus',
  );
  assert.equal(await firstCaptain.evaluate(() => G.you!.missions.length), 0);
  assert.equal(await secondCaptain.evaluate(() => G.you!.missions.length), 0);
  await tray(firstCaptain);
  await firstCaptain.locator('#radarheightgrip').focus();
  await firstCaptain.keyboard.press('Home');
  for (let index = 0; index < 6; index++) await firstCaptain.keyboard.press('ArrowDown');
  await tray(secondCaptain);
  await secondCaptain.click('#ctabs [data-tab="missions"]');
  await firstCaptain.locator('.contract-plan').scrollIntoViewIfNeeded();
  assert.equal(await firstCaptain.locator('[data-contract="contractStart"]').isDisabled(), true);
  await firstCaptain.waitForFunction(() => !document.querySelector('#toasts')!.children.length);
  await firstCaptain.screenshot({ path: path.join(feature.out, 'team-ready-roster.png') });
  await secondCaptain.click('[data-contract="contractReady"]');
  await firstCaptain.waitForFunction(() => G.contractPlan!.roster.every((result) => result.ready));
  const pool = await firstCaptain.evaluate(() => G.contractPlan!.pool),
    shares = await firstCaptain.evaluate(() =>
      G.contractPlan!.roster.map((result) => result.share),
    );
  assert.equal(
    shares.reduce((quantity, value) => quantity + value, 0),
    pool,
  );
  await firstCaptain.click('[data-contract="contractStart"]');
  for (const page of [firstCaptain, secondCaptain])
    await page.waitForFunction(() => G.you!.missions.some((message) => message.type === 'warband'));
  const missionOffer = await firstCaptain.evaluate(() =>
    G.you!.missions.find((message) => message.type === 'warband'),
  );
  assert.equal(await firstCaptain.locator('.contract-plan').count(), 0);
  assert.ok(missionOffer!.reward < pool);
  await firstCaptain.selectOption('[data-mission-filter="missionType"]', 'team');
  const card = firstCaptain.locator(`[data-mission-key="${missionOffer!.id}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.getByText('Your pay:', { exact: false }).waitFor();
  assert.match(await card.innerText(), /saved share stays fixed/);
  await card.locator('[data-pin]').click();
  assert.equal(await firstCaptain.evaluate(() => G.pinnedObjective), missionOffer!.id);
  await firstCaptain.screenshot({ path: path.join(feature.out, 'mission-fixed-share.png') });
  await firstCaptain.reload();
  await firstCaptain.fill('#lname', 'Refinery Alpha');
  await firstCaptain.fill('#lpass', 'fixture');
  await firstCaptain.click('#lbtn');
  await firstCaptain.waitForFunction(() => G.you && G.landed);
  assert.equal(await firstCaptain.evaluate(() => G.jobType), 'team');
  assert.equal(await firstCaptain.evaluate(() => G.missionType), 'team');
  assert.equal(
    await firstCaptain.evaluate(
      (expectedMissionId) =>
        G.you!.missions.find((message) => message.id === expectedMissionId)?.reward,
      missionOffer!.id,
    ),
    missionOffer!.reward,
    'Reconnect does not reroll accepted rewards',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Real board facts, disabled reasons, remembered feasible/type filters, focus-safe team invitation, explicit Ready/Start, exact shares, pinning and reconnect passed.',
  );
} catch (error) {
  const state = await Promise.all(
    diagnosticPages
      .filter((page) => !page.isClosed())
      .map((page) =>
        page
          .evaluate(() => ({
            at: Date.now(),
            captain: G.you?.name,
            armada: G.you?.armada,
            missions: G.you?.missions,
            plan: G.contractPlan,
            offers: G.landed?.offers,
            pointers: window.pointerTrace,
          }))
          .catch(() => null),
      ),
  );
  fileSystem.writeFileSync(
    path.join(feature.out, 'failure-state.json'),
    JSON.stringify(
      { node: process.version, browser: browser?.version(), errors, events, state },
      null,
      2,
    ),
  );
  await failureEvidence(browser, feature.out, error);
  throw error;
} finally {
  await feature.close(browser);
}
