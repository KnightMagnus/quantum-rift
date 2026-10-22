import type { GameAssets } from '../shared/rules.ts';
import type { Server, ServerResponse } from 'node:http';

// Local Solo platform, plus the explicit reference authority used by legacy regression fixtures.
// The normal launcher selects this file only for SOLO=1; production online uses nakama-host.ts.
import http from 'node:http';
import fileSystem from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgrade } from './ws.ts';
import { DB as Database } from './db.ts';
import { Game } from './game.ts';

/**
 * Root directory path of the Quantum Rift repository.
 */
const moduleRoot: string = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = fileSystem.existsSync(path.join(moduleRoot, 'package.json'))
  ? moduleRoot
  : path.dirname(moduleRoot);
const compiledRoot = path.join(ROOT, 'dist');

/**
 * HTTP and WebSocket listener port number.
 */
const PORT: number = Number(process.env.PORT) || 8080;

/**
 * Solo play mode flag: private offline game on local computer with no passwords and save slots.
 */
const SOLO: boolean = !!process.env.SOLO; // solo mode: a private game on this computer only, no passwords, save slots

/**
 * Server version string parsed from package.json.
 */
const VERSION: string = JSON.parse(
  fileSystem.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
).version;

/**
 * Static game asset catalog loaded from shared/assets.json.
 */
const assets: GameAssets = JSON.parse(
  fileSystem.readFileSync(path.join(ROOT, 'shared', 'assets.json'), 'utf8'),
);

/**
 * Database persistence manager for player accounts and world state.
 */
const database: Database = new Database(process.env.DATA_DIR || path.join(ROOT, 'data'));

/**
 * Primary game engine instance managing active systems, entities, and client sessions.
 */
const game: Game = new Game(assets, database);
game.solo = SOLO;

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
  const targetUrl = new URL(incomingMessage.url!, 'http://x');
  let decodeURIComponent2 = decodeURIComponent(targetUrl.pathname);
  if (decodeURIComponent2 === '/api/status') {
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        players: [...game.sessions.values()].filter((session) => session.data).length,
        version: VERSION,
        solo: SOLO,
        slots: SOLO ? game.slots() : undefined,
        localAuthority: !SOLO,
      }),
    );
    return;
  }
  if (SOLO && decodeURIComponent2 === '/api/export') {
    // download a save
    const playerAccount = database.get(targetUrl.searchParams.get('name') || '');
    if (!playerAccount) {
      response.writeHead(404);
      response.end();
      return;
    }
    const { salt, hash, ...save } = playerAccount;
    response.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${playerAccount.name.replace(/[^A-Za-z0-9_-]/g, '_')}.rift.json"`,
    });
    response.end(JSON.stringify({ rift: VERSION, save }));
    return;
  }
  if (SOLO && decodeURIComponent2 === '/api/import' && incomingMessage.method === 'POST') {
    // load a save file
    let body = '';
    incomingMessage.on('data', (component) => {
      body += component;
      if (body.length > 8e6) incomingMessage.destroy();
    });
    incomingMessage.on('end', () => {
      try {
        const parse2 = JSON.parse(body),
          savedValue = parse2.save || parse2;
        const importSave2 = game.importSave(savedValue);
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ ok: true, name: importSave2 }));
      } catch (event) {
        response.writeHead(400);
        response.end(
          JSON.stringify({ ok: false, error: String((event as Error).message || event) }),
        );
      }
    });
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
    decodeURIComponent2.startsWith('/assets/icons/');
  serve(
    response,
    file,
    decodeURIComponent2.startsWith('/assets/') &&
      (!catalog || targetUrl.searchParams.get('v') === VERSION),
    incomingMessage.headers.range,
  );
});

server.on('upgrade', (incomingMessage, duplex) => {
  if (incomingMessage.url!.startsWith('/ws'))
    upgrade(incomingMessage, duplex as import('node:net').Socket, (socket) =>
      game.connect(
        socket,
        ((incomingMessage.headers['x-forwarded-for'] || '') as string).split(',')[0].trim() ||
          (duplex as import('node:net').Socket).remoteAddress ||
          '?',
      ),
    );
  else duplex.destroy();
});

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
    `Quantum Rift ${VERSION}${SOLO ? ' (solo game)' : ''} running at http://localhost:${PORT}`,
  ),
);

process.on('SIGINT', () => {
  database.flush();
  process.exit(0);
});

process.on('SIGTERM', () => {
  database.flush();
  process.exit(0);
});

// log anything that slips through rather than letting the server die mid-game
process.on('uncaughtException', (error2) => console.error('uncaught', error2));
process.on('unhandledRejection', (event) => console.error('unhandled rejection', event));
