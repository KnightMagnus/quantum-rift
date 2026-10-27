import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';

import { refineryFixture } from './helpers/refinery-play-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const fixture = await refineryFixture('audio-defaults');
let browser;
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const cases = [
    { saved: null, sfx: 0.5, music: 0.45, mute: false },
    { saved: '{}', sfx: 0.5, music: 0.45, mute: false },
    { saved: '{', sfx: 0.5, music: 0.45, mute: false },
    { saved: '{"sfx":0,"music":0,"mute":false}', sfx: 0, music: 0, mute: false },
    { saved: '{"sfx":0.2,"music":0.7,"mute":true}', sfx: 0.2, music: 0.7, mute: true },
    { saved: '{"sfx":1}', sfx: 1, music: 0.45, mute: false },
    { saved: '{"music":0}', sfx: 0.5, music: 0, mute: false },
    { saved: '{"sfx":0.75,"scale":1.1}', sfx: 0.75, music: 0.45, mute: false },
  ];
  for (const example of cases) {
    const context = await browser.newContext();
    await context.addInitScript((saved) => {
      if (saved === null) localStorage.removeItem('rift.opts');
      else localStorage.setItem('rift.opts', saved);
    }, example.saved);
    const page = await context.newPage();
    await page.goto(fixture.origin);
    await page.waitForFunction(() => !!window.G);
    const actual = await page.evaluate(() => ({
      sfx: G.opts.sfx,
      music: G.opts.music,
      mute: G.opts.mute,
      ui: G.opts.ui,
      saved: localStorage.getItem('rift.opts'),
    }));
    assert.equal(actual.sfx, example.sfx);
    assert.equal(actual.music, example.music);
    assert.equal(actual.mute, example.mute);
    assert.equal(actual.ui, 0.55, 'Effects default does not alter the interface bus');
    const persisted = JSON.parse(actual.saved!);
    assert.equal(persisted.sfx, example.sfx, 'Existing options migration preserves effects');
    assert.equal(persisted.music, example.music);
    assert.equal(persisted.mute, example.mute);
    await context.close();
  }
  console.log(
    'Fresh/empty/corrupt options, saved zero/mute/fraction/full values, missing effects and preserved mixer values passed.',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await fixture.close(browser);
}
