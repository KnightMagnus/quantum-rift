import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../../', import.meta.url));
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function availablePort() {
  const socket = net.createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
export function evidenceDir(name) {
  const dir = path.resolve(process.env.RIFT_TEST_ARTIFACTS || '.artifacts/regression', name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export async function ready(server, origin) {
  const end = Date.now() + 15000;
  while (Date.now() < end) {
    if (server.exitCode !== null) throw Error(`Fixture server exited: ${server.exitCode}`);
    try {
      if ((await fetch(origin + '/api/status', { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {}
    await delay(100);
  }
  throw Error(`Fixture server did not become ready: ${origin}`);
}
export async function cleanup(server, browser, log, dir) {
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
    log.end();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export async function failureEvidence(browser, evidence, error) {
  fs.writeFileSync(path.join(evidence, 'failure.txt'), String(error?.stack || error));
  let i = 0;
  for (const context of browser?.contexts() || []) {
    for (const page of context.pages()) {
      try {
        await page.screenshot({ path: path.join(evidence, `failure-${i++}.png`), timeout: 3000 });
      } catch {}
    }
  }
}
