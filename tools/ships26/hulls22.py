"""Quantum Rift 2.3: ten new common Quantum hulls, filling the gaps in the Concord yards.
Coordinates: +y is the nose, x is lateral, z is up; hulls fit roughly inside the unit circle.
Each design returns (meshes, glow meshes, lights, sprite size)."""
import math
from render2 import mat, loft, torus, block, sphere, wing, fin, pair
from hulls2 import DESIGNS, engine, light, greebles, fuse, lights_std, LRED, LGREEN, LWHITE, GLASS, DARK, GUNM, GBLUE, GRED, GTEAL, GAMBER
from hulls5 import rod, hoop, slab

CONCORD = (0.84, 0.86, 0.9)   # Concord white-grey with blue trim, the house style of the common yards
def eng(xs, y, z, r, glow, dark=DARK):
    E, G = [], []
    for x in xs: e, g = engine(x, y, z, r, glow, dark); E += e; G += g
    return E, G

def wasp():   # 820 Wasp Skirmisher: a stubby, cheap fighter; one big engine, two cheek guns, yellow hazard stripes
    hull = mat((0.86, 0.72, 0.22), metal=0.4, panel=1.1, grime=1.2, stripe=(-0.35, -0.2, (0.12, 0.12, 0.14)))
    M = [fuse([(0.9, 0, 0, 0, 2), (0.6, 0.13, 0.1, 0, 2.2), (0.0, 0.22, 0.15, 0.01, 2.4), (-0.55, 0.2, 0.14, 0, 2.4), (-0.8, 0.14, 0.1, 0, 2)], hull)]
    M += [loft([(0.55, 0, 0.1, 0, 0, 2), (0.42, 0, 0.13, 0.09, 0.06, 2), (0.15, 0, 0.13, 0.09, 0.06, 2), (0.05, 0, 0.1, 0.04, 0.03, 2)], GLASS, ring=12)]
    M += pair(wing((0.18, -0.25), 0, 0.42, 0.42, 0.18, 0.12, 0.04, hull, dihedral=-0.05))
    M += pair(block((0.2, 0.45, -0.04), (0.025, 0.2, 0.025), GUNM))
    E, G = eng([0], -0.86, 0, 0.13, GAMBER)
    return M + E, G, lights_std(0.6, -0.4, 0), 34

def swift():   # 821 Swift Courier: a needle with a cargo pod slung under its belly and long outrigger engines
    hull = mat(CONCORD, metal=0.5, rough=0.25, stripe=(0.2, 0.35, (0.2, 0.45, 0.85)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.7, 0.07, 0.07, 0, 2), (0.1, 0.11, 0.1, 0.02, 2.3), (-0.6, 0.1, 0.09, 0.02, 2.3), (-0.85, 0.07, 0.07, 0, 2)], hull)]
    M += [loft([(0.6, 0, 0.07, 0, 0, 2), (0.45, 0, 0.09, 0.05, 0.04, 2), (0.2, 0, 0.09, 0.05, 0.04, 2), (0.1, 0, 0.07, 0.02, 0.02, 2)], GLASS, ring=10)]
    M += [block((0, -0.1, -0.12), (0.12, 0.35, 0.07), mat((0.45, 0.5, 0.56), metal=0.6, panel=1.6, grime=1.2), sq=6)]
    M += pair(wing((0.08, -0.35), 0, 0.42, 0.32, 0.16, 0.18, 0.02, hull))
    M += pair(loft([(0.0, 0.42, 0, 0.05, 0.05, 2), (-0.75, 0.42, 0, 0.06, 0.06, 2.4), (-0.85, 0.42, 0, 0.04, 0.04, 2)], DARK, ring=12))
    E, G = eng([0.42, -0.42], -0.88, 0, 0.06, GBLUE)
    return M + E, G, lights_std(0.5, -0.45, 0), 48

