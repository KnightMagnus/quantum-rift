import additions from '../../shared/diversity-worlds.json' with { type: 'json' };
import { SYS } from '../../shared/galaxy.ts';

/** Keep fixed simulation seeds independent of scene-pack market initialization. */
export function withLegacyMarketWarmup<T>(initialize: () => T): T {
  const addedMarkets = new Set(
    additions.filter((entry) => entry.body.svc.includes('T')).map((entry) => entry.body.id),
  );
  const originalBodies = new Map(Object.values(SYS).map((system) => [system, system.stellars]));
  try {
    for (const system of Object.values(SYS))
      system.stellars = system.stellars.filter((body) => !addedMarkets.has(body.id));
    return initialize();
  } finally {
    for (const [system, bodies] of originalBodies) system.stellars = bodies;
  }
}
