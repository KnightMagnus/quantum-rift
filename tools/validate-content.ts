import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { augmentAssets } from '../shared/rules.ts';
import {
  hullSources,
  refitHullReferences,
  validateContentReferences,
  validateShipContent,
} from './content-validation.ts';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--asset-root' || !args[1])) {
  console.error('Usage: node tools/validate-content.ts [--asset-root directory]');
  process.exit(2);
}
const assetRoot = args[1] || fileURLToPath(new URL('../client/assets/', import.meta.url));
const rawAssets = JSON.parse(
  readFileSync(new URL('../shared/assets.json', import.meta.url), 'utf8'),
);
const sources = hullSources(Object.keys(rawAssets.ships));
const assets = augmentAssets(rawAssets);
const diagnostics = [
  ...validateShipContent(
    assets,
    (relativePath) => {
      try {
        return statSync(resolve(assetRoot, relativePath)).isFile();
      } catch {
        return false;
      }
    },
    sources,
  ),
  ...validateContentReferences(assets, refitHullReferences()),
];
for (const diagnostic of diagnostics)
  console.error(
    `${diagnostic.source ? diagnostic.source + ' ' : ''}${diagnostic.path}: ${diagnostic.message}`,
  );
if (diagnostics.length) {
  console.error(`Content validation failed: ${diagnostics.length} error(s).`);
  process.exitCode = 1;
} else console.log(`Content validation passed: ${Object.keys(assets.ships).length} ships.`);
