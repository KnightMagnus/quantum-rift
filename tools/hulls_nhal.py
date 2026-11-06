"""Concept hulls: the Nhal, a cosmic-horror species from the Deep. Living ships of wet flesh, bone and too many eyes.
Built on the repo's ship generator (tools/ships26): same primitives, materials and renderer as every in-game hull."""
import sys, os, math
REPO = sys.argv[1] if len(sys.argv) > 1 and os.path.isdir(sys.argv[1]) else os.environ['RIFT_SHIPS26']
sys.path.insert(0, REPO)
import numpy as np
from render2 import mat, loft, sphere, wing, pair, Mesh
from hulls5 import rod, xf, mv, rotm, hoop
from hulls2 import light

# ------------------------------------------------------------------ materials: wet black flesh, old bone, crimson eyes, ichor
FLESH = mat((0.17, 0.09, 0.11), metal=0.5, rough=0.12, panel=0.2, grime=0.7, ambient=0.24, stripe=(0.42, 0.47, (0.28, 0.06, 0.08)))
FLESH2 = mat((0.3, 0.17, 0.2), metal=0.4, rough=0.18, panel=0.25, grime=0.8, ambient=0.2)
MEMB = mat((0.32, 0.12, 0.14), metal=0.1, rough=0.6, panel=0.05, grime=0.4, ambient=0.45)
BONE = mat((0.74, 0.68, 0.56), metal=0.15, rough=0.45, panel=0.35, grime=1.0, ambient=0.25)
TOOTH = mat((0.86, 0.82, 0.7), metal=0.25, rough=0.3, panel=0.05, grime=0.5, ambient=0.3)
SAC = mat((0.42, 0.36, 0.22), metal=0.1, rough=0.25, panel=0.1, grime=0.9, ambient=0.45, stripe=(0.45, 0.5, (0.5, 0.12, 0.1)))
SCLERA = mat((0.05, 0.02, 0.02), metal=0.7, rough=0.05, panel=0.0, grime=0.0)
EYE = mat((1.0, 0.12, 0.06), emissive=(1.0, 0.1, 0.05))
ICHOR = mat((0.7, 1.0, 0.25), emissive=(0.65, 1.0, 0.2))
LRED = mat((1, 0.15, 0.1), emissive=(1, 0.12, 0.08))

# ------------------------------------------------------------------ organic helpers
def eye(c, r, look=(0, 1, 0.3)):
    """A wet black eyeball with a glowing crimson slit pupil turned toward `look`."""
    lv = np.array(look, float); lv /= np.linalg.norm(lv)
    p = np.array(c, float) + lv * r * 0.78
    return [sphere(c, r, SCLERA), sphere(tuple(p), r * 0.42, EYE, squash=0.45), sphere(tuple(p), r * 0.5, EYE, layer=1)]

def curve(pts_fn, n, r0, r1, m, ring=8, wob=0.0, seed=0):
    """A tapering tube along a parametric 3D curve: pts_fn(t) -> (x, y, z). Built from short rods-like lofts."""
    rng = np.random.default_rng(seed)
    P = [np.array(pts_fn(i / n), float) for i in range(n + 1)]
    out = []
    for i in range(n):
        a, b = P[i], P[i + 1]
        r = r0 + (r1 - r0) * (i / n)
        if wob: r *= 1 + wob * rng.uniform(-1, 1)
        out.append(rod(a, b, max(r, 0.003), m, ring=ring))
        out.append(sphere(tuple(b), max(r * 0.98, 0.003), m))
    return out

def tentacle(base, length, direction, r=0.04, *, _k=1.5, curl=1.2, phase=0.0, droop=0.0, m=FLESH, n=12, suckers=False):
    """A writhing tentacle from `base` heading along `direction` (angle in the x-y plane), curling as it goes."""
    bx, by, bz = base
    def f(t):
        a = direction + curl * t * t * math.sin(phase + t * 3) + 0.35 * math.sin(phase * 1.7 + t * 6) * t
        s = length * t
        return (bx + s * math.sin(a), by + s * math.cos(a), bz - droop * t * t + 0.05 * math.sin(phase + t * 9) * t)
    r = r * _k
    M = curve(f, n, r, r * 0.12, m, ring=8)
    if suckers:
        for i in range(2, n, 2):
            x, y, z = f(i / n); M.append(sphere((x, y, z + r * (1 - i / n) * 0.8), r * 0.35 * (1 - i / n) + 0.006, MEMB))
    return M

