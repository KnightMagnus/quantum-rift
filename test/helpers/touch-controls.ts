import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { CDPSession, Page } from 'playwright';
import { launchChromium } from './chromium.ts';
import { delay, failureEvidence } from './browser-fixture.ts';

declare global {
  interface Window {
    /** Synchronous production sends, sampled before the browser can run another frame. */
    touchCommands: TouchCommand[];
    /** Actual window blur events; hiding-state coverage must not rely on one. */
    touchBlurEvents: number;
  }
}

/** Outgoing game commands observed on the real fixture WebSocket. */
interface TouchCommand {
  /** Production action discriminator. */
  t: string;
  /** Held primary fire. */
  f1?: number;
  /** Forward thrust. */
  th?: number;
  /** Turn direction. */
  tu?: number;
}

/** Trusted touch events exercise production input and the actual dock round trip. */
export async function runTouchControls(origin: string, output: string): Promise<void> {
  const browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const packets: TouchCommand[] = [];
  const errors: string[] = [];
  const inputTrace: string[] = [];
  try {
    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 1024, height: 768 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('touch-probe')) inputTrace.push(message.text());
    });
    await page.addInitScript(() => {
      window.touchCommands = [];
      window.touchBlurEvents = 0;
      window.addEventListener('blur', () => window.touchBlurEvents++);
      // oxlint-disable-next-line typescript/unbound-method -- Preserve receiver with call below.
      const send = WebSocket.prototype.send;
      WebSocket.prototype.send = function (data) {
        if (typeof data === 'string') {
          const packet = JSON.parse(data) as TouchCommand;
          if (packet.t === 'input') window.touchCommands.push(packet);
        }
        return send.call(this, data);
      };
      for (const type of ['pointerdown', 'pointerup', 'pointercancel', 'click'])
        document.addEventListener(
          type,
          (event) =>
            console.debug(
              'touch-probe',
              JSON.stringify({
                type,
                target: (event.target as HTMLElement)?.outerHTML.slice(0, 100),
                active: document.activeElement?.id,
                trusted: event.isTrusted,
              }),
            ),
          true,
        );
    });
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        const packet = JSON.parse(String(frame.payload)) as TouchCommand;
        if (['input', 'land'].includes(packet.t)) packets.push(packet);
      }),
    );
    await page.goto(origin);
    await page.fill('#lname', 'Layout Hub');
    await page.fill('#lpass', 'fixture');
    await page.click('#lbtn');
    await page.waitForFunction(() => G.you && G.landed);
    for (let index = 0; index < 12 && (await page.locator('#storybox').isVisible()); index++)
      await page.locator('#storyb button').first().click();
    assert.equal(
      await page.locator('#touch').isVisible(),
      false,
      'touch flight input does not cover dock',
    );
    await page.locator('#depart').tap();
    await page.waitForFunction(() => G.view && !G.landed);
    const session = await context.newCDPSession(page);
    const waitPacket = async (start: number, predicate: (packet: TouchCommand) => boolean) => {
      const deadline = Date.now() + 5000;
      while (!packets.slice(start).some(predicate) && Date.now() < deadline) await delay(20);
      const matched = packets.findIndex((packet, index) => index >= start && predicate(packet));
      assert.ok(matched >= start, 'expected authoritative input command');
      return matched;
    };
    const measurements: object[] = [];
    for (const [width, height, scale] of [
      [1024, 768, 1],
      [1024, 768, 1.4],
      [1093, 614, 1.4],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      await page.evaluate((scale) => {
        document.documentElement.style.setProperty('--ui', String(scale));
        document.body.classList.toggle('scaled', scale !== 1);
      }, scale!);
      inputTrace.push(`viewport ${width}x${height} ui ${scale}`);
      const fire = await point(page, '[data-k="fire1"]');
      const map = await point(page, '[data-tap="map"]');
      await point(page, '[data-tap="land"]');
      await touch(session, 'touchStart', map);
      await touch(session, 'touchEnd');
      await page.locator('#gmap').waitFor({ state: 'visible' });
      assert.equal(
        await page.locator('#touch').isVisible(),
        false,
        'map dialog owns the input layer',
      );
      const blockedAt = packets.length;
      await touch(session, 'touchStart', fire);
      await touch(session, 'touchEnd');
      await delay(100);
      assert.ok(
        !packets.slice(blockedAt).some((packet) => packet.f1 === 1),
        'dialog taps do not fire through',
      );
      await page.locator('#gclose').tap();
      await page.locator('#gmap').waitFor({ state: 'hidden' });
      for (const release of ['touchEnd', 'touchCancel'] as const) {
        const started = packets.length;
        await touch(session, 'touchStart', fire);
        try {
          await waitPacket(started, (packet) => packet.f1 === 1);
        } finally {
          await touch(session, release);
        }
        const ended = packets.length;
        const neutral = await waitPacket(
          ended,
          (packet) => packet.t === 'input' && packet.f1 === 0,
        );
        await delay(150);
        assert.ok(
          !packets.slice(neutral + 1).some((packet) => packet.f1 === 1),
          'released/canceled fire stays released',
        );
      }
      // Pointer capture keeps a drag from reassigning held fire to another control.
      const dragging = packets.length;
      await touch(session, 'touchStart', fire);
      try {
        await waitPacket(dragging, (packet) => packet.f1 === 1);
        await touch(session, 'touchMove', { x: fire.x - 100, y: fire.y - 100 });
      } finally {
        await touch(session, 'touchEnd');
      }
      const released = packets.length;
      await waitPacket(released, (packet) => packet.t === 'input' && packet.f1 === 0);
      const stick = await page.locator('#tstick').boundingBox();
      assert.ok(stick);
      const steering = packets.length;
      await touch(session, 'touchStart', { x: stick.x + stick.width / 2, y: stick.y + 8 });
      try {
        await waitPacket(steering, (packet) => !!packet.th || !!packet.tu);
      } finally {
        await touch(session, 'touchCancel');
      }
      await waitPacket(
        packets.length,
        (packet) => packet.t === 'input' && packet.th === 0 && packet.tu === 0,
      );
      const heldBeforeMap = packets.length;
      await touch(session, 'touchStart', fire);
      try {
        await waitPacket(heldBeforeMap, (packet) => packet.f1 === 1);
        await page.keyboard.press('m');
      } finally {
        await touch(session, 'touchEnd');
      }
      await page.locator('#gmap').waitFor({ state: 'visible' });
      const neutralAfterMap = await waitPacket(
        packets.length,
        (packet) => packet.t === 'input' && packet.f1 === 0,
      );
      await page.keyboard.press('Escape');
      await delay(100);
      assert.ok(
        !packets.slice(neutralAfterMap + 1).some((packet) => packet.f1 === 1),
        'closing a modal does not restore held touch fire',
      );
      await page.screenshot({ path: path.join(output, `tablet-${width}x${height}-${scale}.png`) });
      measurements.push({ width, height, scale, fire, map, packets: packets.length });
    }
    const fireBeforeHide = await point(page, '[data-k="fire1"]');
    const firingBeforeHide = packets.length;
    await touch(session, 'touchStart', fireBeforeHide);
    try {
      await waitPacket(firingBeforeHide, (packet) => packet.f1 === 1);
      const hidden = await page.evaluate(() => {
        const before = window.touchCommands.length;
        const blurs = window.touchBlurEvents;
        const descriptor = Object.getOwnPropertyDescriptor(document, 'hidden');
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        const commands = window.touchCommands.slice(before);
        if (descriptor) Object.defineProperty(document, 'hidden', descriptor);
        else Reflect.deleteProperty(document, 'hidden');
        return { commands, blurs, after: window.touchBlurEvents };
      });
      assert.equal(hidden.after, hidden.blurs, 'visibility safety does not depend on window blur');
      assert.ok(
        hidden.commands.some(
          (packet) => packet.t === 'input' && packet.f1 === 0 && packet.th === 0 && packet.tu === 0,
        ),
        'visibility handler sends neutral synchronously before any later animation frame',
      );
    } finally {
      await touch(session, 'touchEnd');
    }
    const land = await point(page, '[data-tap="land"]');
    await touch(session, 'touchStart', land);
    await touch(session, 'touchEnd');
    await page.waitForFunction(() => !!G.landed, undefined, { timeout: 30000 });
    assert.ok(
      packets.some((packet) => packet.t === 'land'),
      'touch LAND uses the ordinary authoritative landing action',
    );
    assert.equal(
      await page.locator('#touch').isVisible(),
      false,
      'landing releases and hides flight controls',
    );
    assert.deepEqual(errors, []);
    fs.writeFileSync(
      path.join(output, 'touch.json'),
      JSON.stringify({ measurements, packets, errors }, null, 2),
    );
    console.log(
      'Touch controls: MAP modal precedence, FIRE hold/release/cancel/drag and authoritative LAND passed.',
    );
  } catch (error) {
    fs.writeFileSync(
      path.join(output, 'touch-input-trace.json'),
      JSON.stringify(inputTrace, null, 2),
    );
    fs.writeFileSync(path.join(output, 'touch-packets.json'), JSON.stringify(packets, null, 2));
    await failureEvidence(browser, output, error);
    throw error;
  } finally {
    await browser.close();
  }
}

/** Verify the actual center hits the visible control, not a cockpit or modal overlay. */
async function point(page: Page, selector: string): Promise<{ x: number; y: number }> {
  return page.locator('#tbtns ' + selector).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const x = rect.x + rect.width / 2,
      y = rect.y + rect.height / 2;
    if (!element.contains(document.elementFromPoint(x, y)))
      throw Error('Touch control occluded: ' + element.textContent);
    return { x, y };
  });
}

/** Chromium emits trusted browser pointer/touch events, not DOM dispatch mocks. */
async function touch(
  session: CDPSession,
  type: 'touchStart' | 'touchMove' | 'touchEnd' | 'touchCancel',
  point?: { x: number; y: number },
) {
  await session.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: point ? [{ ...point }] : [],
  });
}
