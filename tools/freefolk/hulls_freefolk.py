"""Freefolk and Unsworn hulls for Part II, built on the Quantum Rift ship generator (tools/ships26).

FREEFOLK (9). Humans who live in Index stations and do repair, translation and archive work. Their ships are Type 0
hulls rebuilt with Index parts: bolted cans, trusses and rocket bells (hulls_proto) married to Index plate, black
housings, pistons, cable, amber eyes and Index thrusters (hulls_index). Every ship burns both: amber-white bells
beside Index amber. The paint is faded hand-painted ochre, moss and brick, with one sea-green band: the Freefolk mark.
None of them are warships; a few carry a point-defence turret. The fusion follows the Arc Raiders mix of salvaged
human kit around machine parts, and the Belters' weathered browns, greens and yellows in The Expanse.

  ff_tallow       Tallow        station shuttle: a Type 0 capsule riding an Index thruster pod
  ff_hawser       Hawser        dock tug: piston clamp arms, cable winches, a heavy push plate
  ff_interpreter  Interpreter   translator: a Type 0 hull carrying an Index eye cluster and a listening dish
  ff_mender       Mender        repair tender: four jointed Index arms around a workshop can
  ff_gleaner      Gleaner       salvager: an open cradle, a cutter arm and a winch, wreck parts aboard
  ff_ferryman     Ferryman      passage ship: hab cans with a hidden passenger hold behind cargo plating
  ff_drumbarge    Drumbarge     archive barge: glowing Index archive drums carried in a truss cradle
  ff_mercy        Mercy         hospital ship: white hab cans, Index sensor eyes, a docking ring for casualties
  ff_steading     Steading      family habitat ship: a spun ring of homes on an old Index hull, gardens under glass

UNSWORN (5 + 1). Refusers running covert routes. Low tech, stripped, and very, very fast: tiny crew spaces on
oversized drives, everything heavy pushed aft, no markings, matte soot paint, almost no lights. The look follows the
Razorback in The Expanse: a slim racing pinnace with almost no interior and its thrusters as far from the centre of
mass as they can go. Their only mark is a thin, dull red band.

  un_needle       Needle        courier: a capsule on one huge bell and two drop tanks
  un_hush         Hush          dark runner: a flat hull with shrouded bells and black heat louvres
  un_shrike       Shrike        escort: a needle hull with one gun and twin outrigger drives
  un_sparrow      Sparrow       passage boat: a long can for twelve passengers on a cluster of four bells
  un_smokejack    Smokejack     smuggling runner: cargo cans on a quick-release spine, a drive bigger than the ship
  un_commonhold   Commonhold    floating command centre: a hollowed ore rock, habitat cans dug in, antenna masts,
                                docking booms with runners alongside. From outside it looks like dead mining spoil.

+Y is the bow, +Z is up, hulls fit the unit circle. Each design returns (meshes, glow meshes, lights, sprite size)."""
import os, sys, math
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
sys.path.insert(1, os.path.join(HERE, '..', 'type0'))  # hulls_proto and render_nhal come from the Type 0 kit
import numpy as np
from hulls_proto import (mat, loft, sphere, block, wing, fin, rod, xf, mv, rotm, hoop, light, LRED, LGREEN, LWHITE,
                         CERAMIC, ALU, FOAM, TILE, FOIL, TRUSS, RAD, SOLAR, BELLM, DARK, GUN, PANE, BURN,
                         mirror, cyl, collars, cone, bell, bells, tank, truss, strut, panel, dish, box_turret, window_slit, whip, lights)
from hulls_index import PLATE, PLATE2, STEEL, RUST, ORE, CABLE, HOUSING, SENSOR, DATA, LAMB, lens, piston, cable, plate, bay, thruster

# ------------------------------------------------------------------ Freefolk materials
FF_GREEN = (0.24, 0.56, 0.46)                     # the Freefolk mark: one sea-green band
def ffpaint(c, band=None, windows=None, k=0.35):
    base = (0.66, 0.63, 0.56)
    col = tuple(a * (1 - k) + b * k for a, b in zip(c, base))
    return mat(col, metal=0.3, panel=1.6, rough=0.6, grime=1.8, stripe=band, windows=windows)
