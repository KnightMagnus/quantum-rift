"""Render Freefolk and Unsworn previews: hero 3/4 view, plan view and in-game-size sprite.
Usage: PYTHONHASHSEED=0 python3 render_ff.py <ships26 dir> <out dir> <hero px> <ss> [keys...]"""
import sys, os
os.environ['RIFT_SHIPS26'] = os.path.abspath(sys.argv[1]); OUT = sys.argv[2]; HERO, SS = int(sys.argv[3]), int(sys.argv[4])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
import hulls_freefolk as F
from render2 import render
from PIL import Image

def comp(output):
    rgb, alpha = output[0]
    light_rgb, light_alpha = output[2]
    rgb = np.where(light_alpha[..., None] > 0.2, light_rgb, rgb)
    alpha = np.maximum(alpha, (light_alpha > 0.2) * 1.0)
    glow_rgb, glow_alpha = output[1]
    glow = np.clip(glow_rgb.max(axis=2) * 2, 0, 1) * np.clip(glow_alpha * 1.3, 0, 1)
    color = np.clip(np.clip(rgb, 0, 1) * alpha[..., None] + glow_rgb * glow[..., None] * 0.9, 0, 1)
    return Image.fromarray(np.dstack([color * 255, np.clip(np.maximum(alpha, glow), 0, 1) * 255]).astype(np.uint8), 'RGBA')
FN = {k: fn for k, _, _, fn in F.ALL}
def rad(M):
    V = np.concatenate([m.V for m in M]); return np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2 + (V[:, 2] * 0.8) ** 2).max()
def one(key):
    M, G, L, size = FN[key](); r = rad(M)
    comp(render(M + G + L, HERO, 205, HERO * 0.44 / r, tilt=55, ss=SS, density=max(2.5, HERO / 18))).save(os.path.join(OUT, key + '_hero.png'))
    comp(render(M + G + L, HERO // 2, 0, HERO // 2 * 0.47 / r, tilt=0, ss=SS, density=max(2.5, HERO / 36))).save(os.path.join(OUT, key + '_plan.png'))
    fs = max(size, min(size * 2, 200))
    comp(render(M + G + L, fs, 0, fs * 0.47 / r, ss=3 if fs < 120 else 2, density=max(2.5, fs / 18))).save(os.path.join(OUT, key + '_sprite.png'))
    return key
if __name__ == '__main__':
    from multiprocessing import Pool
    keys = sys.argv[5:] or list(FN); os.makedirs(OUT, exist_ok=True)
    with Pool(4) as p:
        for k in p.imap_unordered(one, keys): print('done', k, flush=True)
