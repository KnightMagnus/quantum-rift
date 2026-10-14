"""Quantum Rift 2.5: rendered space objects. Asteroids (ten lumpy rocks, plain and crystal-studded) and floating loot
(credits, salvage crate, ore, gas canister, crystal shards, hostile loot chest), in the hull pipeline's lit 3D style.
Output: client/assets/objects/rock<n>.webp, crys<n>.webp, loot<k>.webp
usage: python3 tools/rift_objects.py client/assets/objects      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh
from rift_noise import Perlin3, fbm
import rift_stations as RS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/objects'; os.makedirs(OUT, exist_ok=True)
def save(M, name, size, tilt=40, heading=30, k=0.42):
    V = np.concatenate([m.V for m in M]); ext = np.abs(V).max() or 1
    o = render(M, size, heading, size * k / ext, tilt=tilt, density=10, ss=3); rgb, a = o[0]
    Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).round().astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6); print(name)
def rock(seed, m, elong=1.0):
    P = Perlin3(seed); r = np.random.default_rng(seed)
    s = sphere((0, 0, 0), 1.0, m)
    # a denser sphere: loft with more rings
    secs = [(math.cos(t), 0, 0, math.sin(t) + 1e-3, math.sin(t) + 1e-3, 2) for t in np.linspace(0, math.pi, 30)][::-1]
    s = loft(secs, m, ring=40)
    def f(V):
        n = np.linalg.norm(V, axis=1, keepdims=True) + 1e-9; d = V / n
        h = 1 + 0.55 * fbm(P, d[:, 0] * 1.3, d[:, 1] * 1.3, d[:, 2] * 1.3, 4)[:, None] + 0.14 * fbm(P, d[:, 0] * 5, d[:, 1] * 5, d[:, 2] * 5, 3)[:, None]
        for _ in range(4):   # a few craters
            c = r.normal(size=3); c /= np.linalg.norm(c); dd = np.arccos(np.clip(d @ c, -1, 1)) / r.uniform(0.25, 0.5)
            h = h - (0.2 * np.clip(1 - dd * dd, 0, 1))[:, None] + (0.06 * np.exp(-((dd - 1) / 0.15) ** 2))[:, None]
        out = d * h; out[:, 1] *= elong; return out
    return s.tf(f)
ROCKM = [mat((0.42, 0.38, 0.33), metal=0.05, panel=0, rough=0.9, grime=0.5), mat((0.36, 0.33, 0.31), metal=0.1, panel=0, rough=0.85, grime=0.5), mat((0.5, 0.42, 0.34), metal=0.05, panel=0, rough=0.9, grime=0.5)]
for i in range(10): save([rock(100 + i, ROCKM[i % 3], 1.0 + 0.15 * (i % 4))], f'rock{i}', 128, tilt=30 + i * 5, heading=i * 37)
CR = [RS.CRYS, RS.CRYS2, mat((0.5, 0.85, 0.9), metal=0.9, panel=0, rough=0.06, grime=0)]
for i in range(4):
    M = [rock(200 + i, ROCKM[1])]; r = np.random.default_rng(i)
    for j in range(6):
        d = r.normal(size=3); d /= np.linalg.norm(d); L = r.uniform(0.9, 1.4); w = r.uniform(0.14, 0.24)
        sh = loft([(0, 0, 0, w, w * 0.8, 0.9), (L * 0.75, 0, 0, w * 0.75, w * 0.6, 0.9), (L, 0, 0, 0.003, 0.003, 0.9)], CR[(i + j) % 3], ring=6, axis='x')
        ax = np.array([1.0, 0, 0]); v = np.cross(ax, d); c = ax @ d; vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); R = np.eye(3) + vx + vx @ vx / (1 + c + 1e-9)
        M += [sh.tf(lambda V, R=R, d=d: V @ R.T + d * 0.55)]
    save(M, f'crys{i}', 128, tilt=40, heading=i * 50, k=0.4)
# loot
GOLD = mat((0.95, 0.75, 0.3), metal=0.95, panel=0.6, rough=0.2); BLUEC = mat((0.35, 0.55, 0.8), metal=0.6, panel=1.6, grime=1.0)
def glow(c): return mat(c, emissive=c)
save([loft([(-0.5, 0, 0, 0.4, 0.4, 2), (-0.45, 0, 0, 0.45, 0.45, 2), (0.45, 0, 0, 0.45, 0.45, 2), (0.5, 0, 0, 0.4, 0.4, 2)], GOLD, ring=18, axis='z'), sphere((0, 0, 0.52), 0.12, glow((1, 0.9, 0.5)))], 'loot0', 48)
save([block((0, 0, 0), (0.6, 0.45, 0.4), BLUEC), block((0, -0.46, 0), (0.4, 0.01, 0.06), glow((0.5, 0.85, 1.0))), block((0, 0, 0.41), (0.5, 0.06, 0.01), RS.DARK)], 'loot1', 48)
save([rock(301, ROCKM[2])], 'loot2', 48)
save([loft([(-0.6, 0, 0, 0.3, 0.3, 2), (-0.5, 0, 0, 0.35, 0.35, 2), (0.5, 0, 0, 0.35, 0.35, 2), (0.6, 0, 0, 0.3, 0.3, 2)], mat((0.3, 0.75, 0.55), metal=0.7, panel=1.0), ring=16, axis='x'), loft([(-0.1, 0, 0, 0.36, 0.36, 2), (0.1, 0, 0, 0.36, 0.36, 2)], glow((0.5, 1, 0.75)), ring=16, axis='x')], 'loot3', 48)
save([loft([(-0.5, 0, 0, 0.3, 0.25, 0.9), (0.4, 0, 0, 0.22, 0.18, 0.9), (0.8, 0, 0, 0.003, 0.003, 0.9)], RS.CRYS2, ring=6, axis='z'), loft([(-0.5, 0.2, 0.1, 0.2, 0.18, 0.9), (0.3, 0.45, 0.3, 0.003, 0.003, 0.9)], RS.CRYS, ring=6, axis='z')], 'loot4', 48, tilt=70)
save([block((0, 0, 0), (0.65, 0.42, 0.32), mat((0.45, 0.15, 0.4), metal=0.7, panel=1.4)), loft([(-0.65, 0, 0.3, 0.42, 0.25, 2), (0.65, 0, 0.3, 0.42, 0.25, 2)], mat((0.55, 0.2, 0.5), metal=0.8, panel=1.0), ring=16, axis='x'),
      block((0, -0.43, 0.15), (0.12, 0.01, 0.12), glow((1, 0.4, 0.9))), block((-0.66, 0, 0.1), (0.01, 0.43, 0.04), GOLD), block((0.66, 0, 0.1), (0.01, 0.43, 0.04), GOLD)], 'loot5', 64)
