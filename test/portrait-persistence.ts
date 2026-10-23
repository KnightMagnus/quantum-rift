import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventEmitter } from 'node:events';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import type { Socket } from '../server/ws.ts';
import { PLAYER_PORTRAITS, playerPortrait } from '../shared/portraits.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { NakamaDatabase } from '../server/nakama-storage.ts';
import type { StorageBackend } from '../shared/nakama-contracts.ts';

const directory = tempDataDir('portrait-persistence-');
const db = new DB(directory);
const game = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  db,
  { ...db.gamePlatform(), automaticClock: false },
);
const packets: Record<string, unknown>[] = [];
const socket = new EventEmitter() as Socket;
socket.open = true;
Object.defineProperty(socket, 'backlog', { value: 0 });
socket.send = (raw: string) => {
  packets.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
};
socket.close = () => {};
game.connect(socket, 'portrait-test');
const session = [...game.sessions.values()].at(-1)!;
game.onMessage(session, { t: 'hello', name: 'Portrait Captain', pass: 'fixture' });
const otherAccount = db.create('Other Captain', 'fixture', game.fresh());
const originalOther = structuredClone(otherAccount);
const original = structuredClone(session.data);
for (const invalid of ['', null, 3, {}, 'npc-r0', '../bad.png', 'https://bad', 'x'.repeat(2000)]) {
  game.messageHandlers.dispatch('portrait', session, { portraitId: invalid });
  assert.deepEqual(session.data, original, 'invalid input changes no saved field');
  assert.deepEqual(packets.at(-1), { t: 'portrait', ok: false });
}
const chosen = PLAYER_PORTRAITS.at(-1)!.id;
game.messageHandlers.dispatch('portrait', session, {
  portraitId: chosen,
  name: 'Other Captain',
  target: 999,
});
assert.deepEqual(
  session.data,
  { ...original, portraitId: chosen },
  'selection changes only authenticated captain portrait',
);
assert.deepEqual(packets.at(-1), { t: 'portrait', ok: true, portraitId: chosen });
assert.deepEqual(
  otherAccount,
  originalOther,
  'spoofed target name cannot mutate another stored captain',
);
assert.equal(game.features.frontier.profile('Portrait Captain')!.portraitId, chosen);
assert.equal(
  game.playerPayload(session, session.data, game.features.shipStats.stats(session.data)).portraitId,
  chosen,
);
db.flush();
const reloaded = new DB(directory).get('Portrait Captain')!;
assert.equal(reloaded.portraitId, chosen);
assert.equal(reloaded.credits, original.credits);
assert.deepEqual(reloaded.stats, original.stats);
assert.equal(playerPortrait(undefined), PLAYER_PORTRAITS[0].id);

// Exercise the same system-owned checkpoint/CAS adapter used by native matches.
let row: { value: object; version: string } | null = null;
const backend: StorageBackend = {
  read: () => (row ? structuredClone(row) : null),
  write: (_key, value, version) => {
    assert.equal(version, row ? row.version : '*');
    const next = String(Number(row?.version || 0) + 1);
    row = { value: structuredClone(value), version: next };
    return next;
  },
};
const native = new NakamaDatabase(backend);
const account = native.withAuthenticatedCaptain('Native Portrait', () =>
  native.create('Native Portrait', '', game.fresh()),
);
account.portraitId = chosen;
const nativeBefore = structuredClone(account);
native.touch();
native.flush();
const recovered = new NakamaDatabase(backend).get('Native Portrait')!;
assert.deepEqual(recovered, nativeBefore);
console.log(
  'Portrait authority, denial invariance, Solo journal reload and native checkpoint CAS reload passed.',
);