OCHRE, MOSS, BRICK, CREAM = (0.74, 0.58, 0.28), (0.4, 0.46, 0.3), (0.58, 0.32, 0.22), (0.86, 0.82, 0.72)
GLASSHOUSE = mat((0.5, 0.7, 0.5), metal=0.6, rough=0.15, glass=True, panel=0)
GARDEN = mat((0.42, 0.74, 0.38), emissive=(0.36, 0.7, 0.32))

def ixthr(xs, y, z, r):
    """Index thrusters (amber glow), for the fusion ships' second drive."""
    M, G = [], []
    for x in xs:
        m, g = thruster(x, y, z, r); M += m; G += g
    return M, G

# ------------------------------------------------------------------ Unsworn materials
SOOT = mat((0.21, 0.21, 0.22), metal=0.45, rough=0.7, panel=1.5, grime=1.2)
def soot(band=None, windows=None):
    return mat((0.25, 0.25, 0.26), metal=0.45, rough=0.7, panel=1.6, grime=1.3, stripe=band, windows=windows)
OATH = (0.42, 0.13, 0.11)                          # the thin, dull red band
LOUVRE = mat((0.06, 0.06, 0.07), metal=0.5, rough=0.6, panel=3.2, grime=0.2)
HOTBELL = mat((0.4, 0.36, 0.33), metal=0.9, rough=0.35, panel=0.0, grime=0.8)
RUN = mat((0.82, 0.9, 1.0), emissive=(0.74, 0.86, 1.0))   # a hot, pale drive: the brightest thing on them
DIMRED = mat((0.9, 0.2, 0.15), emissive=(0.8, 0.16, 0.12))

def fastbell(x, y, z, r, L=None):
    """An Unsworn drive bell: long, narrow at the throat, burning pale and hot."""
    L = L or r * 2.0
    noz = loft([(y + r * 0.3, x, z, r * 0.45, r * 0.45, 2), (y, x, z, r * 0.36, r * 0.36, 2), (y - L * 0.4, x, z, r * 0.58, r * 0.58, 2),
                (y - L * 0.75, x, z, r * 0.84, r * 0.84, 2), (y - L, x, z, r, r, 2)], HOTBELL, ring=16)
    g = [sphere((x, y - L + r * 0.2, z), r * 0.85, RUN, layer=1), sphere((x, y - L - r * 0.5, z), r * 0.55, RUN, layer=1)]
    return [noz], g
def fastbells(xs, y, z, r, L=None):
    M, G = [], []
    for x in xs:
        m, g = fastbell(x, y, z, r, L); M += m; G += g
    return M, G
def dimlights(*pts): return [light(x, y, z, DIMRED, 0.018) for x, y, z in pts]


# ================================================================== FREEFOLK
def ff_tallow():   # station shuttle
    hull = ffpaint(OCHRE, band=(0.1, 0.22, FF_GREEN))
    M = [cone(0.95, 0.55, 0.2, CERAMIC), cyl(0.55, -0.05, 0.22, hull)] + collars([0.55, -0.05], 0.22) + window_slit(0.78, 0.66, 0.1, 0.09)
    M += [loft([(-0.05, 0, 0, 0.26, 0.2, 6), (-0.45, 0, 0, 0.3, 0.22, 7), (-0.6, 0, 0, 0.22, 0.16, 5)], PLATE, ring=18)]   # the Index pod it rides
    M += lens((0, -0.3, 0.2), 0.05, look=(0, 0.3, 1)) + mirror([plate((0.3, -0.3, 0), (0.03, 0.13, 0.1), PLATE2)])
    M += cable((0.2, 0.2, 0.05), (0.27, -0.2, 0.08), 0.03, r=0.01) + cable((-0.2, 0.2, 0.05), (-0.27, -0.2, 0.08), 0.03, r=0.01)
    E1, G1 = bell(0, -0.62, 0, 0.12)
    E2, G2 = ixthr([0.24, -0.24], -0.55, 0, 0.06)
    return M + E1 + E2, G1 + G2, lights(M), 34

