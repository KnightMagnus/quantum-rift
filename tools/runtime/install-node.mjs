// Downloads only a project-local runtime; never replaces the system Node binary.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(new URL('./node27.json', import.meta.url), 'utf8'));
const artifact = manifest.artifacts[`${process.platform}-${process.arch}`];
if (!artifact) throw new Error(`No pinned Node 27 build for ${process.platform}-${process.arch}.`);
const destination = path.join(root, '.artifacts', 'node-runtime');
const directory = path.join(destination, artifact.file.replace(/\.(tar\.(xz|gz)|zip)$/, ''));
const binaryDirectory = process.platform === 'win32' ? directory : path.join(directory, 'bin');
const binary = path.join(binaryDirectory, process.platform === 'win32' ? 'node.exe' : 'node');
if (!fs.existsSync(binary)) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-node-'));
  try {
    const response = await fetch(manifest.baseUrl + artifact.file);
    if (!response.ok) throw new Error(`Node download failed: HTTP ${response.status}`);
    const archive = Buffer.from(await response.arrayBuffer());
    const checksum = createHash('sha256').update(archive).digest('hex');
    if (checksum !== artifact.sha256)
      throw new Error(`Node checksum mismatch for ${artifact.file}.`);
    const archivePath = path.join(scratch, artifact.file);
    fs.writeFileSync(archivePath, archive);
    fs.mkdirSync(destination, { recursive: true });
    // Git Bash can put GNU tar first on PATH; it cannot extract Windows ZIPs.
    const tar =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot || 'C:/Windows', 'System32', 'tar.exe')
        : 'tar';
    const extraction = spawnSync(tar, ['-xf', archivePath, '-C', destination], {
      stdio: 'inherit',
    });
    if (extraction.error) throw extraction.error;
    if (extraction.status !== 0) throw new Error('Could not extract the Node runtime.');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
const version = spawnSync(binary, ['--version'], { encoding: 'utf8' });
if (version.error || version.status !== 0 || version.stdout.trim() !== manifest.version)
  throw new Error('Installed Node version does not match the runtime pin.');
if (process.env.GITHUB_PATH) fs.appendFileSync(process.env.GITHUB_PATH, binaryDirectory + os.EOL);
console.log(`${manifest.version}: ${binaryDirectory}`);
