import sys, os, pickle
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from render2 import render, to555, encode_rled
from hulls2 import DESIGNS, auto_lights
import pict
ROLLS = (0, -28, 28)
def build(key):
    M, G, L, size = DESIGNS[key]()
    L = [l for l in L if not isinstance(l, tuple)] + (auto_lights(M) if any(isinstance(l, tuple) for l in L) else [])
    V = np.concatenate([m.V for m in M]); r = np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2 + (V[:, 2] * 0.8) ** 2).max()
    return M, G, L, size, size * 0.47 / r, max(2.5, size / 18), V[:, 1].max()
def ship_art(key):
    M, G, L, size, sc, dens, ymax = build(key)
    base, glow, lights = [], [], []
    for roll in ROLLS:
        for i in range(36):
            o = render(M + G + L, size, i * 10, sc, roll=roll, density=dens)
            base.append(to555(o[0][0], o[0][1] > 0.5))
            glow.append(to555(o[1][0], o[1][1] > 0.25, floor=0))
            lights.append(to555(o[2][0], o[2][1] > 0.2, floor=0))
    out = {'base': encode_rled(size, size, base), 'glow': encode_rled(size, size, glow), 'lights': encode_rled(size, size, lights),
           'nose': ymax * sc, 'size': size}
    for nm, (w, h, fill, hd) in {'yard': (200, 200, 0.92, 215), 'target': (160, 120, 0.9, 215)}.items():
        S = max(w, h); s2 = sc * (min(w, h) * fill) / size
        o = render(M + G + L, S, hd, s2, tilt=55, density=dens * 1.2)
        rgb, a = o[0]
        for lay in (1, 2):
            lr, la = o[lay]; rgb = np.where(la[..., None] > 0.3, lr, rgb); a = np.maximum(a, (la > 0.3) * 1.0)
        rgb = rgb * a[..., None]
        y0, x0 = (S - h) // 2, (S - w) // 2
        v, _ = to555(rgb[y0:y0 + h, x0:x0 + w], None, floor=0)
        out[nm] = pict.encode(w, h, v.tolist())
    return key, out
if __name__ == '__main__':
    from multiprocessing import Pool
    keys = sorted(DESIGNS, key=lambda k: -DESIGNS[k]()[3])
    res = {}
    with Pool(2) as p:
        for k, o in p.imap_unordered(ship_art, keys):
            res[k] = o; print('done', k, flush=True)
    pickle.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'art3.pkl'), 'wb')); print('ALL DONE')