def ff_hawser():   # dock tug
    hull = ffpaint(MOSS, band=(0.25, 0.35, FF_GREEN))
    M = [block((0, 0.0, 0), (0.22, 0.34, 0.16), hull, sq=8), block((0, 0.4, 0), (0.3, 0.05, 0.18), STEEL, sq=10)]   # body, push plate
    M += [block((0, 0.12, 0.17), (0.11, 0.09, 0.06), CERAMIC, sq=8)] + window_slit(0.22, 0.16, 0.22, 0.08, 0.015)
    for s in (1, -1):
        M += piston((s * 0.24, 0.25, 0), (s * 0.42, 0.62, 0.02), 0.035) + piston((s * 0.42, 0.62, 0.02), (s * 0.24, 0.88, 0.02), 0.026)
        M += [block((s * 0.2, 0.92, 0.02), (0.035, 0.04, 0.06), STEEL, sq=6)]
        M += [cyl(-0.05, -0.25, 0.06, STEEL, x=s * 0.27, z=0.12, ring=12)] + cable((s * 0.27, -0.05, 0.12), (s * 0.3, 0.6, 0.03), 0.05, r=0.008)
    M += lens((0, 0.44, 0.15), 0.04)
    E1, G1 = bells([0.12, -0.12], -0.36, 0, 0.085)
    E2, G2 = ixthr([0.26, -0.26], -0.34, -0.06, 0.05)
    return M + E1 + E2, G1 + G2, lights(M), 56

def ff_interpreter():   # translator ship
    hull = ffpaint(CREAM, band=(-0.2, -0.1, FF_GREEN), k=0.25)
    M = [cone(1.0, 0.6, 0.13, CERAMIC), cyl(0.6, -0.7, 0.15, hull)] + collars([0.6, 0.15, -0.3, -0.7], 0.15) + window_slit(0.8, 0.7, 0.09, 0.07)
    M += [loft([(0.45, 0, 0.13, 0.1, 0.06, 6), (0.0, 0, 0.13, 0.12, 0.07, 6), (-0.2, 0, 0.13, 0.08, 0.05, 6)], PLATE, ring=16)]   # Index saddle
    for x, y, z, r in ((0, 0.42, 0.21, 0.05), (0.07, 0.3, 0.2, 0.035), (-0.07, 0.3, 0.2, 0.035), (0.05, 0.18, 0.2, 0.03), (-0.05, 0.18, 0.2, 0.03)):
        M += lens((x, y, z), r, look=(x * 3, 1, 0.5))
    M += dish((0, -0.25, 0.32), 0.15, face=0.4) + [strut((0, -0.25, 0.15), (0, -0.25, 0.22), 0.015)]
    M += mirror([rod((0.15, -0.45, 0), (0.55, -0.6, 0.0), 0.01, STEEL), sphere((0.55, -0.6, 0), 0.02, SENSOR)])
    M += mirror(panel((0.36, 0.05, 0), 0.16, 0.08, SOLAR, ribs=4)) + mirror([strut((0.15, 0.05, 0), (0.2, 0.05, 0))])
    E1, G1 = bell(0, -0.7, 0, 0.1)
    E2, G2 = ixthr([0.18, -0.18], -0.66, 0, 0.05)
    return M + E1 + E2, G1 + G2, lights(M), 70

def ff_mender():   # repair tender
    hull = ffpaint(OCHRE, band=(-0.35, -0.25, FF_GREEN))
    M = [cyl(0.55, -0.55, 0.24, hull, h=0.2)] + collars([0.55, 0.15, -0.2, -0.55], 0.24, h=0.2) + [cone(0.78, 0.55, 0.2, CERAMIC, h=0.16)]
    M += window_slit(0.7, 0.62, 0.14, 0.09) + [block((0, -0.05, 0.22), (0.14, 0.24, 0.04), PLATE, sq=8)]
    for s in (1, -1):
        for y0, z0 in ((0.4, 0.06), (0.05, -0.06)):
            j = (s * 0.5, y0 + 0.25, z0 + 0.04); t = (s * 0.3, y0 + 0.55, z0)
            M += piston((s * 0.22, y0, z0), j, 0.026) + piston(j, t, 0.02) + [sphere(t, 0.03, STEEL), rod(t, (t[0] * 0.9, t[1] + 0.08, t[2]), 0.009, GUN)]
        M += [block((s * 0.27, -0.3, 0), (0.04, 0.14, 0.12), STEEL, sq=6)] + bay((s * 0.31, -0.3, 0.0), s)
    M += lens((0, 0.82, 0.04), 0.045) + [whip((0.05, -0.4, 0.2), 0.18)]
    E1, G1 = bells([0.11, -0.11], -0.56, 0, 0.09)
    E2, G2 = ixthr([0.25, -0.25], -0.5, 0, 0.055)
    return M + E1 + E2, G1 + G2, lights(M, [(0, 0.8, 0.12)]), 84

