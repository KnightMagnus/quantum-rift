"""Render the Freefolk and Unsworn hulls as game sprite sheets, the same way tools/ships26/rift_ships26.py renders every other hull.

For each hull it writes, into <game dir>/client/assets/ships/:
  <id>.webp        base sheet: 12 columns, 108 frames = three roll sets (level, right -28, left +28) of 36 headings
  <id>_glow.webp   matching engine-glow sheet
  <id>_yard.webp   200x200 shipyard picture, nose toward the lower left like the other yard pictures
and merges { key, fs, cols, banks, glow, packed } for each id into ff_sprites.json beside this script.

usage: PYTHONHASHSEED=0 python3 rift_ff_sheets.py <ships26 dir> <game dir> [procs] [ids...]   (needs numpy and Pillow)"""
import sys, os, json
HERE = os.path.dirname(os.path.abspath(__file__))
SHIPS26 = os.path.abspath(sys.argv[1]); os.environ['RIFT_SHIPS26'] = SHIPS26
sys.path.insert(0, SHIPS26); sys.path.insert(0, HERE)
import numpy as np
from PIL import Image
import hulls2
import hulls_freefolk as F
from artgen3 import build
from render2 import render

# Hull IDs: Freefolk 1040-1048, Unsworn 1050-1055. Unused in the game at release 0.6.
IDS = {key: 1040 + i for i, (key, *_) in enumerate(F.FREEFOLK)}
IDS.update({key: 1050 + i for i, (key, *_) in enumerate(F.UNSWORN)})
hulls2.DESIGNS.update({key: fn for key, *_, fn in F.ALL})   # so artgen3.build() can find them
KEY_OF = {v: k for k, v in IDS.items()}
ROLLS = (0, -28, 28)
COLS = 12

def out_size(size): return max(size, min(size * 2, 200))   # same frame-size rule as rift_ships26.py

def layers(o):
    rgb, a = o[0]
    lr, la = o[2]; rgb = np.where(la[..., None] > 0.2, lr, rgb); a = np.maximum(a, (la > 0.2) * 1.0)
    base = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1) * 255]).astype(np.uint8)
    gr, ga = o[1]; m = gr.max(axis=2); gal = np.clip(m * 2, 0, 1) * np.clip(ga * 1.3, 0, 1)
    glow = np.dstack([np.clip(gr, 0, 1) * 255, gal * 255]).astype(np.uint8)
    return base, glow

def yard(M, G, L, size, sc, dens):
    """Shipyard picture: 200x200, heading 215, tilt 55, fills about 92% of the frame (as artgen3 does)."""
    S = 200; o = render(M + G + L, S, 215, sc * (S * 0.92) / size, tilt=55, density=dens * 1.2, ss=3)
    rgb, a = o[0]
    for lay in (1, 2):
        lr, la = o[lay]; rgb = np.where(la[..., None] > 0.3, lr, rgb); a = np.maximum(a, (la > 0.3) * 1.0)
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1) * 255]).astype(np.uint8), 'RGBA')
    return im

def one(hid):
    key = KEY_OF[hid]; M, G, L, size, sc, dens, ymax = build(key)
    fs = out_size(size); k = fs / size; n = 36 * len(ROLLS); rows = n // COLS
    base = Image.new('RGBA', (fs * COLS, fs * rows)); glow = Image.new('RGBA', (fs * COLS, fs * rows))
    for r, roll in enumerate(ROLLS):
        for i in range(36):
            o = render(M + G + L, fs, i * 10, sc * k, roll=roll, density=dens * k, ss=3 if fs < 120 else 2)
            b, g = layers(o); idx = r * 36 + i; at = ((idx % COLS) * fs, (idx // COLS) * fs)
            base.paste(Image.fromarray(b, 'RGBA'), at); glow.paste(Image.fromarray(g, 'RGBA'), at)
    return hid, key, fs, base, glow, yard(M, G, L, size, sc, dens)

if __name__ == '__main__':
    if os.environ.get('PYTHONHASHSEED') != '0': raise SystemExit('Set PYTHONHASHSEED=0 for deterministic greebles')
    game = sys.argv[2]; procs = int(sys.argv[3]) if len(sys.argv) > 3 else 2
    ids = [int(x) for x in sys.argv[4:]] or sorted(KEY_OF)
    D = os.path.join(game, 'client', 'assets', 'ships'); os.makedirs(D, exist_ok=True)
    meta_f = os.path.join(HERE, 'ff_sprites.json')
    meta = json.load(open(meta_f)) if os.path.exists(meta_f) else {}
    from multiprocessing import Pool
    with Pool(procs, maxtasksperchild=1) as p:
        for hid, key, fs, base, glow, yd in p.imap_unordered(one, ids):
            base.save(os.path.join(D, f'{hid}.webp'), 'WEBP', quality=90, method=6)
            glow.save(os.path.join(D, f'{hid}_glow.webp'), 'WEBP', quality=85, method=6)
            yd.save(os.path.join(D, f'{hid}_yard.webp'), 'WEBP', quality=90, method=6)
            meta[str(hid)] = {'key': key, 'fs': fs, 'cols': COLS, 'banks': True, 'glow': True, 'packed': True}
            json.dump(meta, open(meta_f, 'w'), indent=1); print('done', hid, key, fs, flush=True)
