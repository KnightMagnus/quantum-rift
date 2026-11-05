"""Quantum Rift: fifth-wave frontier set pieces, in the lit 3D style of tools/rift_props3.py (rift_render3d).
  geyser_0         an ice moonlet venting a geyser plume
  comet_nucleus_0  a captured comet nucleus with two active jets
  filament_0       a plasma filament: frozen lightning strung between two rocks
  mega_arc_0       a broken arc of an ancient ring, seams still lit
  mega_panels_0    shattered Dyson panels drifting in a loose fan
  monolith_0       a black monolith with faint lines of light. Never explained.
  wormlet_0        a dormant wormhole mouth, far too narrow for ships
  voidjelly_0..1   drifting gas creatures: a pale bell, trailing threads, glowing spots
  genship_0        a dead generation ship: a long segmented spine and a broken habitat ring
  spores_0         a cloud of glowing spores or crystal dust
usage: python3 rift_props5.py <decor dir> [name ...]"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DECOR = sys.argv[1]; ONLY = sys.argv[2:]
_a = sys.argv; sys.argv = sys.argv[:1]
import rift_stations as S
sys.argv = _a
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh, torus
from rift_noise import Perlin3, fbm
_src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'rift_props3.py')).read()
OBJ = DECOR
exec(_src[_src.index('zcyl, flat_torus'):_src.index('# ---------------------------------------------------------------- satellites')], globals())
def want(n): return not ONLY or any(n.startswith(o) for o in ONLY)

ICEW = mat((0.85, 0.92, 1.0), emissive=(0.55, 0.7, 0.85))           # geyser ice crystals, catching light
JET = mat((0.95, 0.95, 1.0), emissive=(0.8, 0.85, 0.95))
PLASMA = mat((0.7, 0.8, 1.0), emissive=(0.65, 0.8, 1.0)); PLASMA2 = mat((0.9, 0.6, 1.0), emissive=(0.85, 0.55, 1.0))
SEAM = mat((0.4, 0.9, 1.0), emissive=(0.35, 0.85, 1.0))
OBSID = mat((0.04, 0.04, 0.05), metal=0.9, rough=0.08, panel=0, grime=0)
GLYPH = mat((0.6, 0.8, 1.0), emissive=(0.45, 0.65, 0.95))
VIOL = mat((0.6, 0.3, 1.0), emissive=(0.55, 0.25, 1.0)); DSTONE = mat((0.22, 0.2, 0.24), metal=0.4, rough=0.5, panel=0.6, grime=1.5)
JELLY = mat((0.16, 0.24, 0.34), metal=0.5, rough=0.1, panel=0, grime=0, ambient=0.3)
JELLY2 = mat((0.3, 0.16, 0.32), metal=0.5, rough=0.1, panel=0, grime=0, ambient=0.3)
SPOT = mat((0.6, 1.0, 0.9), emissive=(0.5, 1.0, 0.85)); SPOT2 = mat((1.0, 0.6, 0.9), emissive=(1.0, 0.55, 0.85))
SPORE = mat((0.9, 1.0, 0.5), emissive=(0.8, 1.0, 0.4))
HULLD = mat((0.32, 0.31, 0.3), metal=0.6, rough=0.45, panel=2.2, grime=2.4)

def plume(base, direction, length, spread, n, size, m, seed):
    r = np.random.default_rng(seed); d = np.array(direction, float); d /= np.linalg.norm(d); out = []
    side = np.cross(d, [0, 0, 1.0]); side = side / (np.linalg.norm(side) or 1); up = np.cross(side, d)
    for k in range(n):
        t = r.random() ** 0.7; rad = spread * t * r.random()
        a = r.uniform(0, 6.283); p = np.array(base) + d * length * t + (side * math.cos(a) + up * math.sin(a)) * rad
        out.append(sphere(tuple(p), size * (1 - .7 * t) * r.uniform(.6, 1.2), m))
    return out

def jagged(p0, p1, segs, r, m, amp, seed):
    rng = np.random.default_rng(seed); p0, p1 = np.array(p0, float), np.array(p1, float); pts = [p0]
    for k in range(1, segs):
        t = k / segs; pts.append(p0 + (p1 - p0) * t + rng.normal(0, amp, 3) * math.sin(math.pi * t))
    pts.append(p1); return [rod(a, b, r, m, ring=6) for a, b in zip(pts, pts[1:])]

if want('geyser_0'):
    M = [rock(901, ICE, 1.0, 3, 0.5).tf(lambda V: V * .55)]
    M += plume((0.1, .1, .5), (0.25, .1, 1), 1.1, .28, 140, .045, ICEW, 902) + plume((-.2, .05, .45), (-.1, .2, 1), .7, .18, 60, .035, ICEW, 903)
    save(M, DECOR, 'geyser_0', 420, tilt=35, k=.36)
if want('comet_nucleus_0'):
    M = [rock(911, CARBON, 1.5, 4, 0.7).tf(lambda V: V * .45)]
    M += plume((.15, .3, .2), (.3, 1, .4), 1.0, .3, 120, .035, JET, 912) + plume((-.1, -.2, .25), (-.2, .9, .7), .7, .2, 70, .03, JET, 913)
    M += [rock(914 + k, CARBON, 1.0, 1, 0.6).tf(lambda V, c=c: V * .08 + np.array(c)) for k, c in enumerate(((.6, .1, 0), (-.5, .4, .1), (.3, -.6, -.1)))]
    save(M, DECOR, 'comet_nucleus_0', 420, tilt=38, k=.36)
if want('filament_0'):
    M = [rock(921, IRON, 1.1, 3, 0.6).tf(lambda V: V * .25 + np.array([-.75, 0, 0])), rock(922, CARBON, 1.2, 3, 0.6).tf(lambda V: V * .2 + np.array([.75, .1, .05]))]
    M += jagged((-.55, 0, .05), (.58, .1, .05), 14, .022, PLASMA, .08, 923) + jagged((-.55, .02, 0), (.58, .08, .1), 10, .012, PLASMA2, .12, 924)
    M += jagged((-.6, .1, .1), (-.2, .35, .2), 6, .008, PLASMA, .05, 925) + jagged((.62, .05, .1), (.35, -.3, .15), 6, .008, PLASMA, .05, 926)
    save(M, DECOR, 'filament_0', 420, tilt=40, k=.4, crop=True)
if want('mega_arc_0'):
    secs = []
    for k in range(24):
        t = -0.9 + 1.8 * k / 23; R = 1.4
        secs.append((R * math.sin(t), R * math.cos(t) - R + .2, 0, .09, .05, 4))
    arc = loft([(s[1], s[0], s[2], s[3], s[4], s[5]) for s in secs], ANCIENT, ring=10)
    M = [arc]
    for k in range(12):
        t = -0.85 + 1.7 * k / 11; R = 1.4
        M.append(block((R * math.sin(t), R * math.cos(t) - R + .2, .055), (.07, .015, .006), SEAM))
    M += [rock(931 + k, ANCIENT, 1.4, 1, 0.5).tf(lambda V, c=c: V * .07 + np.array(c)) for k, c in enumerate(((1.25, -.5, .05), (1.4, -.7, -.05), (-1.3, -.55, 0)))]
    save(M, DECOR, 'mega_arc_0', 760, tilt=55, k=.43, crop=True)
if want('mega_panels_0'):
    r = np.random.default_rng(941); M = []
    for k in range(9):
        c = (r.uniform(-.8, .8), r.uniform(-.5, .5), r.uniform(-.1, .1)); s_ = r.uniform(.12, .22)
        p = loft([(-.006, 0, 0, s_, s_, 2), (.006, 0, 0, s_, s_, 2)], S.SOLAR if k % 3 else ANCIENT, ring=6, axis='z')
        ax = r.normal(size=3); ax /= np.linalg.norm(ax); ang = r.uniform(.2, 1.2)
        K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]]); Rm = np.eye(3) + math.sin(ang) * K + (1 - math.cos(ang)) * K @ K
        M.append(p.tf(lambda V, Rm=Rm, c=c: V @ Rm.T + np.array(c)))
        M.append(sphere(c, .015, SEAM))
    save(M, DECOR, 'mega_panels_0', 760, tilt=50, k=.43, crop=True)
if want('monolith_0'):
    M = [block((0, 0, 0), (.09, .04, .4), OBSID, sq=12)]
    for k in range(7): M.append(block((0, -.042, -.3 + k * .1), (.05 - .004 * (k % 3), .002, .003), GLYPH))
    save(M, DECOR, 'monolith_0', 420, tilt=30, heading=20, k=.4)
if want('wormlet_0'):
    M = [torus(.5, .08, DSTONE, n=48, k=12), sphere((0, 0, -.01), .43, OBSID, squash=.1), torus(.4, .012, VIOL, n=48, k=6), torus(.3, .006, VIOL, n=40, k=5), torus(.2, .004, PLASMA2, n=32, k=5)]
    r = np.random.default_rng(951)
    for k in range(10):
        a = r.uniform(0, 6.283); rr = r.uniform(.62, .85)
        M.append(rock(952 + k, DSTONE, 1.2, 1, .6).tf(lambda V, a=a, rr=rr: V * r.uniform(.03, .06) + np.array([rr * math.cos(a), rr * math.sin(a), r.uniform(-.05, .05)])))
    save(M, DECOR, 'wormlet_0', 420, tilt=55, k=.42)
for jn, (mm, sp, seed) in enumerate(((JELLY, SPOT, 961), (JELLY2, SPOT2, 971))):
    nm = f'voidjelly_{jn}'
    if not want(nm): continue
    r = np.random.default_rng(seed)
    bell = loft([(z, 0, 0, w, w, 2) for z, w in ((.3, .02), (.28, .22), (.2, .36), (.1, .42), (.03, .44), (0, .4))], mm, ring=28, axis='z')
    M = [bell]
    prof = ((.3, .02), (.28, .22), (.2, .36), (.1, .42), (.03, .44))
    for k in range(10):   # glowing canals running down the bell
        a = 2 * math.pi * k / 10
        pts = [(w * 1.01 * math.cos(a), w * 1.01 * math.sin(a), z) for z, w in prof]
        M += [rod(p_, q_, .007, sp, ring=5) for p_, q_ in zip(pts, pts[1:])]
    for k in range(16):   # a frilled skirt round the rim
        a = 2 * math.pi * k / 16; M.append(sphere((.44 * math.cos(a), .44 * math.sin(a), -.01), .05, mm, squash=.35))
    for k in range(9):
        a = 2 * math.pi * k / 9; x0, y0 = .3 * math.cos(a), .3 * math.sin(a)
        pts = [(x0 * (1 - .4 * t), y0 * (1 - .4 * t) + .1 * math.sin(t * 5 + k), -t * (.9 + .5 * r.random())) for t in np.linspace(0, 1, 11)]
        M += [rod(p, q, .01 * (1 - i / 11) + .003, sp if i % 4 == 3 else mm, ring=5) for i, (p, q) in enumerate(zip(pts, pts[1:]))]
    for k in range(7):
        a = r.uniform(0, 6.283); h = r.uniform(.05, .22); w = .42 - (h - .03) * .9
        M.append(sphere((w * math.cos(a) * .95, w * math.sin(a) * .95, h), .025, sp))
    M.append(sphere((0, 0, .08), .14, sp, squash=.5))
    save(M, DECOR, nm, 420, tilt=30, heading=20, k=.4, crop=True)
if want('genship_0'):
    M = [loft([(1.0, 0, 0, .03, .03, 3), (.8, 0, 0, .08, .08, 4), (-.9, 0, 0, .09, .09, 4), (-1.0, 0, 0, .06, .06, 3)], HULLD, ring=16)]
    for k, y in enumerate((.55, .2, -.15, -.5)):
        M.append(block((0, y, 0), (.14, .12, .12), HULLD if k % 2 else ANCIENT))
    hab = torus(.42, .04, HULLD, n=40, k=8)
    hab.V = hab.V[:, [0, 2, 1]]; hab.V[:, 1] += .35; hab = Mesh(hab.V, hab.F[:, ::-1], HULLD)
    keep = hab.V[:, 0] > -.25
    M.append(Mesh(hab.V, hab.F[np.all(keep[hab.F], axis=1)], HULLD))
    M += [rod((0, .35, 0), (.42 * math.cos(a), .35, .42 * math.sin(a)), .012, S.GUNM) for a in (0.3, 1.9, 4.6)]
    M += [block((r_ * .9, -.95, 0), (.05, .06, .05), S.DARK) for r_ in (-.1, .1)]
    M += [rock(981 + k, HULLD, 1.5, 0, .3).tf(lambda V, c=c: V * .04 + np.array(c)) for k, c in enumerate(((-.5, .4, .1), (-.6, .3, -.05), (.4, -.7, .15)))]
    save(M, DECOR, 'genship_0', 900, tilt=50, heading=35, k=.44, crop=True)
if want('spores_0'):
    r = np.random.default_rng(991); M = []
    for k in range(260):
        c = r.normal(0, [.5, .35, .15]); M.append(sphere(tuple(c), r.uniform(.006, .02), SPORE if k % 5 else SPOT))
    save(M, DECOR, 'spores_0', 420, tilt=40, k=.4)
