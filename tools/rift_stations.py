"""Quantum Rift: rendered space stations for the 78 station worlds.
Twelve designs built from the hull pipeline's primitives (tools/rift_render3d.py) and rendered in the same lit, panelled
3D style as the ships. Output: client/assets/stations/s_<design>.webp and player tiers 0.png–5.png
usage: python3 tools/rift_stations.py client/assets/stations [only]      (needs numpy and Pillow)"""
import sys, os, math, copy
import rift_render3d as renderer
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/stations'; ONLY = sys.argv[2] if len(sys.argv) > 2 else None
LRED = mat((1, 0.2, 0.2), emissive=(1, 0.25, 0.2)); LGREEN = mat((0.3, 1, 0.4), emissive=(0.3, 1, 0.4)); LWHITE = mat((1, 1, 1), emissive=(1, 1, 0.95))
GAMBER = mat((1, .7, .3), emissive=(1.0, 0.72, 0.3)); GBLUE = mat((.4, .7, 1), emissive=(0.45, 0.75, 1.0)); GTEAL = mat((.4, 1, .9), emissive=(0.4, 1.0, 0.9))
GVIOLET = mat((.8, .5, 1), emissive=(0.8, 0.55, 1.0)); GORANGE = mat((1, .5, .15), emissive=(1.0, 0.55, 0.15))
GLASS = mat((0.1, 0.15, 0.25), metal=1, rough=0.1, glass=True, panel=0)
DARK = mat((0.2, 0.21, 0.24), metal=0.8, panel=1.5, rough=0.4); GUNM = mat((0.32, 0.33, 0.36), metal=0.9, panel=0, rough=0.3)
HULL = mat((0.66, 0.68, 0.72), metal=0.55, panel=1.0, grime=1.2); HULLB = mat((0.55, 0.62, 0.74), metal=0.55, panel=1.2, grime=1.0)
HAB = mat((0.8, 0.8, 0.82), metal=0.4, panel=1.4, windows=(-0.04, 0.04, (1.0, 0.85, 0.5), 9))
TANK = mat((0.85, 0.7, 0.3), metal=0.6, panel=0.4, grime=1.0); SOLAR = mat((0.12, 0.18, 0.4), metal=0.9, rough=0.15, panel=4.0, grime=0)
ROCK = mat((0.42, 0.38, 0.34), metal=0.05, panel=0, rough=0.9, grime=3.0); RUST = mat((0.48, 0.32, 0.22), metal=0.3, panel=1.6, grime=2.5)
CHITIN = mat((0.36, 0.3, 0.18), metal=0.3, panel=0.6, rough=0.3, grime=1.5); CHITIN2 = mat((0.5, 0.42, 0.2), metal=0.4, panel=0.3, rough=0.25)
CRYS = mat((0.55, 0.45, 0.85), metal=0.9, panel=0, rough=0.08, grime=0); CRYS2 = mat((0.8, 0.75, 1.0), metal=1.0, panel=0, rough=0.05, grime=0)
CORAL = mat((0.3, 0.6, 0.62), metal=0.35, panel=0.5, rough=0.35, grime=0.8); CORAL2 = mat((0.75, 0.45, 0.5), metal=0.3, panel=0.4, rough=0.4)
FORGE = mat((0.3, 0.27, 0.25), metal=0.7, panel=2.0, grime=2.2); BRASS = mat((0.72, 0.55, 0.28), metal=0.85, panel=1.0, rough=0.3)
JUNK = [mat((0.5, 0.35, 0.25), metal=0.4, panel=2.0, grime=3.0), mat((0.35, 0.4, 0.38), metal=0.5, panel=1.6, grime=2.5), mat((0.55, 0.52, 0.45), metal=0.4, panel=1.2, grime=2.8)]

def rot_z(m, a):
    c, s = math.cos(a), math.sin(a)
    def f(V):
        x, y = V[:, 0].copy(), V[:, 1].copy(); V[:, 0] = x * c - y * s; V[:, 1] = x * s + y * c; return V
    return m.tf(f)
