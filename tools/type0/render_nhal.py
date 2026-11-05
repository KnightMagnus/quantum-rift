"""Render each Nhal concept: a large 3/4 hero view and an in-game-size top-down sprite. Usage: render_nhal.py <ships26 dir> <out dir> [keys...]"""
import sys, os
REPO, OUT = sys.argv[1], sys.argv[2]
os.environ['RIFT_SHIPS26'] = REPO
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
import importlib; H = importlib.import_module(os.environ.get('HULLMOD', 'hulls_nhal')); LIST = getattr(H, os.environ.get('HULLLIST', 'NHAL'))
from render2 import render

def comp(o):
    rgb, a = o[0]
    lr, la = o[2]; rgb = np.where(la[..., None] > 0.2, lr, rgb); a = np.maximum(a, (la > 0.2) * 1.0)
    gr, ga = o[1]; m = gr.max(axis=2); gal = np.clip(m * 2, 0, 1) * np.clip(ga * 1.3, 0, 1)
    base = np.clip(rgb, 0, 1) * a[..., None]
    out = np.clip(base + gr * gal[..., None] * 0.9, 0, 1)
    alpha = np.clip(np.maximum(a, gal), 0, 1)
    return Image.fromarray(np.dstack([out * 255, alpha * 255]).astype(np.uint8), 'RGBA')

def one(entry):
    key, name, role, fn = entry
    import importlib; fn = getattr(importlib.import_module(os.environ.get('HULLMOD', 'hulls_nhal')), fn.__name__)
    M, G, L, size = fn()
    V = np.concatenate([m.V for m in M]); r = np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2 + (V[:, 2] * 0.8) ** 2).max()
    hero = 520
    o = render(M + G + L, hero, 205, hero * 0.44 / r, tilt=58, ss=2, density=max(2.5, hero / 18))
    comp(o).save(os.path.join(OUT, key + '_hero.png'))
    fs = max(size, min(size * 2, 200))   # same frame-size rule as the 2.6 sheets
    o = render(M + G + L, fs, 0, fs * 0.47 / r, ss=3 if fs < 120 else 2, density=max(2.5, fs / 18))
    comp(o).save(os.path.join(OUT, key + '_sprite.png'))
    return key

if __name__ == '__main__':
    from multiprocessing import Pool
    keys = sys.argv[3:]
    todo = [e for e in LIST if not keys or e[0] in keys]
    os.makedirs(OUT, exist_ok=True)
    with Pool(4) as p:
        for k in p.imap_unordered(one, todo): print('done', k, flush=True)
