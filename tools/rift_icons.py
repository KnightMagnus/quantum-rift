"""Quantum Rift 2.5: outfitter pictures for the 19 outfits that had none (the blasters, railguns, mining tools and alien
guns added by the web game), rendered with the hull pipeline in the style of the plug-in's outfit icons.
Output: client/assets/icons/<id>.png (96x96)
usage: python3 tools/rift_icons.py client/assets/icons      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh
import rift_stations as RS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/icons'; os.makedirs(OUT, exist_ok=True)
GUN = mat((0.5, 0.52, 0.56), metal=0.8, panel=1.6, rough=0.3); GUN2 = mat((0.3, 0.32, 0.36), metal=0.85, panel=1.2, rough=0.25)
COPPER = mat((0.72, 0.45, 0.28), metal=0.9, panel=0.8, rough=0.3); BONE = mat((0.62, 0.58, 0.42), metal=0.2, panel=0.4, rough=0.5, grime=1.5)
GREEN = mat((0.3, 0.45, 0.25), metal=0.3, panel=0.3, rough=0.35)
def glow(c): return mat(c, emissive=c)
def barrel(x0, x1, r, m, y=0.0, z=0.0, ring=14): return loft([(x0, y, z, r, r, 2), (x1, y, z, r, r, 2)], m, ring=ring, axis='x')
def blaster(level, col):
    b = 0.13 + 0.04 * level; M = [block((-0.15, 0, 0), (0.35, b * 1.4, b), GUN), barrel(0.15, 0.75 + 0.1 * level, b * 0.45, GUN2), barrel(0.5, 0.62, b * 0.6, GUN)]
    M += [sphere((0.8 + 0.1 * level, 0, 0), b * 0.35, glow(col)), block((-0.15, 0, b + 0.02), (0.2, b * 0.8, 0.03), glow(col))]
    return M
def turret(level, col):
    M = [RS.zcyl((0, 0, -0.15), 0.5, 0.08, GUN2, 24), sphere((0, 0, 0.0), 0.36 + 0.03 * level, GUN, squash=0.75)]
    n = 1 if level == 0 else 2
    for k in range(n): y = 0 if n == 1 else (k - 0.5) * 0.22; M += [barrel(0.15, 0.85, 0.06 + 0.015 * level, GUN2, y, 0.1), sphere((0.88, y, 0.1), 0.05, glow(col))]
    return M
def pulse(col): return [block((-0.2, 0, 0), (0.35, 0.2, 0.14), GUN), barrel(0.1, 0.8, 0.07, GUN2)] + [loft([(x, 0, 0, 0.11, 0.11, 2), (x + 0.04, 0, 0, 0.11, 0.11, 2)], glow(col), ring=14, axis='x') for x in (0.25, 0.42, 0.59)]
def railgun(level, col):
    L = 0.85 + 0.12 * level; M = [block((-0.25, 0, 0), (0.3, 0.22, 0.16), GUN2)]
    for s in (-1, 1): M += [block((L / 2 - 0.05, s * 0.09, 0), (L / 2, 0.03, 0.07), GUN)]
    M += [block((L / 2 - 0.05, 0, 0), (L / 2, 0.012, 0.02), glow(col)), block((-0.25, 0, 0.17), (0.18, 0.12, 0.02), glow(col))]
    return M
def launcher():
    M = [block((0, 0, 0), (0.55, 0.38, 0.2), GUN)]
    for i in range(3):
        for j in range(2): M += [barrel(0.4, 0.58, 0.07, GUN2, -0.22 + i * 0.22, -0.08 + j * 0.16), sphere((0.58, -0.22 + i * 0.22, -0.08 + j * 0.16), 0.045, mat((0.1, 0.1, 0.1), metal=0.2))]
    return M + [block((-0.3, 0, 0.22), (0.15, 0.25, 0.03), glow((1, 0.4, 0.2)))]
def missile():
    body = loft([(-0.7, 0, 0, 0.05, 0.05, 2), (-0.6, 0, 0, 0.1, 0.1, 2), (0.45, 0, 0, 0.1, 0.1, 2), (0.65, 0, 0, 0.06, 0.06, 2), (0.8, 0, 0, 0.003, 0.003, 2)], mat((0.85, 0.85, 0.82), metal=0.5, panel=0.6), ring=16, axis='x')
    M = [body, loft([(0.3, 0, 0, 0.102, 0.102, 2), (0.42, 0, 0, 0.102, 0.102, 2)], mat((0.9, 0.3, 0.2), metal=0.4, panel=0), ring=16, axis='x')]
    for a in range(4): M += [RS.rot_z(block((-0.55, 0.16, 0), (0.1, 0.08, 0.01), GUN2), 0).tf(lambda V, a=a: V @ np.array([[1, 0, 0], [0, math.cos(a * 1.571), -math.sin(a * 1.571)], [0, math.sin(a * 1.571), math.cos(a * 1.571)]]).T)]
    return M + [sphere((-0.72, 0, 0), 0.05, glow((1, 0.6, 0.2)))]
def spitter():
    return [loft([(-0.5, 0, 0, 0.18, 0.15, 2.2), (0.0, 0, 0, 0.26, 0.22, 2.2), (0.5, 0, 0, 0.12, 0.1, 2), (0.75, 0, 0, 0.07, 0.07, 2)], BONE, ring=16, axis='x'), sphere((0.78, 0, 0), 0.07, glow((0.6, 1.0, 0.3))), sphere((-0.1, 0.12, 0.18), 0.06, GREEN), sphere((0.15, -0.1, 0.19), 0.05, GREEN)]
def magma():
    M = [block((-0.25, 0, 0), (0.35, 0.3, 0.2), RS.FORGE), barrel(0.05, 0.85, 0.15, COPPER), barrel(0.6, 0.75, 0.2, RS.FORGE)]
    return M + [sphere((0.88, 0, 0), 0.12, glow((1, 0.45, 0.1))), block((-0.25, 0.31, 0), (0.2, 0.01, 0.12), glow((1, 0.5, 0.15)))]
def resonance():
    M = [block((-0.35, 0, 0), (0.25, 0.2, 0.15), GUN2), loft([(0.0, 0, 0, 0.06, 0.06, 2), (0.35, 0, 0, 0.42, 0.42, 2), (0.4, 0, 0, 0.44, 0.44, 2)], RS.CRYS2, ring=24, axis='x')]
    return M + [sphere((0.45, 0, 0), 0.08, glow((0.8, 0.6, 1.0)))]
def flak():
    rnd = np.random.default_rng(3); M = [RS.zcyl((0, 0, -0.15), 0.45, 0.07, RS.JUNK[0], 12), block((0, 0, 0.05), (0.3, 0.25, 0.15), RS.JUNK[1])]
    for k in range(3): M += [barrel(0.2, 0.75 - 0.08 * k, 0.05, RS.JUNK[2], -0.15 + 0.15 * k, 0.12)]
    return M + [block((-0.1, 0.27, 0.1), (0.08, 0.02, 0.08), glow((1, 0.6, 0.2)))]
def stinger(): return [loft([(-0.5, 0, 0, 0.12, 0.1, 2), (0.2, 0, 0, 0.18, 0.12, 2.5), (0.8, 0, 0, 0.004, 0.004, 2)], RS.CHITIN2, ring=14, axis='x'), sphere((0.5, 0, 0.0), 0.05, glow((1, 0.85, 0.3)))]
def chaingun():
    M = [block((-0.3, 0, 0), (0.3, 0.25, 0.2), GUN)]
    for k in range(6): a = k * math.pi / 3; M += [barrel(0.0, 0.85, 0.035, GUN2, math.cos(a) * 0.1, math.sin(a) * 0.1, 8)]
    return M + [barrel(0.6, 0.66, 0.16, GUN), barrel(0.15, 0.21, 0.16, GUN), block((-0.3, 0, 0.21), (0.15, 0.15, 0.02), glow((1, 0.75, 0.3)))]
def mining(level):
    M = [block((-0.3, 0, 0), (0.3, 0.25, 0.18), mat((0.85, 0.65, 0.2), metal=0.5, panel=1.4, grime=2)), barrel(0.0, 0.5, 0.1 + 0.03 * level, GUN2)]
    for s in (-1, 1): M += [block((0.45, s * 0.2, 0), (0.18, 0.03, 0.05), GUN), block((0.62, s * 0.14, 0), (0.05, 0.06, 0.05), GUN)]
    return M + [sphere((0.58, 0, 0), 0.07 + 0.02 * level, glow((1, 0.35, 0.25) if level else (1, 0.8, 0.3)))]
ICONS = {9001: blaster(0, (1, 0.5, 0.2)), 9002: blaster(1, (1, 0.5, 0.2)), 9003: turret(0, (1, 0.5, 0.2)), 9004: turret(1, (1, 0.5, 0.2)), 9005: turret(2, (1, 0.35, 0.2)),
         9006: pulse((0.3, 1, 0.5)), 9007: railgun(0, (0.4, 0.75, 1)), 9008: railgun(1, (0.4, 0.75, 1)), 9009: launcher(), 9010: missile(), 9011: spitter(), 9012: magma(),
         9013: resonance(), 9014: flak(), 9015: stinger(), 9016: chaingun(), 9017: mining(0), 9018: mining(1), 9019: mining(2)}
def bg(S):
    lin = (np.arange(S) + 0.5) / S * 2 - 1; X, Y = np.meshgrid(lin, lin); R = np.hypot(X, Y)
    a = np.clip(0.2 + 0.75 * (1 - R) * 1.4, 0.2, 0.95); c = np.stack([8 + 10 * (1 - R), 8 + 10 * (1 - R), 16 + 12 * (1 - R)], -1) / 255
    ring = np.exp(-((R - 0.78) / 0.05) ** 2) * 0.08; return np.clip(c + ring[..., None], 0, 1), a
if __name__ == '__main__':
    for id_, M in ICONS.items():
        S = 96; o = render(M, S, 35, S * 0.48, tilt=55, density=16, ss=4); rgb, a = o[0]; brgb, ba = bg(S)
        out_a = a + ba * (1 - a); out = (rgb * a[..., None] + brgb * ba[..., None] * (1 - a[..., None])) / np.maximum(out_a, 1e-4)[..., None]
        Image.fromarray(np.dstack([np.clip(out, 0, 1) * 255, out_a * 255]).astype(np.uint8), 'RGBA').save(os.path.join(OUT, f'{id_}.png')); print(id_)
