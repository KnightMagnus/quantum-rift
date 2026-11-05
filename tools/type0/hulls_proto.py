"""The Concord's progenitors: archaic prototype versions of the Quantum Concord yard hulls.

These are the patterns humanity flew before Earth was taken into the Rift. Terra carried the designs with it and
the Concord yards refined them for three centuries; the colonies left behind in the Milky Way kept building the old
patterns. So every common hull in the Rift has an ancestor here, and these are the common ships of Part II.

The look, against the Concord's smooth white-and-blue hulls:
  - built, not moulded: cylinders and boxes joined by collars, exposed trusses, struts and strapped-on tanks
  - chemical-and-fusion bells instead of quantum drive housings, all burning the same plain amber-white
  - faded paint over ceramic white, bare aluminium, orange insulation foam, black heat tile and gold foil
  - radiators, dishes and solar panels where the Concord ships have nothing at all
Each prototype keeps its descendant's layout (wing plan, engine count, pods, rings) so the lineage reads.

Built on the Quantum Rift ship generator (tools/ships26). +Y is the bow, +Z is up, hulls fit the unit circle.
Each design returns (meshes, glow meshes, lights, sprite size), like hulls2."""
import os, sys, math
sys.path.insert(0, os.environ['RIFT_SHIPS26'])
import numpy as np
from render2 import mat, loft, sphere, block, wing, fin, pair, torus
from hulls5 import rod, xf, mv, rotm, hoop
from hulls2 import light, LRED, LGREEN, LWHITE

# ------------------------------------------------------------------ materials
CERAMIC = mat((0.84, 0.82, 0.76), metal=0.2, panel=1.4, rough=0.55, grime=1.4)          # weathered ceramic white
ALU = mat((0.6, 0.61, 0.6), metal=0.75, panel=1.9, rough=0.45, grime=1.6)              # bare aluminium
FOAM = mat((0.7, 0.4, 0.19), metal=0.05, panel=0.5, rough=0.9, grime=1.3)              # orange insulation foam
TILE = mat((0.11, 0.11, 0.12), metal=0.1, panel=2.6, rough=0.8, grime=0.6)             # black heat tile
FOIL = mat((0.86, 0.66, 0.27), metal=0.95, panel=3.0, rough=0.35, grime=0.3)           # gold multilayer foil
TRUSS = mat((0.33, 0.33, 0.34), metal=0.8, panel=0.0, rough=0.4, grime=1.2)            # struts and frames
RAD = mat((0.76, 0.78, 0.8), metal=0.5, panel=3.2, rough=0.3, grime=0.9)               # radiator panels
SOLAR = mat((0.1, 0.13, 0.27), metal=0.7, panel=3.4, rough=0.2, grime=0.3)             # solar cells
MYLAR = mat((0.8, 0.72, 0.92), metal=0.9, panel=1.4, rough=0.15, grime=0.0)           # light-sail film
BELLM = mat((0.27, 0.23, 0.2), metal=0.9, panel=0.0, rough=0.35, grime=0.8)            # nozzle bronze
DARK = mat((0.2, 0.2, 0.21), metal=0.75, panel=1.6, rough=0.45, grime=1.4)
GUN = mat((0.3, 0.3, 0.31), metal=0.9, panel=0.0, rough=0.3)
PANE = mat((0.12, 0.16, 0.2), metal=1.0, rough=0.1, glass=True, panel=0)
LAMP = mat((1.0, 0.82, 0.55), emissive=(1.0, 0.8, 0.5))
BURN = mat((1.0, 0.8, 0.52), emissive=(1.0, 0.76, 0.46))                               # the one drive colour
TEST = (0.86, 0.38, 0.1)                                                                # test-article orange band
HAZ = (0.1, 0.1, 0.1)

def fade(c, k=0.45):
    """Old paint: the descendant's colour, chalky and sun-bleached."""
    base = (0.68, 0.66, 0.6)
    return tuple(a * (1 - k) + b * k for a, b in zip(c, base))
def paint(c, stripe=None, k=0.45, metal=0.3, windows=None):
    return mat(fade(c, k), metal=metal, panel=1.5, rough=0.55, grime=1.5, stripe=stripe, windows=windows)

# ------------------------------------------------------------------ parts
def mirror(ms): return ms + [m.mirror() for m in ms]

def cyl(y_front, y_back, r, m, x=0.0, z=0.0, h=None, sq=2.0, ring=18, taper=1.0):
    h = r if h is None else h
    return loft([(y_front, x, z, r * taper, h * taper, sq), (y_back, x, z, r, h, sq)], m, ring=ring)

def collars(ys, r, x=0.0, z=0.0, m=None, h=None):
    """Joint rings where modules were bolted together."""
    m = DARK if m is None else m; h = r if h is None else h
    return [loft([(y + 0.01, x, z, r * 1.04, h * 1.04, 2), (y - 0.01, x, z, r * 1.04, h * 1.04, 2)], m, ring=18) for y in ys]

def cone(y_tip, y_base, r, m, x=0.0, z=0.0, h=None, sq=2.0, ring=18):
    h = r if h is None else h
    return loft([(y_tip, x, z, 0.004, 0.004, sq), (y_tip - (y_tip - y_base) * 0.35, x, z, r * 0.62, h * 0.62, sq), (y_base, x, z, r, h, sq)], m, ring=ring)

def bell(x, y, z, r, L=None):
    """A rocket bell: throat at y, flaring back to radius r. Returns (meshes, glows)."""
    L = L or r * 1.55
    noz = loft([(y + r * 0.35, x, z, r * 0.5, r * 0.5, 2), (y, x, z, r * 0.42, r * 0.42, 2), (y - L * 0.35, x, z, r * 0.62, r * 0.62, 2),
                (y - L * 0.7, x, z, r * 0.84, r * 0.84, 2), (y - L, x, z, r, r, 2)], BELLM, ring=16)
    rim = loft([(y - L + 0.008, x, z, r * 1.04, r * 1.04, 2), (y - L - 0.004, x, z, r * 1.04, r * 1.04, 2)], DARK, ring=16)
    g = sphere((x, y - L + r * 0.25, z), r * 0.82, BURN, layer=1)
    return [noz, rim], [g]

def bells(xs, y, z, r, L=None):
    M, G = [], []
    for x in xs:
        m, g = bell(x, y, z, r, L); M += m; G += g
    return M, G

def tank(c, r, m=FOAM, band=True):
    out = [sphere(c, r, m)]
    if band: out.append(hoop(r * 1.01, r * 0.07, TRUSS, c=c, tilt_x=0.0, n=28, k=6))
    return out

