import type { RuntimeManifest } from './contracts.ts';
// Downloads only a project-local runtime; never replaces the system Node binary.
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(
  fileSystem.readFileSync(new URL('./node27.json', import.meta.url), 'utf8'),
) as RuntimeManifest;
const artifact = manifest.artifacts[`${process.platform}-${process.arch}`];
if (!artifact) throw new Error(`No pinned Node 27 build for ${process.platform}-${process.arch}.`);
const destination = path.join(rootDirectory, '.artifacts', 'node-runtime');
const directory = path.join(destination, artifact.file.replace(/\.(tar\.(xz|gz)|zip)$/, ''));
const binaryDirectory = process.platform === 'win32' ? directory : path.join(directory, 'bin');
const binary = path.join(binaryDirectory, process.platform === 'win32' ? 'node.exe' : 'node');
if (!fileSystem.existsSync(binary)) {
  const scratch = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-node-'));
  try {
    const response = await fetch(manifest.baseUrl + artifact.file);
    if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    const checksum = createHash('sha256').update(archive).digest('hex');
    if (checksum !== artifact.sha256)
      throw new Error(`Node checksum mismatch for ${artifact.file}.`);
    const archivePath = path.join(scratch, artifact.file);
    fileSystem.writeFileSync(archivePath, archive);
    fileSystem.mkdirSync(destination, { recursive: true });
    // Git Bash can put GNU tar first on PATH; it cannot extract Windows ZIPs.
    const archiveExtractor =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
        : 'tar';
    const extraction = spawnSync(archiveExtractor, ['-xf', archivePath, '-C', destination], {
      stdio: 'inherit',
    });
    if (extraction.error) throw extraction.error;
    if (extraction.status !== 0) throw new Error('Could not extract the Node runtime.');
  } finally {
    fileSystem.rmSync(scratch, { recursive: true, force: true });
  }
}
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0 || version.stdout.trim() !== manifest.version)
  throw new Error('Installed Node version does not match the runtime pin.');
if (process.env.GITHUB_PATH)
  fileSystem.appendFileSync(process.env.GITHUB_PATH, binaryDirectory + operatingSystem.EOL);
console.log(`${manifest.version}: ${binaryDirectory}`);
