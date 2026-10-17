"""EV Quantum 5.2 hulls: filling every race's ladder, the Thalassi (a new sea-creature race), and six one-of-a-kind wingmate ships."""
import math
import numpy as np
from render2 import mat, loft, torus, block, sphere, wing, fin, pair, Mesh
from hulls2 import DESIGNS, engine, light, greebles, fuse, LRED, LGREEN, LWHITE, GLASS, DARK, GUNM, GBLUE, GRED, GTEAL, GAMBER
from hulls5 import (rotm, xf, mv, hoop, rod, shard, glow_beam, segments, mandibles, bug_wing, CHITIN, CHITIN2, CARAPACE, MEMBRANE, BIOLUM, VGLOW,
                    BASALT, BASALT2, IRONK, MAGMA, KGLOW, slab, seam, vent, CRYS, CRYS2, CRYSW, YCORE, YGLOW, tether,
                    RUST, RUST2, BRASS, CANVAS, SGLOW, SLAMP, wheel)

def mirror_all(parts): return parts + [p.mirror() for p in parts]

# ================================================================== VASHARI additions
def vashari_vespid():   # frigate: a wasp, thin-waisted, with a glowing stinger
    M = [sphere((0, 0.78, 0.02), 0.11, CHITIN, squash=0.75)] + mandibles(0.86, 0.06, 0, 0.16, 0.025, CHITIN2, 0.5)
    M += segments(0.66, 0.3, 3, 0.18, 0.2, 0.12, 0.13, CARAPACE)
    M += [loft([(0.2, 0, 0.02, 0.04, 0.04, 2), (0.1, 0, 0.02, 0.03, 0.03, 2)], CHITIN2, ring=10)]   # the waist
    M += [loft([(0.05, 0, 0.02, 0.12, 0.1, 2), (-0.2, 0, 0.02, 0.26, 0.17, 2), (-0.6, 0, 0.0, 0.2, 0.13, 2), (-0.85, 0, -0.02, 0.04, 0.04, 2)], CHITIN, ring=22)]
    for k in range(4): M += [hoop(0.24 - abs(k - 1.2) * 0.05, 0.02, BIOLUM, c=(0, -0.12 - k * 0.17, 0.02), tilt_x=0, squash=0.68)]
    M += [loft([(-0.85, 0, -0.02, 0.03, 0.03, 2), (-1.0, 0, -0.03, 0.004, 0.004, 2)], BIOLUM, ring=8)]
    for s in (1, -1):
        for part in bug_wing(0.12, 0.55, 0.12, 0.7, 0.34, 0.14, 0.45, 0.12) + bug_wing(0.12, 0.35, 0.1, 0.55, 0.28, 0.12, 0.4, 0.05):
            M += [part if s > 0 else part.mirror()]
        for y in (0.6, 0.45, 0.32): M += [rod((s * 0.16, y, -0.06), (s * 0.34, y - 0.12, -0.14), 0.014, CHITIN2)]
        M += [sphere((s * 0.12, 0.5, 0.15), 0.035, CHITIN2, squash=0.6), rod((s * 0.12, 0.5, 0.16), (s * 0.12, 0.68, 0.16), 0.01, GUNM)]
    G = [sphere((0, -1.02, -0.03), 0.04, VGLOW, layer=1), sphere((0, 0.25, 0), 0.05, VGLOW, layer=1)]
    return M, G, [light(0.82, 0.3, 0.2, LGREEN, 0.03), light(-0.82, 0.3, 0.2, LRED, 0.03)], 128
def vashari_stagback():   # dreadnought: a stag beetle with branching antlers longer than a frigate
    M = [loft([(0.6, 0, 0, 0.1, 0.06, 2), (0.45, 0, 0, 0.3, 0.14, 2.2), (0.25, 0, 0, 0.38, 0.17, 2.2), (0.12, 0, 0, 0.3, 0.14, 2)], CARAPACE, ring=24)]   # head
    for s in (1, -1):   # antlers: main beam with three tines
        base, mid, tip = (s * 0.18, 0.55, 0.05), (s * 0.4, 0.82, 0.1), (s * 0.22, 1.05, 0.14)
        M += [rod(base, mid, 0.05, CHITIN2), rod(mid, tip, 0.035, CARAPACE), sphere(mid, 0.055, CHITIN2)]
        M += [rod((s * 0.3, 0.7, 0.07), (s * 0.48, 0.72, 0.18), 0.022, CARAPACE), rod(mid, (s * 0.52, 0.95, 0.14), 0.025, CARAPACE),
              rod((s * 0.3, 0.95, 0.12), (s * 0.12, 0.98, 0.2), 0.018, CARAPACE)]
    M += segments(0.05, -0.92, 5, 0.46, 0.22, 0.22, 0.12, CHITIN)
    for s in (1, -1):
        el = loft([(0.08, 0, 0, 0.03, 0.01, 2), (-0.05, 0, 0, 0.24, 0.07, 2.2), (-0.7, 0, 0, 0.24, 0.07, 2.2), (-0.95, 0, 0, 0.06, 0.02, 2)], CARAPACE, ring=18)
        M += [xf(el, rotm('y', 0.35 * s), t=(s * 0.22, 0, 0.16))]
    for k in range(5): M += [block((0, -0.1 - k * 0.18, 0.24), (0.04, 0.05, 0.01), BIOLUM)]
    for x, y in ((0.32, -0.1), (-0.32, -0.1), (0.34, -0.45), (-0.34, -0.45), (0.28, -0.75), (-0.28, -0.75), (0.2, 0.3), (-0.2, 0.3)):
        M += [sphere((x, y, 0.2), 0.045, CHITIN2, squash=0.6), rod((x, y, 0.21), (x, y + 0.2, 0.21), 0.012, GUNM)]
    for s in (1, -1):
        for y in (0.2, 0.0, -0.25):
            M += [rod((s * 0.3, y, -0.08), (s * 0.62, y - 0.1, -0.16), 0.024, CHITIN2), rod((s * 0.62, y - 0.1, -0.16), (s * 0.72, y - 0.35, -0.2), 0.018, CHITIN2)]
    G = [sphere((x, -0.97, 0), 0.07, VGLOW, layer=1) for x in (0.0, 0.16, -0.16)]
    return M + greebles(531, 14, ((-0.3, 0.3), (-0.8, 0.0)), CHITIN2, size=(0.025, 0.04, 0.012), zfn=lambda x, y: 0.22), G, \
        [light(0.6, 0.85, 0.12, LGREEN, 0.03), light(-0.6, 0.85, 0.12, LRED, 0.03)], 262

