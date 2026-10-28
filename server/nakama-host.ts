import { GAME_PROTOCOL } from '../shared/protocol.ts';
import type { Server, ServerResponse } from 'node:http';

// Online HTTP host only: static files and public native-service connection settings.
// Run through tools/start.ts; this host never creates Game, a database or a gameplay socket.
import http from 'node:http';
import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Root directory path of the Quantum Rift repository.
 */
const moduleRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fileSystem.existsSync(path.join(moduleRoot, 'package.json'))
  ? moduleRoot
  : path.dirname(moduleRoot);
const compiledRoot = path.join(ROOT, 'dist');

/**
 * Static HTTP listener port number.
 */
const PORT: number = Number(process.env.PORT) || 8080;

/**
 * Public beta release label from package.json; independent of protocol/save versions.
 */
const VERSION: string = JSON.parse(
  fileSystem.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).publicVersion;

/**
 * MIME content-type lookup table indexed by file extension.
 */
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

/**
 * Streams a local static file to an HTTP response with appropriate MIME headers and caching.
 * @param response Outgoing HTTP server response.
 * @param file Absolute filesystem path to the target static file.
 * @param cache Whether to enable client-side 1-day public caching.
 */
function serve(response: ServerResponse, file: string, cache: boolean, range?: string): void {
  fileSystem.stat(file, (errnoException, stats) => {
    if (errnoException || !stats.isFile()) {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    if (path.extname(file) === '.mp3' && range) {
      const regExpExecArray = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = regExpExecArray?.[1] ? Number(regExpExecArray[1]) : 0;
      let endPosition = regExpExecArray?.[2] ? Number(regExpExecArray[2]) : stats.size - 1;
      if (regExpExecArray && !regExpExecArray[1] && regExpExecArray[2]) {
        start = Math.max(0, stats.size - Number(regExpExecArray[2]));
        endPosition = stats.size - 1;
      }
      endPosition = Math.min(endPosition, stats.size - 1);
      if (
        !regExpExecArray ||
        (!regExpExecArray[1] && !regExpExecArray[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(endPosition) ||
        start > endPosition ||
        start >= stats.size
      ) {
        response.writeHead(416, { 'Content-Range': 'bytes */' + stats.size });
        response.end();
        return;
      }
      response.writeHead(206, {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes ' + start + '-' + endPosition + '/' + stats.size,
        'Content-Length': endPosition - start + 1,
        'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
      });
      fileSystem.createReadStream(file, { start, end: endPosition }).pipe(response);
      return;
    }
    response.writeHead(200, {
      ...(path.extname(file) === '.mp3' ? { 'Accept-Ranges': 'bytes' } : {}),
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': stats.size,
      'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
    });
    fileSystem.createReadStream(file).pipe(response);
  });
}

/**
 * Main HTTP application server handling REST API endpoints, static assets, and WebSocket handshakes.
 */
const server: Server = http.createServer(async (incomingMessage, response) => {
  const targetUrl = new URL(
    incomingMessage.url!,
    'http://' + (incomingMessage.headers.host || '127.0.0.1'),
  );
  let decodeURIComponent2 = decodeURIComponent(targetUrl.pathname);
  if (decodeURIComponent2 === '/api/status') {
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(
      JSON.stringify({
        players: null,
        version: VERSION,
        protocol: GAME_PROTOCOL,
        solo: false,
        nakama: {
          host: process.env.NAKAMA_HOST || targetUrl.hostname || '127.0.0.1',
          port: process.env.NAKAMA_PORT || '7350',
          useSSL: process.env.NAKAMA_USE_SSL === '1',
          serverKey: process.env.NAKAMA_SERVER_KEY || 'defaultkey',
        },
      }),
    );
    return;
  }
  if (decodeURIComponent2 === '/') decodeURIComponent2 = '/index.html';
  if (path.extname(decodeURIComponent2) === '.ts') {
    response.writeHead(404);
    response.end('not found');
    return;
  }
  const base = decodeURIComponent2.startsWith('/shared/') ? ROOT : path.join(ROOT, 'client');
  let file = path.normalize(path.join(base, decodeURIComponent2));
  if (!file.startsWith(base)) {
    response.writeHead(403);
    response.end();
    return;
  }
  // Browser imports need emitted JavaScript, never raw TypeScript. Images, HTML,
  // CSS and JSON remain in their original directories and are not duplicated.
  if (path.extname(file) === '.js') {
    file = path.join(compiledRoot, path.relative(ROOT, file));
  }
  const catalog =
    (decodeURIComponent2.startsWith('/assets/ships/') &&
      decodeURIComponent2.endsWith('_yard.png')) ||
    decodeURIComponent2.startsWith('/assets/icons/') ||
    decodeURIComponent2.startsWith('/assets/portraits/');
  serve(
    response,
    file,
    decodeURIComponent2.startsWith('/assets/') &&
      (!catalog || targetUrl.searchParams.get('v') === VERSION),
    incomingMessage.headers.range,
  );
});

server.on('upgrade', (_request, socket) => socket.destroy());

server.on('error', (error2) => {
  if ('code' in error2 && error2.code === 'EADDRINUSE')
    console.error(
      `\nPort ${PORT} is already in use: another Quantum Rift server (maybe an older version) is still running.\nClose its window first, then start this one again.\n`,
    );
  else console.error(error2);
  process.exit(1);
});

server.listen(PORT, process.env.HOST || '127.0.0.1', () =>
  console.log(
    `Quantum Rift ${VERSION} web host running at http://localhost:${PORT} (gameplay: Nakama)`,
  ),
);

process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// log anything that slips through rather than letting the server die mid-game
process.on('uncaughtException', (error2) => console.error('uncaught', error2));
process.on('unhandledRejection', (event) => console.error('unhandled rejection', event));