def spike(base, tip, r, m=BONE):
    b, t = np.array(base, float), np.array(tip, float)
    return [rod(b, b + (t - b) * 0.5, r, m, ring=6), rod(b + (t - b) * 0.5, b + (t - b) * 0.85, r * 0.55, m, ring=6), rod(b + (t - b) * 0.85, t, r * 0.2, m, ring=6)]

def teeth_ring(c, R, n, length, r, m=TOOTH, inward=0.6, axis='y'):
    """A circular maw: n fangs on a ring, pointing forward and inward."""
    x, y, z = c; out = []
    for k in range(n):
        a = 2 * math.pi * k / n
        px, pz = x + R * math.cos(a), z + R * math.sin(a)
        tx, tz = x + R * (1 - inward) * math.cos(a), z + R * (1 - inward) * math.sin(a)
        out += spike((px, y, pz), (tx, y + length, tz), r, m)
    return out

def ribs(y0, y1, n, w, h, r, m=BONE, z=0.0, arc=0.85):
    """Exposed ribs arching over a body (paired, along y)."""
    out = []
    for k in range(n):
        y = y0 + (y1 - y0) * k / max(n - 1, 1); s = 1 - 0.35 * abs(2 * k / max(n - 1, 1) - 1)
        def f(t, s=s, y=y):
            a = math.pi * arc * (t - 0.5)
            return (w * s * math.sin(a), y - 0.04 * t, z + h * s * math.cos(a))
        out += curve(f, 10, r, r, m, ring=6)
    return out

def body(sections, m=FLESH, ring=24):
    return loft(sections, m, ring=ring)

def ichor_glow(c, r): return sphere(c, r, ICHOR, layer=1)

# ------------------------------------------------------------------ the nine concepts
def nhal_lamprey():   # FIGHTER: an eel all mouth. A ring of hooked fangs, an eye cluster, a lashing tail.
    M = [body([(0.62, 0, 0, 0.13, 0.13, 2), (0.45, 0, 0, 0.16, 0.15, 2), (0.0, 0, 0, 0.11, 0.1, 2), (-0.5, 0, 0, 0.06, 0.05, 2), (-0.62, 0, 0, 0.02, 0.02, 2)])]
    M += [loft([(0.66, 0, 0, 0.11, 0.11, 2), (0.6, 0, 0, 0.07, 0.07, 2)], SCLERA, ring=16)]   # the open throat
    M += teeth_ring((0, 0.6, 0), 0.12, 10, 0.13, 0.018)
    M += tentacle((0, -0.6, 0), 0.5, math.pi, r=0.035, curl=1.6, phase=0.4)
    for s in (1, -1):
        M += eye((s * 0.1, 0.32, 0.1), 0.045) + eye((s * 0.06, 0.2, 0.13), 0.03)
    M += pair(wing((0.06, -0.05), 0, 0.22, 0.28, 0.06, 0.2, 0.012, MEMB, dihedral=-0.03))
    for y in (0.3, 0.12, -0.06, -0.24): M += spike((0, y, 0.09), (0, y - 0.07, 0.2), 0.014)
    G = [ichor_glow((0, 0.58, 0), 0.06), ichor_glow((0, -0.55, 0), 0.04)]
    return M, G, [light(0.13, 0.4, 0.0, LRED, 0.02)], 40

