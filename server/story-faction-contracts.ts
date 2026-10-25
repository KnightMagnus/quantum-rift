import type { Entity, Space, Rock } from './space.ts';
import type { Session } from './game.ts';
import type { NhalPopulation } from './nhal.ts';
import type { IndexFleetWorld } from './index-fleet.ts';

export interface NhalCapabilities {
  /** Mutable persisted encounter budgets keyed by system ID. */
  populations: () => Record<string, NhalPopulation>;
  /** Existing persisted simulation clock; never wall time. */
  clock: () => number;
  /** Mark the ordinary world save dirty. */
  touch: () => void;
  /** Existing unobtrusive warning channel. */
  toast: (session: Session, text: string) => void;
}

export interface IndexFleetCapabilities {
  /** Persisted world workgroups keyed by system. */
  fleets: () => Record<string, IndexFleetWorld>;
  /** Existing simulation clock that stops offline. */
  clock: () => number;
  /** Stable authenticated captain identity for owned entities. */
  key: (entity: Entity) => string | null;
  /** Story hostility and the existing worksite's explicit offender contract. */
  provoked: (space: Space, visitor: Entity) => boolean;
  /** Shared finite mining extraction, never an independent ore generator. */
  extract: (space: Space, rock: Rock, damage: number) => void;
  /** Only untouched, unleased rocks can be selected; supplied by mining owner. */
  virginRock: (space: Space, site: { x: number; y: number }) => (Rock & { key: string }) | null;
  /** Existing save dirty marker. */
  touch: () => void;
  /** Existing cockpit notices. */
  toast: (session: Session, text: string) => void;
}
