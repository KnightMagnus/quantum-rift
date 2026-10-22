// Verify actual shipped image headers for every currently offered outfit, not LFS placeholders.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { allOutfits, augmentAssets } from '../shared/rules.ts';
const A = augmentAssets(
  JSON.parse(fs.readFileSync(new URL('../shared/assets.json', import.meta.url))),
);
const outfits = Object.values(allOutfits(A));
for (const o of outfits) {
  assert.ok(o.icon, `${o.name}: icon route`);
  const bytes = fs.readFileSync(new URL('../client/assets/' + o.icon, import.meta.url));
  assert.deepEqual(
    bytes.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    `${o.name}: actual PNG, not a pointer`,
  );
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR');
  assert.equal(bytes.readUInt32BE(16), 256, `${o.name}: width`);
  assert.equal(bytes.readUInt32BE(20), 256, `${o.name}: height`);
  assert.equal(bytes[25], 6, `${o.name}: RGBA`);
}
console.log(`${outfits.length} outfitter icons are shipped 256×256 RGBA PNGs.`);
