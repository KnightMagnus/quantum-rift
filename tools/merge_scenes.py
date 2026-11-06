"""Merge scene files into the game's shared/system-scenes.json, replacing the entries with the same system id.
usage: python3 merge_scenes.py <game dir> <scenes dir>"""
import json, os, sys
game, scenes = sys.argv[1], sys.argv[2]
path = os.path.join(game, 'shared', 'system-scenes.json')
raw = open(path).read(); data = json.loads(raw)
n = 0
for f in sorted(os.listdir(scenes)):
    if not f.endswith('.json'): continue
    entry = json.load(open(os.path.join(scenes, f)))
    sid = entry.get('id', f[:-5])
    if sid not in data: print('note: %s is not in the game yet; adding it' % sid)
    data[sid] = entry; n += 1
with open(path, 'w') as out:
    json.dump(data, out, ensure_ascii=False, indent=2 if raw.startswith('{\n') else None)
    out.write('\n' if raw.endswith('\n') else '')
print('merged', n, 'scenes into', path)