def truss(p0, p1, w, r=0.009, m=TRUSS, bays=None):
    """An open square truss between two points: four longerons and zig-zag bracing."""
    p0, p1 = np.array(p0, float), np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d); u = d / L
    a = np.array([0, 0, 1.0]) if abs(u[2]) < 0.9 else np.array([1.0, 0, 0])
    e1 = np.cross(u, a); e1 /= np.linalg.norm(e1); e2 = np.cross(u, e1)
    corners = [(e1 + e2) * w, (e1 - e2) * w, (-e1 - e2) * w, (-e1 + e2) * w]
    n = bays or max(2, int(L / (w * 2.2)))
    out = [rod(p0 + c, p1 + c, r, m, ring=6) for c in corners]
    for i in range(n):
        q0 = p0 + d * i / n; q1 = p0 + d * (i + 1) / n
        for k in range(4):
            c0, c1 = corners[k], corners[(k + 1) % 4]
            out.append(rod(q0 + (c0 if i % 2 == 0 else c1), q1 + (c1 if i % 2 == 0 else c0), r * 0.7, m, ring=5))
    return out

def strut(p0, p1, r=0.012, m=TRUSS): return rod(p0, p1, r, m, ring=6)

def panel(c, sx, sy, m=RAD, ribs=0, rib_axis='y', sz=0.006):
    """A flat panel (radiator or solar wing), optionally ribbed."""
    out = [block(c, (sx, sy, sz), m, sq=12)]
    x, y, z = c
    for i in range(ribs):
        t = -1 + 2 * (i + 0.5) / ribs
        if rib_axis == 'y': out.append(rod((x + sx * t, y - sy, z + sz), (x + sx * t, y + sy, z + sz), 0.005, TRUSS, ring=5))
        else: out.append(rod((x - sx, y + sy * t, z + sz), (x + sx, y + sy * t, z + sz), 0.005, TRUSS, ring=5))
    return out

def dish(c, r, face=0.0, depth=0.35, m=ALU):
    """A parabolic dish. face rotates it about x: 0 opens upward, +pi/2 opens forward."""
    cx, cy, cz = c
    secs = [(cz - r * depth, cy, cx, r * 0.18, r * 0.18, 2), (cz - r * depth * 0.6, cy, cx, r * 0.6, r * 0.6, 2), (cz, cy, cx, r, r, 2)]
    out = [loft(secs, m, ring=22, axis='z'), rod((cx, cy, cz - r * depth), (cx, cy, cz + r * 0.55), 0.008, TRUSS, ring=5),
           sphere((cx, cy, cz + r * 0.55), r * 0.08, DARK)]
    if face: out = [xf(o, rotm('x', -face), about=c) for o in out]
    return out

def box_turret(x, y, z, s=1.0, barrels=1, length=0.3, m=DARK):
    """Open-mount gun: a squat box, a mantlet and plain barrels. Nothing like the Concord's domes."""
    out = [block((x, y, z), (0.06 * s, 0.07 * s, 0.035 * s), m, sq=10), block((x, y + 0.04 * s, z + 0.035 * s), (0.04 * s, 0.035 * s, 0.025 * s), GUN, sq=8)]
    offs = [0.0] if barrels == 1 else [-0.022 * s, 0.022 * s]
    for dx in offs: out.append(rod((x + dx, y + 0.06 * s, z + 0.04 * s), (x + dx, y + length * s, z + 0.04 * s), 0.011 * s, GUN, ring=6))
    return out

def window_slit(y0, y1, z, w, h=0.02):
    """Small framed cockpit windows instead of a bubble canopy."""
    return [loft([(y0, 0, z, w, h, 4), (y1, 0, z, w * 0.9, h, 4)], PANE, ring=12)]

def whip(p, length, r=0.004): return rod(p, (p[0], p[1] - length * 0.15, p[2] + length), r, TRUSS, ring=4)

def lights(M, extra=()):
    V = np.concatenate([m.V for m in M if m.layer == 0])
    i = np.argmax(np.abs(V[:, 0])); x, y, z = V[i]
    return [light(abs(x) * 0.97, y, z + 0.01, LGREEN, 0.028), light(-abs(x) * 0.97, y, z + 0.01, LRED, 0.028)] + [light(*e, LWHITE, 0.022) for e in extra]


# ================================================================== the prototypes
def gnat():   # 703 Gnat Skiff -> Gnat Type 0: a stubby capsule on one big bell, tanks on struts where the wings will be
    hull = paint((0.78, 0.72, 0.6), stripe=(-0.15, -0.02, TEST))
    M = [cone(0.92, 0.55, 0.26, CERAMIC), cyl(0.55, -0.55, 0.26, hull), cyl(-0.55, -0.72, 0.2, ALU, taper=1.25)]
    M += collars([0.55, -0.55], 0.26) + window_slit(0.78, 0.66, 0.11, 0.1)
    for s in (1, -1):
        M += tank((s * 0.5, -0.15, 0), 0.13, FOAM) + [strut((s * 0.24, 0.0, 0), (s * 0.4, -0.1, 0)), strut((s * 0.24, -0.35, 0), (s * 0.4, -0.22, 0))]
    E, G = bell(0, -0.72, 0, 0.17)
    return M + E, G, lights(M), 30

def kestrel():   # 705 Kestrel Scout -> Kestrel Type 0: forward-swept stubs, a tall single fin, heat-tile nose
    hull = paint((0.86, 0.88, 0.92), stripe=(0.12, 0.24, TEST), k=0.3)
    M = [cone(1.0, 0.62, 0.11, TILE), cyl(0.62, -0.7, 0.13, hull), cyl(-0.7, -0.82, 0.1, ALU)]
    M += collars([0.62, 0.05, -0.7], 0.13) + window_slit(0.55, 0.42, 0.1, 0.06)
    M += mirror([wing((0.1, -0.05), 0, 0.55, 0.42, 0.26, -0.14, 0.035, hull, sq=6)])
    M += mirror([sphere((0.66, -0.15, 0), 0.04, FOAM)])
    M += [fin(0.0, -0.45, 0.34, 0.36, 0.16, 0.2, 0.025, CERAMIC, z0=0.08)]
    M += mirror([wing((0.1, -0.58), 0, 0.22, 0.24, 0.14, 0.08, 0.02, hull, sq=6)])
    M += [whip((0, 0.2, 0.12), 0.2)]
    E, G = bell(0, -0.82, 0, 0.1)
    return M + E, G, lights(M), 38

