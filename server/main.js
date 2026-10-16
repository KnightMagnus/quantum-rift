// Quantum Rift server entry: static files, WebSocket game connection, radio search proxy.
// Run: node server/main.js   (PORT and DATA_DIR environment variables are optional)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upgrade } from './ws.js';
import { DB } from './db.js';
import { Game } from './game.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 8080;
const SOLO = !!process.env.SOLO; // solo mode: a private game on this computer only, no passwords, save slots
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const A = JSON.parse(fs.readFileSync(path.join(ROOT, 'shared', 'assets.json'), 'utf8'));
const db = new DB(process.env.DATA_DIR || path.join(ROOT, 'data'));
const game = new Game(A, db);
game.solo = SOLO;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};
function serve(res, file, cache) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache ? 'public, max-age=86400' : 'no-cache',
    });
    fs.createReadStream(file).pipe(res);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/api/radio') {
    // iHeartRadio station search for the in-HUD radio (the browser can't call it directly)
    try {
      const q = (url.searchParams.get('q') || '').slice(0, 80);
      const r = await fetch(
        'https://api.iheart.com/api/v3/search/all?keywords=' +
          encodeURIComponent(q) +
          '&maxRows=30&bundle=false&station=true&artist=false&track=false&playlist=false&podcast=false',
        { headers: { 'User-Agent': 'QuantumRift/1.0', Accept: 'application/json' } },
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(await r.text());
    } catch (e) {
      res.writeHead(502);
      res.end('{}');
    }
    return;
  }
  // 1.0.3: a station's direct audio streams (played in an <audio> element so the game controls volume) and its now-playing text
  if (p === '/api/radio/station' || p === '/api/radio/meta') {
    const id = (url.searchParams.get('id') || '').replace(/[^0-9]/g, '').slice(0, 12);
    if (!id) {
      res.writeHead(400);
      res.end('{}');
      return;
    }
    try {
      const H = { headers: { 'User-Agent': 'QuantumRift/1.0', Accept: 'application/json' } };
      if (p === '/api/radio/station') {
        const j = await (
            await fetch('https://api.iheart.com/api/v2/content/liveStations/' + id, H)
          ).json(),
          st = (j.hits && j.hits[0]) || {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            name: st.name || '',
            desc: st.description || '',
            call: st.callLetters || '',
            streams: st.streams || {},
          }),
        );
      } else {
        const r = await fetch(
          'https://api.iheart.com/api/v3/live-meta/stream/' + id + '/currentTrackMeta',
          H,
        );
        const j = r.status === 200 ? await r.json() : {};
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({ artist: j.artist || '', title: j.title || '', album: j.album || '' }),
        );
      }
    } catch (e) {
      res.writeHead(502);
      res.end('{}');
    }
    return;
  }
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
  serve(res, file, p.startsWith('/assets/') && (!catalog || url.searchParams.get('v') === VERSION));
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
