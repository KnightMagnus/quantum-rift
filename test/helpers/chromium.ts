import type { LaunchOptions } from 'playwright';

/** Launch Chromium with the pinned browser unless an executable override is supplied. */
export async function launchChromium(options: LaunchOptions = {}) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE || ('playwright' as string)
  )) as typeof import('playwright');
  return chromium.launch({
    ...options,
    executablePath: process.env.CHROMIUM_EXECUTABLE || options.executablePath,
  });
}