def cutlass():   # 708 Cutlass Interceptor -> Cutlass Type 0: a flat plate delta with its two engines hung on pylons
    hull = paint((0.55, 0.14, 0.14), stripe=(-0.3, -0.2, HAZ), k=0.4)
    plate = loft([(0.95, 0, 0, 0.02, 0.012, 1.3), (0.5, 0, 0, 0.22, 0.04, 1.3), (-0.1, 0, 0, 0.5, 0.05, 1.3), (-0.55, 0, 0, 0.72, 0.05, 1.3), (-0.62, 0, 0, 0.7, 0.04, 1.3)], hull, ring=8)
    M = [plate, loft([(0.98, 0, 0, 0.0, 0.0, 2), (0.85, 0, 0.03, 0.06, 0.05, 2), (-0.6, 0, 0.03, 0.09, 0.08, 2)], TILE, ring=14)]
    M += window_slit(0.55, 0.4, 0.09, 0.05)
    for s in (1, -1):
        M += [cyl(-0.2, -0.62, 0.075, ALU, x=s * 0.3, z=0.13)] + collars([-0.3, -0.5], 0.075, x=s * 0.3, z=0.13)
        M += [strut((s * 0.3, -0.3, 0.03), (s * 0.3, -0.3, 0.07)), strut((s * 0.3, -0.5, 0.03), (s * 0.3, -0.5, 0.07))] + tank((s * 0.3, -0.05, 0.1), 0.06, FOAM, band=False)
        M += [fin(s * 0.62, -0.48, 0.14, 0.18, 0.08, 0.08, 0.015, hull, z0=0.03)]
    M += [rod((0, 0.25, -0.06), (0, 0.92, -0.06), 0.014, GUN, ring=6), block((0, 0.2, -0.06), (0.03, 0.08, 0.025), DARK)]
    E, G = bells([0.3, -0.3], -0.62, 0.13, 0.075)
    return M + E, G, lights(M), 46

def dory():   # 704 Dory Hauler -> Dory Type 0: two bare containers in an open frame, a capsule cab, three bells
    cab = paint((0.85, 0.82, 0.7), k=0.25)
    M = [cone(0.98, 0.78, 0.17, cab, h=0.15), cyl(0.78, 0.55, 0.17, cab, h=0.15)] + window_slit(0.9, 0.82, 0.1, 0.1)
    M += collars([0.55], 0.17, h=0.15)
    for k, (y, c) in enumerate(((0.28, (0.45, 0.5, 0.36)), (-0.16, (0.55, 0.4, 0.28)))):
        M += [block((0, y, 0), (0.24, 0.19, 0.16), paint(c, k=0.35), sq=14)]
        for yy in (y + 0.12, y - 0.12): M += [block((0, yy, 0), (0.25, 0.012, 0.17), TRUSS, sq=14)]
    M += truss((0, 0.55, 0.2), (0, -0.55, 0.2), 0.035) + truss((0, 0.55, -0.2), (0, -0.55, -0.2), 0.035)
    M += [block((0, -0.55, 0), (0.3, 0.035, 0.035), TRUSS, sq=10)]
    for x in (0.3, -0.3): M += [strut((x * 0.8, -0.55, 0), (x, -0.62, 0))]
    E, G = bells([0.3, 0.0, -0.3], -0.6, 0, 0.085)
    return M + E, G, lights(M), 54

def lacewing():   # 709 Lacewing Sail Yacht -> Lacewing Type 0: a light-sail test ship, square mylar sails on cross booms
    hull = paint((0.92, 0.92, 0.96), stripe=(0.3, 0.38, TEST), k=0.2)
    M = [cone(0.95, 0.65, 0.06, CERAMIC), cyl(0.65, -0.6, 0.065, hull), cyl(-0.6, -0.7, 0.05, ALU)] + collars([0.65, 0.1, -0.35], 0.065)
    M += window_slit(0.6, 0.5, 0.05, 0.035)
    for y0, span, chord in ((0.42, 0.85, 0.36), (-0.12, 0.72, 0.3)):
        M += [rod((-span - 0.03, y0, 0.0), (span + 0.03, y0, 0.0), 0.009, TRUSS, ring=6)]
        for s in (1, -1):
            M += [loft([(s * 0.09, y0 + 0.01, 0.0, chord / 2, 0.003, 12), (s * span, y0 - 0.06, 0.0, chord / 2.2, 0.003, 12)], MYLAR, ring=4, axis='x')]
            M += [rod((s * span, y0, 0), (s * span * 0.95, y0 - chord * 0.9, 0), 0.006, TRUSS, ring=5)]
    M += [whip((0, -0.4, 0.06), 0.15)]
    E, G = bell(0, -0.7, 0, 0.055)
    return M + E, G, lights(M), 64

def wayfarer():   # 707 Wayfarer -> Wayfarer Type 0: a spin ring of bolted habitat cans on spokes, a big bell behind
    hull = paint((0.82, 0.78, 0.68), stripe=(0.45, 0.55, (0.2, 0.35, 0.5)), k=0.3)
    M = [cone(1.0, 0.75, 0.09, CERAMIC), cyl(0.75, -0.75, 0.1, hull), cyl(-0.75, -0.85, 0.13, ALU)] + collars([0.75, 0.3, -0.2, -0.75], 0.1)
    M += window_slit(0.82, 0.72, 0.08, 0.05)
    M += [hoop(0.4, 0.02, TRUSS, c=(0, 0.05, 0), tilt_x=0.0, n=48, k=6)]
    for a in range(8):
        ang = a * math.pi / 4
        cx, cz = 0.4 * math.cos(ang), 0.4 * math.sin(ang)
        M += [xf(block((0, 0, 0), (0.07, 0.06, 0.045), CERAMIC if a % 2 else hull, sq=10), rotm('y', -ang), t=(cx, 0.05, cz))]
        if a % 2 == 0: M += [strut((0.1 * math.cos(ang), 0.05, 0.1 * math.sin(ang)), (0.34 * math.cos(ang), 0.05, 0.34 * math.sin(ang)), 0.01)]
    for s in (1, -1): M += tank((s * 0.2, -0.5, 0), 0.09, FOAM) + [strut((s * 0.1, -0.5, 0), (s * 0.13, -0.5, 0))]
    E, G = bell(0, -0.85, 0, 0.13)
    return M + E, G, lights(M), 72

