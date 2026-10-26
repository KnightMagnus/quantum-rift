// Owner audio delivery/provenance checks. Actual decoding is in radio-browser.mjs.
import assert from 'node:assert/strict';
import filesystem from 'node:fs';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
const manifest = JSON.parse(
  filesystem.readFileSync(new URL('../docs/RADIO-AUDIO.json', import.meta.url), 'utf8'),
);
assert.equal(
  manifest.archiveSha256,
  'e46f49c14c668eecb862dbe3e82176125324b9c3bba433833fc879dc242e9f9b',
);
assert.deepEqual(
  RADIO_STATIONS.map((session) => session.tracks.length),
  [9, 4, 7, 6, 8],
);
assert.deepEqual(
  RADIO_STATIONS.map((session) => session.playback),
  ['shuffle', 'shuffle', 'shuffle', 'shuffle', 'album'],
);
assert.deepEqual(
  RADIO_STATIONS[4].tracks.map((track2) => ('title' in track2 ? track2.title : undefined)),
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
    station.tracks.every((audioTrack) => !Object.hasOwn(audioTrack, 'title')),
    'stations 1–4 do not publish song titles',
  );
const expected = [
  ...RADIO_STATIONS.flatMap((session) =>
    session.tracks.map((audioTrack) => 'client' + audioTrack.url),
  ),
  'client/assets/sfx/music_login33.mp3',
];
assert.equal(expected.length, 35);
assert.equal(new Set(expected).size, 35);
assert.deepEqual(
  manifest.tracks.map((track3: { path: string }) => track3.path),
  expected,
);
let bytes = 0,
  sourceBytes = 0;
for (const track of manifest.tracks) {
  assert.match(track.path, /^client\/assets\/(radio\/[a-z-]+\/\d\d|sfx\/music_login33)\.mp3$/);
  const data = filesystem.readFileSync(new URL('../' + track.path, import.meta.url));
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
const audio = filesystem.readFileSync(new URL('../client/audio.ts', import.meta.url), 'utf8');
assert.match(audio, /load\('music_login33'\)/);
const original = filesystem.readFileSync(
  new URL('../client/assets/sfx/music_login31.mp3', import.meta.url),
);
assert.equal(
  crypto.createHash('sha256').update(original).digest('hex'),
  '28a15d4e7ffbbc38eb8ac40e3826cd9158878fdd7adeb7faacabeb17381cf65b',
  'original login theme preserved separately',
);
console.log(
  `PASS 35 owner-supplied MP3s/hashes and compressed sizes; exact 8-track published album order; hidden 1–4 titles; separate active new theme and preserved original`,
);

// Reimporting the original archive must retain later uploads and reject missing audio.
const importCheck = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    `
import importlib.util, pathlib, tempfile, json, shutil
spec = importlib.util.spec_from_file_location('radio_import', 'tools/import_radio.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
root = pathlib.Path.cwd()
extras = module.supplemental_tracks(root)
assert [track['number'] for track in extras] == [8, 9]
manifest = json.loads((root / 'docs/RADIO-AUDIO.json').read_text())
base = [track for track in manifest['tracks'] if track not in extras]
stations = [{'tracks': [{}] * count} for count in module.COUNTS]
module.append_supplemental(stations, base, extras)
assert base == manifest['tracks'], 'Reimport must preserve all output records and their order'
assert [len(station['tracks']) for station in stations] == [9, 4, 7, 6, 8]
assert stations[0]['tracks'][-1]['url'].endswith('/09.mp3')
with tempfile.TemporaryDirectory(prefix='rift-radio-import-') as directory:
    isolated = pathlib.Path(directory)
    (isolated / 'docs').mkdir()
    (isolated / 'docs/RADIO-AUDIO.json').write_text(json.dumps({'tracks': extras}))
    try:
        module.supplemental_tracks(isolated)
    except FileNotFoundError:
        pass
    else:
        raise AssertionError('Missing supplemental audio must stop a reimport')
    for track in extras:
        target = isolated / track['path']
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(root / track['path'], target)
    changed = isolated / extras[0]['path']
    data = bytearray(changed.read_bytes())
    data[-1] ^= 1
    changed.write_bytes(data)
    try:
        module.supplemental_tracks(isolated)
    except AssertionError as error:
        assert 'changed supplemental audio' in str(error)
    else:
        raise AssertionError('Changed supplemental audio must stop a reimport')
`,
  ],
  { encoding: 'utf8', timeout: 10000 },
);
assert.equal(
  importCheck.status,
  0,
  importCheck.stderr || importCheck.error?.message || 'Audio import check failed',
);