def pelican():   # 822 Pelican Salvage Tug: a squat cab, two grapple arms ahead, a towing frame behind
    hull = mat((0.72, 0.5, 0.2), metal=0.5, panel=1.4, grime=2.0, stripe=(0.0, 0.1, (0.1, 0.1, 0.1)))
    frame = mat((0.35, 0.36, 0.38), metal=0.8, panel=0.4, grime=1.4)
    M = [loft([(0.55, 0, 0.0, 0.2, 0.16, 4), (0.25, 0, 0.0, 0.3, 0.2, 5), (-0.15, 0, 0.0, 0.3, 0.2, 5), (-0.35, 0, 0, 0.22, 0.15, 4)], hull, ring=18)]
    M += [loft([(0.52, 0, 0.12, 0.12, 0.05, 3), (0.38, 0, 0.17, 0.14, 0.05, 3)], GLASS, ring=12)]
    for s in (1, -1):
        M += [rod((s * 0.22, 0.4, 0), (s * 0.34, 0.75, 0), 0.04, frame), rod((s * 0.34, 0.75, 0), (s * 0.18, 0.95, 0), 0.03, frame), sphere((s * 0.18, 0.96, 0), 0.04, GAMBER)]
        M += [rod((s * 0.25, -0.3, 0), (s * 0.25, -0.85, 0), 0.025, frame)]
    M += [rod((0.25, -0.85, 0), (-0.25, -0.85, 0), 0.025, frame), rod((0.25, -0.6, 0), (-0.25, -0.6, 0), 0.02, frame)]
    E, G = eng([0.14, -0.14], -0.42, 0, 0.08, GAMBER)
    return M + E + greebles(822, 10, ((-0.25, 0.25), (-0.3, 0.4)), DARK, zfn=lambda x, y: 0.2), G, lights_std(0.4, 0.2, 0), 60

def sabre():   # 823 Sabre Corvette: a sleek wedge with a dorsal turret and swept fins; the yards' all-rounder
    hull = mat(CONCORD, metal=0.55, panel=1.2, stripe=(-0.05, 0.1, (0.2, 0.4, 0.8)))
    M = [loft([(1.0, 0, 0, 0.03, 0.02, 2), (0.6, 0, 0, 0.22, 0.09, 3), (0.0, 0, 0, 0.42, 0.13, 3.5), (-0.6, 0, 0, 0.48, 0.12, 4), (-0.8, 0, 0, 0.42, 0.09, 4)], hull, ring=22)]
    M += [loft([(0.5, 0, 0.1, 0, 0, 2), (0.35, 0, 0.13, 0.07, 0.05, 2), (0.05, 0, 0.13, 0.08, 0.05, 2), (-0.05, 0, 0.11, 0.04, 0.03, 2)], GLASS, ring=12)]
    M += [sphere((0, -0.25, 0.14), 0.09, GUNM, squash=0.6), rod((0, -0.25, 0.17), (0, 0.05, 0.17), 0.018, GUNM)]
    M += pair(fin(0.38, -0.55, 0.2, 0.3, 0.12, 0.18, 0.02, hull, z0=0.05))
    M += pair(block((0.3, 0.2, -0.02), (0.02, 0.22, 0.02), GUNM))
    E, G = eng([0.2, -0.2, 0.0], -0.82, 0, 0.08, GBLUE)
    return M + E + greebles(823, 12, ((-0.35, 0.35), (-0.6, 0.0)), DARK, zfn=lambda x, y: 0.11), G, lights_std(0.7, -0.6, 0), 62

def caravel():   # 824 Caravel Trader: an armed merchantman; a long cargo spine with container racks and two turrets
    hull = mat((0.76, 0.78, 0.74), metal=0.4, panel=1.3, grime=1.5, stripe=(0.55, 0.65, (0.2, 0.45, 0.8)))
    M = [loft([(0.95, 0, 0.05, 0.12, 0.1, 3), (0.75, 0, 0.05, 0.2, 0.15, 4), (0.5, 0, 0.05, 0.2, 0.15, 4)], hull, ring=16)]
    M += [loft([(0.85, 0, 0.13, 0.12, 0.04, 3), (0.72, 0, 0.17, 0.13, 0.04, 3)], GLASS, ring=12)]
    M += [block((0, -0.15, 0), (0.06, 0.65, 0.06), DARK, sq=4)]
    cols = [(0.7, 0.35, 0.2), (0.25, 0.45, 0.65), (0.75, 0.65, 0.25), (0.35, 0.55, 0.35)]
    for k, y in enumerate((0.35, 0.1, -0.15, -0.4)):
        for s in (1, -1): M += [block((s * 0.16, y, 0.0), (0.09, 0.1, 0.08), mat(cols[(k + (s > 0)) % 4], metal=0.3, panel=2.0, grime=1.4), sq=8)]
    for y in (0.45, -0.55): M += [sphere((0, y, 0.12), 0.07, GUNM, squash=0.6), rod((0, y, 0.14), (0, y + 0.18, 0.14), 0.015, GUNM)]
    M += [block((0, -0.72, 0), (0.22, 0.1, 0.12), hull)]
    E, G = eng([0.14, -0.14], -0.84, 0, 0.08, GAMBER)
    return M + E, G, lights_std(0.3, -0.7, 0), 96

