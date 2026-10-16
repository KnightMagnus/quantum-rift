// Keep restored catalog artwork separate from stale, cacheable pre-repair responses.
// A fallback also covers login before the status request has finished.
let revision = 'catalog-1';

/**
 * Sets the active artwork cache-busting version string.
 * @param {string | number} version Artwork asset revision identifier.
 * @returns {void}
 */
export function setArtworkVersion(version) {
  revision = String(version);
}

/**
 * Formats an asset filename into a versioned URL.
 * @param {string} file Asset path relative to the assets directory.
 * @returns {string} Fully qualified asset URL with cache-busting query parameter.
 */
export function artworkUrl(file) {
  return `assets/${file}${file.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision)}`;
}
