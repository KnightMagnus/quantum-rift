"""Original outfitter models rendered through the game's lit, panelled 3D pipeline.
All 73 active outfits, including the five-seat passenger pack, have source geometry.
Output: client/assets/icons/<id>.png, 256 x 256 by default (not raster upscaling).
Usage: python3 tools/rift_icons.py client/assets/icons [--size 256] [--only 9020]
Requires numpy and Pillow. Existing numeric icon routes stay compatible.
"""
import sys, os, math, argparse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh
import rift_stations as RS


GUN = mat((0.5, 0.52, 0.56), metal=0.8, panel=1.6, rough=0.3); GUN2 = mat((0.3, 0.32, 0.36), metal=0.85, panel=1.2, rough=0.25)
COPPER = mat((0.72, 0.45, 0.28), metal=0.9, panel=0.8, rough=0.3); BONE = mat((0.62, 0.58, 0.42), metal=0.2, panel=0.4, rough=0.5, grime=1.5)
GREEN = mat((0.3, 0.45, 0.25), metal=0.3, panel=0.3, rough=0.35)
def glow(c): return mat(c, emissive=c)
def barrel(x0, x1, r, m, y=0.0, z=0.0, ring=14): return loft([(x0, y, z, r, r, 2), (x1, y, z, r, r, 2)], m, ring=ring, axis='x')
def blaster(level, col):
    b = 0.13 + 0.04 * level; M = [block((-0.15, 0, 0), (0.35, b * 1.4, b), GUN), barrel(0.15, 0.75 + 0.1 * level, b * 0.45, GUN2), barrel(0.5, 0.62, b * 0.6, GUN)]
    M += [sphere((0.8 + 0.1 * level, 0, 0), b * 0.35, glow(col)), block((-0.15, 0, b + 0.02), (0.2, b * 0.8, 0.03), glow(col))]
    return M
def turret(level, col):
    M = [RS.zcyl((0, 0, -0.15), 0.5, 0.08, GUN2, 24), sphere((0, 0, 0.0), 0.36 + 0.03 * level, GUN, squash=0.75)]
    n = 1 if level == 0 else 2
    for k in range(n): y = 0 if n == 1 else (k - 0.5) * 0.22; M += [barrel(0.15, 0.85, 0.06 + 0.015 * level, GUN2, y, 0.1), sphere((0.88, y, 0.1), 0.05, glow(col))]
    return M
def pulse(col): return [block((-0.2, 0, 0), (0.35, 0.2, 0.14), GUN), barrel(0.1, 0.8, 0.07, GUN2)] + [loft([(x, 0, 0, 0.11, 0.11, 2), (x + 0.04, 0, 0, 0.11, 0.11, 2)], glow(col), ring=14, axis='x') for x in (0.25, 0.42, 0.59)]
def railgun(level, col):
    L = 0.85 + 0.12 * level; M = [block((-0.25, 0, 0), (0.3, 0.22, 0.16), GUN2)]
    for s in (-1, 1): M += [block((L / 2 - 0.05, s * 0.09, 0), (L / 2, 0.03, 0.07), GUN)]
    M += [block((L / 2 - 0.05, 0, 0), (L / 2, 0.012, 0.02), glow(col)), block((-0.25, 0, 0.17), (0.18, 0.12, 0.02), glow(col))]
    return M
def launcher():
    M = [block((0, 0, 0), (0.55, 0.38, 0.2), GUN)]
    for i in range(3):
        for j in range(2): M += [barrel(0.4, 0.58, 0.07, GUN2, -0.22 + i * 0.22, -0.08 + j * 0.16), sphere((0.58, -0.22 + i * 0.22, -0.08 + j * 0.16), 0.045, mat((0.1, 0.1, 0.1), metal=0.2))]
    return M + [block((-0.3, 0, 0.22), (0.15, 0.25, 0.03), glow((1, 0.4, 0.2)))]
def missile():
    body = loft([(-0.7, 0, 0, 0.05, 0.05, 2), (-0.6, 0, 0, 0.1, 0.1, 2), (0.45, 0, 0, 0.1, 0.1, 2), (0.65, 0, 0, 0.06, 0.06, 2), (0.8, 0, 0, 0.003, 0.003, 2)], mat((0.85, 0.85, 0.82), metal=0.5, panel=0.6), ring=16, axis='x')
    M = [body, loft([(0.3, 0, 0, 0.102, 0.102, 2), (0.42, 0, 0, 0.102, 0.102, 2)], mat((0.9, 0.3, 0.2), metal=0.4, panel=0), ring=16, axis='x')]
    for a in range(4): M += [RS.rot_z(block((-0.55, 0.16, 0), (0.1, 0.08, 0.01), GUN2), 0).tf(lambda V, a=a: V @ np.array([[1, 0, 0], [0, math.cos(a * 1.571), -math.sin(a * 1.571)], [0, math.sin(a * 1.571), math.cos(a * 1.571)]]).T)]
    return M + [sphere((-0.72, 0, 0), 0.05, glow((1, 0.6, 0.2)))]