def flat_torus(R, r, m, z=0.0, arc=1.0, n=48, k=10):
    V = []; F = []; nn = max(3, int(n * arc))
    for i in range(nn + (0 if arc >= 1 else 1)):
        u = 2 * math.pi * arc * i / nn
        for j in range(k):
            v = 2 * math.pi * j / k
            V.append(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), z + r * math.sin(v)))
    for i in range(nn):
        i2 = (i + 1) % nn if arc >= 1 else i + 1
        for j in range(k):
            a, b, c, d = i * k + j, i2 * k + j, i2 * k + (j + 1) % k, i * k + (j + 1) % k
            F += [(a, b, c), (a, c, d)]
    return Mesh(V, F, m)
def zcyl(c, r, h, m, ring=20, sq=2):
    x, y, z = c
    return loft([(z - h, y, x, r * 0.92, r * 0.92, sq), (z - h * 0.9, y, x, r, r, sq), (z + h * 0.9, y, x, r, r, sq), (z + h, y, x, r * 0.92, r * 0.92, sq)], m, ring=ring, axis='z')
def panel(x0, y0, x1, y1, z, m): return Mesh(np.array([[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]]), np.array([[0, 1, 2], [0, 2, 3]]), m)
def arm(a, r0, r1, w, m, z=0.0): return rot_z(block(((r0 + r1) / 2, 0, z), ((r1 - r0) / 2, w, w), m), a)
def light(a, r, z, m, s=0.02): return sphere((r * math.cos(a), r * math.sin(a), z), s, m)
def lumpy(c, r, m, seed, squash=0.8):
    s = sphere(c, r, m, squash=squash); rnd = np.random.default_rng(seed)
    def f(V):
        d = V - np.array(c); n = np.linalg.norm(d, axis=1, keepdims=True) + 1e-9
        k = 1 + 0.18 * np.sin(d[:, 0:1] / r * 7 + rnd.random() * 6) * np.sin(d[:, 1:2] / r * 6 + rnd.random() * 6) + 0.1 * np.sin(d[:, 2:3] / r * 9)
        return np.array(c) + d * k
    return s.tf(f)

def ring_station():
    M = [zcyl((0, 0, 0), 0.22, 0.14, HULL, 24), zcyl((0, 0, 0.18), 0.12, 0.06, DARK), sphere((0, 0, 0.24), 0.06, GBLUE), flat_torus(0.72, 0.075, HAB)]
    for k in range(6): M += [arm(k * math.pi / 3, 0.2, 0.66, 0.02, DARK)]
    for k in range(12): M += [light(k * math.pi / 6, 0.72, 0.08, LGREEN if k % 2 else LRED, 0.015)]
    return M
def spindle():
    M = [loft([(-0.9, 0, 0, 0.05, 0.05, 2), (-0.8, 0, 0, 0.12, 0.12, 2), (-0.2, 0, 0, 0.1, 0.1, 2), (0, 0, 0, 0.2, 0.2, 2.5), (0.2, 0, 0, 0.1, 0.1, 2), (0.8, 0, 0, 0.12, 0.12, 2), (0.9, 0, 0, 0.05, 0.05, 2)], HULLB, ring=18)]
    for y in (-0.55, 0.55):
        for s in (-1, 1): M += [block((s * 0.32, y, 0), (0.18, 0.02, 0.02), DARK), panel(s * 0.2, y - 0.14, s * 0.62, y + 0.14, 0.0, SOLAR)]
    for y in (-0.35, 0.35): M += [rot_z(flat_torus(0.17, 0.035, HAB), 0).tf(lambda V, y=y: V + np.array([0, y, 0]))]
    M += [sphere((0, 0.92, 0), 0.03, LWHITE), sphere((0, -0.92, 0), 0.03, LRED), sphere((0, 0, 0.2), 0.07, GAMBER)]
    return M
def cross_dock():
    M = [sphere((0, 0, 0), 0.26, HULL), zcyl((0, 0, 0.2), 0.1, 0.08, DARK), sphere((0, 0, 0.3), 0.05, GTEAL)]
    for k in range(4):
        a = k * math.pi / 2; M += [arm(a, 0.22, 0.85, 0.05, HULL), rot_z(block((0.9, 0, 0), (0.06, 0.16, 0.04), DARK), a), light(a, 0.97, 0.05, LGREEN if k % 2 else LRED)]
        for j in (0.45, 0.65): M += [rot_z(block((j, 0, 0.06), (0.06, 0.08, 0.04), HAB), a)]
    return M