def mule():   # 706 Mule Tender -> Mule Type 0: three pairs of cargo cans strapped to an open spine
    hull = paint((0.62, 0.42, 0.28), stripe=(0.62, 0.72, (0.9, 0.75, 0.2)))
    M = [loft([(0.95, 0, 0, 0.12, 0.1, 4), (0.75, 0, 0, 0.18, 0.15, 5), (0.58, 0, 0, 0.18, 0.15, 5)], hull, ring=14)] + window_slit(0.9, 0.8, 0.1, 0.11)
    M += truss((0, 0.58, 0), (0, -0.78, 0), 0.07, r=0.011)
    for y in (0.32, -0.06, -0.44):
        for s in (1, -1):
            M += [cyl(y + 0.15, y - 0.15, 0.12, FOAM if s > 0 else ALU, x=s * 0.27)] + collars([y + 0.1, y - 0.1], 0.12, x=s * 0.27)
            M += [strut((s * 0.07, y, 0), (s * 0.15, y, 0), 0.014)]
    M += [block((0, -0.78, 0), (0.18, 0.04, 0.06), TRUSS, sq=10)]
    E, G = bells([0.12, -0.12], -0.8, 0, 0.085)
    return M + E, G, lights(M), 74

def crawler():   # 710 Ore Crawler -> Crawler Type 0: an open drill cone, mining arms and a frame full of hoppers
    hull = paint((0.62, 0.52, 0.22), stripe=(0.3, 0.42, HAZ), k=0.35)
    M = [block((0, -0.05, 0), (0.36, 0.5, 0.16), hull, sq=9)]
    for y in (0.3, -0.05, -0.4): M += [block((0, y, 0.17), (0.3, 0.12, 0.03), DARK, sq=10)]
    M += [loft([(1.0, 0, 0, 0.005, 0.005, 2), (0.82, 0, 0, 0.07, 0.07, 2), (0.6, 0, 0, 0.16, 0.16, 2)], ALU, ring=8)]
    for k in range(4): M += [rod((0, 0.6 - k * 0.09, 0.16 - k * 0.04), (0, 0.6 - k * 0.09 - 0.05, -0.16 + k * 0.04), 0.008, TRUSS, ring=4)]
    for s in (1, -1):
        M += [rod((s * 0.3, 0.42, 0), (s * 0.42, 0.75, 0.04), 0.03, TRUSS), rod((s * 0.42, 0.75, 0.04), (s * 0.3, 0.95, 0.02), 0.022, TRUSS), sphere((s * 0.3, 0.95, 0.02), 0.035, DARK)]
        M += panel((s * 0.52, -0.25, 0), 0.12, 0.2, RAD, ribs=4)
    M += [block((0, 0.4, 0.2), (0.12, 0.06, 0.05), CERAMIC)] + window_slit(0.47, 0.42, 0.23, 0.08)
    E, G = bells([0.18, -0.18], -0.56, 0, 0.09)
    return M + E, G, lights(M, [(0, 0.62, 0.17)]), 80

def bramble():   # 711 Bramble Gunboat -> Bramble Type 0: a plated can with open gun mounts, tanks on stub wings
    hull = paint((0.4, 0.45, 0.3), stripe=(0.5, 0.58, HAZ))
    M = [cone(0.95, 0.65, 0.26, hull, h=0.2), cyl(0.65, -0.75, 0.3, hull, h=0.22), cyl(-0.75, -0.85, 0.22, ALU, h=0.16)]
    M += collars([0.65, 0.2, -0.3, -0.75], 0.3, h=0.22) + window_slit(0.75, 0.66, 0.16, 0.1)
    for x, y, z in ((0, 0.4, 0.2), (0.17, 0.0, 0.2), (-0.17, 0.0, 0.2), (0, -0.4, 0.22)):
        M += box_turret(x, y, z, 1.1, 1, 0.3)
    for s in (1, -1):
        M += [wing((0.28, -0.3), 0, 0.22, 0.3, 0.24, 0.05, 0.03, DARK, sq=8)] if s > 0 else [wing((0.28, -0.3), 0, 0.22, 0.3, 0.24, 0.05, 0.03, DARK, sq=8).mirror()]
        M += tank((s * 0.56, -0.42, 0), 0.08, FOAM)
    E, G = bells([0.12, -0.12], -0.86, 0, 0.09)
    return M + E, G, lights(M), 88

def halberd():   # 713 Halberd Frigate -> Halberd Type 0: a segmented spine, outrigger tanks on struts, one long rail
    hull = paint((0.3, 0.38, 0.55), stripe=(0.5, 0.6, (0.8, 0.82, 0.85)), k=0.4)
    M = [cone(0.85, 0.55, 0.12, hull, h=0.09), cyl(0.55, -0.8, 0.2, hull, h=0.12, sq=3)]
    M += collars([0.55, 0.2, -0.15, -0.5, -0.8], 0.2, h=0.12)
    M += [block((0, -0.2, 0.17), (0.07, 0.18, 0.06), CERAMIC, sq=8), block((0, -0.1, 0.25), (0.05, 0.06, 0.03), DARK)] + window_slit(-0.04, -0.12, 0.26, 0.045, 0.012)
    M += [rod((0, 0.3, 0.13), (0, 1.0, 0.13), 0.014, GUN, ring=6), block((0, 0.25, 0.13), (0.03, 0.12, 0.025), DARK)]
    for s in (1, -1):
        M += [cyl(0.1, -0.75, 0.07, FOAM, x=s * 0.38, z=-0.02)] + collars([0.05, -0.35, -0.7], 0.07, x=s * 0.38, z=-0.02)
        M += [strut((s * 0.18, 0.0, 0), (s * 0.33, 0.0, -0.02), 0.014), strut((s * 0.18, -0.5, 0), (s * 0.33, -0.5, -0.02), 0.014)]
    M += panel((0, -0.45, 0.14), 0.12, 0.2, RAD, ribs=3)
    E1, G1 = bells([0.1, -0.1], -0.8, 0, 0.075)
    E2, G2 = bells([0.38, -0.38], -0.75, -0.02, 0.06)
    return M + E1 + E2, G1 + G2, lights(M), 112

def barge():   # 712 Longhaul Barge -> Barge Type 0: containers on a long truss, a capsule cab, a big radiator
    cab = paint((0.6, 0.62, 0.65), k=0.3)
    M = [cone(1.0, 0.82, 0.14, cab, h=0.12), cyl(0.82, 0.66, 0.15, cab, h=0.13)] + window_slit(0.92, 0.85, 0.09, 0.09)
    M += truss((0, 0.66, 0), (0, -0.82, 0), 0.06, r=0.011)
    cols = [(0.55, 0.36, 0.25), (0.6, 0.62, 0.65), (0.3, 0.42, 0.55), (0.55, 0.36, 0.25)]
    for k, y in enumerate((0.45, 0.13, -0.19, -0.51)):
        for s in (1, -1): M += [block((s * 0.16, y, 0), (0.1, 0.13, 0.12), paint(cols[(k + (s > 0)) % 4], k=0.35), sq=14)]
    M += panel((0, -0.68, 0.0), 0.36, 0.07, RAD, ribs=6, rib_axis='x')
    E, G = bells([0.14, -0.14], -0.84, 0, 0.09)
    return M + E, G, lights(M, [(0, 1.0, 0.06)]), 132

