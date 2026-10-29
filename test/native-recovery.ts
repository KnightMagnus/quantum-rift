import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NakamaService, until } from './helpers/nakama-service.ts';
import { customCaptainId } from '../shared/nakama-contracts.ts';
import { evidenceDir } from './helpers/browser-fixture.ts';

const service = new NakamaService(undefined, { deadlineMs: 120000, runtimeHealth: true });
const evidence = evidenceDir('native-recovery');
try {
  await service.initialize();
  const name = 'Recovery Pilot';
  const session = await service.client.authenticateCustom(customCaptainId(name), true, undefined, {
    pass: 'disposable-recovery-only',
    captainName: name,
  });
  const world = async (): Promise<string> => {
    const payload = (await service.client.rpc(session, 'qr_world', {})).payload;
    assert(payload && 'matchId' in payload && typeof payload.matchId === 'string');
    return payload.matchId;
  };
  const beforeMatch = await world();
  const captain = await service.connect(session);
  await captain.socket.joinMatch(beforeMatch);
  await until(() => captain.latest('you'), 'recovery captain admitted');
  await captain.socket.sendMatchState(
    beforeMatch,
    1,
    JSON.stringify({ t: 'trade', cid: 'food', qty: 1 }),
  );
  await until(() => captain.latest('you')?.d.cargo.food === 1, 'successful market action');
  let durable: { credits: number; food: number } | undefined;
  await until(
    async () => {
      const value = await service.query(
        "SELECT json_build_object('credits',value->'players'->'recovery pilot'->'credits','food',value->'players'->'recovery pilot'->'cargo'->'food') FROM storage WHERE collection='qr_server' AND key='authoritative_world_v1'",
      );
      const saved = JSON.parse(value);
      if (saved.food !== 1) return false;
      durable = saved;
      return true;
    },
    'high-value action durable without waiting for periodic ticks',
    5000,
  );
  await service.stopPostgres();
  await captain.socket.sendMatchState(
    beforeMatch,
    1,
    JSON.stringify({ t: 'trade', cid: 'food', qty: 1 }),
  );
  await until(
    () =>
      captain.packets.some((packet) => packet.t === 'error' && packet.code === 'WORLD_RECOVERING'),
    'failed checkpoint retires and notifies',
    10000,
  );
  await service.resumePostgres();
  let afterMatch = beforeMatch;
  await until(
    async () => {
      try {
        afterMatch = await world();
        return afterMatch !== beforeMatch;
      } catch {
        return false;
      }
    },
    'lease elects a replacement without restarting Nakama',
    10000,
  );
  const recovered = await service.connect(session);
  await recovered.socket.joinMatch(afterMatch);
  await until(() => recovered.latest('you'), 'replacement authority admits captain');
  assert.equal(
    recovered.latest('you')!.d.credits,
    durable!.credits,
    'rejected write cannot invent or retain uncommitted credits',
  );
  assert.equal(
    recovered.latest('you')!.d.cargo.food,
    durable!.food,
    'replacement restores the exact durable inventory',
  );
  await assert.rejects(
    captain.socket.joinMatch(beforeMatch),
    'retired match cannot accept a second authority',
  );
  fs.writeFileSync(
    path.join(evidence, 'result.json'),
    JSON.stringify(
      {
        recoveredWithoutNakamaRestart: true,
        exactDurableCreditsAndCargo: true,
        oldMatchRejected: true,
        notifications: 'WORLD_RECOVERING',
      },
      null,
      2,
    ),
  );
  console.log(
    'Native recovery: real PostgreSQL outage retires frozen VM, elects one replacement, restores durable market state and rejects the old match without a Nakama restart.',
  );
} finally {
  await service.cleanup();
}