def nhal_watcher():   # SCOUT & COURIER: a single huge bloodshot eye in a cage of bone lids, trailing a beard of nerves.
    PALE = mat((0.78, 0.72, 0.64), metal=0.3, rough=0.1, panel=0.05, grime=0.6, ambient=0.35)
    VEIN = mat((0.75, 0.05, 0.04), metal=0.2, rough=0.3, panel=0.0, grime=0.0, emissive=(0.55, 0.03, 0.02))
    M = [sphere((0, 0.05, 0), 0.34, PALE)]
    M += [loft([(0.4, 0, 0.0, 0.09, 0.09, 2), (0.375, 0, 0.0, 0.16, 0.16, 2), (0.33, 0, 0.0, 0.2, 0.2, 2)], EYE, ring=24)]                       # burning iris, facing forward
    M += [loft([(0.405, 0, 0.0, 0.08, 0.08, 2), (0.38, 0, 0.0, 0.14, 0.14, 2)], EYE, ring=20, layer=1)]
    M += [loft([(0.42, 0, 0.0, 0.025, 0.12, 2), (0.37, 0, 0.0, 0.035, 0.15, 2)], SCLERA, ring=12)]                # vertical slit pupil
    rng = np.random.default_rng(9)
    for k in range(16):                                                         # bloodshot veins crawling to the iris
        a = 2 * math.pi * k / 16 + rng.uniform(-0.15, 0.15)
        def f(t, a=a):
            th = 1.35 - 1.0 * t; ph = a + 0.25 * math.sin(t * 7 + a * 3)
            return (0.345 * math.sin(th) * math.cos(ph), 0.05 + 0.345 * math.cos(th), 0.345 * math.sin(th) * math.sin(ph))
        M += curve(f, 8, 0.008, 0.004, VEIN, ring=5)
    for k in range(7):                                                          # bone lids
        a = -1.2 + k * 0.4
        def f(t, a=a): return (0.4 * math.sin(a) * math.sin(math.pi * t), 0.2 - 0.6 * t, 0.37 * math.cos(a) * math.sin(math.pi * t) * 0.9)
        M += curve(f, 10, 0.03, 0.03, BONE, ring=6)
    for k in range(9):
        a = math.pi + (k - 4) * 0.22
        M += tentacle((0.06 * (k - 4) / 4, -0.25, -0.02), 0.65, a, r=0.022, curl=1.3, phase=k * 0.9, m=FLESH2, n=10)
    for s in (1, -1): M += eye((s * 0.27, -0.12, 0.16), 0.05, look=(s, 0.5, 0.4))
    G = [ichor_glow((0, -0.3, 0), 0.08)]
    return M, G, [light(0.32, 0.0, 0.0, LRED, 0.02)], 60

def nhal_bloat():   # FREIGHTER: a swollen brood-sac on spider legs; dim shapes curl inside the translucent hold.
    M = [body([(0.7, 0, 0.02, 0.08, 0.07, 2), (0.55, 0, 0.03, 0.12, 0.1, 2), (0.42, 0, 0.03, 0.09, 0.08, 2)], FLESH)]   # head
    M += [sphere((0, -0.05, 0.05), 0.42, SAC, squash=0.75)]
    rng = np.random.default_rng(5)
    for _ in range(9):                                                          # things inside
        x, y = rng.uniform(-0.22, 0.22), rng.uniform(-0.3, 0.2)
        M += [sphere((x, y, 0.08), rng.uniform(0.05, 0.09), FLESH2, squash=0.6)]
    M += ribs(0.25, -0.35, 6, 0.4, 0.34, 0.016, BONE, z=0.03)
    for s in (1, -1):
        for k, y in enumerate((0.25, 0.05, -0.15, -0.32)):                     # spider legs
            kx, ky = s * (0.55 + 0.05 * k), y + 0.12 - 0.06 * k
            M += [rod((s * 0.3, y, 0.0), (kx, ky, 0.12), 0.022, FLESH), rod((kx, ky, 0.12), (s * (0.7 + 0.05 * k), y - 0.1, -0.18), 0.016, BONE)]
        M += eye((s * 0.06, 0.66, 0.08), 0.035)
    M += [body([(-0.42, 0, 0.0, 0.08, 0.07, 2), (-0.7, 0, -0.02, 0.03, 0.03, 2)], FLESH)]
    G = [ichor_glow((0, -0.7, -0.02), 0.06)] + [ichor_glow((x, y, 0.1), 0.04) for x, y in ((0.12, 0.0), (-0.1, -0.18), (0.0, 0.15))]
    return M, G, [light(0.7, 0.0, 0.0, LRED, 0.02)], 96

