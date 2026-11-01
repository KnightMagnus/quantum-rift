"""Quantum Rift: irregular (non-spherical) moons, rendered as lit 3D bodies in the hull pipeline (tools/rift_render3d.py).
Potato moons, a contact binary, a long shard, an icy fragment, a rubble pile and three settled ones with domes, lights
and a dock. Drawn as slowly turning sprites in place of the spherical planet renderer.
Output: client/assets/moons/irr_<n>.webp (512 px)
usage: python3 tools/rift_moons3.py client/assets/moons [irr_n ...]      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/moons'; ONLY = sys.argv[2:]
_a = sys.argv; sys.argv = sys.argv[:1]
import rift_stations as S
sys.argv = _a
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere
from rift_noise import Perlin3, fbm, ridged
os.makedirs(OUT, exist_ok=True)

GREYB = mat((0.42, 0.38, 0.34), metal=0.05, panel=0, rough=0.9, grime=0.6)
DUST = mat((0.5, 0.44, 0.38), metal=0.05, panel=0, rough=0.9, grime=0.5)
ICE = mat((0.72, 0.82, 0.9), metal=0.3, panel=0, rough=0.2, grime=0.3)
CARB = mat((0.17, 0.16, 0.16), metal=0.2, panel=0, rough=0.7, grime=0.4)
IRON = mat((0.45, 0.33, 0.26), metal=0.6, panel=0, rough=0.5, grime=1.2)
PALE = mat((0.62, 0.6, 0.57), metal=0.05, panel=0, rough=0.9, grime=0.4)

def body(seed, m, scale=(1.0, 1.0, 1.0), rough=0.35, craters=10, grooves=0, lobes=None):
    """a displaced sphere: big-scale lumps, crater bowls with rims, optional grooves and a second lobe"""
    P = Perlin3(seed); r = np.random.default_rng(seed)
    secs = [(math.cos(t), 0, 0, math.sin(t) + 1e-3, math.sin(t) + 1e-3, 2) for t in np.linspace(0, math.pi, 70)][::-1]
    s = loft(secs, m, ring=110)
    cr = [(lambda c: c / np.linalg.norm(c))(r.normal(size=3)) for _ in range(craters)]; cs = [r.uniform(0.12, 0.45) for _ in range(craters)]
    def f(V):
        n = np.linalg.norm(V, axis=1, keepdims=True) + 1e-9; d = V / n
        h = 1 + rough * fbm(P, d[:, 0] * 1.1, d[:, 1] * 1.1, d[:, 2] * 1.1, 3)[:, None] + 0.06 * fbm(P, d[:, 0] * 6, d[:, 1] * 6, d[:, 2] * 6, 3)[:, None]
        for c, w in zip(cr, cs):
            dd = np.arccos(np.clip(d @ c, -1, 1)) / w
            h = h - (0.16 * np.clip(1 - dd * dd, 0, 1))[:, None] + (0.05 * np.exp(-((dd - 1) / 0.18) ** 2))[:, None]
        if grooves:
            g = np.abs(np.sin(d[:, 0] * grooves * 3.0 + d[:, 2] * 2 + fbm(P, d[:, 0], d[:, 1], d[:, 2], 2) * 2))
            h = h - (0.025 * (g < 0.08))[:, None]
        out = d * h * np.array(scale)
        if lobes:   # pinch the middle so the body reads as two lobes resting together
            x = out[:, 0:1]; out = out * (1 - lobes * np.exp(-(x / 0.35) ** 2))
        return out
    return s.tf(f)
def on_surface(M0, n, h, part):
    """stand a part on a body point along direction n (approximate: uses the direction, offset to the body's extent)"""
    V = M0.V; d = V / np.linalg.norm(V, axis=1, keepdims=True); i = np.argmax(d @ (np.array(n) / np.linalg.norm(n))); p = V[i]
    return part.tf(lambda U: U + p * (1 + h))
def save(M, name, tilt=30, heading=30):
    if ONLY and name not in ONLY: return
    V = np.concatenate([m.V for m in M]); ext = np.abs(V).max()
    rgb, a = render(M, 512, heading, 512 * 0.44 / ext, tilt=tilt, density=6, ss=2)[0]
    Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).round().astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6); print(name, flush=True)
def lights(M0, seed, n, col=S.GAMBER, s=0.012):
    r = np.random.default_rng(seed); out = []
    for _ in range(n):
        d = r.normal(size=3); d[2] = abs(d[2]) * 0.6 + 0.2; out.append(on_surface(M0, d, 0.005, sphere((0, 0, 0), s, col)))
    return out

b = body(11, GREYB, (1.35, 0.95, 0.85), 0.3, 14, grooves=6); save([b], 'irr_0', 25, 40)                 # a Phobos-like potato with grooves
b = body(12, DUST, (1.7, 0.85, 0.8), 0.25, 10, lobes=0.38); save([b], 'irr_1', 35, 20)                    # contact binary
b = body(13, PALE, (2.0, 0.6, 0.55), 0.3, 8); save([b], 'irr_2', 30, 60)                                  # a long shard
b = body(14, ICE, (1.3, 1.05, 0.8), 0.35, 6); save([b], 'irr_3', 30, 110)                                 # icy fragment
b = body(15, CARB, (1.4, 1.0, 0.9), 0.3, 12)                                                              # settled carbon moon: mining lights
save([b] + lights(b, 1, 26) + [on_surface(b, (0.3, -0.5, 0.8), 0.0, sphere((0, 0, 0), 0.08, S.GLASS, squash=0.6))], 'irr_4', 30, 200)
b = body(16, IRON, (1.25, 1.0, 0.95), 0.28, 9)                                                            # iron chunk with domes and a dock
M = [b, on_surface(b, (0.2, -0.6, 0.75), 0.0, sphere((0, 0, 0), 0.12, S.GLASS, squash=0.6)), on_surface(b, (-0.3, -0.5, 0.8), 0.0, sphere((0, 0, 0), 0.08, S.GLASS, squash=0.6)),
     on_surface(b, (0.9, 0.0, 0.2), 0.0, block((0.12, 0, 0), (0.14, 0.03, 0.03), S.GUNM)), on_surface(b, (0.9, 0.0, 0.2), 0.0, block((0.27, 0, 0), (0.04, 0.07, 0.04), S.HULL))]
save(M + lights(b, 2, 18), 'irr_5', 30, 160)
r = np.random.default_rng(17); M = []                                                                      # rubble pile
for i in range(9):
    c = r.normal(0, 0.45, 3); c[2] *= 0.6; s_ = r.uniform(0.3, 0.6)
    M.append(body(170 + i, GREYB if i % 2 else DUST, (s_ * 1.2, s_, s_ * 0.9), 0.35, 3).tf(lambda V, c=c: V + c))
save(M, 'irr_6', 35, 70)
b = body(18, DUST, (1.3, 1.0, 0.9), 0.3, 10)                                                              # a settled potato: town lights, domes, a mast
M = [b, on_surface(b, (0.0, -0.5, 0.85), 0.0, sphere((0, 0, 0), 0.14, S.GLASS, squash=0.55)), on_surface(b, (0.25, -0.35, 0.9), 0.0, sphere((0, 0, 0), 0.09, S.GLASS, squash=0.55)),
     on_surface(b, (-0.3, -0.2, 0.95), 0.0, loft([(0, 0, 0, 0.015, 0.015, 2), (0.3, 0, 0, 0.008, 0.008, 2)], S.GUNM, ring=6, axis='z'))]
save(M + lights(b, 3, 34, S.GAMBER, 0.01), 'irr_7', 30, 250)
