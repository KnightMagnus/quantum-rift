"""EV Quantum 5.0 hulls: four alien races (Vashari, Korrund, Ylith, Sarn), five ships each, and three Exotics.
Model space as in hulls2: nose +y, length about y in [-1, 1], x right, z up. Each design returns (meshes, glow, lights, sprite size)."""
import math
import numpy as np
from render2 import mat, loft, torus, block, sphere, wing, fin, pair, Mesh
from hulls2 import DESIGNS, engine, light, greebles, fuse, LRED, LGREEN, LWHITE, GLASS, DARK, GUNM

# ------------------------------------------------------------------ transforms
def rotm(axis, a):
    c, s = math.cos(a), math.sin(a)
    return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]
def xf(m, R=None, t=(0, 0, 0), about=(0, 0, 0)):
    a = np.array(about, float)
    def f(V):
        V = V - a
        if R is not None: V = V @ np.asarray(R).T
        return V + a + np.array(t, float)
    return m.tf(f)
def mv(m, x=0, y=0, z=0): return xf(m, t=(x, y, z))
def hoop(R, r, m, c=(0, 0, 0), tilt_x=math.pi / 2, tilt_y=0.0, n=48, k=10, layer=0, squash=1.0):
    """A ring. Default lies flat (in the x-y plane, seen from above); tilt to stand it up."""
    t = torus(R, r, m, n=n, k=k, squash=squash, layer=layer)
    t = xf(t, rotm('x', tilt_x))
    if tilt_y: t = xf(t, rotm('y', tilt_y))
    return mv(t, *c)
def rod(p0, p1, r, m, ring=8, layer=0):
    """A straight rod between two points."""
    p0, p1 = np.array(p0, float), np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d)
    base = loft([(0, 0, 0, r, r, 2), (L, 0, 0, r, r, 2)], m, ring=ring, layer=layer)    # along +y
    u = d / L; y = np.array([0, 1.0, 0]); v = np.cross(y, u); s = np.linalg.norm(v); c = float(np.dot(y, u))
    if s < 1e-9: R = np.eye(3) if c > 0 else np.diag([1, -1, -1])
    else:
        vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); R = np.eye(3) + vx + vx @ vx * ((1 - c) / s ** 2)
    return xf(base, R, t=p0)
def shard(c, length, w, h, m, ang=0.0, axis_dir=(0, 1, 0), layer=0, taper=(0.0, 1.0, 0.0)):
    """A faceted crystal: rhombic cross-section, pointed at both ends, along +y then rotated about z by ang."""
    a0, a1, a2 = taper
    s = loft([(-length / 2, 0, 0, w * a0 + 1e-3, h * a0 + 1e-3, 1), (-length * 0.15, 0, 0, w * a1, h * a1, 1), (length / 2, 0, 0, w * a2 + 1e-3, h * a2 + 1e-3, 1)], m, ring=4, layer=layer)
    if ang: s = xf(s, rotm('z', ang))
    return mv(s, *c)
def glow_beam(p0, p1, r, m): return rod(p0, p1, r, m, ring=8, layer=1)

# ================================================================== VASHARI: bio-insectoid swarm (chitin, membrane wings, bioluminescence)
CHITIN = mat((0.1, 0.13, 0.08), metal=0.45, rough=0.22, panel=0.35, grime=0.25, stripe=(0.3, 0.36, (0.45, 0.62, 0.12)))
CHITIN2 = mat((0.26, 0.31, 0.15), metal=0.35, rough=0.3, panel=0.5, grime=0.4)
CARAPACE = mat((0.18, 0.22, 0.1), metal=0.6, rough=0.15, panel=0.2, grime=0.2, stripe=(0.55, 0.6, (0.7, 0.85, 0.2)))
MEMBRANE = mat((0.62, 0.78, 0.42), metal=0.0, rough=0.95, panel=0, grime=0.0, ambient=0.62)
BIOLUM = mat((0.65, 1.0, 0.3), emissive=(0.62, 1.0, 0.28))
VGLOW = mat((0.6, 1.0, 0.35), emissive=(0.55, 1.0, 0.3))
def segments(y0, y1, n, w0, w1, h0, h1, m, z=0.0, x=0.0, sq=2.0):
    """An insect abdomen: overlapping rounded segments from y0 (front) to y1 (back)."""
    out = []
    for i in range(n):
        t = i / max(1, n - 1); y = y0 + (y1 - y0) * t; w = w0 + (w1 - w0) * t; h = h0 + (h1 - h0) * t; l = abs(y1 - y0) / n * 0.75
        out += [loft([(y + l, x, z, w * 0.55, h * 0.55, sq), (y + l * 0.4, x, z, w, h, sq), (y - l * 0.6, x, z, w * 0.92, h * 0.92, sq), (y - l, x, z, w * 0.5, h * 0.5, sq)], m, ring=18)]
    return out
def mandibles(y, x, z, length, r, m, curl=0.5):
    out = []
    for s in (1, -1):
        pts = [(y + length * t, x * s + s * r * 2 * math.sin(t * math.pi) * curl - s * length * 0.25 * t * t, z, r * (1 - 0.7 * t) + 0.004, r * 0.7 * (1 - 0.7 * t) + 0.004, 2) for t in np.linspace(0, 1, 6)]
        out += [loft(pts, m, ring=8)]
    return out
def bug_wing(x0, y, z, span, c_root, c_tip, sweep, dihedral, veins=True):
    out = [wing((x0, y), 0, span, c_root, c_tip, sweep, 0.004, MEMBRANE, z=z, dihedral=dihedral)]
    if veins:
        for t0 in (0.25, 0.6):
            out += [rod((x0, y - c_root * (t0 - 0.5), z), (x0 + span, y - sweep - c_tip * (t0 - 0.5), z + dihedral), 0.004, CHITIN2, ring=5)]
    return out
def vashari_darter():
    M = segments(0.55, 0.05, 3, 0.1, 0.12, 0.07, 0.08, CARAPACE) + segments(-0.15, -0.8, 4, 0.13, 0.05, 0.08, 0.04, CHITIN)
    M += [sphere((0, 0.72, 0.02), 0.09, CHITIN, squash=0.7)]
    M += [sphere((s * 0.06, 0.78, 0.05), 0.035, BIOLUM) for s in (1, -1)]
    M += mandibles(0.78, 0.05, 0.0, 0.25, 0.02, CHITIN2, 0.6)
    for s in (1, -1):
        for part in bug_wing(0.06, 0.25, 0.06, 0.62, 0.32, 0.14, 0.42, 0.08) + bug_wing(0.06, -0.05, 0.05, 0.48, 0.26, 0.1, 0.38, 0.02):
            M += [part if s > 0 else part.mirror()]
    G = [sphere((0, -0.83, 0), 0.05, VGLOW, layer=1)]
    return M + [block((0, -0.6, 0.05), (0.02, 0.15, 0.01), BIOLUM)], G, [light(0.66, -0.12, 0.1, LGREEN, 0.025), light(-0.66, -0.12, 0.1, LRED, 0.025)], 46
