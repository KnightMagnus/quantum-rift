import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { root, evidenceDir } from './helpers/browser-fixture.ts';

const fixtureScript =
  "import { missionFactsHtml, missionFiltersHtml, contractPlanHtml } from '/client/mission-details.js';\nimport { initCockpitState } from '/client/cockpit-state.js';\nimport { initCoop, renderCaptains } from '/client/coop_ui.js';\nconst malicious = \"Pilot's &amp; <img src=x onerror=attack()> \\\"quoted\\\" 船\";\nconst state = {\n  you: { name: malicious, missions: [], ship: { hull: 703, outfits: {} }, shipStats: { cargo: 30 }, cargoUsed: 0 },\n  myName: malicious, sys: 'sol', social: { friends: [], inReq: [], outReq: [], blocks: [] },\n  A: { ships: { 703: { id: 703 } } }, lastTab: {},\n  contractPlan: { title: malicious, proposer: malicious, pool: 200, roster: [{ name: malicious, share: 100, ready: false, slots: 3 }, { name: 'Other', share: 100, ready: false, slots: 4 }], skipped: [{ name: malicious, reason: malicious }] }\n};\nconst views = initCockpitState(state);\nviews.load();state.views = views;\ninitCoop(state, message => { document.body.dataset.sentOp = message.op; }, { toast() {}, ask() {}, plot() {} });\nstate.ctabSub = 'dm';state.dmWith = malicious;state._dmFor = malicious;\nstate.dms[malicious] = Array.from({ length: 20 }, (_, index) => ({ from: malicious, msg: malicious, t: index * 60000 }));\nconst missions = document.getElementById('missions');\nfunction renderMissions() {\n  views.replace(missions, missionFiltersHtml(state) + Array.from({ length: 20 }, () => missionFactsHtml(state, { type: 'passenger', pax: 1, reward: 100, status: malicious }, false)).join(''), 'mission-fixture');\n}\nmissions.addEventListener('change', event => { const field = event.target.dataset.missionFilter; if (field) state[field] = event.target.value; });\ndocument.getElementById('contract').innerHTML = contractPlanHtml(state);\nrenderMissions();renderCaptains();\ndocument.getElementById('refresh').onclick = () => { renderMissions();renderCaptains(); };\ntry { Function('return 1')();document.body.dataset.evalBlocked = 'false'; } catch { document.body.dataset.evalBlocked = 'true'; }\ndocument.body.dataset.ready = 'true';\n";
const evidence = evidenceDir('eta-templates-browser');
const server = http.createServer((request, response) => {
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'",
  );
  const url = new URL(request.url!, 'http://localhost');
  if (url.pathname === '/') {
    response.setHeader('Content-Type', 'text/html');
    response.end(
      '<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="ctabs"><button data-tab="captains">Captains</button></div><div id="missions"></div><div id="contract"></div><div id="capview"></div><button id="refresh">Refresh</button><script type="module" src="/fixture.js"></script></body></html>',
    );
  } else if (url.pathname === '/fixture.js') {
    response.setHeader('Content-Type', 'text/javascript');
    response.end(fixtureScript);
  } else if (url.pathname === '/fixture.css') {
    response.setHeader('Content-Type', 'text/css');
    response.end('#missions,#capview{height:130px;overflow:auto}.dmlog{height:80px;overflow:auto}');
  } else {
    const filename = path.resolve(root, 'dist', '.' + url.pathname);
    if (
      !filename.startsWith(path.join(root, 'dist') + path.sep) ||
      !fs.existsSync(filename) ||
      !fs.statSync(filename).isFile()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.setHeader(
      'Content-Type',
      filename.endsWith('.json') ? 'application/json' : 'text/javascript',
    );
    response.end(fs.readFileSync(filename));
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const address = server.address();
assert.ok(address && typeof address !== 'string');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
try {
  await page.goto('http://127.0.0.1:' + address.port);
  await page.waitForFunction(() => document.body.dataset.ready === 'true');
  assert.equal(
    await page.locator('body').getAttribute('data-eval-blocked'),
    'true',
    'CSP actively rejects dynamic compilation',
  );
  assert.equal(
    await page.locator('#contract img').count(),
    0,
    'Malicious captain/title strings are text, not child markup',
  );
  assert.equal(await page.locator('#contract [data-contract="contractReady"]').count(), 1);
  assert.equal(
    await page.locator('#contract ul li').count(),
    2,
    'Roster child markup is not escaped into text',
  );
  assert.equal(await page.locator('#missions .mission-facts').count(), 20);
  assert.equal(await page.locator('[onerror],[onfocus]').count(), 0);
  const captainAttribute = await page
    .locator('#capview [data-cact="block"]')
    .getAttribute('data-n');
  assert.ok(captainAttribute!.includes('Pilot\'s &amp; <img src=x onerror=attack()> "quoted" 船'));
  assert.ok((await page.locator('#dmin').getAttribute('placeholder'))!.includes(captainAttribute!));
  assert.ok(
    (await page.locator('#contract').textContent())!.includes('<img src=x onerror=attack()>'),
  );
  assert.equal(await page.locator('#missions [data-mission-filter="jobType"]').count(), 1);
  await page.locator('#missions [data-mission-filter="jobType"]').selectOption('cargo');
  await page.locator('#missions [data-mission-filter="jobType"]').focus();
  await page.evaluate(() => {
    document.getElementById('missions')!.scrollTop = 55;
  });
  // Dispatch without moving focus: a background replacement must preserve the active control.
  await page.locator('#refresh').dispatchEvent('click');
  assert.equal(
    await page.locator('#missions [data-mission-filter="jobType"]').inputValue(),
    'cargo',
  );
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute('data-mission-filter')),
    'jobType',
  );
  assert.equal(await page.evaluate(() => document.getElementById('missions')!.scrollTop), 55);
  await page.locator('#dmin').fill('draft <>&"\' 船');
  await page.locator('#dmin').focus();
  await page.locator('#refresh').dispatchEvent('click');
  assert.equal(await page.locator('#dmin').inputValue(), 'draft <>&"\' 船');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'dmin');
  assert.equal(await page.locator('#capview img').count(), 0);
  assert.ok((await page.locator('#dmlog').textContent())!.includes('<img src=x onerror=attack()>'));
  await page.locator('#dmin').press('Enter');
  assert.equal(await page.locator('body').getAttribute('data-sent-op'), 'dm');
  assert.deepEqual(errors, []);
  await page.screenshot({ path: path.join(evidence, 'strict-csp.png') });
  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        csp: true,
        escapedNames: true,
        nestedFragments: true,
        delegatedEvents: true,
        focus: true,
        scroll: true,
        errors,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
console.log(
  'Strict CSP browser: generated mission/contracts/DM fragments, escaping, IDs/data attributes, delegated events, draft/focus and scroll preserved.',
);
