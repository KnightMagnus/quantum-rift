import type { ContractPlan } from '../../client/main.ts';
import { requiredFixtureValue } from './required.ts';
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { Socket as NetSocket } from 'node:net';
import { Socket } from '../../server/ws.ts';
import type { Session } from '../../server/game.ts';
import type { RefineryQuote, FuelQuote, RefineryRequest } from '../../server/refinery-contracts.ts';
export interface FixtureMessage {
  t: string;
  msg: string;
  plan?: ContractPlan | null;
  quote?: RefineryQuote | FuelQuote;
}
export class FixtureSocket extends Socket {
  out: FixtureMessage[] = [];
  constructor() {
    super(new NetSocket());
  }
  override send(message: string | object): void {
    const packet = typeof message === 'string' ? JSON.parse(message) : message;
    this.out.push(packet as FixtureMessage);
  }
  override close(): void {}
}
export type FixtureSession = Session & { sock: FixtureSocket };
import { Game } from '../../server/game.ts';
import { DB as Database } from '../../server/db.ts';
import { makeLoadout } from '../../shared/rules.ts';
import { clearLots, addLots, assertLots } from '../../shared/cargo-lots.ts';
import { tempDataDir } from './temp-data.ts';
import { type CargoTotals, type GradeLots } from '../../shared/cargo-contracts.ts';
export function refineryGame(database = new Database(tempDataDir('rift-refinery-'))) {
  const interval = globalThis.setInterval;
  try {
    globalThis.setInterval = Object.assign(() => {
      const timer = interval(() => {}, 2147483647);
      clearInterval(timer);
      return timer;
    }, interval);
    return new Game(
      JSON.parse(
        filesystem.readFileSync(new URL('../../shared/assets.json', import.meta.url), 'utf8'),
      ),
      database,
    );
  } finally {
    globalThis.setInterval = interval;
  }
}
export function refineryPilot(game: Game, name = 'Refiner') {
  const existing = game.db.get(name);
  const sock = new FixtureSocket();
  game.connect(sock, '127.0.0.1');
  const session = requiredFixtureValue([...game.sessions.values()].at(-1));
  game.onMessage(session, { t: 'hello', name, pass: 'fixture' });
  assert.ok(requiredFixtureValue(session).data);
  if (!existing) {
    requiredFixtureValue(session).data.tut = 999;
    requiredFixtureValue(session).data.credits = 1e8;
    requiredFixtureValue(session).data.ship = makeLoadout(game.A, 704, 'Refinery');
  }
  requiredFixtureValue(session).ent = null;
  return session as FixtureSession;
}
export function seed(
  playerData: {
    cargo: CargoTotals;
    cargoLots: { version: 1; byCommodity: Record<string, GradeLots> };
  },
  inputs: Record<string, GradeLots>,
) {
  clearLots(playerData.cargo, playerData.cargoLots);
  for (const [commodityId, lots] of Object.entries(inputs))
    addLots(playerData.cargo, playerData.cargoLots, {
      cid: commodityId,
      qty: Object.values(lots).reduce((firstValue, secondValue) => firstValue + secondValue, 0),
      grades: lots,
    });
  assertLots(playerData.cargo, playerData.cargoLots);
}
export function command(
  game: Game,
  session: FixtureSession,
  message: RefineryRequest,
  orders = false,
) {
  game.features.refinery.command(
    session,
    { t: orders ? 'miningOrder' : 'refinery', ...message },
    orders,
  );
  assertLots(session.data.cargo, session.data.cargoLots);
}
export function quote(
  game: Game,
  session: FixtureSession,
  recipe = 'alloy',
  quantity = 3,
  grade = 'common',
  mode = 'instant',
) {
  const before = session.sock.out.length;
  command(game, session, { op: 'quote', recipe, n: quantity, grade, mode });
  const fixtureState = session.sock.out
    .slice(before)
    .find((message: { t: string }) => message.t === 'refineryQuote')?.quote;
  assert.ok(fixtureState, 'binding quote returned');
  return fixtureState as RefineryQuote;
}
export function lots(common = 0, rich = 0, pure = 0) {
  return { common, rich, pure };
}
export function refineryWorld(game: Game) {
  return requiredFixtureValue(game.db.world.refinery);
}

export function fuelQuote(game: Game, session: FixtureSession, quantity = 1) {
  const before = session.sock.out.length;
  command(game, session, { op: 'fuelQuote', n: quantity });
  const fixtureState = session.sock.out
    .slice(before)
    .find((message: { t: string }) => message.t === 'refineryFuelQuote')?.quote;
  assert.ok(fixtureState, 'server-issued fuel quote');
  return fixtureState as FuelQuote;
}
