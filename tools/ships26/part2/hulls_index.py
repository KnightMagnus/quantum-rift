"""Concept hulls: the Index. Survey machines left by a long-dead race, still mapping and stripping the universe.
Worn industrial armour, exposed pistons and cable, amber sensor lenses. Built on the repo's ship generator (tools/ships26)."""
import os, sys, math
# Lives in tools/ships26 beside render2.py and the other hull files; RIFT_SHIPS26 can point elsewhere.
sys.path.insert(0, os.environ.get('RIFT_SHIPS26', os.path.dirname(os.path.abspath(__file__))))
import numpy as np
from render2 import mat, loft, sphere, block, wing, pair, torus
from hulls5 import rod, xf, mv, rotm, hoop
from hulls2 import light, greebles

PLATE = mat((0.7, 0.68, 0.62), metal=0.45, rough=0.4, panel=1.5, grime=2.0, stripe=(0.42, 0.5, (0.86, 0.45, 0.1)))
PLATE2 = mat((0.58, 0.57, 0.53), metal=0.5, rough=0.45, panel=1.6, grime=2.2)
STEEL = mat((0.2, 0.21, 0.23), metal=0.85, rough=0.35, panel=1.3, grime=1.5)
RUST = mat((0.42, 0.24, 0.13), metal=0.5, rough=0.6, panel=0.8, grime=2.0)
ORE = mat((0.35, 0.3, 0.27), metal=0.2, rough=0.8, panel=0.2, grime=1.0)
CABLE = mat((0.07, 0.07, 0.08), metal=0.4, rough=0.5, panel=0.0, grime=0.3)
HOUSING = mat((0.05, 0.05, 0.06), metal=0.9, rough=0.15, panel=0.0, grime=0.2)
SENSOR = mat((1.0, 0.42, 0.08), emissive=(1.0, 0.42, 0.06))
DATA = mat((0.55, 0.9, 1.0), emissive=(0.5, 0.88, 1.0))
LAMB = mat((1, 0.5, 0.1), emissive=(1, 0.5, 0.1))

def lens(c, r, look=(0, 1, 0.2)):
    """A sensor eye: a black housing and a glowing amber lens facing `look`."""
    lv = np.array(look, float); lv /= np.linalg.norm(lv); p = np.array(c, float) + lv * r * 0.6
    return [sphere(c, r, HOUSING), sphere(tuple(p), r * 0.6, SENSOR), sphere(tuple(p), r * 0.75, SENSOR, layer=1)]

def piston(p0, p1, r):
    p0, p1 = np.array(p0, float), np.array(p1, float); m = p0 + (p1 - p0) * 0.55
    return [rod(p0, m, r, STEEL), rod(m - (p1 - p0) * 0.1, p1, r * 0.6, PLATE2), sphere(tuple(p0), r * 1.4, STEEL), sphere(tuple(p1), r * 1.2, STEEL)]

def cable(p0, p1, sag, r=0.008, n=8):
    p0, p1 = np.array(p0, float), np.array(p1, float); out = []
    P = [p0 + (p1 - p0) * (i / n) - np.array([0, 0, sag * math.sin(math.pi * i / n)]) for i in range(n + 1)]
    for a, b in zip(P, P[1:]): out.append(rod(a, b, r, CABLE, ring=5))
    return out

def plate(c, s, m=PLATE, rz=0.0, rx=0.0, sq=8):
    b = block((0, 0, 0), s, m, sq=sq)
    if rx: b = xf(b, rotm('x', rx))
    if rz: b = xf(b, rotm('z', rz))
    return mv(b, *c)

def bay(c, side, w=0.05, l=0.09):
    """A drone launch bay: a dark slot in the hull with amber guide lights."""
    x, y, z = c
    return [block((x, y, z), (0.012, l, w), HOUSING, sq=4), sphere((x + side * 0.012, y + l, z), 0.012, SENSOR), sphere((x + side * 0.012, y - l, z), 0.012, SENSOR)]

def thruster(x, y, z, r):
    return [loft([(y + 0.06, x, z, r * 0.8, r * 0.8, 2), (y, x, z, r, r, 2.6), (y - 0.06, x, z, r * 1.1, r * 1.1, 3)], STEEL, ring=12)], [sphere((x, y - 0.08, z), r * 0.8, LAMB, layer=1)]