def ff_gleaner():   # salvager
    hull = ffpaint(BRICK, band=(0.5, 0.6, FF_GREEN))
    M = [cone(1.0, 0.72, 0.13, hull, h=0.11), cyl(0.72, 0.42, 0.15, hull, h=0.12)] + window_slit(0.88, 0.78, 0.09, 0.08) + collars([0.42], 0.15, h=0.12)
    M += truss((0.2, 0.42, 0), (0.2, -0.65, 0), 0.04) + truss((-0.2, 0.42, 0), (-0.2, -0.65, 0), 0.04)
    M += [block((0, 0.42, 0), (0.25, 0.03, 0.06), STEEL, sq=10), block((0, -0.65, 0), (0.25, 0.03, 0.06), STEEL, sq=10)]
    # salvage in the cradle: a broken hull section and plating
    M += [xf(cyl(0.2, -0.3, 0.11, RUST, ring=12), rotm('z', 0.18)), plate((0.03, -0.42, 0.06), (0.08, 0.06, 0.012), PLATE2, rz=0.5)]
    M += piston((0.22, 0.3, 0.05), (0.45, 0.6, 0.12), 0.03) + piston((0.45, 0.6, 0.12), (0.25, 0.88, 0.06), 0.022) + [loft([(0.97, 0.22, 0.05, 0.004, 0.004, 2), (0.86, 0.24, 0.06, 0.04, 0.04, 2)], STEEL, ring=10)]
    M += cable((-0.22, 0.38, 0.06), (-0.05, -0.2, 0.12), 0.04, r=0.009) + [cyl(0.42, 0.32, 0.05, STEEL, x=-0.22, z=0.06, ring=10)]
    M += lens((-0.2, 0.42, 0.08), 0.035)
    E1, G1 = bells([0.2, -0.2], -0.68, 0, 0.08)
    E2, G2 = ixthr([0.0], -0.66, 0, 0.06)
    return M + E1 + E2, G1 + G2, lights(M), 96

def ff_ferryman():   # passage ship: a hidden passenger hold behind cargo plating
    hab = ffpaint(MOSS, band=(0.55, 0.62, FF_GREEN), windows=(-0.05, 0.05, (1.0, 0.8, 0.45), 14))
    M = [cone(1.0, 0.72, 0.16, CERAMIC), cyl(0.72, 0.25, 0.2, hab)] + collars([0.72, 0.25], 0.2) + window_slit(0.86, 0.78, 0.1, 0.09)
    M += [loft([(0.25, 0, 0, 0.26, 0.2, 7), (-0.55, 0, 0, 0.26, 0.2, 7)], PLATE, ring=20)]           # Index cargo hull: the hidden hold
    for y in (0.1, -0.12, -0.34): M += mirror([plate((0.26, y, 0), (0.012, 0.09, 0.13), PLATE2)])
    M += [block((0, -0.15, 0.2), (0.06, 0.25, 0.012), HOUSING, sq=4)] + mirror([sphere((0.06, y, 0.205), 0.012, SENSOR) for y in (0.05, -0.15, -0.35)])
    M += mirror([cyl(0.2, -0.45, 0.06, FOAM, x=0.34, z=-0.04)]) + mirror([strut((0.25, -0.1, -0.02), (0.29, -0.1, -0.03))])
    M += lens((0, 0.25, 0.2), 0.04)
    E1, G1 = bells([0.12, -0.12], -0.58, 0, 0.09)
    E2, G2 = ixthr([0.34, -0.34], -0.5, -0.04, 0.05)
    return M + E1 + E2, G1 + G2, lights(M), 110

