#!/usr/bin/env python3
"""Import the owner's Songs.zip (ffmpeg/ffprobe required; never generates music).

python3 tools/import_radio.py --archive /path/Songs.zip --album-order /path/album-order.json
The album-order JSON records the linked playlist's published position/title fields.
Writes game assets, shared/radio-stations.ts and docs/RADIO-AUDIO.json.
"""
import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile
import zipfile

IDS = ['wave-function-collapse', 'qvri', 'interdimensional', 'signal-superposition', 'super-idol']
NAMES = ['Wave Function Collapse', "QVRI Que'vari Radio", 'Interdimensional Radio', 'Signal Superposition Radio', 'Super-Idol Radio']
SUBS = ['Your shipboard station', "Broadcasts from Que'vari space", 'A very unusual little receiver', 'A transmission from Lost Signal', 'The Spacepop tour album · in order']
COUNTS = [7, 4, 7, 6, 8]

def digest(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size,bit_rate:format_tags=title,track', '-show_entries', 'stream=codec_name,sample_rate,channels', '-of', 'json', str(p)]))

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--album-order', type=Path, required=True)
    parser.add_argument('--output-root', type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.output_root.resolve()
    album = json.loads(args.album_order.read_text())
    assert [int(t['position']) for t in album] == list(range(1, 9)), 'Need all eight published album positions'
    stations = [dict(id=id, name=name, sub=sub, playback='album' if i == 4 else 'shuffle', tracks=[]) for i, (id, name, sub) in enumerate(zip(IDS, NAMES, SUBS))]
    with tempfile.TemporaryDirectory(prefix='rift-owner-audio-') as temp:
        source = Path(temp)
        with zipfile.ZipFile(args.archive) as archive:
            for f in archive.infolist():
                target = (source / f.filename).resolve()
                assert target.is_relative_to(source), 'Unsafe archive path'
                if not f.is_dir():
                    assert target.suffix.lower() in ['.mp3', '.flac'], 'Unexpected archive file'
                    assert f.file_size < 100_000_000, 'Unexpected source size'
                    archive.extract(f, source)
        jobs = []
        for i, station in enumerate(stations):
            folders = list((source / 'Songs').glob(f'Station {i+1} *'))
            assert len(folders) == 1
            files = sorted(p for p in folders[0].iterdir() if p.is_file())
            assert len(files) == COUNTS[i], f'Unexpected station {i+1} track count'
            if i == 4:
                files.sort(key=lambda p: int(probe(p)['format']['tags']['track']))
                assert [int(probe(p)['format']['tags']['track']) for p in files] == list(range(1, 9))
            for n, f in enumerate(files, 1):
                relative = f'client/assets/radio/{station["id"]}/{n:02}.mp3'
                track = dict(url='/' + relative.removeprefix('client/'))
                if i == 4:
                    track['title'] = album[n-1]['title']
                station['tracks'].append(track)
                jobs.append((f, relative, station['id'], n))
        themes = list((source / 'Songs' / 'Login Theme').glob('*.mp3'))
        assert len(themes) == 1, 'Exactly one separate login theme required'
        jobs.append((themes[0], 'client/assets/sfx/music_login33.mp3', 'login-theme', 1))

        def convert(job):
            original, relative, station, number = job
            target = root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            pending = target.with_suffix('.pending.mp3')
            # No trimming, looping, gain or tempo edits. Strip source titles/artwork
            # so stations1–4 cannot reveal song names in native media metadata either.
            subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(original), '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-ac', '2', '-ar', '44100', '-codec:a', 'libmp3lame', '-b:a', '128k', '-write_xing', '1', str(pending)], check=True)
            info = probe(pending)
            before = probe(original)
            duration = float(info['format']['duration'])
            assert abs(duration - float(before['format']['duration'])) < 0.15, 'Unexpected duration change'
            assert len(info['streams']) == 1 and info['streams'][0]['codec_name'] == 'mp3'
            assert info['streams'][0]['channels'] == 2
            pending.replace(target)
            print(f'Converted {station} {number:02}: {target.stat().st_size} bytes', flush=True)
            return dict(station=station, number=number, source=str(original.relative_to(source)), sourceBytes=original.stat().st_size, sourceSha256=digest(original), path=relative, bytes=target.stat().st_size, sha256=digest(target), duration=round(duration, 3))

        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            converted = list(pool.map(convert, jobs))
    registry = '// Owner-supplied audio. Stations 1–4 intentionally contain no song titles.\nexport const RADIO_STATIONS = ' + json.dumps(stations, ensure_ascii=False, indent=2) + ";\nexport const STARTER_RADIO = RADIO_STATIONS[0].id;\nexport const SCIENTIST_STORY = 'sideways-apology';\n"
    (root / 'shared/radio-stations.ts').write_text(registry)
    manifest = dict(sourceUrl='https://filebin.net/7ska2yl46u4c2pgl', archiveSha256=digest(args.archive), rights='Supplied by the game owner, who confirms commercial rights to all recordings and lyrics.', artist='Isekai Bum', albumOrderUrl='https://music.youtube.com/playlist?list=OLAK5uy_lkakAvDQ-FvwPtZQ6gkHf62lgkzycp-iI', conversion=dict(codec='MP3', bitrate=128000, sampleRate=44100, channels=2, edits='No trimming, stretching, gain changes or generated audio; metadata/artwork removed.'), sourceBytes=sum(t['sourceBytes'] for t in converted), bytes=sum(t['bytes'] for t in converted), tracks=converted)
    (root / 'docs/RADIO-AUDIO.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(dict(files=len(converted), sourceBytes=manifest['sourceBytes'], gameBytes=manifest['bytes'])), flush=True)

if __name__ == '__main__':
    main()
