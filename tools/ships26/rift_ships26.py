"""Quantum Rift 2.6: re-render every ship sprite from its 3D design, in full colour, sharper, with banking frames.
Frame size: at least the original EV size, doubled up to 200 px. All hulls get three roll sets (level, rolling
right, rolling left) of 36 headings each, including large capital ships (3.0.5). Sheets are 12 frames wide.
Output: client/assets/ships/<id>.webp and <id>_glow.webp, plus ships26.json (frame size, banks) for shared/assets.json.
usage: python3 rift_ships26.py <quantum-rift dir> [procs] [ids...]      (needs numpy and Pillow)"""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import hulls2, hulls3, hulls5, hulls52, hulls08, hulls22, artgen_mk2   # artgen_mk2 registers the Mk II designs
from artgen3 import build
from render2 import render
HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = {int(k): v[1] for k, v in json.load(open(os.path.join(HERE, 'ship_keys.json'))).items()}
KEYS.update({735: 'surveyor', 736: 'constitution', 746: 'halberd_mk3', 748: 'hive_mk3', 749: 'tempest_mk3', 763: 'umbral_dread'})   # sprites the EV sheets shared
KEYS.update({805: 'sp_lodestar', 806: 'sp_swarmbreaker', 807: 'sp_nightglass', 808: 'sp_corsair', 809: 'sp_herald', 810: 'sp_tidecaller', 811: 'sp_pathfinder', 812: 'sp_bulwark', 813: 'sp_wraith', 814: 'sp_vanguard'})
KEYS.update({820: 'wasp', 821: 'swift', 822: 'pelican', 823: 'sabre', 824: 'caravel', 825: 'talon', 826: 'lighthouse', 827: 'monarch', 828: 'aegis', 829: 'vigil'})
ROLLS = (0, -28, 28)   # level, then the two roll sets in the order the EV Quantum sheets used
COLS = 12
NPC = set()   # Render every hull at high resolution.
def out_size(size, hid=0): return size if hid in NPC else max(size, min(size * 2, 200))
def layers(o):
    rgb, a = o[0]
    lr, la = o[2]; rgb = np.where(la[..., None] > 0.2, lr, rgb); a = np.maximum(a, (la > 0.2) * 1.0)
    base = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(a, 0, 1) * 255]).astype(np.uint8)
    gr, ga = o[1]; m = gr.max(axis=2); gal = np.clip(m * 2, 0, 1) * np.clip(ga * 1.3, 0, 1)
    glow = np.dstack([np.clip(gr, 0, 1) * 255, gal * 255]).astype(np.uint8)
    return base, glow
def one(hid):
    key = KEYS[hid]; M, G, L, size, sc, dens, ymax = build(key)
    fs = out_size(size, hid); k = fs / size; banks = True
    rolls = ROLLS if banks else ROLLS[:1]; n = 36 * len(rolls); rows = n // COLS
    base = Image.new('RGBA', (fs * COLS, fs * rows)); glow = Image.new('RGBA', (fs * COLS, fs * rows)); anyglow = False
    for r, roll in enumerate(rolls):
        for i in range(36):
            o = render(M + G + L, fs, i * 10, sc * k, roll=roll, density=dens * k, ss=3 if fs < 120 else 2)   # big frames need less supersampling
            b, g = layers(o); idx = r * 36 + i; at = ((idx % COLS) * fs, (idx // COLS) * fs)
            base.paste(Image.fromarray(b, 'RGBA'), at); glow.paste(Image.fromarray(g, 'RGBA'), at); anyglow = anyglow or g[..., 3].max() > 0
    return hid, fs, banks, base, glow if anyglow else None
if __name__ == '__main__':
    if os.environ.get('PYTHONHASHSEED') != '0': raise SystemExit('Set PYTHONHASHSEED=0 for deterministic greebles')
    root = sys.argv[1]; procs = int(sys.argv[2]) if len(sys.argv) > 2 else 4
    ids = [int(x) for x in sys.argv[3:]] or sorted(KEYS)
    D = os.path.join(root, 'client', 'assets', 'ships'); meta_f = os.path.join(HERE, 'ships26.json')
    meta = json.load(open(meta_f)) if os.path.exists(meta_f) else {}
    from multiprocessing import Pool
    with Pool(procs, maxtasksperchild=1) as p:
        for hid, fs, banks, base, glow in p.imap_unordered(one, ids):
            base.save(os.path.join(D, f'{hid}.webp'), 'WEBP', quality=90, method=6)
            if glow: glow.save(os.path.join(D, f'{hid}_glow.webp'), 'WEBP', quality=85, method=6)
            meta[str(hid)] = {'fs': fs, 'cols': COLS, 'banks': banks, 'glow': bool(glow)}
            json.dump(meta, open(meta_f, 'w')); print('done', hid, KEYS[hid], fs, 'banks' if banks else '', flush=True)
