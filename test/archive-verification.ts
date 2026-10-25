import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tempDataDir } from './helpers/temp-data.ts';
const directory = tempDataDir('rift-archive-verification-');
const result = spawnSync(
  process.platform === 'win32' ? 'python' : 'python3',
  [
    '-c',
    String.raw`
import hashlib, importlib.util, json, pathlib, stat, sys, zipfile
spec=importlib.util.spec_from_file_location('verify_archive', 'tools/verify_archive.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
root=pathlib.Path(sys.argv[1]); payload=b'compiled application bytes'
base={'head':'fixture-head','root':'Quantum Rift fixture','files':[{'path':'dist/server/main.js','size':len(payload),'sha256':hashlib.sha256(payload).hexdigest(),'mode':420}]}
def fixture(name='Quantum Rift fixture/dist/server/main.js', content=payload, mode=stat.S_IFREG|420, duplicate=False):
    archive=root/'release.zip'
    with zipfile.ZipFile(archive,'w') as output:
        info=zipfile.ZipInfo(name); info.external_attr=mode<<16; output.writestr(info,content)
        if duplicate: output.writestr(info,content)
    manifest=dict(base, archives=[{'name':archive.name,'bytes':archive.stat().st_size,'sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}])
    manifest_path=root/'manifest.json'; manifest_path.write_text(json.dumps(manifest))
    return archive, manifest_path
archive, manifest=fixture(); destination=root/'valid'
verified=module.verify(archive,manifest,destination)
assert verified['verifiedFiles']==1 and (destination/base['root']/'dist/server/main.js').read_bytes()==payload
for index,args in enumerate([
    {'name':'Quantum Rift fixture/../escape'}, {'name':'/absolute'},
    {'name':'Quantum Rift fixture\\escape'}, {'mode':stat.S_IFLNK|420},
    {'content':b'changed'}, {'duplicate':True}, {'name':'Quantum Rift fixture/unexpected'},
]):
    archive,manifest=fixture(**args); destination=root/str(index)
    try: module.verify(archive,manifest,destination)
    except ValueError: pass
    else: raise AssertionError(args)
    assert not destination.exists(), 'Invalid archive must not partially extract'
archive,manifest=fixture(); archive.write_bytes(archive.read_bytes()+b'tampered')
try: module.verify(archive,manifest,root/'tampered')
except ValueError: pass
else: raise AssertionError('Tampered archive accepted')
print('PASS exact hash/inventory/bytes/modes, missing and traversal/symlink/duplicate/tamper rejection')
`,
    path.resolve(directory),
  ],
  { encoding: 'utf8' },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
console.log(result.stdout.trim());
