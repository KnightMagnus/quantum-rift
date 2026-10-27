import { launchChromium } from './helpers/chromium.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { type Page } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const fixture = await miningFixture('cockpit-layout');
const measurements: object[] = [];
let browser;
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    const image = await window.RiftEngine.engine.screenshot(true);
    await image.decode();
  });
  await page.screenshot({ path: path.join(fixture.out, name + '.png') });
}
async function contained(page: Page, selector: string) {
  await page.locator(selector).evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    );
  });
  const bounds = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize()!;
  assert.ok(
    bounds && bounds.x >= 0 && bounds.y >= 0,
    JSON.stringify({ selector, bounds, viewport }),
  );
  assert.ok(bounds.x + bounds.width <= viewport.width + 1);
  assert.ok(bounds.y + bounds.height <= viewport.height + 1);
  return bounds;
}
async function dockGeometry(page: Page) {
  return page.evaluate(() => {
    const rect = (element: Element) => {
      const bounds = element.getBoundingClientRect();
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    return [...document.querySelectorAll('#functiondock .function-icon')]
      .filter((element) => getComputedStyle(element).display !== 'none')
      .map((element) => {
        const style = getComputedStyle(element, '::after');
        const label = element.querySelector('.function-label')!;
        return {
          id: element.id,
          bounds: rect(element),
          label: rect(label),
          led: {
            content: style.content,
            left: style.left,
            bottom: style.bottom,
            width: style.width,
          },
          pressable: element.tagName === 'BUTTON',
        };
      });
  });
}
try {
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  {
    const context = await browser.newContext({ viewport: { width: 3440, height: 1440 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(fixture.origin);
    await page.fill('#lname', 'Mining Alpha');
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => !!G.landed && !!G.you);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    assert.equal(
      await page.locator('#profilebtn, #landprofilebtn, dialog#profiledialog').count(),
      0,
    );
    await page.waitForFunction(
      () => document.getElementById('hailindicator')!.getAttribute('aria-disabled') === 'false',
    );
    assert.equal(
      await page.locator('#hailindicator').isVisible(),
      true,
      'Landed HAIL stays visible',
    );
    assert.equal(
      await page.locator('#hailindicator').isEnabled(),
      true,
      'Landed HAIL remains usable in the standard blue cockpit',
    );
    const landed = await contained(page, '#land .landbox');
    const usable = await page.locator('#land').boundingBox();
    assert.ok(
      Math.abs(landed.width - Math.min(2700, usable!.width - 150)) < 2,
      'Ultrawide blue landing window reserves its sculpted frame gutter',
    );
    assert.ok(
      Math.abs(landed.height - Math.min(1100, usable!.height - 84)) < 2,
      'Ultrawide blue landing window remains inside usable flight height',
    );
    await capture(page, 'functional-landed-3440x1440');
    await page.click('#captainshortcut');
    await page.click('[data-it="profile"]');
    assert.equal(await page.locator('#infobody').isVisible(), false);
    assert.equal(await page.locator('#captainprofile').isVisible(), true);
    await page.locator('#portraitpreview').evaluate((image: HTMLImageElement) => image.decode());
    const portraitChoices = page.locator('#portraitchoices input');
    const selectedPortrait = await page.locator('#portraitchoices input:checked').inputValue();
    const nextPortrait =
      (await portraitChoices.first().inputValue()) === selectedPortrait
        ? portraitChoices.last()
        : portraitChoices.first();
    await nextPortrait.check();
    assert.match(await page.locator('#portraitstatus').innerText(), /not saved/);
    await page.click('#portraitsave');
    await page.waitForFunction(
      () => document.getElementById('portraitstatus')!.textContent === 'Saved.',
    );
    await page.locator('#captainprofile').evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await capture(page, 'functional-captain-profile-3440x1440');
    await page.click('[data-it="ship"]');
    assert.equal(await page.locator('#captainprofile').isVisible(), false);
    assert.ok((await page.locator('#infobody').innerText()).length > 20);
    await page.click('[data-it="profile"]');
    assert.equal(await page.locator('#portraitsave').isEnabled(), true);
    await page.locator('#portraitsave').focus();
    await page.keyboard.press('m');
    assert.equal(
      await page.locator('#gmap').isVisible(),
      false,
      'Profile save focus blocks flight hotkeys',
    );
    await page.keyboard.press('Tab');
    assert.equal(
      await page.evaluate(() => document.activeElement?.closest('#infobox')?.id),
      'infobox',
    );
    await page.click('#optbtn');
    await page.locator('[data-bind="map"]').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#opts').isVisible(), true, 'Escape first cancels rebinding');
    assert.equal(
      await page.locator('#infobox').isVisible(),
      true,
      'Underlying Captain remains open',
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#opts').isVisible(), false, 'Next Escape closes top settings');
    assert.equal(await page.locator('#infobox').isVisible(), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#infobox').isVisible(), false);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'captainshortcut');
    await page.click('#depart');
    await page.waitForFunction(() => !!G.view && !G.landed);
    const dock = await dockGeometry(page);
    const alert = dock.find((entry) => entry.id === 'attentionindicator')!;
    const captain = dock.find((entry) => entry.id === 'captainshortcut')!;
    assert.equal(alert.pressable, false);
    assert.equal(alert.led.content, 'none', 'Warning lens has no button LED');
    assert.equal(alert.bounds.x, captain.bounds.x);
    assert.ok(alert.bounds.y < captain.bounds.y);
    assert.equal(Math.max(...dock.map((entry) => entry.bounds.x)), alert.bounds.x);
    for (const entry of dock) {
      assert.ok(
        Math.abs(entry.bounds.x + entry.bounds.width / 2 - entry.label.x - entry.label.width / 2) <
          1,
        entry.id + ' label centered',
      );
      assert.ok(
        entry.label.y >= entry.bounds.y &&
          entry.label.y + entry.label.height <= entry.bounds.y + entry.bounds.height + 1,
        entry.id + ' label stays inside its blue control',
      );
      if (entry.pressable) assert.deepEqual(entry.led, captain.led, entry.id + ' consistent LED');
    }
    assert.equal(await page.locator('#hailindicator').isEnabled(), true, 'Takeoff restores HAIL');
    await capture(page, 'functional-flight-3440x1440');
    await page.click('#traytoggle');
    for (const width of [1920, 2560, 3440, 5120]) {
      await page.setViewportSize({ width, height: 1440 });
      for (const scale of [0.8, 1, 1.4]) {
        await page.evaluate((scale) => {
          document.documentElement.style.setProperty('--ui', String(scale));
          document.body.classList.toggle('scaled', scale !== 1);
        }, scale);
        const gaps = await page.evaluate(() => {
          const cockpit = document.getElementById('cockpit')!.getBoundingClientRect();
          const trim = document.getElementById('traytrim')!.getBoundingClientRect();
          return {
            controls: [...document.querySelectorAll('#consoleutilities .cb, .console-vent')].map(
              (element) => cockpit.right - element.getBoundingClientRect().right,
            ),
            sidebar: ['status', 'nav', 'cpanel']
              .map((id) => {
                const element = document.getElementById(id);
                return element ? element.getBoundingClientRect().left - trim.right : null;
              })
              .filter((gap) => gap !== null),
          };
        });
        const frame = await page.evaluate(() => {
          const controls = [
            ...document.querySelectorAll(
              '#functiondock .function-icon, #functiondock .function-label',
            ),
          ]
            .filter((element) => element.getClientRects().length)
            .map((element) => element.getBoundingClientRect());
          return [...document.querySelectorAll('.console-screw')]
            .filter((element) => element.getClientRects().length)
            .every((element) => {
              const screw = element.getBoundingClientRect();
              return controls.every(
                (control) =>
                  screw.right <= control.left ||
                  screw.left >= control.right ||
                  screw.bottom <= control.top ||
                  screw.top >= control.bottom,
              );
            });
        });
        assert(
          frame,
          'Frame fasteners never cover function controls or labels at ' + width + '/' + scale,
        );
        assert.ok(
          gaps.controls.every((gap) => gap >= 28),
          'Utilities and vent stay inside inset frame: ' + JSON.stringify({ width, scale, gaps }),
        );
        assert.ok(
          gaps.sidebar.length && gaps.sidebar.every((gap) => gap >= 3),
          'Sidebar clears trim: ' + JSON.stringify({ width, scale, gaps }),
        );
      }
    }
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--ui', '1');
      document.body.classList.remove('scaled');
    });
    await page.setViewportSize({ width: 3440, height: 1440 });
    await capture(page, 'hud-ultrawide-sidebar');
    await page.click('#traytoggle');
    await page
      .locator('#cockpit')
      .screenshot({ path: path.join(fixture.out, 'functional-console-3440.png') });
    await page
      .locator('#functiondock')
      .screenshot({ path: path.join(fixture.out, 'functional-button-detail.png') });
    await page.click('#cbmap');
    const map = await contained(page, '#gmap .gbox');
    assert.ok(Math.abs(map.width - 1800) < 1, 'Blue map uses its 1800px desktop chart width');
    assert.ok(Math.abs(map.height - 989) < 1, 'Map retains its readable 989px desktop height');
    await capture(page, 'functional-map-3440x1440');
    // Side-by-side details help wide desktops, not small landscape windows.
    for (const [width, height] of [
      [2560, 1080],
      [1280, 600],
      [800, 400],
      [640, 300],
    ]) {
      await page.setViewportSize({ width, height });
      const panel = await contained(page, '#gmap .gbox');
      const canvas = await page.locator('#gcanvas').boundingBox();
      assert.ok(canvas && canvas.width > 200 && canvas.height >= 119, 'Map stays usable');
      assert.equal(
        await page.locator('#gmap .gbox').evaluate((element) => getComputedStyle(element).display),
        width >= 1200 ? 'grid' : 'flex',
        'Small landscapes retain full-width map and details',
      );
      await page.locator('#gcanvas').scrollIntoViewIfNeeded();
      const visibleCanvas = await page.locator('#gcanvas').boundingBox();
      assert.ok(visibleCanvas && visibleCanvas.y < panel.y + panel.height, 'Canvas is reachable');
      await page.locator('#ginfo').scrollIntoViewIfNeeded();
      if (width === 2560) {
        const details = await page.locator('#ginfo').boundingBox();
        assert.ok(details && details.x >= canvas.x + canvas.width, 'Details sit beside map');
        assert.ok(
          canvas.height > 700,
          'Wide-short screen preserves map height: ' + JSON.stringify({ panel, canvas }),
        );
        await page.evaluate(async () => {
          G.mapView!.k *= 2;
          (await import('/ui.js')).openMap('meridian');
        });
        await capture(page, 'functional-map-2560x1080');
      }
      measurements.push({ width, height, panel, canvas });
    }
    await page.setViewportSize({ width: 3440, height: 1440 });

    await page.evaluate(async () => (await import('/ui.js')).closeMap());
    await page.click('#optbtn');
    const settings = await contained(page, '#opts .optbox');
    assert.ok(settings.width > settings.height * 1.5, 'Settings is landscape');
    const sections = await page.locator('.options-section').all();
    const bays = await Promise.all(sections.map((section) => section.boundingBox()));
    assert.ok(bays[0]!.x + bays[0]!.width < bays[1]!.x);
    assert.ok(bays[1]!.x + bays[1]!.width < bays[2]!.x);
    await page.locator('[data-bind="map"]').click();
    await page.keyboard.press('F8');
    assert.equal(await page.locator('[data-bind="map"]').innerText(), 'F8');
    await page.click('#optreset');
    await capture(page, 'functional-settings-3440x1440');
    await page
      .locator('#opts .optbox')
      .screenshot({ path: path.join(fixture.out, 'functional-settings-detail.png') });
    await page.click('#optclose');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('#traytoggle');
    await capture(page, 'functional-cockpit-1920x1080');
    await page.click('#traytoggle');
    for (const [width, height, scale] of [
      [1024, 768, 1],
      [640, 780, 1],
      [640, 780, 1.4],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate((value) => {
        document.documentElement.style.setProperty('--ui', String(value));
        document.body.classList.toggle('scaled', value !== 1);
      }, scale);
      await page.click('#optbtn');
      await contained(page, '#opts .optbox');
      await page.locator('#optclose').click();
      await page.click('#captainshortcut');
      await page.click('[data-it="profile"]');
      await contained(page, '#infobox .gbox');
      await page.locator('#portraitsave').scrollIntoViewIfNeeded();
      await contained(page, '#portraitsave');
      await capture(page, 'functional-profile-' + width + '-scale' + scale);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#infobox').isVisible(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    measurements.push({ landed, map, settings, dock, errors });
    assert.deepEqual(errors, []);
    await context.close();
  }
  filesystem.writeFileSync(
    path.join(fixture.out, 'layout-measurements.json'),
    JSON.stringify(measurements, null, 2),
  );
  console.log(
    'Functional cockpit: centered labels, uniform button-only LEDs, ALERT above Captain, integrated profile, landscape settings/key reassignment, flight-relative ultrawide landing and fastener-safe narrow/scaled containment passed.',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await fixture.close(browser);
}