def nhal_ossuary():   # LINER & YACHT: a pilgrim-hulk of bone: a ribcage nave, a skull prow, sleepers in amber pods.
    M = [body([(0.85, 0, 0, 0.05, 0.05, 2), (0.6, 0, 0, 0.14, 0.12, 2), (0.0, 0, 0, 0.12, 0.1, 2), (-0.75, 0, 0, 0.08, 0.06, 2), (-0.9, 0, 0, 0.03, 0.03, 2)], FLESH)]
    M += [sphere((0, 0.72, 0.06), 0.17, BONE, squash=0.85)]                     # skull prow
    for s in (1, -1):
        M += [sphere((s * 0.075, 0.82, 0.12), 0.05, SCLERA), sphere((s * 0.075, 0.86, 0.13), 0.025, EYE)]
    M += teeth_ring((0, 0.86, -0.02), 0.07, 8, 0.06, 0.01)
    M += ribs(0.5, -0.6, 9, 0.34, 0.3, 0.02, BONE, z=0.0, arc=0.95)
    for k, y in enumerate(np.linspace(0.4, -0.5, 6)):                            # sleeper pods inside the cage
        for s in (1, -1): M += [sphere((s * 0.16, y, 0.06), 0.06, SAC, squash=0.8), sphere((s * 0.16, y, 0.07), 0.025, FLESH2)]
    for s in (1, -1):                                                           # long pipe-organ spines singing behind
        for k in range(4): M += spike((s * (0.05 + 0.04 * k), -0.6, 0.06), (s * (0.12 + 0.08 * k), -1.0 - 0.04 * k, 0.12 + 0.05 * k), 0.016)
    G = [ichor_glow((0, -0.88, 0), 0.07)] + [ichor_glow((s * 0.16, y, 0.07), 0.035) for y in np.linspace(0.4, -0.5, 6) for s in (1, -1)]
    return M, G, [light(0.36, 0.0, 0.0, LRED, 0.02)], 116

def nhal_flayer():   # INTERCEPTOR: a hooked bat-ray, wing-claws raked forward, a barbed whip tail.
    M = [body([(0.7, 0, 0, 0.04, 0.03, 2), (0.4, 0, 0, 0.11, 0.06, 2.2), (-0.2, 0, 0, 0.09, 0.05, 2.2), (-0.45, 0, 0, 0.03, 0.03, 2)], FLESH, ring=18)]
    for s in (1, -1):
        wg = wing((0.06, 0.32), 0, 0.62, 0.62, 0.12, -0.08, 0.02, MEMB, dihedral=0.05)
        M += [wg if s > 0 else wg.mirror()]
        M += [rod((s * 0.06, 0.3, 0.02), (s * 0.66, 0.4, 0.07), 0.022, BONE)]          # wing finger bones
        M += [rod((s * 0.06, 0.15, 0.02), (s * 0.5, 0.08, 0.05), 0.016, BONE), rod((s * 0.06, 0.05, 0.02), (s * 0.32, -0.12, 0.04), 0.014, BONE)]
        M += spike((s * 0.68, 0.42, 0.06), (s * 0.6, 0.66, 0.0), 0.02)                               # hooked claw
        M += eye((s * 0.05, 0.5, 0.05), 0.03) + eye((s * 0.085, 0.4, 0.05), 0.024)
    M += tentacle((0, -0.45, 0), 0.6, math.pi, r=0.022, curl=0.8, phase=2.0, m=FLESH)
    for i in range(5): M += spike((0, -0.55 - i * 0.09, 0.0), (0.04 * (-1) ** i, -0.6 - i * 0.09, 0.05), 0.01)
    G = [ichor_glow((0, -0.4, 0), 0.05)]
    return M, G, [light(0.68, 0.42, 0.06, LRED, 0.02), light(-0.68, 0.42, 0.06, LRED, 0.02)], 70

def nhal_spitter():   # GUNBOAT & FRIGATE: a squid with a crown of bone spine-guns that spit ichor; arms tucked like a fist.
    M = [body([(0.15, 0, 0, 0.18, 0.15, 2), (-0.3, 0, 0, 0.22, 0.18, 2), (-0.75, 0, 0, 0.08, 0.06, 2), (-0.9, 0, 0, 0.02, 0.02, 2)], FLESH)]   # mantle
    M += pair(wing((0.1, -0.55), 0, 0.22, 0.32, 0.1, 0.18, 0.014, MEMB, dihedral=0.02))          # fins
    M += [sphere((0, 0.25, 0), 0.17, FLESH2)]                                    # head
    for s in (1, -1): M += eye((s * 0.14, 0.3, 0.06), 0.06, look=(s, 0.6, 0.3))
    for k in range(8):
        a = -0.55 + k * (1.1 / 7)
        M += tentacle((0.04 * (k - 3.5) / 3.5, 0.38, -0.02), 0.62, a * 0.6, r=0.035, curl=0.5, phase=k, n=12, suckers=True)
    for k in range(6):                                                           # spine-guns along the mantle crest
        y = 0.05 - k * 0.14
        M += spike((0, y, 0.15), (0.0, y + 0.18, 0.32), 0.03)
        M += [sphere((0, y + 0.18, 0.32), 0.022, ICHOR)]
    for s in (1, -1):
        for k in range(3): M += spike((s * 0.18, -0.15 - k * 0.18, 0.08), (s * 0.3, -0.02 - k * 0.18, 0.2), 0.022)
    G = [ichor_glow((0, 0.05 - k * 0.14 + 0.18, 0.32), 0.05) for k in range(6)] + [ichor_glow((0, -0.88, 0), 0.06)]
    return M, G, [light(0.24, -0.3, 0.0, LRED, 0.025), light(-0.24, -0.3, 0.0, LRED, 0.025)], 132

