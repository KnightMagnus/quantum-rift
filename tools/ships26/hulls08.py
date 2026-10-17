"""Quantum Rift 0.8 specialty ships: ten one-of-a-kind hulls, each built for a single job (after STFC's specialty ships).
Coordinates: +y is the nose, x is lateral, z is up; hulls fit roughly inside the unit circle."""
import math
import numpy as np
from render2 import mat, loft, torus, block, sphere, wing, fin, pair, Mesh
from hulls2 import DESIGNS, engine, light, greebles, fuse, LRED, LGREEN, LWHITE, GLASS, DARK, GUNM, GBLUE, GRED, GTEAL, GAMBER
from hulls5 import rotm, xf, mv, hoop, rod, shard, segments, slab, seam, vent, CRYS, CRYSW, YGLOW, BRASS
from hulls52 import tentacle, bell

def lights_wingtips(x, y, z=0.04, s=0.028): return [light(x, y, z, LGREEN, s), light(-x, y, z, LRED, s)]

def sp_lodestar():   # Survey: a mining barge with two great ore-cutter arms and four hopper bays, amber hazard striping
    hull = mat((0.62, 0.55, 0.36), metal=0.6, rough=0.5, panel=1.5, grime=1.6, stripe=(0.08, 0.18, (0.95, 0.7, 0.1)))
    dark = mat((0.22, 0.2, 0.18), metal=0.7, rough=0.5, panel=1.0, grime=1.2)
    M = [loft([(0.55, 0, 0, 0.2, 0.12, 6), (0.3, 0, 0, 0.32, 0.16, 6), (-0.6, 0, 0, 0.34, 0.17, 6), (-0.85, 0, 0, 0.26, 0.13, 5)], hull, ring=20)]
    for x, y in ((0.2, 0.05), (-0.2, 0.05), (0.2, -0.35), (-0.2, -0.35)):   # ore hoppers
        M += [block((x, y, 0.17), (0.12, 0.15, 0.05), dark, sq=5), block((x, y, 0.225), (0.09, 0.11, 0.01), mat((0.85, 0.55, 0.15), emissive=(0.6, 0.35, 0.05)), sq=4)]
    for s in (1, -1):   # cutter arms reaching forward, with glowing cutter heads
        M += [rod((s * 0.28, 0.25, 0.0), (s * 0.42, 0.7, 0.0), 0.05, dark), rod((s * 0.42, 0.7, 0.0), (s * 0.3, 0.98, 0.0), 0.04, dark)]
        M += [sphere((s * 0.3, 1.0, 0.0), 0.07, mat((1.0, 0.75, 0.25), emissive=(1.0, 0.6, 0.15)))]
    M += [loft([(0.62, 0, 0.1, 0.0, 0.0, 2), (0.5, 0, 0.13, 0.1, 0.04, 3), (0.36, 0, 0.13, 0.1, 0.04, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.14, -0.14):
        e, g = engine(x, -0.9, 0, 0.08, GAMBER, DARK); eng += e; glo += g
    return M + eng + greebles(801, 16, ((-0.3, 0.3), (-0.8, 0.3)), DARK, zfn=lambda x, y: 0.16), glo, lights_wingtips(0.34, -0.7), 136

def sp_swarmbreaker():   # Explorer: a white hunter with a forward resonance dish that shatters swarm chitin
    hull = mat((0.9, 0.92, 0.9), metal=0.4, rough=0.3, panel=0.9, grime=0.3, stripe=(0.45, 0.55, (0.35, 0.85, 0.3)))
    M = [fuse([(0.7, 0, 0, 0, 2), (0.45, 0.13, 0.09, 0, 2.6), (-0.3, 0.17, 0.11, 0, 3), (-0.85, 0.12, 0.08, 0, 2.6)], hull)]
    dish = mat((0.55, 1.0, 0.45), emissive=(0.35, 0.9, 0.25))
    M += [hoop(0.22, 0.03, hull, c=(0, 0.82, 0.0), tilt_x=math.pi / 2), hoop(0.14, 0.02, dish, c=(0, 0.86, 0.0), tilt_x=math.pi / 2), sphere((0, 0.9, 0), 0.05, dish)]
    M += [rod((0, 0.6, 0), (0, 0.82, 0), 0.03, GUNM)]
    M += pair(wing((0.15, -0.2), 0, 0.5, 0.42, 0.14, -0.25, 0.02, hull, dihedral=0.03))
    M += pair(rod((0.48, -0.5, 0.0), (0.48, -0.05, 0.0), 0.025, GUNM))
    M += [loft([(0.5, 0, 0.08, 0.0, 0.0, 2), (0.36, 0, 0.11, 0.07, 0.04, 2), (0.15, 0, 0.11, 0.07, 0.04, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.08, -0.08):
        e, g = engine(x, -0.92, 0, 0.06, mat((0.4, 1.0, 0.4), emissive=(0.35, 1.0, 0.35)), DARK); eng += e; glo += g
    return M + eng, glo, lights_wingtips(0.62, -0.42), 122

def sp_nightglass():   # Interceptor: a black glass dart edged in violet-white light, built to hunt the Umbral
    glassb = mat((0.16, 0.15, 0.24), metal=0.85, rough=0.12, panel=0.5, grime=0.05, stripe=(0.47, 0.53, (0.6, 0.45, 0.95)))
    edge = mat((0.85, 0.75, 1.0), emissive=(0.75, 0.55, 1.0))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.5, 0.08, 0.06, 0, 2.2), (-0.4, 0.12, 0.07, 0, 2.4), (-0.8, 0.08, 0.05, 0, 2.2)], glassb)]
    M += pair(wing((0.06, 0.1), 0, 0.55, 0.75, 0.05, -0.6, 0.015, glassb, dihedral=-0.02))
    for s in (1, -1): M += [rod((s * 0.08, 0.6, 0.02), (s * 0.58, -0.45, 0.02), 0.01, edge)]
    M += [rod((0, 1.0, 0.03), (0, -0.5, 0.06), 0.008, edge)]
    eng = []; glo = []
    for x in (0.06, -0.06):
        e, g = engine(x, -0.85, 0, 0.045, mat((0.8, 0.6, 1.0), emissive=(0.8, 0.55, 1.0)), DARK); eng += e; glo += g
    return M + eng, glo, [light(0.58, -0.45, 0.02, LWHITE, 0.02), light(-0.58, -0.45, 0.02, LWHITE, 0.02)], 92

def sp_corsair():   # Battleship: a heavy prize-taker with boarding clamps at the bow and a docking collar amidships
    hull = mat((0.32, 0.3, 0.32), metal=0.85, rough=0.4, panel=1.6, grime=1.4, stripe=(0.2, 0.3, (0.8, 0.12, 0.1)))
    M = [loft([(0.75, 0, 0, 0.18, 0.12, 5), (0.4, 0, 0, 0.3, 0.16, 6), (-0.5, 0, 0, 0.34, 0.18, 6), (-0.85, 0, 0, 0.26, 0.14, 5)], hull, ring=22)]
    clamp = mat((0.6, 0.15, 0.1), metal=0.7, rough=0.4, panel=0.8, grime=0.8)
    for s in (1, -1):   # boarding clamps: hooked jaws reaching past the bow
        M += [rod((s * 0.16, 0.6, 0), (s * 0.3, 0.9, 0), 0.045, clamp), rod((s * 0.3, 0.9, 0), (s * 0.12, 1.02, 0), 0.04, clamp)]
        M += [slab((s * 0.36, -0.1, 0.0), (0.06, 0.32, 0.09), hull, sq=6)]
        for y in (0.15, -0.2, -0.5): M += [sphere((s * 0.36, y, 0.1), 0.045, DARK, squash=0.6), rod((s * 0.36, y, 0.12), (s * 0.36, y + 0.16, 0.12), 0.01, GUNM)]
    M += [hoop(0.16, 0.035, mat((0.9, 0.3, 0.2), emissive=(0.7, 0.15, 0.05)), c=(0, 0.0, 0.17))]   # boarding collar
    M += [loft([(0.6, 0, 0.13, 0.07, 0.03, 3), (0.45, 0, 0.16, 0.08, 0.03, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.12, -0.12, 0.3, -0.3):
        e, g = engine(x, -0.92, 0, 0.065, GRED, DARK); eng += e; glo += g
    return M + eng + greebles(804, 18, ((-0.25, 0.25), (-0.7, 0.4)), DARK, zfn=lambda x, y: 0.17), glo, lights_wingtips(0.42, -0.6), 164

def sp_herald():   # Explorer: a command yacht under a golden halo, with a tall signal spire
    hull = mat((0.92, 0.9, 0.84), metal=0.5, rough=0.25, panel=0.7, grime=0.2, stripe=(0.42, 0.58, (0.95, 0.75, 0.25)))
    gold = mat((1.0, 0.8, 0.35), emissive=(0.9, 0.65, 0.2))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.65, 0.12, 0.08, 0, 2.6), (0.0, 0.2, 0.12, 0, 3.2), (-0.6, 0.2, 0.12, 0, 3.2), (-0.88, 0.14, 0.09, 0, 2.8)], hull)]
    M += [hoop(0.42, 0.025, gold, c=(0, -0.15, 0.06)), hoop(0.42, 0.04, hull, c=(0, -0.15, 0.03))]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2; M += [rod((0, -0.15, 0.04), (0.42 * math.cos(a), -0.15 + 0.42 * math.sin(a), 0.04), 0.015, hull)]
    M += [rod((0, 0.2, 0.12), (0, 0.2, 0.42), 0.02, GUNM), sphere((0, 0.2, 0.44), 0.035, gold)]   # signal spire
    M += [loft([(0.78, 0, 0.07, 0.0, 0.0, 2), (0.62, 0, 0.1, 0.06, 0.04, 2), (0.42, 0, 0.1, 0.06, 0.04, 2)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.0, 0.12, -0.12):
        e, g = engine(x, -0.94, 0, 0.055, GAMBER, DARK); eng += e; glo += g
    return M + eng, glo, lights_wingtips(0.44, -0.15) + [light(0, 0.2, 0.46, LWHITE, 0.03)], 128

def sp_tidecaller():   # Explorer (Thalassi-grown): a broad living ray whose trailing tentacles are tractor beams
    skin = mat((0.15, 0.45, 0.55), metal=0.1, rough=0.6, panel=0.2, grime=0.3)
    bio = mat((0.4, 1.0, 0.95), emissive=(0.3, 0.95, 0.9))
    M = [loft([(0.85, 0, 0, 0.05, 0.04, 2), (0.5, 0, 0, 0.5, 0.08, 2.2), (0.0, 0, 0, 0.75, 0.1, 2.4), (-0.4, 0, 0, 0.55, 0.08, 2.2), (-0.7, 0, 0, 0.12, 0.05, 2)], skin, ring=24)]
    for k, (x, y) in enumerate(((0.3, 0.3), (-0.3, 0.3), (0.5, -0.05), (-0.5, -0.05), (0.0, 0.1))): M += [sphere((x, y, 0.07), 0.04, bio, squash=0.5)]
    for k, x in enumerate((0.3, 0.12, -0.12, -0.3)):
        M += [tentacle((x, -0.55, 0.0), 0.5, 7, 0.035, m=skin, wave=0.06, phase=k * 0.9)]
        M += [sphere((x, -1.02, 0.0), 0.03, bio)]
    M += [loft([(0.62, 0, 0.06, 0.0, 0.0, 2), (0.5, 0, 0.09, 0.07, 0.04, 2), (0.32, 0, 0.09, 0.07, 0.04, 2)], mat((0.3, 0.9, 1.0), emissive=(0.15, 0.5, 0.6)), ring=10)]
    return M, [], [light(0.72, 0.0, 0.05, bio, 0.03), light(-0.72, 0.0, 0.05, bio, 0.03)], 140

def sp_pathfinder():   # Explorer: a slim long-range scout pushed by an oversized jump-drive ring
    hull = mat((0.55, 0.62, 0.72), metal=0.75, rough=0.3, panel=1.0, grime=0.5, stripe=(0.46, 0.54, (0.25, 0.55, 1.0)))
    ringm = mat((0.5, 0.75, 1.0), emissive=(0.35, 0.6, 1.0))
    M = [fuse([(1.0, 0, 0, 0, 2), (0.6, 0.08, 0.06, 0, 2.4), (-0.3, 0.1, 0.07, 0, 2.6), (-0.7, 0.09, 0.06, 0, 2.4)], hull)]
    M += [hoop(0.34, 0.05, hull, c=(0, -0.62, 0.0), tilt_x=math.pi / 2), hoop(0.3, 0.025, ringm, c=(0, -0.64, 0.0), tilt_x=math.pi / 2)]
    for k in range(3):
        a = k * 2 * math.pi / 3 + math.pi / 2; M += [rod((0, -0.5, 0), (0.32 * math.cos(a), -0.62, 0.32 * math.sin(a)), 0.02, hull)]
    M += pair(wing((0.08, 0.2), 0, 0.28, 0.3, 0.1, -0.15, 0.012, hull))
    M += [rod((0, 1.0, 0), (0, 1.18, 0), 0.008, GUNM), loft([(0.7, 0, 0.05, 0.0, 0.0, 2), (0.55, 0, 0.08, 0.05, 0.035, 2), (0.35, 0, 0.08, 0.05, 0.035, 2)], GLASS, ring=10)]
    eng = []; glo = []
    e, g = engine(0, -0.85, 0, 0.07, GBLUE, DARK); eng += e; glo += g
    return M + eng, glo, lights_wingtips(0.36, 0.1), 136

def sp_bulwark():   # Battleship: a fortress block ringed with shield pylons, built to hold a station's sky
    hull = mat((0.5, 0.54, 0.6), metal=0.8, rough=0.4, panel=1.8, grime=1.0, stripe=(0.1, 0.2, (0.2, 0.45, 0.9)))
    shield = mat((0.55, 0.8, 1.0), emissive=(0.4, 0.7, 1.0))
    M = [block((0, 0, 0), (0.42, 0.75, 0.16), hull, sq=8), block((0, 0.15, 0.18), (0.24, 0.4, 0.06), hull, sq=6)]
    for x, y in ((0.42, 0.55), (-0.42, 0.55), (0.42, -0.55), (-0.42, -0.55), (0.0, 0.8), (0.0, -0.82)):
        M += [rod((x, y, -0.05), (x, y, 0.26), 0.03, GUNM), sphere((x, y, 0.28), 0.05, shield)]
    for x in (0.25, -0.25):
        for y in (0.45, 0.0, -0.45): M += [sphere((x, y, 0.17), 0.05, DARK, squash=0.6), rod((x, y, 0.19), (x, y + 0.18, 0.19), 0.012, GUNM)]
    M += [loft([(0.55, 0, 0.24, 0.1, 0.03, 3), (0.42, 0, 0.26, 0.1, 0.03, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.28, 0.1, -0.1, -0.28):
        e, g = engine(x, -0.85, 0, 0.06, GBLUE, DARK); eng += e; glo += g
    return M + eng + greebles(808, 20, ((-0.35, 0.35), (-0.65, 0.6)), DARK, zfn=lambda x, y: 0.16), glo, lights_wingtips(0.44, 0.0, 0.17), 172

def sp_wraith():   # Interceptor: a faceted stealth flyer, matte charcoal with the faintest teal seams
    matte = mat((0.13, 0.14, 0.15), metal=0.3, rough=0.9, panel=0.5, grime=0.2)
    seamm = mat((0.3, 0.8, 0.75), emissive=(0.12, 0.45, 0.42))
    M = [loft([(0.95, 0, 0, 0.01, 0.01, 1), (0.4, 0, 0, 0.22, 0.06, 1), (-0.3, 0, 0, 0.45, 0.07, 1), (-0.75, 0, 0, 0.3, 0.05, 1)], matte, ring=8)]
    M += pair(wing((0.2, -0.1), 0, 0.42, 0.6, 0.12, -0.45, 0.01, matte, dihedral=0.0))
    for s in (1, -1): M += [rod((s * 0.05, 0.75, 0.05), (s * 0.55, -0.55, 0.02), 0.006, seamm)]
    M += [loft([(0.5, 0, 0.04, 0.0, 0.0, 1), (0.3, 0, 0.07, 0.06, 0.02, 1), (0.1, 0, 0.07, 0.06, 0.02, 1)], mat((0.1, 0.25, 0.25), metal=0.6, rough=0.1), ring=6)]
    eng = []; glo = []
    for x in (0.1, -0.1):
        e, g = engine(x, -0.8, 0, 0.035, GTEAL, DARK); eng += e; glo += g
    return M + eng, glo, [], 96

def sp_vanguard():   # Battleship: a bounty hunter's gunship, a long cannon spine between two heavy engine pods
    hull = mat((0.24, 0.26, 0.3), metal=0.85, rough=0.35, panel=1.3, grime=0.9, stripe=(0.3, 0.42, (0.95, 0.5, 0.1)))
    M = [loft([(0.6, 0, 0, 0.14, 0.1, 5), (0.2, 0, 0, 0.2, 0.13, 5), (-0.6, 0, 0, 0.22, 0.14, 5), (-0.8, 0, 0, 0.18, 0.11, 5)], hull, ring=18)]
    M += [rod((0, 0.4, 0.05), (0, 1.12, 0.05), 0.045, GUNM), rod((0, 1.12, 0.05), (0, 1.18, 0.05), 0.06, DARK)]   # the spinal cannon
    for s in (1, -1):
        M += [loft([(0.35, s * 0.36, 0, 0.03, 0.03, 2), (0.15, s * 0.36, 0, 0.1, 0.09, 3), (-0.75, s * 0.36, 0, 0.12, 0.1, 3), (-0.9, s * 0.36, 0, 0.1, 0.08, 3)], hull, ring=16)]
        M += [slab((s * 0.2, -0.15, 0), (0.12, 0.08, 0.04), hull, sq=4)]
        M += [sphere((s * 0.36, 0.0, 0.11), 0.04, DARK, squash=0.6), rod((s * 0.36, 0.0, 0.13), (s * 0.36, 0.2, 0.13), 0.012, GUNM)]
    M += [loft([(0.5, 0, 0.11, 0.06, 0.03, 3), (0.35, 0, 0.13, 0.07, 0.03, 3)], GLASS, ring=10)]
    eng = []; glo = []
    for x in (0.36, -0.36):
        e, g = engine(x, -0.95, 0, 0.09, GAMBER, DARK); eng += e; glo += g
    return M + eng, glo, lights_wingtips(0.47, -0.5), 162

V08 = dict(sp_lodestar=sp_lodestar, sp_swarmbreaker=sp_swarmbreaker, sp_nightglass=sp_nightglass, sp_corsair=sp_corsair, sp_herald=sp_herald,
           sp_tidecaller=sp_tidecaller, sp_pathfinder=sp_pathfinder, sp_bulwark=sp_bulwark, sp_wraith=sp_wraith, sp_vanguard=sp_vanguard)
DESIGNS.update(V08)