def asteroid_base():
    M = [lumpy((0, 0, 0), 0.62, ROCK, 3), sphere((0.15, 0.1, 0.42), 0.16, GLASS, squash=0.55), sphere((-0.25, -0.2, 0.35), 0.11, GLASS, squash=0.55),
         zcyl((-0.1, 0.35, 0.38), 0.06, 0.12, DARK), sphere((-0.1, 0.35, 0.52), 0.12, GUNM, squash=0.35), block((0.45, -0.25, 0.25), (0.12, 0.05, 0.05), HULL), block((0.62, -0.25, 0.25), (0.06, 0.12, 0.03), DARK)]
    M += [sphere((0.7, -0.25, 0.3), 0.02, LGREEN), sphere((-0.4, 0.2, 0.42), 0.02, LRED), sphere((0.3, 0.3, 0.38), 0.025, GAMBER)]
    return M
def twin_ring():
    M = [zcyl((0, 0, 0), 0.14, 0.3, HULL, 20), flat_torus(0.55, 0.05, HAB, z=0.16), flat_torus(0.82, 0.05, HAB, z=-0.12), sphere((0, 0, 0.34), 0.08, GVIOLET)]
    for k in range(4): M += [arm(k * math.pi / 2 + 0.4, 0.12, 0.52, 0.016, DARK, 0.16), arm(k * math.pi / 2 + 1.2, 0.12, 0.79, 0.016, DARK, -0.12)]
    for k in range(8): M += [light(k * math.pi / 4, 0.82, -0.06, LWHITE, 0.014)]
    return M
def shipyard():
    M = []
    for x in (-0.75, -0.25, 0.25, 0.75):
        for s in (-1, 1): M += [block((x, s * 0.32, 0), (0.02, 0.02, 0.18), DARK)]
        M += [block((x, 0, 0.18), (0.02, 0.34, 0.02), DARK), block((x, 0, -0.18), (0.02, 0.34, 0.02), DARK)]
    for s in (-1, 1): M += [block((0, s * 0.32, 0.18), (0.8, 0.015, 0.015), GUNM), block((0, s * 0.32, -0.18), (0.8, 0.015, 0.015), GUNM)]
    M += [loft([(-0.6, 0, 0, 0.03, 0.03, 2), (-0.4, 0, 0, 0.14, 0.1, 2.4), (0.4, 0, 0, 0.16, 0.12, 2.4), (0.62, 0, 0, 0.1, 0.08, 2)], HULLB, ring=16, axis='x')]
    M += [block((0, 0.55, 0), (0.3, 0.12, 0.08), HAB), zcyl((0, 0.55, 0.12), 0.06, 0.05, DARK)]
    for x in (-0.75, 0.75):
        for s in (-1, 1): M += [sphere((x, s * 0.32, 0.2), 0.018, GAMBER)]
    return M
def disc():
    M = [loft([(-0.1, 0, 0, 0.001, 0.001, 2), (-0.08, 0, 0, 0.55, 0.55, 2), (0.0, 0, 0, 0.8, 0.8, 2), (0.06, 0, 0, 0.6, 0.6, 2), (0.12, 0, 0, 0.2, 0.2, 2), (0.14, 0, 0, 0.001, 0.001, 2)], HULL, ring=36, axis='z'),
         sphere((0, 0, 0.12), 0.18, GLASS, squash=0.5)]
    for k in range(24): M += [light(k * math.pi / 12, 0.78, 0.0, GAMBER if k % 3 else LWHITE, 0.016)]
    for k in range(3): M += [rot_z(block((0.95, 0, 0), (0.14, 0.05, 0.03), DARK), k * 2 * math.pi / 3 + 0.3)]
    return M
def hive():
    M = []; rnd = np.random.default_rng(9)
    for i in range(14):
        a = rnd.random() * 6.28; r = rnd.random() ** 0.7 * 0.55; s = 0.12 + rnd.random() * 0.16
        M += [lumpy((r * math.cos(a), r * math.sin(a), rnd.random() * 0.2 - 0.05), s, CHITIN if i % 3 else CHITIN2, i, squash=0.8)]
    for k in range(5): M += [sphere((0.5 * math.cos(k * 1.3), 0.5 * math.sin(k * 1.3), 0.2), 0.03, GAMBER)]
    return M