def spitter():
    return [loft([(-0.5, 0, 0, 0.18, 0.15, 2.2), (0.0, 0, 0, 0.26, 0.22, 2.2), (0.5, 0, 0, 0.12, 0.1, 2), (0.75, 0, 0, 0.07, 0.07, 2)], BONE, ring=16, axis='x'), sphere((0.78, 0, 0), 0.07, glow((0.6, 1.0, 0.3))), sphere((-0.1, 0.12, 0.18), 0.06, GREEN), sphere((0.15, -0.1, 0.19), 0.05, GREEN)]
def magma():
    M = [block((-0.25, 0, 0), (0.35, 0.3, 0.2), RS.FORGE), barrel(0.05, 0.85, 0.15, COPPER), barrel(0.6, 0.75, 0.2, RS.FORGE)]
    return M + [sphere((0.88, 0, 0), 0.12, glow((1, 0.45, 0.1))), block((-0.25, 0.31, 0), (0.2, 0.01, 0.12), glow((1, 0.5, 0.15)))]
def resonance():
    M = [block((-0.35, 0, 0), (0.25, 0.2, 0.15), GUN2), loft([(0.0, 0, 0, 0.06, 0.06, 2), (0.35, 0, 0, 0.42, 0.42, 2), (0.4, 0, 0, 0.44, 0.44, 2)], RS.CRYS2, ring=24, axis='x')]
    return M + [sphere((0.45, 0, 0), 0.08, glow((0.8, 0.6, 1.0)))]
def flak():
    rnd = np.random.default_rng(3); M = [RS.zcyl((0, 0, -0.15), 0.45, 0.07, RS.JUNK[0], 12), block((0, 0, 0.05), (0.3, 0.25, 0.15), RS.JUNK[1])]
    for k in range(3): M += [barrel(0.2, 0.75 - 0.08 * k, 0.05, RS.JUNK[2], -0.15 + 0.15 * k, 0.12)]
    return M + [block((-0.1, 0.27, 0.1), (0.08, 0.02, 0.08), glow((1, 0.6, 0.2)))]
def stinger(): return [loft([(-0.5, 0, 0, 0.12, 0.1, 2), (0.2, 0, 0, 0.18, 0.12, 2.5), (0.8, 0, 0, 0.004, 0.004, 2)], RS.CHITIN2, ring=14, axis='x'), sphere((0.5, 0, 0.0), 0.05, glow((1, 0.85, 0.3)))]
def chaingun():
    M = [block((-0.3, 0, 0), (0.3, 0.25, 0.2), GUN)]
    for k in range(6): a = k * math.pi / 3; M += [barrel(0.0, 0.85, 0.035, GUN2, math.cos(a) * 0.1, math.sin(a) * 0.1, 8)]
    return M + [barrel(0.6, 0.66, 0.16, GUN), barrel(0.15, 0.21, 0.16, GUN), block((-0.3, 0, 0.21), (0.15, 0.15, 0.02), glow((1, 0.75, 0.3)))]
def mining(level):
    M = [block((-0.3, 0, 0), (0.3, 0.25, 0.18), mat((0.85, 0.65, 0.2), metal=0.5, panel=1.4, grime=2)), barrel(0.0, 0.5, 0.1 + 0.03 * level, GUN2)]
    for s in (-1, 1): M += [block((0.45, s * 0.2, 0), (0.18, 0.03, 0.05), GUN), block((0.62, s * 0.14, 0), (0.05, 0.06, 0.05), GUN)]
    return M + [sphere((0.58, 0, 0), 0.07 + 0.02 * level, glow((1, 0.35, 0.25) if level else (1, 0.8, 0.3)))]
ICONS = {9001: blaster(0, (1, 0.5, 0.2)), 9002: blaster(1, (1, 0.5, 0.2)), 9003: turret(0, (1, 0.5, 0.2)), 9004: turret(1, (1, 0.5, 0.2)), 9005: turret(2, (1, 0.35, 0.2)),
         9006: pulse((0.3, 1, 0.5)), 9007: railgun(0, (0.4, 0.75, 1)), 9008: railgun(1, (0.4, 0.75, 1)), 9009: launcher(), 9010: missile(), 9011: spitter(), 9012: magma(),
         9013: resonance(), 9014: flak(), 9015: stinger(), 9016: chaingun(), 9017: mining(0), 9018: mining(1), 9019: mining(2)}