# ------------------------------------------------------------------ the swarm
def idx_sampler():   # PROBE DRONE: one eye, three jointed sampler arms, a single thruster.
    M = [sphere((0, 0, 0), 0.3, PLATE, squash=0.8), hoop(0.3, 0.035, STEEL, c=(0, 0, 0), tilt_x=0)]
    M += lens((0, 0.28, 0.04), 0.11)
    for a in (-0.8, 0.0, 0.8):
        b = (0.22 * math.sin(a), 0.15, -0.12 + 0.05 * abs(a)); j = (0.42 * math.sin(a), 0.5, -0.05); t = (0.3 * math.sin(a), 0.85, -0.12)
        M += piston(b, j, 0.025) + piston(j, t, 0.018) + [rod(t, (t[0] * 1.1, 0.95, -0.1), 0.01, STEEL)]
    n, g = thruster(0, -0.35, 0, 0.1)
    return M + n, g, [light(0.3, -0.05, 0.0, LAMB, 0.03)], 34

def idx_picket():   # HUNTER DRONE: an armoured wedge with twin rail barrels.
    M = [loft([(0.6, 0, 0.02, 0.08, 0.05, 6), (0.2, 0, 0.03, 0.22, 0.12, 8), (-0.5, 0, 0.02, 0.26, 0.13, 8), (-0.7, 0, 0.01, 0.18, 0.1, 6)], PLATE, ring=16)]
    M += lens((0, 0.5, 0.07), 0.08)
    for s in (1, -1):
        M += [rod((s * 0.17, 0.1, -0.02), (s * 0.17, 0.95, -0.02), 0.035, STEEL), rod((s * 0.17, 0.9, -0.02), (s * 0.17, 1.0, -0.02), 0.045, HOUSING)]
        M += [plate((s * 0.33, -0.35, 0.0), (0.1, 0.22, 0.02), PLATE2, rz=s * 0.35)]
    M += greebles(3, 6, ((-0.15, 0.15), (-0.5, 0.1)), STEEL, size=(0.04, 0.05, 0.02), zfn=lambda x, y: 0.13)
    eng, glo = [], []
    for x in (0.1, -0.1):
        e, g = thruster(x, -0.72, 0.01, 0.07); eng += e; glo += g
    return M + eng, glo, [light(0.38, -0.4, 0.0, LAMB, 0.03), light(-0.38, -0.4, 0.0, LAMB, 0.03)], 38

# ------------------------------------------------------------------ the mind
def idx_kernel():   # KERNEL (the swarm's processor): a glowing data core inside six half-open armour petals, crowned with antennae.
    M = [sphere((0, 0, 0.02), 0.28, DATA), sphere((0, 0, 0.02), 0.34, DATA, layer=1)]
    M += [hoop(0.34, 0.03, STEEL, c=(0, 0, 0.02), tilt_x=0), hoop(0.34, 0.025, STEEL, c=(0, 0, 0.02)), hoop(0.34, 0.025, STEEL, c=(0, 0, 0.02), tilt_x=math.pi / 2, tilt_y=math.pi / 2)]
    for k in range(6):                                                           # armour petals, opened 30 degrees
        a = 2 * math.pi * k / 6 + math.pi / 6
        c = (0.5 * math.cos(a), 0.5 * math.sin(a), 0.03)
        p = block((0, 0, 0), (0.2, 0.05, 0.16), PLATE, sq=10)
        p = xf(p, rotm('z', a - math.pi / 2)); M += [mv(p, *c)]
        M += piston((0.3 * math.cos(a), 0.3 * math.sin(a), 0.02), (0.45 * math.cos(a), 0.45 * math.sin(a), 0.03), 0.03)
        M += lens((0.56 * math.cos(a), 0.56 * math.sin(a), 0.19), 0.035, look=(math.cos(a), math.sin(a), 0.6))
    for k, (x, l) in enumerate(((0.0, 0.5), (0.12, 0.38), (-0.12, 0.38), (0.22, 0.26), (-0.22, 0.26))):   # antenna crown
        M += [rod((x * 0.5, 0.25, 0.18), (x, 0.25 + l + 0.3, 0.26), 0.012, STEEL), sphere((x, 0.25 + l + 0.3, 0.26), 0.022, SENSOR)]
    M += lens((0, 0.66, 0.03), 0.09)
    eng, glo = [], []
    for k in range(4):
        a = math.pi * 1.25 + (k - 1.5) * 0.32
        e, g = thruster(0.62 * math.cos(a) * 0.8, -0.62, 0.0, 0.07); eng += e; glo += g
        M += [rod((0.62 * math.cos(a) * 0.8, -0.56, 0.0), (0.0, -0.3, 0.02), 0.025, STEEL)]
    return M + eng, glo + [sphere((0, 0, 0.02), 0.2, DATA, layer=1)], [light(0.6, 0.0, 0.0, LAMB, 0.03), light(-0.6, 0.0, 0.0, LAMB, 0.03)], 150

