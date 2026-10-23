import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
process.umask(0o077);
const root = path.resolve(import.meta.dirname, '../..');
const destination = path.join(root, '.artifacts/nakama/nakama-3.41.0');
const binary = path.join(destination, 'nakama');
const digest = '71aea14384b097e043917d0b1e8c3799594064acbab01853e71ea10d80624ce2';
if (process.platform !== 'linux' || process.arch !== 'x64')
  throw new Error('Set NAKAMA_BINARY: pinned automatic download supports Linux x64 only.');
if (!fs.existsSync(binary)) {
  fs.mkdirSync(destination, { recursive: true, mode: 0o700 });
  const response = await fetch(
    'https://github.com/heroiclabs/nakama/releases/download/v3.41.0/nakama-3.41.0-linux-amd64.tar.gz',
    { signal: AbortSignal.timeout(60000) },
  );
  if (!response.ok) throw new Error('Nakama download HTTP ' + response.status);
  const archive = Buffer.from(await response.arrayBuffer());
  if (createHash('sha256').update(archive).digest('hex') !== digest)
    throw new Error('Official Nakama archive checksum mismatch');
  const archivePath = path.join(destination, 'nakama.tar.gz');
  fs.writeFileSync(archivePath, archive, { mode: 0o600 });
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', destination, 'nakama'], {
    timeout: 15000,
    stdio: 'inherit',
  });
  if (result.error || result.status !== 0) throw new Error('Nakama extraction failed');
}
if (
  createHash('sha256').update(fs.readFileSync(binary)).digest('hex') !==
  '4082f8758b2d1926edfde37a2435fba2877227df5bf560b235321c9decd61e68'
)
  throw new Error('Pinned Nakama binary checksum mismatch');
const version = spawnSync(binary, ['--version'], { encoding: 'utf8', timeout: 5000 });
if (version.error || version.status !== 0 || !version.stdout.includes('3.41.0'))
  throw new Error('Unexpected Nakama runtime version');
console.log(binary);
