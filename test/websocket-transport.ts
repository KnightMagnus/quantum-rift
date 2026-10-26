import { requiredFixtureValue } from './helpers/required.ts';
// Transport boundary regressions: real parser with a controlled duplex TCP surface.
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Socket, upgrade } from '../server/ws.ts';

class Wire extends EventEmitter {
  writes: Buffer[] = [];
  noDelay = false;
  failWrite = false;
  writableLength = 0;
  ended = false;
  destroyed = false;
  setNoDelay(value: boolean) {
    this.noDelay = value;
  }
  write(value: string | Uint8Array) {
    if (this.failWrite) throw Error('fixture write failure');
    this.writes.push(Buffer.from(value));
    return true;
  }
  end() {
    this.ended = true;
  }
  destroy() {
    this.destroyed = true;
  }
}

function clientFrame(text: string, { op: operation = 1, fin: isFinal = true } = {}) {
  const payload = Buffer.from(text);
  const length = payload.length;
  const header = Buffer.alloc(length < 126 ? 2 : length < 65536 ? 4 : 10);
  header[0] = (isFinal ? 128 : 0) | operation;
  header[1] = 128 | (length < 126 ? length : length < 65536 ? 126 : 127);
  if (header.length === 4) header.writeUInt16BE(length, 2);
  if (header.length === 10) header.writeBigUInt64BE(BigInt(length), 2);
  const mask = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
  const masked = payload.map((byte, index) => byte ^ mask[index % 4]);
  return Buffer.concat([header, mask, masked]);
}

function fixture() {
  const wire = new Wire();
  const socket = new Socket(wire as unknown as import('node:net').Socket);
  const messages: string[] = [];
  socket.on('message', (value) => messages.push(value));
  return { wire, socket, messages };
}

// RFC 6455 section 5.7's independently specified masked "Hello" frame.
{
  const { wire, messages } = fixture();
  const hello = Buffer.from('818537fa213d7f9f4d5158', 'hex');
  for (const byte of hello.subarray(0, -1)) wire.emit('data', Buffer.from([byte]));
  assert.deepEqual(
    messages,
    [] as typeof messages,
    'partial TCP bytes cannot dispatch a partial command',
  );
  wire.emit('data', hello.subarray(-1));
  assert.deepEqual(messages, ['Hello'], 'standard masked client frame decodes exactly once');
  assert.equal(wire.noDelay, true);
}

{
  const { wire, socket, messages } = fixture();
  wire.emit('data', clientFrame('hel', { fin: false }));
  wire.emit('data', clientFrame('probe', { op: 9 }));
  assert.deepEqual(messages, [] as typeof messages);
  assert.deepEqual(wire.writes[0], Buffer.from([0x8a, 5, ...Buffer.from('probe')]));
  wire.emit('data', clientFrame('lo', { op: 0 }));
  wire.emit('data', clientFrame('ignored pong', { op: 10 }));
  wire.emit('data', Buffer.concat([clientFrame('one'), clientFrame('two')]));
  assert.deepEqual(messages, ['hello', 'one', 'two']);
  assert.equal(socket.frag, null, 'completed fragments are released');
}

// Extended lengths and UTF-8 must survive independent TCP packet boundaries.
for (const size of [126, 65536]) {
  const { wire, socket, messages } = fixture();
  const text = 'x'.repeat(size - 4) + '🚀';
  const frame = clientFrame(text);
  wire.emit('data', frame.subarray(0, 3));
  wire.emit('data', frame.subarray(3, 9));
  wire.emit('data', frame.subarray(9));
  assert.deepEqual(messages, [text]);
  socket.send(text);
  const sent = wire.writes.at(-1);
  assert.equal(requiredFixtureValue(sent)[0], 0x81);
  assert.equal(
    requiredFixtureValue(sent)[1],
    size < 65536 ? 126 : 127,
    'server frames are unmasked',
  );
  const offset = size < 65536 ? 4 : 10;
  const length =
    offset === 4
      ? requiredFixtureValue(sent).readUInt16BE(2)
      : Number(requiredFixtureValue(sent).readBigUInt64BE(2));
  assert.equal(length, size);
  assert.equal(requiredFixtureValue(sent).subarray(offset).toString(), text);
}

