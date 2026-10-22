// Verify actual shipped image headers for every currently offered outfit, not LFS placeholders.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import { allOutfits, augmentAssets } from '../shared/rules.ts';
const assets = augmentAssets(
  JSON.parse(filesystem.readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8')),
);
const outfits = Object.values(allOutfits(assets));
for (const options of outfits) {
  assert.ok(options.icon, `${options.name}: icon route`);
  const bytes = filesystem.readFileSync(
    new URL('../client/assets/' + options.icon, import.meta.url),
  );
  assert.deepEqual(
    bytes.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    `${options.name}: actual PNG, not a pointer`,
  );
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), 256, `${options.name}: width`);
  assert.equal(bytes.readUInt32BE(20), 256, `${options.name}: height`);
  assert.equal(bytes[25], 6, `${options.name}: RGBA`);
}
console.log(`${outfits.length} outfitter icons are shipped 256×256 RGBA PNGs.`);