# ================================================================== KORRUND additions
def korrund_ember():   # fighter: a glowing shard of slag thrown from an Anvil
    M = [loft([(1.0, 0, 0, 0.02, 0.02, 6), (0.3, 0, 0, 0.22, 0.1, 7), (-0.6, 0, 0, 0.3, 0.12, 7), (-0.8, 0, 0, 0.24, 0.1, 6)], BASALT, ring=12)]
    M += [seam((0, 0.9, 0.04), (0, -0.7, 0.12), 0.02), seam((0.2, -0.6, 0.1), (0.05, 0.4, 0.08)), seam((-0.2, -0.6, 0.1), (-0.05, 0.4, 0.08))]
    eng, glo = vent(0, -0.86, 0, 0.14, 0.06)
    return M + eng, glo, [light(0.3, -0.5, 0.05, LGREEN, 0.03), light(-0.3, -0.5, 0.05, LRED, 0.03)], 40
def korrund_cinder():   # frigate: three stacked stone wedges, side cannon pods, a magma keel
    M = []
    for k, (y0, w, z) in enumerate(((1.0, 0.34, 0.0), (0.7, 0.26, 0.12), (0.35, 0.16, 0.22))):
        M += [loft([(y0, 0, z, 0.03, 0.03, 8), (y0 - 0.5, 0, z, w * 0.8, 0.08, 9), (-0.85, 0, z, w, 0.09, 9)], BASALT if k != 1 else BASALT2, ring=18)]
    M += [loft([(0.6, 0, -0.1, 0.02, 0.02, 3), (-0.85, 0, -0.1, 0.05, 0.04, 3)], MAGMA, ring=10)]
    for s in (1, -1):
        M += [slab((s * 0.44, -0.3, 0.02), (0.08, 0.3, 0.08), IRONK, sq=6), rod((s * 0.44, 0.0, 0.04), (s * 0.44, 0.45, 0.04), 0.03, IRONK),
              rod((s * 0.44, 0.45, 0.04), (s * 0.44, 0.5, 0.04), 0.04, MAGMA)]
        M += [seam((s * 0.06, 0.95, 0.04), (s * 0.32, -0.8, 0.08)), seam((s * 0.05, 0.6, 0.16), (s * 0.22, -0.8, 0.2))]
    M += [loft([(0.0, 0, 0.32, 0.05, 0.02, 3), (-0.1, 0, 0.32, 0.05, 0.02, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.0, 0.18, -0.18):
        e, g = vent(x, -0.9, 0.05, 0.07, 0.06); eng += e; glo += g
    return M + eng, glo, [light(0.52, -0.5, 0.05, LGREEN, 0.03), light(-0.52, -0.5, 0.05, LRED, 0.03)], 134
def korrund_anvil():   # carrier: a colossal anvil, horn forward, launch slots glowing along the face
    M = [slab((0, -0.15, 0.06), (0.42, 0.62, 0.1), BASALT2, sq=10)]                                   # the face
    M += [loft([(1.0, 0, 0.06, 0.01, 0.01, 3), (0.65, 0, 0.06, 0.12, 0.07, 4), (0.45, 0, 0.06, 0.28, 0.09, 6)], BASALT2, ring=18)]   # the horn
    M += [slab((0, -0.15, -0.1), (0.26, 0.5, 0.08), BASALT, sq=8), slab((0, -0.15, -0.24), (0.38, 0.55, 0.07), BASALT, sq=9)]   # waist and foot
    for y in (0.3, 0.05, -0.2, -0.45): M += [block((0, y, 0.165), (0.3, 0.025, 0.01), MAGMA, sq=5)]
    for s in (1, -1):
        M += [seam((s * 0.42, 0.45, 0.1), (s * 0.4, -0.75, 0.1), 0.012)]
        for y in (0.35, -0.15, -0.6):
            M += [slab((s * 0.47, y, 0.12), (0.05, 0.06, 0.08), IRONK, sq=6), rod((s * 0.47, y, 0.22), (s * 0.47, y + 0.17, 0.22), 0.016, IRONK)]
    eng = []; glo = []
    for x in (0.0, 0.2, -0.2, 0.36, -0.36):
        e, g = vent(x, -0.82, 0.02, 0.06, 0.07); eng += e; glo += g
    return M + eng + greebles(541, 20, ((-0.35, 0.35), (-0.7, 0.4)), IRONK, size=(0.025, 0.04, 0.012), zfn=lambda x, y: 0.17), glo, \
        [light(0.5, -0.3, 0.12, LGREEN, 0.03), light(-0.5, -0.3, 0.12, LRED, 0.03)], 214

# ================================================================== YLITH additions
def ylith_splinter():   # interceptor: three needle shards in a forward arrowhead
    M = [shard((0, 0.15, 0), 1.5, 0.08, 0.06, CRYSW)]
    M += [shard((s * 0.24, -0.15, 0), 1.1, 0.06, 0.05, CRYS, ang=-0.32 * s) for s in (1, -1)]
    M += [sphere((0, -0.3, 0), 0.05, YCORE)]
    G = [tether((0, -0.3, 0), (s * 0.2, -0.2, 0)) for s in (1, -1)] + [glow_beam((0, -0.6, 0), (0, -0.92, 0), 0.03, YGLOW)]
    return M, G, [light(0.45, -0.55, 0.0, LGREEN, 0.025), light(-0.45, -0.55, 0.0, LRED, 0.025)], 58
def ylith_geode():   # freighter: a rough dark geode, split open along the top to show its crystal heart (the hold)
    ROCK = mat((0.24, 0.2, 0.28), metal=0.1, rough=0.9, panel=1.2, grime=1.4)
    M = [loft([(0.85, 0, -0.02, 0.05, 0.04, 2), (0.5, 0, -0.04, 0.3, 0.14, 2.2), (-0.3, 0, -0.04, 0.38, 0.16, 2.2), (-0.8, 0, -0.02, 0.2, 0.1, 2)], ROCK, ring=24)]
    rng = np.random.default_rng(41)
    for k in range(22):
        y = rng.uniform(-0.6, 0.6); x = rng.uniform(-0.18, 0.18) * (1 - abs(y) * 0.6)
        M += [shard((x, y, 0.1 + rng.uniform(0, 0.05)), rng.uniform(0.2, 0.42), 0.05, 0.04, [CRYS, CRYS2, CRYSW][k % 3], ang=rng.uniform(-1, 1))]
    M += [sphere((0, 0.0, 0.06), 0.08, YCORE)]
    G = [glow_beam((x, -0.82, 0), (x, -1.0, 0), 0.035, YGLOW) for x in (0.1, -0.1)]
    return M, G, [light(0.38, -0.2, 0.0, LGREEN, 0.03), light(-0.38, -0.2, 0.0, LRED, 0.03)], 104
def ylith_spire():   # dreadnought: a crystal mountain, a great central spire and banks of shards radiating like frost
    M = [shard((0, 0.1, 0.02), 1.9, 0.24, 0.22, CRYSW)]
    for ring_, (r, n, ln, m) in enumerate(((0.32, 8, 0.7, CRYS), (0.56, 12, 0.5, CRYS2), (0.78, 14, 0.36, CRYS))):
        for k in range(n):
            a = 2 * math.pi * k / n + ring_ * 0.2
            x, y = r * math.sin(a) * 0.75, 0.0 + r * math.cos(a) * 1.05
            M += [shard((x, y, 0.0), ln, 0.06 + 0.02 * (2 - ring_), 0.05, m, ang=-a)]
    for y in (0.5, 0.15, -0.2, -0.55): M += [sphere((0, y, 0.05), 0.06, YCORE)]
    G = [glow_beam((0, 0.6, 0.05), (0, -0.7, 0.05), 0.025, YGLOW)]
    for k in range(8):
        a = 2 * math.pi * k / 8; G += [tether((0, -0.05, 0.03), (0.32 * math.sin(a) * 0.75, 0.32 * math.cos(a) * 1.05, 0))]
    G += [glow_beam((x, -0.88, 0), (x, -1.08, 0), 0.05, YGLOW) for x in (0.0, 0.3, -0.3)]
    return M, G, [light(0.62, 0.0, 0.02, LGREEN, 0.03), light(-0.62, 0.0, 0.02, LRED, 0.03)], 266

# ================================================================== SARN additions
def sarn_kite():   # raider: a little hull under a great diamond kite of patched canvas on a brass frame
    M = [loft([(0.8, 0, -0.04, 0.02, 0.02, 2), (0.5, 0, -0.04, 0.07, 0.05, 2.4), (-0.6, 0, -0.04, 0.08, 0.05, 2.4), (-0.8, 0, -0.04, 0.05, 0.04, 2)], RUST, ring=14)]
    kite = Mesh(np.array([(0, 0.95, 0.06), (0.62, 0.1, 0.06), (0, -0.55, 0.06), (-0.62, 0.1, 0.06), (0, 0.15, 0.1)]),
                np.array([(4, 0, 1), (4, 1, 2), (4, 2, 3), (4, 3, 0)]), CANVAS)
    M += [kite, Mesh(kite.V.copy(), kite.F[:, ::-1].copy(), CANVAS)]
    for a, b in (((0, 0.95), (0.62, 0.1)), ((0.62, 0.1), (0, -0.55)), ((0, -0.55), (-0.62, 0.1)), ((-0.62, 0.1), (0, 0.95)), ((0, 0.95), (0, -0.55)), ((0.62, 0.1), (-0.62, 0.1))):
        M += [rod((a[0], a[1], 0.065), (b[0], b[1], 0.065), 0.01, BRASS)]
    M += [rod((s * 0.3, 0.1, 0.06), (s * 0.06, 0.1, -0.03), 0.008, BRASS) for s in (1, -1)]
    M += [loft([(0.62, 0, 0.0, 0.035, 0.02, 2), (0.48, 0, 0.01, 0.045, 0.025, 2)], GLASS, ring=10)]
    eng, glo = engine(0, -0.84, -0.04, 0.05, SGLOW, DARK)
    return M + eng, glo, [light(0.62, 0.1, 0.07, LGREEN, 0.025), light(-0.62, 0.1, 0.07, LRED, 0.025)], 70
def sarn_ironwheel():   # destroyer: a great armored wheel standing on its keel, gun barrels round the rim
    M = [loft([(1.0, 0, -0.05, 0.03, 0.03, 2), (0.75, 0, -0.05, 0.14, 0.09, 3), (-0.7, 0, -0.05, 0.18, 0.1, 3.4), (-0.9, 0, -0.05, 0.13, 0.08, 3)], RUST, ring=18)]
    M += [hoop(0.42, 0.06, RUST2, c=(0, 0.05, 0.0), squash=1.0), hoop(0.42, 0.025, BRASS, c=(0, 0.05, 0.06))]
    for k in range(12):
        a = 2 * math.pi * k / 12; x, y = 0.42 * math.cos(a), 0.05 + 0.42 * math.sin(a)
        M += [block((x, y, 0.07), (0.04, 0.04, 0.03), IRONK, sq=4), rod((x, y, 0.09), (x * 1.32, 0.05 + (y - 0.05) * 1.32, 0.09), 0.012, GUNM)]
        if k % 2 == 0: M += [rod((0, 0.05, 0.02), (x, y, 0.02), 0.018, RUST2)]
    M += [sphere((0, 0.05, 0.05), 0.12, BRASS, squash=0.6)]
    M += [loft([(0.88, 0, 0.03, 0.04, 0.02, 2), (0.76, 0, 0.05, 0.06, 0.03, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.0, 0.11, -0.11):
        e, g = engine(x, -0.95, -0.05, 0.05, SGLOW, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.6, 0.05, 0.08, LGREEN, 0.03), light(-0.6, 0.05, 0.08, LRED, 0.03)], 168

# ================================================================== THALASSI: living ships from an ocean world (bells, fins, tentacles)
JELLY = mat((0.42, 0.82, 0.86), metal=0.05, rough=0.3, panel=0.1, grime=0.0, ambient=0.6, stripe=(0.5, 0.56, (0.9, 0.55, 0.85)))
SKIN = mat((0.1, 0.28, 0.38), metal=0.35, rough=0.3, panel=0.25, grime=0.15, stripe=(0.44, 0.5, (0.35, 0.9, 0.9)))
BELLY = mat((0.55, 0.72, 0.75), metal=0.2, rough=0.4, panel=0.2, grime=0.2)
SHELL = mat((0.85, 0.72, 0.58), metal=0.25, rough=0.35, panel=0.3, grime=0.3, stripe=(0.3, 0.42, (0.55, 0.25, 0.15)))
TSPOT = mat((1.0, 0.55, 0.85), emissive=(1.0, 0.5, 0.85))
TGLOW = mat((0.45, 1.0, 0.95), emissive=(0.4, 1.0, 0.95))
def tentacle(p0, length, n, r, m=JELLY, wave=0.08, phase=0.0, droop=0.0):
    x0, y0, z0 = p0; pts = []
    for i in range(n + 1):
        t = i / n
        pts.append((y0 - length * t, x0 + wave * math.sin(t * 5 + phase) * t, z0 - droop * t, r * (1 - 0.8 * t) + 0.003, r * (1 - 0.8 * t) + 0.003, 2))
    return loft(pts, m, ring=8)
def bell(c, r, h, m=JELLY, squash_y=1.0):
    x, y, z = c
    secs = [(y + r * squash_y * math.cos(t), x, z, r * math.sin(t) + 1e-3, h * math.sin(t) + 1e-3, 2) for t in np.linspace(0, math.pi * 0.62, 9)][::-1]
    return loft(secs, m, ring=20)
def thalassi_polyp():   # fighter: a little bell trailing four tentacles
    M = [sphere((0, 0.35, 0), 0.32, JELLY, squash=0.7), hoop(0.3, 0.025, SKIN, c=(0, 0.2, 0), tilt_x=0)]
    M += [tentacle((x, 0.05, 0), 0.9, 8, 0.04, wave=0.06, phase=k) for k, x in enumerate((0.15, 0.05, -0.05, -0.15))]
    M += [sphere((0, 0.42, 0.16), 0.06, TSPOT)]
    G = [sphere((0, 0.35, 0), 0.18, TGLOW, layer=1)]
    return M, G, [light(0.3, 0.3, 0.0, LGREEN, 0.03), light(-0.3, 0.3, 0.0, LRED, 0.03)], 40
def thalassi_nautilus():   # courier: a spiral shell with a tuft of tentacles at the mouth
    M = []
    for i in range(14):
        th = i * 0.55; r = 0.06 * math.exp(0.17 * i); x = 0.3 * math.exp(0.11 * i) * math.cos(th) * 0.5; y = -0.15 + 0.3 * math.exp(0.11 * i) * math.sin(th) * 0.5
        M += [sphere((x * 0.9, y * 0.9 - 0.1, 0), min(0.32, r), SHELL, squash=0.75)]
    M += [sphere((0, 0.25, 0.0), 0.3, SHELL, squash=0.8)]
    M += [tentacle((x, 0.45, -0.02), -0.45, 6, 0.03, m=BELLY, wave=0.04, phase=k) for k, x in enumerate((0.12, 0.04, -0.04, -0.12))]
    M += [sphere((s * 0.16, 0.4, 0.12), 0.04, TSPOT) for s in (1, -1)]
    G = [sphere((0, -0.62, 0), 0.07, TGLOW, layer=1)]
    return M, G, [light(0.36, 0.1, 0.05, LGREEN, 0.03), light(-0.36, 0.1, 0.05, LRED, 0.03)], 60
def thalassi_siphon():   # freighter: a long sea-cucumber body carrying translucent cargo bladders
    M = segments(0.85, -0.8, 7, 0.16, 0.12, 0.12, 0.09, SKIN)
    for k, y in enumerate((0.45, 0.1, -0.25, -0.55)):
        for s in (1, -1): M += [sphere((s * 0.24, y, 0.02), 0.13, JELLY, squash=0.8)]
    for k in range(8): M += [sphere((0.0, 0.7 - k * 0.2, 0.13), 0.025, TSPOT)]
    M += [tentacle((x, 0.95, 0), -0.2, 4, 0.02, m=BELLY, wave=0.03, phase=k) for k, x in enumerate((0.08, 0, -0.08))]
    G = [sphere((x, -0.88, 0), 0.06, TGLOW, layer=1) for x in (0.06, -0.06)]
    return M, G, [light(0.4, 0.1, 0.05, LGREEN, 0.03), light(-0.4, 0.1, 0.05, LRED, 0.03)], 96
def thalassi_manta():   # interceptor: a flat diamond ray with a whip tail
    M = [loft([(0.75, 0, 0, 0.06, 0.03, 2), (0.3, 0, 0, 0.16, 0.06, 2.2), (-0.3, 0, 0, 0.12, 0.05, 2.2), (-0.5, 0, 0, 0.05, 0.03, 2)], SKIN, ring=18)]
    M += pair(wing((0.1, 0.45), 0, 0.72, 0.85, 0.08, 0.55, 0.03, SKIN, dihedral=-0.04))
    M += [tentacle((0, -0.48, 0), 0.55, 8, 0.02, m=SKIN, wave=0.05)]
    M += [rod((s * 0.08, 0.72, 0), (s * 0.14, 0.92, -0.02), 0.025, SKIN) for s in (1, -1)]   # cephalic fins
    M += [sphere((x, y, 0.04), 0.022, TSPOT) for x, y in ((0.3, 0.2), (-0.3, 0.2), (0.5, 0.0), (-0.5, 0.0))]
    G = [sphere((0, -0.45, 0), 0.05, TGLOW, layer=1)]
    return M, G, [light(0.8, -0.15, 0.0, LGREEN, 0.03), light(-0.8, -0.15, 0.0, LRED, 0.03)], 70
def thalassi_ray():   # frigate: a great ray with a dorsal ridge of turret blisters
    M = [loft([(0.85, 0, 0, 0.06, 0.03, 2), (0.4, 0, 0, 0.24, 0.1, 2.2), (-0.35, 0, 0, 0.2, 0.08, 2.2), (-0.6, 0, 0, 0.07, 0.04, 2)], SKIN, ring=20)]
    M += pair(wing((0.15, 0.55), 0, 0.75, 0.95, 0.1, 0.6, 0.035, SKIN, dihedral=-0.05))
    M += [loft([(0.5, 0, 0.08, 0.02, 0.02, 2), (0.0, 0, 0.14, 0.05, 0.06, 2), (-0.5, 0, 0.06, 0.02, 0.02, 2)], BELLY, ring=12)]
    M += [tentacle((s * 0.05, -0.58, 0), 0.4, 7, 0.02, m=SKIN, wave=0.05, phase=s) for s in (1, -1)]
    M += [rod((s * 0.12, 0.82, 0), (s * 0.2, 1.02, -0.03), 0.03, SKIN) for s in (1, -1)]
    for x, y in ((0.3, 0.25), (-0.3, 0.25), (0.5, 0.0), (-0.5, 0.0), (0.0, 0.3)):
        M += [sphere((x, y, 0.05), 0.04, JELLY, squash=0.7), sphere((x, y, 0.08), 0.015, TSPOT)]
    G = [sphere((x, -0.6, 0), 0.06, TGLOW, layer=1) for x in (0.05, -0.05)]
    return M, G, [light(0.86, -0.2, 0.0, LGREEN, 0.03), light(-0.86, -0.2, 0.0, LRED, 0.03)], 132
def thalassi_medusa():   # cruiser: a vast glowing bell with a frilled rim and a curtain of trailing tentacles
    M = [bell((0, 0.35, 0.0), 0.55, 0.32)]
    M += [hoop(0.52, 0.04, SKIN, c=(0, 0.0, 0.0), tilt_x=0, squash=1.0)]
    for k in range(12):
        a = 2 * math.pi * k / 12; M += [sphere((0.5 * math.cos(a), 0.0, 0.5 * math.sin(a) * 0.6), 0.035, TSPOT)]
    rng = np.random.default_rng(13)
    for k in range(10):
        x = -0.4 + 0.8 * k / 9
        M += [tentacle((x, -0.05, -0.02), 0.85 + rng.uniform(-0.1, 0.1), 10, 0.035 if abs(x) < 0.25 else 0.025, wave=0.07, phase=k)]
    M += [loft([(0.15, 0, 0.0, 0.14, 0.12, 2), (-0.15, 0, 0.0, 0.1, 0.08, 2), (-0.45, 0, 0, 0.05, 0.05, 2)], SKIN, ring=14)]   # manubrium
    G = [sphere((0, 0.3, 0.0), 0.35, TGLOW, layer=1)]
    return M, G, [light(0.56, 0.0, 0.0, LGREEN, 0.03), light(-0.56, 0.0, 0.0, LRED, 0.03)], 182
def thalassi_abyssal():   # carrier: an anglerfish the size of a station, its lure lit far ahead, its gills glowing hangars
    M = [loft([(0.75, 0, 0, 0.1, 0.06, 2), (0.55, 0, 0, 0.42, 0.28, 2.1), (0.15, 0, 0, 0.5, 0.33, 2.1), (-0.35, 0, 0, 0.36, 0.24, 2), (-0.7, 0, 0, 0.12, 0.08, 2)], SKIN, ring=28)]
    M += [loft([(0.72, 0, -0.12, 0.08, 0.03, 2), (0.5, 0, -0.16, 0.38, 0.1, 2.1), (0.2, 0, -0.18, 0.4, 0.1, 2.1)], BELLY, ring=20)]   # jaw
    for k in range(10):   # teeth
        a = -0.9 + k * 0.2; M += [loft([(0.62 - 0.3 * abs(a) * 0.3, 0.36 * math.sin(a), -0.06, 0.012, 0.012, 2), (0.66 - 0.3 * abs(a) * 0.3, 0.36 * math.sin(a), -0.13, 0.002, 0.002, 2)], BELLY, ring=6)]
    M += [rod((0, 0.45, 0.28), (0, 0.8, 0.45), 0.02, SKIN), rod((0, 0.8, 0.45), (0, 1.05, 0.32), 0.015, SKIN), sphere((0, 1.08, 0.3), 0.06, TGLOW)]
    for s in (1, -1):
        for k in range(4): M += [block((s * 0.47, 0.05 - k * 0.1, 0.0), (0.02, 0.03, 0.12), TSPOT, sq=4)]   # gill hangars
        M += [xf(wing((0.3, -0.2), 0, 0.35, 0.3, 0.12, 0.25, 0.02, SKIN, dihedral=-0.05), np.eye(3)) if s > 0 else wing((0.3, -0.2), 0, 0.35, 0.3, 0.12, 0.25, 0.02, SKIN, dihedral=-0.05).mirror()]
    M += pair(wing((0.05, -0.62), 0, 0.3, 0.25, 0.12, 0.2, 0.02, SKIN, dihedral=0.05))
    M += [sphere((s * 0.3, 0.55, 0.18), 0.05, TSPOT) for s in (1, -1)]
    rng = np.random.default_rng(17)
    for _ in range(26):
        y = rng.uniform(-0.6, 0.6); x = rng.uniform(-0.3, 0.3) * (1 - abs(y)); M += [sphere((x, y, 0.3 * (1 - abs(y) * 0.6)), 0.018, TSPOT)]
    G = [sphere((0, 1.08, 0.3), 0.14, TGLOW, layer=1)] + [sphere((x, -0.74, 0), 0.06, TGLOW, layer=1) for x in (0.06, -0.06)]
    return M, G, [light(0.66, -0.3, 0.0, LGREEN, 0.03), light(-0.66, -0.3, 0.0, LRED, 0.03)], 232

# ================================================================== WINGMATES: one ship each, built to their pilot
def wm_nightjar():   # Sable Okoro: a forward-swept night scout with sensor vanes and a teal running stripe
    hull = mat((0.16, 0.18, 0.22), metal=0.8, rough=0.3, panel=1.0, grime=0.4, stripe=(0.47, 0.53, (0.2, 0.9, 0.85)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.6, 0.1, 0.07, 0, 2.6), (0.0, 0.16, 0.09, 0, 3), (-0.6, 0.15, 0.08, 0, 3), (-0.85, 0.1, 0.06, 0, 2.6)], hull)]
    M += pair(wing((0.12, -0.45), 0, 0.62, 0.32, 0.14, -0.3, 0.02, hull, dihedral=0.02))   # forward-swept
    M += pair(fin(0.62, 0.0, 0.16, 0.16, 0.06, -0.05, 0.01, hull, z0=0.03))
    M += [rod((s * 0.08, 0.5, 0.05), (s * 0.2, 0.95, 0.05), 0.008, GUNM) for s in (1, -1)]   # sensor vanes
    M += [loft([(0.62, 0, 0.06, 0.0, 0.0, 2), (0.45, 0, 0.09, 0.06, 0.04, 2), (0.2, 0, 0.09, 0.06, 0.04, 2)], GLASS, ring=10)]
    M += pair(loft([(-0.2, 0.36, 0.0, 0.02, 0.02, 2), (0.35, 0.36, 0.0, 0.015, 0.015, 2)], GUNM, ring=8))
    eng = []; glo = []
    for x in (0.07, -0.07):
        e, g = engine(x, -0.9, 0, 0.05, GTEAL, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.74, 0.2, 0.05, LGREEN, 0.025), light(-0.74, 0.2, 0.05, LRED, 0.025)], 84
def wm_hound():   # Brannock Teague: a blunt armored brawler with two heavy cannons and claw canards
    hull = mat((0.36, 0.36, 0.38), metal=0.85, rough=0.35, panel=1.4, grime=1.0, stripe=(0.15, 0.27, (0.75, 0.1, 0.08)))
    M = [loft([(0.85, 0, 0, 0.16, 0.1, 5), (0.5, 0, 0, 0.26, 0.14, 6), (-0.4, 0, 0, 0.3, 0.15, 6), (-0.8, 0, 0, 0.24, 0.12, 5)], hull, ring=20)]
    M += [slab((0, 0.1, 0.16), (0.16, 0.3, 0.05), DARK, sq=6), loft([(0.42, 0, 0.18, 0.08, 0.03, 3), (0.28, 0, 0.2, 0.08, 0.03, 3)], GLASS, ring=10)]
    for s in (1, -1):
        M += [rod((s * 0.32, -0.3, 0.0), (s * 0.32, 1.0, 0.0), 0.05, GUNM), rod((s * 0.32, 1.0, 0.0), (s * 0.32, 1.05, 0.0), 0.06, DARK)]
        M += [slab((s * 0.32, -0.3, 0.0), (0.07, 0.3, 0.08), hull, sq=6)]
        M += [xf(wing((0.2, 0.75), 0, 0.22, 0.2, 0.06, -0.12, 0.015, hull), np.eye(3)) if s > 0 else wing((0.2, 0.75), 0, 0.22, 0.2, 0.06, -0.12, 0.015, hull).mirror()]
    eng = []; glo = []
    for x in (0.12, -0.12, 0.32, -0.32):
        e, g = engine(x, -0.88, 0, 0.065 if abs(x) < 0.2 else 0.055, GRED, DARK); eng += e; glo += g
    return M + eng + greebles(551, 14, ((-0.22, 0.22), (-0.6, 0.4)), DARK, zfn=lambda x, y: 0.15), glo, \
        [light(0.42, -0.6, 0.05, LGREEN, 0.03), light(-0.42, -0.6, 0.05, LRED, 0.03)], 96
def wm_covenant():   # Ines Varro: a white-and-blue escort frigate with great shield emitter rings
    hull = mat((0.86, 0.88, 0.92), metal=0.4, rough=0.3, panel=0.9, grime=0.3, stripe=(0.46, 0.54, (0.2, 0.42, 0.85)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.75, 0.12, 0.08, 0, 2.8), (0.2, 0.22, 0.12, 0, 3.4), (-0.5, 0.24, 0.13, 0, 3.4), (-0.85, 0.18, 0.1, 0, 3)], hull)]
    M += pair(loft([(0.35, 0.4, 0, 0.06, 0.08, 3), (-0.6, 0.42, 0, 0.07, 0.09, 3), (-0.8, 0.4, 0, 0.05, 0.07, 3)], hull, ring=14))
    M += pair(rod((0.2, 0.0, 0), (0.38, 0.0, 0), 0.03, hull)) + pair(rod((0.2, -0.5, 0), (0.38, -0.5, 0), 0.03, hull))
    for y in (0.35, -0.2): M += [hoop(0.3, 0.018, mat((0.5, 0.75, 1.0), emissive=(0.45, 0.72, 1.0)), c=(0, y, 0.0), tilt_x=0, squash=0.9)]
    for x, y in ((0.0, 0.55), (0.0, 0.05), (0.0, -0.45), (0.4, 0.2), (-0.4, 0.2), (0.41, -0.35), (-0.41, -0.35)):
        M += [sphere((x, y, 0.13 if x == 0 else 0.08), 0.04, DARK, squash=0.6), rod((x, y, 0.15 if x == 0 else 0.1), (x, y + 0.15, 0.15 if x == 0 else 0.1), 0.01, GUNM)]
    M += [loft([(0.72, 0, 0.08, 0.0, 0.0, 2), (0.6, 0, 0.11, 0.06, 0.04, 2), (0.42, 0, 0.11, 0.06, 0.04, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.0, 0.12, -0.12, 0.4, -0.4):
        e, g = engine(x, -0.92 if abs(x) < 0.3 else -0.84, 0, 0.055, GBLUE, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.5, -0.6, 0.05, LGREEN, 0.03), light(-0.5, -0.6, 0.05, LRED, 0.03), light(0, 1.0, 0.0, LWHITE, 0.02)], 132
def wm_thornback():   # Old Mags Pell: a squat round gun-platform bristling with turrets, thirty years of patch plates
    hull = mat((0.4, 0.42, 0.3), metal=0.6, rough=0.5, panel=1.6, grime=1.8, stripe=(0.3, 0.36, (0.75, 0.55, 0.15)))
    patch = mat((0.5, 0.33, 0.22), metal=0.6, rough=0.5, panel=1.2, grime=1.6)
    M = [sphere((0, 0, 0), 0.62, hull, squash=0.35)]
    M = [xf(M[0], np.diag([1.0, 1.25, 1.0]))]
    rng = np.random.default_rng(61)
    for _ in range(12):
        a = rng.uniform(0, 2 * math.pi); r = rng.uniform(0.15, 0.5)
        M += [block((r * math.cos(a), r * math.sin(a) * 1.25, 0.16 * (1 - (r / 0.62) ** 2) ** 0.5 + 0.02), (0.06, 0.06, 0.012), patch, sq=4)]
    for k in range(10):
        a = 2 * math.pi * k / 10; r = 0.45 if k % 2 else 0.25; x, y = r * math.cos(a), r * math.sin(a) * 1.25; z = 0.2 * (1 - (r / 0.62) ** 2) ** 0.5
        M += [sphere((x, y, z), 0.05, DARK, squash=0.6)] + [rod((x + d, y, z + 0.02), (x + d, y + 0.16, z + 0.02), 0.009, GUNM) for d in (-0.015, 0.015)]
    M += [loft([(0.62, 0, 0.12, 0.08, 0.03, 3), (0.5, 0, 0.14, 0.08, 0.03, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.18, 0.0, -0.18):
        e, g = engine(x, -0.8, 0, 0.06, GAMBER, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.64, 0.0, 0.03, LGREEN, 0.03), light(-0.64, 0.0, 0.03, LRED, 0.03)], 112
def wm_swiftsure():   # Juniper Hale: a twin-boom racer, all engine, in race-orange and white
    hull = mat((0.95, 0.5, 0.12), metal=0.5, rough=0.2, panel=0.4, grime=0.15, stripe=(0.45, 0.55, (0.95, 0.95, 0.95)))
    white = mat((0.92, 0.92, 0.94), metal=0.4, rough=0.25, panel=0.4, grime=0.15)
    M = [fuse([(1.0, 0, 0, 0, 2), (0.6, 0.07, 0.05, 0, 2.4), (-0.2, 0.09, 0.06, 0, 2.6), (-0.5, 0.06, 0.04, 0, 2.2)], white)]
    for s in (1, -1):
        M += [loft([(0.55, s * 0.3, 0, 0.02, 0.02, 2), (0.3, s * 0.3, 0, 0.08, 0.07, 2.4), (-0.7, s * 0.3, 0, 0.11, 0.09, 2.6), (-0.85, s * 0.3, 0, 0.1, 0.08, 2.4)], hull, ring=16)]
    M += pair(wing((0.06, 0.05), 0, 0.26, 0.3, 0.26, 0.05, 0.015, white)) + pair(wing((0.38, -0.6), 0, 0.2, 0.2, 0.08, 0.12, 0.01, hull, dihedral=0.04))
    M += [loft([(0.62, 0, 0.04, 0.0, 0.0, 2), (0.45, 0, 0.07, 0.05, 0.035, 2), (0.15, 0, 0.07, 0.05, 0.035, 2)], GLASS, ring=10)]
    M += pair(rod((0.3, 0.2, 0.06), (0.3, 0.6, 0.06), 0.012, GUNM))
    eng = []; glo = []
    for x in (0.3, -0.3):
        e, g = engine(x, -0.9, 0, 0.09, GAMBER, DARK); eng += e; glo += g
    e, g = engine(0, -0.55, 0, 0.05, GAMBER, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.44, -0.6, 0.05, LGREEN, 0.025), light(-0.44, -0.6, 0.05, LRED, 0.025)], 86
def wm_lifeline():   # Tomas Eriksen-Kai: a long-range rescue ship, a hab ring of drone cradles and two tractor arms
    hull = mat((0.9, 0.9, 0.88), metal=0.35, rough=0.35, panel=1.0, grime=0.4, stripe=(0.46, 0.54, (0.2, 0.75, 0.35)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.75, 0.1, 0.08, 0, 2.6), (0.2, 0.13, 0.1, 0, 3), (-0.6, 0.15, 0.11, 0, 3), (-0.88, 0.12, 0.09, 0, 2.6)], hull)]
    M += [hoop(0.38, 0.05, hull, c=(0, -0.15, 0.0)), hoop(0.38, 0.02, mat((0.3, 0.9, 0.45), emissive=(0.3, 0.9, 0.45)), c=(0, -0.15, 0.05))]
    for k in range(6):
        a = 2 * math.pi * k / 6 + 0.5; M += [block((0.38 * math.cos(a), -0.15 + 0.38 * math.sin(a), 0.04), (0.05, 0.05, 0.035), DARK, sq=4)]
        M += [rod((0, -0.15, 0.03), (0.36 * math.cos(a), -0.15 + 0.36 * math.sin(a), 0.03), 0.012, hull)]
    for s in (1, -1):   # tractor arms
        M += [rod((s * 0.1, 0.55, 0), (s * 0.28, 0.8, 0), 0.02, GUNM), rod((s * 0.28, 0.8, 0), (s * 0.18, 1.0, 0), 0.016, GUNM), sphere((s * 0.18, 1.0, 0), 0.03, GTEAL)]
    M += [loft([(0.75, 0, 0.07, 0.0, 0.0, 2), (0.6, 0, 0.1, 0.06, 0.04, 2), (0.42, 0, 0.1, 0.06, 0.04, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.08, -0.08):
        e, g = engine(x, -0.94, 0, 0.055, GTEAL, DARK); eng += e; glo += g
    return M + eng, glo, [light(0.44, -0.15, 0.06, LGREEN, 0.03), light(-0.44, -0.15, 0.06, LRED, 0.03), light(0, 1.0, 0.0, LWHITE, 0.02)], 116

V52 = dict(vashari_vespid=vashari_vespid, vashari_stagback=vashari_stagback, korrund_ember=korrund_ember, korrund_cinder=korrund_cinder, korrund_anvil=korrund_anvil,
           ylith_splinter=ylith_splinter, ylith_geode=ylith_geode, ylith_spire=ylith_spire, sarn_kite=sarn_kite, sarn_ironwheel=sarn_ironwheel,
           thalassi_polyp=thalassi_polyp, thalassi_nautilus=thalassi_nautilus, thalassi_siphon=thalassi_siphon, thalassi_manta=thalassi_manta,
           thalassi_ray=thalassi_ray, thalassi_medusa=thalassi_medusa, thalassi_abyssal=thalassi_abyssal,
           wm_nightjar=wm_nightjar, wm_hound=wm_hound, wm_covenant=wm_covenant, wm_thornback=wm_thornback, wm_swiftsure=wm_swiftsure, wm_lifeline=wm_lifeline)
DESIGNS.update(V52)
