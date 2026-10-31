import {
  FrameCapture,
  PERFORMANCE_LIMITS,
  PERFORMANCE_SCENARIOS,
} from '../shared/browser-performance.ts';
import type { PerformanceScenario } from '../shared/browser-performance.ts';

/** Session-only frame recorder; interval collection requires the player to start it. */
export const performanceCapture = new FrameCapture();
let build: string | null = null;
let startEnvironment: ReturnType<typeof environment> | null = null;
let firstWorldFrameMs: number | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setPerformanceBuild(version: string): void {
  build = /^\d+(\.\d+){1,3}([+-][\w.-]+)?$/.test(version) ? version.slice(0, 80) : null;
}

/** Allowlisted browser/version and OS family; never export the raw user agent. */
function browserInfo() {
  const agent = navigator.userAgent;
  const browser =
    agent.match(/(Edg)\/([\d.]+)/) ??
    agent.match(/(Firefox|FxiOS)\/([\d.]+)/) ??
    agent.match(/(Chrome|CriOS)\/([\d.]+)/) ??
    agent.match(/(Version)\/([\d.]+)/);
  const os = /Windows/.test(agent)
    ? 'Windows'
    : /Android/.test(agent)
      ? 'Android'
      : /iPhone|iPad/.test(agent)
        ? 'iOS'
        : /Mac OS/.test(agent)
          ? 'macOS'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'unavailable';
  return {
    browser: browser?.[1] === 'Version' ? 'Safari' : (browser?.[1] ?? 'unavailable'),
    version: browser?.[2] ?? null,
    os,
  };
}

function environment() {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-renderer]');
  let graphics: { vendor: string; renderer: string } | null = null;
  // Query only the existing context. Canvas mode must not allocate a throwaway GPU context.
  if (canvas?.dataset.renderer === 'webgl') {
    try {
      const context = canvas.getContext('webgl2');
      if (context)
        graphics = {
          vendor: String(context.getParameter(context.VENDOR)).slice(0, 200),
          renderer: String(context.getParameter(context.RENDERER)).slice(0, 200),
        };
    } catch {
      /* Some browsers restrict graphics metadata. */
    }
  }
  return {
    ...browserInfo(),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
    renderer: canvas?.dataset.renderer ?? 'unavailable',
    graphics,
    logicalProcessors: navigator.hardwareConcurrency || null,
    // Browsers intentionally omit exact CPU, RAM and GPU models for privacy.
  };
}

function loading() {
  const navigation = performance.getEntriesByType('navigation')[0] as
    | PerformanceNavigationTiming
    | undefined;
  const resources = performance.getEntriesByType('resource');
  return {
    scope: 'page-lifetime; browser resource buffer may omit older entries',
    navigation: navigation
      ? {
          responseEndMs: navigation.responseEnd,
          domContentLoadedMs: navigation.domContentLoadedEventEnd || null,
          loadMs: navigation.loadEventEnd || null,
        }
      : null,
    firstWorldFrameMs,
    resourceCount: resources.length,
    resourceTotalDurationMs: resources.reduce((sum, resource) => sum + resource.duration, 0),
    resourceMaxDurationMs: resources.reduce(
      (maximum, resource) => Math.max(maximum, resource.duration),
      0,
    ),
  };
}

/** Called by the real scene update, not a second animation loop. */
export function performanceFrame(now: number, worldVisible: boolean): void {
  if (worldVisible && firstWorldFrameMs === null) firstWorldFrameMs = now;
  const wasRecording = performanceCapture.recording;
  performanceCapture.frame(now, document.visibilityState === 'visible');
  if (wasRecording && !performanceCapture.recording) refreshPerformanceControls();
}

export function performanceReport() {
  return {
    format: 'quantum-rift-browser-performance',
    version: 1,
    build,
    timing: 'foreground game-update intervals; not GPU time or presentation FPS',
    limits: PERFORMANCE_LIMITS,
    frames: performanceCapture.summary(performance.now()),
    intervalsMs: [...performanceCapture.samples],
    environmentStart: startEnvironment,
    environmentEnd: environment(),
    loading: loading(),
  };
}

export function refreshPerformanceControls(): void {
  const start = document.getElementById('perfstart') as HTMLButtonElement | null;
  if (!start) return;
  const active = performanceCapture.recording;
  start.textContent = active ? 'STOP RECORDING' : 'START RECORDING';
  (document.getElementById('perfscenario') as HTMLSelectElement).disabled = active;
  (document.getElementById('perfexport') as HTMLButtonElement).disabled =
    !performanceCapture.samples.length;
  (document.getElementById('perfclear') as HTMLButtonElement).disabled =
    !active && !startEnvironment;
  document.getElementById('perfstatus')!.textContent = active
    ? 'Recording. Close Settings and play, then return here to stop and export.'
    : startEnvironment
      ? `Stopped: ${performanceCapture.samples.length} frame intervals. Ready to export.`
      : 'Off. No frame intervals recorded.';
}

export function clearPerformanceCapture(): void {
  clearTimeout(timer);
  performanceCapture.clear();
  startEnvironment = null;
  refreshPerformanceControls();
}

export function initPerformanceControls(): void {
  document.getElementById('perfstart')!.onclick = () => {
    clearTimeout(timer);
    if (performanceCapture.recording) performanceCapture.stop(performance.now());
    else {
      startEnvironment = environment();
      performanceCapture.start(
        (document.getElementById('perfscenario') as HTMLSelectElement).value as PerformanceScenario,
        performance.now(),
      );
      timer = setTimeout(() => {
        performanceCapture.stop(performance.now(), 'duration-limit');
        refreshPerformanceControls();
      }, PERFORMANCE_LIMITS.durationMs);
    }
    refreshPerformanceControls();
  };
  document.getElementById('perfclear')!.onclick = clearPerformanceCapture;
  document.getElementById('perfexport')!.onclick = () => {
    if (!performanceCapture.samples.length) return;
    performanceCapture.stop(performance.now());
    clearTimeout(timer);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(
      new Blob([JSON.stringify(performanceReport(), null, 2)], { type: 'application/json' }),
    );
    link.download = 'quantum-rift-browser-performance-v1.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    refreshPerformanceControls();
  };
  document.addEventListener('visibilitychange', () => performanceCapture.interrupt());
  // Keep the workload selector constrained even if the markup changes.
  const select = document.getElementById('perfscenario') as HTMLSelectElement;
  select.replaceChildren(
    ...PERFORMANCE_SCENARIOS.map(
      (scenario) =>
        new Option(
          scenario === 'general' ? 'General play' : scenario[0].toUpperCase() + scenario.slice(1),
          scenario,
        ),
    ),
  );
  refreshPerformanceControls();
}
