// Decode every shipped hull and exercise real runtime bank signals against its sheet.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.mjs';
const out = evidenceDir('ship-turning-assets');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rift-ship-turning-'));
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/main.ts'], {
  cwd: root,
  env: { ...process.env, PORT: String(port), DATA_DIR: dir, SOLO: '', SEEDS_FILE: '/nonexistent' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const log = fs.createWriteStream(path.join(out, 'server.log'));
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
try {
  await ready(server, origin);
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const [{ SPRITES }, { augmentAssets, makeLoadout, shipStats }, { shipBank }] =
      await Promise.all([
        import('/shared/sprites26.js'),
        import('/shared/rules.js'),
        import('/ship_banking.js'),
      ]);
    const A = await (await fetch('/shared/assets.json')).json();
    augmentAssets(A);
    const repaired = new Set([
      717, 734, 736, 743, 744, 750, 769, 774, 779, 784, 785, 786, 787, 789, 792, 795, 804,
    ]);
    const contact = document.createElement('canvas');
    contact.width = 1200;
    contact.height = repaired.size * 160;
    const ctx = contact.getContext('2d');
    ctx.fillStyle = '#11161d';
    ctx.fillRect(0, 0, contact.width, contact.height);
    ctx.font = '15px sans-serif';
    let row = 0;
    const proof = [];
    for (const hull of Object.values(A.ships)) {
      const s = SPRITES[hull.id];
      if (!s?.banks) throw Error(`${hull.id}: missing bank mapping`);
      const layers = [];
      for (const suffix of ['', ...(s.glow ? ['_glow'] : [])]) {
        const im = new Image();
        im.src = `/assets/ships/${hull.id}${suffix}.webp`;
        await im.decode();
        if (im.width !== s.fs * s.cols || im.height !== s.fs * 9)
          throw Error(`${hull.id}${suffix}: incomplete108-frame sheet`);
        const canvas = document.createElement('canvas');
        canvas.width = s.fs;
        canvas.height = s.fs;
        const c = canvas.getContext('2d', { willReadFrequently: true });
        const frames = [];
        for (let i = 0; i < 108; i++) {
          c.clearRect(0, 0, s.fs, s.fs);
          c.drawImage(
            im,
            (i % s.cols) * s.fs,
            Math.floor(i / s.cols) * s.fs,
            s.fs,
            s.fs,
            0,
            0,
            s.fs,
            s.fs,
          );
          const pixels = c.getImageData(0, 0, s.fs, s.fs).data;
          if (!suffix && !pixels.some((v, j) => j % 4 === 3 && v > 0))
            throw Error(`${hull.id}: empty frame${i}`);
          frames.push(pixels);
        }
        if (!suffix)
          for (let bank = 1; bank <= 2; bank++)
            for (let heading = 0; heading < 36; heading++) {
              if (frames[heading].every((v, j) => v === frames[bank * 36 + heading][j]))
                throw Error(`${hull.id}: duplicated bank${bank} heading${heading}`);
            }
        layers.push({ suffix, frames: 108, width: im.width, height: im.height });
        if (!suffix && repaired.has(hull.id)) {
          ctx.fillStyle = 'white';
          ctx.fillText(`${hull.id} ${hull.name} | level / right / left`, 5, row * 160 + 18);
          for (let bank = 0; bank < 3; bank++)
            for (let h = 0; h < 3; h++) {
              const i = bank * 36 + h * 12,
                drawSize = 130;
              ctx.drawImage(
                im,
                (i % 12) * s.fs,
                Math.floor(i / 12) * s.fs,
                s.fs,
                s.fs,
                (bank * 3 + h) * 133,
                row * 160 + 25,
                drawSize,
                drawSize,
              );
            }
          row++;
        }
      }
      const rate = shipStats(A, makeLoadout(A, hull.id)).turn;
      for (const direction of [-1, 1]) {
        const e = { a: 0, t: 0 };
        let bank = 0;
        for (let sample = 0; sample < 30; sample++) {
          e.t = (sample * 1000) / 15;
          e.a = (direction * rate * e.t) / 1000;
          bank = shipBank(e, e.t);
        }
        if (bank !== (direction > 0 ? 1 : 2))
          throw Error(`${hull.id}: stock turn did not select correct bank`);
        const frame = bank * 36 + 35;
        if (frame >= 108) throw Error(`${hull.id}: bank reads outside sheet`);
      }
      proof.push({ id: hull.id, name: hull.name, rate, layers });
    }
    return { hulls: proof.length, repaired: row, proof, contact: contact.toDataURL('image/png') };
  });
  assert.equal(result.hulls, 122);
  assert.equal(result.repaired, 17);
  fs.writeFileSync(
    path.join(out, 'fleet-banks.png'),
    Buffer.from(result.contact.split(',')[1], 'base64'),
  );
  delete result.contact;
  fs.writeFileSync(path.join(out, 'RESULTS.json'), JSON.stringify(result, null, 2));
  console.log(
    'Ship turning assets: all122 hulls decode108 nonempty/distinct base frames, matched glow geometry, both stock-rate runtime bank signals;17 repaired hull contact sheet.',
  );
} catch (error) {
  await failureEvidence(browser, out, error);
  throw error;
} finally {
  await cleanup(server, browser, log, dir);
}
