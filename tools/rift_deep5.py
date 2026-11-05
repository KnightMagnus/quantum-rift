"""Quantum Rift: the Deep's set pieces, built with the ship generator (tools/ships26) and the Nhal's own organic parts
(hulls_nhal.py: wet black flesh, old bone, crimson eyes, ichor), so they belong with the Nhal ships.
  deep_tendrils_0   tentacles rising out of a black wound in space
  deep_tendrils_1   one vast arm coiled round a captured rock
  deep_ribcage_0    a drifting spine and ribcage, longer than a station, with a fragment of skull
  deep_eggs_0       a cluster of veined egg sacs, shapes curled inside, glowing faintly
  deep_polyp_0      an organic spire ringed with mouths and eyes
  deep_eyestalks_0  a fleshy mass sprouting eyes on long stalks, all turned the same way
  deep_carcass_0    a dead ship's hull overgrown with flesh, tendrils through its broken plates
  deep_membrane_0   a huge veined sac with something large and still inside
  deep_fleshrock_0  an asteroid erupting with growths and opening eyes
  deep_jaw_0        a ring of fangs on raw gums, drifting open, nothing behind it
Rendered like the Nhal previews (3/4 view) to a decor sprite with the glow layer composited.
usage: PYTHONHASHSEED=0 python3 rift_deep5.py <path to tools/ships26> <decor dir> [names...]"""
import sys, os, math
SHIPS, OUT = sys.argv[1], sys.argv[2]; ONLY = sys.argv[3:]
os.environ['RIFT_SHIPS26'] = SHIPS; sys.path.insert(0, SHIPS); sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_a = sys.argv; sys.argv = [_a[0]]
import hulls_nhal as N
sys.argv = _a
import numpy as np
from PIL import Image
from render2 import render, mat, loft, sphere, block, Mesh
from hulls5 import rod, xf, mv, rotm, hoop
from hulls_nhal import FLESH, FLESH2, MEMB, BONE, TOOTH, SAC, SCLERA, EYE, ICHOR, eye, curve, tentacle, spike, teeth_ring, ribs, body, ichor_glow
ROCKD = mat((0.2, 0.18, 0.17), metal=0.1, rough=0.85, panel=0.2, grime=2.5)
HULLD = mat((0.28, 0.27, 0.27), metal=0.6, rough=0.45, panel=2.0, grime=2.6)
VOID = mat((0.0, 0.0, 0.0), metal=0.0, rough=1.0, panel=0, grime=0, ambient=0.0)
EMB = mat((0.7, 1.0, 0.3), emissive=(0.5, 0.8, 0.2))
EGG = mat((0.48, 0.5, 0.26), metal=0.25, rough=0.2, panel=0.1, grime=0.6, ambient=0.5)
MEMBG = mat((0.5, 0.14, 0.16), metal=0.3, rough=0.2, panel=0.05, grime=0.5, ambient=0.5)

def want(n): return not ONLY or n in ONLY
def comp(o):
    rgb, a = o[0]
    lr, la = o[2]; rgb = np.where(la[..., None] > 0.2, lr, rgb); a = np.maximum(a, (la > 0.2) * 1.0)
    gr, ga = o[1]; m = gr.max(axis=2); gal = np.clip(m * 2, 0, 1) * np.clip(ga * 1.3, 0, 1)
    out = np.clip(np.clip(rgb, 0, 1) * a[..., None] + gr * gal[..., None] * 0.9, 0, 1)
    return Image.fromarray(np.dstack([out * 255, np.clip(np.maximum(a, gal), 0, 1) * 255]).astype(np.uint8), 'RGBA')