# ------------------------------------------------------------------ the three colossi (each carries a dozen drones)
def idx_quarry():   # COLOSSUS: the harvester. Two vast cutter arms with saw rings, a grinder maw, a conveyor spine, open ore hoppers.
    M = [loft([(0.55, 0, 0.0, 0.2, 0.16, 6), (0.3, 0, 0.02, 0.26, 0.2, 8), (-0.6, 0, 0.02, 0.24, 0.18, 8), (-0.85, 0, 0.0, 0.16, 0.12, 6)], PLATE, ring=20)]
    M += [loft([(0.62, 0, 0.0, 0.16, 0.12, 4), (0.5, 0, 0.0, 0.2, 0.15, 6)], HOUSING, ring=16)]               # grinder throat
    for k in range(8): a = 2 * math.pi * k / 8; M += [rod((0.13 * math.cos(a), 0.6, 0.1 * math.sin(a)), (0.05 * math.cos(a), 0.72, 0.04 * math.sin(a)), 0.02, STEEL)]
    for k in range(9): M += [block((0, 0.3 - k * 0.1, 0.22), (0.07, 0.04, 0.02), STEEL, sq=4)]               # conveyor plates
    for s in (1, -1):
        sh = (s * 0.26, 0.35, 0.05); el = (s * 0.62, 0.55, 0.06); wr = (s * 0.42, 0.95, 0.02)
        M += [sphere(sh, 0.08, STEEL)] + piston(sh, el, 0.06) + piston(el, wr, 0.05)
        M += [hoop(0.14, 0.03, PLATE2, c=wr, tilt_x=math.pi / 2, tilt_y=s * 0.4)]
        for k in range(10):                                                      # saw teeth
            a = 2 * math.pi * k / 10
            M += [rod((wr[0] + 0.14 * math.cos(a) * math.cos(s * 0.4), wr[1] + 0.14 * math.cos(a) * math.sin(s * 0.4) * -1, wr[2] + 0.14 * math.sin(a)),
                      (wr[0] + 0.19 * math.cos(a) * math.cos(s * 0.4), wr[1] - 0.19 * math.cos(a) * math.sin(s * 0.4), wr[2] + 0.19 * math.sin(a)), 0.012, STEEL)]
        for k, y in enumerate((0.1, -0.15, -0.4)):                                # open ore hoppers
            hx = s * 0.36
            M += [loft([(y + 0.1, hx, 0.0, 0.07, 0.04, 3), (y + 0.08, hx, 0.03, 0.1, 0.06, 4), (y - 0.08, hx, 0.03, 0.1, 0.06, 4), (y - 0.1, hx, 0.0, 0.07, 0.04, 3)], RUST, ring=12)]
            M += [sphere((hx + 0.035 * ((j % 2) * 2 - 1), y + 0.04 * (j - 1), 0.08), 0.04, ORE) for j in range(3)]
            M += [rod((s * 0.24, y + 0.06, 0.05), (hx, y + 0.06, 0.08), 0.012, STEEL), rod((s * 0.24, y - 0.06, 0.05), (hx, y - 0.06, 0.08), 0.012, STEEL)]
        for k, y in enumerate((-0.55, -0.68)): M += bay((s * 0.245, y, 0.02), s)
        M += lens((s * 0.15, 0.5, 0.16), 0.04)
    M += greebles(7, 14, ((-0.18, 0.18), (-0.8, 0.3)), STEEL, size=(0.03, 0.05, 0.02), zfn=lambda x, y: 0.2)
    for k in range(6): M += cable((0.2, 0.2 - k * 0.15, 0.17), (0.32, 0.12 - k * 0.15, 0.06), 0.03)
    eng, glo = [], []
    for x in (0.12, -0.12, 0.0):
        e, g = thruster(x, -0.88, 0.0 if x else 0.12, 0.09); eng += e; glo += g
    return M + eng, glo, [light(0.62, 0.55, 0.1, LAMB, 0.03), light(-0.62, 0.55, 0.1, LAMB, 0.03)], 320

