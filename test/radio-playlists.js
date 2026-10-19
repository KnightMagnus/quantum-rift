import assert from 'node:assert/strict';
import {
  RADIO_STATIONS,
  createShuffle,
  createStationQueue,
  playStation,
  stopRadio,
  setRadioLevel,
  radioOn,
  setUnlockedStations,
} from '../client/radio.js';
// Player edge cases deliberately isolate empty/test playlists from shipped recordings.
for (const station of RADIO_STATIONS) station.tracks = [];
const songs = ['A', 'B', 'C', 'D'];
let seed = 1,
  previous;
const shuffle = createShuffle(songs, () => (seed = (seed * 16807) % 2147483647) / 2147483647);
for (let round = 0; round < 100; round++) {
  const seen = new Set();
  for (let i = 0; i < songs.length; i++) {
    const track = shuffle();
    assert.notEqual(track, previous);
    seen.add(track);
    previous = track;
  }
  assert.equal(seen.size, songs.length);
}
const album = createStationQueue({ playback: 'album', tracks: songs });
assert.deepEqual(
  Array.from({ length: 10 }, () => album()),
  ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D', 'A', 'B'],
);
assert.equal(createShuffle([])(), null);
assert.equal(createShuffle(['only'])(), 'only');
const created = [];
let blocked = false;
globalThis.document = { activeElement: null };
globalThis.Audio = class {
  constructor(src) {
    this.src = src;
    this.paused = true;
    created.push(this);
  }
  play() {
    this.paused = false;
    return blocked ? new Promise((r) => (this.resolve = r)) : Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  removeAttribute() {
    this.src = '';
  }
  load() {}
};
const target = {
  innerHTML: '',
  querySelector() {
    return { value: 0 };
  },
};
await playStation(RADIO_STATIONS[0], target);
assert.equal(created.length, 0);
assert.equal(radioOn(), false);
assert.match(target.innerHTML, /No recordings/);
const tracks = songs.map((title) => ({ title, url: '/assets/radio/test-' + title + '.mp3' }));
RADIO_STATIONS[0].tracks.push(...tracks);
RADIO_STATIONS[4].tracks.push(...tracks);
await playStation(RADIO_STATIONS[4], target);
assert.equal(created.length, 0, 'locked station cannot be played');
setUnlockedStations(RADIO_STATIONS.map((s) => s.id));
await playStation(RADIO_STATIONS[0], target);
assert.ok(radioOn());
assert.match(target.innerHTML, /SHUFFLE/);
assert.match(target.innerHTML, /♪ <b>Broadcast<\/b>/, 'stations 1–4 hide song titles');
let old = created.at(-1);
setRadioLevel(0, 0.75);
assert.equal(old.volume, 0);
setRadioLevel(0.3);
assert.equal(old.volume, 0.3);
const size = created.length;
await playStation(RADIO_STATIONS[0], target);
assert.equal(created.length, size, 'same playing station is uninterrupted');
const staleEnd = old.onended;
await playStation(RADIO_STATIONS[4], target);
assert.equal(old.src, '');
assert.ok(old.paused);
assert.match(target.innerHTML, /ALBUM LOOP/);
const start = created.length - 1;
for (let i = 0; i < 9; i++) {
  assert.equal(created.at(-1).src, tracks[i % 4].url);
  await created.at(-1).onended();
}
assert.equal(created.length, start + 10);
const noStale = created.length;
staleEnd();
assert.equal(created.length, noStale, 'old station cannot advance after retuning');
stopRadio(target);
assert.equal(radioOn(), false);
await playStation(RADIO_STATIONS[4], target);
assert.equal(created.at(-1).src, tracks[0].url, 'retuning starts the album at its first song');
setUnlockedStations([RADIO_STATIONS[0].id]);
assert.equal(radioOn(), false, 'switching captain stops a no-longer-unlocked station');
setUnlockedStations(RADIO_STATIONS.map((s) => s.id));
blocked = true;
const pending = playStation(RADIO_STATIONS[4], target),
  waiting = created.at(-1);
stopRadio(target);
waiting.resolve();
await pending;
assert.equal(radioOn(), false);
assert.match(target.innerHTML, /RADIO OFF/);
console.log(
  'PASS shuffle bags/no boundary repeats; ordered album loops/restarts; empty/locked stations; mixer; stale events; captain isolation; pending playback cancellation',
);
