import type { SpaceSnapshot } from './space.ts';

/** Encode one immutable public snapshot once; recipient-only fields stay separate. */
export function sharedSnapshotEncoder(snapshot: SpaceSnapshot) {
  const common = JSON.stringify(snapshot).slice(1, -1);
  return (recipient: object): string => {
    const fields = JSON.stringify(recipient).slice(1, -1);
    return '{"t":"snap"' + (common ? ',' + common : '') + (fields ? ',' + fields : '') + '}';
  };
}
