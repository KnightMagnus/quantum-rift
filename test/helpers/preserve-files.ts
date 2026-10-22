// Opt-in verification preload: retain removed fixtures by renaming, never deleting.
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

if (process.env.RIFT_PRESERVE_FILES) {
  const directory = path.resolve(process.env.RIFT_PRESERVE_FILES);
  fs.mkdirSync(directory, { recursive: true });
  let sequence = 0;
  const preserve = (filename: fs.PathLike, options?: fs.RmOptions): void => {
    const source = filename instanceof URL ? fileURLToPath(filename) : String(filename);
    if (!fs.existsSync(source)) {
      if (options?.force) return;
      const error = new Error('ENOENT: ' + source) as NodeJS.ErrnoException;
      error.code = 'ENOENT';
      throw error;
    }
    const target = path.join(
      directory,
      process.pid + '-' + Date.now() + '-' + sequence++ + '-' + path.basename(source),
    );
    fs.renameSync(source, target);
  };
  fs.rmSync = preserve;
  fs.unlinkSync = (filename) => preserve(filename);
  fs.rmdirSync = (filename) => preserve(filename);
  fs.promises.rm = async (filename, options) => preserve(filename, options);
  fs.promises.unlink = async (filename) => preserve(filename);
  syncBuiltinESMExports();
}