def ff_drumbarge():   # archive barge
    cab = ffpaint(CREAM, band=(0.62, 0.7, FF_GREEN), k=0.3)
    M = [cone(1.0, 0.82, 0.14, cab, h=0.12), cyl(0.82, 0.66, 0.15, cab, h=0.13)] + window_slit(0.92, 0.85, 0.09, 0.09)
    M += truss((0, 0.66, 0.0), (0, -0.82, 0.0), 0.06, r=0.011)
    G = []
    for y in (0.42, 0.04, -0.34):
        for s in (1, -1):
            x = s * 0.2
            M += [loft([(y + 0.15, x, 0, 0.078, 0.078, 2), (y - 0.15, x, 0, 0.078, 0.078, 2)], DATA, ring=16)]   # archive core
            for a, b in ((0.15, 0.055), (-0.055, -0.15)):                                        # sleeves; the core shows between
                M += [loft([(y + a, x, 0, 0.09, 0.09, 2), (y + b, x, 0, 0.09, 0.09, 2)], PLATE2, ring=16)]
            for a, b in ((0.045, -0.045),):
                G += [loft([(y + a, x, 0, 0.08, 0.08, 2), (y + b, x, 0, 0.08, 0.08, 2)], DATA, ring=16, layer=1)]
            M += [strut((s * 0.06, y, 0), (s * 0.09, y, 0), 0.016)]
    M += [block((0, -0.6, 0.0), (0.3, 0.05, 0.06), PLATE, sq=8)] + lens((0, -0.6, 0.08), 0.04, look=(0, 0.3, 1))
    E1, G1 = bells([0.13, -0.13], -0.84, 0, 0.085)
    E2, G2 = ixthr([0.32, -0.32], -0.66, 0, 0.055)
    return M + E1 + E2, G + G1 + G2, lights(M), 130

def ff_mercy():   # hospital ship
    hab = mat((0.9, 0.9, 0.88), metal=0.3, panel=1.4, rough=0.5, grime=1.2, stripe=(-0.05, 0.05, FF_GREEN), windows=(0.12, 0.2, (1.0, 0.9, 0.7), 16))
    M = [cone(1.0, 0.7, 0.18, hab)]
    for y0, y1 in ((0.7, 0.3), (0.26, -0.14), (-0.18, -0.58)): M += [cyl(y0, y1, 0.22, hab)] + collars([y0, y1], 0.22)
    M += window_slit(0.85, 0.77, 0.12, 0.1)
    M += [hoop(0.36, 0.03, PLATE, c=(0, 0.06, 0), tilt_x=0.0, n=48, k=8)] + mirror([strut((0.22, 0.06, 0), (0.33, 0.06, 0), 0.016)]) + [strut((0, 0.06, 0.22), (0, 0.06, 0.33), 0.016)]
    for a in range(4):   # docking collars round the ring, for casualty boats
        ang = a * math.pi / 2 + math.pi / 4
        M += [sphere((0.36 * math.cos(ang), 0.06, 0.36 * math.sin(ang)), 0.04, STEEL)]
    M += lens((0.0, 0.5, 0.21), 0.04, look=(0, 0.4, 1)) + lens((0.0, -0.36, 0.21), 0.04, look=(0, 0.4, 1))
    M += mirror(panel((0.42, -0.4, 0), 0.12, 0.1, RAD, ribs=3)) + mirror([strut((0.22, -0.4, 0), (0.3, -0.4, 0))])
    E1, G1 = bells([0.1, -0.1], -0.6, 0, 0.085)
    E2, G2 = ixthr([0.22, -0.22], -0.6, 0, 0.05)
    return M + E1 + E2, G1 + G2, lights(M, [(0, 1.0, 0.03)]), 140

