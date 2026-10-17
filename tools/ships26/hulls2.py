"""Original ship designs for the new renderer. Model space: nose +y, length about y in [-1, 1], x right, z up."""
import math, random
import numpy as np
from render2 import mat, loft, torus, block, sphere, wing, fin, pair, Mesh

def engine(x, y, z, r, glow, dark):
    noz = loft([(y + 0.06, x, z, r * 0.9, r * 0.9, 2), (y, x, z, r, r, 2), (y - 0.05, x, z, r * 1.05, r * 1.05, 2.4)], dark, ring=14, caps=True)
    g = sphere((x, y - 0.07, z), r * 0.85, glow, layer=1)
    return [noz], [g]
def light(x, y, z, col, r=0.035):
    return sphere((x, y, z), r, col, layer=2)
def greebles(seed, n, region, m, size=(0.02, 0.04, 0.012), zfn=None):
    rnd = random.Random(seed); out = []
    (x0, x1), (y0, y1) = region
    for _ in range(n):
        x = rnd.uniform(x0, x1); y = rnd.uniform(y0, y1); z = zfn(x, y) if zfn else 0
        sx = size[0] * rnd.uniform(0.6, 1.4); sy = size[1] * rnd.uniform(0.6, 1.6)
        out += pair(block((abs(x), y, z), (sx, sy, size[2]), m)) if rnd.random() < 0.5 else [block((x, y, z), (sx, sy, size[2]), m)]
    return out
def fuse(points, m, ring=22):
    """points: (y, width, height, zc, squareness)"""
    return loft([(y, 0.0, zc, w, h, sq) for y, w, h, zc, sq in points], m, ring=ring)
def lights_std(x, y, z):
    return [('auto',)]
def auto_lights(meshes):
    V = np.concatenate([m.V for m in meshes if m.layer == 0])
    i = np.argmax(np.abs(V[:, 0])); x, y, z = V[i]
    r = max(0.025, 0.012 * 2 / max(0.3, abs(x)))
    return [light(abs(x) * 0.96, y, z + 0.01, LGREEN, 0.03), light(-abs(x) * 0.96, y, z + 0.01, LRED, 0.03)]

LRED = mat((1, 0.2, 0.2), emissive=(1, 0.25, 0.2)); LGREEN = mat((0.3, 1, 0.4), emissive=(0.3, 1, 0.4)); LWHITE = mat((1, 1, 1), emissive=(1, 1, 0.95))
GAMBER = mat((1, .7, .3), emissive=(1.0, 0.72, 0.3)); GBLUE = mat((.4, .7, 1), emissive=(0.45, 0.75, 1.0)); GTEAL = mat((.4, 1, .9), emissive=(0.4, 1.0, 0.9))
GRED = mat((1, .3, .3), emissive=(1.0, 0.35, 0.3)); GVIOLET = mat((.8, .5, 1), emissive=(0.8, 0.5, 1.0))
GLASS = mat((0.1, 0.15, 0.25), metal=1, rough=0.1, glass=True, panel=0)
DARK = mat((0.2, 0.21, 0.24), metal=0.8, panel=1.5, rough=0.4)
GUNM = mat((0.32, 0.33, 0.36), metal=0.9, panel=0, rough=0.3)

def gnat():
    hull = mat((0.78, 0.72, 0.6), metal=0.3, stripe=(-0.1, 0.05, (0.7, 0.35, 0.2)), grime=1.6)
    M = [fuse([(0.95, 0.0, 0.0, 0.0, 2), (0.8, 0.14, 0.12, 0.0, 2), (0.4, 0.3, 0.24, 0.02, 2.2), (-0.3, 0.32, 0.26, 0.02, 2.4), (-0.75, 0.22, 0.18, 0.0, 2.4), (-0.85, 0.15, 0.12, 0, 2)], hull)]
    M += [loft([(0.62, 0, 0.17, 0.0, 0.0, 2), (0.5, 0, 0.17, 0.11, 0.07, 2), (0.15, 0, 0.17, 0.12, 0.07, 2), (0.05, 0, 0.15, 0.06, 0.04, 2)], GLASS, ring=14)]
    M += pair(wing((0.25, -0.15), 0, 0.45, 0.5, 0.2, 0.35, 0.05, hull))
    n, g = engine(0, -0.88, 0, 0.13, GAMBER, DARK)
    return M + n + greebles(1, 6, ((-0.2, 0.2), (-0.6, 0.2)), DARK, zfn=lambda x, y: 0.25), g, lights_std(0.7, -0.5, 0), 30
def mite():
    hull = mat((0.25, 0.25, 0.28), metal=0.7, panel=0.6)
    M = [fuse([(1.0, 0, 0, 0, 2), (0.3, 0.15, 0.1, 0, 2.5), (-0.6, 0.2, 0.1, 0, 3), (-0.75, 0.12, 0.08, 0, 2)], hull)]
    M += pair(wing((0.12, 0.1), 0, 0.75, 0.9, 0.25, 0.75, 0.06, hull))
    M += [sphere((0, 0.2, 0.09), 0.08, GAMBER)]
    n, g = engine(0, -0.8, 0, 0.1, GAMBER, DARK)
    return M + n, g, [], 22