# Utility models use visibly different silhouettes, with extra modules marking tiers.
TEAL = mat((0.18, 0.55, 0.57), metal=0.55, panel=1.2, rough=0.3)
BLUE = mat((0.22, 0.34, 0.56), metal=0.55, panel=1.0, rough=0.35)
PALE = mat((0.72, 0.79, 0.84), metal=0.65, panel=1.0, rough=0.3)
AMBER = glow((1, 0.64, 0.2))
CYAN = glow((0.3, 0.85, 1))

def armor(level):
    M = []
    for k in range(level + 1):
        M += [block((0.0, 0.0, -0.22 + k * 0.09), (0.53, 0.40, 0.035), PALE)]
    for x in (-0.39, 0.39):
        M += [block((x, 0, -0.20 + level * 0.09), (0.04, 0.40, 0.09), GUN2)]
    return M

def capacitor(level, color=CYAN):
    M = [block((0, 0, -0.22), (0.52, 0.40, 0.05), GUN2)]
    for k in range(level + 1):
        x = (k - level / 2) * min(0.26, 0.86 / max(1, level))
        M += [RS.zcyl((x, 0, 0.02), 0.10, 0.25, TEAL),
              RS.zcyl((x, 0, 0.28), 0.075, 0.02, color)]
    return M

def thruster(level):
    M = [block((-0.35, 0, 0), (0.22, 0.34, 0.22), PALE)]
    for k in range(level + 1):
        y = (k - level / 2) * min(0.25, 0.78 / max(1, level))
        M += [barrel(-0.15, 0.5, 0.10, GUN2, y), barrel(0.4, 0.6, 0.14, COPPER, y),
              sphere((0.61, y, 0), 0.075, CYAN)]
    return M

def gyro(level):
    M = [sphere((0, 0, 0), 0.15, COPPER)]
    for k in range(level + 1):
        ring = RS.flat_torus(0.33 + k * 0.12, 0.035, PALE, n=32, k=8)
        M += [ring.tf(lambda V, k=k: V @ np.array([[1, 0, 0], [0, math.cos(0.5 + k * 0.7), -math.sin(0.5 + k * 0.7)], [0, math.sin(0.5 + k * 0.7), math.cos(0.5 + k * 0.7)]]).T)]
    return M + [block((0, 0, -0.42), (0.23, 0.23, 0.06), GUN2)]

def cargo(level):
    M = []
    for k in range(level + 1):
        x = (k - level / 2) * 0.40
        M += [block((x, 0, 0), (0.18, 0.35, 0.28), COPPER),
              block((x, 0, 0.29), (0.14, 0.035, 0.012), AMBER)]
        for y in (-0.22, 0.22):
            M += [block((x, y, 0), (0.19, 0.025, 0.30), GUN2)]
    return M

def fuel(level):
    M = [block((0, 0, -0.26), (0.53, 0.42, 0.05), GUN2)]
    for k in range(level + 1):
        x = (k - level / 2) * 0.38
        M += [RS.zcyl((x, 0, 0.02), 0.16, 0.27, COPPER),
              RS.zcyl((x, 0, 0.32), 0.07, 0.035, GUN2)]
    return M

def solar():
    M = [block((0, 0, 0), (0.12, 0.25, 0.12), PALE)]
    for side in (-1, 1):
        for k in range(3):
            M += [block((side * (0.25 + k * 0.18), 0, 0), (0.08, 0.37, 0.015), RS.SOLAR)]
    return M + [sphere((0, 0, 0.16), 0.07, AMBER)]

def navigation(level):
    M = [block((0, 0, -0.12), (0.40, 0.36, 0.15), GUN2),
         block((0, 0, 0.05), (0.34, 0.29, 0.025), BLUE)]
    for k in range(level + 2):
        x = -0.24 + k * 0.16
        M += [RS.zcyl((x, 0.07, 0.09), 0.035, 0.015, CYAN)]
    M += [RS.flat_torus(0.23, 0.015, CYAN, z=0.10, n=32, k=6),
          block((0, -0.22, 0.09), (0.26, 0.02, 0.015), AMBER)]
    return M

def drone(alien=False):
    body = PALE if alien else GUN
    M = [sphere((0, 0, 0), 0.27, body, squash=0.6)]
    for y in (-0.35, 0.35):
        M += [block((-0.12, y, 0), (0.23, 0.13, 0.045), TEAL if alien else GUN2),
              sphere((-0.35, y, 0), 0.06, CYAN)]
    return M + [sphere((0.24, 0, 0.03), 0.07, CYAN)]

def bay(alien=False):
    M = [block((0, 0, 0), (0.44, 0.45, 0.19), PALE if alien else GUN)]
    for y in (-0.22, 0.22):
        M += [block((0.45, y, 0), (0.025, 0.18, 0.12), GUN2),
              block((0.48, y, 0.13), (0.02, 0.15, 0.02), CYAN)]
    return M

