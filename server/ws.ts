import type { IncomingMessage } from 'node:http';
import type { Socket as NodeNetSocket } from 'node:net';

// Minimal WebSocket server (RFC 6455) on top of Node's http module. No dependencies.
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

/**
 * RFC 6455 magic GUID constant appended to client Sec-WebSocket-Key to generate Sec-WebSocket-Accept.
 */
const GUID: string = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Quiet-peer probing that detects connections whose peer vanished without closing TCP. */
export interface LivenessTimings {
  /** Milliseconds without inbound bytes before each liveness check sends a ping. */
  pingAfterMs: number;
  /** Milliseconds without inbound bytes before the peer is treated as gone and the socket closes. */
  deadAfterMs: number;
  /** Milliseconds between liveness checks. */
  checkEveryMs: number;
}

/**
 * Browsers answer pings without page code, so an idle docked captain stays connected.
 * A half-open peer (dropped Wi-Fi, sleeping laptop, NAT timeout) is closed within
 * about 50 seconds instead of waiting minutes for TCP retransmission to give up.
 */
export const DEFAULT_LIVENESS: LivenessTimings = {
  pingAfterMs: 15000,
  deadAfterMs: 45000,
  checkEveryMs: 5000,
};

/**
 * Minimal RFC 6455 WebSocket connection wrapper built over Node's net.Socket.
 * Implements frame parsing, unmasking, fragmentation reassembly, and UTF-8 transmission.
 */
export class Socket extends EventEmitter {
  declare sock: NodeNetSocket;
  declare buf: Buffer;
  declare open: boolean;
  declare frag: Buffer[] | null;
  /** Clock reading when the peer last sent any bytes, including pongs. */
  declare lastHeard: number;
  /** Quiet-peer probe timings; absent for sockets without a remote peer to probe. */
  declare liveness: LivenessTimings | undefined;
  declare clock: () => number;
  declare livenessTimer: ReturnType<typeof setInterval> | undefined;

  /**
   * Initializes a WebSocket connection around a raw TCP network socket.
   * @param socket Raw TCP network stream socket.
   * @param liveness Quiet-peer probe timings; omitted, the socket never probes or times out.
   * @param clock Millisecond clock used for quiet-peer checks.
   */
  constructor(socket: NodeNetSocket, liveness?: LivenessTimings, clock: () => number = Date.now) {
    super();

    this.sock = socket;

    this.liveness = liveness;

    this.clock = clock;

    this.lastHeard = clock();

    this.buf = Buffer.alloc(0);

    this.open = true;

    this.frag = null;
    socket.setNoDelay(true);
    socket.on('data', (distance) => {
      if (!this.open) return;
      this.lastHeard = this.clock();
      this.buf = Buffer.concat([this.buf, distance as Buffer]);
      this.parse();
    });
    socket.on('close', () => this.closed());
    socket.on('error', () => this.closed());
    if (liveness) {
      this.livenessTimer = setInterval(() => this.checkLiveness(), liveness.checkEveryMs);
      this.livenessTimer.unref?.();
    }
  }

  /**
   * Pings a quiet peer, and closes the connection once the peer has been silent too long.
   * Closing emits 'close', so the game docks a flying captain and frees the session.
   */
  checkLiveness(): void {
    if (!this.open || !this.liveness) return;
    const quietMs = this.clock() - this.lastHeard;
    if (quietMs >= this.liveness.deadAfterMs) {
      // No close handshake: the peer cannot answer it, and end() would wait on the dead link.
      this.sock.destroy();
      this.closed();
      return;
    }
    if (quietMs >= this.liveness.pingAfterMs) this.frame(0x9, Buffer.alloc(0));
  }

  /**
   * Transitions socket state to closed and emits the 'close' event once.
   */
  closed(): void {
    if (this.open) {
      this.open = false;
      clearInterval(this.livenessTimer);
      this.buf = Buffer.alloc(0);
      this.frag = null;
      this.emit('close');
    }
  }

  /**
   * Parses inbound RFC 6455 WebSocket frames from the internal stream buffer and emits unmasked message events.
   * Enforces 1 MB frame size limit and responds to ping control frames automatically.
   */
  parse(): void {
    // Our close frame only half-closes TCP; bytes the peer sends afterwards are discarded.
    while (this.open && this.buf.length >= 2) {
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
   * @param operation Opcode (0x1 text, 0x2 binary, 0x8 close, 0x9 ping, 0xa pong).
   * @param data Payload buffer to transmit.
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
   * @param object UTF-8 string or JSON-serializable object payload.
   */
  send(object: string | object): void {
    this.frame(
      0x1,
      Buffer.from(typeof object === 'string' ? object : JSON.stringify(object), 'utf8'),
    );
  }

  /**
   * Sends an RFC 6455 close control frame (0x8) and gracefully terminates the underlying TCP socket.
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
   */
  get backlog(): number {
    return this.sock.writableLength || 0;
  }
}

/**
 * Validates and upgrades an incoming HTTP 1.1 upgrade request to the RFC 6455 WebSocket protocol.
 * @param incomingMessage Inbound HTTP upgrade request.
 * @param socket Underlying client network socket stream.
 * @param onSocket Callback invoked with the initialized WebSocket wrapper.
 * @param liveness Quiet-peer probe timings for the upgraded connection.
 */
export function upgrade(
  incomingMessage: IncomingMessage,
  socket: NodeNetSocket,
  onSocket: (socket: Socket) => void,
  liveness: LivenessTimings = DEFAULT_LIVENESS,
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
  onSocket(new Socket(socket, liveness));
}
