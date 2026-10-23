import assert from 'node:assert/strict';
import path from 'node:path';
import fs from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  friendHostConfig,
  friendHostAllowed,
  friendOriginAllowed,
  friendGamePlatform,
  parseFriendOrigin,
} from '../server/friend-host-config.ts';
import { createGameConnection } from '../client/connection.ts';
import type { ConnectionConfig } from '../client/connection.ts';

const privateTemp = fileURLToPath(new URL('../../temp/', import.meta.url));
fs.mkdirSync(privateTemp, { recursive: true, mode: 0o700 });
const root = fs.mkdtempSync(path.join(privateTemp, 'friend-config-'));
process.once('exit', () => fs.rmSync(root, { recursive: true, force: true }));
const baseline = { HOST_FRIENDS: '1' };
const config = friendHostConfig(baseline, root);
assert.equal(config.bind, '127.0.0.1');
assert.equal(config.port, 8080);
assert.equal(config.dataDirectory, path.join(root, 'friend-data'));
assert.equal(friendHostConfig({ ...baseline, HOST_BIND: '0.0.0.0' }, root).bind, '0.0.0.0');
assert.equal(friendHostConfig({ ...baseline, HOST_BIND: '::1', PORT: '65535' }, root).port, 65535);
for (const PORT of ['', '0', '-1', '65536', '1.5', '8e3', ' 8080', 'NaN'])
  assert.throws(() => friendHostConfig({ ...baseline, PORT }, root), /PORT/);
for (const HOST_BIND of [
  '',
  'localhost',
  'http://127.0.0.1',
  '127.0.0.1:8080',
  '256.1.1.1',
  '0.0.0.0;echo',
])
  assert.throws(() => friendHostConfig({ ...baseline, HOST_BIND }, root), /HOST_BIND/);
for (const override of [
  { HOST_FRIENDS: '0' },
  { SOLO: '1' },
  { SEEDS_FILE: 'fixture.json' },
  { INVASION_NOW: 'sol' },
  { DATA_DIR: 'solo-data' },
  { FRIEND_DATA_DIR: 'solo-data' },
  { FRIEND_DATA_DIR: 'data' },
])
  assert.throws(() => friendHostConfig({ ...baseline, ...override }, root));
for (const origin of [
  'null',
  'file:///game',
  'javascript:alert(1)',
  'https://user:pass@example.com',
  'https://example.com/game',
  'https://example.com?x=1',
  'https://example.com#x',
  '',
])
  assert.throws(() => parseFriendOrigin(origin));
assert.equal(parseFriendOrigin('https://example.com:443/'), 'https://example.com');
assert.equal(friendOriginAllowed('http://127.0.0.1:8080', '127.0.0.1:8080', false), true);
assert.equal(
  friendOriginAllowed(
    'https://friends.example',
    '127.0.0.1:8080',
    false,
    'https://friends.example',
  ),
  true,
);
for (const origin of [
  undefined,
  'null',
  'https://evil.example',
  'http://127.0.0.1:8081',
  'https://127.0.0.1:8080',
  'http://127.0.0.1:8080/evil',
])
  assert.equal(friendOriginAllowed(origin, '127.0.0.1:8080', false), false);
assert.equal(
  friendOriginAllowed('https://evil.example', '127.0.0.1:8080@evil.example', false),
  false,
);
assert.equal(friendHostAllowed('attacker.example:8080', config), false);
assert.equal(
  friendOriginAllowed('http://attacker.example:8080', 'attacker.example:8080', false),
  false,
);
assert.equal(friendHostAllowed('localhost:8080', config), true);
assert.equal(friendHostAllowed('[::1]:8080', config), true);
assert.equal(friendHostAllowed('127.0.0.1:8081', config), false);
assert.equal(
  friendHostAllowed('friends.example', { ...config, publicOrigin: 'https://friends.example' }),
  true,
);
for (const addresses of Object.values(networkInterfaces()))
  for (const address of addresses || []) {
    const host =
      address.family === 'IPv6' ? '[' + address.address + ']:8080' : address.address + ':8080';
    assert.equal(friendHostAllowed(host, config), true);
    assert.equal(friendOriginAllowed('http://' + host, host, false, undefined, config), true);
  }
fs.mkdirSync(path.join(root, 'solo-data'));
fs.symlinkSync(path.join(root, 'solo-data'), path.join(root, 'solo-alias'), 'junction');
for (const directory of ['solo-alias', 'solo-alias/new-save', '.', 'solo-data/nested'])
  assert.throws(
    () => friendHostConfig({ ...baseline, FRIEND_DATA_DIR: directory }, root),
    /separate directory/,
  );
const platform = friendGamePlatform();
assert.deepEqual(platform.seedDefinitions, []);
assert.equal(platform.invasionNow, undefined);
assert.equal(platform.automaticClock, true);
assert.match(platform.randomUUID(), /^[a-f0-9-]{36}$/);

for (const [settings, expectedLocal] of [
  [{ solo: false, mode: 'friends', localTransport: true }, true],
  [{ solo: false, mode: 'friends' }, false],
  [{ solo: false, localTransport: true }, false],
  [{ solo: false }, false],
  [{ solo: true }, true],
] as const) {
  let localCalls = 0;
  let nativeCalls = 0;
  const connection = createGameConnection(
    { ...settings, localUrl: 'ws://127.0.0.1/ws' } as ConnectionConfig,
    { name: 'Captain', pass: 'separate-password' },
    {
      createLocalSocket: () => {
        localCalls++;
        return { readyState: 0, close() {} } as WebSocket;
      },
      createNakamaClient: async () => {
        nativeCalls++;
        throw new Error('Unexpected native call');
      },
    },
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(localCalls, expectedLocal ? 1 : 0);
  assert.equal(nativeCalls, 0);
  if (!expectedLocal)
    assert.equal(connection.readyState, 3, 'Missing native config must fail closed');
  connection.close();
}
console.log(
  'Friend host configuration, origin denials, seeding isolation and transport selection passed.',
);
