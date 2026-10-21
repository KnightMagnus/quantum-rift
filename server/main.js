// Quantum Rift server entry: static files, WebSocket game connection, local game endpoints.
// Run: node server/main.js   (PORT and DATA_DIR environment variables are optional)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgrade } from './ws.js';
import { DB } from './db.js';
import { Game } from './game.js';

/** @import { GameAssets } from '../shared/rules.js' */
/** @import { Server, ServerResponse } from 'node:http' */

/**
 * Root directory path of the Quantum Rift repository.
 * @type {string}
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * HTTP and WebSocket listener port number.
 * @type {number}
 */
const PORT = +process.env.PORT || 8080;

/**
 * Solo play mode flag: private offline game on local computer with no passwords and save slots.
 * @type {boolean}
 */
const SOLO = !!process.env.SOLO; // solo mode: a private game on this computer only, no passwords, save slots

/**
 * Server version string parsed from package.json.
 * @type {string}
 */
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/**
 * Static game asset catalog loaded from shared/assets.json.
 * @type {GameAssets}
 */
const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'assets.json'), 'utf8'));

/**
 * Database persistence manager for player accounts and world state.
 * @type {DB}
 */
const db = new DB(process.env.DATA_DIR || path.join(ROOT, 'data'));

/**
 * Primary game engine instance managing active systems, entities, and client sessions.
 * @type {Game}
 */
const game = new Game(A, db);
game.solo = SOLO;

/**
 * MIME content-type lookup table indexed by file extension.
 * @type {Record<string, string>}
 */
const TYPES = {
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
 * @param {ServerResponse} res Outgoing HTTP server response.
 * @param {string} file Absolute filesystem path to the target static file.
 * @param {boolean} cache Whether to enable client-side 1-day public caching.
 * @returns {void}
 */
function serve(res, file, cache, range) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    if (path.extname(file) === '.mp3' && range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      let start = m?.[1] ? Number(m[1]) : 0;
      let end = m?.[2] ? Number(m[2]) : st.size - 1;
      if (m && !m[1] && m[2]) {
        start = Math.max(0, st.size - Number(m[2]));
        end = st.size - 1;
      }
      end = Math.min(end, st.size - 1);
      if (
        !m ||
        (!m[1] && !m[2]) ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= st.size
      ) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + st.size });
        res.end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': 'audio/mpeg',
        'Accept-Ranges': 'bytes',
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Content-Length': end - start + 1,
        'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, {
      ...(path.extname(file) === '.mp3' ? { 'Accept-Ranges': 'bytes' } : {}),
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}

/**
 * Main HTTP application server handling REST API endpoints, static assets, and WebSocket handshakes.
 * @type {Server}
 */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        players: [...game.sessions.values()].filter((s) => s.data).length,
        version: VERSION,
        solo: SOLO,
        slots: SOLO ? game.slots() : undefined,
      }),
    );
    return;
  }
  if (SOLO && p === '/api/export') {
    // download a save
    const pl = db.get(url.searchParams.get('name') || '');
    if (!pl) {
      res.writeHead(404);
      res.end();
      return;
    }
    const { salt, hash, ...save } = pl;
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${pl.name.replace(/[^A-Za-z0-9_-]/g, '_')}.rift.json"`,
    });
    res.end(JSON.stringify({ rift: VERSION, save }));
    return;
  }
  if (SOLO && p === '/api/import' && req.method === 'POST') {
    // load a save file
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 8e6) req.destroy();
    });
    req.on('end', () => {
      try {
        const j = JSON.parse(body),
          sv = j.save || j;
        const n = game.importSave(sv);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, name: n }));
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ ok: false, error: String(e.message || e) }));
      }
    });
    return;
  }
  if (p === '/') p = '/index.html';
  const base = p.startsWith('/shared/') ? ROOT : path.join(ROOT, 'client');
  const file = path.normalize(path.join(base, p));
  if (!file.startsWith(base)) {
    res.writeHead(403);
    res.end();
    return;
  }
  const catalog =
    (p.startsWith('/assets/ships/') && p.endsWith('_yard.png')) || p.startsWith('/assets/icons/');
  serve(
    res,
    file,
    p.startsWith('/assets/') && (!catalog || url.searchParams.get('v') === VERSION),
    req.headers.range,
  );
});

server.on('upgrade', (req, sock) => {
  if (req.url.startsWith('/ws'))
    upgrade(req, sock, (ws) =>
      game.connect(
        ws,
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || sock.remoteAddress || '?',
      ),
    );
  else sock.destroy();
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE')
    console.error(
      `\nPort ${PORT} is already in use: another Quantum Rift server (maybe an older version) is still running.\nClose its window first, then start this one again.\n`,
    );
  else console.error(e);
  process.exit(1);
});

server.listen(PORT, SOLO ? '127.0.0.1' : undefined, () =>
  console.log(
    `Quantum Rift ${VERSION}${SOLO ? ' (solo game)' : ''} running at http://localhost:${PORT}`,
  ),
);

process.on('SIGINT', () => {
  db.flush();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.flush();
  process.exit(0);
});

// 2.0.2: log anything that slips through rather than letting the server die mid-game
process.on('uncaughtException', (e) => console.error('uncaught', e));
process.on('unhandledRejection', (e) => console.error('unhandled rejection', e));