def pilgrim():   # 714 Pilgrim Liner -> Pilgrim Type 0: stacked hab cans with window rows; radiators where its fins will be
    hab = paint((0.93, 0.92, 0.9), k=0.2, windows=(-0.05, 0.05, (1.0, 0.8, 0.45), 18))
    M = [cone(1.0, 0.72, 0.18, CERAMIC)]
    segs = [(0.72, 0.34), (0.3, -0.08), (-0.12, -0.5)]
    for y0, y1 in segs: M += [cyl(y0, y1, 0.24, hab, sq=2)] + collars([y0, y1], 0.24)
    M += [cyl(-0.5, -0.78, 0.16, ALU)] + window_slit(0.85, 0.76, 0.12, 0.1)
    M += mirror([panel((0.42, -0.55, 0.0), 0.14, 0.16, RAD, ribs=4)[0]]) + mirror([strut((0.17, -0.55, 0), (0.29, -0.55, 0))])
    M += [panel((0.0, -0.58, 0.36), 0.008, 0.18, RAD)[0], strut((0, -0.58, 0.16), (0, -0.58, 0.2))]
    for y in (0.53, 0.11, -0.31): M += [hoop(0.245, 0.006, FOIL, c=(0, y, 0), tilt_x=0.0, n=36, k=5)]
    E, G = bells([0.1, -0.1], -0.78, 0, 0.085)
    return M + E, G, lights(M, [(0, -0.58, 0.55)]), 144

def hive():   # 715 Hive Tender -> Hive Type 0: a six-sided frame with open cradles, each holding a little Gnat Type 0
    hull = paint((0.48, 0.42, 0.26))
    M = [loft([(0.9, 0, 0, 0.1, 0.08, 2), (0.7, 0, 0, 0.24, 0.16, 2), (0.45, 0, 0, 0.26, 0.17, 2)], hull, ring=6)]
    M += [loft([(0.45, 0, 0, 0.17, 0.12, 2), (-0.7, 0, 0, 0.17, 0.12, 2)], DARK, ring=6)] + window_slit(0.78, 0.7, 0.12, 0.09)
    for y in (0.25, -0.1, -0.45):
        for s in (1, -1):
            cx = s * 0.4
            M += [block((cx, y, -0.06), (0.16, 0.13, 0.012), TRUSS, sq=12), strut((s * 0.15, y, 0), (s * 0.26, y, -0.04), 0.014)]
            M += [cyl(y + 0.06, y - 0.06, 0.045, CERAMIC, x=cx, z=0.0), sphere((cx, y + 0.07, 0), 0.045, CERAMIC), sphere((cx, y - 0.09, 0), 0.03, BELLM)]
            M += [strut((cx - 0.15, y - 0.12, -0.06), (cx - 0.15, y - 0.12, 0.06), 0.008), strut((cx + 0.15, y - 0.12, -0.06), (cx + 0.15, y - 0.12, 0.06), 0.008)]
    M += [block((0, -0.72, 0), (0.24, 0.04, 0.04), TRUSS, sq=10)]
    E, G = bells([0.14, -0.14], -0.75, 0, 0.09)
    return M + E, G, lights(M), 150

def tempest():   # 716 Tempest Destroyer -> Tempest Type 0: a gun spine with two separate slab wings strutted on, five bells
    hull = paint((0.2, 0.2, 0.22), stripe=(0.2, 0.3, (0.6, 0.12, 0.15)), k=0.3, metal=0.5)
    M = [cone(1.0, 0.55, 0.13, TILE, h=0.09, sq=3), cyl(0.55, -0.7, 0.15, hull, h=0.1, sq=3)] + collars([0.55, 0.25, -0.05, -0.35, -0.7], 0.15, h=0.1)
    M += [block((0, -0.1, 0.15), (0.07, 0.12, 0.05), CERAMIC, sq=8)] + window_slit(0.04, -0.03, 0.18, 0.05, 0.012)
    for s in (1, -1):
        slab = loft([(0.45, s * 0.2, 0, 0.012, 0.03, 1.4), (0.0, s * 0.33, 0, 0.12, 0.06, 1.4), (-0.5, s * 0.46, 0, 0.22, 0.07, 1.4), (-0.64, s * 0.46, 0, 0.22, 0.05, 1.4)], hull, ring=8)
        M += [slab, strut((s * 0.14, 0.2, 0), (s * 0.24, 0.2, 0), 0.016), strut((s * 0.14, -0.2, 0), (s * 0.3, -0.2, 0), 0.016), strut((s * 0.14, -0.55, 0), (s * 0.28, -0.55, 0), 0.016)]
        for y in (0.15, -0.15, -0.42):
            x = 0.31 + 0.27 * (0.15 - y)
            M += [block((s * x, y, 0.06), (0.05, 0.06, 0.03), DARK, sq=10), rod((s * x, y + 0.05, 0.07), (s * x, y + 0.22, 0.07), 0.011, GUN, ring=6)]
        M += [rod((s * 0.1, 0.3, 0.06), (s * 0.08, 0.96, 0.06), 0.013, GUN, ring=6)]
        M += panel((s * 0.46, -0.56, 0.09), 0.09, 0.07, RAD, ribs=3)
    E1, G1 = bells([0.0], -0.7, 0, 0.1)
    E2, G2 = bells([0.3, -0.3, 0.52, -0.52], -0.64, 0, 0.065)
    return M + E1 + E2, G1 + G2, lights(M), 172

