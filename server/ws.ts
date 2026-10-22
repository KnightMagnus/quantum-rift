import type { IncomingMessage } from 'node:http';
import type { Socket as NodeNetSocket } from 'node:net';

// Minimal WebSocket server (RFC 6455) on top of Node's http module. No dependencies.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/** @import { IncomingMessage } from 'node:http' */
/** @import { Socket as NodeNetSocket } from 'node:net' */

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
   * @param {NodeNetSocket} sock Raw TCP network stream socket.
   */
  constructor(sock: NodeNetSocket) {
    super();
    /** @type {NodeNetSocket} */
    this.sock = sock;
    /** @type {Buffer} */
    this.buf = Buffer.alloc(0);
    /** @type {boolean} */
    this.open = true;
    /** @type {Buffer[] | null} */
    this.frag = null;
    sock.setNoDelay(true);
    sock.on('data', (d) => {
      this.buf = Buffer.concat([this.buf, d as Buffer]);
      this.parse();
    });
    sock.on('close', () => this.closed());
    sock.on('error', () => this.closed());
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
      const b0 = this.buf[0],
        b1 = this.buf[1],
        fin = b0 & 0x80,
        op = b0 & 0x0f,
        masked = b1 & 0x80;
      let len = b1 & 0x7f,
        off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        len = Number(this.buf.readBigUInt64BE(2));
        off = 10;
      }
      if (len > 1 << 20) {
        this.close();
        return;
      } // 1 MB frame limit
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) {
        this.close();
        return;
      }
      if (op === 0x9) {
        this.frame(0xa, payload);
        continue;
      }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x2) {
        if (fin) this.emit('message', payload.toString('utf8'));
        else this.frag = [payload];
      } else if (op === 0x0 && this.frag) {
        this.frag.push(payload);
        if (this.frag.reduce((n, b) => n + b.length, 0) > 1 << 20) {
          this.close();
          return;
        }
        if (fin) {
          this.emit('message', Buffer.concat(this.frag).toString('utf8'));
          this.frag = null;
        }
      }
    }
  }

  /**
   * Constructs and writes an RFC 6455 binary frame to the client TCP stream.
   * @param {number} op Opcode (0x1 text, 0x2 binary, 0x8 close, 0x9 ping, 0xa pong).
   * @param {Buffer} data Payload buffer to transmit.
   * @returns {void}
   */
  frame(op: number, data: Buffer): void {
    if (!this.open) return;
    const len = data.length;
    let head;
    if (len < 126) {
      head = Buffer.alloc(2);
      head[1] = len;
    } else if (len < 65536) {
      head = Buffer.alloc(4);
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    head[0] = 0x80 | op;
    try {
      this.sock.write(Buffer.concat([head, data]));
    } catch {
      this.closed();
    }
  }

  /**
   * Serializes and transmits a text message or JSON object over the WebSocket connection.
   * @param {string | object} obj UTF-8 string or JSON-serializable object payload.
   * @returns {void}
   */
  send(obj: string | object): void {
    this.frame(0x1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'));
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
 * @param {IncomingMessage} req Inbound HTTP upgrade request.
 * @param {NodeNetSocket} sock Underlying client network socket stream.
 * @param {(ws: Socket) => void} onSocket Callback invoked with the initialized WebSocket wrapper.
 * @returns {void}
 */
export function upgrade(
  req: IncomingMessage,
  sock: NodeNetSocket,
  onSocket: (ws: Socket) => void,
): void {
  const key = req.headers['sec-websocket-key'];
  if (!key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    sock.destroy();
    return;
  }
  const accept = crypto
    .createHash('sha1')
    .update(key + GUID)
    .digest('base64');
  sock.write(
    'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' +
      accept +
      '\r\n\r\n',
  );
  onSocket(new Socket(sock));
}
