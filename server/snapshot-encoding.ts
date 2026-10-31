import type { SpaceSnapshot } from './space.ts';

/** Encode immutable system fields once; callers supply any private snapshot per recipient. */
export function sharedSnapshotEncoder(snapshot: SpaceSnapshot | null, sharedFields: object = {}) {
  const common = JSON.stringify({ ...snapshot, ...sharedFields }).slice(1, -1);
  return (recipient: object): string => {
    const fields = JSON.stringify(recipient).slice(1, -1);
    return '{"t":"snap"' + (common ? ',' + common : '') + (fields ? ',' + fields : '') + '}';
  };
}