def nhal_kraken():   # DESTROYER & CRUISER: a colossal cephalopod; eight arms reach forward into a cage, a beak at the heart.
    M = [body([(0.2, 0, 0, 0.26, 0.22, 2), (-0.25, 0, 0.02, 0.3, 0.26, 2), (-0.7, 0, 0.0, 0.16, 0.12, 2), (-0.95, 0, 0, 0.03, 0.03, 2)], FLESH, ring=28)]
    M += ribs(0.0, -0.75, 7, 0.3, 0.28, 0.018, BONE, z=0.02)
    M += [sphere((0, 0.3, 0), 0.2, FLESH2)]
    M += teeth_ring((0, 0.46, 0), 0.08, 6, 0.1, 0.02, m=BONE, inward=0.9)        # beak
    for k in range(8):
        a = 2 * math.pi * k / 8
        bx, bz = 0.16 * math.cos(a), 0.14 * math.sin(a)
        M += tentacle((bx, 0.42, bz), 0.95, 0.42 * math.cos(a), r=0.05, curl=-0.9 * math.cos(a) * 0.8, phase=k * 0.7, n=14, droop=-0.25 * math.sin(a), suckers=True)
    rng = np.random.default_rng(11)
    for _ in range(14):                                                          # eyes scattered over the mantle
        y = rng.uniform(-0.6, 0.15); x = rng.uniform(-0.22, 0.22) * (1 - abs(y + 0.25))
        M += eye((x, y, 0.24 * (1 - abs(y + 0.25) * 0.8)), rng.uniform(0.025, 0.05), look=(x * 2, 0.4, 1))
    G = [ichor_glow((0, 0.5, 0), 0.07), ichor_glow((0, -0.93, 0), 0.07)]
    return M, G, [light(0.3, -0.2, 0.0, LRED, 0.03), light(-0.3, -0.2, 0.0, LRED, 0.03)], 182

def nhal_broodmother():   # CARRIER: a vast swollen mother; spawning pores along her flanks birth Lampreys in a glowing stream.
    M = [body([(0.85, 0, 0, 0.08, 0.06, 2), (0.6, 0, 0, 0.22, 0.18, 2), (0.15, 0, 0.02, 0.48, 0.36, 2), (-0.4, 0, 0.02, 0.5, 0.38, 2), (-0.8, 0, 0, 0.22, 0.16, 2), (-0.98, 0, 0, 0.05, 0.05, 2)], FLESH, ring=32)]
    M += ribs(0.35, -0.7, 8, 0.5, 0.4, 0.022, BONE, z=0.02)
    for s in (1, -1):
        for k, y in enumerate(np.linspace(0.3, -0.6, 6)):                        # spawning pores
            r = 0.5 * (1 - (abs(y + 0.15) / 0.9) ** 2) ** 0.5
            M += [hoop(0.05, 0.016, MEMB, c=(s * r * 0.96, y, 0.05), tilt_x=0, tilt_y=math.pi / 2), sphere((s * r * 0.95, y, 0.05), 0.035, ICHOR)]
        M += eye((s * 0.1, 0.72, 0.08), 0.04) + eye((s * 0.16, 0.62, 0.12), 0.035)
    M += teeth_ring((0, 0.84, 0), 0.07, 8, 0.08, 0.012)
    for k in range(6):                                                           # trailing birth-cords
        M += tentacle((0.1 * (k - 2.5) / 2.5, -0.95, -0.05), 0.55, math.pi + 0.12 * (k - 2.5), r=0.03, curl=1.0, phase=k * 1.3, m=FLESH2, n=10)
    rng = np.random.default_rng(3)
    for _ in range(18): M += [sphere((rng.uniform(-0.25, 0.25), rng.uniform(-0.55, 0.35), 0.36), rng.uniform(0.03, 0.06), SAC, squash=0.6)]   # egg blisters
    G = [ichor_glow((s * 0.47 * (1 - (abs(y + 0.15) / 0.9) ** 2) ** 0.5, y, 0.05), 0.05) for s in (1, -1) for y in np.linspace(0.3, -0.6, 6)]
    return M, G, [light(0.5, -0.1, 0.0, LRED, 0.03), light(-0.5, -0.1, 0.0, LRED, 0.03)], 232

