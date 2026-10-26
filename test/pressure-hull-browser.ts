import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from 'playwright';
import { miningFixture } from './helpers/mining-fixture.ts';
import { failureEvidence } from './helpers/browser-fixture.ts';
const fixture = await miningFixture('pressure-hull-revised');
let browser;
async function capture(page: Page, name: string) {
  await page.evaluate(async () => {
    await Promise.all(
      [
        ...document.querySelectorAll('.overlay:not(.hidden) > div, #chatprojection:not(.hidden)'),
      ].flatMap((element) => element.getAnimations().map((animation) => animation.finished)),
    );
    const image = await window.RiftEngine.engine.screenshot(true);
    await image.decode();
  });
  await page.waitForFunction(
    () => document.querySelectorAll('#toasts > div:not(.newcomer-protection)').length === 0,
  );
  await page.screenshot({ path: path.join(fixture.out, name + '.png') });
}
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  for (const [width, height] of [
    [1920, 1080],
    [3440, 1440],
  ]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(fixture.origin);
    await page.fill('#lname', 'Mining Alpha');
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => !!G.you && !!G.landed);
    for (let index = 0; index < 8 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    if (!(await page.locator('body').getAttribute('class'))?.includes('tray-open'))
      await page.click('#traytoggle');
    assert.equal(
      await page.locator('body').evaluate((body) => body.classList.contains('pressure-hull')),
      true,
      'The blue cockpit is active at the ordinary game address',
    );
    await page.locator('[data-lt="overview"]').click();
    const displayTheme = await page.evaluate(() => {
      const surfaces = [
        '#hud',
        '#consolechat',
        '#functiondock',
        '#consoleutilities',
        '#land .landbox',
      ];
      const controls = ['#depart', '#ctabs button', '#ltabs button', '#functiondock button'];
      return {
        glass: surfaces.every((selector) =>
          getComputedStyle(document.querySelector(selector)!).backgroundImage.includes(
            'repeating-linear-gradient',
          ),
        ),
        controls: controls.every((selector) => {
          const style = getComputedStyle(document.querySelector(selector)!);
          return (
            style.borderImageSource === 'none' &&
            style.backgroundImage.includes('repeating-linear-gradient')
          );
        }),
        frame: getComputedStyle(
          document.querySelector('#land .landbox')!,
        ).borderImageSource.includes('sculpted-frame.svg'),
      };
    });
    assert.equal(displayTheme.glass, true, 'Every main inner display has scanline glass');
    assert.equal(
      displayTheme.controls,
      true,
      'Inner controls use display styling instead of warm physical key artwork',
    );
    assert.equal(displayTheme.frame, true, 'The outer physical frame is preserved');

    const shell = await page.evaluate(() => {
      const trim = document.getElementById('viewscreen-trim')!.getBoundingClientRect();
      const cockpit = document.getElementById('cockpit')!.getBoundingClientRect();
      return {
        top: trim.top,
        bottom: trim.bottom,
        right: trim.right,
        consoleRight: cockpit.right,
        consoleBottom: cockpit.bottom,
        height: innerHeight,
      };
    });
    assert.equal(shell.top, 0, 'The connected shell reaches the top of the viewscreen');
    assert.equal(shell.bottom, shell.height, 'The shell continues behind the lower console');
    assert.equal(shell.consoleBottom, shell.bottom);
    assert.equal(shell.consoleRight, shell.right, 'Screen rails and console share one perimeter');
    for (const tab of ['radio', 'codex', 'station', 'ops', 'captains', 'log', 'missions']) {
      await page.locator(`#ctabs [data-tab="${tab}"]`).click();
      assert.equal(await page.locator(`#t-${tab}`).isVisible(), true);
      assert.ok(
        await page
          .locator(`#t-${tab}`)
          .evaluate((panel) => panel.scrollWidth <= panel.clientWidth + 1),
        `Themed ${tab} content remains inside the HUD menu`,
      );
    }
    assert.equal(await page.locator('#landpic').isVisible(), true);
    assert.ok(
      (await page.locator('#landpic').boundingBox())!.height <= 340,
      'The station illustration stays compact rather than filling the landing window',
    );
    assert.equal(
      await page.locator('#landbody .detail > img').isVisible(),
      false,
      'Overview uses one existing illustration only',
    );
    await page.waitForFunction(
      () => getComputedStyle(document.getElementById('hailindicator')!).visibility === 'visible',
    );
    assert.equal(
      await page.locator('#hailindicator').isVisible(),
      true,
      'Hail remains reachable while landed',
    );
    assert.equal(
      await page
        .locator('#ltabs')
        .evaluate(
          (tabs) =>
            new Set(
              [...tabs.querySelectorAll('button')]
                .filter((button) => getComputedStyle(button).display !== 'none')
                .map((button) => Math.round(button.getBoundingClientRect().top)),
            ).size,
        ),
      1,
      'Desktop service tabs remain in one row',
    );
    await page.locator('#ctabs [data-tab="radio"]').click();
    await capture(page, 'landed-' + width + 'x' + height);
    await page.setViewportSize({ width: 1000, height: 900 });
    await page.waitForFunction(() => innerWidth === 1000);
    assert.equal(
      await page.locator('#landnews').isVisible(),
      true,
      'Spaceport news stays reachable on narrow screens',
    );
    assert.ok(
      await page.locator('#landnews .newsit').count(),
      'Narrow landing preserves the actual spaceport reports',
    );
    await page.locator('#landnews').scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator('#landnews').evaluate((news) => {
        const panel = news.getBoundingClientRect();
        const shell = document.querySelector('#land .landbox')!.getBoundingClientRect();
        news.scrollTop = news.scrollHeight;
        return (
          panel.height > 0 &&
          panel.top < shell.bottom - 28 &&
          panel.bottom > shell.top + 28 &&
          news.scrollTop + news.clientHeight >= news.scrollHeight - 1
        );
      }),
      'Narrow spaceport news can be reached and scrolled to its last report',
    );
    await page.locator('#depart').scrollIntoViewIfNeeded();
    assert.ok(
      await page.locator('#depart').evaluate((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.top >= 0 && bounds.bottom <= innerHeight;
      }),
      'Narrow landing keeps Depart reachable after scrolling through the overview',
    );
    await capture(page, 'landed-narrow-' + width);
    await page.setViewportSize({ width, height });
    const serviceTabs = await page
      .locator('#ltabs button')
      .evaluateAll((buttons) => buttons.map((button) => (button as HTMLElement).dataset.lt!));
    for (const service of serviceTabs) {
      await page.locator(`#ltabs [data-lt="${service}"]`).click();
      assert.ok(
        await page.locator('#landbody').evaluate((panel) => {
          panel.scrollTop = panel.scrollHeight;
          return (
            panel.scrollWidth <= panel.clientWidth + 1 &&
            panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1
          );
        }),
        `Themed ${service} service stays within its screen and can scroll to the last row`,
      );
    }
    await page.locator('#ltabs [data-lt="overview"]').click();
    await page.click('#hailindicator');
    await page.locator('#hailbox').waitFor({ state: 'visible' });
    assert.ok((await page.locator('#hailopts').textContent())?.includes('Allow player hails'));
    await page.locator('#hailopts button').filter({ hasText: 'CLOSE' }).click();
    await page.locator('[data-lt="trade"]').click();
    assert.equal(await page.locator('#landpic').isVisible(), false);
    assert.ok((await page.locator('[data-act="trade"]').count()) > 0);
    await capture(page, 'trade-' + width + 'x' + height);
    await page.locator('[data-lt="yard"]').click();
    await page
      .locator('#landbody .detail img')
      .first()
      .evaluate((image: HTMLImageElement) => image.decode());
    await capture(page, 'shipyard-' + width + 'x' + height);
    await page.click('#depart');
    await page.waitForFunction(() => !!G.view && !G.landed);
    assert.equal(
      await page.locator('#hailindicator').isVisible(),
      true,
      'Hail remains reachable in flight',
    );
    await capture(page, 'flight-' + width + 'x' + height);
    assert.ok(
      await page.locator('#cr').evaluate((credits) => {
        const [red, , blue] = getComputedStyle(credits).color.match(/\d+/g)!.map(Number);
        return red! > blue!;
      }),
      'Credits keep their gold accent on the blue display',
    );
    const groups = await page.evaluate(() => {
      const rect = (id: string) => {
        const bounds = document.getElementById(id)!.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
      };
      return {
        dock: rect('functiondock'),
        chat: rect('consolechat'),
        utilities: rect('consoleutilities'),
        hud: rect('hud'),
        cockpit: rect('cockpit'),
        chatLog: rect('chatlog'),
        chatBody: rect('chat'),
        chatBar: rect('cbar'),
        chatHeader: rect('commsheader'),
        chatText: document.getElementById('chatlog')!.textContent,
        trimTop: getComputedStyle(document.getElementById('viewscreen-trim')!).borderTopWidth,
      };
    });
    assert.equal(groups.trimTop, '0px', 'The world remains open at the top');
    assert.ok(
      groups.chatBody.bottom - groups.chatBody.top >= 24,
      'Compact chat retains a readable message line',
    );
    assert.ok(groups.chatText?.includes('Mining Alpha'), 'Actual game chat remains populated');
    assert.ok(
      await page.locator('#consoleutilities').evaluate((housing) => {
        const frame = housing.getBoundingClientRect();
        return [...housing.querySelectorAll('button')].every((button) => {
          const bounds = button.getBoundingClientRect();
          return (
            bounds.left >= frame.left + 20 &&
            bounds.right <= frame.right - 20 &&
            bounds.top >= frame.top + 12 &&
            bounds.bottom <= frame.bottom - 16
          );
        });
      }),
      'Utility controls stay inside their housing, clear of the perimeter artwork',
    );
    await page.click('#traytoggle');
    assert.equal(
      await page.locator('#hailindicator').isVisible(),
      true,
      'Closing the tray does not hide Hail',
    );
    await page.click('#traytoggle');
    assert.ok(
      groups.dock.right <= groups.chat.left && groups.chat.right <= groups.utilities.left,
      'Console groups never overlap',
    );
    assert.ok(groups.cockpit.right <= groups.hud.left + 1, 'Expanded sidebar is clear of console');
    assert.ok(
      await page.locator('#functiondock').evaluate((dock) => {
        const frame = dock.getBoundingClientRect();
        return [...dock.querySelectorAll('.function-label')].every(
          (label) => label.getBoundingClientRect().bottom <= frame.bottom - 8,
        );
      }),
      'All captions stay inside their console frame',
    );
    await page.evaluate(async () => {
      const { chatLine } = await import('/ui.js');
      const reports = [
        [
          'Meridian Control',
          'Inbound convoy has cleared the jump point. Keep the approach lanes clear.',
        ],
        [
          'Survey Team',
          'Rich ore seam marked near the outer belt. No hostile contacts on the local scan.',
        ],
        [
          'Wing Two',
          'Formation checks complete. Shields charged and fuel reserves good for the return trip.',
        ],
        ['Mining Alpha', 'Coordinates received. We will return once the cargo hold is full.'],
      ];
      for (let index = 0; index < 32; index++) {
        const [from, msg] = reports[index % reports.length];
        chatLine({ from, msg, ch: 'sys' });
      }
    });
    await page.click('#chatexpand');
    await page.locator('#chatprojection').waitFor({ state: 'visible' });
    assert.ok(
      (await page.locator('#chatprojection #chatlog').textContent())?.includes('Mining Alpha'),
    );
    assert.equal(
      await page.locator('#chatin').isVisible(),
      true,
      'Input stays in the compact console while history is projected',
    );
    assert.equal(
      await page.locator('#cbar .cchan').isVisible(),
      true,
      'Channel tabs remain reachable',
    );
    assert.ok(
      await page.locator('#chatprojection #chatlog').evaluate((log) => {
        const bounds = log.getBoundingClientRect();
        const frame = log.parentElement!.getBoundingClientRect();
        return (
          bounds.left >= frame.left &&
          bounds.right <= frame.right &&
          bounds.top >= frame.top &&
          bounds.bottom <= frame.bottom
        );
      }),
      'Projected history remains inside its themed shell',
    );
    assert.ok(
      (await page.locator('#chatprojection #chatlog > div').count()) >= 32,
      'Dense history is rendered through the real chat renderer',
    );
    assert.ok(
      await page.locator('#chatlog').evaluate((log) => log.scrollHeight > log.clientHeight),
      'Long history stays scrollable instead of growing its frame',
    );
    await page.locator('#chatlog').evaluate(async (log) => {
      log.scrollTo({ top: 0, behavior: 'instant' });
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    await page.locator('#chatlog').focus();
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => document.getElementById('chatlog')!.scrollTop > 0);
    await page.locator('#chatlog').evaluate((log) => log.scrollTo({ top: 0, behavior: 'instant' }));
    await page.locator('#chatlog').hover();
    await page.mouse.wheel(0, 240);
    await page.waitForFunction(() => document.getElementById('chatlog')!.scrollTop > 0);
    await page.fill('#chatin', 'Meridian approach checked. Returning to the station.');
    await page.press('#chatin', 'Enter');
    await page.waitForFunction(() =>
      document
        .getElementById('chatlog')!
        .textContent.includes('Meridian approach checked. Returning to the station.'),
    );
    await page
      .locator('#chatlog')
      .evaluate((log) => log.scrollTo({ top: log.scrollHeight, behavior: 'instant' }));
    await capture(page, 'expanded-chat-' + width + 'x' + height);
    await page.click('#chatexpand');
    await page.locator('#chatprojection').waitFor({ state: 'hidden' });
    assert.equal(
      await page.locator('#consolechat #chatlog').count(),
      1,
      'Collapsing restores the same live history to the console',
    );
    await page.click('#captainshortcut');
    await page.click('[data-it="profile"]');
    await page.locator('#portraitpreview').evaluate((image: HTMLImageElement) => image.decode());
    await page.locator('#captainprofile').evaluate((panel) => {
      panel.scrollTop = 0;
    });
    await capture(page, 'captain-profile-' + width + 'x' + height);
    await page.keyboard.press('Escape');
    await page.click('#optbtn');
    await page.locator('#opts').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#opt-vol').evaluate((input) => {
        const colors = getComputedStyle(input).backgroundImage.match(/rgb\([^)]+\)/g) || [];
        return (
          colors.length > 0 &&
          colors.every((color) => {
            const [red, , blue] = color.match(/\d+/g)!.map(Number);
            return blue! > red!;
          })
        );
      }),
      true,
      'Volume tracks use the blue display palette, not inherited red chrome',
    );
    await capture(page, 'settings-' + width + 'x' + height);
    for (const scale of [1.2, 1]) {
      await page.locator('#opt-scale').evaluate((input: HTMLInputElement, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, scale);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      assert.ok(
        await page.locator('#hud').evaluate((hud) => {
          const bounds = hud.getBoundingClientRect();
          return (
            bounds.left >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1
          );
        }),
        'Sidebar remains inside the viewport after changing interface size',
      );
      assert.ok(
        await page.locator('#optclose').isVisible(),
        'Settings remains usable after scaling',
      );
    }
    await page.click('#optclose');
    await page.click('#cbmap');
    await page.locator('#gmap').waitFor({ state: 'visible' });
    await capture(page, 'map-' + width + 'x' + height);
    assert.ok(
      await page.locator('#gcanvas').evaluate((canvas: HTMLCanvasElement) => {
        const [red, green, blue] = canvas.getContext('2d')!.getImageData(1, 1, 1, 1).data;
        return blue! > red! + 20 && blue! > green!;
      }),
      'The galaxy chart is drawn on the blue display glass',
    );
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'No document overflow',
    );
    assert.deepEqual(errors, []);
    filesystem.writeFileSync(
      path.join(fixture.out, 'geometry-' + width + '.json'),
      JSON.stringify(groups, null, 2),
    );
    if (width === 3440) {
      await page.keyboard.press('Escape');
      await page.setViewportSize({ width: 1000, height: 900 });
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      for (const selector of ['#functiondock', '#consolechat', '#consoleutilities']) {
        await page.locator(selector).scrollIntoViewIfNeeded();
        const group = await page.locator(selector).boundingBox();
        const cockpit = await page.locator('#cockpit').boundingBox();
        assert.ok(
          group &&
            cockpit &&
            group.x >= cockpit.x &&
            group.x + group.width <= cockpit.x + cockpit.width + 1 &&
            group.y >= cockpit.y &&
            group.y + group.height <= cockpit.y + cockpit.height + 1,
          'Each narrow console group remains reachable by scrolling: ' + selector,
        );
      }
      await capture(page, 'flight-narrow-1000x900');
    }
    await page.close();
  }
  console.log(
    'Pressure Hull: actual 1920x1080/3440x1440 flight, one-art landed overview, trade, yard, Captain/Profile, settings, expanded/restored chat and map captured; group separation and runtime checks passed.',
  );
} catch (error) {
  await failureEvidence(browser, fixture.out, error);
  throw error;
} finally {
  await fixture.close(browser);
}