def talon():   # 825 Talon Strike Fighter: a heavy fighter; forward-swept wings with rocket pods, twin tails
    hull = mat((0.3, 0.33, 0.4), metal=0.7, panel=1.1, stripe=(-0.25, -0.1, (0.85, 0.3, 0.15)))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.6, 0.1, 0.08, 0, 2.2), (0.0, 0.17, 0.12, 0.01, 2.4), (-0.6, 0.16, 0.11, 0, 2.4), (-0.85, 0.11, 0.08, 0, 2.2)], hull)]
    M += [loft([(0.6, 0, 0.09, 0, 0, 2), (0.45, 0, 0.12, 0.07, 0.05, 2), (0.15, 0, 0.12, 0.07, 0.05, 2), (0.0, 0, 0.09, 0.03, 0.02, 2)], GLASS, ring=12)]
    M += pair(wing((0.14, -0.3), 0, 0.62, 0.42, 0.2, -0.22, 0.035, hull))
    for s in (1, -1):
        M += [loft([(0.15, s * 0.5, -0.03, 0.045, 0.045, 2), (-0.25, s * 0.5, -0.03, 0.05, 0.05, 2.2), (-0.35, s * 0.5, -0.03, 0.035, 0.035, 2)], GUNM, ring=10)]
        M += [sphere((s * 0.5, 0.16, -0.03), 0.03, GRED)]
    M += pair(fin(0.16, -0.7, 0.22, 0.24, 0.1, 0.12, 0.02, hull, z0=0.08))
    E, G = eng([0.09, -0.09], -0.88, 0, 0.075, GRED)
    return M + E, G, lights_std(0.78, -0.35, 0), 58

def lighthouse():   # 826 Lighthouse Survey Cruiser: a long hull behind a great rotating sensor dome and a halo array
    hull = mat(CONCORD, metal=0.5, panel=1.0, stripe=(0.3, 0.4, (0.3, 0.75, 0.75)))
    M = [fuse([(0.55, 0, 0, 0, 2), (0.35, 0.14, 0.12, 0, 2.4), (-0.4, 0.18, 0.14, 0, 2.6), (-0.85, 0.13, 0.11, 0, 2.4)], hull)]
    M += [sphere((0, 0.72, 0.02), 0.2, mat((0.7, 0.9, 1.0), metal=0.15, rough=0.35, panel=0, grime=0, emissive=(0.18, 0.32, 0.42)))]
    M += [hoop(0.32, 0.018, mat((0.4, 1.0, 0.9), emissive=(0.35, 0.9, 0.85)), c=(0, 0.72, 0.02), tilt_x=0.0)]
    M += [rod((0, 0.35, 0.0), (0, 0.55, 0.0), 0.06, hull)]
    M += pair(wing((0.15, -0.35), 0, 0.38, 0.4, 0.2, 0.2, 0.03, hull))
    for s in (1, -1): M += [rod((s * 0.45, -0.5, 0.0), (s * 0.45, -0.1, 0.0), 0.03, GUNM), sphere((s * 0.45, -0.08, 0), 0.035, GTEAL)]
    M += [loft([(0.3, 0, 0.12, 0, 0, 2), (0.18, 0, 0.15, 0.07, 0.04, 2), (-0.05, 0, 0.15, 0.07, 0.04, 2)], GLASS, ring=10)]
    E, G = eng([0.1, -0.1], -0.9, 0, 0.08, GTEAL)
    return M + E + greebles(826, 10, ((-0.15, 0.15), (-0.8, -0.1)), DARK, zfn=lambda x, y: 0.15), G, lights_std(0.55, -0.5, 0), 92

def monarch():   # 827 Monarch Executive Yacht: an elegant white-and-gold sliver with a long observation canopy
    hull = mat((0.95, 0.94, 0.9), metal=0.45, rough=0.15, panel=0.5, grime=0.1, stripe=(-0.1, 0.0, (0.85, 0.68, 0.25)))
    gold = mat((0.9, 0.72, 0.3), metal=0.95, rough=0.2, panel=0.2, grime=0)
    M = [fuse([(1.0, 0, 0, 0, 2), (0.65, 0.1, 0.07, 0, 2.2), (0.0, 0.17, 0.1, 0.01, 2.6), (-0.6, 0.15, 0.09, 0, 2.6), (-0.9, 0.08, 0.06, 0, 2.2)], hull)]
    M += [loft([(0.7, 0, 0.06, 0, 0, 2), (0.5, 0, 0.09, 0.07, 0.04, 2), (-0.3, 0, 0.09, 0.08, 0.04, 2), (-0.45, 0, 0.07, 0.03, 0.02, 2)], GLASS, ring=12)]
    M += pair(wing((0.12, -0.2), 0, 0.5, 0.55, 0.18, 0.45, 0.02, hull, sq=3))
    M += pair(rod((0.12, 0.3, 0.0), (0.58, -0.35, 0.0), 0.012, gold))
    M += [rod((0, 0.9, 0.0), (0, -0.85, 0.08), 0.01, gold)]
    E, G = eng([0.08, -0.08], -0.92, 0, 0.06, mat((1, 0.85, 0.5), emissive=(1.0, 0.82, 0.45)))
    return M + E, G, [light(0.6, -0.36, 0, LWHITE, 0.025), light(-0.6, -0.36, 0, LWHITE, 0.025)], 70

