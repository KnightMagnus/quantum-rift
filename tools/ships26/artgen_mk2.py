"""Mk II refit variants: gold refit stripe + extra plating/greebles on every purchasable hull."""
import sys, os, pickle, copy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import render2, hulls2
from hulls2 import DESIGNS, greebles, DARK
import artgen3
GOLD = (0.92, 0.74, 0.28)
KEYS = ['gnat', 'dory', 'kestrel', 'mule', 'wayfarer', 'cutlass', 'lacewing', 'crawler', 'bramble', 'barge', 'halberd', 'pilgrim', 'hive', 'tempest', 'bastion']
def mk2(key):
    def make():
        M, G, L, size = DESIGNS[key]()
        hull = M[0]
        m = copy.deepcopy(render2.MATS[hull.m]); m['stripe'] = (-0.32, -0.18, GOLD)
        render2.MATS.append(m); hull.m = len(render2.MATS) - 1
        V = np.concatenate([x.V for x in M])
        x1 = max(0.08, np.percentile(np.abs(V[:, 0]), 70)); y0, y1 = np.percentile(V[:, 1], 15), np.percentile(V[:, 1], 80)
        ztop = np.percentile(V[:, 2], 85)
        M += greebles(hash(key) % 1000 + 99, 10 + size // 12, ((-x1 * 0.8, x1 * 0.8), (y0, y1)), DARK, size=(0.03, 0.05, 0.015), zfn=lambda x, y: ztop)
        return M, G, L, size
    return make
for k in KEYS: DESIGNS[k + '_mk2'] = mk2(k)
if __name__ == '__main__':
    from multiprocessing import Pool
    keys = sorted([k + '_mk2' for k in KEYS], key=lambda k: -DESIGNS[k]()[3])
    res = {}
    with Pool(2) as p:
        for k, o in p.imap_unordered(artgen3.ship_art, keys):
            res[k] = o; print('done', k, flush=True)
    pickle.dump(res, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'art_mk2.pkl'), 'wb')); print('ALL DONE')
