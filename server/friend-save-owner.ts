import fs from 'node:fs';
import path from 'node:path';

/** Resolve existing ancestors too, so a not-yet-created leaf cannot hide a Solo alias. */
export function canonicalSavePath(directory: string): string {
  const absolute = path.resolve(directory);
  try {
    return fs.realpathSync.native(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const parent = path.dirname(absolute);
    if (parent === absolute) throw error;
    return path.join(canonicalSavePath(parent), path.basename(absolute));
  }
}

/** Disallow overlapping stores, including parents and symlinked ancestors. */
export function assertSeparateFriendStore(directory: string, root: string): void {
  const candidate = canonicalSavePath(directory);
  for (const name of ['data', 'solo-data']) {
    const protectedPath = canonicalSavePath(path.join(root, name));
    const overlaps = (first: string, second: string) => {
      const relative = path.relative(first, second);
      return (
        relative === '' ||
        (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
      );
    };
    if (overlaps(candidate, protectedPath) || overlaps(protectedPath, candidate))
      throw new Error(
        'Friend saves must use a separate directory from Solo and native/reference saves.',
      );
  }
}

/** Tighten existing checkpoints and backups without following links out of the store. */
function privatize(directory: string): void {
  fs.chmodSync(directory, 0o700);
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    const stats = fs.lstatSync(file);
    if (stats.isSymbolicLink() || (!stats.isFile() && !stats.isDirectory()))
      throw new Error('Friend save store contains a link or special file: ' + file);
    if (stats.isDirectory()) privatize(file);
    else {
      if (stats.nlink !== 1)
        throw new Error('Friend save store contains a hard-linked file: ' + file);
      fs.chmodSync(file, 0o600);
    }
  }
}

/** Exclusive cross-process ownership. Stale locks require explicit operator recovery. */
export function acquireFriendSaveOwner(directory: string, root: string): () => void {
  process.umask(0o077);
  assertSeparateFriendStore(directory, root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const canonical = fs.realpathSync.native(directory);
  assertSeparateFriendStore(canonical, root);
  fs.chmodSync(canonical, 0o700);
  const lock = path.join(canonical, '.friend-host.lock');
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    throw new Error(
      'Friend save directory is already owned or has a stale lock: ' +
        lock +
        '. Stop every host using this save directory. If a host crashed, verify no process on any machine is using it, back up the save directory, then manually remove only .friend-host.lock and retry. Locks are never deleted automatically.',
    );
  }
  // Keep the lock after any startup/flush failure: uncertain recovery must fail closed.
  fs.writeFileSync(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, started: new Date().toISOString() }),
    { mode: 0o600 },
  );
  privatize(canonical);
  const identity = fs.statSync(lock);
  let released = false;
  return () => {
    if (released) return;
    const current = fs.lstatSync(lock);
    if (current.dev !== identity.dev || current.ino !== identity.ino || !current.isDirectory())
      throw new Error('Friend save ownership changed; refusing to remove its lock.');
    fs.unlinkSync(path.join(lock, 'owner.json'));
    fs.rmdirSync(lock);
    released = true;
  };
}
