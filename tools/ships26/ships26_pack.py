"""After rift_ships26.py: re-encode the 2.6 ship sheets smaller, shrink the enemy-only hulls (old refits and Armada
escorts) back to their original frame size, and remove the old PNG sheets that the WebP sheets replace (the _yard
pictures stay). Updates ships26.json. usage: python3 ships26_pack.py <quantum-rift dir> [quality]"""
import os, sys, json
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__)); root = sys.argv[1]; Q = int(sys.argv[2]) if len(sys.argv) > 2 else 0   # 0: keep the sheets as rendered (full quality)
D = os.path.join(root, 'client', 'assets', 'ships'); mf = os.path.join(HERE, 'ships26.json'); meta = json.load(open(mf))
NPC = set(range(720, 735)) | set(range(745, 751)) | {757, 758, 759}
ORIG = {}
for h in meta:
    p = os.path.join(D, f'{h}.png')
    if os.path.exists(p): ORIG[h] = Image.open(p).size[0] // 6
before = after = 0
for h, m in meta.items():
    for suf in ('', '_glow'):
        p = os.path.join(D, f'{h}{suf}.webp')
        if not os.path.exists(p): continue
        before += os.path.getsize(p)
        if not Q: after += os.path.getsize(p); continue
        im = Image.open(p).convert('RGBA')
        if int(h) in NPC and h in ORIG and m['fs'] > ORIG[h] and not m.get('packed'):
            k = ORIG[h] / m['fs']; im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            if suf == '': m['fs_new'] = ORIG[h]
        im.save(p, 'WEBP', quality=Q if suf == '' else max(60, Q - 10), method=6); after += os.path.getsize(p)
    if 'fs_new' in m: m['fs'] = m.pop('fs_new')
    m['packed'] = True
    for suf in ('', '_glow'):
        p = os.path.join(D, f'{h}{suf}.png')
        if os.path.exists(p): os.remove(p)
json.dump(meta, open(mf, 'w')); print(f'{before / 1e6:.1f} MB -> {after / 1e6:.1f} MB')