def idx_archive():   # COLOSSUS: the recorder. A great survey dish and telescope spine; it maps every star it passes.
    M = [loft([(0.2, 0, 0, 0.14, 0.12, 6), (-0.5, 0, 0.0, 0.2, 0.16, 8), (-0.85, 0, 0, 0.14, 0.11, 6)], PLATE, ring=18)]
    secs = [(0.25 + 0.3 * (1 - (t) ** 2) * 0 + 0.22 * t * t, 0, 0.02, 0.06 + 0.62 * t, 0.06 + 0.62 * t, 2) for t in np.linspace(0, 1, 8)]
    M += [loft(secs, PLATE2, ring=36, caps=False)]                                # the dish (concave forward)
    M += [hoop(0.68, 0.025, STEEL, c=(0, 0.47, 0.02), tilt_x=math.pi / 2)]
    for k in range(12):                                                          # dish ribs
        a = 2 * math.pi * k / 12
        M += [rod((0.08 * math.cos(a), 0.25, 0.02 + 0.08 * math.sin(a)), (0.68 * math.cos(a), 0.47, 0.02 + 0.68 * math.sin(a)), 0.012, STEEL)]
    for k in range(3):                                                           # feed horn on a tripod
        a = 2 * math.pi * k / 3 + 0.5
        M += [rod((0.55 * math.cos(a), 0.44, 0.02 + 0.55 * math.sin(a)), (0, 0.85, 0.02), 0.012, STEEL)]
    M += lens((0, 0.88, 0.02), 0.07)
    M += [loft([(0.25, 0, 0.02, 0.05, 0.05, 2), (-0.85, 0, 0.02, 0.05, 0.05, 2)], DATA, ring=10)]   # data spine
    for s in (1, -1):
        for k, y in enumerate((-0.15, -0.35, -0.55)):                              # sensor vanes
            M += [rod((s * 0.18, y, 0.0), (s * 0.5, y - 0.1, 0.05), 0.014, STEEL), block((s * 0.55, y - 0.12, 0.05), (0.05, 0.08, 0.008), STEEL, sq=4)]
            M += bay((s * 0.205, y, -0.03), s)
    M += greebles(11, 12, ((-0.15, 0.15), (-0.8, 0.15)), STEEL, size=(0.03, 0.05, 0.02), zfn=lambda x, y: 0.16)
    eng, glo = [], []
    for x in (0.08, -0.08):
        e, g = thruster(x, -0.88, 0.0, 0.08); eng += e; glo += g
    return M + eng, glo + [sphere((0, 0.3, 0.02), 0.08, DATA, layer=1)], [light(0.68, 0.47, 0.02, LAMB, 0.03), light(-0.68, 0.47, 0.02, LAMB, 0.03)], 320

def _segment(m=PLATE):
    """One armoured segment of the Mutable: a gun-blister, a drone bay and a reactor band."""
    M = [block((0, 0, 0), (0.15, 0.09, 0.12), m, sq=8), hoop(0.13, 0.02, STEEL, c=(0, 0, 0), tilt_x=math.pi / 2)]
    M += [sphere((0, 0.0, 0.13), 0.05, STEEL), rod((0, 0.0, 0.15), (0, 0.18, 0.16), 0.018, STEEL)]
    M += [block((0.15, 0, 0), (0.01, 0.05, 0.04), HOUSING, sq=4), sphere((0.16, 0.05, 0), 0.01, SENSOR)]
    for sd in (1, -1):
        M += [plate((sd * 0.2, -0.01, -0.02), (0.05, 0.085, 0.012), PLATE2, rz=0.0, rx=0.0)]
        M += [xf(plate((0, 0, 0), (0.06, 0.08, 0.01), PLATE), rotm('y', sd * 0.7), t=(sd * 0.19, 0.0, 0.08))]
        M += piston((sd * 0.12, -0.07, -0.08), (sd * 0.2, 0.07, -0.05), 0.012)
    M += [xf(block((0, 0, 0), (0.008, 0.07, 0.05), STEEL, sq=4), None, t=(0, -0.02, 0.2))]
    return M

