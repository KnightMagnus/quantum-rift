#!/usr/bin/env python3
"""Package a clean, hydrated checkout; complete ZIP plus <=28 MB matching parts.
Includes Git-tracked files and freshly compiled dist modules. Source masters,
saves and dependencies outside those inventories cannot enter a release archive.
"""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--complete-only', action='store_true', help='Skip matching multipart archives')
    args = parser.parse_args()
    subprocess.run(['git','-C',str(ROOT),'diff','--quiet','HEAD','--'],check=True)
    # dist is intentionally untracked. Rebuild it rather than packaging stale
    # output or leaving players with a source-only archive that cannot launch.
    subprocess.run(['node',str(ROOT/'tools/build.ts')],cwd=ROOT,check=True)
    version = json.loads((ROOT/'package.json').read_text())['publicVersion']
    name = 'Quantum Rift v' + version
    out = args.output.resolve()
    out.mkdir(parents=True,exist_ok=True)
    lfs = {}
    for line in git('lfs','ls-files','-l').decode().splitlines():
        oid, _, filename = line.split(' ',2)
        lfs[filename] = oid
    records=[]
    for record in git('ls-files','--stage','-z').split(b'\0'):
        if not record: continue
        info, rawname = record.split(b'\t',1)
        mode, _, stage = info.decode().split()
        filename = rawname.decode()
        if mode not in ['100644','100755'] or stage != '0': raise ValueError('Unsupported Git entry: '+filename)
        if filename.split('/')[0] in ['.git','node_modules','data','solo-data','friend-data','.artifacts'] or filename.endswith('.log') or filename=='CONTINUE.md': raise ValueError('Private/runtime file tracked: '+filename)
        p=ROOT/filename
        if p.is_symlink() or not p.is_file(): raise ValueError('Missing/nonregular package file: '+filename)
        data=p.read_bytes()
        if data.startswith(b'version https://git-lfs.github.com/spec/v1'): raise ValueError('Unhydrated LFS asset: '+filename)
        digest=hashlib.sha256(data).hexdigest()
        if filename in lfs and lfs[filename]!=digest: raise ValueError('LFS hash mismatch: '+filename)
        if len(data)>27_000_000:raise ValueError('Individual file exceeds multipart limit: '+filename)
        records.append(dict(path=filename,size=len(data),sha256=digest,mode=int(mode[-3:],8)))
    compiled = ROOT/'dist'
    compiled_inventory = {'dist/server/seeds.json', 'dist/shared/assets.json', 'dist/shared/landscape-worlds.json', 'dist/shared/portrait-catalog.json', 'dist/shared/scenery-allocation.json', 'dist/shared/diversity-worlds.json', 'dist/nakama/quantum-rift.js', 'dist/nakama/quantum-rift.provenance.json'}
    for row in records:
        source = Path(row['path'])
        if source.parts[0] in ['server','shared','client'] and source.suffix in ['.js','.ts'] and not source.name.endswith('.d.ts'):
            compiled_inventory.add('dist/'+source.with_suffix('.js').as_posix())
    if compiled.is_symlink(): raise ValueError('Compiled output must not be a symlink')
    if not (compiled/'server/main.js').is_file(): raise ValueError('Missing compiled server entry')
    for p in sorted(compiled.rglob('*')):
        if p.is_symlink(): raise ValueError('Compiled output must not contain symlinks: '+str(p))
        if p.is_dir(): continue
        filename=p.relative_to(ROOT).as_posix()
        if not p.is_file() or filename not in compiled_inventory:
            raise ValueError('Unexpected compiled package file: '+filename)
        data=p.read_bytes()
        if len(data)>27_000_000: raise ValueError('Individual file exceeds multipart limit: '+filename)
        records.append(dict(path=filename,size=len(data),sha256=hashlib.sha256(data).hexdigest(),mode=0o644))
    if len({row['path'] for row in records}) != len(records): raise ValueError('Duplicate package path')
    records.sort(key=lambda r:r['path'])
    def write_zip(target,rows):
        with zipfile.ZipFile(target,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
            for row in rows:
                p=ROOT/row['path']
                info=zipfile.ZipInfo.from_file(p,arcname=name+'/'+row['path'])
                info.external_attr=(stat.S_IFREG|row['mode'])<<16
                info.compress_type=zipfile.ZIP_DEFLATED
                archive.writestr(info,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
        with zipfile.ZipFile(target) as archive:
            assert archive.testzip() is None
        print(str(target),flush=True)
    complete=out/(name+'.zip')
    write_zip(complete,records)
    outputs=[complete]
    if complete.stat().st_size>28_000_000 and not args.complete_only:
        groups=[[]]; size=0
        # Uncompressed budget leaves ample room for ZIP headers, even if audio cannot compress further.
        for row in records:
            if size+row['size']>27_000_000:
                groups.append([]);size=0
            groups[-1].append(row);size+=row['size']
        for i,group in enumerate(groups,1):
            target=out/(f'{name} part {i} of {len(groups)}.zip')
            write_zip(target,group)
            assert target.stat().st_size<28_000_000
            outputs.append(target)
    manifest=dict(version=version,head=git('rev-parse','HEAD').decode().strip(),root=name,lfsAssets=len(lfs),files=records,archives=[dict(name=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest()) for p in outputs])
    (out/'package-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print(f'Verified {len(records)} source and compiled files, {len(lfs)} hydrated LFS assets, complete ZIP and {len(outputs)-1} parts.',flush=True)

if __name__=='__main__':main()
