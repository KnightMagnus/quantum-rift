import additions from '../../shared/diversity-worlds.json' with { type: 'json' };
import { SYS } from '../../shared/galaxy.ts';

/** Run with the scene-pack trading ports removed, restoring the full roster afterwards. */
export function withOriginalMarketRoster<ValueType>(run: () => ValueType): ValueType {
  const addedMarkets = new Set(
    additions.filter((entry) => entry.body.svc.includes('T')).map((entry) => entry.body.id),
  );
  const originalBodies = new Map(Object.values(SYS).map((system) => [system, system.stellars]));
  try {
    for (const system of Object.values(SYS))
      system.stellars = system.stellars.filter((body) => !addedMarkets.has(body.id));
    return run();
  } finally {
    for (const [system, bodies] of originalBodies) system.stellars = bodies;
  }
}

/** Count the trade ports that the scene pack adds to the original roster. */
export function addedMarketCount(): number {
  return additions.filter((entry) => entry.body.svc.includes('T')).length;
}