def nhal_dreamer():   # DREADNOUGHT & FLAGSHIP: the Dreamer. A titanic head veiled in face-tentacles, a crown of horns, vast ragged wings.
    M = [body([(0.35, 0, 0.04, 0.3, 0.28, 2), (-0.1, 0, 0.06, 0.34, 0.3, 2), (-0.6, 0, 0.02, 0.24, 0.2, 2), (-0.95, 0, 0, 0.06, 0.05, 2)], FLESH, ring=32)]   # torso
    M += [sphere((0, 0.42, 0.1), 0.3, FLESH2, squash=0.9)]                      # the great head
    for s in (1, -1):
        M += eye((s * 0.14, 0.62, 0.24), 0.07, look=(s * 0.3, 1, 0.3)) + eye((s * 0.24, 0.5, 0.26), 0.05, look=(s, 0.8, 0.4)) + eye((s * 0.07, 0.52, 0.36), 0.04, look=(0, 0.6, 1))
        for k in range(3):                                                       # crown of horns
            M += spike((s * (0.12 + 0.07 * k), 0.4 - 0.08 * k, 0.32), (s * (0.3 + 0.14 * k), 0.2 - 0.14 * k, 0.62 - 0.08 * k), 0.035 - 0.006 * k)
        wg = wing((0.2, 0.05), 0, 0.95, 0.8, 0.12, 0.55, 0.018, MEMB, dihedral=0.12)
        M += [wg if s > 0 else wg.mirror()]
        for k in range(4):                                                       # wing bones and ragged claws
            tip = (s * (0.3 + 0.22 * k), -0.05 - 0.15 * k - 0.1 * (k == 3), 0.06 + 0.03 * k)
            M += [rod((s * 0.22, 0.05, 0.04), tip, 0.02, BONE)] + spike(tip, (tip[0] + s * 0.05, tip[1] - 0.16, tip[2] - 0.04), 0.018)
    for k in range(12):                                                          # the veil of face-tentacles
        a = (k - 5.5) * 0.11
        M += tentacle((0.25 * (k - 5.5) / 5.5, 0.6, 0.0 - 0.04 * abs(k - 5.5) / 5.5), 0.75 + 0.15 * (1 - abs(k - 5.5) / 5.5), a, r=0.045, curl=0.7, phase=k * 0.8, n=14, droop=0.15, suckers=True)
    M += ribs(0.1, -0.7, 7, 0.32, 0.3, 0.022, BONE, z=0.06)
    for k in range(5): M += spike((0, -0.05 - k * 0.15, 0.32), (0, -0.15 - k * 0.15, 0.55), 0.03)
    M += tentacle((0, -0.95, 0), 0.5, math.pi, r=0.05, curl=1.4, phase=1.0, n=12)
    G = [ichor_glow((0, 0.42, 0.1), 0.2), ichor_glow((0, -0.9, 0), 0.08)]
    return M, G, [light(0.95, -0.4, 0.15, LRED, 0.03), light(-0.95, -0.4, 0.15, LRED, 0.03)], 300

NHAL = [
    ('nhal_lamprey', 'Lamprey', 'FIGHTER', nhal_lamprey),
    ('nhal_watcher', 'Watcher', 'SCOUT & COURIER', nhal_watcher),
    ('nhal_bloat', 'Bloat', 'FREIGHTER', nhal_bloat),
    ('nhal_ossuary', 'Ossuary', 'LINER & YACHT', nhal_ossuary),
    ('nhal_flayer', 'Flayer', 'INTERCEPTOR', nhal_flayer),
    ('nhal_spitter', 'Spitter', 'GUNBOAT & FRIGATE', nhal_spitter),
    ('nhal_kraken', 'Kraken', 'DESTROYER & CRUISER', nhal_kraken),
    ('nhal_broodmother', 'Broodmother', 'CARRIER', nhal_broodmother),
    ('nhal_dreamer', 'The Dreamer', 'DREADNOUGHT & FLAGSHIP', nhal_dreamer),
]