def bastion():   # 717 Bastion Dreadnought -> Bastion Type 0: an armour-belted hull, sponson cans on trusses, single-gun turrets
    hull = paint((0.58, 0.6, 0.64), stripe=(0.72, 0.8, (0.25, 0.45, 0.7)), k=0.35)
    M = [cone(1.0, 0.75, 0.24, hull, h=0.14, sq=3), cyl(0.75, -0.85, 0.32, hull, h=0.17, sq=4)]
    M += collars([0.75, 0.45, 0.15, -0.15, -0.45, -0.75], 0.32, h=0.17, m=DARK)
    M += [block((0, -0.3, 0.27), (0.1, 0.17, 0.09), CERAMIC, sq=8), block((0, -0.25, 0.4), (0.07, 0.07, 0.04), DARK, sq=8)] + window_slit(-0.15, -0.22, 0.41, 0.06, 0.013)
    M += [rod((0, -0.25, 0.44), (0, -0.25, 0.6), 0.008, TRUSS, ring=5)] + dish((0.0, -0.45, 0.4), 0.07, 0.4)
    for x, y in ((0, 0.55), (0.16, 0.2), (-0.16, 0.2), (0.16, -0.62), (-0.16, -0.62)):
        M += box_turret(x, y, 0.19, 1.5, 2 if y > 0.4 else 1, 0.28)
    for s in (1, -1):
        M += [cyl(0.55, -0.75, 0.09, hull, x=s * 0.5, h=0.11)] + collars([0.4, 0.0, -0.4], 0.09, x=s * 0.5, h=0.11)
        M += truss((s * 0.3, 0.3, 0), (s * 0.42, 0.3, 0), 0.03, bays=2) + truss((s * 0.3, -0.4, 0), (s * 0.42, -0.4, 0), 0.03, bays=2)
        M += panel((s * 0.5, -0.15, 0.13), 0.06, 0.2, RAD, ribs=3)
    E1, G1 = bells([0.0, 0.18, -0.18], -0.86, 0, 0.09)
    E2, G2 = bells([0.5, -0.5], -0.76, 0, 0.075)
    return M + E1 + E2, G1 + G2, lights(M, [(0, 1.0, 0.03)]), 220

def wren():   # 700 Wren -> Wren Type 0: a cone capsule on a service can, one thin truss ring and two solar wings
    hull = paint((0.62, 0.66, 0.72), stripe=(-0.3, -0.22, TEST), k=0.3)
    M = [cone(1.0, 0.55, 0.15, CERAMIC), cyl(0.55, 0.45, 0.15, TILE)] + window_slit(0.78, 0.68, 0.09, 0.06)
    M += [cyl(0.45, -0.7, 0.12, hull)] + collars([0.45, 0.0, -0.7], 0.12)
    M += [hoop(0.38, 0.016, TRUSS, c=(0, -0.05, 0), tilt_x=0.0, n=44, k=6)]
    M += mirror([strut((0.12, -0.05, 0), (0.37, -0.05, 0), 0.012)]) + [strut((0, -0.05, 0.12), (0, -0.05, 0.37), 0.01)]
    M += mirror(panel((0.38, -0.42, 0), 0.16, 0.08, SOLAR, ribs=4)) + mirror([strut((0.12, -0.42, 0), (0.22, -0.42, 0))])
    E, G = bell(0, -0.7, 0, 0.1)
    return M + E, G, lights(M), 58

def wasp():   # 820 Wasp Skirmisher -> Wasp Type 0: a fat can on a big bell, cheek guns on struts, four plain fins
    hull = paint((0.86, 0.72, 0.22), stripe=(-0.4, -0.25, HAZ), k=0.35)
    M = [cone(0.9, 0.55, 0.18, hull), cyl(0.55, -0.6, 0.22, hull), cyl(-0.6, -0.68, 0.18, ALU)] + collars([0.55, -0.1, -0.6], 0.22)
    M += window_slit(0.75, 0.62, 0.1, 0.09)
    for s in (1, -1):
        M += [rod((s * 0.3, 0.1, -0.02), (s * 0.3, 0.7, -0.02), 0.02, GUN, ring=6), strut((s * 0.2, 0.2, 0), (s * 0.3, 0.2, -0.02)), strut((s * 0.2, 0.0, 0), (s * 0.3, 0.0, -0.02))]
    for a in range(4):
        f = fin(0.0, -0.4, 0.2, 0.28, 0.16, 0.12, 0.02, DARK, z0=0.18)
        M += [xf(f, rotm('y', a * math.pi / 2 + math.pi / 4))]
    E, G = bell(0, -0.68, 0, 0.16)
    return M + E, G, lights(M), 34

def swift():   # 821 Swift Courier -> Swift Type 0: a capsule on a long boom, a cargo can underneath, outrigger bells
    hull = paint((0.84, 0.86, 0.9), stripe=(0.2, 0.32, TEST), k=0.25)
    M = [cone(1.0, 0.7, 0.1, CERAMIC), cyl(0.7, 0.45, 0.11, hull)] + collars([0.45], 0.11) + window_slit(0.62, 0.52, 0.08, 0.05)
    M += truss((0, 0.45, 0), (0, -0.75, 0), 0.045, r=0.01)
    M += [cyl(0.25, -0.45, 0.08, ALU, z=-0.13)] + collars([0.15, -0.35], 0.08, z=-0.13) + [strut((0, 0.0, -0.04), (0, 0.0, -0.06))]
    M += [rod((-0.45, -0.72, 0), (0.45, -0.72, 0), 0.016, TRUSS, ring=6)]
    for s in (1, -1): M += tank((s * 0.2, -0.55, 0.0), 0.06, FOAM, band=False)
    E, G = bells([0.42, -0.42], -0.72, 0, 0.06)
    return M + E, G, lights(M), 48

def pelican():   # 822 Pelican Salvage Tug -> Pelican Type 0: jointed truss cranes with claws, a towing frame astern
    hull = paint((0.72, 0.5, 0.2), stripe=(0.05, 0.14, HAZ), k=0.35)
    M = [block((0, 0.1, 0), (0.24, 0.28, 0.15), hull, sq=9), block((0, 0.38, 0.1), (0.12, 0.07, 0.07), CERAMIC, sq=8)] + window_slit(0.46, 0.4, 0.13, 0.09, 0.015)
    for s in (1, -1):
        M += [rod((s * 0.2, 0.35, 0), (s * 0.36, 0.68, 0), 0.03, TRUSS), sphere((s * 0.36, 0.68, 0), 0.035, DARK), rod((s * 0.36, 0.68, 0), (s * 0.2, 0.92, 0), 0.024, TRUSS)]
        M += [rod((s * 0.2, 0.92, 0), (s * 0.12, 1.0, 0.02), 0.012, GUN), rod((s * 0.2, 0.92, 0), (s * 0.12, 1.0, -0.02), 0.012, GUN)]
        M += [rod((s * 0.24, -0.2, 0), (s * 0.24, -0.85, 0), 0.022, TRUSS)] + tank((s * 0.3, 0.0, 0.0), 0.08, FOAM, band=False)
    M += [rod((0.24, -0.85, 0), (-0.24, -0.85, 0), 0.022, TRUSS), rod((0.24, -0.6, 0), (-0.24, -0.6, 0), 0.018, TRUSS)]
    E, G = bells([0.12, -0.12], -0.2, 0, 0.08)
    return M + E, G, lights(M, [(0, 0.45, 0.18)]), 60

