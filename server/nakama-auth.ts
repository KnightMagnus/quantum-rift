import { scrypt } from '@noble/hashes/scrypt.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { CaptainCredential, StorageBackend } from '../shared/nakama-contracts.ts';
import {
  nakamaUtf8,
  customCaptainId,
  captainFromCustomId,
  canonicalCaptain,
  credentialKey,
  NAKAMA_CUSTOM_PREFIX,
} from '../shared/nakama-contracts.ts';

/** Password hashing stays server-side; native Nakama bcrypt is used for all new hashes. */
export interface PasswordCrypto {
  bcryptHash(password: string): string;
  bcryptCompare(password: string, hash: string): boolean;
}
export interface CustomAuthRequest {
  account?: { id?: string; vars?: Record<string, string> };
  create?: boolean;
  username?: string;
}
interface Failure {
  misses: number;
  expires: number;
}
interface FailureBucket {
  entries: Record<string, Failure>;
}
const WINDOW_MS = 600_000;
const MAX_FAILURE_ENTRIES = 2048;
const AUTH_FAILURE_KEY = 'auth_failures_v1';
function denied(): never {
  throw new Error('Authentication failed');
}
function credential(value: unknown, canonical: string): CaptainCredential {
  const candidate = value as CaptainCredential;
  if (
    !candidate ||
    candidate.schema !== 1 ||
    candidate.canonical !== canonical ||
    typeof candidate.displayName !== 'string' ||
    canonicalCaptain(candidate.displayName) !== canonical ||
    !Number.isFinite(candidate.created) ||
    !candidate.password ||
    !['bcrypt', 'bcrypt-sha256', 'legacy-scrypt'].includes(candidate.password.kind) ||
    typeof candidate.password.hash !== 'string'
  )
    denied();
  if (
    candidate.password.kind === 'legacy-scrypt' &&
    (!/^[0-9a-f]{32}$/i.test(candidate.password.salt) ||
      !/^[0-9a-f]{64}$/i.test(candidate.password.hash))
  )
    denied();
  return candidate;
}
/** Node scryptSync's historical defaults, including UTF-8 encoding of the hexadecimal salt string. */
export function verifyLegacyPassword(password: string, salt: string, expected: string): boolean {
  if (!/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{64}$/i.test(expected)) return false;
  const actual = scrypt(nakamaUtf8(password), nakamaUtf8(salt), {
    N: 16384,
    r: 8,
    p: 1,
    dkLen: 32,
  });
  let difference = 0;
  for (let index = 0; index < 32; index++)
    difference |= actual[index] ^ parseInt(expected.slice(index * 2, index * 2 + 2), 16);
  return difference === 0;
}

/** Versioned SHA-256 hex prehash avoids bcrypt's 72-byte truncation/rejection without changing passwords. */
export function bcryptPasswordInput(password: string): string {
  return bytesToHex(sha256(nakamaUtf8(password)));
}

