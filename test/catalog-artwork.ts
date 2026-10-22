// Catalog URLs must bypass pre-repair HTTP caches without disabling release caching.
import assert from 'node:assert/strict';
import { artworkUrl, setArtworkVersion } from '../client/artwork.ts';
assert.equal(artworkUrl('ships/704_yard.png'), 'assets/ships/704_yard.png?v=catalog-1');
setArtworkVersion('2.8.3');
assert.equal(artworkUrl('icons/9020.png'), 'assets/icons/9020.png?v=2.8.3');
assert.equal(
  artworkUrl('ships/704_yard.png?view=yard'),
  'assets/ships/704_yard.png?view=yard&v=2.8.3',
);
setArtworkVersion('next release');
assert.equal(artworkUrl('icons/9020.png'), 'assets/icons/9020.png?v=next%20release');
console.log('Catalog URLs isolate old cached responses and encode release identity.');