def sabre():   # 823 Sabre Corvette -> Sabre Type 0: a hard-faceted wedge, an open dorsal gun, three bells
    hull = paint((0.84, 0.86, 0.9), stripe=(-0.05, 0.08, TEST), k=0.3)
    M = [loft([(1.0, 0, 0, 0.03, 0.02, 1.0), (0.55, 0, 0, 0.22, 0.09, 1.0), (0.0, 0, 0, 0.4, 0.12, 1.0), (-0.6, 0, 0, 0.46, 0.12, 1.0), (-0.72, 0, 0, 0.42, 0.09, 1.0)], hull, ring=4)]
    M += [loft([(0.98, 0, -0.01, 0.0, 0.0, 1.0), (0.6, 0, -0.03, 0.12, 0.05, 1.0), (0.2, 0, -0.04, 0.2, 0.06, 1.0)], TILE, ring=4)]
    M += window_slit(0.45, 0.35, 0.1, 0.06, 0.015) + box_turret(0, -0.25, 0.12, 1.3, 1, 0.3)
    M += mirror([fin(0.36, -0.52, 0.18, 0.26, 0.14, 0.12, 0.02, DARK, z0=0.05)])
    M += mirror(panel((0.3, -0.35, 0.1), 0.07, 0.12, RAD, ribs=2))
    M += mirror([cyl(0.2, -0.4, 0.05, FOAM, x=0.47, z=-0.02, taper=0.6)]) + mirror([strut((0.4, -0.1, 0), (0.44, -0.1, -0.01))])
    E, G = bells([0.2, 0.0, -0.2], -0.72, 0, 0.075)
    return M + E, G, lights(M), 62

def caravel():   # 824 Caravel Trader -> Caravel Type 0: an armed merchant on a truss spine, two open gun mounts
    cab = paint((0.76, 0.78, 0.74), stripe=(0.55, 0.62, (0.2, 0.45, 0.8)), k=0.35)
    M = [cone(0.98, 0.78, 0.13, cab, h=0.11), cyl(0.78, 0.55, 0.15, cab, h=0.12)] + window_slit(0.88, 0.8, 0.09, 0.09) + collars([0.55], 0.15, h=0.12)
    M += truss((0, 0.55, 0), (0, -0.7, 0), 0.05, r=0.011)
    cols = [(0.7, 0.35, 0.2), (0.25, 0.45, 0.65), (0.75, 0.65, 0.25), (0.35, 0.55, 0.35)]
    for k, y in enumerate((0.36, 0.1, -0.16, -0.42)):
        for s in (1, -1): M += [block((s * 0.15, y, 0.0), (0.085, 0.11, 0.08), paint(cols[(k + (s > 0)) % 4], k=0.35), sq=14)]
    M += box_turret(0, 0.62, 0.12, 1.0) + box_turret(0, -0.56, 0.06, 1.0)
    M += [block((0, -0.7, 0), (0.2, 0.04, 0.05), TRUSS, sq=10)]
    E, G = bells([0.14, -0.14], -0.72, 0, 0.08)
    return M + E, G, lights(M), 96

def talon():   # 825 Talon Strike Fighter -> Talon Type 0: straight wings with rocket pods and drop tanks, twin tails
    hull = paint((0.3, 0.33, 0.4), stripe=(-0.28, -0.15, (0.85, 0.3, 0.15)), k=0.35)
    M = [cone(1.0, 0.6, 0.12, hull, h=0.1), cyl(0.6, -0.7, 0.16, hull, h=0.12)] + collars([0.6, 0.0, -0.7], 0.16, h=0.12)
    M += window_slit(0.48, 0.32, 0.11, 0.07)
    M += mirror([wing((0.14, -0.1), 0, 0.5, 0.34, 0.28, 0.02, 0.035, hull, sq=8)])
    for s in (1, -1):
        M += [cyl(0.05, -0.3, 0.04, GUN, x=s * 0.44, z=-0.05), cone(0.15, 0.05, 0.04, DARK, x=s * 0.44, z=-0.05)]
        M += [cyl(-0.05, -0.32, 0.05, FOAM, x=s * 0.62, z=-0.03, taper=0.5)]
    M += mirror([fin(0.15, -0.55, 0.24, 0.26, 0.14, 0.1, 0.02, hull, z0=0.08)])
    E, G = bells([0.08, -0.08], -0.72, 0, 0.075)
    return M + E, G, lights(M), 58

def lighthouse():   # 826 Lighthouse Survey Cruiser -> Lighthouse Type 0: a great dish on the bow, masts, radiators
    hull = paint((0.84, 0.86, 0.9), stripe=(0.25, 0.35, (0.3, 0.75, 0.75)), k=0.3)
    M = [cyl(0.4, -0.8, 0.16, hull, h=0.13)] + collars([0.4, 0.0, -0.4, -0.8], 0.16, h=0.13)
    M += truss((0, 0.4, 0), (0, 0.66, 0), 0.04, bays=2) + dish((0, 0.74, 0.02), 0.26, face=1.35, depth=0.3)
    M += [block((0, 0.22, 0.14), (0.07, 0.1, 0.05), CERAMIC, sq=8)] + window_slit(0.3, 0.24, 0.17, 0.05, 0.012)
    M += [rod((0, -0.2, 0.13), (0, -0.2, 0.4), 0.01, TRUSS, ring=5)] + dish((0, -0.2, 0.42), 0.06, 0.0)
    M += mirror(panel((0.42, -0.42, 0), 0.22, 0.12, RAD, ribs=5)) + mirror([strut((0.15, -0.42, 0), (0.2, -0.42, 0))])
    E, G = bells([0.1, -0.1], -0.8, 0, 0.08)
    return M + E, G, lights(M), 92

