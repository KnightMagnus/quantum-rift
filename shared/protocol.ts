/** Wire compatibility epoch, independent of package or artwork versions. */
export const GAME_PROTOCOL = 1;
/** Released clients without an identifier use the unchanged first wire contract. */
export const LEGACY_GAME_PROTOCOL = 1;
/** A manual action avoids reload loops while a host is updating. */
export const COMPATIBILITY_MESSAGE =
  'This game page and server need different updates. Refresh this page. If that does not help, update the game or ask the host to update, then try again.';

/** Missing identifiers are the supported legacy contract; malformed values fail closed. */
export function supportedProtocol(protocol: unknown): boolean {
  return (protocol === undefined ? LEGACY_GAME_PROTOCOL : protocol) === GAME_PROTOCOL;
}
