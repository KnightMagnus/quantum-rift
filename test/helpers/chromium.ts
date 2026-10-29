import type { BrowserContext, LaunchOptions } from 'playwright';

/** Browser launch settings, including whether this case owns the first-run orientation. */
interface FixtureLaunchOptions extends LaunchOptions {
  /** Exercise real first-run storage instead of treating fixture captains as returning players. */
  onboarding?: boolean;
}

/** Launch Chromium with the pinned browser unless an executable override is supplied. */
export async function launchChromium({
  onboarding = false,
  ...options
}: FixtureLaunchOptions = {}) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
  )) as typeof import('playwright');
  const browser = await chromium.launch({
    ...options,
    executablePath: process.env.CHROMIUM_EXECUTABLE || options.executablePath,
  });
  if (!onboarding) {
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (settings) => {
      const context: BrowserContext = await newContext(settings);
      await context.addInitScript(() => {
        // Unrelated scenarios start with returning captains. The orientation case
        // opts out of this fixture so completion/replay use untouched real storage.
        // oxlint-disable-next-line typescript/unbound-method -- Preserve the receiver for explicit call below.
        const read = Storage.prototype.getItem;
        Storage.prototype.getItem = function (key) {
          if (this === localStorage && key.startsWith('rift.onboarding.v1.')) {
            if (read.call(this, key) === null) this.setItem(key, 'complete');
          }
          return read.call(this, key);
        };
      });
      return context;
    };
  }
  return browser;
}
