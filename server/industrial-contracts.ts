import type { GameStorage as Database } from './game-storage.ts';
import type { FeatureServices } from './features.ts';
import type { PlayerReference } from './game.ts';
import type { RefineryPlayer } from './refinery-contracts.ts';
import type { LootItem } from './space.ts';
export type IndustrialShip = {
  version: 1;
  heat: number;
  cutoff: boolean;
  workMs: number;
  harvestMs: number;
  outputs: Record<string, number>;
  recipe: string;
  grade: 'common' | 'rich' | 'pure';
  sweep: boolean;
  harvest: boolean;
  smelter: boolean;
  reason: string;
  inputs: { sweep: number; smelter: number; corona: number };
};
export type IndustrialWorld = {
  version: 1;
  sources: Record<string, { units: number; last: number }>;
};
export type IndustrialRequest = {
  t?: string;
  op?: 'sweep' | 'harvest' | 'smelter' | 'recipe' | 'off';
  recipe?: string;
  grade?: 'common' | 'rich' | 'pure';
};
export type Session = import('./game.ts').Session;
export type IndustrialCapabilities = {
  db: Pick<Database, 'world' | 'players' | 'touch' | 'flush' | 'economicFrozen'>;
  paused: () => boolean;
  room: (refineryPlayer: RefineryPlayer) => number;
  power: (refineryPlayer: RefineryPlayer) => number;
  sweep: FeatureServices['mining']['sweep'];
  loot: (playerReference: PlayerReference, lootItem: LootItem) => boolean | void;
  refresh: (session: Session) => void;
  toast: (session: Session, text: string) => void;
};