def aegis():   # 828 Aegis Escort Cruiser: a shield-wall hull studded with flak turrets, built to guard convoys
    hull = mat((0.62, 0.66, 0.72), metal=0.7, panel=1.6, grime=1.0, stripe=(0.05, 0.18, (0.25, 0.45, 0.85)))
    M = [loft([(0.85, 0, 0, 0.15, 0.1, 4), (0.5, 0, 0, 0.38, 0.15, 5), (-0.4, 0, 0, 0.45, 0.17, 5), (-0.8, 0, 0, 0.36, 0.13, 4)], hull, ring=22)]
    M += [block((0, -0.05, 0.16), (0.12, 0.45, 0.06), hull, sq=5), loft([(0.25, 0, 0.24, 0.07, 0.04, 2), (0.05, 0, 0.26, 0.08, 0.04, 2)], GLASS, ring=10)]
    for x, y in ((0.25, 0.35), (-0.25, 0.35), (0.32, -0.15), (-0.32, -0.15), (0.25, -0.55), (-0.25, -0.55)):
        M += [sphere((x, y, 0.13), 0.06, GUNM, squash=0.6), rod((x, y, 0.15), (x, y + 0.13, 0.15), 0.012, GUNM)]
    M += pair(slab((0.47, -0.1, 0.0), (0.04, 0.42, 0.1), hull, sq=6))
    E, G = eng([0.22, 0.0, -0.22], -0.86, 0, 0.09, GBLUE)
    return M + E + greebles(828, 16, ((-0.35, 0.35), (-0.7, 0.6)), DARK, zfn=lambda x, y: 0.15), G, lights_std(0.5, -0.7, 0), 120

def vigil():   # 829 Vigil Heavy Cruiser: a long armoured spear, a spinal fusion cannon, broadside turret rows
    hull = mat((0.55, 0.58, 0.64), metal=0.75, panel=1.8, grime=1.2, stripe=(0.35, 0.42, (0.85, 0.2, 0.15)))
    M = [loft([(1.0, 0, 0, 0.04, 0.04, 3), (0.7, 0, 0, 0.2, 0.12, 4), (0.1, 0, 0, 0.32, 0.17, 5), (-0.5, 0, 0, 0.36, 0.18, 5), (-0.85, 0, 0, 0.3, 0.14, 4)], hull, ring=24)]
    M += [rod((0, 0.4, 0.0), (0, 1.02, 0.0), 0.04, GUNM), sphere((0, 1.02, 0), 0.035, GBLUE)]
    M += [block((0, -0.35, 0.18), (0.1, 0.25, 0.07), hull, sq=5), loft([(-0.15, 0, 0.27, 0.07, 0.04, 2), (-0.35, 0, 0.28, 0.08, 0.04, 2)], GLASS, ring=10)]
    for y in (0.35, 0.1, -0.15, -0.6):
        for s in (1, -1): M += [sphere((s * 0.22, y, 0.12), 0.05, GUNM, squash=0.6), rod((s * 0.22, y, 0.14), (s * 0.3, y + 0.1, 0.14), 0.01, GUNM)]
    M += pair(wing((0.28, -0.45), 0, 0.25, 0.38, 0.2, 0.1, 0.04, hull))
    E, G = eng([0.2, 0.07, -0.07, -0.2], -0.9, 0, 0.075, GBLUE)
    return M + E + greebles(829, 22, ((-0.3, 0.3), (-0.8, 0.6)), DARK, zfn=lambda x, y: 0.16), G, lights_std(0.5, -0.7, 0), 160

V22 = dict(wasp=wasp, swift=swift, pelican=pelican, sabre=sabre, caravel=caravel, talon=talon, lighthouse=lighthouse, monarch=monarch, aegis=aegis, vigil=vigil)
DESIGNS.update(V22)