def ff_steading():   # family habitat ship: homes on a spun ring round an old Index hull, gardens under glass
    M = [loft([(0.85, 0, 0, 0.05, 0.05, 4), (0.55, 0, 0, 0.17, 0.13, 6), (-0.4, 0, 0, 0.2, 0.15, 7), (-0.7, 0, 0, 0.14, 0.11, 5)], PLATE, ring=20)]
    M += lens((0, 0.8, 0.03), 0.05) + [block((0, -0.1, 0.15), (0.07, 0.3, 0.02), HOUSING, sq=4)]
    G = []
    M += [hoop(0.62, 0.035, STEEL, c=(0, 0.05, 0), tilt_x=0.0, n=64, k=8)]
    cols = [OCHRE, MOSS, BRICK, CREAM]
    for a in range(12):
        ang = a * math.pi / 6; cx, cz = 0.62 * math.cos(ang), 0.62 * math.sin(ang)
        if a % 3 == 0:   # glasshouse
            M += [xf(block((0, 0, 0), (0.09, 0.075, 0.05), GLASSHOUSE, sq=6), rotm('y', -ang), t=(cx, 0.05, cz))]
            G += [sphere((cx, 0.05, cz), 0.06, GARDEN, layer=1)]
        else:
            M += [xf(block((0, 0, 0), (0.085, 0.07, 0.05), ffpaint(cols[a % 4], k=0.4), sq=8), rotm('y', -ang), t=(cx, 0.05, cz))]
        if a % 2 == 0: M += [strut((0.18 * math.cos(ang), 0.05, 0.14 * math.sin(ang)), (0.56 * math.cos(ang), 0.05, 0.56 * math.sin(ang)), 0.012)]
    M += [hoop(0.18, 0.025, FOIL, c=(0, 0.05, 0), tilt_x=0.0, n=32, k=6)]
    M += [cyl(0.5, 0.25, 0.08, ffpaint(CREAM, band=(0.3, 0.4, FF_GREEN), k=0.3), z=0.17)] + window_slit(0.48, 0.42, 0.24, 0.05, 0.012)
    M += mirror([cyl(-0.3, -0.62, 0.08, FOAM, x=0.24)]) + mirror([strut((0.17, -0.45, 0), (0.18, -0.45, 0))])
    E1, G1 = bells([0.24, -0.24], -0.64, 0, 0.08)
    E2, G2 = ixthr([0.08, -0.08], -0.74, 0, 0.07)
    return M + E1 + E2, G + G1 + G2, lights(M), 180


# ================================================================== UNSWORN
def un_needle():   # courier: a capsule on one huge bell and two drop tanks
    hull = soot(band=(0.32, 0.36, OATH))
    M = [cone(1.0, 0.6, 0.075, hull), cyl(0.6, -0.15, 0.09, hull), cyl(-0.15, -0.3, 0.16, SOOT, taper=0.55)] + window_slit(0.62, 0.52, 0.06, 0.04, 0.012)
    M += mirror([cyl(0.25, -0.2, 0.045, SOOT, x=0.14, taper=0.5)]) + mirror([strut((0.07, 0.0, 0), (0.1, 0.0, 0), 0.01)])
    M += [hoop(0.1, 0.012, ALU, c=(0, -0.3, 0), tilt_x=0.0)]
    E, G = fastbell(0, -0.3, 0, 0.12, L=0.6)
    return M + E, G, dimlights((0, -0.15, 0.09)), 40

def un_hush():   # dark runner: a flat hull, shrouded bells, black heat louvres
    hull = soot(band=(0.45, 0.48, OATH))
    M = [loft([(1.0, 0, 0, 0.02, 0.01, 1.2), (0.55, 0, 0, 0.16, 0.035, 1.2), (0.0, 0, 0, 0.3, 0.05, 1.2), (-0.5, 0, 0, 0.36, 0.055, 1.2), (-0.62, 0, 0, 0.34, 0.045, 1.2)], hull, ring=8)]
    M += window_slit(0.5, 0.4, 0.04, 0.05, 0.01)
    for y in (0.1, -0.08, -0.26): M += mirror([block((0.18, y, 0.05), (0.08, 0.06, 0.006), LOUVRE, sq=12)])
    for s in (1, -1): M += [loft([(-0.35, s * 0.17, 0, 0.1, 0.06, 3), (-0.72, s * 0.17, 0, 0.11, 0.065, 3)], SOOT, ring=14)]   # bell shrouds
    E, G = fastbells([0.17, -0.17], -0.6, 0, 0.07, L=0.2)
    return M + E, G, dimlights((0.3, -0.5, 0.0), (-0.3, -0.5, 0.0)), 52