def crystal():
    M = []; rnd = np.random.default_rng(4)
    for i in range(11):
        a = i / 11 * 6.28 + rnd.random() * 0.3; L = 0.45 + rnd.random() * 0.5; w = 0.07 + rnd.random() * 0.06
        sh = loft([(0, 0, 0, w, w * 0.7, 0.9), (L * 0.7, 0, 0, w * 0.8, w * 0.6, 0.9), (L, 0, 0, 0.002, 0.002, 0.9)], CRYS if i % 2 else CRYS2, ring=6, axis='x')
        M += [rot_z(sh.tf(lambda V, z=rnd.random() * 0.2: V + np.array([0, 0, z])), a)]
    M += [sphere((0, 0, 0.1), 0.2, CRYS2, squash=0.9), sphere((0, 0, 0.32), 0.07, GVIOLET)]
    return M
def reef():
    M = [sphere((0, 0, 0), 0.28, CORAL, squash=0.75), sphere((0, 0, 0.15), 0.15, GLASS, squash=0.6)]
    for k in range(6):
        a = k * math.pi / 3 + 0.2; pts = [(0.24, 0), (0.38, 0.06), (0.52, 0.03), (0.66, 0.1), (0.78, 0.06)]
        for j, (r, dz) in enumerate(pts): M += [sphere((r * math.cos(a + j * 0.12), r * math.sin(a + j * 0.12), dz), 0.1 - j * 0.012, CORAL2 if (k + j) % 2 else CORAL)]
        M += [sphere((0.84 * math.cos(a + 0.5), 0.84 * math.sin(a + 0.5), 0.12), 0.025, GTEAL)]
    return M
def forge():
    M = [block((0, 0, 0), (0.42, 0.32, 0.16), FORGE), block((0, 0, 0.2), (0.25, 0.2, 0.08), FORGE), zcyl((0.25, 0.18, 0.32), 0.07, 0.12, BRASS), zcyl((-0.22, -0.15, 0.3), 0.08, 0.14, BRASS)]
    for s in (-1, 1): M += [block((s * 0.62, 0, 0), (0.2, 0.08, 0.06), FORGE), block((s * 0.86, 0, 0), (0.05, 0.18, 0.05), DARK)]
    for x in (-0.25, 0, 0.25): M += [block((x, 0.33, 0.04), (0.06, 0.02, 0.05), GORANGE)]
    M += [sphere((0.25, 0.18, 0.46), 0.05, GORANGE), sphere((-0.22, -0.15, 0.46), 0.05, GORANGE)]
    return M
def junk():
    M = []; rnd = np.random.default_rng(13)
    for i in range(22):
        x, y = rnd.normal(0, 0.2, 2); w, l, h = rnd.uniform(0.08, 0.2, 3)
        M += [rot_z(block((x, y, rnd.uniform(-0.05, 0.12)), (w, l, h), JUNK[i % 3]), rnd.random() * 3)]
    M += [flat_torus(0.6, 0.035, JUNK[0], arc=0.6), zcyl((0.1, 0.1, 0.25), 0.05, 0.1, DARK), sphere((0.1, 0.1, 0.38), 0.03, LRED), sphere((-0.4, 0.2, 0.2), 0.02, GAMBER)]
    return M
DESIGNS = dict(ring=ring_station, spindle=spindle, cross=cross_dock, rock=asteroid_base, twin=twin_ring, yard=shipyard, disc=disc, hive=hive, crystal=crystal, reef=reef, forge=forge, junk=junk)