{
  const { wire, socket } = fixture();
  socket.send({ t: 'snap', x: 7 });
  assert.equal(wire.writes[0].subarray(2).toString(), '{"t":"snap","x":7}');
  wire.writableLength = 4096;
  assert.equal(socket.backlog, 4096, 'game sees queued bytes for backpressure gating');
  let closed = 0;
  socket.on('close', () => closed++);
  wire.emit('data', clientFrame('', { op: 8 }));
  wire.emit('close');
  wire.emit('error', Error('late close'));
  socket.close();
  socket.send('must not write');
  assert.equal(closed, 1);
  assert.equal(socket.open, false);
  assert.equal(wire.ended, true);
  assert.deepEqual(wire.writes.at(-1), Buffer.from([0x88, 0]));
  assert.equal(wire.writes.length, 2, 'no messages are written after close');
}

// A server close only half-closes TCP; frames the peer sends afterwards never dispatch.
{
  const { wire, socket, messages } = fixture();
  wire.emit('data', clientFrame('before'));
  socket.close();
  assert.equal(wire.ended, true);
  wire.emit('data', clientFrame('{"t":"buymat"}'));
  wire.emit('data', Buffer.concat([clientFrame('late one'), clientFrame('late two')]));
  assert.deepEqual(messages, ['before'], 'frames after close are discarded');
}
{
  const { wire, messages } = fixture();
  wire.emit('data', Buffer.concat([clientFrame('', { op: 8 }), clientFrame('same packet')]));
  assert.deepEqual(messages, [] as typeof messages, 'a frame behind the close frame is discarded');
}

for (const aggregate of [false, true]) {
  const { wire, socket, messages } = fixture();
  if (aggregate) {
    wire.emit('data', clientFrame('a'.repeat(600000), { fin: false }));
    wire.emit('data', clientFrame('b'.repeat(600000), { op: 0 }));
  } else {
    const header = Buffer.from('817f0000000000100001', 'hex');
    wire.emit('data', header); // Advertise >1 MiB without sending the payload.
  }
  assert.equal(socket.open, false, 'oversized frame/message closes before command dispatch');
  assert.deepEqual(messages, [] as typeof messages);
}

{
  const { wire, socket } = fixture();
  let closed = 0;
  socket.on('close', () => closed++);
  wire.failWrite = true;
  socket.send('failure');
  wire.emit('close');
  assert.equal(closed, 1, 'write failures close the logical connection exactly once');
}

{
  const wire = new Wire();
  let accepted: Socket | undefined;
  upgrade(
    {
      headers: { upgrade: 'WebSocket', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==' },
    } as import('node:http').IncomingMessage,
    wire as unknown as import('node:net').Socket,
    (socket) => (accepted = socket),
  );
  assert.ok(accepted instanceof Socket);
  assert.match(wire.writes[0].toString(), /^HTTP\/1\.1 101 Switching Protocols\r\n/);
  assert.match(
    wire.writes[0].toString(),
    /Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK\+xOo=\r\n/,
  );
  for (const headers of [{}, { upgrade: 'not-websocket', 'sec-websocket-key': 'a' }]) {
    const rejected = new Wire();
    upgrade(
      { headers } as import('node:http').IncomingMessage,
      rejected as unknown as import('node:net').Socket,
      () => assert.fail('invalid handshake accepted'),
    );
    assert.equal(rejected.destroyed, true);
    assert.equal(rejected.writes.length, 0);
  }
}

console.log(
  'WebSocket transport: masking, TCP splits, fragments/control frames, lengths/UTF-8, limits, close/late frames/backpressure and handshake PASS',
);