def vashari_spinner():   # light freighter: a fat silk-sac abdomen behind a small head
    M = [sphere((0, 0.72, 0.02), 0.13, CARAPACE, squash=0.7)] + segments(0.55, 0.3, 2, 0.17, 0.2, 0.1, 0.12, CHITIN)
    M += [loft([(0.25, 0, 0, 0.2, 0.15, 2), (0.0, 0, 0.02, 0.36, 0.26, 2), (-0.45, 0, 0.02, 0.38, 0.27, 2), (-0.8, 0, 0, 0.16, 0.12, 2)],
               mat((0.55, 0.6, 0.38), metal=0.1, rough=0.6, panel=0.3, grime=0.6, stripe=(0.0, 0.03, (0.45, 0.62, 0.12))), ring=24)]
    for k in range(5):   # silk bands glowing faintly
        y = 0.1 - k * 0.18
        M += [hoop(0.3 - abs(k - 2) * 0.03, 0.012, BIOLUM, c=(0, y, 0.02), tilt_x=0, squash=0.72)]
    M += mandibles(0.82, 0.07, -0.02, 0.18, 0.025, CHITIN2, 0.4)
    for s in (1, -1):   # stubby legs folded under
        for y in (0.45, 0.3):
            M += [rod((s * 0.15, y, -0.05), (s * 0.36, y - 0.1, -0.12), 0.015, CHITIN2), rod((s * 0.36, y - 0.1, -0.12), (s * 0.42, y - 0.3, -0.16), 0.012, CHITIN2)]
    M += [sphere((s * 0.08, 0.82, 0.06), 0.035, BIOLUM) for s in (1, -1)]
    G = [sphere((x, -0.84, 0), 0.06, VGLOW, layer=1) for x in (0.08, -0.08)]
    return M, G, [light(0.38, -0.3, 0.05, LGREEN, 0.03), light(-0.38, -0.3, 0.05, LRED, 0.03)], 78
def vashari_mantis():   # interceptor: raptorial forelimbs swept forward like lances
    M = segments(0.45, -0.05, 3, 0.09, 0.11, 0.06, 0.07, CARAPACE) + segments(-0.2, -0.85, 4, 0.12, 0.04, 0.07, 0.035, CHITIN)
    M += [loft([(0.85, 0, 0.03, 0.01, 0.01, 2), (0.7, 0, 0.03, 0.11, 0.06, 2), (0.58, 0, 0.03, 0.08, 0.05, 2)], CHITIN, ring=12)]   # triangular head
    M += [sphere((s * 0.09, 0.72, 0.06), 0.035, BIOLUM) for s in (1, -1)]
    for s in (1, -1):   # raptorial arms: shoulder -> elbow -> blade
        sh, el, tip = (s * 0.08, 0.45, 0.0), (s * 0.3, 0.6, 0.02), (s * 0.18, 1.0, 0.0)
        M += [rod(sh, el, 0.04, CHITIN2), rod(el, tip, 0.03, CARAPACE), sphere(el, 0.045, CHITIN2)]
        M += [mv(fin(0, 0, 0.06, 0.25, 0.05, 0.1, 0.01, CARAPACE), s * 0.24, 0.85, 0.0)]
        for part in bug_wing(0.06, 0.15, 0.05, 0.7, 0.26, 0.1, 0.55, 0.06, veins=False) + bug_wing(0.06, -0.1, 0.04, 0.55, 0.22, 0.08, 0.5, 0.0, veins=False):
            M += [part if s > 0 else part.mirror()]
    M += [rod((s * 0.04, 0.82, 0.07), (s * 0.25, 1.05, 0.15), 0.006, CHITIN2) for s in (1, -1)]   # antennae
    G = [sphere((0, -0.88, 0), 0.05, VGLOW, layer=1)]
    return M, G, [light(0.74, -0.42, 0.1, LGREEN, 0.025), light(-0.74, -0.42, 0.1, LRED, 0.025)], 60
def vashari_carapace():   # destroyer: armored beetle with split wing-cases open over glowing membranes
    M = [loft([(0.95, 0, 0, 0.02, 0.02, 2), (0.82, 0, 0, 0.2, 0.1, 2.2), (0.6, 0, 0, 0.26, 0.14, 2.2), (0.45, 0, 0, 0.22, 0.12, 2)], CARAPACE, ring=22)]   # pronotum
    M += mandibles(0.88, 0.12, 0, 0.3, 0.035, CHITIN2, 0.5)
    M += segments(0.35, -0.85, 5, 0.36, 0.18, 0.18, 0.1, CHITIN)
    for s in (1, -1):   # elytra: half-open shells
        el = loft([(0.42, 0, 0, 0.02, 0.01, 2), (0.3, 0, 0, 0.17, 0.05, 2.2), (-0.4, 0, 0, 0.2, 0.06, 2.2), (-0.85, 0, 0, 0.05, 0.02, 2)], CARAPACE, ring=18)
        el = xf(el, rotm('y', 0.6 * s), t=(s * 0.3, 0, 0.12))
        M += [xf(el, rotm('z', -0.42 * s), about=(s * 0.12, 0.42, 0.12))]
        for part in bug_wing(0.25, 0.1, 0.06, 0.62, 0.55, 0.2, 0.55, -0.02):
            M += [part if s > 0 else part.mirror()]
    for k in range(5): M += [block((0, 0.25 - k * 0.24, 0.17 - k * 0.012), (0.08, 0.04, 0.012), BIOLUM)]
    for x, y in ((0.18, 0.55), (-0.18, 0.55), (0.24, -0.1), (-0.24, -0.1)): M += [sphere((x, y, 0.13), 0.04, CHITIN2, squash=0.6), rod((x, y, 0.14), (x, y + 0.18, 0.14), 0.01, GUNM)]
    G = [sphere((x, -0.9, 0), 0.06, VGLOW, layer=1) for x in (0.0, 0.14, -0.14)]
    return M + greebles(501, 10, ((-0.25, 0.25), (-0.6, 0.2)), CHITIN2, size=(0.02, 0.03, 0.01), zfn=lambda x, y: 0.16), G, \
        [light(0.92, -0.25, 0.1, LGREEN, 0.03), light(-0.92, -0.25, 0.1, LRED, 0.03)], 168
