// Keep restored catalog artwork separate from stale, cacheable pre-repair responses.
// A fallback also covers login before the status request has finished.
let revision = 'catalog-1';

/**
 * Sets the active artwork cache-busting version string.
 * @param version Artwork asset revision identifier.
 */
export function setArtworkVersion(version: string | number): void {
  revision = String(version);
}

/**
 * Formats an asset filename into a versioned URL.
 * @param file Asset path relative to the assets directory.
 * @returns Fully qualified asset URL with cache-busting query parameter.
 */
export function artworkUrl(file: string): string {
  return `assets/${file}${file.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision)}`;
}
