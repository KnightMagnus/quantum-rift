import type { IncomingMessage } from 'node:http';
import type { Socket as NodeNetSocket } from 'node:net';

// Minimal WebSocket server (RFC 6455) on top of Node's http module. No dependencies.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * RFC 6455 magic GUID constant appended to client Sec-WebSocket-Key to generate Sec-WebSocket-Accept.
 * @type {string}
 */
const GUID: string = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/**
 * Minimal RFC 6455 WebSocket connection wrapper built over Node's net.Socket.
 * Implements frame parsing, unmasking, fragmentation reassembly, and UTF-8 transmission.
 */
export class Socket extends EventEmitter {
  declare sock: NodeNetSocket;
  declare buf: Buffer;
  declare open: boolean;
  declare frag: Buffer[] | null;

  /**
   * Initializes a WebSocket connection around a raw TCP network socket.
   * @param {NodeNetSocket} socket Raw TCP network stream socket.
   */
  constructor(socket: NodeNetSocket) {
    super();

    this.sock = socket;

    this.buf = Buffer.alloc(0);

    this.open = true;

    this.frag = null;
    socket.setNoDelay(true);
    socket.on('data', (distance) => {
      this.buf = Buffer.concat([this.buf, distance as Buffer]);
      this.parse();
    });
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
  }

  /**
   * Transitions socket state to closed and emits the 'close' event once.
   * @returns {void}
   */
  closed(): void {
    if (this.open) {
      this.open = false;
      this.emit('close');
    }
  }

  /**
   * Parses inbound RFC 6455 WebSocket frames from the internal stream buffer and emits unmasked message events.
   * Enforces 1 MB frame size limit and responds to ping control frames automatically.
   * @returns {void}
   */
  parse(): void {
    while (this.buf.length >= 2) {
      const secondValue0 = this.buf[0],
        secondValue1 = this.buf[1],
        finalFrame = secondValue0 & 0x80,
        operation = secondValue0 & 0x0f,
        masked = secondValue1 & 0x80;
      let length2 = secondValue1 & 0x7f,
        offset = 2;
      if (length2 === 126) {
        if (this.buf.length < 4) return;
        length2 = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (length2 === 127) {
        if (this.buf.length < 10) return;
        length2 = Number(this.buf.readBigUInt64BE(2));
        offset = 10;
      }
      if (length2 > 1 << 20) {
        this.close();
        return;
      } // 1 MB frame limit
      const need = offset + (masked ? 4 : 0) + length2;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(offset + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.subarray(offset, offset + 4);
        payload = Buffer.from(payload);
        for (let index = 0; index < payload.length; index++) payload[index] ^= mask[index & 3];
      }
      this.buf = this.buf.subarray(need);
      if (operation === 0x8) {
        this.close();
        return;
      }
      if (operation === 0x9) {
        this.frame(0xa, payload);
        continue;
      }
      if (operation === 0xa) continue;
      if (operation === 0x1 || operation === 0x2) {
        if (finalFrame) this.emit('message', payload.toString('utf8'));
        else this.frag = [payload];
      } else if (operation === 0x0 && this.frag) {
        this.frag.push(payload);
        if (this.frag.reduce((count, secondValue) => count + secondValue.length, 0) > 1 << 20) {
          this.close();
          return;
        }
        if (finalFrame) {
          this.emit('message', Buffer.concat(this.frag).toString('utf8'));
          this.frag = null;
        }
      }
    }
  }

  /**
   * Constructs and writes an RFC 6455 binary frame to the client TCP stream.
   * @param {number} operation Opcode (0x1 text, 0x2 binary, 0x8 close, 0x9 ping, 0xa pong).
   * @param {Buffer} data Payload buffer to transmit.
   * @returns {void}
   */
  frame(operation: number, data: Buffer): void {
    if (!this.open) return;
    const length2 = data.length;
    let head;
    if (length2 < 126) {
      head = Buffer.alloc(2);
      head[1] = length2;
    } else if (length2 < 65536) {
      head = Buffer.alloc(4);
      head[1] = 126;
      head.writeUInt16BE(length2, 2);
    } else {
      head = Buffer.alloc(10);
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(length2), 2);
    }
    head[0] = 0x80 | operation;
    try {
      this.sock.write(Buffer.concat([head, data]));
    } catch {
      this.closed();
    }
  }

  /**
   * Serializes and transmits a text message or JSON object over the WebSocket connection.
   * @param {string | object} object UTF-8 string or JSON-serializable object payload.
   * @returns {void}
   */
  send(object: string | object): void {
    this.frame(
      0x1,
      Buffer.from(typeof object === 'string' ? object : JSON.stringify(object), 'utf8'),
    );
  }

  /**
   * Sends an RFC 6455 close control frame (0x8) and gracefully terminates the underlying TCP socket.
   * @returns {void}
   */
  close(): void {
    if (!this.open) return;
    try {
      this.frame(0x8, Buffer.alloc(0));
      this.sock.end();
    } catch {}
    this.closed();
  }

  /**
   * Number of buffered bytes waiting in the underlying TCP write queue.
   * @returns {number}
   */
  get backlog(): number {
    return this.sock.writableLength || 0;
  }
}

/**
 * Validates and upgrades an incoming HTTP 1.1 upgrade request to the RFC 6455 WebSocket protocol.
 * @param {IncomingMessage} incomingMessage Inbound HTTP upgrade request.
 * @param {NodeNetSocket} socket Underlying client network socket stream.
 * @param {(ws: Socket) => void} onSocket Callback invoked with the initialized WebSocket wrapper.
 * @returns {void}
 */
export function upgrade(
  incomingMessage: IncomingMessage,
  socket: NodeNetSocket,
  onSocket: (socket: Socket) => void,
): void {
  const header = incomingMessage.headers['sec-websocket-key'];
  if (!header || (incomingMessage.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(header + GUID)
    .digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      accept +
      '\r\n\r\n',
  );
  onSocket(new Socket(socket));
}
