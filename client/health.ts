import { HealthMonitor } from '../shared/health.ts';
/** Browser-only, opt-in measurements. Read window.RiftEngine.scene.health?.report() in developer tools. */
export const browserHealth =
  new URLSearchParams(location.search).get('health') === '1'
    ? new HealthMonitor(512, () => performance.now())
    : undefined;
