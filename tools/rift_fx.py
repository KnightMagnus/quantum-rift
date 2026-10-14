"""Quantum Rift 2.5: pre-rendered combat effects in the EV Nova manner.
  boom_a, boom_b   24-frame fireball animations (billowing puffs of noise, white-hot to smoke), 6x4 sheets of 160 px
  boom_big         a 24-frame capital-ship blast with a flash core and long smoke, 6x4 sheet of 224 px
  shards           8 rendered hull fragments (48 px each, one row) for explosion debris
  flare            a lens flare sprite for hits and muzzle flashes (128 px)
usage: python3 tools/rift_fx.py client/assets/fx      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_noise import Perlin3, fbm, smooth, ramp
from rift_render3d import render, mat, loft, Mesh

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/fx'; os.makedirs(OUT, exist_ok=True)
FIRE = [(0.0, (255, 255, 245)), (0.18, (255, 236, 160)), (0.38, (255, 170, 60)), (0.58, (230, 80, 20)), (0.75, (110, 35, 15)), (0.9, (45, 30, 26)), (1.0, (30, 26, 24))]

def fireball(size, frames, seed, puffs=12, big=False):
    r = np.random.default_rng(seed); P = Perlin3(seed); P2 = Perlin3(seed + 1); SSm = 2; N = size * SSm
    lin = (np.arange(N) + 0.5) / N * 2 - 1; X, Y = np.meshgrid(lin, lin)
    pf = [(r.normal(0, 0.13), r.normal(0, 0.13), r.uniform(0.3, 0.5), r.uniform(0, 100)) for _ in range(puffs)]
    out = []
    for i in range(frames):
        t = (i + 0.5) / frames; grow = 1 - (1 - t) ** 2.4
        dens = np.zeros((N, N)); heat = np.zeros((N, N))
        warp = fbm(P2, X * 2.0, Y * 2.0, t * 0.8, 3) * 0.25
        for (px, py, pr, ph) in pf:
            cx, cy = px * (0.5 + grow * 1.4), py * (0.5 + grow * 1.4); rad = pr * (0.22 + 0.95 * grow) * (1.2 if big else 1.0)
            d = np.hypot(X + warp - cx, Y - warp - cy) / rad
            n = fbm(P, X * 2.6 + ph, Y * 2.6 - ph, t * 1.4 + ph * 0.1, 4) * 0.6 + fbm(P2, X * 7 + ph, Y * 7, t * 2 + ph, 3) * 0.35
            ball = np.clip(1 - d + n * 0.9, 0, 1)
            dens = np.maximum(dens, smooth(0.0, 0.3, ball)); heat = np.maximum(heat, ball * (1 - np.clip(d, 0, 1) * 0.5))
        temp = np.clip(heat * 1.35 - t * 1.15 + 0.15, 0, 1)
        col = ramp(1 - temp, FIRE) / 255
        alpha = dens * (smooth(1.0, 0.55, t) * 0.85 + 0.15 * smooth(1.0, 0.9, t))
        if big and t < 0.25:
            core = np.exp(-(X * X + Y * Y) / (0.04 + t * 0.9)) * (1 - t / 0.25); col = col + core[..., None]; alpha = np.maximum(alpha, np.clip(core, 0, 1))
        sh = 1 - 0.3 * smooth(-0.6, 0.8, X + Y) * (1 - temp)
        col = np.clip(col * sh[..., None], 0, 1.5)
        rgba = np.dstack([np.clip(col, 0, 1), np.clip(alpha, 0, 1)])
        rgba = rgba.reshape(size, SSm, size, SSm, 4).mean((1, 3)); out.append(rgba)
    return out
def sheet(frames, cols, name):
    s = frames[0].shape[0]; rows = (len(frames) + cols - 1) // cols; S = np.zeros((rows * s, cols * s, 4))
    for i, f in enumerate(frames): S[(i // cols) * s:(i // cols + 1) * s, (i % cols) * s:(i % cols + 1) * s] = f
    Image.fromarray((S * 255).round().astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=84, method=6); print(name)

sheet(fireball(160, 24, 11), 6, 'boom_a')
sheet(fireball(160, 24, 23, puffs=9), 6, 'boom_b')
sheet(fireball(224, 24, 37, puffs=16, big=True), 6, 'boom_big')

# hull fragments
HULLM = mat((0.55, 0.57, 0.6), metal=0.6, panel=2.0, grime=2.0); BURN = mat((0.35, 0.28, 0.24), metal=0.4, panel=1.0, grime=3.0)
r = np.random.default_rng(5); tiles = []
for i in range(8):
    k = 5 + r.integers(0, 3); ang = np.sort(r.uniform(0, 2 * math.pi, k)); rad = r.uniform(0.5, 1.0, k)
    pts = [(math.cos(a) * q, math.sin(a) * q * 0.7) for a, q in zip(ang, rad)]
    V = [(0, 0, 0.12)] + [(x, y, 0.06) for x, y in pts] + [(0, 0, -0.06)] + [(x * 0.95, y * 0.95, -0.02) for x, y in pts]
    F = [(0, 1 + j, 1 + (j + 1) % k) for j in range(k)] + [(k + 1, k + 2 + (j + 1) % k, k + 2 + j) for j in range(k)]
    F += [(1 + j, k + 2 + j, 1 + (j + 1) % k) for j in range(k)] + [(1 + (j + 1) % k, k + 2 + j, k + 2 + (j + 1) % k) for j in range(k)]
    m = Mesh(V, F, HULLM if i % 3 else BURN); o = render([m], 48, r.uniform(0, 360), 20, tilt=r.uniform(20, 70), density=14, ss=3)
    rgb, a = o[0]; tiles.append(np.dstack([np.clip(rgb, 0, 1), a]))
sheet(tiles, 8, 'shards')

# lens flare
N = 128; lin = (np.arange(N) + 0.5) / N * 2 - 1; X, Y = np.meshgrid(lin, lin); R = np.hypot(X, Y)
core = np.exp(-R / 0.06) + 0.5 * np.exp(-R / 0.22); streak = np.exp(-np.abs(Y) / 0.012) * np.exp(-np.abs(X) / 0.55) * 0.8 + np.exp(-np.abs(X) / 0.012) * np.exp(-np.abs(Y) / 0.35) * 0.35
ring = np.exp(-((R - 0.55) / 0.03) ** 2) * 0.12
v = np.clip(core + streak + ring, 0, 1); rgba = np.dstack([np.ones_like(v), np.ones_like(v) * 0.95, np.ones_like(v) * 0.85, v])
Image.fromarray((rgba * 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, 'flare.webp'), 'WEBP', quality=90); print('flare')
