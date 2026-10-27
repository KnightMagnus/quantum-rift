import { GAME_PROTOCOL, COMPATIBILITY_MESSAGE, supportedProtocol } from '../shared/protocol.ts';
import { HealthMonitor } from '../shared/health.ts';
export { denyUnsupportedIdentity, identityHooks } from './nakama-identity-gates.ts';
import { Game } from './game.ts';
import type { Session } from './game.ts';
import type { GameConnection, GamePlatform } from './game-platform.ts';
import { NakamaDatabase, nakamaStorageBackend } from './nakama-storage.ts';
import { NakamaCaptainAuth } from './nakama-auth.ts';
import type { GameAssets } from '../shared/rules.ts';
import assets from '../shared/assets.json' with { type: 'json' };
import { installGameClone } from './portable-clone.ts';
import { AuthorityCallbacks } from './authority-callbacks.ts';
import { findOrCreateWorld, worldAuthority } from './nakama-world-lease.ts';

import { INSTANCE_PLAYER_LIMIT } from '../shared/world-capacity.ts';
/** State remains inside one Nakama authoritative match context. */
export interface WorldState {
  game: Game<NakamaDatabase>;
  database: NakamaDatabase;
  auth: NakamaCaptainAuth;
  connections: Map<string, MatchConnection>;
  deferred: AuthorityCallbacks;
  dispatcher: nkruntime.MatchDispatcher;
  tick: number;
  leaseId: string;
  matchId: string;
  authorityReady: boolean;
}
/** Nakama exports state through Go maps between callbacks. A callable handle retains the
 * original objects in this match's dedicated VM instead of erasing class prototypes/Map methods.
 * No module-global authority or cross-VM state is used; durable state remains in PostgreSQL.
 */