def vashari_brood():   # carrier: a hive-queen with a vast egg-sac of glowing brood cells
    M = [sphere((0, 0.8, 0.02), 0.12, CARAPACE, squash=0.75)] + mandibles(0.88, 0.08, 0, 0.18, 0.03, CHITIN2, 0.5)
    M += segments(0.68, 0.38, 3, 0.2, 0.26, 0.12, 0.14, CARAPACE)
    sac = mat((0.32, 0.38, 0.2), metal=0.1, rough=0.55, panel=0.2, grime=0.5)
    M += [loft([(0.32, 0, 0.0, 0.25, 0.16, 2), (0.1, 0, 0.02, 0.48, 0.24, 2), (-0.45, 0, 0.02, 0.52, 0.26, 2), (-0.85, 0, 0, 0.2, 0.12, 2)], sac, ring=28)]
    rng = np.random.default_rng(7)
    for _ in range(44):   # brood cells
        a = rng.uniform(0, 2 * math.pi); y = rng.uniform(-0.75, 0.25); wy = 0.48 * math.sqrt(max(0.05, 1 - ((y + 0.2) / 0.62) ** 2))
        x = wy * 0.85 * math.cos(a); z = 0.02 + 0.24 * 0.85 * abs(math.sin(a))
        if z < 0.06: continue
        M += [sphere((x, y, z), rng.uniform(0.035, 0.055), BIOLUM, squash=0.6)]
    for s in (1, -1):
        for part in bug_wing(0.2, 0.5, 0.12, 0.85, 0.42, 0.18, 0.5, 0.1) + bug_wing(0.2, 0.25, 0.1, 0.7, 0.36, 0.14, 0.45, 0.02):
            M += [part if s > 0 else part.mirror()]
        for y in (0.6, 0.45):
            M += [rod((s * 0.2, y, -0.05), (s * 0.5, y - 0.1, -0.14), 0.02, CHITIN2), rod((s * 0.5, y - 0.1, -0.14), (s * 0.6, y - 0.4, -0.18), 0.016, CHITIN2)]
    M += [block((0, -0.15 - k * 0.15, -0.21), (0.08, 0.05, 0.02), DARK) for k in range(3)]   # launch slits
    G = [sphere((x, -0.88, 0), 0.07, VGLOW, layer=1) for x in (0.1, -0.1)]
    return M, G, [light(0.98, 0.3, 0.2, LGREEN, 0.03), light(-0.98, 0.3, 0.2, LRED, 0.03)], 226

# ================================================================== KORRUND: forged from living rock (basalt slabs, magma seams, vent drives)
BASALT = mat((0.2, 0.19, 0.19), metal=0.08, rough=0.92, panel=1.8, grime=1.6, stripe=(0.62, 0.66, (0.5, 0.18, 0.06)))
BASALT2 = mat((0.3, 0.27, 0.24), metal=0.1, rough=0.85, panel=1.4, grime=1.8)
IRONK = mat((0.36, 0.33, 0.3), metal=0.85, rough=0.45, panel=0.8, grime=1.4)
MAGMA = mat((1.0, 0.42, 0.08), emissive=(1.0, 0.45, 0.1))
KGLOW = mat((1.0, 0.55, 0.15), emissive=(1.0, 0.5, 0.12))
def slab(c, s, m=BASALT, sq=9, rz=0.0, rx=0.0):
    b = block(c, s, m, sq=sq)
    if rz: b = xf(b, rotm('z', rz), about=c)
    if rx: b = xf(b, rotm('x', rx), about=c)
    return b
def seam(p0, p1, r=0.012): return rod(p0, p1, r, MAGMA, ring=6)
def vent(x, y, z, w, h):
    return [slab((x, y, z), (w * 1.3, 0.05, h * 1.3), IRONK, sq=6)], [block((x, y - 0.06, z), (w, 0.03, h), KGLOW, sq=4, layer=1)]
def korrund_skiff():   # mining skiff: a hollowed boulder with a cutting-claw
    M = [sphere((0, -0.1, 0), 0.45, BASALT, squash=0.55)]
    M = [xf(M[0], np.diag([1.0, 1.35, 1.0]), about=(0, -0.1, 0))]
    M += [slab((0, 0.52, -0.02), (0.14, 0.12, 0.08), IRONK, sq=6)]
    M += [rod((s * 0.08, 0.6, -0.02), (s * 0.15, 0.95, -0.04), 0.03, IRONK) for s in (1, -1)]
    M += [seam((-0.35, -0.2, 0.18), (0.3, 0.1, 0.2)), seam((0.2, -0.55, 0.12), (-0.15, 0.3, 0.23)), seam((-0.1, -0.7, 0.05), (0.35, -0.3, 0.15))]
    M += [loft([(0.3, 0, 0.2, 0.05, 0.03, 3), (0.15, 0, 0.22, 0.06, 0.03, 3)], GLASS, ring=10)]
    eng, glo = vent(0, -0.78, 0, 0.12, 0.06)
    return M + eng, glo, [light(0.42, -0.2, 0.05, LGREEN, 0.03), light(-0.42, -0.2, 0.05, LRED, 0.03)], 52
