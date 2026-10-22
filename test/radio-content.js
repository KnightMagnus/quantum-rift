// Owner audio delivery/provenance checks. Actual decoding is in radio-browser.mjs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
const manifest = JSON.parse(fs.readFileSync(new URL('../docs/RADIO-AUDIO.json', import.meta.url)));
assert.equal(
  manifest.archiveSha256,
  'e46f49c14c668eecb862dbe3e82176125324b9c3bba433833fc879dc242e9f9b',
);
assert.deepEqual(
  RADIO_STATIONS.map((s) => s.tracks.length),
  [7, 4, 7, 6, 8],
);
assert.deepEqual(
  RADIO_STATIONS.map((s) => s.playback),
  ['shuffle', 'shuffle', 'shuffle', 'shuffle', 'album'],
);
assert.deepEqual(
  RADIO_STATIONS[4].tracks.map((t) => t.title),
  [
    'You Fakku Youself',
    'Basso-Stoppu Rouza',
    'This Guy Is An Isekai Bum',
    'I Love You Like Ten Justin Bieber',
    'N3KOJ1T4',
    'Nail-Tech Kaisen',
    'TAKA2 MY HAND',
    'Do you have other "waifu"?',
  ],
);
for (const station of RADIO_STATIONS.slice(0, 4))
  assert.ok(
    station.tracks.every((t) => !Object.hasOwn(t, 'title')),
    'stations 1–4 do not publish song titles',
  );
const expected = [
  ...RADIO_STATIONS.flatMap((s) => s.tracks.map((t) => 'client' + t.url)),
  'client/assets/sfx/music_login33.mp3',
];
assert.equal(expected.length, 33);
assert.equal(new Set(expected).size, 33);
assert.deepEqual(
  manifest.tracks.map((t) => t.path),
  expected,
);
let bytes = 0,
  sourceBytes = 0;
for (const track of manifest.tracks) {
  assert.match(track.path, /^client\/assets\/(radio\/[a-z-]+\/\d\d|sfx\/music_login33)\.mp3$/);
  const data = fs.readFileSync(new URL('../' + track.path, import.meta.url));
  assert.equal(data.length, track.bytes);
  assert.ok(data.length > 100000, 'actual audio bytes, not a Git LFS pointer');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), track.sha256);
  assert.ok(track.duration > 0);
  const rate = (data.length * 8) / track.duration;
  assert.ok(rate > 127000 && rate < 130000, '128kbps game delivery copy');
  bytes += data.length;
  sourceBytes += track.sourceBytes;
}
assert.equal(manifest.bytes, bytes);
assert.equal(manifest.sourceBytes, sourceBytes);
assert.ok(bytes < sourceBytes * 0.4, 'at least 60% smaller than the supplied masters');
const audio = fs.readFileSync(new URL('../client/audio.ts', import.meta.url), 'utf8');
assert.match(audio, /load\('music_login33'\)/);
const original = fs.readFileSync(
  new URL('../client/assets/sfx/music_login31.mp3', import.meta.url),
);
assert.equal(
  crypto.createHash('sha256').update(original).digest('hex'),
  '28a15d4e7ffbbc38eb8ac40e3826cd9158878fdd7adeb7faacabeb17381cf65b',
  'original login theme preserved separately',
);
console.log(
  `PASS 33 owner-supplied MP3s/hashes and compressed sizes; exact 8-track published album order; hidden 1–4 titles; separate active new theme and preserved original`,
);
