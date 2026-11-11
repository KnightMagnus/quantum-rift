import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Lock owner lifecycle recorded in `owner.json`. */
type FriendSaveOwnerState = 'starting' | 'running' | 'needs-recovery';

/** Contents of `.friend-host.lock/owner.json`. */
interface FriendSaveOwnerRecord {
  /** Process ID of the host that created the lock. */
  pid: number;
  /** Machine name of that host; a PID only means something on the same machine. */
  host: string;
  /** Only a lock left while `running` may be cleared automatically. */
  state: FriendSaveOwnerState;
  /** ISO time the lock was created. */
  started: string;
}

/** Cross-process ownership of one friend save directory. */
export interface FriendSaveOwner {
  /** The world is loaded and serving: a crash from here on leaves a lock that can be cleared once its process is gone. */
  markRunning(): void;
  /** Saving failed: keep the lock for manual recovery even after this process exits. */
  markNeedsRecovery(): void;
  /** Remove this host's lock after a clean save; idempotent. */
  release(): void;
}

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

/** Whether a process with this ID exists on this machine; permission errors count as alive. */
function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ESRCH';
  }
}

/** Parse an owner record, or return null when any field is missing or malformed. */
function readOwnerRecord(lock: string): { text: string; record: FriendSaveOwnerRecord } | null {
  const file = path.join(lock, 'owner.json');
  try {
    if (!fs.lstatSync(file).isFile()) return null;
    const text = fs.readFileSync(file, 'utf8');
    const record = JSON.parse(text) as Partial<FriendSaveOwnerRecord>;
    if (
      !Number.isSafeInteger(record.pid) ||
      (record.pid as number) <= 0 ||
      typeof record.host !== 'string' ||
      typeof record.started !== 'string' ||
      !['starting', 'running', 'needs-recovery'].includes(record.state as string)
    )
      return null;
    return { text, record: record as FriendSaveOwnerRecord };
  } catch {
    return null;
  }
}

/**
 * Clear a lock left by a crashed host on this machine. Anything uncertain (an old or damaged
 * record, another machine, a live PID, a failed save, extra files) keeps the lock.
 */
function clearStaleLock(lock: string): boolean {
  const owner = readOwnerRecord(lock);
  if (
    !owner ||
    owner.record.state !== 'running' ||
    owner.record.host !== os.hostname() ||
    processExists(owner.record.pid)
  )
    return false;
  const identity = fs.lstatSync(lock);
  if (!identity.isDirectory()) return false;
  // Move the lock aside first so a host that takes it over meanwhile is never deleted.
  const aside = lock + '.stale-' + process.pid + '-' + crypto.randomBytes(4).toString('hex');
  try {
    fs.renameSync(lock, aside);
  } catch {
    return false;
  }
  const moved = fs.lstatSync(aside);
  const entries = fs.readdirSync(aside);
  if (
    moved.dev !== identity.dev ||
    moved.ino !== identity.ino ||
    entries.length !== 1 ||
    entries[0] !== 'owner.json' ||
    readOwnerRecord(aside)?.text !== owner.text
  ) {
    fs.renameSync(aside, lock);
    return false;
  }
  fs.unlinkSync(path.join(aside, 'owner.json'));
  fs.rmdirSync(aside);
  console.log(
    'Removed a leftover friend save lock from a host that is no longer running (process ' +
      owner.record.pid +
      ').',
  );
  return true;
}

/**
 * Exclusive cross-process ownership. A lock left by a crashed host on this machine is cleared
 * once its process is gone; every other leftover lock requires explicit operator recovery.
 */
export function acquireFriendSaveOwner(directory: string, root: string): FriendSaveOwner {
  process.umask(0o077);
  assertSeparateFriendStore(directory, root);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const canonical = fs.realpathSync.native(directory);
  assertSeparateFriendStore(canonical, root);
  fs.chmodSync(canonical, 0o700);
  const lock = path.join(canonical, '.friend-host.lock');
  const createLock = () => {
    try {
      fs.mkdirSync(lock, { mode: 0o700 });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      return false;
    }
  };
  if (!createLock() && !(clearStaleLock(lock) && createLock()))
    throw new Error(
      'Friend save directory is already owned or has a stale lock: ' +
        lock +
        '. Stop every host using this save directory. If a host crashed, verify no process on any machine is using it, back up the save directory, then manually remove only .friend-host.lock (a hidden folder) and retry. Only a lock left by a crashed host on this computer whose process is gone is removed automatically.',
    );
  const started = new Date().toISOString();
  const writeOwner = (state: FriendSaveOwnerState) => {
    const record: FriendSaveOwnerRecord = { pid: process.pid, host: os.hostname(), state, started };
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify(record), { mode: 0o600 });
  };
  // Keep the lock after any startup/flush failure: uncertain recovery must fail closed.
  writeOwner('starting');
  privatize(canonical);
  const identity = fs.statSync(lock);
  let released = false;
  /** Fail closed if the lock directory was replaced while this host ran. */
  const assertOwnLock = () => {
    const current = fs.lstatSync(lock);
    if (current.dev !== identity.dev || current.ino !== identity.ino || !current.isDirectory())
      throw new Error('Friend save ownership changed; refusing to remove its lock.');
  };
  return {
    markRunning() {
      assertOwnLock();
      writeOwner('running');
    },
    markNeedsRecovery() {
      assertOwnLock();
      writeOwner('needs-recovery');
    },
    release() {
      if (released) return;
      assertOwnLock();
      fs.unlinkSync(path.join(lock, 'owner.json'));
      fs.rmdirSync(lock);
      released = true;
    },
  };
}
