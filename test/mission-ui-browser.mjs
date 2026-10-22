import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';
import { refineryFixture } from './helpers/refinery-play-fixture.mjs';
import { failureEvidence } from './helpers/browser-fixture.mjs';
const f = await refineryFixture('mission-board');
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1500, height: 1050 } });
  await context.addInitScript(() => {
    const Native = WebSocket;
    window.WebSocket = class extends Native {
      constructor(...args) {
        super(...args);
        window.fixtureSocket = this;
      }
    };
  });
  const a = await context.newPage(),
    b = await context.newPage(),
    courier = await context.newPage(),
    errors = [];
  for (const page of [a, b, courier]) page.on('pageerror', (e) => errors.push(String(e)));
  const login = async (page, name) => {
    await page.goto(f.origin);
    await page.fill('#lname', name);
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let i = 0; i < 8 && (await page.locator('#storybox').isVisible()); i++)
      await page.locator('#storyb button').first().click();
  };
  const send = (page, m) => page.evaluate((m) => window.fixtureSocket.send(JSON.stringify(m)), m);
  const tray = async (page) => {
    if ((await page.locator('#traytoggle').getAttribute('aria-expanded')) !== 'true')
      await page.click('#traytoggle');
  };
  await login(a, 'Refinery Alpha');
  await login(b, 'Refinery Bravo');
  const availability = await a.evaluate(async () => {
    const { missionDetails, filterMissions } = await import('/mission-details.js');
    const base = {
      ...G,
      you: { ...G.you, missions: [], cargoUsed: 68, shipStats: { ...G.you.shipStats, cargo: 70 } },
    };
    const cargo = { id: 'fixture-cargo', type: 'cargo', qty: 5, sys: G.sys, reward: 100 };
    const combat = { id: 'fixture-combat', type: 'patrol', sys: G.sys, reward: 100 };
    return [
      missionDetails(base, cargo).reasons.some((r) => r.includes('free hold')),
      missionDetails(
        { ...base, you: { ...base.you, missions: Array.from({ length: 6 }, () => combat) } },
        combat,
      ).reasons.some((r) => r.includes('six')),
      missionDetails(base, { type: 'passenger', pax: 100, sys: G.sys }, true).reasons.some((r) =>
        r.includes('passenger seats'),
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
        .map((o) => o.id)
        .join(',') === 'fixture-combat',
    ];
  });
  assert.deepEqual(
    availability,
    [true, true, true, true, true],
    'Capacity/slots/seats, completed collection and feasible-nearby filtering have explicit boundary coverage',
  );
  const escapedMission = await a.evaluate(async () => {
    const { missionsHtml } = await import('/missions.js');
    const title = `Pilot's <img data-injected="true"> & "cargo" 🚀`;
    const key = `quote" data-injected="true`;
    const root = document.createElement('div');
    root.innerHTML = missionsHtml({
      ...G,
      missionType: 'all',
      missionFeasible: false,
      missionNearby: false,
      you: {
        ...G.you,
        missions: [{ id: key, title, text: title, type: 'patrol', sys: G.sys, need: 1 }],
      },
    });
    const card = [...root.querySelectorAll('[data-mission-key]')].find(
      (element) => element.dataset.missionKey === key,
    );
    return {
      title: card?.querySelector('.t').textContent,
      expected: title,
      injected: !!root.querySelector('[data-injected]'),
      titleElements: card?.querySelector('.t').childElementCount,
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
    capacity: G.you.shipStats.cargo,
    small: G.landed.offers.filter((o) => o.id.includes('-freight-courier-')),
    large: G.landed.offers.find((o) => o.id.includes('-freight-bulk-4')),
  }));
  assert.equal(courierOffers.capacity, 15, 'Unmodified fresh starter, not rich fixture hull');
  assert.equal(courierOffers.small.length, 2);
  const largeButton = courier.locator(`[data-act="accept"][data-id="${courierOffers.large.id}"]`);
  assert.ok(
    await largeButton.isDisabled(),
    'Large-hauler jobs show the existing hold-space denial',
  );
  const smallButton = (o) => courier.locator(`[data-act="accept"][data-id="${o.id}"]`);
  await smallButton(courierOffers.small[0]).scrollIntoViewIfNeeded();
  await courier.screenshot({ path: path.join(f.out, 'courier-small-and-bulk.png') });
  for (const [i, o] of courierOffers.small.entries()) {
    assert.equal(await smallButton(o).isDisabled(), false);
    await smallButton(o).click();
    await courier.waitForFunction((count) => G.you.missions.length === count, i + 1);
  }
  assert.equal(
    await courier.evaluate(() => G.you.missions.reduce((n, o) => n + o.qty, 0)),
    courierOffers.small.reduce((n, o) => n + o.qty, 0),
    'Real HUD accepts both supplied shipments without buying commodities',
  );
  await courier.close();

  await a.click('[data-lt="jobs"]');
  const team = a.locator('[data-offer-type="warband"]');
  await team.waitFor();
  assert.equal(
    await team.locator('[data-act="accept"]').isDisabled(),
    true,
    'Unavailable team offers remain visible with an explanation',
  );
  await team.getByText('Needs two online Armada captains', { exact: false }).waitFor();
  assert.match(await team.innerText(), /Travel:.*Danger:.*Hold needed:.*Turn in:.*Your pay:/s);
  await a.selectOption('[data-mission-filter="jobType"]', 'team');
  assert.equal(await a.locator('[data-offer-type]').count(), 1);
  await a.check('[data-mission-filter="jobFeasible"]');
  assert.equal(await a.locator('[data-offer-type]').count(), 0);
  await a.getByText('No jobs match these filters', { exact: false }).waitFor();
  await a.uncheck('[data-mission-filter="jobFeasible"]');
  await send(a, { t: 'social', op: 'add', name: 'Refinery Bravo' });
  await b.waitForFunction(() => G.social?.inReq?.some((r) => (r.name || r) === 'Refinery Alpha'));
  await send(b, { t: 'social', op: 'accept', name: 'Refinery Alpha' });
  await a.waitForFunction(() => G.social?.friends?.some((r) => r.name === 'Refinery Bravo'));
  await send(a, { t: 'armada', op: 'form' });
  await a.waitForFunction(() => G.you.armada?.id);
  await send(a, { t: 'armada', op: 'invite', name: 'Refinery Bravo' });
  await b.waitForFunction(() => G.you.armada?.invites?.length);
  const id = await b.evaluate(() => G.you.armada.invites[0].id);
  await send(b, { t: 'armada', op: 'accept', id });
  await a.waitForFunction(() => G.you.armada?.members?.length === 2);
  // The offer's preview uses current eligible captain capacity, not the whole pool as personal pay.
  await a.click('[data-lt="overview"]');
  await a.click('[data-lt="jobs"]');
  assert.equal(
    await a.inputValue('[data-mission-filter="jobType"]'),
    'team',
    'Job filters survive tab changes',
  );
  assert.match(await team.innerText(), /about .*eligible captains join/);
  await a.waitForFunction(() => !document.querySelector('#toasts').children.length);
  await a.screenshot({ path: path.join(f.out, 'jobs-details.png') });
  await b.locator('#chatin').focus();
  await team.getByRole('button', { name: 'PLAN TEAM CONTRACT' }).click();
  await a.waitForFunction(() => G.contractPlan?.roster.length === 2);
  await b.waitForFunction(() => G.contractPlan?.roster.length === 2);
  assert.equal(
    await b.evaluate(() => document.activeElement.id),
    'chatin',
    'The team invitation never captures focus',
  );
  assert.equal(await a.evaluate(() => G.you.missions.length), 0);
  assert.equal(await b.evaluate(() => G.you.missions.length), 0);
  await tray(a);
  await a.locator('#radarheightgrip').focus();
  await a.keyboard.press('Home');
  for (let i = 0; i < 6; i++) await a.keyboard.press('ArrowDown');
  await tray(b);
  await b.click('#ctabs [data-tab="missions"]');
  await a.locator('.contract-plan').scrollIntoViewIfNeeded();
  assert.equal(await a.locator('[data-contract="contractStart"]').isDisabled(), true);
  await a.waitForFunction(() => !document.querySelector('#toasts').children.length);
  await a.screenshot({ path: path.join(f.out, 'team-ready-roster.png') });
  await b.click('[data-contract="contractReady"]');
  await a.waitForFunction(() => G.contractPlan.roster.every((r) => r.ready));
  const pool = await a.evaluate(() => G.contractPlan.pool),
    shares = await a.evaluate(() => G.contractPlan.roster.map((r) => r.share));
  assert.equal(
    shares.reduce((n, v) => n + v, 0),
    pool,
  );
  await a.click('[data-contract="contractStart"]');
  for (const page of [a, b])
    await page.waitForFunction(() => G.you.missions.some((m) => m.type === 'warband'));
  const job = await a.evaluate(() => G.you.missions.find((m) => m.type === 'warband'));
  assert.equal(await a.locator('.contract-plan').count(), 0);
  assert.ok(job.reward < pool);
  await a.selectOption('[data-mission-filter="missionType"]', 'team');
  const card = a.locator(`[data-mission-key="${job.id}"]`);
  await card.scrollIntoViewIfNeeded();
  await card.getByText('Your pay:', { exact: false }).waitFor();
  assert.match(await card.innerText(), /saved share stays fixed/);
  await card.locator('[data-pin]').click();
  assert.equal(await a.evaluate(() => G.pinnedObjective), job.id);
  await a.screenshot({ path: path.join(f.out, 'mission-fixed-share.png') });
  await a.reload();
  await a.fill('#lname', 'Refinery Alpha');
  await a.fill('#lpass', 'fixture');
  await a.click('#lbtn');
  await a.waitForFunction(() => G.you && G.landed);
  assert.equal(await a.evaluate(() => G.jobType), 'team');
  assert.equal(await a.evaluate(() => G.missionType), 'team');
  assert.equal(
    await a.evaluate((id) => G.you.missions.find((m) => m.id === id)?.reward, job.id),
    job.reward,
    'Reconnect does not reroll accepted rewards',
  );
  assert.deepEqual(errors, []);
  console.log(
    'Real board facts, disabled reasons, remembered feasible/type filters, focus-safe team invitation, explicit Ready/Start, exact shares, pinning and reconnect passed.',
  );
} catch (error) {
  await failureEvidence(browser, f.out, error);
  throw error;
} finally {
  await f.close(browser);
}
