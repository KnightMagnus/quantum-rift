#!/usr/bin/env python3
"""Package a clean, hydrated checkout; complete ZIP plus <=28 MB matching parts.
Only Git-tracked files are included. Source masters, .git, saves and dependencies
outside that inventory cannot accidentally enter a release archive.
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
    args = parser.parse_args()
    subprocess.run(['git','-C',str(ROOT),'diff','--quiet','HEAD','--'],check=True)
    version = json.loads((ROOT/'package.json').read_text())['version']
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
        if filename.split('/')[0] in ['.git','node_modules','data','solo-data','.artifacts'] or filename.endswith('.log') or filename=='CONTINUE.md': raise ValueError('Private/runtime file tracked: '+filename)
        p=ROOT/filename
        if p.is_symlink() or not p.is_file(): raise ValueError('Missing/nonregular package file: '+filename)
        data=p.read_bytes()
        if data.startswith(b'version https://git-lfs.github.com/spec/v1'): raise ValueError('Unhydrated LFS asset: '+filename)
        digest=hashlib.sha256(data).hexdigest()
        if filename in lfs and lfs[filename]!=digest: raise ValueError('LFS hash mismatch: '+filename)
        if len(data)>27_000_000:raise ValueError('Individual file exceeds multipart limit: '+filename)
        records.append(dict(path=filename,size=len(data),sha256=digest,mode=int(mode[-3:],8)))
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
    if complete.stat().st_size>28_000_000:
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
    print(f'Verified {len(records)} tracked files, {len(lfs)} hydrated LFS assets, complete ZIP and {len(outputs)-1} parts.',flush=True)

if __name__=='__main__':main()
