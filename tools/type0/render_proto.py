"""Render the prototypes and their Concord descendants the same way: hero 3/4 view, plan view and in-game-size sprite.
Usage: render_proto.py <ships26 dir> <out dir> <hero px> <ss> [keys...]"""
import sys, os
REPO, OUT = sys.argv[1], sys.argv[2]; os.environ['RIFT_SHIPS26'] = REPO
HERO, SS = int(sys.argv[3]), int(sys.argv[4])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import hulls_proto as H
from render2 import render
from render_nhal import comp

def rad(M):
    V = np.concatenate([m.V for m in M]); return np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2 + (V[:, 2] * 0.8) ** 2).max()

def build(kind, key, fn_name):
    if kind == 'proto':
        return getattr(H, fn_name)()
    import hulls2, hulls22  # hulls22 registers the 820s
    M, G, L, size = hulls2.DESIGNS[key]()
    if any(isinstance(l, tuple) for l in L): L = hulls2.auto_lights(M)
    return M, G, L, size

def one(job):
    kind, key, src, fn_name = job
    M, G, L, size = build(kind, src, fn_name)
    r = rad(M); name = key if kind == 'proto' else 'concord_' + src
    comp(render(M + G + L, HERO, 205, HERO * 0.44 / r, tilt=55, ss=SS, density=max(2.5, HERO / 18))).save(os.path.join(OUT, name + '_hero.png'))
    if kind == 'proto':
        comp(render(M + G + L, HERO // 2, 0, HERO // 2 * 0.47 / r, tilt=0, ss=SS, density=max(2.5, HERO / 36))).save(os.path.join(OUT, name + '_plan.png'))
        fs = max(size, min(size * 2, 200))
        comp(render(M + G + L, fs, 0, fs * 0.47 / r, ss=3 if fs < 120 else 2, density=max(2.5, fs / 18))).save(os.path.join(OUT, name + '_sprite.png'))
    return name

if __name__ == '__main__':
    from multiprocessing import Pool
    sel = sys.argv[5:]
    jobs = []
    for key, name, src, sid, role, fn in H.PROTO:
        if sel and key not in sel and 'concord_' + src not in sel: continue
        if not sel or key in sel: jobs.append(('proto', key, src, fn.__name__))
        if not sel or 'concord_' + src in sel: jobs.append(('orig', key, src, fn.__name__))
    os.makedirs(OUT, exist_ok=True)
    with Pool(4) as p:
        for k in p.imap_unordered(one, jobs): print('done', k, flush=True)