/** Durable bounded lockout; CAS failures deny the request rather than bypassing throttling. */
export class NakamaCaptainAuth {
  private backend: StorageBackend;
  private crypto: PasswordCrypto;
  private now: () => number;
  constructor(backend: StorageBackend, crypto: PasswordCrypto, now: () => number = Date.now) {
    this.backend = backend;
    this.crypto = crypto;
    this.now = now;
  }
  beforeAuthenticateCustom(request: CustomAuthRequest, ip: string): CustomAuthRequest {
    const password = request.account?.vars?.pass;
    const requestedName = request.account?.vars?.captainName;
    // Discard ALL client vars, not just pass: no alternate plaintext copy can become session vars.
    if (request.account) request.account.vars = {};
    if (
      typeof password !== 'string' ||
      password.length < 4 ||
      password.length > 4096 ||
      typeof request.account?.id !== 'string' ||
      !request.account.id.startsWith(NAKAMA_CUSTOM_PREFIX)
    )
      denied();
    let canonical: string;
    try {
      canonical = captainFromCustomId(request.account.id);
    } catch {
      denied();
    }
    if (requestedName !== undefined && canonicalCaptain(requestedName) !== canonical) denied();
    const keys = ['n:' + canonical, 'i:' + String(ip).slice(0, 128)];
    const savedFailures = this.backend.read(AUTH_FAILURE_KEY);
    const failures = (
      savedFailures ? JSON.parse(JSON.stringify(savedFailures.value)) : { entries: {} }
    ) as FailureBucket;
    if (!failures || !failures.entries || typeof failures.entries !== 'object') denied();
    const now = this.now();
    for (const key of Object.keys(failures.entries)) {
      const entry = failures.entries[key];
      if (!entry || !Number.isFinite(entry.expires) || entry.expires <= now)
        delete failures.entries[key];
    }
    for (const key of keys) if ((failures.entries[key]?.misses ?? 0) >= 6) denied();
    // Fail closed at capacity instead of evicting a victim's active lockout.
    if (
      Object.keys(failures.entries).length + keys.filter((key) => !failures.entries[key]).length >
      MAX_FAILURE_ENTRIES
    )
      denied();
    const saved = this.backend.read(credentialKey(canonical));
    if (!saved && password.length > 256) denied();
    let captain: CaptainCredential | null = null;
    let verified = false;
    if (saved) {
      captain = credential(saved.value, canonical);
      verified =
        captain.password.kind !== 'legacy-scrypt'
          ? this.crypto.bcryptCompare(
              captain.password.kind === 'bcrypt-sha256' ? bcryptPasswordInput(password) : password,
              captain.password.hash,
            )
          : verifyLegacyPassword(password, captain.password.salt, captain.password.hash);
    } else if (request.create !== false) {
      captain = {
        schema: 1,
        canonical,
        displayName:
          requestedName?.trim() || decodeURIComponent(request.account.id.slice(3)).trim(),
        created: now,
        password: {
          kind: 'bcrypt-sha256',
          hash: this.crypto.bcryptHash(bcryptPasswordInput(password)),
        },
      };
      // CAS name reservation is required BEFORE Nakama creates the custom-provider account.
      // A concurrent loser never authenticates using the winner's identity.
      try {
        this.backend.write(credentialKey(canonical), captain, '*');
        verified = true;
      } catch {
        denied();
      }
    }
    if (!verified || !captain) {
      for (const key of keys) {
        const previous = failures.entries[key];
        failures.entries[key] = {
          misses: (previous?.misses ?? 0) + 1,
          expires: previous?.expires ?? now + WINDOW_MS,
        };
      }
      this.backend.write(AUTH_FAILURE_KEY, failures, savedFailures?.version ?? '*');
      denied();
    }
    // Successful sign-ins never erase misses. A read-only success also cannot overwrite a racing failure.
    // Only failed attempts CAS-update this bounded counter, avoiding unrelated-login contention.
    if (captain.password.kind === 'legacy-scrypt') {
      const upgraded: CaptainCredential = {
        ...captain,
        password: {
          kind: 'bcrypt-sha256',
          hash: this.crypto.bcryptHash(bcryptPasswordInput(password)),
        },
      };
      this.backend.write(credentialKey(canonical), upgraded, saved!.version);
    }
    request.account.id = customCaptainId(canonical);
    // NK generates its own transport username; captain names may contain spaces/apostrophes.
    delete request.username;
    return request;
  }
  /** Resolve ownership from NK's server account, never from hello payload/session vars. */
  captainForUser(userId: string, accountGetId: (id: string) => { customId?: string }): string {
    const customId = accountGetId(userId).customId;
    if (!customId?.startsWith(NAKAMA_CUSTOM_PREFIX)) denied();
    const canonical = captainFromCustomId(customId);
    if (customId !== customCaptainId(canonical)) denied();
    const saved = this.backend.read(credentialKey(canonical));
    if (!saved) denied();
    return credential(saved.value, canonical).displayName;
  }
}

/** NK's bcryptCompare argument order differs from this password-first test port. */
export function nakamaPasswordCrypto(
  nk: Pick<nkruntime.Nakama, 'bcryptHash' | 'bcryptCompare'>,
): PasswordCrypto {
  return {
    bcryptHash: (password) => nk.bcryptHash(password),
    bcryptCompare: (password, hash) => nk.bcryptCompare(hash, password),
  };
}
