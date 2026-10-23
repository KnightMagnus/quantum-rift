/** Namespace accepted by the password-verifying custom authentication hook. */
export const NAKAMA_CUSTOM_PREFIX = 'qr:';
export const NAKAMA_COLLECTION = 'qr_server';
export const NAKAMA_CHECKPOINT_KEY = 'authoritative_world_v1';
/** Synchronous system-owned JSON storage with optimistic concurrency. */
export interface StorageBackend {
  read(key: string): { value: unknown; version: string } | null;
  write(key: string, value: object, version: string): string;
}
/** Credentials have a separate write domain from the gameplay checkpoint. */
export interface CaptainCredential {
  schema: 1;
  canonical: string;
  displayName: string;
  created: number;
  password:
    | { kind: 'bcrypt' | 'bcrypt-sha256'; hash: string }
    | { kind: 'legacy-scrypt'; salt: string; hash: string };
  migrationId?: string;
}
/** Match the existing game's captain-name language and forbidden object keys. */
export function canonicalCaptain(name: string): string {
  const trimmed = name.trim();
  if (
    !/^[A-Za-z0-9 _'-]{3,20}$/.test(trimmed) ||
    /^(?:__proto__|constructor|prototype|hasownproperty|tostring|valueof)$/i.test(trimmed)
  ) {
    throw new Error('Invalid captain name');
  }
  return trimmed.toLowerCase();
}
export function credentialKey(canonical: string): string {
  return 'credential:' + canonicalCaptain(canonical);
}

/** UTF-8 without TextEncoder (Nakama's Goja runtime has no browser encoding globals). */
export function nakamaUtf8(text: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < text.length; index++) {
    let point = text.charCodeAt(index);
    if (point >= 0xd800 && point <= 0xdbff) {
      const low = text.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        point = 0x10000 + ((point - 0xd800) << 10) + low - 0xdc00;
        index++;
      } else point = 0xfffd;
    } else if (point >= 0xdc00 && point <= 0xdfff) point = 0xfffd;
    if (point < 0x80) bytes.push(point);
    else if (point < 0x800) bytes.push(0xc0 | (point >> 6), 0x80 | (point & 63));
    else if (point < 0x10000)
      bytes.push(0xe0 | (point >> 12), 0x80 | ((point >> 6) & 63), 0x80 | (point & 63));
    else
      bytes.push(
        0xf0 | (point >> 18),
        0x80 | ((point >> 12) & 63),
        0x80 | ((point >> 6) & 63),
        0x80 | (point & 63),
      );
  }
  return new Uint8Array(bytes);
}

/** Native custom IDs cannot contain spaces; encoding changes transport identity, not captain names. */
export function customCaptainId(name: string): string {
  return NAKAMA_CUSTOM_PREFIX + encodeURIComponent(canonicalCaptain(name));
}
/** Decode only the dedicated custom-provider namespace; canonical validation rejects controls and double encoding. */
export function captainFromCustomId(customId: string): string {
  if (!customId.startsWith(NAKAMA_CUSTOM_PREFIX)) throw new Error('Invalid captain identity');
  return canonicalCaptain(decodeURIComponent(customId.slice(NAKAMA_CUSTOM_PREFIX.length)));
}

/** Native APIs outside the game's immutable captain/password identity contract. */
export const BLOCKED_IDENTITY_HOOKS = [
  'registerBeforeAuthenticateApple',
  'registerBeforeAuthenticateDevice',
  'registerBeforeAuthenticateEmail',
  'registerBeforeAuthenticateFacebook',
  'registerBeforeAuthenticateFacebookInstantGame',
  'registerBeforeAuthenticateGameCenter',
  'registerBeforeAuthenticateGoogle',
  'registerBeforeAuthenticateSteam',
  'registerBeforeLinkApple',
  'registerBeforeLinkCustom',
  'registerBeforeLinkDevice',
  'registerBeforeLinkEmail',
  'registerBeforeLinkFacebook',
  'registerBeforeLinkFacebookInstantGame',
  'registerBeforeLinkGameCenter',
  'registerBeforeLinkGoogle',
  'registerBeforeLinkSteam',
  'registerBeforeUnlinkApple',
  'registerBeforeUnlinkCustom',
  'registerBeforeUnlinkDevice',
  'registerBeforeUnlinkEmail',
  'registerBeforeUnlinkFacebook',
  'registerBeforeUnlinkFacebookInstantGame',
  'registerBeforeUnlinkGameCenter',
  'registerBeforeUnlinkGoogle',
  'registerBeforeUnlinkSteam',
] as const;
