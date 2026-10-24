#!/usr/bin/env python3
"""Verify one complete release ZIP against its manifest before safe extraction."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import stat
import zipfile


def verify(archive_path, manifest_path, destination):
    manifest = json.loads(Path(manifest_path).read_text())
    archive_path = Path(archive_path)
    archive_record = next(row for row in manifest['archives'] if row['name'] == archive_path.name)
    if archive_path.stat().st_size != archive_record['bytes']:
        raise ValueError('Archive size mismatch')
    if hashlib.sha256(archive_path.read_bytes()).hexdigest() != archive_record['sha256']:
        raise ValueError('Archive hash mismatch')
    root = manifest['root']
    if len(PurePosixPath(root).parts) != 1 or root in ('', '.', '..') or '\\' in root:
        raise ValueError('Invalid archive root')
    records = {row['path']: row for row in manifest['files']}
    if len(records) != len(manifest['files']):
        raise ValueError('Duplicate manifest paths')
    destination = Path(destination)
    if destination.exists():
        raise ValueError('Extraction destination must not exist')
    with zipfile.ZipFile(archive_path) as archive:
        seen = set()
        for entry in archive.infolist():
            path = PurePosixPath(entry.filename)
            if '\\' in entry.filename or path.is_absolute() or '..' in path.parts or path.parts[0] != root:
                raise ValueError('Unsafe archive path')
            relative = path.relative_to(root).as_posix()
            if relative in seen or relative not in records:
                raise ValueError('Unexpected or duplicate archive entry: ' + relative)
            seen.add(relative)
            row = records[relative]
            mode = entry.external_attr >> 16
            if not stat.S_ISREG(mode) or stat.S_IMODE(mode) != row['mode']:
                raise ValueError('Archive mode mismatch: ' + relative)
            data = archive.read(entry)
            if len(data) != row['size'] or hashlib.sha256(data).hexdigest() != row['sha256']:
                raise ValueError('Archive content mismatch: ' + relative)
            if data.startswith(b'version https://git-lfs.github.com/spec/v1'):
                raise ValueError('Unhydrated release asset: ' + relative)
            if relative.split('/')[0] in ('node_modules', 'data', 'solo-data', 'friend-data', '.git', '.artifacts'):
                raise ValueError('Private or development files in release')
        if seen != records.keys():
            raise ValueError('Archive is incomplete')
        # Do not write anything until every path, byte, mode and inventory passes.
        for entry in archive.infolist():
            target = destination / entry.filename
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(entry))
            target.chmod(stat.S_IMODE(entry.external_attr >> 16))
    return {'head': manifest['head'], 'archiveSha256': archive_record['sha256'],
            'verifiedFiles': len(records), 'installed': str((destination / root).resolve())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(verify(args.archive, args.manifest, args.destination)))


if __name__ == '__main__':
    main()