def upgrade(meshes, design):
    """Apply satin hull materials without changing the shared renderer's source materials."""
    mapped_materials = {}
    for mesh in meshes:
        original_material = mesh.m
        if original_material not in mapped_materials:
            material = copy.deepcopy(renderer.MATS[original_material])
            if material['emissive'] is None:
                material['panel'] *= .2
                material['grime'] *= .25
                material['metal'] *= .5
                material['rough'] = max(.65, material['rough'])
                if material['glass']:
                    material.update(glass=False, color=np.array([.24, .43, .5]),
                                    rough=.85, metal=.16, panel=0)
            renderer.MATS.append(material)
            mapped_materials[original_material] = len(renderer.MATS) - 1
        mesh.m = mapped_materials[original_material]
    trim = mat((.22, .27, .31), metal=.25, rough=.75, panel=0, grime=0)
    hull = mat((.64, .69, .73), metal=.25, rough=.75, panel=.12, grime=.1)
    if design == 'ring':
        for index in range(6):
            meshes += [arm(index * math.pi / 3, .19, .68, .035, trim)]
        meshes += [flat_torus(.72, .018, trim, z=.075)]
    if design == 'spindle':
        for offset in (-.55, .55):
            meshes += [block((0, offset, -.035), (.24, .045, .025), trim)]
    if design == 'yard':
        for sign in (-1, 1):
            meshes += [block((0, sign * .32, .18), (.80, .025, .025), hull),
                       block((0, sign * .42, 0), (.23, .025, .11), trim)]
    if design == 'rock':
        for x, y, z, radius in [(.15, .1, .42, .16), (-.25, -.2, .35, .11)]:
            meshes += [flat_torus(radius, .023, trim, z=z - .025).tf(
                lambda vertices, x=x, y=y: vertices + np.array([x, y, 0]))]
    if design == 'crystal':
        meshes += [zcyl((0, 0, -.025), .27, .07, trim)]
    return meshes

def player_station(tier=5):
    """Operations tiers add habitat, docks, service pods, solar arrays and a deck."""
    meshes = [zcyl((0, 0, 0), .14, .24, HULLB),
              zcyl((0, 0, .29), .07, .05, DARK),
              sphere((0, 0, .37), .045, GVIOLET)]
    if tier >= 1:
        meshes += [flat_torus(.70, .055, HAB), flat_torus(.88, .025, DARK)]
        for index in range(6):
            meshes += [arm(index * math.pi / 3, .12, .88, .025, DARK)]
    if tier >= 2:
        for index in range(6):
            angle = index * math.pi / 3
            meshes += [rot_z(block((.86, 0, .07), (.065, .085, .06), HULL), angle),
                       light(angle, .88, .15, LRED if index % 2 else LGREEN, .012)]
    if tier >= 3:
        for index in range(6):
            meshes += [rot_z(block((.64, 0, -.10), (.12, .06, .045), HULLB), index * math.pi / 3)]
    if tier >= 4:
        for sign in (-1, 1):
            meshes += [block((0, sign * .62, -.12), (.19, .015, .015), DARK),
                       panel(-.22, sign * .62 - .11, .22, sign * .62 + .11, -.13, SOLAR)]
    if tier >= 5:
        meshes += [block((.74, 0, .09), (.24, .10, .018), DARK)]
    return meshes

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for nm, fn in DESIGNS.items():
        if ONLY and nm != ONLY: continue
        M = fn()
        if nm in ('ring', 'spindle', 'yard', 'rock', 'crystal'):
            M = upgrade(M, nm)
        V = np.concatenate([m.V for m in M]); r = np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2 + (V[:, 2] * 0.8) ** 2).max()
        size = 360; o = render(M, size, 25, size * 0.46 / r, tilt=50, density=10, ss=3); rgb, a = o[0]
        img = np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).round().astype(np.uint8)
        Image.fromarray(img, 'RGBA').save(os.path.join(OUT, f's_{nm}.webp'), 'WEBP', quality=88, method=6); print(nm, flush=True)

    if ONLY in (None, 'player'):
        # Keep a common frame scale so construction adds structure rather than resizing the core.
        developed = player_station(5)
        extent = np.linalg.norm(np.concatenate([mesh.V for mesh in developed]), axis=1).max()
        for tier in range(6):
            meshes = upgrade(player_station(tier), 'player')
            rgb, alpha = render(meshes, 360, 25, 360 * .43 / extent, tilt=50, density=10, ss=3)[0]
            pixels = np.dstack([np.clip(rgb, 0, 1) * 255, np.clip(alpha, 0, 1) * 255]).round().astype(np.uint8)
            Image.fromarray(pixels, 'RGBA').save(os.path.join(OUT, f'{tier}.png'))
            print(f'player tier {tier}', flush=True)
