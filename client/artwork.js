// Keep restored catalog artwork separate from stale, cacheable pre-repair responses.
// A fallback also covers login before the status request has finished.
let revision = 'catalog-1';
export function setArtworkVersion(version) {
  revision = String(version);
}
export function artworkUrl(file) {
  return `assets/${file}${file.includes('?') ? '&' : '?'}v=${encodeURIComponent(revision)}`;
}
