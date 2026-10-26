import { EventEmitter } from 'node:events';
import { Socket } from '../server/ws.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Game } from '../server/game.ts';
import { DB } from '../server/db.ts';
import { legacySocket } from './helpers/legacy-fixture.ts';
import { tempDataDir } from './helpers/temp-data.ts';
import { GAME_PROTOCOL, supportedProtocol } from '../shared/protocol.ts';

const directory = tempDataDir('rift-protocol-');
const database = new DB(directory);
const game = new Game(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
  database,
  {
    automaticClock: false,
    seedDefinitions: [],
    randomUUID,
    defer: (callback) => callback(),
  },
);
game.solo = true;
const connect = () => {
  const socket = legacySocket();
  socket.open = true;
  socket.backlog = 0;
  socket.out = [];
  socket.send = (data) => socket.out.push(typeof data === 'string' ? JSON.parse(data) : data);
  socket.close = () => {
    socket.open = false;
    socket.emit('close');
  };
  game.connect(socket);
  const session = [...game.sessions.values()].at(-1)!;
  return { socket, session };
};
for (const protocol of [2, 0, -1, '1', null, {}, []]) {
  assert.equal(supportedProtocol(protocol), false);
  const { socket, session } = connect();
  game.onMessage(session, { t: 'hello', name: 'Rejected Captain', protocol });
  game.onMessage(session, { t: 'hello', name: 'Rejected Captain', protocol: 1 });
  game.hello(session, { name: 'Rejected Captain', protocol: 1 });
  game.onMessage(session, { t: 'trade', c: 'food', n: 1 });
  assert.equal(session.data, null);
  assert.equal(socket.open, false);
  assert.match(socket.out[0].msg, /Refresh this page/);
  assert.equal(database.get('Rejected Captain'), null, 'denial must precede account creation');
}
for (const protocol of [GAME_PROTOCOL, undefined]) {
  const name = protocol === undefined ? 'Legacy Captain' : 'Current Captain';
  const { socket, session } = connect();
  game.onMessage(session, { t: 'hello', name, protocol });
  assert(session.data);
  assert(socket.out.some((packet) => packet.t === 'welcome'));
  session.data.credits = 765432;
  database.touch();
  database.flush();
  socket.close();
  const incompatible = connect();
  game.onMessage(incompatible.session, { t: 'hello', name, protocol: 2 });
  game.onMessage(incompatible.session, { t: 'trade', c: 'food', n: 1 });
  assert.equal(incompatible.session.data, null);
  assert.equal(
    new DB(directory).get(name)!.credits,
    765432,
    'committed progress survives rejected reconnect',
  );
  const restored = connect();
  game.onMessage(restored.session, { t: 'hello', name, protocol });
  assert.equal(restored.session.data.credits, 765432);
  restored.socket.close();
}
console.log(
  'Protocol compatibility: supported and legacy admission, malformed/future denial before login, committed progress and reconnect passed.',
);

class BufferedWire extends EventEmitter {
  writableLength = 0;
  ended = false;
  setNoDelay() {}
  write() {
    return true;
  }
  end() {
    this.ended = true;
  }
}
const wire = new BufferedWire();
const socket = new Socket(wire as unknown as import('node:net').Socket);
game.connect(socket);
const frame = (protocol: number) => {
  const payload = Buffer.from(JSON.stringify({ t: 'hello', name: 'Buffered Captain', protocol }));
  assert(payload.length < 126);
  return Buffer.concat([Buffer.from([0x81, 0x80 | payload.length, 0, 0, 0, 0]), payload]);
};
wire.emit('data', Buffer.concat([frame(2), frame(1)]));
assert.equal(wire.ended, true);
assert.equal(
  database.get('Buffered Captain'),
  null,
  'coalesced frames cannot revive a rejected socket',
);
assert.equal(
  [...game.sessions.values()].some((session) => session.name === 'Buffered Captain'),
  false,
);
