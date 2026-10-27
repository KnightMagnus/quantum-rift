import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Source/dependency bytes actually supplied to the native bundler. */
export interface NativeBuildInput {
  /** Portable repository-relative path; dependency paths start with node_modules/. */
  path: string;
  /** SHA-256 of the exact input bytes. */
  sha256: string;
}
/** Local build receipt; contains no timestamps, absolute paths or credentials. */
export interface NativeBuildProvenance {
  /** Manifest format. */
  schema: 1;
  /** Digest of the emitted ES5 runtime. */
  runtimeSha256: string;
  /** Digest of the sorted path/digest inventory, including the builder and lockfile. */
  sourceFingerprint: string;
  /** Actual bundler inputs plus the explicit build-tool inputs. */
  inputs: NativeBuildInput[];
}
export const nativeRuntimeRelative = 'dist/nakama/quantum-rift.js';
export const nativeProvenanceRelative = 'dist/nakama/quantum-rift.provenance.json';
const requiredBuildInputs = [
  'tools/build-nakama.ts',
  'tools/nakama-build-provenance.ts',
  'package-lock.json',
];
const digestPattern = /^[a-f0-9]{64}$/;
/** Stable digest for source and emitted runtime bytes. */
export function nativeBuildDigest(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
function validRelative(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 1024 &&
    !value.includes('\\') &&
    !value.includes(':') &&
    !value.includes('\0') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
  );
}
/** Normalize symlink-resolved dependencies without leaking another checkout's path. */
export function nativeBuildInputPath(root: string, absolute: string): string {
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  if (validRelative(relative)) return relative;
  const normalized = absolute.split(path.sep).join('/');
  const dependency = normalized.lastIndexOf('/node_modules/');
  if (dependency >= 0) {
    const logical = normalized.slice(dependency + 1);
    if (validRelative(logical)) return logical;
  }
  throw Error('Native build input is outside the repository or dependency tree');
}
function fingerprint(inputs: NativeBuildInput[]) {
  return nativeBuildDigest(JSON.stringify(inputs));
}
/** Record every loaded byte and reject a source tree changed during the build. */
export function writeNativeBuildProvenance(
  root: string,
  loaded: Map<string, string>,
): NativeBuildProvenance {
  const inventory = new Map(loaded);
  for (const relative of requiredBuildInputs)
    if (!inventory.has(relative)) throw Error('Native build tool input was not captured');
  const inputs = [...inventory]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([relative, sha256]) => {
      if (
        !validRelative(relative) ||
        !digestPattern.test(sha256) ||
        nativeBuildDigest(fs.readFileSync(path.join(root, relative))) !== sha256
      )
        throw Error('Native build inputs changed while bundling; rebuild');
      return { path: relative, sha256 };
    });
  const provenance: NativeBuildProvenance = {
    schema: 1,
    runtimeSha256: nativeBuildDigest(fs.readFileSync(path.join(root, nativeRuntimeRelative))),
    sourceFingerprint: fingerprint(inputs),
    inputs,
  };
  fs.writeFileSync(
    path.join(root, nativeProvenanceRelative),
    JSON.stringify(provenance, null, 2) + '\n',
  );
  return provenance;
}
/** Capture the build driver/lock bytes before bundling starts, not after emission. */
export function nativeBuildToolInputs(root: string): Map<string, string> {
  return new Map(
    requiredBuildInputs.map((relative) => [
      relative,
      nativeBuildDigest(fs.readFileSync(path.join(root, relative))),
    ]),
  );
}
/** Verify before allocating native services; return pinned runtime bytes to avoid a later dist race. */
export function verifyNativeBuildProvenance(root: string): {
  runtimeSha256: string;
  sourceFingerprint: string;
  runtimeBytes: Uint8Array;
} {
  try {
    const file = path.join(root, nativeProvenanceRelative);
    if (fs.statSync(file).size > 1024 * 1024) throw Error('oversized');
    const manifest: unknown = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest))
      throw Error('shape');
    const value = manifest as Record<string, unknown>;
    if (
      value.schema !== 1 ||
      Object.keys(value).sort().join(',') !== 'inputs,runtimeSha256,schema,sourceFingerprint' ||
      typeof value.runtimeSha256 !== 'string' ||
      !digestPattern.test(value.runtimeSha256) ||
      typeof value.sourceFingerprint !== 'string' ||
      !digestPattern.test(value.sourceFingerprint) ||
      !Array.isArray(value.inputs) ||
      value.inputs.length < requiredBuildInputs.length ||
      value.inputs.length > 4096
    )
      throw Error('shape');
    const inputs: NativeBuildInput[] = [];
    let previous = '';
    for (const input of value.inputs) {
      if (
        typeof input !== 'object' ||
        input === null ||
        Array.isArray(input) ||
        Object.keys(input).sort().join(',') !== 'path,sha256' ||
        !validRelative(input.path) ||
        input.path <= previous ||
        typeof input.sha256 !== 'string' ||
        !digestPattern.test(input.sha256) ||
        nativeBuildDigest(fs.readFileSync(path.join(root, input.path))) !== input.sha256
      )
        throw Error('input');
      previous = input.path;
      inputs.push({ path: input.path, sha256: input.sha256 });
    }
    if (
      !requiredBuildInputs.every((relative) => inputs.some((input) => input.path === relative)) ||
      fingerprint(inputs) !== value.sourceFingerprint
    )
      throw Error('fingerprint');
    const runtimeBytes = fs.readFileSync(path.join(root, nativeRuntimeRelative));
    if (nativeBuildDigest(runtimeBytes) !== value.runtimeSha256) throw Error('runtime');
    return {
      runtimeSha256: value.runtimeSha256,
      sourceFingerprint: value.sourceFingerprint,
      runtimeBytes,
    };
  } catch {
    throw Error('Native runtime provenance is missing, stale or invalid; run npm run build.');
  }
}
