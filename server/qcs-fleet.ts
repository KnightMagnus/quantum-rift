import type { Game } from './game.ts';
import type { Entity, Space } from './space.ts';
import { SYS } from '../shared/galaxy.ts';
import { QCS_DWELL, QCS_ROSTER } from '../shared/qcs-fleet.ts';

/** Surviving hull health is retained across travel, sleeping systems and server saves. */
export interface QcsFleetState {
  /** Current system, always within Concord territory. */
  system: string;
  /** Previous system prevents immediate backtracking where another link exists. */
  previous?: string;
  /** Simulation seconds until the next jump. */
  remaining: number;
  /** Stable roster slots; null records a destroyed ship. */
  /** Next drone roster slot to launch from the carrier runway. */
  launched: number;
  /** Delay between visible runway departures. */
  launchIn: number;
  health: ({ shield: number; armor: number } | null)[];
}
/** Runtime entities are private to one game; the world record owns the roster. */
const deployed = new WeakMap<Game, { space: Space; ships: (Entity | null)[] }>();

/** Advance one global territorial patrol, rather than spawning one per visited system. */
export function tickQcsFleet(game: Game, elapsed: number): void {
  const state = (game.db.world.qcsFleet ??= {
    system: 'qgate',
    remaining: QCS_DWELL,
    launched: 0,
    launchIn: 3,
    health: QCS_ROSTER.map((hull) => ({
      shield: game.A.ships[hull].shield,
      armor: game.A.ships[hull].armor,
    })),
  });
  let active = deployed.get(game);
  if (active) {
    active.ships.forEach((ship, slot) => {
      if (slot >= 10 + state.launched) return;
      state.health[slot] =
        ship && !ship.dead && active!.space.ships.has(ship.id)
          ? { shield: ship.shield, armor: ship.armor }
          : null;
    });
  }
  state.remaining -= elapsed;
  if (state.remaining <= 0) {
    const links = SYS[state.system].links.filter((id) => SYS[id]?.faction === 'quantum');
    const onward = links.filter((id) => id !== state.previous);
    const next = (onward.length ? onward : links)[0];
    if (next) {
      if (active) {
        for (const ship of active.ships) if (ship && !ship.dead) active.space.remove(ship, 'jump');
      }
      state.previous = state.system;
      state.system = next;
      active = undefined;
      state.launched = 0;
      state.launchIn = 3;
    }
    state.remaining = QCS_DWELL;
  }
  if (active && game.live[state.system] && active.space !== game.live[state.system])
    active = undefined;
  if (!active && state.health.some(Boolean)) {
    state.launched = 0;
    state.launchIn = 3;
    const space = game.spaces[state.system];
    let flagship: Entity | null = null;
    const ships = QCS_ROSTER.map((hull, slot) => {
      const health = state.health[slot];
      if (!health || slot >= 10) return null;
      const ship = space.makeShip({
        hull,
        faction: 'quantum',
        name: slot === 0 ? 'QCS Concordance' : undefined,
        x: -2600 + (slot % 4) * 550,
        y: -2200 - Math.floor(slot / 4) * 450,
        shield: health.shield,
        armor: health.armor,
        ai: flagship ? 'escort' : 'patrol',
        owner: flagship?.id,
      });
      flagship ??= ship;
      // Formation cruises at capital-ship speed; ordinary hostility and combat remain authoritative.
      ship.st.maxSpeed = Math.min(ship.st.maxSpeed, 90);
      return ship;
    });
    active = { space, ships };
    deployed.set(game, active);
  }
  if (active) {
    const carrier = active.ships[1];
    if (!carrier || carrier.dead) {
      for (let slot = 10 + state.launched; slot < QCS_ROSTER.length; slot++)
        state.health[slot] = null;
      state.launched = 8;
    }
    state.launchIn -= elapsed;
    if (carrier && !carrier.dead && state.launched < 8 && state.launchIn <= 0) {
      const slot = 10 + state.launched++;
      const health = state.health[slot];
      if (health) {
        const origin = qcsRunwayOrigin(carrier);
        const drone = active.space.makeShip({
          hull: 853,
          faction: 'quantum',
          ...origin,
          a: carrier.a,
          vx: carrier.vx + Math.sin(carrier.a) * 35,
          vy: carrier.vy - Math.cos(carrier.a) * 35,
          shield: health.shield,
          armor: health.armor,
          ai: 'escort',
          owner: carrier.id,
        });
        drone.fighterOf = carrier.id;
        drone.st.maxSpeed = Math.min(drone.st.maxSpeed, 90);
        active.ships[slot] = drone;
      }
      state.launchIn = 0.75;
    }
  }
  game.db.dirty = true;
}

/** Flight deck centre is slightly port of the carrier centreline in model space. */
export function qcsRunwayOrigin(carrier: Pick<Entity, 'x' | 'y' | 'a' | 'st'>) {
  const lateral = -carrier.st.size * 0.035;
  return {
    x: carrier.x + Math.cos(carrier.a) * lateral,
    y: carrier.y + Math.sin(carrier.a) * lateral,
  };
}