def monarch():   # 827 Monarch Executive Yacht -> Monarch Type 0: a polished can with a long window band and gold foil
    hull = mat((0.9, 0.88, 0.82), metal=0.5, rough=0.25, panel=1.0, grime=0.8, windows=(-0.04, 0.05, (1.0, 0.82, 0.5), 30), stripe=(-0.62, -0.55, (0.85, 0.68, 0.25)))
    M = [cone(1.0, 0.62, 0.13, hull, h=0.09), cyl(0.62, -0.8, 0.15, hull, h=0.1, sq=2.4)] + collars([0.62, -0.8], 0.15, h=0.1, m=FOIL)
    M += [loft([(0.75, 0, 0.06, 0.0, 0.0, 2), (0.55, 0, 0.08, 0.07, 0.03, 3), (-0.35, 0, 0.08, 0.07, 0.03, 3), (-0.45, 0, 0.06, 0.02, 0.01, 3)], PANE, ring=12)]
    M += mirror([wing((0.12, -0.3), 0, 0.4, 0.42, 0.16, 0.38, 0.02, CERAMIC, sq=4)])
    M += mirror([cyl(-0.45, -0.75, 0.05, FOIL, x=0.2)])
    E, G = bells([0.07, -0.07], -0.82, 0, 0.065)
    return M + E, G, [light(0.52, -0.68, 0, LWHITE, 0.022), light(-0.52, -0.68, 0, LWHITE, 0.022)], 70

def aegis():   # 828 Aegis Escort Cruiser -> Aegis Type 0: spaced armour slabs hung off the sides, open flak mounts
    hull = paint((0.62, 0.66, 0.72), stripe=(0.05, 0.16, (0.25, 0.45, 0.85)), k=0.4)
    M = [cone(0.85, 0.55, 0.2, hull, h=0.12, sq=3), cyl(0.55, -0.8, 0.3, hull, h=0.15, sq=4)] + collars([0.55, 0.1, -0.35, -0.8], 0.3, h=0.15, m=DARK)
    M += [block((0, -0.05, 0.2), (0.1, 0.18, 0.06), CERAMIC, sq=8)] + window_slit(0.1, 0.03, 0.26, 0.06, 0.013)
    for x, y in ((0.18, 0.35), (-0.18, 0.35), (0.2, -0.35), (-0.2, -0.35), (0, -0.62)):
        M += box_turret(x, y, 0.15, 1.0, 2, 0.2)
    for s in (1, -1):
        for y in (0.3, -0.05, -0.4): M += [block((s * 0.44, y, 0), (0.025, 0.15, 0.13), DARK, sq=12), strut((s * 0.3, y, 0), (s * 0.42, y, 0), 0.012)]
    E, G = bells([0.2, 0.0, -0.2], -0.82, 0, 0.085)
    return M + E, G, lights(M), 120

def vigil():   # 829 Vigil Heavy Cruiser -> Vigil Type 0: an open coilgun spine of rings out to the bow, broadside mounts
    hull = paint((0.55, 0.58, 0.64), stripe=(0.3, 0.38, (0.85, 0.2, 0.15)), k=0.35)
    M = [cone(0.45, 0.25, 0.2, hull, h=0.12, sq=3), cyl(0.25, -0.88, 0.3, hull, h=0.16, sq=4)] + collars([0.25, -0.1, -0.45, -0.88], 0.3, h=0.16, m=DARK)
    M += truss((0, 0.25, 0.0), (0, 1.0, 0.0), 0.035, r=0.008)
    for k in range(7): M += [hoop(0.07, 0.016, FOIL if k % 2 else ALU, c=(0, 0.32 + k * 0.1, 0), tilt_x=math.pi / 2, n=22, k=6)]
    M += [block((0, -0.45, 0.2), (0.09, 0.16, 0.07), CERAMIC, sq=8)] + window_slit(-0.32, -0.4, 0.27, 0.06, 0.013)
    for y in (0.1, -0.2, -0.65):
        for s in (1, -1): M += box_turret(s * 0.2, y, 0.15, 1.0, 1, 0.22)
    M += mirror(panel((0.42, -0.5, 0), 0.1, 0.2, RAD, ribs=3))
    E, G = bells([0.2, 0.07, -0.07, -0.2], -0.9, 0, 0.07)
    return M + E, G, lights(M), 160


# key, name, descendant (original design key), descendant id, role, fn
PROTO = [
    ('proto_wren', 'Wren Type 0', 'wren1', 700, 'starter', wren),
    ('proto_gnat', 'Gnat Type 0', 'gnat', 703, 'skiff', gnat),
    ('proto_dory', 'Dory Type 0', 'dory', 704, 'hauler', dory),
    ('proto_kestrel', 'Kestrel Type 0', 'kestrel', 705, 'scout', kestrel),
    ('proto_mule', 'Mule Type 0', 'mule', 706, 'tender', mule),
    ('proto_wayfarer', 'Wayfarer Type 0', 'wayfarer', 707, 'explorer', wayfarer),
    ('proto_cutlass', 'Cutlass Type 0', 'cutlass', 708, 'interceptor', cutlass),
    ('proto_lacewing', 'Lacewing Type 0', 'lacewing', 709, 'sail yacht', lacewing),
    ('proto_crawler', 'Crawler Type 0', 'crawler', 710, 'ore crawler', crawler),
    ('proto_bramble', 'Bramble Type 0', 'bramble', 711, 'gunboat', bramble),
    ('proto_barge', 'Barge Type 0', 'barge', 712, 'longhaul barge', barge),
    ('proto_halberd', 'Halberd Type 0', 'halberd', 713, 'frigate', halberd),
    ('proto_pilgrim', 'Pilgrim Type 0', 'pilgrim', 714, 'liner', pilgrim),
    ('proto_hive', 'Hive Type 0', 'hive', 715, 'tender', hive),
    ('proto_tempest', 'Tempest Type 0', 'tempest', 716, 'destroyer', tempest),
    ('proto_bastion', 'Bastion Type 0', 'bastion', 717, 'dreadnought', bastion),
    ('proto_wasp', 'Wasp Type 0', 'wasp', 820, 'skirmisher', wasp),
    ('proto_swift', 'Swift Type 0', 'swift', 821, 'courier', swift),
    ('proto_pelican', 'Pelican Type 0', 'pelican', 822, 'salvage tug', pelican),
    ('proto_sabre', 'Sabre Type 0', 'sabre', 823, 'corvette', sabre),
    ('proto_caravel', 'Caravel Type 0', 'caravel', 824, 'trader', caravel),
    ('proto_talon', 'Talon Type 0', 'talon', 825, 'strike fighter', talon),
    ('proto_lighthouse', 'Lighthouse Type 0', 'lighthouse', 826, 'survey cruiser', lighthouse),
    ('proto_monarch', 'Monarch Type 0', 'monarch', 827, 'executive yacht', monarch),
    ('proto_aegis', 'Aegis Type 0', 'aegis', 828, 'escort cruiser', aegis),
    ('proto_vigil', 'Vigil Type 0', 'vigil', 829, 'heavy cruiser', vigil),
]