def un_shrike():   # escort: a needle hull with one gun and twin outrigger drives
    hull = soot(band=(0.2, 0.24, OATH))
    M = [cone(1.0, 0.55, 0.07, hull), cyl(0.55, -0.45, 0.085, hull)] + window_slit(0.45, 0.36, 0.06, 0.04, 0.012)
    M += [rod((0, 0.2, -0.07), (0, 1.0, -0.07), 0.014, GUN, ring=6), block((0, 0.15, -0.07), (0.025, 0.08, 0.02), DARK)]
    M += [loft([(-0.15, 0, 0, 0.42, 0.012, 1.2), (-0.32, 0, 0, 0.42, 0.012, 1.2)], SOOT, ring=4)]                 # cross beam
    for s in (1, -1): M += [cyl(-0.05, -0.38, 0.06, SOOT, x=s * 0.42, taper=0.5)]
    E1, G1 = fastbells([0.42, -0.42], -0.38, 0, 0.075, L=0.26)
    E2, G2 = fastbell(0, -0.45, 0, 0.08, L=0.25)
    return M + E1 + E2, G1 + G2, dimlights((0.42, -0.1, 0.05), (-0.42, -0.1, 0.05)), 48

def un_sparrow():   # passage boat: a long can for twelve passengers on four bells
    hull = soot(band=(0.62, 0.65, OATH), windows=(0.02, 0.06, (0.9, 0.55, 0.3), 12))
    M = [cone(1.0, 0.7, 0.1, hull), cyl(0.7, -0.4, 0.12, hull)] + collars([0.7, 0.15, -0.4], 0.12, m=SOOT) + window_slit(0.82, 0.74, 0.07, 0.05, 0.012)
    M += [loft([(-0.4, 0, 0, 0.12, 0.12, 2), (-0.5, 0, 0, 0.22, 0.2, 3)], SOOT, ring=16)]
    M += mirror([cyl(0.35, -0.25, 0.04, SOOT, x=0.16, taper=0.5)])
    E, G = fastbells([0.1, -0.1], -0.5, 0.08, 0.085, L=0.38)
    E2, G2 = fastbells([0.1, -0.1], -0.5, -0.08, 0.085, L=0.38)
    return M + E + E2, G + G2, dimlights((0, -0.35, 0.12)), 70

def un_smokejack():   # smuggling runner: cargo cans on a quick-release spine, a drive bigger than the ship
    hull = soot(band=(0.75, 0.79, OATH))
    M = [cone(1.0, 0.72, 0.09, hull), cyl(0.72, 0.5, 0.1, hull)] + window_slit(0.85, 0.77, 0.07, 0.05, 0.012)
    M += [rod((0, 0.5, 0), (0, -0.25, 0), 0.03, DARK, ring=8)]
    for y in (0.36, 0.1, -0.16):
        for s in (1, -1): M += [cyl(y + 0.1, y - 0.1, 0.075, SOOT, x=s * 0.12)] + [block((s * 0.05, y, 0), (0.02, 0.02, 0.02), DARK)]
    M += [loft([(-0.2, 0, 0, 0.1, 0.1, 2), (-0.32, 0, 0, 0.14, 0.14, 2)], SOOT, ring=18)]
    M += mirror(panel((0.32, -0.25, 0.0), 0.08, 0.05, LOUVRE, ribs=3))
    M += [hoop(0.13, 0.014, ALU, c=(0, -0.32, 0), tilt_x=0.0)]
    E, G = fastbell(0, -0.32, 0, 0.16, L=0.6)
    return M + E, G, dimlights((0, 0.4, 0.1)), 86

def _rock(c, r, seed, m=ORE):
    """A lumpy spoil rock from overlapping squashed spheres."""
    rng = np.random.default_rng(seed); out = []
    for _ in range(9):
        d = rng.normal(size=3); d /= np.linalg.norm(d)
        p = np.array(c) + d * r * rng.uniform(0.25, 0.55) * np.array([1, 1, 0.6])
        out.append(sphere(tuple(p), r * rng.uniform(0.45, 0.7), m, squash=rng.uniform(0.55, 0.8)))
    return out

HANGLIGHT = mat((1.0, 0.7, 0.4), emissive=(0.9, 0.6, 0.3))
DARKORE = mat((0.26, 0.23, 0.21), metal=0.15, rough=0.85, panel=0.3, grime=1.2)