def veil():
    M = [RS.zcyl((0, 0, -0.15), 0.46, 0.09, GUN2), sphere((0, 0, 0.05), 0.32, RS.CRYS2, squash=0.65)]
    for k in range(3):
        M += [RS.flat_torus(0.23 + k * 0.12, 0.018, glow((0.7, 0.4, 1)), z=0.10 + k * 0.06, n=32, k=6)]
    return M

def mine():
    M = [sphere((0, 0, 0), 0.28, GUN)]
    for k in range(6):
        a = k * math.pi / 3
        M += [RS.arm(a, 0.23, 0.48, 0.045, GUN2), RS.light(a, 0.49, 0, AMBER, 0.04)]
    return M

def seating():
    # Five individual passenger seats: three aft, two forward, fixed to one deck.
    M = [block((0, 0, -0.22), (0.58, 0.56, 0.04), GUN2)]
    for x, y in [(-0.32, 0.27), (0, 0.27), (0.32, 0.27), (-0.18, -0.27), (0.18, -0.27)]:
        M += [block((x, y, -0.10), (0.115, 0.14, 0.035), BLUE),
              block((x, y + 0.12, 0.055), (0.115, 0.03, 0.15), TEAL),
              block((x, y + 0.12, 0.22), (0.09, 0.035, 0.035), PALE)]
        for side in (-1, 1):
            M += [block((x + side * 0.12, y, -0.035), (0.018, 0.12, 0.025), PALE)]
    return M

for i in range(5):
    ICONS[560 + i] = armor(i)
    ICONS[565 + i] = capacitor(i)
for i in range(4): ICONS[570 + i] = thruster(i)
for i in range(3):
    ICONS[574 + i] = gyro(i)
    ICONS[577 + i] = cargo(i)
    ICONS[580 + i] = fuel(i)
ICONS.update({
    444: railgun(1, (0.5, 1, 0.9)), 445: resonance(),
    446: launcher(), 447: missile(), 448: turret(2, (0.6, 1, 0.9)),
    449: bay(True), 450: drone(True), 451: solar(),
    452: capacitor(3, glow((0.7, 0.5, 1))), 453: fuel(2) + [sphere((0, 0, 0.4), 0.12, CYAN)],
    583: solar(), 584: navigation(1), 585: gyro(2),
    598: turret(1, (1, 0.4, 0.2)), 599: pulse((0.5, 0.5, 1)),
    600: launcher(), 601: missile(), 602: bay(), 603: drone(),
    604: pulse((0.4, 0.9, 1)), 605: veil(), 606: thruster(2),
    608: capacitor(4, glow((0.8, 0.45, 1))), 609: armor(4),
    610: navigation(2), 611: launcher(), 612: missile(),
    613: bay(), 614: mine(), 615: mining(1), 9020: seating(),
})

def bg(S):
    lin = (np.arange(S) + 0.5) / S * 2 - 1; X, Y = np.meshgrid(lin, lin); R = np.hypot(X, Y)
    a = np.clip(0.2 + 0.75 * (1 - R) * 1.4, 0.2, 0.95); c = np.stack([8 + 10 * (1 - R), 8 + 10 * (1 - R), 16 + 12 * (1 - R)], -1) / 255
    ring = np.exp(-((R - 0.78) / 0.05) ** 2) * 0.08; return np.clip(c + ring[..., None], 0, 1), a
def render_icon(model, size):
    # Supersampling renders geometry at 2x the requested resolution before resolve.
    rgb, a = render(model, size, 35, size * 0.48, tilt=55, density=16, ss=2)[0]
    brgb, ba = bg(size)
    out_a = a + ba * (1 - a)
    out = (rgb * a[..., None] + brgb * ba[..., None] * (1 - a[..., None])) / np.maximum(out_a, 1e-4)[..., None]
    return Image.fromarray(np.dstack([np.clip(out, 0, 1) * 255, out_a * 255]).astype(np.uint8), 'RGBA')

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', default='client/assets/icons')
    parser.add_argument('--size', type=int, default=256)
    parser.add_argument('--only', type=int, nargs='+')
    args = parser.parse_args()
    if args.size < 64 or args.size > 1024:
        parser.error('--size must be between 64 and 1024')
    ids = args.only or sorted(ICONS)
    unknown = set(ids) - ICONS.keys()
    if unknown:
        parser.error('Unknown icon IDs: ' + ', '.join(map(str, sorted(unknown))))
    os.makedirs(args.output, exist_ok=True)
    for id_ in ids:
        render_icon(ICONS[id_], args.size).save(os.path.join(args.output, f'{id_}.png'), optimize=True)
        print(id_, flush=True)