def kestrel():
    hull = mat((0.86, 0.88, 0.92), metal=0.5, stripe=(0.1, 0.25, (0.25, 0.4, 0.75)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.7, 0.07, 0.07, 0, 2), (0.2, 0.12, 0.11, 0.01, 2.2), (-0.5, 0.13, 0.12, 0.01, 2.4), (-0.85, 0.1, 0.09, 0, 2.2)], hull)]
    M += [loft([(0.55, 0, 0.09, 0, 0, 2), (0.42, 0, 0.1, 0.06, 0.05, 2), (0.15, 0, 0.1, 0.06, 0.05, 2), (0.05, 0, 0.08, 0.03, 0.02, 2)], GLASS, ring=12)]
    M += pair(wing((0.1, -0.05), 0, 0.72, 0.5, 0.22, -0.18, 0.03, hull))   # forward-swept
    M += pair(fin(0.12, -0.55, 0.28, 0.35, 0.15, 0.2, 0.02, hull))
    M += pair(wing((0.1, -0.6), 0, 0.3, 0.3, 0.12, 0.15, 0.02, hull))
    n, g = engine(0, -0.9, 0, 0.09, GBLUE, DARK)
    return M + n, g, lights_std(0.8, -0.05, 0), 38
def cutlass():
    hull = mat((0.55, 0.14, 0.14), metal=0.6, stripe=(-0.2, -0.05, (0.15, 0.15, 0.17)), panel=1.2)
    M = [loft([(1.0, 0, 0, 0.02, 0.01, 2), (0.6, 0, 0.0, 0.2, 0.06, 3), (0.0, 0, 0.0, 0.55, 0.09, 3.5), (-0.5, 0, 0, 0.8, 0.08, 4), (-0.7, 0, 0, 0.8, 0.06, 4)], hull, ring=22)]
    M += [loft([(0.55, 0, 0.06, 0, 0, 2), (0.35, 0, 0.08, 0.07, 0.05, 2), (0.05, 0, 0.08, 0.07, 0.05, 2), (-0.1, 0, 0.06, 0.03, 0.02, 2)], GLASS, ring=12)]
    M += pair(fin(0.45, -0.45, 0.22, 0.3, 0.12, 0.15, 0.02, hull, z0=0.04))
    M += pair(block((0.18, 0.55, -0.02), (0.02, 0.25, 0.02), GUNM))
    eng = []; glo = []
    for x in (0.22, -0.22):
        n, g = engine(x, -0.72, 0, 0.09, GRED, DARK); eng += n; glo += g
    return M + eng + greebles(2, 10, ((-0.5, 0.5), (-0.5, 0.1)), DARK, zfn=lambda x, y: 0.07), glo, lights_std(0.78, -0.6, 0), 46
def dory():
    hull = mat((0.45, 0.5, 0.36), metal=0.3, panel=1.3, grime=1.8)
    cab = mat((0.85, 0.82, 0.7), metal=0.3)
    M = [loft([(0.95, 0, 0.05, 0.12, 0.1, 3), (0.8, 0, 0.05, 0.2, 0.16, 4), (0.55, 0, 0.05, 0.22, 0.18, 5)], cab, ring=16)]
    M += [loft([(0.86, 0, 0.12, 0.13, 0.04, 3), (0.76, 0, 0.15, 0.14, 0.04, 3)], GLASS, ring=12)]
    M += [block((0, 0.0, 0.0), (0.3, 0.55, 0.22), hull, sq=8)]
    for y in (0.4, 0.15, -0.1, -0.35): M += [block((0, y, 0.0), (0.315, 0.025, 0.235), DARK, sq=8)]
    M += pair(loft([(0.0, 0.42, -0.02, 0.07, 0.07, 2), (-0.6, 0.42, -0.02, 0.08, 0.08, 2.5), (-0.72, 0.42, -0.02, 0.06, 0.06, 2)], DARK, ring=12))
    M += [block((0, -0.62, 0), (0.2, 0.1, 0.15), DARK)]
    eng = []; glo = []
    for x in (0.42, -0.42, 0.0):
        n, g = engine(x, -0.75, -0.02, 0.07 if x else 0.1, GAMBER, DARK); eng += n; glo += g
    return M + eng + greebles(3, 8, ((-0.25, 0.25), (-0.5, 0.45)), DARK, zfn=lambda x, y: 0.23), glo, lights_std(0.5, -0.4, 0), 54