def un_commonhold():   # floating command centre, disguised as dead mining spoil
    M = _rock((0, 0.05, -0.05), 0.55, 7, DARKORE) + _rock((0.3, -0.42, -0.06), 0.25, 11, DARKORE) + _rock((-0.32, 0.35, -0.08), 0.2, 5, DARKORE)
    # a cut trench along the top, lined with habitat cans and their lit windows
    M += [block((0.0, -0.05, 0.27), (0.14, 0.42, 0.03), SOOT, sq=10)]
    hab = soot(windows=(-0.03, 0.03, (1.0, 0.65, 0.35), 10))
    for y in (0.24, 0.0, -0.24): M += [cyl(y + 0.1, y - 0.1, 0.075, hab, z=0.33)] + collars([y + 0.1, y - 0.1], 0.075, z=0.33, m=ALU)
    # hangar mouth with the work lights on inside
    M += [loft([(0.66, 0, -0.02, 0.17, 0.11, 3), (0.5, 0, -0.02, 0.14, 0.09, 3)], HOUSING, ring=16)]
    G = [sphere((0, 0.6, -0.02), 0.08, HANGLIGHT, layer=1)]
    for (x, y, h) in ((0.15, 0.1, 0.62), (-0.12, -0.32, 0.52), (-0.2, 0.25, 0.46), (0.22, -0.3, 0.48)):   # antenna masts
        M += [rod((x, y, 0.28), (x, y, h), 0.012, TRUSS, ring=5), rod((x - 0.07, y, h * 0.85), (x + 0.07, y, h * 0.85), 0.006, TRUSS, ring=4)]
    M += dish((0.3, 0.12, 0.34), 0.12, face=0.5, m=ALU) + dish((-0.3, -0.05, 0.3), 0.09, face=0.9, m=ALU)
    for s in (1, -1):   # docking booms, each with two runners moored alongside
        M += truss((s * 0.4, 0.1, -0.02), (s * 0.92, 0.1, -0.02), 0.03, bays=5)
        for k, nx in enumerate((s * 0.62, s * 0.86)):
            ny = 0.25 if k == 0 else 0.22
            M += [cone(ny + 0.18, ny + 0.02, 0.035, soot(band=(ny + 0.08, ny + 0.1, OATH)), x=nx), cyl(ny + 0.02, ny - 0.12, 0.04, soot(), x=nx),
                  loft([(ny - 0.12, nx, 0, 0.03, 0.03, 2), (ny - 0.2, nx, 0, 0.055, 0.055, 2)], HOTBELL, ring=12), strut((nx, ny - 0.1, 0), (nx, 0.1, -0.02), 0.008)]
    M += truss((0.0, -0.45, -0.08), (0.0, -0.9, -0.08), 0.03, bays=3)
    M += [cyl(-0.7, -0.88, 0.09, soot(band=(-0.8, -0.76, OATH)), z=-0.08)]
    E, G2 = fastbells([0.12, -0.12], -0.88, -0.08, 0.08, L=0.14)
    return M + E, G + G2, dimlights((0.92, 0.1, 0.0), (-0.92, 0.1, 0.0)), 260


FREEFOLK = [
    ('ff_tallow', 'Tallow', 'station shuttle', ff_tallow),
    ('ff_hawser', 'Hawser', 'dock tug', ff_hawser),
    ('ff_interpreter', 'Interpreter', 'translator', ff_interpreter),
    ('ff_mender', 'Mender', 'repair tender', ff_mender),
    ('ff_gleaner', 'Gleaner', 'salvager', ff_gleaner),
    ('ff_ferryman', 'Ferryman', 'passage ship', ff_ferryman),
    ('ff_drumbarge', 'Drumbarge', 'archive barge', ff_drumbarge),
    ('ff_mercy', 'Mercy', 'hospital ship', ff_mercy),
    ('ff_steading', 'Steading', 'family habitat ship', ff_steading),
]
UNSWORN = [
    ('un_needle', 'Needle', 'courier', un_needle),
    ('un_hush', 'Hush', 'dark runner', un_hush),
    ('un_shrike', 'Shrike', 'escort', un_shrike),
    ('un_sparrow', 'Sparrow', 'passage boat', un_sparrow),
    ('un_smokejack', 'Smokejack', 'smuggling runner', un_smokejack),
    ('un_commonhold', 'Commonhold', 'floating command centre', un_commonhold),
]
ALL = FREEFOLK + UNSWORN