def save(M, name, size=420, tilt=40, heading=25):
    if not want(name): return
    V = np.concatenate([m.V for m in M]); r = np.sqrt((V ** 2).sum(1)).max()
    im = comp(render(M, size, heading, size * 0.44 / r, tilt=tilt, ss=2, density=size / 18))
    bb = im.getbbox(); im = im.crop(bb); s_ = int(max(im.size) * 1.06); sq = Image.new('RGBA', (s_, s_)); sq.paste(im, ((s_ - im.width) // 2, (s_ - im.height) // 2))
    sq.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=88, method=6); print(name, flush=True)
def lump(c, r, m=FLESH, seed=0, squash=.8):
    rng = np.random.default_rng(seed); out = [sphere(c, r, m, squash=squash)]
    for _ in range(4):
        d = rng.normal(size=3); d /= np.linalg.norm(d); out.append(sphere(tuple(np.array(c) + d * r * .7), r * rng.uniform(.35, .6), m, squash=squash))
    return out

# tentacles out of a wound in space
if want('deep_tendrils_0'):
    M = [loft([(-.02, 0, 0, .36, .22, 2), (.01, 0, 0, .36, .22, 2)], VOID, ring=32, axis='z'), mv(xf(hoop(.37, .03, FLESH2, tilt_x=0), np.diag([1, .62, 1])), 0, 0, 0)]
    for k in range(7):   # arms rising out of the wound, each reaching and curling
        a = 2 * math.pi * k / 7 + .3; L = .55 + .2 * ((k * 3) % 4) / 3
        bx, by = .24 * math.cos(a), .14 * math.sin(a)
        f = lambda t, a=a, bx=bx, by=by, L=L, k=k: (bx + math.cos(a) * (.3 * t + .12 * math.sin(t * 5 + k)), by + math.sin(a) * (.3 * t + .12 * math.cos(t * 4 + k)), L * t - .25 * t ** 3 * (k % 2))
        M += curve(f, 16, .045, .006, FLESH, ring=8)
        for q in range(2, 14, 3):
            x, y, z = f(q / 16); M.append(sphere((x, y, z), .018 * (1 - q / 16) + .006, MEMB))
    M += eye((0, 0, .02), .08, look=(0, -.2, 1))
    save(M, 'deep_tendrils_0', tilt=40)
if want('deep_tendrils_1'):
    rng = np.random.default_rng(3)
    M = [sphere((0, 0, 0), .32, ROCKD, squash=.85)]
    def coil(t):
        a = t * 4.2 * math.pi; R = .36 + .08 * t
        return (R * math.cos(a), R * math.sin(a), -.3 + .6 * t)
    M += curve(coil, 60, .07, .015, FLESH, ring=10)
    for i in range(4, 60, 5):
        x, y, z = coil(i / 60); M.append(sphere((x * 1.08, y * 1.08, z), .022 * (1 - i / 70), MEMB))
    M += curve(lambda t: (.36 + .9 * t, -.1 + .3 * math.sin(t * 4), .3 + .2 * t), 18, .03, .006, FLESH, ring=8)
    save(M, 'deep_tendrils_1', tilt=50)
if want('deep_ribcage_0'):
    M = [rod((0, -.9, 0), (0, .8, 0), .035, BONE)]
    for y in np.linspace(-.85, .75, 22): M.append(sphere((0, y, 0), .05, BONE, squash=.7))
    M += ribs(.55, -.55, 10, .34, .34, .022, BONE, z=0, arc=1.1)
    M += [sphere((0, .95, .05), .17, BONE, squash=.85), sphere((.07, 1.05, .1), .04, SCLERA), sphere((-.07, 1.05, .1), .04, SCLERA)]
    M += teeth_ring((0, 1.03, -.06), .08, 8, .07, .012, TOOTH, inward=.2)
    M += [rod((.5, -.7, .1), (.65, -1.0, .15), .02, BONE), rod((-.55, .2, -.1), (-.75, .1, -.2), .018, BONE)]
    save(M, 'deep_ribcage_0', size=760, tilt=55, heading=35)
if want('deep_eggs_0'):
    rng = np.random.default_rng(5); M = []; G = []
    for k in range(9):
        c = tuple(rng.normal(0, [.28, .28, .1])); r = rng.uniform(.1, .17)
        M.append(sphere(c, r, EGG, squash=1.1)); M.append(sphere((c[0] + r * .15, c[1] - r * .1, c[2] + r * .8), r * .38, EMB, squash=.5))
        for v in range(4):
            a = rng.uniform(0, 6.283); M.append(rod(np.array(c) + [r * math.cos(a), r * math.sin(a), r * .2], np.array(c) + [r * .6 * math.cos(a + .6), r * .6 * math.sin(a + .6), r * .9], .006, FLESH))
    M += lump((0, 0, -.12), .18, FLESH, 6)
    save(M, 'deep_eggs_0', tilt=50)
if want('deep_polyp_0'):
    secs = [(z, 0, 0, w, w, 2) for z, w in ((-.2, .2), (0, .24), (.3, .18), (.6, .14), (.85, .09), (1.0, .04), (1.05, .01))]
    M = [loft(secs, FLESH, ring=20, axis='z')]
    for k, z in enumerate((.1, .45, .78)):
        a = k * 2.1; w = .22 - z * .12
        M += [mv(xf(m, rotm('z', a)), 0, 0, 0) for m in teeth_ring((0, w * .9, z), w * .45, 8, .05, .01, TOOTH, inward=.5)]
        M += eye((w * .95 * math.cos(a + 1.5), w * .95 * math.sin(a + 1.5), z + .08), .04, look=(math.cos(a + 1.5), math.sin(a + 1.5), .2))
    for k in range(5):
        a = k * 1.25; M += tentacle((.2 * math.cos(a), .2 * math.sin(a), -.15), .45, a, r=.025, curl=1.0, phase=k, droop=.25)
    M = [xf(m, rotm('x', -0.35)) for m in M]
    save(M, 'deep_polyp_0', size=560, tilt=35)
if want('deep_eyestalks_0'):
    rng = np.random.default_rng(8); M = lump((0, 0, 0), .22, FLESH, 9)
    for k in range(7):
        a = rng.uniform(0, 6.283); L = rng.uniform(.3, .6)
        tip = (L * math.cos(a) * .7, L * math.sin(a) * .7 + .1, .15 + L * .6)
        M += curve(lambda t, a=a, tip=tip: (tip[0] * t + .05 * math.sin(t * 6 + a), tip[1] * t, .1 + (tip[2] - .1) * t), 10, .025, .012, FLESH2, ring=8)
        M += eye(tip, .05, look=(0, 1, .2))
    save(M, 'deep_eyestalks_0', tilt=45)
if want('deep_carcass_0'):
    M = [block((0, 0, 0), (.16, .6, .12), HULLD), block((0, .7, -.02), (.11, .12, .08), HULLD), block((.05, -.5, .1), (.1, .1, .06), HULLD)]
    for (c, r, sd) in (((.1, .2, .12), .14, 1), ((-.12, -.15, .1), .12, 2), ((0, .55, .08), .1, 3), ((.14, -.45, 0), .1, 4)):
        M += lump(c, r, FLESH, sd)
    for k in range(5):
        a = k * 1.3; M += tentacle((.15 * math.cos(a), -.2 + .1 * k, .05), .5, a + 1.0, r=.022, curl=1.4, phase=k, droop=.1)
    M += eye((.12, .2, .26), .045) + eye((-.1, -.12, .22), .035)
    save(M, 'deep_carcass_0', size=560, tilt=50, heading=30)
if want('deep_membrane_0'):
    M = [sphere((0, 0, 0), .45, MEMBG, squash=.85)]
    rng = np.random.default_rng(11)
    for k in range(14):
        a = rng.uniform(0, 6.283); e = rng.uniform(-.8, .8)
        pts = [(.455 * math.cos(a + t * .9) * math.cos(e * t), .455 * math.sin(a + t * .9) * math.cos(e * t), .38 * math.sin(e * t)) for t in np.linspace(0, 1, 6)]
        M += [rod(p, q, .012, FLESH, ring=5) for p, q in zip(pts, pts[1:])]
    M += eye((.1, .05, .37), .07, look=(0, .4, 1))
    for k in range(4): M += tentacle((.3 * math.cos(k * 1.6), .3 * math.sin(k * 1.6), -.3), .5, k * 1.6, r=.025, curl=.8, phase=k, droop=.3)
    save(M, 'deep_membrane_0', tilt=40)
if want('deep_fleshrock_0'):
    M = [sphere((0, 0, 0), .4, ROCKD, squash=.8)]
    for (c, r, sd) in (((.25, .15, .2), .15, 21), ((-.2, .2, .18), .12, 22), ((.05, -.3, .15), .13, 23)):
        M += lump(c, r, FLESH, sd)
    M += eye((.3, .2, .3), .06, look=(.3, .5, 1)) + eye((-.22, .26, .27), .045, look=(-.2, .6, 1)) + eye((.06, -.35, .26), .05, look=(0, -.2, 1))
    M += spike((-.3, -.2, .1), (-.55, -.4, .3), .03, BONE) + spike((.35, -.1, 0), (.62, -.15, .1), .025, BONE)
    save(M, 'deep_fleshrock_0', tilt=45)
if want('deep_jaw_0'):
    M = [mv(xf(hoop(.42, .08, FLESH2, tilt_x=math.pi / 2), np.diag([1, 1, .85])), 0, 0, 0)]
    M += teeth_ring((0, 0, 0), .42, 22, .22, .03, TOOTH, inward=.55)
    M += [mv(xf(m, rotm('z', math.pi)), 0, 0, 0) for m in teeth_ring((0, 0, 0), .36, 16, .15, .022, TOOTH, inward=.5)][:0]
    M += [sphere((.42 * math.cos(a), 0, .42 * math.sin(a) * .85), .05, FLESH, squash=.7) for a in np.linspace(0, 6.283, 12, endpoint=False)]
    save(M, 'deep_jaw_0', tilt=30, heading=10)
