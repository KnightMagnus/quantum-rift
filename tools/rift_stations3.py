"""Quantum Rift: a third wave of station designs, so each people (and each kind of outpost) has several silhouettes.
Built from the hull pipeline's primitives (tools/rift_render3d.py) and the helpers in tools/rift_stations.py, rendered with
the same camera as tools/rift_station_variants.py: s_<design>.webp (360px, flight) and s_<design>_landed.webp (800px).
usage: python3 tools/rift_stations3.py client/assets/stations [design ...]      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_argv = sys.argv; sys.argv = sys.argv[:1]
import rift_stations as S
sys.argv = _argv
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/stations'; ONLY = sys.argv[2:]
zcyl, flat_torus, panel, arm, light, lumpy, rot_z = S.zcyl, S.flat_torus, S.panel, S.arm, S.light, S.lumpy, S.rot_z
HULL, HULLB, HAB, DARK, GUNM, GLASS, SOLAR, ROCK, RUST, TANK = S.HULL, S.HULLB, S.HAB, S.DARK, S.GUNM, S.GLASS, S.SOLAR, S.ROCK, S.RUST, S.TANK
CHITIN, CHITIN2, CRYS, CRYS2, CORAL, CORAL2, FORGE, BRASS, JUNK = S.CHITIN, S.CHITIN2, S.CRYS, S.CRYS2, S.CORAL, S.CORAL2, S.FORGE, S.BRASS, S.JUNK
LRED, LGREEN, LWHITE, GAMBER, GBLUE, GTEAL, GVIOLET, GORANGE = S.LRED, S.LGREEN, S.LWHITE, S.GAMBER, S.GBLUE, S.GTEAL, S.GVIOLET, S.GORANGE

# palettes for the new peoples' stations
SILK = mat((0.78, 0.25, 0.22), metal=0.2, rough=0.7, panel=0.3, grime=0.4)
SILK2 = mat((0.2, 0.55, 0.6), metal=0.2, rough=0.7, panel=0.3, grime=0.4)
SILK3 = mat((0.85, 0.65, 0.2), metal=0.2, rough=0.7, panel=0.3, grime=0.4)
SAIL = mat((0.95, 0.88, 0.7), metal=0.1, rough=0.6, panel=0.5, grime=0.1)
PEARL = mat((0.88, 0.86, 0.92), metal=0.5, rough=0.2, panel=0.2, grime=0.1)
VOID = mat((0.08, 0.07, 0.11), metal=0.85, rough=0.25, panel=1.2, grime=0.4)
VOID2 = mat((0.16, 0.13, 0.2), metal=0.8, rough=0.3, panel=1.6, grime=0.5)
WATER = mat((0.15, 0.45, 0.6), metal=0.9, rough=0.08, panel=0, grime=0)
KELP = mat((0.22, 0.42, 0.25), metal=0.2, rough=0.5, panel=0.3, grime=0.6)
MIRROR = mat((0.78, 0.82, 0.88), metal=1.0, rough=0.06, panel=3.0, grime=0)
CONCORD = mat((0.82, 0.85, 0.9), metal=0.45, panel=1.1, grime=0.6, stripe=(0.0, 0.06, (0.25, 0.45, 0.8)))
ORANGE = mat((0.85, 0.45, 0.15), metal=0.4, panel=1.2, grime=1.4)
LEAF = mat((0.2, 0.5, 0.25), metal=0, rough=0.9, panel=0, grime=0)
ICEM = mat((0.75, 0.85, 0.92), metal=0.3, rough=0.2, panel=0.2, grime=0.2)
GWARM = mat((1, 0.8, 0.45), emissive=(1.0, 0.82, 0.5))
GSEAM = mat((1, 0.6, 0.2), emissive=(1.0, 0.62, 0.22))
GPINK = mat((1, 0.5, 0.8), emissive=(1.0, 0.55, 0.85))
GREENHOUSE = mat((0.4, 0.68, 0.45), metal=0.85, rough=0.12, panel=2.5, grime=0.1)
GGREEN = mat((0.5, 1, 0.4), emissive=(0.55, 1.0, 0.45))

def shift(m, x, y, z=0.0): return m.tf(lambda V: V + np.array([x, y, z]))
def rot(m, axis, a):
    c, s = math.cos(a), math.sin(a)
    R = {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]), 'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]
    return m.tf(lambda V: V @ R.T)
def cone(x, y, z0, z1, r0, r1, m, ring=14, sq=2): return loft([(z0, y, x, r0, r0, sq), (z1, y, x, max(r1, 0.002), max(r1, 0.002), sq)], m, ring=ring, axis='z')
def rod(p0, p1, r, m, ring=8):
    p0, p1 = np.array(p0, float), np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d)
    base = loft([(0, 0, 0, r, r, 2), (L, 0, 0, r, r, 2)], m, ring=ring)
    z = np.array([0, 1.0, 0]); u = d / L; v = np.cross(z, u); s = np.linalg.norm(v); c = z @ u
    if s < 1e-9: R = np.eye(3) if c > 0 else np.diag([1, -1, -1.0])
    else:
        k = v / s; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]); R = np.eye(3) + K * s + K @ K * (1 - c)
    return base.tf(lambda V: V @ R.T + p0)
def ring_of(n, R, fn, phase=0.0):
    out = []
    for k in range(n):
        a = phase + k * 2 * math.pi / n
        out += fn(a, R * math.cos(a), R * math.sin(a), k)
    return out
def hexcell(x, y, z, r, h, m): return loft([(z - h, y, x, r, r, 2), (z + h, y, x, r, r, 2)], m, ring=6, axis='z')

# ================================================================== Vashari
def hive_spire():
    M = [lumpy((0, 0, -0.05), 0.42, CHITIN, 31, squash=0.55)]
    rnd = np.random.default_rng(5)
    for i in range(9):
        a = i * 0.7 + rnd.random() * 0.3; r = 0.05 + rnd.random() * 0.35
        x, y = r * math.cos(a), r * math.sin(a); h = 0.35 + rnd.random() * 0.45
        M += [cone(x, y, 0.0, h, 0.08 + rnd.random() * 0.05, 0.01, CHITIN2 if i % 2 else CHITIN, ring=10, sq=1.6)]
        for j in range(3): M.append(sphere((x + 0.03 * math.cos(j * 2.1), y + 0.03 * math.sin(j * 2.1), h * (0.3 + 0.2 * j)), 0.016, GAMBER))
    M += ring_of(6, 0.62, lambda a, x, y, k: [lumpy((x, y, -0.04), 0.13, CHITIN2, 40 + k, squash=0.6), sphere((x, y, 0.05), 0.025, GAMBER)])
    return M
def brood_lattice():
    M = [hexcell(0, 0, 0, 0.2, 0.08, CHITIN2), sphere((0, 0, 0.1), 0.12, CHITIN, squash=0.7), sphere((0, 0, 0.18), 0.04, GAMBER)]
    for ring_r, n in ((0.42, 6), (0.74, 12)):
        for k in range(n):
            a = k * 2 * math.pi / n + (0.26 if n == 12 else 0)
            x, y = ring_r * math.cos(a), ring_r * math.sin(a)
            M += [hexcell(x, y, 0, 0.14 if n == 6 else 0.12, 0.06, CHITIN if k % 2 else CHITIN2), hexcell(x, y, 0.062, 0.09 if n == 6 else 0.075, 0.004, GAMBER)]
    return M

# ================================================================== Ylith
def chime():
    M = [flat_torus(0.55, 0.035, CRYS2, z=0.25), sphere((0, 0, 0.1), 0.16, CRYS, squash=1.3), cone(0, 0, 0.2, 0.55, 0.06, 0.0, CRYS2, ring=6, sq=0.9)]
    for k in range(12):
        a = k * math.pi / 6; x, y = 0.55 * math.cos(a), 0.55 * math.sin(a); L = 0.3 + 0.18 * (k % 3)
        M += [loft([(0.25, y, x, 0.018, 0.018, 0.9), (0.25 - L, y, x, 0.012, 0.012, 0.9)], CRYS if k % 2 else CRYS2, ring=6, axis='z'), sphere((x, y, 0.25 - L), 0.022, GVIOLET)]
    for k in range(3): M.append(arm(k * 2 * math.pi / 3 + 0.5, 0.12, 0.55, 0.012, CRYS2, 0.22))
    return M
def bell():
    M = [sphere((0, 0, 0.02), 0.45, CRYS, squash=0.75), flat_torus(0.47, 0.04, CRYS2, z=-0.08), sphere((0, 0, 0.36), 0.06, GVIOLET)]
    M += ring_of(10, 0.32, lambda a, x, y, k: [loft([(0.2, y, x, 0.035, 0.03, 0.9), (0.5 + 0.12 * (k % 2), y * 1.15, x * 1.15, 0.002, 0.002, 0.9)], CRYS2, ring=6, axis='z')])
    M += ring_of(16, 0.6, lambda a, x, y, k: [sphere((x, y, -0.08), 0.025, GVIOLET if k % 2 else CRYS2)])
    return M

# ================================================================== Thalassi
def waterbell():
    M = [sphere((0, 0, 0.05), 0.42, WATER, squash=0.95), flat_torus(0.44, 0.03, CORAL, z=-0.02)]
    rnd = np.random.default_rng(8)
    for i in range(16):
        a = rnd.random() * 6.28; r = 0.38 + rnd.random() * 0.1; z = -0.15 + rnd.random() * 0.15
        M.append(sphere((r * math.cos(a), r * math.sin(a), z), 0.05 + rnd.random() * 0.04, CORAL2 if i % 3 else CORAL))
    M += ring_of(8, 0.62, lambda a, x, y, k: [sphere((x, y, 0), 0.07, CORAL), sphere((x, y, 0.06), 0.022, GTEAL)])
    M += ring_of(8, 0.62, lambda a, x, y, k: [arm(a, 0.42, 0.58, 0.012, CORAL)])
    return M
def kelp():
    M = [zcyl((0, 0, 0), 0.09, 0.25, CORAL), sphere((0, 0, 0.27), 0.12, CORAL2, squash=0.8), sphere((0, 0, 0.36), 0.04, GTEAL)]
    for k in range(7):
        a = k * 2 * math.pi / 7; secs = []
        for j in range(7):
            t = j / 6; r = 0.08 + t * 0.78; sw = math.sin(t * 3 + k) * 0.18
            x, y = r * math.cos(a + sw), r * math.sin(a + sw)
            secs.append((x, y, -0.02 + 0.08 * math.sin(t * 3.14), 0.06 * (1 - 0.6 * t) + 0.01))
        for (x0, y0, z0, w0), (x1, y1, z1, w1) in zip(secs, secs[1:]):
            M.append(rod((x0, y0, z0), (x1, y1, z1), w0 * 0.5, KELP, ring=6))
        x, y, z, _ = secs[-1]; M.append(sphere((x, y, z), 0.025, GTEAL))
    return M

# ================================================================== Sarn
def bazaar():
    M = [zcyl((0, 0, 0), 0.16, 0.12, BRASS), flat_torus(0.62, 0.05, BRASS), flat_torus(0.62, 0.02, SILK, z=0.05)]
    M += ring_of(6, 0, lambda a, x, y, k: [arm(a, 0.15, 0.58, 0.02, BRASS)])
    silks = [SILK, SILK2, SILK3]
    for k in range(14):
        a = k * 2 * math.pi / 14 + 0.1; x, y = 0.62 * math.cos(a), 0.62 * math.sin(a)
        M += [sphere((x * 1.12, y * 1.12, -0.02), 0.06 + 0.02 * (k % 3), silks[k % 3], squash=1.2), rot_z(block((0.7, 0, 0.06), (0.04, 0.005, 0.07), silks[(k + 1) % 3]), a)]
    M += ring_of(28, 0.62, lambda a, x, y, k: [sphere((x, y, 0.07), 0.012, GWARM if k % 2 else GPINK)])
    return M
def caravanserai():
    M = [sphere((0, 0, 0), 0.2, BRASS, squash=0.7), zcyl((0, 0, 0.12), 0.08, 0.05, HULL), sphere((0, 0, 0.19), 0.04, GWARM)]
    silks = [SILK, SILK2, SILK3, HULLB, RUST]
    for k in range(5):
        a = k * 2 * math.pi / 5 + 0.3
        M.append(arm(a, 0.18, 0.32, 0.03, BRASS))
        for j in range(4):
            r = 0.38 + j * 0.15
            M.append(rot_z(block((r, 0, 0), (0.065, 0.06 - 0.008 * j, 0.05), silks[(k + j) % 5]), a))
        M.append(rot_z(block((0.38 + 4 * 0.15 - 0.03, 0, 0), (0.03, 0.03, 0.02), GAMBER), a))
    return M

# ================================================================== Korrund
def hall():
    M = [lumpy((0, 0, 0), 0.62, ROCK, 17, squash=0.65)]
    for k in range(4):
        a = k * math.pi / 2 + 0.4
        M.append(rot_z(block((0.58, 0, -0.02), (0.06, 0.13, 0.12), FORGE), a))
        M.append(rot_z(block((0.645, 0, -0.02), (0.004, 0.08, 0.09), GORANGE), a))
    for x, y in ((0.15, 0.1), (-0.2, -0.05), (0.02, -0.25)):
        M += [zcyl((x, y, 0.42), 0.05, 0.12, FORGE), sphere((x, y, 0.55), 0.03, GORANGE)]
    M += [block((0, 0.3, 0.36), (0.15, 0.06, 0.04), BRASS), block((0, 0.3, 0.41), (0.1, 0.004, 0.012), GORANGE)]
    return M
def smelter():
    M = [block((0, 0, 0), (0.38, 0.22, 0.1), FORGE), block((0, 0, 0.13), (0.24, 0.14, 0.05), FORGE)]
    for x in (-0.25, 0, 0.25):
        M += [sphere((x, 0.32, 0.04), 0.1, BRASS, squash=0.8), sphere((x, 0.32, 0.12), 0.07, GORANGE, squash=0.4)]
    M += [zcyl((0.25, -0.12, 0.25), 0.05, 0.16, FORGE), zcyl((-0.2, -0.12, 0.3), 0.06, 0.2, FORGE), sphere((0.25, -0.12, 0.43), 0.035, GORANGE), sphere((-0.2, -0.12, 0.52), 0.04, GORANGE)]
    for s in (-1, 1):
        M += [block((s * 0.65, 0, 0), (0.25, 0.04, 0.03), DARK), block((s * 0.92, 0, 0), (0.06, 0.12, 0.06), RUST)]
        for i in range(4): M.append(block((s * (0.48 + 0.1 * i), 0, 0.045), (0.03, 0.025, 0.02), GORANGE if i % 2 else RUST))
    return M

# ================================================================== Que'vari
def sailstation():
    M = [sphere((0, 0, 0), 0.18, PEARL), flat_torus(0.22, 0.025, PEARL, z=0), sphere((0, 0, 0.17), 0.05, GWARM)]
    for k in range(6):
        a = k * math.pi / 3
        tri = Mesh(np.array([[0.22, -0.05, 0.0], [0.95, -0.28, 0.06], [0.95, 0.28, 0.06], [0.22, 0.05, 0.0]]), np.array([[0, 1, 2], [0, 2, 3]]), SAIL)
        M.append(rot_z(tri, a))
        M.append(rot_z(block((0.6, 0, 0.0), (0.38, 0.006, 0.006), BRASS), a))
        M.append(light(a, 0.96, 0.06, GWARM, 0.018))
    return M

# ================================================================== Umbral
def voidlantern():
    M = [loft([(-0.55, 0, 0, 0.01, 0.01, 1.4), (-0.2, 0, 0, 0.16, 0.12, 1.4), (0.2, 0, 0, 0.18, 0.13, 1.4), (0.6, 0, 0, 0.01, 0.01, 1.4)], VOID, ring=8, axis='x')]
    for s in (-1, 1):
        M += [rot_z(block((0, s * 0.3, 0.0), (0.42, 0.06, 0.02), VOID2), s * 0.15), block((0, s * 0.16, 0.0), (0.3, 0.004, 0.01), GVIOLET)]
    M += [zcyl((0, 0, 0.13), 0.06, 0.05, VOID2), sphere((0, 0, 0.19), 0.03, GVIOLET)]
    M += [rod((0.6, 0, 0), (0.85, 0, 0), 0.008, VOID2), sphere((0.87, 0, 0), 0.015, GVIOLET)]
    return M

# ================================================================== Lamplighters
def lighthouse():
    M = [zcyl((0, 0, -0.05), 0.32, 0.06, DARK), flat_torus(0.34, 0.03, BRASS, z=0.0), cone(0, 0, 0.0, 0.48, 0.14, 0.07, HULL, ring=16, sq=2)]
    M += [zcyl((0, 0, 0.52), 0.1, 0.05, BRASS), sphere((0, 0, 0.6), 0.09, GWARM), sphere((0, 0, 0.6), 0.075, LWHITE), cone(0, 0, 0.66, 0.78, 0.11, 0.0, BRASS, ring=12)]
    M += ring_of(4, 0.32, lambda a, x, y, k: [rot_z(block((0.45, 0, -0.05), (0.13, 0.05, 0.03), DARK), a), light(a, 0.6, -0.03, GWARM, 0.02)])
    return M
def vigil():
    M = [flat_torus(0.62, 0.11, DARK, n=64), flat_torus(0.62, 0.02, GSEAM, z=0.1, n=64), zcyl((0, 0, 0), 0.15, 0.1, DARK), sphere((0, 0, 0.12), 0.07, GWARM)]
    for k in range(8):
        a = k * math.pi / 4
        M += [arm(a, 0.14, 0.52, 0.025, DARK), rot_z(block((0.62, 0, 0.11), (0.03, 0.06, 0.004), GWARM), a + 0.2)]
    return M

# ================================================================== the Hollow and outlaws
def gutted():
    M = [loft([(-0.9, 0, 0, 0.08, 0.06, 3), (-0.6, 0, 0, 0.16, 0.12, 4), (0.4, 0, 0, 0.18, 0.13, 4), (0.85, 0, 0, 0.04, 0.03, 2)], RUST, ring=16, axis='x')]
    for x in (-0.35, 0.1, 0.45): M.append(block((x, 0.0, 0.09), (0.08, 0.13, 0.06), DARK))
    for x in (-0.6, -0.2, 0.2, 0.6):
        for s in (-1, 1): M.append(block((x, s * 0.26, 0), (0.008, 0.08, 0.15), GUNM))
        M.append(block((x, 0, 0.17), (0.008, 0.27, 0.008), GUNM))
    M += [block((-0.2, 0.0, 0.2), (0.12, 0.08, 0.05), JUNK[0]), block((0.32, 0.12, 0.17), (0.1, 0.06, 0.04), JUNK[1])]
    M += [sphere((-0.6, 0.27, 0.15), 0.015, LRED), sphere((0.6, -0.27, 0.15), 0.015, GORANGE), sphere((0.1, 0, 0.16), 0.02, GORANGE)]
    return M
def den():
    M = [lumpy((0, 0, 0), 0.5, ROCK, 61, squash=0.7)]
    rnd = np.random.default_rng(3)
    for k in range(5):
        a = k * 1.25; M.append(rot_z(block((0.5, 0, 0.02), (0.14, 0.04, 0.03), JUNK[k % 3]), a))
        M.append(rot_z(block((0.7, 0, 0.02), (0.08 + rnd.random() * 0.05, 0.05, 0.04), JUNK[(k + 1) % 3]), a + 0.2))
    M += [block((0.0, 0.0, 0.35), (0.14, 0.1, 0.06), JUNK[2]), zcyl((0.1, -0.1, 0.45), 0.02, 0.08, GUNM), sphere((0.1, -0.1, 0.54), 0.02, LRED), sphere((-0.2, 0.2, 0.3), 0.02, GORANGE)]
    return M

# ================================================================== Farside settlers
def prefab():
    M = [zcyl((0, 0, 0), 0.12, 0.08, HULL)]
    for k in range(4):
        a = k * math.pi / 2
        M += [rot_z(loft([(0.12, 0, 0, 0.06, 0.06, 2), (0.55, 0, 0, 0.06, 0.06, 2)], HAB, ring=12, axis='x'), a), rot_z(block((0.6, 0, 0), (0.05, 0.09, 0.06), ORANGE), a)]
    for x, y in ((0.28, 0.25), (-0.3, 0.22), (0.25, -0.28)):
        for j in range(2): M.append(block((x, y, 0.0 + j * 0.07), (0.08, 0.04, 0.032), [ORANGE, RUST, HULLB][j]))
    for s in (-1, 1): M += [panel(-0.2, s * 0.6, 0.2, s * 0.85, 0.0, SOLAR), block((0, s * 0.45, 0), (0.01, 0.17, 0.01), GUNM)]
    M += [sphere((0, 0, 0.1), 0.03, GAMBER)]
    return M
def domes():
    M = [lumpy((0, 0, -0.1), 0.6, ROCK, 71, squash=0.45)]
    for x, y, r in ((0, 0, 0.22), (0.35, 0.18, 0.13), (-0.32, 0.2, 0.15), (0.1, -0.35, 0.12), (-0.25, -0.25, 0.1)):
        M += [sphere((x, y, 0.13), r, GREENHOUSE, squash=0.6), flat_torus(r, 0.012, HULL, z=0.12)]
    M += [block((0.18, 0.05, 0.14), (0.12, 0.015, 0.012), HULL), block((-0.15, 0.1, 0.14), (0.1, 0.015, 0.012), HULL), sphere((0.48, -0.15, 0.08), 0.02, GAMBER)]
    return M

# ================================================================== Spacers' guild
def drydock():
    M = []
    for x in (-0.7, -0.35, 0.0, 0.35, 0.7):
        for s in (-1, 1): M.append(block((x, s * 0.3, 0), (0.02, 0.02, 0.2), ORANGE))
        M += [block((x, 0, 0.2), (0.02, 0.32, 0.02), ORANGE), block((x, 0, -0.2), (0.02, 0.32, 0.02), DARK)]
    M += [loft([(-0.55, 0, 0, 0.04, 0.03, 2), (-0.3, 0, 0, 0.13, 0.09, 2.6), (0.3, 0, 0, 0.14, 0.1, 2.6)], HULLB, ring=14, axis='x')]
    for x in (0.35, 0.5, 0.62): M.append(block((x, 0, 0), (0.008, 0.13, 0.09), GUNM))   # unplated ribs
    M += [block((0, 0.55, 0), (0.25, 0.1, 0.07), HAB), block((-0.95, 0.1, 0), (0.08, 0.05, 0.04), ORANGE), sphere((-0.95, 0.1, 0.05), 0.015, GAMBER)]
    M += [sphere((x, s * 0.3, 0.22), 0.016, GAMBER) for x in (-0.7, 0.7) for s in (-1, 1)]
    return M
def tradepost():
    M = [loft([(-0.25, 0, 0, 0.18, 0.18, 2), (0.25, 0, 0, 0.18, 0.18, 2)], HULL, ring=20, axis='z'), sphere((0, 0, 0.27), 0.08, GLASS, squash=0.6)]
    cols = [ORANGE, SILK2, RUST, HULLB, SILK3]
    for k in range(6):
        a = k * math.pi / 3
        M.append(arm(a, 0.17, 0.7, 0.025, GUNM))
        for j in range(3): M.append(rot_z(block((0.32 + j * 0.13, 0, 0.0), (0.055, 0.05, 0.04), cols[(k + j) % 5]), a))
        M.append(light(a, 0.73, 0.02, LGREEN if k % 2 else LRED, 0.015))
    return M

# ================================================================== Concord
def mirror():
    M = [zcyl((0, 0, 0), 0.14, 0.08, CONCORD), sphere((0, 0, 0.1), 0.06, GBLUE)]
    for i in range(-4, 5):
        for j in range(-4, 5):
            x = (i + 0.5 * (j % 2)) * 0.2; y = j * 0.2 * 0.866; r = math.hypot(x, y)
            if r < 0.22 or r > 0.9: continue
            M.append(hexcell(x, y, 0.02 + 0.12 * r * r, 0.1, 0.006, MIRROR))
    M += [flat_torus(0.92, 0.02, CONCORD, z=0.12), *[arm(k * math.pi / 3, 0.13, 0.9, 0.012, GUNM, 0.05) for k in range(6)]]
    return M
def customs():
    M = [flat_torus(0.55, 0.06, CONCORD, n=56), zcyl((0, 0, 0), 0.12, 0.07, CONCORD)]
    M += ring_of(4, 0, lambda a, x, y, k: [arm(a + math.pi / 4, 0.11, 0.5, 0.02, GUNM)])
    for k in range(4):
        a = k * math.pi / 2
        # gate arches the traffic passes through, each with a scanning light
        M += [rot_z(block((0.85, 0.15, 0), (0.05, 0.02, 0.12), CONCORD), a), rot_z(block((0.85, -0.15, 0), (0.05, 0.02, 0.12), CONCORD), a),
              rot_z(block((0.85, 0, 0.12), (0.05, 0.17, 0.02), CONCORD), a), rot_z(block((0.85, 0, 0.1), (0.01, 0.12, 0.004), GBLUE), a), arm(a, 0.6, 0.8, 0.015, GUNM)]
    return M

# ================================================================== frontier and the Deep
def outpost():
    M = [lumpy((0, 0, -0.05), 0.55, ROCK, 23, squash=0.6)]
    for x, y in ((0.2, 0.15), (-0.25, 0.05)):
        M += [block((x, y, 0.3), (0.012, 0.012, 0.18), ORANGE), block((x, y, 0.47), (0.05, 0.05, 0.012), ORANGE), sphere((x, y, 0.5), 0.015, GAMBER)]
    M += [block((0.05, -0.2, 0.28), (0.14, 0.06, 0.05), HAB), block((0.05, -0.2, 0.34), (0.08, 0.04, 0.01), DARK)]
    M += [block((0.55, 0, 0.0), (0.12, 0.02, 0.02), GUNM), block((0.7, 0, 0.0), (0.04, 0.08, 0.04), ORANGE), sphere((0.75, 0, 0.04), 0.014, LGREEN)]
    M += [flat_torus(0.62, 0.018, ORANGE, z=0.05, arc=0.7), block((-0.45, -0.35, 0.1), (0.12, 0.04, 0.03), GUNM), sphere((-0.35, -0.42, 0.12), 0.07, RUST, squash=0.5)]
    for s in (-1, 1): M.append(panel(-0.75, s * 0.15, -0.55, s * 0.4, 0.0, SOLAR))
    return M
def depot():
    M = [block((0, 0, 0), (0.06, 0.6, 0.06), GUNM), block((0, 0, 0), (0.5, 0.05, 0.05), GUNM)]
    for x, y in ((0.3, 0.3), (-0.3, 0.3), (0.3, -0.3), (-0.3, -0.3), (0, 0.6), (0, -0.6)):
        M += [sphere((x, y, 0.0), 0.16, TANK), sphere((x, y, 0.14), 0.02, LRED if x > 0 else LGREEN)]
    M += [block((0.0, 0, 0.1), (0.1, 0.1, 0.06), HULL), block((0.65, 0, 0), (0.1, 0.04, 0.03), DARK), sphere((0.75, 0, 0.03), 0.015, GAMBER)]
    return M
def listening():
    def dish(x, y, r, tilt):
        d = loft([(0.0, 0, 0, r * 0.06, r * 0.06, 2), (r * 0.12, 0, 0, r * 0.6, r * 0.6, 2), (r * 0.25, 0, 0, r, r, 2), (r * 0.27, 0, 0, r, r, 2)], HULLB, ring=32, axis='z')
        return [shift(rot(d, 'x', tilt), x, y, 0.1), rod((x, y, -0.02), (x, y, 0.1), 0.025, GUNM), rod((x, y, 0.1), (x, y - r * 0.3, 0.1 + r * 0.9), 0.008, GUNM), sphere((x, y - r * 0.3, 0.1 + r * 0.92), 0.018, GTEAL)]
    M = [block((0, 0, -0.06), (0.62, 0.22, 0.05), DARK), block((0, 0, -0.01), (0.5, 0.012, 0.008), GTEAL)]
    M += dish(0, 0.0, 0.36, 0.35) + dish(0.5, 0.05, 0.2, 0.5) + dish(-0.5, 0.05, 0.2, 0.5)
    for s in (-1, 1): M.append(panel(-0.3, s * 0.3, 0.3, s * 0.6, -0.06, SOLAR))
    M += [sphere((-0.6, 0.2, -0.02), 0.015, LRED), sphere((0.6, -0.2, -0.02), 0.015, LGREEN)]
    return M
def lab():
    M = [flat_torus(0.42, 0.04, HULL), zcyl((0, 0, 0), 0.1, 0.12, DARK)]
    for k in range(3):
        a = k * 2 * math.pi / 3 + 0.4; x, y = 0.42 * math.cos(a), 0.42 * math.sin(a)
        M += [sphere((x, y, 0.06), 0.12, GLASS), sphere((x, y, 0.06), 0.06, GTEAL if k != 1 else GVIOLET), arm(a, 0.1, 0.32, 0.02, GUNM)]
    M += [rod((0, 0, 0.12), (0, 0, 0.45), 0.01, GUNM), sphere((0, 0, 0.46), 0.02, LWHITE), block((-0.6, 0, 0), (0.12, 0.05, 0.04), HULLB)]
    return M

DESIGNS = dict(hive_spire=hive_spire, brood_lattice=brood_lattice, chime=chime, bell=bell, waterbell=waterbell, kelp=kelp, bazaar=bazaar,
               caravanserai=caravanserai, hall=hall, smelter=smelter, sailstation=sailstation, voidlantern=voidlantern, lighthouse=lighthouse,
               vigil=vigil, gutted=gutted, den=den, prefab=prefab, domes=domes, drydock=drydock, tradepost=tradepost, mirror=mirror,
               customs=customs, outpost=outpost, depot=depot, listening=listening, lab=lab)

def build(key, size):
    meshes = DESIGNS[key](); extent = np.linalg.norm(np.concatenate([m.V for m in meshes]), axis=1).max()
    rgb, alpha = render(meshes, size, 25, size * 0.43 / extent, tilt=50, ss=3, density=10)[0]
    return Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alpha, 0, 1) * 255]).round().astype(np.uint8))

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for key in DESIGNS:
        if ONLY and key not in ONLY: continue
        for size, suffix in ((360, ''), (800, '_landed')):
            build(key, size).save(os.path.join(OUT, f's_{key}{suffix}.webp'), 'WEBP', quality=92, method=6)
        print(key, flush=True)
