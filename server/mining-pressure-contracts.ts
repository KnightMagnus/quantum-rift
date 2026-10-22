import type { DB as Database } from './db.ts';
import type { PlayerData, Session } from './game.ts';
import type { Space } from './space.ts';
export type CaptainPressure = {
  owner: string;
  sys: string;
  noise: number;
  updated: number;
  lastEncounter: number;
  warned: boolean;
};
export type MiningHazard = {
  id: string;
  sys: string;
  owner: string;
  participants: string[];
  sessions: number[];
  x: number;
  y: number;
  radius: number;
  triggerAt: number;
  detonateAt: number;
  resolved: boolean;
  entities: number[];
};
export type MiningEncounter = {
  id: string;
  sys: string;
  owner: string;
  participants: string[];
  sessions: number[];
  ids: number[];
  at: number;
  active: boolean;
};
export type MiningConsent = {
  owner: string;
  session: number;
  entity: number;
  sys: string;
  group: string;
  until: number;
};
export type MiningFieldRecovery = { key: string; recovery: number; updated: number };
export type SavedMiningPressure = {
  version: 1;
  nextId: number;
  captains: CaptainPressure[];
  hazards: MiningHazard[];
  encounters: MiningEncounter[];
  consent: MiningConsent[];
  fields: MiningFieldRecovery[];
};
export type PressureWire = {
  noise: number;
  warn: boolean;
  groupConsent: boolean;
  cooldown: number;
};
export type PressureSpace = Pick<
  Space,
  'id' | 'sys' | 'ships' | 'rocks' | 'makeShip' | 'root' | 'damage' | 'events'
>;
export type PressureCapabilities = {
  db: Pick<Database, 'world' | 'get' | 'key' | 'touch'>;
  sessions: () => Iterable<Session>;
  newcomer: (playerData: PlayerData) => boolean;
  rush: (starSystem: string) => boolean;
  toast: (session: Session, text: string) => void;
};
