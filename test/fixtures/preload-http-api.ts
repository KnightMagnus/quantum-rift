// Isolated production-runtime instrumentation used only by its owning regression test.
import { preloadConfiguration } from '../helpers/preload-config.ts';
export interface PreloadConfig {
  tracePath: string;
}
const preloadConfig = preloadConfiguration<PreloadConfig>();
import fileSystem from 'node:fs';
globalThis.fetch = async () => {
  fileSystem.writeFileSync(preloadConfig.tracePath, 'unexpected');
  throw Error('No provider requests allowed');
};
