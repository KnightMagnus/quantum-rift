import { isIP } from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { networkInterfaces } from 'node:os';
import { assertSeparateFriendStore } from './friend-save-owner.ts';
import type { GamePlatform } from './game-platform.ts';

/** Validated settings for the explicitly selected Node friend authority. */
export interface FriendHostConfig {
  /** Literal IP address; exposure requires an explicit owner setting. */
  bind: string;
  /** HTTP and WebSocket port. */
  port: number;
  /** Persistent friend world, never the Solo or native store by default. */
  dataDirectory: string;
  /** Optional browser-facing origin when using a manually configured proxy. */
  publicOrigin?: string;
}

/** Parse an origin, not a URL with credentials, paths, queries or fragments. */
export function parseFriendOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('HOST_PUBLIC_ORIGIN must be an HTTP(S) origin.');
  }
  if (
    !/^https?:\/\/[^/?#\s\\]+\/?$/.test(value) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    url.origin === 'null'
  )
    throw new Error(
      'HOST_PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, path, query or fragment.',
    );
  return url.origin;
}

/** Reject ambiguous flags, developer fixtures and unsafe implicit listener settings. */
export function friendHostConfig(environment: NodeJS.ProcessEnv, root: string): FriendHostConfig {
  if (environment.HOST_FRIENDS !== '1') throw new Error('Friend hosting requires HOST_FRIENDS=1.');
  if (environment.SOLO) throw new Error('Friend hosting and Solo cannot run together.');
  if (environment.SEEDS_FILE || environment.INVASION_NOW)
    throw new Error('Developer seeding and invasion overrides are unavailable in friend games.');
  const bind = environment.HOST_BIND ?? '127.0.0.1';
  if (!isIP(bind)) throw new Error('HOST_BIND must be a literal IPv4 or IPv6 address.');
  const rawPort = environment.PORT ?? '8080';
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be a whole number from 1 to 65535.');
  if (environment.DATA_DIR)
    throw new Error('Use FRIEND_DATA_DIR for friend saves, not the Solo/reference DATA_DIR.');
  const dataDirectory = path.resolve(root, environment.FRIEND_DATA_DIR || 'friend-data');
  assertSeparateFriendStore(dataDirectory, root);
  return {
    bind,
    port,
    dataDirectory,
    publicOrigin:
      environment.HOST_PUBLIC_ORIGIN === undefined
        ? undefined
        : parseFriendOrigin(environment.HOST_PUBLIC_ORIGIN),
  };
}

/** HTTP authorities are local literals or the explicitly configured proxy authority, never arbitrary DNS. */
export function friendHostAllowed(host: string | undefined, config: FriendHostConfig): boolean {
  if (!host) return false;
  try {
    const authority = new URL(parseFriendOrigin('http://' + host));
    if (config.publicOrigin && authority.host === new URL(config.publicOrigin).host) return true;
    if (Number(authority.port || 80) !== config.port) return false;
    const hostname = authority.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (hostname === 'localhost') return true;
    if (!isIP(hostname) || hostname === '0.0.0.0' || hostname === '::') return false;
    if (hostname === config.bind || hostname === '127.0.0.1' || hostname === '::1') return true;
    return Object.values(networkInterfaces()).some((addresses) =>
      addresses?.some((address) => address.address.toLowerCase() === hostname),
    );
  } catch {
    return false;
  }
}

/** Browser sockets must originate here or at the explicitly configured public origin.
 * Forwarded host/protocol headers are deliberately not trusted. Missing Origin is denied.
 */
export function friendOriginAllowed(
  origin: string | undefined,
  host: string | undefined,
  secure: boolean,
  publicOrigin?: string,
  config?: FriendHostConfig,
): boolean {
  if (!origin || !host) return false;
  const requestConfig = config ?? {
    bind: '127.0.0.1',
    port: 8080,
    dataDirectory: '',
    publicOrigin,
  };
  if (!friendHostAllowed(host, requestConfig)) return false;
  try {
    const normalized = parseFriendOrigin(origin);
    const requestOrigin = parseFriendOrigin((secure ? 'https://' : 'http://') + host);
    return normalized === requestOrigin || normalized === publicOrigin;
  } catch {
    return false;
  }
}

/** One Node clock and no developer accounts, independently of optional seed files. */
export function friendGamePlatform(): GamePlatform {
  return {
    seedDefinitions: [],
    automaticClock: true,
    startClock: (callback, intervalMs) => {
      setInterval(callback, intervalMs);
    },
    defer: (callback, delayMs) => {
      setTimeout(callback, delayMs);
    },
    randomUUID: () => crypto.randomUUID(),
  };
}
