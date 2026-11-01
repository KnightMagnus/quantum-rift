import { launchChromium } from './helpers/chromium.ts';
// Decode every shipped hull and exercise real runtime bank signals against its sheet.
import assert from 'node:assert/strict';
import fileSystem from 'node:fs';
import operatingSystem from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

import {
  root,
  availablePort,
  evidenceDir,
  ready,
  cleanup,
  failureEvidence,
} from './helpers/browser-fixture.ts';
const output = evidenceDir('ship-turning-assets');
const directory = fileSystem.mkdtempSync(path.join(operatingSystem.tmpdir(), 'rift-ship-turning-'));
const port = await availablePort(),
  origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['server/local-main.ts'], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(port),
    DATA_DIR: directory,
    SOLO: '',
    SEEDS_FILE: '/nonexistent',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
const serverLog = fileSystem.createWriteStream(path.join(output, 'server.log'));
server.stdout.pipe(serverLog);
server.stderr.pipe(serverLog);
let browser;
try {
  await ready(server, origin);
  browser = await launchChromium({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  await page.goto(origin);
  const result = await page.evaluate(async () => {
    const [{ SPRITES }, { augmentAssets, makeLoadout, shipStats }, { shipBank }] =
      await Promise.all([
        import('/shared/sprites26.js'),
        import('/shared/rules.js'),
        import('/ship_banking.js'),
      ]);
    const assets: import('../shared/rules.ts').GameAssets = await (
      await fetch('/shared/assets.json')
    ).json();
    augmentAssets(assets);
    const repaired = new Set([
      717, 734, 736, 743, 744, 750, 769, 774, 779, 784, 785, 786, 787, 789, 792, 795, 804,
    ]);
    const contact = document.createElement('canvas');
    contact.width = 1200;
    contact.height = repaired.size * 160;
    const context = contact.getContext('2d');
    context!.fillStyle = '#11161d';
    context!.fillRect(0, 0, contact.width, contact.height);
    context!.font = '15px sans-serif';
    let record = 0;
    const proof = [];
    for (const hull of Object.values(assets.ships)) {
      const session = SPRITES[hull.id];
      if (!session) throw Error(`${hull.id}: missing sprite mapping`);
      if (hull.id < 900 && !session.banks) throw Error(`${hull.id}: existing banking mapping lost`);
      const layers = [];
      for (const suffix of ['', ...(session.glow ? ['_glow'] : [])]) {
        const image = new Image();
        image.src = `/assets/ships/${hull.id}${suffix}.webp`;
        await image.decode();
        const frameCount = session.banks ? 108 : 36;
        const validRows = session.banks ? [9] : [3, 9];
        if (
          image.width !== session.fs * session.cols ||
          !validRows.includes(image.height / session.fs)
        )
          throw Error(`${hull.id}${suffix}: incomplete${frameCount}-frame sheet`);
        // Read each decoded sheet once. Frame checks use the same unscaled pixels,
        // without redrawing the frame canvas and allocating a readback for every heading.
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const drawingContext = canvas.getContext('2d', { willReadFrequently: true })!;
        drawingContext.drawImage(image, 0, 0);
        const pixels = drawingContext.getImageData(0, 0, image.width, image.height).data;
        const rowBytes = session.fs * 4;
        const sheetRowBytes = image.width * 4;
        const frameStart = (index: number) =>
          Math.floor(index / session.cols) * session.fs * sheetRowBytes +
          (index % session.cols) * rowBytes;
        for (let index = 0; index < frameCount; index++) {
          let visible = false;
          const start = frameStart(index);
          for (let row = 0; row < session.fs && !visible; row++) {
            const offset = start + row * sheetRowBytes;
            for (let alpha = 3; alpha < rowBytes; alpha += 4)
              if (pixels[offset + alpha]! > 0) {
                visible = true;
                break;
              }
          }
          if (!suffix && !visible) throw Error(`${hull.id}: empty frame${index}`);
        }
        if (!suffix && session.banks)
          for (let bank = 1; bank <= 2; bank++)
            for (let heading = 0; heading < 36; heading++) {
              const neutralStart = frameStart(heading);
              const bankStart = frameStart(bank * 36 + heading);
              let identical = true;
              for (let row = 0; row < session.fs && identical; row++) {
                const neutralOffset = neutralStart + row * sheetRowBytes;
                const bankOffset = bankStart + row * sheetRowBytes;
                for (let byte = 0; byte < rowBytes; byte++)
                  if (pixels[neutralOffset + byte] !== pixels[bankOffset + byte]) {
                    identical = false;
                    break;
                  }
              }
              if (identical) throw Error(`${hull.id}: duplicated bank${bank} heading${heading}`);
            }
        layers.push({ suffix, frames: frameCount, width: image.width, height: image.height });
        if (!suffix && repaired.has(hull.id)) {
          context!.fillStyle = 'white';
          context!.fillText(`${hull.id} ${hull.name} | level / right / left`, 5, record * 160 + 18);
          for (let bank = 0; bank < 3; bank++)
            for (let headingGroup = 0; headingGroup < 3; headingGroup++) {
              const index = bank * 36 + headingGroup * 12,
                drawSize = 130;
              context!.drawImage(
                image,
                (index % 12) * session.fs,
                Math.floor(index / 12) * session.fs,
                session.fs,
                session.fs,
                (bank * 3 + headingGroup) * 133,
                record * 160 + 25,
                drawSize,
                drawSize,
              );
            }
          record++;
        }
      }
      const rate = shipStats(assets, makeLoadout(assets, hull.id))!.turn;
      for (const direction of session.banks ? [-1, 1] : []) {
        const entity = { a: 0, t: 0 };
        let bank = 0;
        for (let sample = 0; sample < 30; sample++) {
          entity.t = (sample * 1000) / 15;
          entity.a = (direction * rate * entity.t) / 1000;
          bank = shipBank(entity, entity.t);
        }
        if (bank !== (direction > 0 ? 1 : 2))
          throw Error(`${hull.id}: stock turn did not select correct bank`);
        const frame = bank * 36 + 35;
        if (frame >= 108) throw Error(`${hull.id}: bank reads outside sheet`);
      }
      proof.push({ id: hull.id, name: hull.name, rate, layers });
    }
    return {
      hulls: proof.length,
      repaired: record,
      proof,
      contact: contact.toDataURL('image/png'),
    };
  });
  assert.equal(result.hulls, 151);
  assert.equal(
    result.proof.filter((hull) => hull.id < 900 && (hull.id < 850 || hull.id > 853)).length,
    122,
    'all original hulls retain strict banking coverage',
  );
  assert.equal(
    result.proof.filter((hull) => hull.id >= 900 && hull.id !== 940).length,
    24,
    'every new combat form decodes its declared frames',
  );
  assert.deepEqual(
    result.proof
      .filter((hull) => hull.id >= 850 && hull.id <= 853)
      .map((hull) => hull.id)
      .sort((left, right) => left - right),
    [850, 851, 852, 853],
    'all four security hulls retain strict banking coverage',
  );
  assert.deepEqual(
    result.proof.filter((hull) => hull.id === 940).map((hull) => hull.name),
    ['Triad Sentinel'],
    'the station defense platform decodes its declared frames',
  );
  assert.equal(result.repaired, 17);
  fileSystem.writeFileSync(
    path.join(output, 'fleet-banks.png'),
    Buffer.from(result.contact.split(',')[1], 'base64'),
  );
  Reflect.deleteProperty(result, 'contact');
  fileSystem.writeFileSync(path.join(output, 'RESULTS.json'), JSON.stringify(result, null, 2));
  console.log(
    'Ship turning assets: 122 original and four security hulls retain 108-frame banking;24 faction forms decode declared level/bank frames and glow;one station defense platform;17 repaired hull contact sheet.',
  );
} catch (error) {
  await failureEvidence(browser, output, error);
  throw error;
} finally {
  await cleanup(server, browser, serverLog, directory);
}