def lacewing():
    hull = mat((0.92, 0.92, 0.96), metal=0.7, rough=0.2, panel=0.6)
    sail = mat((0.62, 0.42, 0.95), metal=0.9, rough=0.15, panel=2.5, grime=0)
    M = [fuse([(1.0, 0, 0, 0, 2), (0.6, 0.06, 0.06, 0, 2), (-0.2, 0.08, 0.07, 0, 2), (-0.7, 0.06, 0.05, 0, 2)], hull, ring=16)]
    M += [loft([(0.45, 0, 0.05, 0, 0, 2), (0.3, 0, 0.06, 0.04, 0.03, 2), (0.05, 0, 0.05, 0.03, 0.02, 2)], GLASS, ring=10)]
    M += pair(wing((0.05, 0.45), 0.0, 0.9, 0.85, 0.45, 0.65, 0.006, sail, sq=3))
    M += pair(wing((0.05, 0.05), 0, 0.95, 0.04, 0.03, 0.0, 0.012, hull))
    n, g = engine(0, -0.75, 0, 0.06, GVIOLET, DARK)
    return M + n, g, lights_std(0.92, 0.0, 0), 64
def wayfarer():
    hull = mat((0.82, 0.78, 0.68), metal=0.4, stripe=(0.45, 0.55, (0.2, 0.35, 0.5)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.8, 0.1, 0.09, 0, 2), (0.45, 0.14, 0.13, 0, 2.2), (-0.1, 0.1, 0.1, 0, 2), (-0.6, 0.1, 0.1, 0, 2), (-0.8, 0.16, 0.15, 0, 2.2), (-0.92, 0.12, 0.1, 0, 2)], hull)]
    M += [torus(0.42, 0.05, hull, cy=0.05, squash=1.0), torus(0.33, 0.025, DARK, cy=0.05)]
    for a in range(4):
        ang = a * math.pi / 2 + math.pi / 4
        M += [loft([(0.05, 0.2 * math.cos(ang), 0.2 * math.sin(ang), 0.025, 0.025, 2), (0.05, 0.38 * math.cos(ang), 0.38 * math.sin(ang), 0.025, 0.025, 2)], DARK, ring=8, axis='y')] if False else []
    M += pair(block((0.21, 0.05, 0), (0.17, 0.02, 0.02), DARK))
    M += pair(loft([(-0.3, 0.2, 0, 0.06, 0.06, 2), (-0.45, 0.2, 0, 0.08, 0.08, 2), (-0.7, 0.2, 0, 0.08, 0.08, 2), (-0.78, 0.2, 0, 0.05, 0.05, 2)], DARK, ring=12))
    M += [loft([(0.82, 0, 0.07, 0, 0, 2), (0.7, 0, 0.09, 0.06, 0.04, 2), (0.55, 0, 0.09, 0.05, 0.03, 2)], GLASS, ring=10)]
    n, g = engine(0, -0.98, 0, 0.1, GTEAL, DARK)
    return M + n + greebles(4, 10, ((-0.08, 0.08), (-0.6, 0.4)), DARK, zfn=lambda x, y: 0.1), g, lights_std(0.46, 0.05, 0), 72
def mule():
    hull = mat((0.62, 0.42, 0.28), metal=0.3, panel=1.4, grime=2.0, stripe=(0.6, 0.7, (0.9, 0.75, 0.2)))
    M = [loft([(0.95, 0, 0.0, 0.14, 0.12, 3), (0.75, 0, 0.0, 0.22, 0.16, 4), (-0.7, 0, 0, 0.24, 0.17, 5), (-0.85, 0, 0, 0.18, 0.13, 4)], hull, ring=18)]
    M += [loft([(0.86, 0, 0.12, 0.12, 0.03, 3), (0.76, 0, 0.14, 0.14, 0.03, 3)], GLASS, ring=12)]
    for y in (0.35, -0.05, -0.45):
        M += pair(loft([(y + 0.17, 0.4, 0, 0.12, 0.13, 3), (y + 0.15, 0.4, 0, 0.15, 0.15, 5), (y - 0.15, 0.4, 0, 0.15, 0.15, 5), (y - 0.17, 0.4, 0, 0.12, 0.13, 3)], DARK, ring=14))
        M += pair(block((0.24, y, 0), (0.03, 0.03, 0.03), GUNM))
    M += pair(block((0.12, 0.9, 0.1), (0.015, 0.2, 0.015), GUNM))
    eng = []; glo = []
    for x in (0.12, -0.12):
        n, g = engine(x, -0.9, 0, 0.08, GAMBER, DARK); eng += n; glo += g
    return M + eng + greebles(5, 12, ((-0.18, 0.18), (-0.7, 0.6)), DARK, zfn=lambda x, y: 0.17), glo, lights_std(0.56, 0.35, 0.05), 74