def idx_mutable(config='transit'):   # COLOSSUS: the Mutable. Six armour segments that slide into a spear (transit) or open into a crescent (siege).
    def place(parts, R, t):
        return [xf(p, R, t=t) for p in parts]
    head = [loft([(0.38, 0, -0.02, 0.02, 0.02, 4), (0.26, 0, -0.01, 0.1, 0.06, 6), (0.1, 0, 0, 0.2, 0.15, 8), (-0.12, 0, 0, 0.22, 0.16, 8)], PLATE, ring=18)]
    head += lens((0, 0.2, 0.1), 0.06) + lens((0.09, 0.14, 0.12), 0.035, look=(0.5, 1, 0.3)) + lens((-0.09, 0.14, 0.12), 0.035, look=(-0.5, 1, 0.3))
    head += [xf(plate((0, 0, 0), (0.08, 0.14, 0.012), PLATE2), rotm('y', sd * 0.6), t=(sd * 0.2, 0.02, 0.07)) for sd in (1, -1)]
    tail = [loft([(0.1, 0, 0, 0.13, 0.11, 8), (-0.12, 0, 0, 0.1, 0.08, 6)], PLATE2, ring=16)]
    eng, glo = [], []
    if config == 'transit':
        M = place(head, None, (0, 0.72, 0))
        for k in range(6):
            M += place(_segment(), None, (0, 0.48 - k * 0.2, 0))
            M += cable((0, 0.48 - k * 0.2 - 0.08, -0.1), (0, 0.48 - (k + 1) * 0.2 + 0.08, -0.1), 0.02)
        M += place(tail, None, (0, -0.78, 0))
        for x in (0.07, -0.07):
            e, g = thruster(x, -0.92, 0.0, 0.06); eng += e; glo += g
        L = [light(0.17, 0.0, 0.0, LAMB, 0.03), light(-0.17, 0.0, 0.0, LAMB, 0.03)]
    else:   # siege: segments swing out into a forward-facing crescent around the head, guns outward
        M = place(head, None, (0, 0.05, 0))
        M += place(tail, None, (0, -0.3, 0))
        for k in range(6):
            a = math.pi * (0.15 + 0.7 * k / 5)                                    # 27..153 degrees, a crescent opening forward
            R = rotm('z', a - math.pi / 2)
            c = (0.62 * math.cos(a), -0.1 + 0.62 * math.sin(a) * 0.9, 0.0)
            M += place(_segment(), R, c)
            M += piston((0.1 * math.cos(a), -0.05 + 0.1 * math.sin(a), 0.0), (0.5 * math.cos(a), -0.1 + 0.5 * math.sin(a) * 0.9, 0.0), 0.03)
            M += [sphere((0.62 * math.cos(a) * 0.82, -0.1 + 0.62 * math.sin(a) * 0.74, 0.05), 0.03, DATA)]
        M += [hoop(0.62, 0.012, DATA, c=(0, -0.1, -0.06), tilt_x=0, squash=0.9)]
        for x in (0.07, -0.07):
            e, g = thruster(x, -0.44, 0.0, 0.06); eng += e; glo += g
        L = [light(0.62, -0.1, 0.0, LAMB, 0.03), light(-0.62, -0.1, 0.0, LAMB, 0.03)]
    return M + eng, glo, L, 320

def idx_mutable_transit(): return idx_mutable('transit')
def idx_mutable_siege(): return idx_mutable('siege')

INDEX = [
    ('idx_kernel', 'Kernel', 'THE MIND  ·  IDX-000', idx_kernel),
    ('idx_quarry', 'Quarry', 'COLOSSUS  ·  IDX-Q  ·  HARVESTER', idx_quarry),
    ('idx_archive', 'Archive', 'COLOSSUS  ·  IDX-A  ·  RECORDER', idx_archive),
    ('idx_mutable_transit', 'Mutable — transit', 'COLOSSUS  ·  IDX-M  ·  RECONFIGURES', idx_mutable_transit),
    ('idx_mutable_siege', 'Mutable — siege', 'COLOSSUS  ·  IDX-M  ·  RECONFIGURES', idx_mutable_siege),
    ('idx_sampler', 'Sampler', 'DRONE  ·  PROBE', idx_sampler),
    ('idx_picket', 'Picket', 'DRONE  ·  FIGHTER', idx_picket),
]

# Register with the ship pipeline (hulls2.DESIGNS), like hulls52.py does.
from hulls2 import DESIGNS
DESIGNS.update({k: fn for k, _, _, fn in INDEX})
