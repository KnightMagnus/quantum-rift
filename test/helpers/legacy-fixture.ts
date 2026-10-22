import type { FixtureShape } from './mocks.ts';
import type { QuestRecord } from '../../shared/quests.ts';
import type { DocksPayload } from '../../server/docks.ts';
import { EventEmitter } from 'node:events';
import type { Socket } from '../../server/ws.ts';
import type { FormationTarget, Game, PlayerData } from '../../server/game.ts';
import type { captainBonus } from '../../shared/rules.ts';

/** Fields exercised by historical wire-protocol scenarios, decoded at the fixture boundary. */
export interface LegacyPacket {
  t: string;
  msg: string;
  name: string;
  text: string;
  tag: string;
  sent: boolean;
  who: string;
  rocks: unknown[];
  p: { name: string; arena: { l: number } };
  ch: string;
  from: string;
  to: string;
  sys: string;
  id: string;
  arc: string;
  done: boolean;
  title: string;
  body: string;
  at: string;
  on: boolean;
  team: string;
  d: Omit<PlayerData, 'armada' | 'docks'> & {
    bonus: ReturnType<typeof captainBonus>;
    armada: { name: string };
    docks: DocksPayload;
    newcomer: boolean;
    jobCargo: number;
  };
  story: { id: string; locked: string };
  blackmarket: { items: { locked: boolean }[] };
  bank: { max: number; credit: number };
  invasion: { sys: string };
  colony: { own: boolean };
  colonies: Record<string, string>;
  opts: { k: string }[];
  social: { friends: { name: string; status: string }[] };
  armada: { invites: unknown[]; members: { name: string; sysId: string }[] };
  list: { msg: string; name: string }[];
  trade: { with: string };
  plan: { id: string; revision: number };
}
export type LegacySocket = Socket & { backlog: number; out: LegacyPacket[] };

/** Historical tests intentionally supply only the transport methods used by Game.connect. */
export function legacySocket(): LegacySocket {
  return new EventEmitter() as LegacySocket;
}

/** Quest tests omit unrelated persistent metadata when exercising one progression rule. */
export const fixtureQuest = (value: FixtureShape<QuestRecord>): QuestRecord => value as QuestRecord;

type ShuttleFixture = Parameters<Game['features']['hangar']['resolveShuttle']>[1];
export const fixtureShuttle = (value: FixtureShape<ShuttleFixture>): ShuttleFixture =>
  value as ShuttleFixture;

/** Formation steering consumes pose and velocity, not formation bookkeeping metadata. */
export const fixtureFormationTarget = (
  value: Pick<FormationTarget, 'x' | 'y' | 'a' | 'vx' | 'vy'>,
): FormationTarget => value as FormationTarget;
