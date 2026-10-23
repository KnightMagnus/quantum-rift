import fileSystem from 'node:fs';
import path from 'node:path';
import network from 'node:net';
import type { ChildProcess } from 'node:child_process';
import type { WriteStream } from 'node:fs';
import type { Browser } from 'playwright';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
export async function availablePort() {
  const socket = network.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw Error('Missing fixture TCP address');
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    socket.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
export function evidenceDir(name: string) {
  const directory = path.resolve(process.env.RIFT_TEST_ARTIFACTS || '.artifacts/regression', name);
  fileSystem.mkdirSync(directory, { recursive: true });
  return directory;
}
export async function ready(server: ChildProcess, origin: string) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw Error(`Fixture server exited: ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status', { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error(`Fixture server did not become ready: ${origin}`);
}
export async function cleanup(
  server: ChildProcess,
  browser: Browser | null | undefined,
  serverLog: WriteStream,
  directory2: string,
) {
  try {
    await browser?.close();
  } finally {
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      await Promise.race([once(server, 'exit'), delay(3000)]);
      if (server.exitCode === null && server.signalCode === null) {
        server.kill('SIGKILL');
        await once(server, 'exit');
      }
    }
    serverLog.end();
    fileSystem.rmSync(directory2, { recursive: true, force: true });
  }
}
export async function failureEvidence(
  browser: Browser | null | undefined,
  evidence: string,
  error: unknown,
) {
  fileSystem.writeFileSync(
    path.join(evidence, 'failure.txt'),
    error instanceof Error ? error.stack || error.message : String(error),
  );
  let screenshotIndex = 0;
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      try {
        await page.screenshot({
          path: path.join(evidence, `failure-${screenshotIndex++}.png`),
          timeout: 3000,
        });
      } catch {}
    }
  }
}