def korrund_gunboat():   # a stepped stone wedge, cannon-heavy
    M = [loft([(1.0, 0, 0, 0.03, 0.03, 8), (0.6, 0, 0, 0.18, 0.1, 9), (-0.2, 0, 0, 0.36, 0.14, 9), (-0.8, 0, 0, 0.4, 0.16, 9)], BASALT, ring=20)]
    M += [slab((0, -0.2, 0.15), (0.22, 0.4, 0.06), BASALT2), slab((0, -0.35, 0.24), (0.12, 0.25, 0.05), BASALT2)]
    for s in (1, -1):
        M += [slab((s * 0.42, -0.35, -0.02), (0.08, 0.38, 0.1), BASALT, rz=0.08 * s)]
        M += [rod((s * 0.42, 0.0, 0.02), (s * 0.42, 0.55, 0.02), 0.035, IRONK), rod((s * 0.42, 0.55, 0.02), (s * 0.42, 0.62, 0.02), 0.045, MAGMA)]
        M += [seam((s * 0.12, 0.6, 0.08), (s * 0.34, -0.75, 0.15)), seam((s * 0.42, -0.05, 0.11), (s * 0.42, -0.7, 0.11))]
    M += [loft([(0.0, 0, 0.3, 0.06, 0.02, 3), (-0.1, 0, 0.3, 0.06, 0.02, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.0, 0.22, -0.22):
        e, g = vent(x, -0.84, 0.02, 0.07, 0.05); eng += e; glo += g
    return M + eng, glo, [light(0.5, -0.6, 0.05, LGREEN, 0.03), light(-0.5, -0.6, 0.05, LRED, 0.03)], 104
def korrund_hauler():   # bulk ore hauler: a chain of stone cargo blocks bound with glowing magma bands
    M = [loft([(0.98, 0, 0, 0.05, 0.04, 6), (0.75, 0, 0, 0.2, 0.13, 7), (0.55, 0, 0, 0.22, 0.14, 7)], BASALT2, ring=20)]
    M += [loft([(0.82, 0, 0.12, 0.08, 0.02, 3), (0.72, 0, 0.13, 0.08, 0.02, 3)], GLASS, ring=10)]
    for k, y in enumerate((0.38, 0.05, -0.28, -0.61)):
        w = 0.3 if k % 2 == 0 else 0.27
        M += [slab((0, y, 0), (w, 0.14, 0.17), BASALT, rz=0.03 * (1 if k % 2 else -1))]
        M += [hoop(0.0, 0.0, MAGMA)] if False else []
        M += [block((0, y + 0.155, 0), (w * 0.8, 0.012, 0.15), MAGMA, sq=6)]
    M += [rod((0, 0.55, -0.12), (0, -0.8, -0.12), 0.05, IRONK)]
    for s in (1, -1): M += [seam((s * 0.3, 0.5, 0.17), (s * 0.28, -0.75, 0.17), 0.01)]
    eng = []; glo = []
    for x in (0.15, -0.15):
        e, g = vent(x, -0.84, 0, 0.09, 0.08); eng += e; glo += g
    return M + eng, glo, [light(0.34, 0.3, 0.12, LGREEN, 0.03), light(-0.34, 0.3, 0.12, LRED, 0.03)], 112
def korrund_forge():   # cruiser: a floating forge-mountain, a caldera of magma amidships
    M = [loft([(1.0, 0, -0.02, 0.05, 0.04, 6), (0.7, 0, 0, 0.26, 0.14, 7), (0.1, 0, 0, 0.42, 0.18, 7), (-0.55, 0, 0, 0.46, 0.18, 7), (-0.85, 0, 0, 0.36, 0.14, 6)], BASALT, ring=24)]
    M += [loft([(0.25, 0, 0.12, 0.3, 0.06, 3), (-0.1, 0, 0.2, 0.24, 0.12, 2.6), (-0.4, 0, 0.12, 0.3, 0.06, 3)], BASALT2, ring=24)]   # the cone
    M += [loft([(0.0, 0, 0.3, 0.12, 0.02, 2), (-0.2, 0, 0.3, 0.12, 0.02, 2)], MAGMA, ring=16)]    # caldera
    for s in (1, -1):
        for y in (0.45, -0.05, -0.55):
            M += [slab((s * 0.42, y, 0.04), (0.1, 0.16, 0.1), BASALT2, rz=0.1 * s), rod((s * 0.45, y + 0.1, 0.16), (s * 0.45, y + 0.32, 0.16), 0.02, IRONK)]
        M += [seam((s * 0.1, 0.85, 0.06), (s * 0.4, 0.1, 0.17)), seam((s * 0.4, 0.1, 0.17), (s * 0.36, -0.8, 0.13)), seam((s * 0.15, -0.2, 0.25), (s * 0.3, -0.7, 0.16))]
    eng = []; glo = []
    for x in (0.0, 0.2, -0.2, 0.38, -0.38):
        e, g = vent(x, -0.9, 0, 0.06, 0.06); eng += e; glo += g
    glo += [loft([(0.0, 0, 0.32, 0.1, 0.02, 2), (-0.2, 0, 0.32, 0.1, 0.02, 2)], KGLOW, ring=16, layer=1)]
    return M + eng + greebles(511, 16, ((-0.35, 0.35), (-0.7, 0.6)), IRONK, size=(0.025, 0.04, 0.015), zfn=lambda x, y: 0.15), glo, \
        [light(0.6, -0.6, 0.1, LGREEN, 0.03), light(-0.6, -0.6, 0.1, LRED, 0.03)], 186
def korrund_mountain():   # dreadnought: a whole mountain range, three peaks, lava rivers, a ring of cannon towers
    M = [loft([(1.0, 0, -0.04, 0.12, 0.06, 6), (0.75, 0, 0, 0.38, 0.16, 7), (0.0, 0, 0, 0.5, 0.2, 7), (-0.7, 0, 0, 0.48, 0.18, 7), (-0.95, 0, 0, 0.36, 0.14, 6)], BASALT, ring=28)]
    for y, h, w in ((0.45, 0.22, 0.2), (-0.05, 0.34, 0.26), (-0.55, 0.26, 0.22)):
        M += [loft([(y + w, 0, 0.12, 0.02, 0.01, 2), (y + w * 0.3, 0, 0.12 + h * 0.6, w * 0.7, h * 0.45, 2.4), (y - w * 0.4, 0, 0.12 + h * 0.3, w, h * 0.5, 2.4), (y - w, 0, 0.12, 0.05, 0.02, 2)], BASALT2, ring=22)]
        M += [sphere((0, y, 0.12 + h * 0.62), 0.05, MAGMA, squash=0.5)]
    for s in (1, -1):
        M += [seam((s * 0.02, 0.45, 0.3), (s * 0.32, 0.1, 0.18), 0.014), seam((s * 0.03, -0.05, 0.38), (s * 0.4, -0.3, 0.19), 0.016), seam((s * 0.02, -0.55, 0.32), (s * 0.3, -0.85, 0.15), 0.014)]
        for y in (0.7, 0.3, -0.1, -0.5, -0.82):
            M += [slab((s * 0.48, y, 0.08), (0.06, 0.06, 0.12), IRONK, sq=6), rod((s * 0.48, y, 0.2), (s * 0.48, y + 0.16, 0.2), 0.018, IRONK)]
        M += [slab((s * 0.6, -0.3, -0.02), (0.08, 0.5, 0.08), BASALT2, rz=0.05 * s)]
    eng = []; glo = []
    for x in (0.0, 0.16, -0.16, 0.32, -0.32, 0.6, -0.6):
        e, g = vent(x, -0.98 if abs(x) < 0.5 else -0.82, 0, 0.06, 0.07); eng += e; glo += g
    return M + eng + greebles(512, 30, ((-0.4, 0.4), (-0.8, 0.8)), IRONK, size=(0.03, 0.05, 0.015), zfn=lambda x, y: 0.18), glo, \
        [light(0.68, -0.3, 0.1, LGREEN, 0.03), light(-0.68, -0.3, 0.1, LRED, 0.03), light(0, 1.0, 0.0, LWHITE, 0.02)], 268

# ================================================================== YLITH: crystalline, faceted shards held apart by resonance
CRYS = mat((0.86, 0.5, 0.95), metal=0.9, rough=0.06, panel=0.0, grime=0.0, ambient=0.35)
CRYS2 = mat((0.55, 0.3, 0.8), metal=0.9, rough=0.1, panel=0.0, grime=0.0, ambient=0.3)
CRYSW = mat((0.95, 0.88, 1.0), metal=0.8, rough=0.05, panel=0.0, grime=0.0, ambient=0.45)
YCORE = mat((1.0, 0.55, 1.0), emissive=(1.0, 0.5, 1.0))
YGLOW = mat((1.0, 0.6, 1.0), emissive=(0.95, 0.5, 1.0))
def tether(p0, p1): return glow_beam(p0, p1, 0.008, YGLOW)
def ylith_glint():   # scout: one long shard, two flanking splinters, nothing touching
    M = [shard((0, 0.05, 0), 1.7, 0.13, 0.09, CRYS)]
    M += [shard((s * 0.3, -0.15, 0), 0.9, 0.07, 0.05, CRYS2, ang=0.12 * s) for s in (1, -1)]
    M += [sphere((0, -0.05, 0.0), 0.06, YCORE)]
    G = [tether((0, -0.05, 0), (s * 0.3, -0.15, 0)) for s in (1, -1)] + [glow_beam((0, -0.82, 0), (0, -1.0, 0), 0.03, YGLOW)]
    return M, G, [light(0.38, -0.5, 0.0, LGREEN, 0.025), light(-0.38, -0.5, 0.0, LRED, 0.025)], 56
def ylith_facet():   # luxury yacht: a slowly turning crown of shards around a white heart
    M = [shard((0, 0.1, 0), 1.6, 0.16, 0.12, CRYSW)]
    for k in range(6):
        a = k * math.pi / 3 + math.pi / 6; r = 0.38
        M += [shard((r * math.sin(a), 0.05 + r * math.cos(a) * 0.9, 0.02), 0.5, 0.06, 0.05, CRYS, ang=-a)]
    M += [sphere((0, 0.05, 0.02), 0.1, YCORE)]
    G = [tether((0, 0.05, 0.02), (0.38 * math.sin(k * math.pi / 3 + math.pi / 6), 0.05 + 0.38 * math.cos(k * math.pi / 3 + math.pi / 6) * 0.9, 0.02)) for k in range(6)]
    G += [glow_beam((0, -0.7, 0), (0, -0.95, 0), 0.04, YGLOW)]
    return M, G, [light(0.42, -0.25, 0.02, LGREEN, 0.025), light(-0.42, -0.25, 0.02, LRED, 0.025)], 92
def ylith_lattice():   # frigate: a spearhead of three shard-banks, a resonance lattice between them
    M = [shard((0, 0.15, 0), 1.6, 0.16, 0.12, CRYS)]
    for s in (1, -1):
        M += [shard((s * 0.36, -0.2, 0), 1.1, 0.11, 0.08, CRYS2, ang=0.05 * s), shard((s * 0.6, -0.45, -0.02), 0.7, 0.07, 0.05, CRYS, ang=0.1 * s)]
    for y in (0.35, -0.05, -0.4): M += [sphere((0, y, 0.0), 0.05, YCORE)]
    G = []
    for s in (1, -1):
        for y in (0.35, -0.05, -0.4):
            G += [tether((0, y, 0), (s * 0.36, y - 0.1, 0))]
        G += [tether((s * 0.36, -0.4, 0), (s * 0.6, -0.5, -0.02)), glow_beam((s * 0.36, -0.75, 0), (s * 0.36, -0.95, 0), 0.03, YGLOW)]
    G += [glow_beam((0, -0.65, 0), (0, -0.92, 0), 0.04, YGLOW)]
    return M, G, [light(0.66, -0.5, 0.0, LGREEN, 0.03), light(-0.66, -0.5, 0.0, LRED, 0.03)], 132
def ylith_resonance():   # cruiser: a great tuning-fork of crystal; the gap between the tines sings
    M = []
    for s in (1, -1):
        M += [shard((s * 0.22, 0.2, 0), 1.5, 0.14, 0.12, CRYS, ang=-0.03 * s), shard((s * 0.45, -0.35, 0.02), 0.9, 0.1, 0.08, CRYS2, ang=0.1 * s)]
        M += [shard((s * 0.12, -0.65, 0.05), 0.55, 0.08, 0.06, CRYSW)]
    M += [shard((0, -0.45, 0), 0.9, 0.16, 0.13, CRYSW)]
    M += [sphere((0, 0.25, 0.0), 0.07, YCORE), sphere((0, -0.1, 0.0), 0.09, YCORE)]
    G = [glow_beam((0, 0.9, 0), (0, -0.1, 0), 0.03, YGLOW)]   # the singing gap
    for s in (1, -1):
        G += [tether((0, -0.1, 0), (s * 0.22, 0.0, 0)), tether((0, 0.25, 0), (s * 0.22, 0.3, 0)), tether((s * 0.22, -0.3, 0), (s * 0.45, -0.4, 0.02)),
              glow_beam((s * 0.45, -0.8, 0.02), (s * 0.45, -1.0, 0.02), 0.03, YGLOW)]
    G += [glow_beam((0, -0.9, 0), (0, -1.05, 0), 0.05, YGLOW)]
    return M, G, [light(0.58, -0.4, 0.02, LGREEN, 0.03), light(-0.58, -0.4, 0.02, LRED, 0.03)], 178
def ylith_cathedral():   # carrier: a cathedral of crystal spires around a hollow nave where drones are grown
    M = []
    rng = np.random.default_rng(23)
    for k in range(14):   # spires in two ranks, tallest along the spine
        y = 0.75 - k * 0.11; s = 1 if k % 2 else -1; x = s * (0.18 + 0.12 * abs(math.sin(k)))
        M += [shard((x, y, 0.02), 0.55 + 0.25 * math.cos((k - 7) / 4), 0.07, 0.06, CRYS if k % 3 else CRYSW, ang=-0.15 * s)]
        M += [shard((x * 2.1, y - 0.05, 0), 0.4, 0.05, 0.04, CRYS2, ang=-0.3 * s)]
    M += [shard((0, 0.9, 0), 0.5, 0.08, 0.06, CRYSW)]
    nave = mat((0.25, 0.12, 0.32), metal=0.6, rough=0.2, panel=0.5, grime=0.1)
    M += [loft([(0.65, 0, -0.04, 0.05, 0.02, 2), (0.4, 0, -0.04, 0.16, 0.05, 2.5), (-0.7, 0, -0.04, 0.18, 0.05, 2.5), (-0.85, 0, -0.04, 0.08, 0.03, 2)], nave, ring=18)]
    for y in np.linspace(0.45, -0.65, 7): M += [sphere((0, y, 0.02), 0.045, YCORE)]
    G = [glow_beam((0, 0.5, 0.02), (0, -0.7, 0.02), 0.02, YGLOW)]
    for x in (0.3, -0.3, 0.0): G += [glow_beam((x, -0.75, 0), (x, -0.98, 0), 0.04, YGLOW)]
    return M, G, [light(0.62, -0.3, 0.02, LGREEN, 0.03), light(-0.62, -0.3, 0.02, LRED, 0.03)], 222

# ================================================================== SARN: nomad caravans (rust and brass, spinning wheels, patched canvas)
RUST = mat((0.46, 0.27, 0.16), metal=0.6, rough=0.55, panel=1.4, grime=1.7, stripe=(0.4, 0.45, (0.75, 0.6, 0.25)))
RUST2 = mat((0.36, 0.3, 0.26), metal=0.7, rough=0.5, panel=1.6, grime=1.8)
BRASS = mat((0.8, 0.62, 0.28), metal=0.95, rough=0.25, panel=0.3, grime=0.5)
CANVAS = mat((0.66, 0.58, 0.44), metal=0.0, rough=0.95, panel=0.6, grime=1.2, stripe=(0.2, 0.3, (0.6, 0.2, 0.15)))
SGLOW = mat((1.0, 0.75, 0.35), emissive=(1.0, 0.72, 0.3))
SLAMP = mat((1.0, 0.8, 0.45), emissive=(1.0, 0.8, 0.45))
def wheel(c, R, m=BRASS, spokes=6, r=0.02, hub=0.05, tilt_x=math.pi / 2, tilt_y=0.0):
    out = [hoop(R, r, m, c=c, tilt_x=tilt_x, tilt_y=tilt_y)]
    for k in range(spokes):
        a = 2 * math.pi * k / spokes
        p = np.array([R * math.cos(a), R * math.sin(a), 0.0])
        if tilt_x != math.pi / 2:   # rotate the flat-ring frame to match the hoop
            pass
        out += [rod(c, (c[0] + p[0], c[1] + p[1], c[2]), r * 0.5, RUST2, ring=6)]
    out += [sphere(c, hub, RUST, squash=0.7)]
    return out
def sarn_runner():   # courier: a single spinning wheel with a rider-cab at the hub
    M = wheel((0, 0.0, 0.0), 0.5, spokes=8, r=0.03, hub=0.12)
    M += [loft([(0.8, 0, 0.02, 0.02, 0.02, 2), (0.55, 0, 0.02, 0.07, 0.05, 2.4), (-0.6, 0, 0.02, 0.08, 0.05, 2.4), (-0.8, 0, 0.02, 0.05, 0.04, 2)], RUST, ring=14)]
    M += [loft([(0.62, 0, 0.07, 0.04, 0.02, 2), (0.45, 0, 0.08, 0.05, 0.025, 2)], GLASS, ring=10)]
    M += [mv(wing((0.0, -0.55), 0, 0.2, 0.18, 0.1, 0.05, 0.004, CANVAS, z=0.03), 0.0)] + [mv(wing((0.0, -0.55), 0, 0.2, 0.18, 0.1, 0.05, 0.004, CANVAS, z=0.03).mirror(), 0.0)]
    eng, glo = engine(0, -0.84, 0.02, 0.05, SGLOW, DARK)
    return M + eng, glo, [light(0.5, 0.0, 0.03, LGREEN, 0.03), light(-0.5, 0.0, 0.03, LRED, 0.03), light(0, 0.82, 0.03, SLAMP, 0.02)], 50
def sarn_wheelhouse():   # trader: a hab-wheel on a keel, cargo nets and patched canvas awnings
    M = [loft([(0.95, 0, 0, 0.03, 0.03, 2), (0.7, 0, 0, 0.1, 0.08, 3), (-0.7, 0, 0, 0.12, 0.09, 3), (-0.88, 0, 0, 0.08, 0.06, 2.5)], RUST, ring=16)]
    M += wheel((0, 0.3, 0.02), 0.36, spokes=6, r=0.035, hub=0.1)
    for s in (1, -1):
        M += [loft([(-0.1, s * 0.2, 0, 0.08, 0.07, 3), (-0.7, s * 0.22, 0, 0.09, 0.08, 3)], CANVAS, ring=12)]
        M += [rod((s * 0.12, -0.15, 0.05), (s * 0.2, -0.15, 0.05), 0.012, BRASS), rod((s * 0.12, -0.6, 0.05), (s * 0.22, -0.6, 0.05), 0.012, BRASS)]
    M += [loft([(0.85, 0, 0.07, 0.04, 0.02, 2), (0.72, 0, 0.09, 0.06, 0.03, 2)], GLASS, ring=10)]
    M += [sphere((s * 0.36, 0.3, 0.04), 0.025, SLAMP) for s in (1, -1)]
    eng = []; glo = []
    for x in (0.07, -0.07):
        e, g = engine(x, -0.92, 0, 0.05, SGLOW, DARK); eng += e; glo += g
    return M + eng + greebles(521, 10, ((-0.12, 0.12), (-0.7, 0.6)), RUST2, zfn=lambda x, y: 0.08), glo, \
        [light(0.38, 0.3, 0.04, LGREEN, 0.03), light(-0.38, 0.3, 0.04, LRED, 0.03)], 88
def sarn_gyre():   # frigate: twin counter-spinning gun-wheels on outriggers
    M = [loft([(1.0, 0, 0, 0.02, 0.02, 2), (0.75, 0, 0, 0.12, 0.08, 3), (-0.6, 0, 0, 0.16, 0.1, 3.4), (-0.85, 0, 0, 0.12, 0.08, 3)], RUST, ring=18)]
    for s in (1, -1):
        M += [rod((s * 0.12, 0.05, 0), (s * 0.42, 0.0, 0), 0.03, RUST2), rod((s * 0.12, -0.4, 0), (s * 0.42, -0.35, 0), 0.03, RUST2)]
        M += wheel((s * 0.48, -0.17, 0.0), 0.26, spokes=5, r=0.03, hub=0.07)
        for k in range(5):
            a = 2 * math.pi * k / 5
            M += [sphere((s * 0.48 + 0.26 * math.cos(a), -0.17 + 0.26 * math.sin(a), 0.03), 0.03, RUST2, squash=0.6)]
    M += [loft([(0.65, 0, 0.08, 0.05, 0.025, 2), (0.48, 0, 0.1, 0.06, 0.03, 2)], GLASS, ring=10)]
    M += [loft([(0.3, 0, 0.1, 0.08, 0.04, 3), (-0.5, 0, 0.12, 0.1, 0.05, 3)], CANVAS, ring=12)]
    eng = []; glo = []
    for x in (0.0, 0.1, -0.1):
        e, g = engine(x, -0.9, 0.0, 0.05, SGLOW, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.74, -0.17, 0.04, LGREEN, 0.03), light(-0.74, -0.17, 0.04, LRED, 0.03)], 124
def sarn_caravan():   # liner: a train of hab-wheels strung along a spine, lanterns lit
    M = [loft([(1.0, 0, 0, 0.03, 0.03, 2), (0.82, 0, 0, 0.12, 0.09, 3), (0.65, 0, 0, 0.12, 0.09, 3)], BRASS, ring=16)]
    M += [rod((0, 0.7, 0), (0, -0.85, 0), 0.04, RUST2)]
    for k, y in enumerate((0.45, 0.05, -0.35)):
        M += wheel((0, y, 0.0), 0.3 - 0.02 * k, spokes=8, r=0.03, hub=0.08)
        M += [sphere((0.3 * math.cos(a), y + 0.3 * math.sin(a), 0.03), 0.018, SLAMP) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
    M += [loft([(-0.55, 0, 0, 0.14, 0.1, 3), (-0.85, 0, 0, 0.16, 0.11, 3)], CANVAS, ring=14)]
    M += [loft([(0.92, 0, 0.06, 0.04, 0.02, 2), (0.8, 0, 0.08, 0.06, 0.03, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.08, -0.08, 0.0):
        e, g = engine(x, -0.92, 0.0 if x else 0.06, 0.05, SGLOW, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.34, 0.45, 0.04, LGREEN, 0.03), light(-0.34, 0.45, 0.04, LRED, 0.03)], 150
def sarn_grand():   # the Grand Caravan: a city on wheels, a great outer ring around a market hub, towed barges astern
    M = wheel((0, 0.15, 0.0), 0.62, spokes=10, r=0.04, hub=0.0)
    M += [hoop(0.48, 0.025, RUST2, c=(0, 0.15, 0.02)), hoop(0.3, 0.03, BRASS, c=(0, 0.15, 0.04))]
    M += [loft([(0.35, 0, 0.0, 0.18, 0.12, 2.2), (0.15, 0, 0.04, 0.22, 0.14, 2.2), (-0.05, 0, 0.0, 0.18, 0.12, 2.2)], RUST, ring=20)]   # market hub
    M += [loft([(0.3, 0, 0.12, 0.1, 0.04, 2), (0.0, 0, 0.12, 0.1, 0.04, 2)], CANVAS, ring=14)]
    rng = np.random.default_rng(31)
    for k in range(16):   # stalls and habs on the ring
        a = 2 * math.pi * k / 16; x = 0.62 * math.cos(a); y = 0.15 + 0.62 * math.sin(a)
        M += [block((x, y, 0.03), (0.05, 0.05, 0.04), [RUST, RUST2, CANVAS][k % 3], sq=4)]
        if k % 2 == 0: M += [sphere((x * 1.08, 0.15 + (y - 0.15) * 1.08, 0.05), 0.02, SLAMP)]
    M += [rod((0, -0.47, 0), (0, -0.95, 0), 0.03, RUST2)]
    for y in (-0.6, -0.82):   # towed barges
        M += [block((0, y, 0), (0.16, 0.08, 0.07), CANVAS, sq=5)] + [rod((s * 0.16, y, 0), (s * 0.4, y + 0.25, 0), 0.008, BRASS) for s in (1, -1)]
    eng = []; glo = []
    for a in np.linspace(math.pi * 1.15, math.pi * 1.85, 5):
        e, g = engine(0.62 * math.cos(a), 0.15 + 0.62 * math.sin(a) - 0.04, 0.0, 0.045, SGLOW, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.66, 0.15, 0.05, LGREEN, 0.03), light(-0.66, 0.15, 0.05, LRED, 0.03)], 238

# ================================================================== EXOTICS
def mobius_mesh(a, b, w, m, n=160, k=6, twists=1, thick=0.012, layer=0):
    """A Mobius band around an ellipse (a across, b along): the strip turns through twists*180 degrees going round."""
    V = []; F = []
    for i in range(n):
        u = 2 * math.pi * i / n
        c = np.array([a * math.sin(u), b * math.cos(u), 0.05 * math.sin(2 * u)])
        t = np.array([a * math.cos(u), -b * math.sin(u), 0.1 * math.cos(2 * u)]); t /= np.linalg.norm(t)
        nrm = np.array([0, 0, 1.0]); bi = np.cross(t, nrm); bi /= np.linalg.norm(bi)
        th = twists * u / 2
        d = math.cos(th) * bi + math.sin(th) * nrm   # across-strip direction
        e = np.cross(t, d)                            # strip normal
        for j in range(k):
            s = -w + 2 * w * j / (k - 1)
            for side in (1, -1): V.append(c + d * s + e * thick * side)
    rowlen = 2 * k
    for i in range(n):
        i2 = (i + 1) % n; flip = (i2 == 0) and (twists % 2 == 1)
        for j in range(k - 1):
            for side in (0, 1):
                p = i * rowlen + j * 2 + side; q = i * rowlen + (j + 1) * 2 + side
                if not flip: p2 = i2 * rowlen + j * 2 + side; q2 = i2 * rowlen + (j + 1) * 2 + side
                else: p2 = i2 * rowlen + (k - 1 - j) * 2 + (1 - side); q2 = i2 * rowlen + (k - 2 - j) * 2 + (1 - side)
                F += [(p, q, q2), (p, q2, p2)] if side == 0 else [(p, q2, q), (p, p2, q2)]
    return Mesh(np.array(V), np.array(F), m, layer)
def exotic_mobius():
    """The Möbius: a hull that is one continuous twisted ribbon. It has only one side, and the crew swear the far end of the
    corridor is the near end, upside down."""
    RIB = mat((0.95, 0.85, 0.6), metal=1.0, rough=0.08, panel=0.15, grime=0.0, ambient=0.3, stripe=(0.47, 0.53, (0.4, 0.95, 1.0)))
    EDGE = mat((0.5, 1.0, 1.0), emissive=(0.5, 1.0, 1.0))
    M = [mobius_mesh(0.42, 0.88, 0.2, RIB, n=240, twists=3)]
    M += [mobius_mesh(0.42, 0.88, 0.205, EDGE, k=2, thick=0.004, n=240, twists=3)]   # glowing edge lines (a slightly wider sliver)
    M += [sphere((0, 0, 0.0), 0.08, mat((0.9, 1.0, 1.0), emissive=(0.85, 1.0, 1.0)))]
    M += [hoop(0.14, 0.008, EDGE, tilt_x=t, tilt_y=u) for t, u in ((0.3, 0.0), (1.4, 0.8), (2.4, -0.7))]
    for a in np.linspace(0, 2 * math.pi, 6, endpoint=False):   # filament spokes to the band
        M += [rod((0, 0, 0), (0.42 * math.sin(a) * 0.96, 0.88 * math.cos(a) * 0.96, 0.05 * math.sin(2 * a)), 0.006, EDGE)]
    G = [sphere((0, 0, 0), 0.11, mat((0.6, 1.0, 1.0), emissive=(0.6, 1.0, 1.0)), layer=1)]
    G += [glow_beam((0, -0.9, 0), (0, -1.15, 0), 0.05, mat((0.6, 1.0, 1.0), emissive=(0.55, 1.0, 1.0)))]
    return M, G, [light(0.44, 0, 0.0, LGREEN, 0.03), light(-0.44, 0, 0.0, LRED, 0.03)], 210
def exotic_orrery():
    """The Orrery: a captured star in a gimballed cage of rings, with six worldlets riding the rings like beads."""
    STAR = mat((1.0, 0.85, 0.5), emissive=(1.0, 0.86, 0.5))
    CAGE = mat((0.78, 0.62, 0.3), metal=0.95, rough=0.2, panel=0.2, grime=0.3)
    M = [sphere((0, 0, 0), 0.2, STAR)]
    rings = [(0.5, 0.0, 0.0), (0.66, 0.5, 0.3), (0.8, -0.4, -0.5), (0.95, 0.15, 1.2)]
    worlds = [mat((0.3, 0.5, 0.9), metal=0.2, rough=0.6, panel=0.4), mat((0.8, 0.35, 0.2), metal=0.1, rough=0.8, panel=0.6),
              mat((0.85, 0.85, 0.9), metal=0.4, rough=0.3, panel=0.2), mat((0.35, 0.7, 0.35), metal=0.1, rough=0.7, panel=0.5),
              mat((0.6, 0.5, 0.75), metal=0.5, rough=0.3, panel=0.3), mat((0.9, 0.7, 0.4), metal=0.3, rough=0.5, panel=0.5)]
    for n, (R, tx, ty) in enumerate(rings):
        M += [hoop(R, 0.014, CAGE, tilt_x=math.pi / 2 + tx, tilt_y=ty, n=72)]
        for k in range(2 if n < 3 else 1):
            a = 1.1 + n * 1.7 + k * math.pi
            p = np.array([R * math.cos(a), R * math.sin(a), 0.0])
            p = p @ rotm('x', tx).T @ rotm('y', ty).T
            M += [sphere(tuple(p), 0.05 + 0.02 * ((n + k) % 3), worlds[(n * 2 + k) % 6])]
    M += [rod((0, -0.2, 0), (0, -0.98, 0), 0.025, CAGE), rod((0, 0.2, 0), (0, 0.98, 0), 0.02, CAGE)]
    M += [sphere((0, 0.98, 0), 0.04, CAGE), loft([(-0.98, 0, 0, 0.09, 0.09, 2), (-1.02, 0, 0, 0.11, 0.11, 2)], CAGE, ring=16)]
    G = [sphere((0, 0, 0), 0.3, mat((1.0, 0.75, 0.35), emissive=(1.0, 0.72, 0.3)), layer=1), sphere((0, -1.06, 0), 0.07, STAR, layer=1)]
    return M, G, [light(0.95, 0.0, 0.0, LGREEN, 0.03), light(-0.95, 0.0, 0.0, LRED, 0.03)], 250
def exotic_horizon():
    """The Event Horizon: a ship built around a tame black hole. The hull is the accretion disk; the jets are the drive."""
    VOID = mat((0.0, 0.0, 0.0), metal=1.0, rough=0.0, panel=0.0, grime=0.0, ambient=0.0)
    M = [sphere((0, 0, 0), 0.22, VOID)]
    cols = [(1.0, 0.95, 0.85), (1.0, 0.8, 0.45), (1.0, 0.6, 0.25), (0.95, 0.4, 0.15), (0.75, 0.22, 0.12), (0.5, 0.12, 0.1)]
    for k, c in enumerate(cols):   # the disk, hot and white inside, dull red at the rim
        R = 0.3 + k * 0.1
        M += [hoop(R, 0.045, mat(c, emissive=tuple(v * (1.0 - k * 0.1) for v in c)), squash=1.0, tilt_x=math.pi / 2 + 0.2, n=80, k=8)]
    M += [hoop(0.25, 0.012, mat((1.0, 0.95, 0.85), emissive=(1.0, 0.95, 0.85)), tilt_x=0.0, n=60)]   # photon ring, seen edge-on
    CAGE = mat((0.2, 0.2, 0.25), metal=0.9, rough=0.3, panel=1.0, grime=0.6)
    for a in np.linspace(0, 2 * math.pi, 4, endpoint=False):   # containment pylons
        M += [block((0.95 * math.cos(a + 0.4), 0.95 * math.sin(a + 0.4), 0.0), (0.06, 0.06, 0.08), CAGE, sq=4),
              rod((0.95 * math.cos(a + 0.4), 0.95 * math.sin(a + 0.4), 0.0), (0.82 * math.cos(a + 0.4), 0.82 * math.sin(a + 0.4), 0.0), 0.012, CAGE)]
    JET = mat((0.75, 0.6, 1.0), emissive=(0.7, 0.55, 1.0))
    G = [loft([(-0.22, 0, 0, 0.05, 0.05, 2), (-0.6, 0, 0, 0.08, 0.08, 2), (-1.1, 0, 0, 0.02, 0.02, 2)], JET, ring=12, layer=1),
         loft([(0.22, 0, 0, 0.03, 0.03, 2), (0.5, 0, 0, 0.05, 0.05, 2), (0.85, 0, 0, 0.01, 0.01, 2)], JET, ring=12, layer=1)]
    return M, G, [light(0.98, 0.0, 0.05, LGREEN, 0.03), light(-0.98, 0.0, 0.05, LRED, 0.03)], 260

V5 = dict(vashari_darter=vashari_darter, vashari_spinner=vashari_spinner, vashari_mantis=vashari_mantis, vashari_carapace=vashari_carapace, vashari_brood=vashari_brood,
          korrund_skiff=korrund_skiff, korrund_gunboat=korrund_gunboat, korrund_hauler=korrund_hauler, korrund_forge=korrund_forge, korrund_mountain=korrund_mountain,
          ylith_glint=ylith_glint, ylith_facet=ylith_facet, ylith_lattice=ylith_lattice, ylith_resonance=ylith_resonance, ylith_cathedral=ylith_cathedral,
          sarn_runner=sarn_runner, sarn_wheelhouse=sarn_wheelhouse, sarn_gyre=sarn_gyre, sarn_caravan=sarn_caravan, sarn_grand=sarn_grand,
          exotic_mobius=exotic_mobius, exotic_orrery=exotic_orrery, exotic_horizon=exotic_horizon)
DESIGNS.update(V5)
