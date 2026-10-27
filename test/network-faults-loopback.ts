import { requiredFixtureValue } from './helpers/required.ts';
// Real-TCP network faults: a loopback proxy delays, withholds, trickles and black-holes
// WebSocket traffic between Node's WebSocket client and the local game server.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { DB as Database } from '../server/db.ts';
import { Game, type Session } from '../server/game.ts';
import type { GamePlatform } from '../server/game-platform.ts';
import { upgrade, type LivenessTimings } from '../server/ws.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { GAME_PROTOCOL } from '../shared/protocol.ts';
import { tempDataDir } from './helpers/temp-data.ts';

const assets = JSON.parse(
  fileSystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const platform: GamePlatform = {
  automaticClock: false,
  seedDefinitions: [],
  randomUUID,
  defer: (callback) => callback(),
};
/** Short probe timings so a silent peer is detected within a bounded test wait. */
const liveness: LivenessTimings = { pingAfterMs: 100, deadAfterMs: 1000, checkEveryMs: 25 };
const captainName = 'Loopback Captain';
const waitLimitMs = 5000;

/** How the proxy treats bytes travelling in one direction. */
type LinkMode = 'forward' | 'hold' | 'blackhole' | 'trickle';

/** One proxied TCP connection with independently controlled directions. */
interface ProxyLink {
  /** Client-to-server direction. */
  upstream: LinkMode;
  /** Server-to-client direction. */
  downstream: LinkMode;
  /** Bytes withheld in each direction while held. */
  heldUpstream: Buffer[];
  heldDownstream: Buffer[];
  /** Added one-way latency in milliseconds for forwarded bytes. */
  latencyMs: number;
  /** Abruptly reset both TCP sockets, discarding anything withheld. */
  cut: () => void;
}

const game = new Game(assets, new Database(tempDataDir('rift-loopback-faults-')), platform);
const gameServer = http.createServer((_request, response) => response.end());
gameServer.on('upgrade', (request, duplex) =>
  upgrade(request, duplex as net.Socket, (socket) => game.connect(socket, 'loopback'), liveness),
);
await new Promise<void>((resolve) => gameServer.listen(0, '127.0.0.1', resolve));
const gamePort = (gameServer.address() as net.AddressInfo).port;

const links: ProxyLink[] = [];
const allSockets = new Set<net.Socket>();
function relay(link: ProxyLink, direction: 'upstream' | 'downstream', to: net.Socket) {
  return (chunk: Buffer) => {
    const mode = link[direction];
    if (mode === 'blackhole') return;
    if (mode === 'hold') {
      (direction === 'upstream' ? link.heldUpstream : link.heldDownstream).push(chunk);
      return;
    }
    const write = (bytes: Buffer) => {
      if (!to.destroyed) to.write(bytes);
    };
    const pieces =
      mode === 'trickle' ? [...chunk].map((byte) => Buffer.from([byte])) : [Buffer.from(chunk)];
    pieces.forEach((piece, index) =>
      setTimeout(() => write(piece), link.latencyMs + (mode === 'trickle' ? index : 0)),
    );
  };
}
const proxy = net.createServer((clientSide) => {
  const serverSide = net.connect(gamePort, '127.0.0.1');
  allSockets.add(clientSide).add(serverSide);
  const link: ProxyLink = {
    upstream: 'forward',
    downstream: 'forward',
    heldUpstream: [],
    heldDownstream: [],
    latencyMs: 0,
    cut: () => {
      link.heldUpstream = [];
      link.heldDownstream = [];
      clientSide.resetAndDestroy();
      serverSide.resetAndDestroy();
    },
  };
  links.push(link);
  clientSide.on('data', relay(link, 'upstream', serverSide));
  serverSide.on('data', relay(link, 'downstream', clientSide));
  // A black-holed link models a peer that vanished: neither side learns of the other's close.
  clientSide.on('close', () => link.upstream !== 'blackhole' && serverSide.destroy());
  serverSide.on('close', () => link.downstream !== 'blackhole' && clientSide.destroy());
  clientSide.on('error', () => {});
  serverSide.on('error', () => {});
});
await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
const proxyPort = (proxy.address() as net.AddressInfo).port;

async function waitFor(condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + waitLimitMs;
  while (!condition()) {
    if (Date.now() > deadline) assert.fail('timed out waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const pause = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/** A browser-equivalent client connected through its own proxy link. */
interface LoopbackClient {
  socket: WebSocket;
  link: ProxyLink;
  session: Session;
  received: Array<Record<string, unknown>>;
  send: (packet: Record<string, unknown>) => void;
  /** The newest captain record the server sent this client. */
  latestYou: () => { credits: number; mats: Record<string, number[]> } | undefined;
}
async function signIn(): Promise<LoopbackClient> {
  const knownSessions = new Set(game.sessions.keys());
  const socket = new WebSocket(`ws://127.0.0.1:${proxyPort}/ws`);
  const received: Array<Record<string, unknown>> = [];
  socket.addEventListener('message', (event) => received.push(JSON.parse(String(event.data))));
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  const link = requiredFixtureValue(links.at(-1));
  const send = (packet: Record<string, unknown>) => socket.send(JSON.stringify(packet));
  send({ t: 'hello', name: captainName, pass: 'fixture-pass', protocol: GAME_PROTOCOL });
  await waitFor(() => received.some((packet) => packet.t === 'you'), 'sign-in state');
  const session = requiredFixtureValue(
    [...game.sessions.values()].find((candidate) => !knownSessions.has(candidate.id)),
  );
  const latestYou = () =>
    received.filter((packet) => packet.t === 'you').at(-1)?.d as ReturnType<
      LoopbackClient['latestYou']
    >;
  return { socket, link, session, received, send, latestYou };
}

try {
  // Byte-at-a-time TCP delivery still dispatches each command exactly once.
  const first = await signIn();
  const captain = first.session.data;
  captain.credits = 200000;
  const homePort = STELLARS[requiredFixtureValue(captain.stellar)];
  const material = requiredFixtureValue(game.matsFor(homePort, captain)[0]);
  const owned = () => captain.mats[material.mat][material.grade];
  {
    first.link.upstream = 'trickle';
    const creditsBefore = captain.credits;
    const ownedBefore = owned();
    first.send({ t: 'buymat', mat: material.mat, grade: material.grade, n: 1 });
    await waitFor(() => owned() === ownedBefore + 1, 'trickled purchase');
    await pause(100);
    assert.equal(owned(), ownedBefore + 1, 'a trickled purchase applies once');
    assert.equal(captain.credits, creditsBefore - material.price);
    first.link.upstream = 'forward';
  }

  // The purchase reaches the server but its reply is lost: reconnecting shows it committed once.
  {
    const creditsBefore = captain.credits;
    const ownedBefore = owned();
    const repliesBefore = first.received.length;
    first.link.downstream = 'hold';
    first.send({ t: 'buymat', mat: material.mat, grade: material.grade, n: 2 });
    await waitFor(() => owned() === ownedBefore + 2, 'committed purchase');
    await waitFor(() => first.link.heldDownstream.length > 0, 'withheld reply');
    assert.equal(first.received.length, repliesBefore, 'the client never saw the settlement');
    first.link.cut();
    await waitFor(() => !game.sessions.has(first.session.id), 'server notices the reset');

    const second = await signIn();
    assert.equal(second.session.data, captain);
    assert.equal(second.latestYou()?.credits, creditsBefore - 2 * material.price);
    assert.equal(
      second.latestYou()?.mats[material.mat][material.grade],
      ownedBefore + 2,
      'the reconnected client sees the committed purchase exactly once',
    );

    // The request is lost in transit instead: nothing commits and the reconnect says so.
    const creditsBeforeLost = captain.credits;
    second.link.upstream = 'hold';
    second.send({ t: 'buymat', mat: material.mat, grade: material.grade, n: 5 });
    await waitFor(() => second.link.heldUpstream.length > 0, 'withheld request');
    second.link.cut();
    await waitFor(() => !game.sessions.has(second.session.id), 'server notices the reset');
    assert.equal(captain.credits, creditsBeforeLost, 'a request that never arrived spends nothing');

    // High latency is slow, not dead: pings answered within the limit keep the captain online.
    const third = await signIn();
    third.link.latencyMs = 120;
    await pause(liveness.deadAfterMs * 3);
    assert.equal(third.socket.readyState, WebSocket.OPEN, 'a slow link is not dropped');
    assert.ok(game.sessions.has(third.session.id), 'the slow session stays registered');
    const ownedBeforeSlow = owned();
    third.send({ t: 'buymat', mat: material.mat, grade: material.grade, n: 1 });
    await waitFor(
      () => third.latestYou()?.mats[material.mat][material.grade] === ownedBeforeSlow + 1,
      'delayed settlement',
    );
    assert.equal(third.latestYou()?.credits, captain.credits);
    third.link.latencyMs = 0;

    // The peer vanishes mid-flight without closing TCP: the server probes, gives up and docks.
    third.send({ t: 'depart' });
    await waitFor(() => !!third.session.ent, 'launch');
    third.send({ t: 'input', seq: 1, th: 1, tu: 1, f1: 1 });
    await waitFor(() => third.session.inputs.length > 0, 'live controls');
    const silencedAt = Date.now();
    third.link.upstream = 'blackhole';
    third.link.downstream = 'blackhole';
    await waitFor(() => !game.sessions.has(third.session.id), 'half-open peer detection');
    const detectionMs = Date.now() - silencedAt;
    assert.ok(
      detectionMs >= liveness.deadAfterMs - liveness.checkEveryMs,
      `a silent peer is given its full allowance (${detectionMs} ms)`,
    );
    assert.equal(third.session.ent, null, 'the vanished captain is removed from space');
    assert.ok(captain.stellar, 'the vanished captain is docked');
    assert.equal(
      third.socket.readyState,
      WebSocket.OPEN,
      'the fixture peer really never saw a close',
    );

    const fourth = await signIn();
    assert.equal(fourth.session.ent, null, 'reconnection restores the docked state');
    assert.equal(fourth.session.inputs.length, 0, 'reconnection carries no stale controls');
    assert.equal(fourth.session.lastInput, null);
    assert.ok(
      fourth.received.some((packet) => packet.t === 'landed'),
      'the client is told it is docked',
    );
    fourth.socket.close();
    third.socket.close();
  }
} finally {
  for (const socket of allSockets) socket.destroy();
  proxy.close();
  gameServer.close();
}

console.log(
  'Loopback network faults: trickled TCP dispatches once, lost replies and lost requests reconcile on reconnect, slow links stay connected, and half-open peers are probed, dropped and docked.',
);