def crawler():
    hull = mat((0.62, 0.52, 0.22), metal=0.4, panel=1.2, grime=2.2, stripe=(0.3, 0.42, (0.12, 0.12, 0.12)))
    M = [loft([(0.6, 0, 0, 0.32, 0.16, 4), (0.4, 0, 0, 0.42, 0.22, 5), (-0.5, 0, 0, 0.45, 0.24, 5), (-0.7, 0, 0, 0.36, 0.2, 4)], hull, ring=18)]
    for y in np.linspace(0.3, -0.55, 8): M += pair(block((0.46, y, -0.08), (0.04, 0.05, 0.1), DARK))
    M += pair(loft([(0.45, 0.28, 0.0, 0.05, 0.05, 2), (0.95, 0.3, 0.0, 0.04, 0.04, 2)], GUNM, ring=10))
    M += pair(block((0.3, 0.98, 0), (0.08, 0.05, 0.05), DARK))
    M += [loft([(1.0, 0, 0.0, 0.0, 0.0, 2), (0.85, 0, 0, 0.06, 0.06, 2), (0.6, 0, 0, 0.12, 0.12, 2.5)], GUNM, ring=12)]
    M += [block((0, -0.1, 0.27), (0.18, 0.22, 0.06), DARK), loft([(0.25, 0, 0.27, 0.1, 0.03, 3), (0.15, 0, 0.3, 0.12, 0.03, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.2, -0.2):
        n, g = engine(x, -0.75, 0, 0.09, GAMBER, DARK); eng += n; glo += g
    return M + eng + greebles(6, 14, ((-0.35, 0.35), (-0.6, 0.35)), DARK, zfn=lambda x, y: 0.23), glo, lights_std(0.5, 0.3, 0.1) + [light(0, 0.6, 0.15, LWHITE, 0.03)], 80
def bramble():
    hull = mat((0.4, 0.45, 0.3), metal=0.4, panel=1.1, grime=1.5)
    M = [fuse([(0.95, 0, 0, 0, 2), (0.75, 0.2, 0.15, 0, 2), (0.3, 0.34, 0.24, 0.0, 2.3), (-0.4, 0.36, 0.26, 0, 2.5), (-0.8, 0.26, 0.18, 0, 2.3), (-0.9, 0.18, 0.12, 0, 2)], hull)]
    for x, y, z in ((0, 0.4, 0.22), (0.2, 0.05, 0.22), (-0.2, 0.05, 0.22), (0, -0.35, 0.25), (0.3, -0.45, 0.05), (-0.3, -0.45, 0.05)):
        M += [sphere((x, y, z), 0.08, DARK, squash=0.7), loft([(y + 0.05, x, z + 0.03, 0.014, 0.014, 2), (y + 0.25, x, z + 0.03, 0.012, 0.012, 2)], GUNM, ring=8)]
    M += pair(wing((0.25, -0.4), 0, 0.3, 0.4, 0.2, 0.25, 0.04, hull))
    M += [loft([(0.75, 0, 0.13, 0.0, 0.0, 2), (0.65, 0, 0.17, 0.08, 0.04, 2), (0.5, 0, 0.18, 0.08, 0.04, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.12, -0.12):
        n, g = engine(x, -0.95, 0, 0.09, GAMBER, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0.55, -0.6, 0), 88
def halberd():
    hull = mat((0.3, 0.38, 0.55), metal=0.6, panel=1.0, stripe=(0.5, 0.62, (0.8, 0.82, 0.85)))
    M = [loft([(1.0, 0, 0, 0.01, 0.01, 2), (0.6, 0, 0, 0.14, 0.07, 3), (0.0, 0, 0, 0.26, 0.11, 3.5), (-0.6, 0, 0, 0.3, 0.13, 4), (-0.85, 0, 0, 0.25, 0.11, 4)], hull, ring=22)]
    M += [block((0, -0.25, 0.15), (0.08, 0.25, 0.06), hull), block((0, -0.15, 0.24), (0.05, 0.1, 0.04), DARK)]
    M += [loft([(-0.05, 0, 0.27, 0.05, 0.015, 3), (-0.12, 0, 0.29, 0.05, 0.015, 3)], GLASS, ring=10)]
    M += pair(loft([(0.0, 0.34, -0.02, 0.06, 0.06, 3), (-0.75, 0.36, -0.02, 0.07, 0.07, 3), (-0.85, 0.35, -0.02, 0.05, 0.05, 2)], DARK, ring=12))
    M += pair(wing((0.25, -0.2), 0, 0.12, 0.5, 0.4, 0.1, 0.04, hull))
    M += pair(loft([(0.3, 0.06, 0.06, 0.015, 0.015, 2), (0.98, 0.06, 0.06, 0.012, 0.012, 2)], GUNM, ring=8))
    M += [sphere((0, 0.2, 0.1), 0.06, DARK, squash=0.7)]
    eng = []; glo = []
    for x in (0.12, -0.12, 0.35, -0.35):
        n, g = engine(x, -0.92 if abs(x) < 0.3 else -0.88, -0.02 if abs(x) > 0.3 else 0, 0.07, GBLUE, DARK); eng += n; glo += g
    return M + eng + greebles(7, 18, ((-0.2, 0.2), (-0.7, 0.4)), DARK, zfn=lambda x, y: 0.12), glo, lights_std(0.45, -0.3, 0), 112
def barge():
    hull = mat((0.6, 0.62, 0.65), metal=0.5, panel=1.0, grime=1.5)
    rust = mat((0.55, 0.36, 0.25), metal=0.3, panel=1.6, grime=2.0)
    M = [loft([(0.98, 0, 0.05, 0.1, 0.08, 3), (0.85, 0, 0.05, 0.17, 0.13, 4), (0.68, 0, 0.05, 0.17, 0.13, 4)], hull, ring=16)]
    M += [loft([(0.9, 0, 0.14, 0.12, 0.03, 3), (0.8, 0, 0.17, 0.14, 0.03, 3)], GLASS, ring=12)]
    M += [loft([(0.7, 0, 0, 0.05, 0.05, 3), (-0.85, 0, 0, 0.05, 0.05, 3)], DARK, ring=12)]
    for y, m_ in ((0.42, rust), (0.08, hull), (-0.26, rust), (-0.58, hull)):
        M += [block((0, y, 0), (0.3, 0.14, 0.15), m_, sq=10)]
        for x in (-0.15, 0.15): M += [block((x, y, 0.15), (0.13, 0.12, 0.012), DARK, sq=10)]
    M += [block((0, -0.82, 0), (0.22, 0.08, 0.12), DARK)]
    eng = []; glo = []
    for x in (0.14, -0.14):
        n, g = engine(x, -0.92, 0, 0.09, GAMBER, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0.32, -0.55, 0.05) + [light(0, 0.98, 0.08, LWHITE, 0.025)], 132
def pilgrim():
    hull = mat((0.93, 0.92, 0.9), metal=0.4, rough=0.25, panel=0.7, grime=0.5, windows=(-0.06, 0.14, (1.0, 0.85, 0.5), 22),
               stripe=(-0.62, -0.5, (0.85, 0.65, 0.25)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.85, 0.12, 0.1, 0, 2), (0.55, 0.24, 0.2, 0.02, 2.2), (-0.3, 0.27, 0.22, 0.02, 2.4), (-0.75, 0.22, 0.18, 0.0, 2.2), (-0.88, 0.15, 0.12, 0, 2)], hull, ring=24)]
    M += [loft([(0.78, 0, 0.12, 0, 0, 2), (0.66, 0, 0.17, 0.1, 0.04, 2), (0.5, 0, 0.19, 0.1, 0.04, 2), (0.42, 0, 0.17, 0.05, 0.02, 2)], GLASS, ring=12)]
    M += pair(fin(0.18, -0.55, 0.22, 0.4, 0.2, 0.15, 0.025, hull, z0=0.1))
    M += [fin(0.0, -0.45, 0.32, 0.5, 0.25, 0.2, 0.03, hull, z0=0.15)]
    eng = []; glo = []
    for x in (0.12, -0.12):
        n, g = engine(x, -0.95, 0, 0.09, GAMBER, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0.36, -0.6, 0.1) + [light(0, -0.6, 0.45, LWHITE, 0.025)], 144
def hive():
    hull = mat((0.48, 0.42, 0.26), metal=0.4, panel=1.2, grime=1.6)
    M = [loft([(0.95, 0, 0, 0.12, 0.08, 2), (0.7, 0, 0, 0.3, 0.17, 2), (0.0, 0, 0, 0.38, 0.2, 2), (-0.7, 0, 0, 0.32, 0.18, 2), (-0.85, 0, 0, 0.2, 0.12, 2)], hull, ring=6)]
    for x, y in ((0.45, 0.3), (0.45, -0.1), (0.45, -0.5)):
        for s in (1, -1):
            M += [loft([(y + 0.16, s * x, 0, 0.1, 0.1, 2), (y + 0.12, s * x, 0, 0.14, 0.12, 2), (y - 0.12, s * x, 0, 0.14, 0.12, 2), (y - 0.16, s * x, 0, 0.1, 0.1, 2)], DARK, ring=6)]
            M += [block((s * (x + 0.15), y, 0), (0.012, 0.09, 0.07), GAMBER)]
    M += [block((0, 0.3, 0.22), (0.1, 0.15, 0.05), DARK), loft([(0.42, 0, 0.25, 0.07, 0.02, 3), (0.35, 0, 0.27, 0.07, 0.02, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.14, -0.14):
        n, g = engine(x, -0.92, 0, 0.1, GAMBER, DARK); eng += n; glo += g
    return M + eng + greebles(8, 16, ((-0.25, 0.25), (-0.6, 0.6)), DARK, zfn=lambda x, y: 0.2), glo, lights_std(0.62, 0.3, 0), 150
def warden():
    hull = mat((0.36, 0.3, 0.24), metal=0.5, panel=1.0, stripe=(0.55, 0.65, (0.9, 0.7, 0.3)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.8, 0.09, 0.08, 0, 2), (0.3, 0.17, 0.15, 0, 2.2), (-0.4, 0.2, 0.17, 0, 2.4), (-0.8, 0.15, 0.13, 0, 2.2), (-0.92, 0.1, 0.09, 0, 2)], hull)]
    for k, cy in enumerate((0.25, -0.05, -0.35)):
        M += [torus(0.5 - 0.06 * k, 0.035, DARK, cy=cy), sphere((0, cy, 0.18), 0.05, GAMBER)]
        M += pair(block((0.28 - 0.03 * k, cy, 0), (0.16, 0.015, 0.015), DARK))
    M += pair(wing((0.15, -0.45), 0, 0.6, 0.45, 0.15, 0.45, 0.03, hull))
    M += [loft([(0.9, 0, 0.03, 0.01, 0.01, 2), (1.1, 0, 0.03, 0.008, 0.008, 2)], GUNM, ring=8)]
    eng = []; glo = []
    for x in (0.1, -0.1):
        n, g = engine(x, -0.98, 0, 0.08, GAMBER, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0.75, -0.9, 0), 152
def tempest():
    hull = mat((0.18, 0.18, 0.2), metal=0.7, panel=1.2, rough=0.35, stripe=(0.2, 0.32, (0.6, 0.12, 0.15)))
    M = [loft([(1.05, 0, 0, 0.02, 0.01, 2), (0.6, 0, 0, 0.2, 0.06, 4), (0.0, 0, 0, 0.45, 0.1, 5), (-0.5, 0, 0, 0.7, 0.11, 6), (-0.75, 0, 0, 0.7, 0.09, 6)], hull, ring=24)]
    M += [loft([(0.5, 0, 0.06, 0.04, 0.03, 3), (-0.6, 0, 0.12, 0.16, 0.08, 4), (-0.8, 0, 0.1, 0.14, 0.06, 3)], DARK, ring=16)]
    M += [loft([(0.0, 0, 0.2, 0.06, 0.02, 3), (-0.12, 0, 0.21, 0.06, 0.02, 3)], GLASS, ring=10)]
    for y in (0.3, 0.0, -0.3): M += pair(block((0.35 + 0.15 * (0.3 - y), y - 0.05, 0.08), (0.08, 0.06, 0.03), DARK))
    M += pair(loft([(0.3, 0.16, 0.05, 0.02, 0.02, 2), (0.95, 0.12, 0.04, 0.016, 0.016, 2)], GUNM, ring=8))
    M += pair(fin(0.55, -0.6, 0.18, 0.25, 0.1, 0.12, 0.02, hull, z0=0.05))
    eng = []; glo = []
    for x in (0.0, 0.25, -0.25, 0.5, -0.5):
        n, g = engine(x, -0.8, 0.0, 0.07 if abs(x) > 0.3 else 0.09, GRED, DARK); eng += n; glo += g
    return M + eng + greebles(9, 22, ((-0.4, 0.4), (-0.6, 0.3)), DARK, zfn=lambda x, y: 0.1), glo, lights_std(0.7, -0.7, 0.02), 172
def bastion():
    hull = mat((0.58, 0.6, 0.64), metal=0.5, panel=1.2, grime=1.3, stripe=(0.75, 0.82, (0.25, 0.45, 0.7)))
    M = [loft([(1.0, 0, 0, 0.15, 0.08, 4), (0.8, 0, 0, 0.32, 0.16, 6), (-0.8, 0, 0, 0.36, 0.18, 7), (-0.92, 0, 0, 0.3, 0.15, 6)], hull, ring=20)]
    M += [loft([(0.5, 0, 0.18, 0.2, 0.06, 6), (-0.6, 0, 0.18, 0.24, 0.07, 7)], DARK, ring=16)]
    M += [block((0, -0.25, 0.32), (0.1, 0.18, 0.1), hull), block((0, -0.2, 0.44), (0.07, 0.08, 0.04), DARK),
          loft([(-0.1, 0, 0.42, 0.07, 0.015, 3), (-0.14, 0, 0.44, 0.07, 0.015, 3)], GLASS, ring=10)]
    for x, y in ((0.18, 0.55), (-0.18, 0.55), (0.2, 0.1), (-0.2, 0.1), (0.2, -0.55), (-0.2, -0.55)):
        M += [sphere((x, y, 0.25), 0.06, DARK, squash=0.6)]
        M += [loft([(y + 0.04, x + d, 0.27, 0.012, 0.012, 2), (y + 0.24, x + d, 0.27, 0.01, 0.01, 2)], GUNM, ring=6) for d in (-0.02, 0.02)]
    M += pair(loft([(0.6, 0.45, 0, 0.08, 0.12, 5), (-0.7, 0.47, 0, 0.09, 0.13, 5), (-0.85, 0.45, 0, 0.07, 0.1, 4)], hull, ring=14))
    eng = []; glo = []
    for x in (0.0, 0.18, -0.18, 0.46, -0.46):
        n, g = engine(x, -0.97 if abs(x) < 0.3 else -0.9, 0, 0.08, GBLUE, DARK); eng += n; glo += g
    return M + eng + greebles(10, 40, ((-0.3, 0.3), (-0.8, 0.8)), DARK, size=(0.025, 0.05, 0.015), zfn=lambda x, y: 0.2), glo, lights_std(0.55, 0.5, 0.05) + [light(0, 1.0, 0.05, LWHITE, 0.02)], 220
def wren(tier):
    hull = mat((0.62, 0.66, 0.72) if tier < 3 else (0.82, 0.84, 0.9), metal=0.6, panel=0.9)
    ring = mat((0.25, 0.27, 0.32) if tier == 1 else (0.7, 0.72, 0.78), metal=0.7, panel=0)
    core = GAMBER if tier < 3 else GTEAL
    M = [fuse([(1.0, 0, 0, 0, 2), (0.8, 0.07, 0.06, 0, 2), (0.3, 0.13, 0.11, 0, 2), (-0.4, 0.14, 0.12, 0, 2), (-0.75, 0.11, 0.09, 0, 2), (-0.88, 0.08, 0.07, 0, 2)], hull)]
    for k in range(1 if tier == 1 else 2):
        cy = -0.02 - 0.28 * k
        M += [torus(0.42 - 0.05 * k, 0.035, ring, cy=cy)] + pair(block((0.27, cy, 0), (0.14, 0.015, 0.015), DARK))
    M += [sphere((0, 0.05, 0.12), 0.06, core if tier > 1 else mat((0.8, 0.55, 0.25), emissive=(0.7, 0.45, 0.18)))]
    M += pair(wing((0.1, -0.45), 0, 0.5, 0.4, 0.15, 0.4, 0.025, DARK))
    if tier == 3: M += pair(wing((0.08, 0.45), 0, 0.25, 0.3, 0.08, 0.25, 0.015, hull))
    M += [loft([(0.65, 0, 0.06, 0, 0, 2), (0.52, 0, 0.08, 0.05, 0.035, 2), (0.32, 0, 0.08, 0.05, 0.035, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.08, -0.08):
        n, g = engine(x, -0.92, 0, 0.06, GAMBER if tier < 3 else GTEAL, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0.58, -0.9, 0), 58

DESIGNS = dict(gnat=gnat, mite=mite, kestrel=kestrel, cutlass=cutlass, dory=dory, lacewing=lacewing, wayfarer=wayfarer, mule=mule,
               crawler=crawler, bramble=bramble, halberd=halberd, barge=barge, pilgrim=pilgrim, hive=hive, warden=warden, tempest=tempest,
               bastion=bastion, wren1=lambda: wren(1), wren2=lambda: wren(2), wren3=lambda: wren(3))

def surveyor():
    """Original 'disc and twin booster' explorer: wide lens-shaped disc, two booster tubes slung close beneath it."""
    hull = mat((0.9, 0.9, 0.86), metal=0.45, rough=0.3, panel=1.1, grime=0.6, windows=(-0.035, 0.03, (0.75, 0.9, 1.0), 26),
               stripe=(0.05, 0.12, (0.25, 0.6, 0.65)))
    boost = mat((0.78, 0.8, 0.82), metal=0.6, panel=1.3, grime=0.9, stripe=(-0.62, -0.52, (0.25, 0.6, 0.65)))
    cy = 0.32
    # the disc: a lens lofted bottom-to-top (axis z), centred forward of the boosters
    M = [loft([(-0.07, cy, 0, 0.45, 0.45, 2), (-0.04, cy, 0, 0.6, 0.6, 2), (0.0, cy, 0, 0.66, 0.66, 2), (0.035, cy, 0, 0.62, 0.62, 2),
               (0.07, cy, 0, 0.42, 0.42, 2), (0.09, cy, 0, 0.2, 0.2, 2)], hull, ring=40, axis='z')]
    M += [sphere((0, cy + 0.05, 0.1), 0.09, GLASS, squash=0.55), sphere((0, cy + 0.05, -0.08), 0.12, DARK, squash=0.4)]
    for a in range(8):  # rim sensor bumps
        import math as _m
        ang = a * _m.pi / 4
        M += [block((0.6 * _m.cos(ang), cy + 0.6 * _m.sin(ang), 0.0), (0.03, 0.03, 0.02), DARK)]
    # twin boosters under the disc, on short struts
    for x in (0.27, -0.27):
        M += [loft([(0.42, x, -0.2, 0.03, 0.03, 2), (0.36, x, -0.2, 0.075, 0.075, 2), (0.2, x, -0.2, 0.09, 0.09, 2.2),
                    (-0.7, x, -0.2, 0.09, 0.09, 2.2), (-0.85, x, -0.2, 0.075, 0.075, 2)], boost, ring=18)]
        M += [loft([(0.44, x, -0.2, 0.0, 0.0, 2), (0.41, x, -0.2, 0.05, 0.05, 2), (0.38, x, -0.2, 0.06, 0.06, 2)], GTEAL, ring=12)]
        M += [block((x, 0.05, -0.11), (0.03, 0.12, 0.06), DARK), block((x, -0.2, -0.12), (0.025, 0.06, 0.05), DARK)]
    M += [block((0, -0.2, -0.17), (0.25, 0.05, 0.015), DARK)]              # cross-brace between the boosters
    M += [fin(0.0, -0.05, 0.12, 0.25, 0.12, 0.08, 0.015, hull, z0=-0.16)]  # small ventral keel
    eng = []; glo = []
    for x in (0.27, -0.27):
        n, g = engine(x, -0.9, -0.2, 0.075, GAMBER, DARK); eng += n; glo += g
    return M + eng, glo, lights_std(0, 0, 0), 84
DESIGNS['surveyor'] = surveyor

def constitution():
    """Constitution Class: a war-built descendant of the disc-and-boosters layout. Dark, armoured, enormous."""
    import math as _m
    hull = mat((0.24, 0.25, 0.28), metal=0.7, rough=0.35, panel=1.6, grime=1.1, windows=(-0.045, 0.035, (1.0, 0.55, 0.3), 34),
               stripe=(0.02, 0.07, (0.55, 0.08, 0.08)))
    armor = mat((0.3, 0.31, 0.34), metal=0.75, rough=0.3, panel=2.2, grime=1.3)
    boost = mat((0.27, 0.28, 0.31), metal=0.7, panel=1.8, grime=1.2, stripe=(-0.66, -0.58, (0.55, 0.08, 0.08)))
    cy = 0.34
    M = [loft([(-0.09, cy, 0, 0.5, 0.5, 2), (-0.05, cy, 0, 0.66, 0.66, 2.3), (0.0, cy, 0, 0.72, 0.72, 2.3), (0.04, cy, 0, 0.68, 0.68, 2.2),
               (0.08, cy, 0, 0.5, 0.5, 2), (0.11, cy, 0, 0.26, 0.26, 2)], hull, ring=48, axis='z')]
    # armoured rim segments and a raised command tower
    for a in range(12):
        ang = a * _m.pi / 6 + _m.pi / 12
        M += [block((0.69 * _m.cos(ang), cy + 0.69 * _m.sin(ang), 0.0), (0.05, 0.05, 0.035), armor)]
    M += [loft([(0.1, cy - 0.05, 0, 0.16, 0.16, 6), (0.17, cy - 0.05, 0, 0.12, 0.12, 6), (0.21, cy - 0.05, 0, 0.07, 0.07, 4)], armor, ring=16, axis='z')]
    M += [sphere((0, cy - 0.02, 0.22), 0.045, GLASS, squash=0.6)]
    # turret domes with twin barrels around the upper disc
    for a in range(6):
        ang = a * _m.pi / 3 + _m.pi / 6
        x, y = 0.42 * _m.cos(ang), cy + 0.42 * _m.sin(ang)
        M += [sphere((x, y, 0.08), 0.055, DARK, squash=0.6)]
        for dx in (-0.015, 0.015):
            M += [loft([(y + 0.02, x + dx, 0.1, 0.008, 0.008, 2), (y + 0.15, x + dx, 0.1, 0.007, 0.007, 2)], GUNM, ring=6)]
    # forward torpedo launchers in the rim
    for x in (-0.1, 0.1): M += [block((x, cy + 0.7, -0.01), (0.035, 0.05, 0.025), DARK), sphere((x, cy + 0.75, -0.01), 0.02, GRED)]
    # ventral war spine joining disc and boosters
    M += [loft([(0.25, 0, -0.14, 0.08, 0.06, 4), (-0.2, 0, -0.18, 0.14, 0.08, 5), (-0.75, 0, -0.18, 0.12, 0.07, 5), (-0.85, 0, -0.17, 0.08, 0.05, 3)], armor, ring=16)]
    for x in (0.34, -0.34):
        M += [loft([(0.45, x, -0.22, 0.03, 0.03, 2), (0.38, x, -0.22, 0.095, 0.095, 2.4), (0.2, x, -0.22, 0.115, 0.115, 2.6),
                    (-0.78, x, -0.22, 0.115, 0.115, 2.6), (-0.92, x, -0.22, 0.09, 0.09, 2.2)], boost, ring=20)]
        M += [loft([(0.47, x, -0.22, 0.0, 0.0, 2), (0.44, x, -0.22, 0.06, 0.06, 2), (0.41, x, -0.22, 0.075, 0.075, 2)], GRED, ring=12)]
        M += [block((x * 0.6, 0.0, -0.17), (abs(x) * 0.42, 0.06, 0.03), armor), block((x * 0.6, -0.5, -0.19), (abs(x) * 0.42, 0.05, 0.025), armor)]
        s = 1 if x > 0 else -1
        M += [loft([(0.1, x + s * 0.13, -0.24, 0.035, 0.035, 3), (-0.45, x + s * 0.13, -0.24, 0.035, 0.035, 3)], DARK, ring=10)]   # weapon pods
        M += [loft([(0.12, x + s * 0.13, -0.24, 0.012, 0.012, 2), (0.3, x + s * 0.13, -0.24, 0.01, 0.01, 2)], GUNM, ring=6)]
    M += [fin(0.0, -0.55, 0.16, 0.35, 0.15, 0.12, 0.02, armor, z0=-0.22)]
    eng = []; glo = []
    for x in (0.34, -0.34, 0.0):
        n, g = engine(x, -0.97 if x else -0.9, -0.22 if x else -0.18, 0.095 if x else 0.07, GRED, DARK); eng += n; glo += g
    return M + eng + greebles(77, 70, ((-0.45, 0.45), (cy - 0.45, cy + 0.45)), DARK, size=(0.025, 0.04, 0.012), zfn=lambda x, y: 0.09), glo, lights_std(0, 0, 0), 360
DESIGNS['constitution'] = constitution