export interface WorldHandle {
  world: () => WorldState;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function authFor(nk: nkruntime.Nakama): NakamaCaptainAuth {
  return new NakamaCaptainAuth(nakamaStorageBackend(nk), {
    bcryptHash: (password) => nk.bcryptHash(password),
    bcryptCompare: (password, hash) => nk.bcryptCompare(hash, password),
  });
}
/** The native hook strips all untrusted vars before Nakama signs a session token. */
export const beforeCaptainAuthentication: nkruntime.BeforeHookFunction<nkruntime.AuthenticateCustomRequest> =
  function beforeCaptainAuthentication(ctx, _logger, nk, request) {
    try {
      return authFor(nk).beforeAuthenticateCustom(request, ctx.clientIp || '?');
    } catch (error) {
      if (error instanceof Error && error.message === 'Authentication failed')
        throw { code: 16, message: 'Captain name or password was not accepted.' };
      throw error;
    }
  };

/** Return the one durable world; CAS prevents parallel RPCs from creating competing authorities. */
export const worldRpc: nkruntime.RpcFunction = function worldRpc(ctx, _logger, nk) {
  if (!ctx.userId) throw new Error('Authentication required');
  const backend = nakamaStorageBackend(nk);
  authFor(nk).captainForUser(ctx.userId, (id) => nk.accountGetId(id));
  const matchId = findOrCreateWorld(backend, {
    exists: (id) => !!nk.matchGet(id),
    create: (leaseId) => nk.matchCreate('qr_world', { leaseId }),
    retire: (id, leaseId) => {
      nk.matchSignal(id, 'stop:' + leaseId);
    },
    uuid: () => nk.uuidv4(),
    now: Date.now,
  });
  return JSON.stringify({ matchId, protocol: GAME_PROTOCOL });
};

/** Native match presence adapts targeted sends; it never owns a timer or input queue. */
export class MatchConnection implements GameConnection {
  open = true;
  readonly backlog = 0;
  readonly presence: nkruntime.Presence;
  session?: Session;
  lastSequence = 0;
  private state: WorldState;
  private messageListeners: Array<(message: string) => void> = [];
  private closeListeners: Array<() => void> = [];
  constructor(state: WorldState, presence: nkruntime.Presence) {
    this.state = state;
    this.presence = presence;
  }
  on(event: 'message', listener: (message: string) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'message' | 'close', listener: ((message: string) => void) | (() => void)): void {
    if (event === 'message') this.messageListeners.push(listener);
    else this.closeListeners.push(listener as () => void);
  }
  send(data: string | object): void {
    if (this.open)
      this.state.dispatcher.broadcastMessage(
        2,
        typeof data === 'string' ? data : JSON.stringify(data),
        [this.presence],
      );
  }
  receive(data: string): void {
    if (this.open) for (const listener of this.messageListeners) listener(data);
  }
  close(): void {
    if (!this.open) return;
    this.state.dispatcher.matchKick([this.presence]);
    this.left();
  }
  left(): void {
    if (!this.open) return;
    this.open = false;
    for (const listener of this.closeListeners) listener();
  }
}
/** Match contexts receive their first dispatcher in join-attempt before any clients connect. */
function inactiveDispatcher(): nkruntime.MatchDispatcher {
  return {
    broadcastMessage: () => {
      throw new Error('Match dispatcher unavailable');
    },
    broadcastMessageDeferred: () => {
      throw new Error('Match dispatcher unavailable');
    },
    matchKick: () => {
      throw new Error('Match dispatcher unavailable');
    },
    matchLabelUpdate: () => {
      throw new Error('Match dispatcher unavailable');
    },
  };
}
export const initializeWorld: nkruntime.MatchInitFunction<WorldHandle> = function initializeWorld(
  ctx,
  _logger,
  nk,
  params,
) {
  installGameClone();
  const leaseId: unknown = params.leaseId;
  const matchId = ctx.matchId;
  if (
    typeof leaseId !== 'string' ||
    typeof matchId !== 'string' ||
    worldAuthority(nakamaStorageBackend(nk), leaseId, matchId) === 'lost'
  )
    throw new Error('World reservation lost');
  const health = ctx.env?.RIFT_HEALTH === '1' ? new HealthMonitor() : undefined;
  const database = new NakamaDatabase(nakamaStorageBackend(nk), health);
  const deferred = new AuthorityCallbacks();
  const platform: GamePlatform = {
    health,
    automaticClock: false,
    seedDefinitions: [],
    randomUUID: () => nk.uuidv4(),
    defer: (callback, delayMs) => deferred.schedule(callback, delayMs),
  };
  const catalog: GameAssets = JSON.parse(JSON.stringify(assets));
  const game = new Game(catalog, database, platform);
  game.solo = false;
  if (worldAuthority(nakamaStorageBackend(nk), leaseId, matchId) === 'lost')
    throw new Error('World reservation lost during initialization');
  database.flush();
  const world: WorldState = {
    game,
    database,
    auth: authFor(nk),
    connections: new Map(),
    deferred,
    dispatcher: inactiveDispatcher(),
    tick: 0,
    leaseId,
    matchId,
    authorityReady: false,
  };
  return { state: { world: () => world }, tickRate: 30, label: 'quantum-rift-world-v1' };
};
export const attemptWorldJoin: nkruntime.MatchJoinAttemptFunction<WorldHandle> =
  function attemptWorldJoin(_ctx, _logger, nk, dispatcher, _tick, handle, presence, metadata) {
    const state = handle.world();
    state.dispatcher = dispatcher;
    const protocol = metadata?.protocol;
    if (protocol === undefined ? !supportedProtocol(undefined) : protocol !== String(GAME_PROTOCOL))
      return { state: handle, accept: false, rejectMessage: COMPATIBILITY_MESSAGE };
    if (
      state.database.economicFrozen ||
      worldAuthority(nakamaStorageBackend(nk), state.leaseId, state.matchId) !== 'ready'
    )
      return { state: handle, accept: false, rejectMessage: 'The world is unavailable.' };
    try {
      state.auth.captainForUser(presence.userId, (id) => nk.accountGetId(id));
    } catch {
      return { state: handle, accept: false, rejectMessage: 'Captain authentication required.' };
    }
    const replacing = [...state.connections.values()].some(
      (connection) => connection.presence.userId === presence.userId,
    );
    if (state.connections.size >= INSTANCE_PLAYER_LIMIT && !replacing)
      return { state: handle, accept: false, rejectMessage: 'This instance is full (30 players).' };
    return { state: handle, accept: true };
  };
export const joinWorld: nkruntime.MatchJoinFunction<WorldHandle> = function joinWorld(
  _ctx,
  _logger,
  nk,
  dispatcher,
  _tick,
  handle,
  presences,
) {
  const state = handle.world();
  state.dispatcher = dispatcher;
  for (const presence of presences) {
    let name: string;
    try {
      name = state.auth.captainForUser(presence.userId, (id) => nk.accountGetId(id));
    } catch {
      dispatcher.matchKick([presence]);
      continue;
    }
    const existing = state.connections.get(presence.sessionId);
    if (existing) {
      if (existing.presence.userId !== presence.userId) dispatcher.matchKick([presence]);
      continue;
    }
    // Replace only the same authenticated principal. Retire the prior connection
    // before admission so a full-instance reconnect never creates a 31st slot.
    for (const [sessionId, previous] of state.connections) {
      if (previous.presence.userId !== presence.userId) continue;
      previous.send({ t: 'error', msg: 'Signed in somewhere else.' });
      previous.close();
      state.connections.delete(sessionId);
    }
    // Several accepted attempts can arrive together before connections is updated.
    if (state.connections.size >= INSTANCE_PLAYER_LIMIT) {
      dispatcher.matchKick([presence]);
      continue;
    }
    const connection = new MatchConnection(state, presence);
    state.connections.set(presence.sessionId, connection);
    const sessionId = state.game.nextSid;
    state.game.connect(connection, 'nakama:' + presence.userId);
    const session = state.game.sessions.get(sessionId);
    if (!session) throw new Error('Game session registration failed');
    connection.session = session;
    session.inputScheduling = 'match';
    state.database.withAuthenticatedCaptain(name, () =>
      state.game.onMessage(session, {
        t: 'hello',
        name,
        pass: 'verified-nakama',
        protocol: GAME_PROTOCOL,
      }),
    );
    if (!session.data) connection.close();
  }
  state.database.flush();
  return { state: handle };
};
export const leaveWorld: nkruntime.MatchLeaveFunction<WorldHandle> = function leaveWorld(
  _ctx,
  _logger,
  _nk,
  dispatcher,
  _tick,
  handle,
  presences,
) {
  const state = handle.world();
  state.dispatcher = dispatcher;
  for (const presence of presences) {
    state.connections.get(presence.sessionId)?.left();
    state.connections.delete(presence.sessionId);
  }
  return { state: handle };
};
/** Only bounded, finite, plain JSON reaches the pre-existing authoritative action validators. */
function boundedData(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'string') return value.length <= 4096;
  if (Array.isArray(value))
    return value.length <= 1024 && value.every((entry) => boundedData(entry, depth + 1));
  if (!record(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length <= 128 &&
    keys.every(
      (key) =>
        !['__proto__', 'constructor', 'prototype'].includes(key) &&
        boundedData(value[key], depth + 1),
    )
  );
}
function validInput(packet: Record<string, unknown>, previous: number): boolean {
  if (
    !Number.isSafeInteger(packet.seq) ||
    typeof packet.seq !== 'number' ||
    packet.seq <= previous ||
    packet.seq > previous + 4096 ||
    packet.seq > 0x7fffffff
  )
    return false;
  for (const key of ['th', 'ab', 'rv', 'f1', 'f2']) {
    const value = packet[key];
    if (value !== undefined && value !== 0 && value !== 1 && value !== false && value !== true)
      return false;
  }
  return (
    (packet.tu === undefined || packet.tu === -1 || packet.tu === 0 || packet.tu === 1) &&
    (packet.nav === undefined || typeof packet.nav === 'boolean')
  );
}
export const advanceWorld: nkruntime.MatchLoopFunction<WorldHandle> = function advanceWorld(
  _ctx,
  logger,
  nk,
  dispatcher,
  tick,
  handle,
  messages,
) {
  const state = handle.world();
  state.dispatcher = dispatcher;
  state.tick = tick;
  if (!state.authorityReady) {
    const ownership = worldAuthority(nakamaStorageBackend(nk), state.leaseId, state.matchId);
    if (ownership === 'lost') return null;
    if (ownership === 'pending') return { state: handle };
    state.authorityReady = true;
  }
  const counts = new Map<string, number>();
  for (const message of messages) {
    const connection = state.connections.get(message.sender.sessionId);
    if (!connection?.open || connection.presence.userId !== message.sender.userId) continue;
    const count = (counts.get(message.sender.sessionId) || 0) + 1;
    counts.set(message.sender.sessionId, count);
    if (count > 8 || message.opCode !== 1 || message.data.byteLength > 8192) continue;
    const text = nk.binaryToString(message.data);
    let packet: unknown;
    try {
      packet = JSON.parse(text);
    } catch {
      continue;
    }
    if (
      !record(packet) ||
      typeof packet.t !== 'string' ||
      !boundedData(packet) ||
      packet.t === 'hello'
    )
      continue;
    if (packet.t === 'input') {
      if (!validInput(packet, connection.lastSequence)) continue;
      connection.lastSequence = Number(packet.seq);
    }
    connection.receive(text);
  }
  state.deferred.advance();
  try {
    state.game.tick();
    if (tick % 450 === 0) state.database.flush();
  } catch {
    logger.error('World tick failed; health counters contain no payloads.');
  }
  if (state.game.health && tick % 900 === 0)
    logger.info('World health: %s', JSON.stringify(state.game.health.report()));
  return { state: handle };
};
export const terminateWorld: nkruntime.MatchTerminateFunction<WorldHandle> =
  function terminateWorld(_ctx, _logger, _nk, dispatcher, _tick, handle) {
    const state = handle.world();
    state.dispatcher = dispatcher;
    for (const connection of state.connections.values()) connection.left();
    state.database.flush();
    return { state: handle };
  };
export const signalWorld: nkruntime.MatchSignalFunction<WorldHandle> = function signalWorld(
  _ctx,
  _logger,
  _nk,
  _dispatcher,
  _tick,
  handle,
  data,
) {
  const state = handle.world();
  if (!state.authorityReady && data === 'stop:' + state.leaseId) return null;
  return { state: handle, data: 'Quantum Rift authoritative world' };
};

// tools/build-nakama.ts emits the native InitModule and named global callback bridges.
