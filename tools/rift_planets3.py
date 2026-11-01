"""Quantum Rift: a third wave of rendered planets for tools/rift_planets.py, so repeated worlds stop repeating.
New colourways for every existing type plus five new kinds of world: eyeball (tidally locked), carbon, iron, shattered
and ringed rocky worlds. Same outputs and manifest fields as the generator.
usage: python3 tools/rift_planets3.py client/assets/planets [id ...]      (needs numpy and Pillow)"""
import sys, os, json, math, zlib, colorsys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/planets'; ONLY = sys.argv[2:]
_argv = sys.argv; sys.argv = [sys.argv[0], OUT]
import rift_planets as RP
sys.argv = _argv
import numpy as np
from PIL import Image, ImageFilter
from rift_noise import fbm, ridged, warped, smooth, lerp, ramp

_fields = RP.fields
def fields(spec, Q, r, P, P2):
    base = spec.get('base', spec['type'])
    qx, qy, qz = Q[:, 0], Q[:, 1], Q[:, 2]; n = len(Q)
    if base == 'eyeball':   # tidally locked: a scorched day pole, a temperate ring at the terminator, an ice night side
        t = qx + 0.18 * fbm(P, qx * 2, qy * 2, qz * 2, 5)
        land = warped(P2, qx * 1.4, qy * 1.4, qz * 1.4, k=0.5, oct=6)
        sea = (land < -0.02) & (np.abs(t) < 0.35)
        hot = ramp(np.clip(t * 1.2 + 0.2, 0, 1), spec['pal']['hot']); cold = ramp(np.clip(-t * 1.5, 0, 1), spec['pal']['cold'])
        mid = lerp(spec['pal']['green'], spec['pal']['dry'], smooth(-0.1, 0.25, t + land * 0.4))
        alb = np.where((t > 0.3)[:, None], hot, np.where((t < -0.3)[:, None], cold, mid))
        alb = lerp(alb, hot, smooth(0.2, 0.4, t)); alb = lerp(alb, cold, smooth(-0.2, -0.4, t))
        alb = np.where(sea[:, None], np.array(spec['pal']['sea'], float), alb)
        water = sea.astype(float); h = np.where(sea, 0, land * 0.3)
        cloud = smooth(0.62, 0.82, fbm(P, qx * 2.4, qy * 2.4, qz * 3, 6) + 0.5) * 0.6 * np.exp(-(t / 0.45) ** 2)
        return alb, h, water, np.zeros((n, 3)), cloud, 1.0
    if base == 'carbon':    # graphite plains, tar seas and diamond glints
        b = fbm(P, qx * 1.6, qy * 1.6, qz * 1.6, 7); alb = ramp(np.clip(b * 1.4 + 0.5, 0, 1), spec['pal']['ramp'])
        cs = RP.craters(r, 40, 0.18); ch, cd = RP.crater_field(Q, cs); alb *= (1 - cd[:, None] * 0.5)
        glint = (fbm(P2, qx * 60, qy * 60, qz * 60, 2) > 0.38).astype(float)
        water = 0.25 + glint * 0.75; h = b * 0.35 + ch
        return alb, h, water, np.zeros((n, 3)), np.zeros(n), 1.2
    if base == 'iron':      # a stripped planetary core: bright metal plains, rust and deep scarps
        b = fbm(P, qx * 1.8, qy * 1.8, qz * 1.8, 6); sc = ridged(P2, qx * 3, qy * 3, qz * 3, 5)
        alb = ramp(np.clip(b * 1.3 + 0.5, 0, 1), spec['pal']['ramp']); alb = lerp(alb, spec['pal']['rust'], smooth(0.1, 0.35, fbm(P2, qx * 4, qy * 4, qz * 4, 4)) * 0.7)
        cs = RP.craters(r, 30, 0.2); ch, cd = RP.crater_field(Q, cs); alb *= (1 - cd[:, None] * 0.6)
        water = 0.55 + 0.3 * (b > 0); h = b * 0.3 + ch - smooth(0.85, 0.97, sc) * 0.12
        return alb, h, water, np.zeros((n, 3)), np.zeros(n), 1.1
    if base == 'shattered': # a world broken into plates, magma glowing in the seams between them
        seeds = r.normal(size=(60, 3)); seeds /= np.linalg.norm(seeds, axis=1, keepdims=True)
        dots = Q @ seeds.T; i1 = np.argmax(dots, 1); d1 = dots[np.arange(n), i1]; dots[np.arange(n), i1] = -9; d2 = dots.max(1)
        gap = d1 - d2 + 0.004 * fbm(P, qx * 20, qy * 20, qz * 20, 3)
        seam = smooth(0.012, 0.0, gap); plate = (np.sin(i1 * 7.13) * 43758.5) % 1
        b = fbm(P, qx * 2, qy * 2, qz * 2, 6); alb = ramp(np.clip(b * 1.3 + 0.5 + (plate - 0.5) * 0.3, 0, 1), spec['pal']['ramp'])
        alb = lerp(alb, (30, 12, 8), seam)
        emis = ramp(seam, [(0, (0, 0, 0)), (0.4, (160, 40, 8)), (1, (255, 170, 60))])
        h = b * 0.3 + plate * 0.12 - seam * 0.25
        return alb, h, np.zeros(n), emis, np.zeros(n), 1.3
    sp = dict(spec, type=base)
    alb, h, water, emis, cloud, bump = _fields(sp, Q, r, P, P2)
    if spec.get('glow'):   # a hot giant's night side, or a brown dwarf's own light
        g = spec['glow']; t = 0.5 + 0.5 * np.sin(qz * spec.get('bands', 9) * math.pi + fbm(P, qx * 2, qy * 2, qz * 2, 4) * 3)
        emis = np.asarray(emis, float) * np.ones((n, 3)) + np.array(g['col'], float)[None, :] * (g['k'] * (0.4 + 0.6 * t))[:, None]
    return alb, h, water, emis, cloud, bump
RP.fields = fields

SPECS = []
def add(id_, base, hue, pal, **kw):
    render_type = {'eyeball': 'terran', 'carbon': 'barren', 'iron': 'barren', 'shattered': 'lava'}.get(base, base)
    if kw.get('glow') and base == 'gas': render_type = 'lava'   # self-lit giants: lava's lighting shows emission on both sides
    sp = dict(id=id_, type=render_type, base=base, hue=hue, pal=pal, seed=zlib.crc32(id_.encode()) % 100000 + 7777, **kw)
    SPECS.append(sp)
H = RP.H; tp = RP.terran_pal

# ---- new colourways of the existing kinds
add('ice5', 'ice', 160, dict(ramp=[(0, (120, 190, 170)), (0.5, (190, 235, 220)), (1, (240, 255, 250))], crack=(40, 110, 100)), craters=6, atm=(170, 255, 230), atmk=0.5)
add('ice6', 'ice', 330, dict(ramp=[(0, (200, 160, 175)), (0.5, (235, 210, 220)), (1, (252, 245, 248))], crack=(150, 80, 110)), craters=10)
add('ice7', 'ice', 215, dict(ramp=[(0, (70, 110, 170)), (0.5, (150, 190, 235)), (1, (230, 245, 255))], crack=(30, 50, 110)), craters=3, atm=(140, 190, 255), atmk=0.6)
add('ice8', 'ice', 35, dict(ramp=[(0, (110, 100, 90)), (0.5, (170, 160, 150)), (1, (215, 210, 205))], crack=(70, 60, 50)), craters=30)
add('barren6', 'barren', 12, dict(ramp=[(0, (90, 40, 28)), (0.5, (160, 80, 52)), (1, (210, 140, 100))]), craters=60, maria=0.3, bumpk=1.3)
add('barren7', 'barren', 50, dict(ramp=[(0, (150, 145, 130)), (0.5, (205, 200, 185)), (1, (245, 242, 230))]), craters=45, maria=0.1, bumpk=1.2)
add('barren8', 'barren', 230, dict(ramp=[(0, (25, 26, 32)), (0.5, (60, 62, 72)), (1, (120, 122, 132))]), craters=90, maria=0.2, bumpk=1.4)
add('barren9', 'barren', 90, dict(ramp=[(0, (60, 70, 45)), (0.5, (110, 120, 80)), (1, (170, 175, 130))]), craters=55, maria=0.35, bumpk=1.3)
add('barren10', 'barren', 30, dict(ramp=[(0, (30, 22, 18)), (0.42, (55, 40, 30)), (0.58, (190, 185, 175)), (1, (230, 228, 222))]), craters=50, maria=0.6, bumpk=1.2)
add('desert5', 'desert', 40, dict(ramp=[(0, (180, 170, 150)), (0.5, (230, 225, 210)), (1, (252, 250, 244))]), craters=4, atm=(230, 220, 200), atmk=0.5, clouds=0.1)
add('desert6', 'desert', 15, dict(ramp=[(0, (110, 30, 15)), (0.4, (190, 70, 35)), (0.75, (230, 130, 70)), (1, (245, 190, 140))]), craters=8, atm=(240, 140, 100), atmk=0.6, clouds=0.12, lights=0.5)
add('desert7', 'desert', 20, dict(ramp=[(0, (35, 32, 30)), (0.5, (85, 78, 70)), (1, (150, 140, 125))]), craters=16, atm=(160, 150, 140), atmk=0.4, clouds=0.25)
# more deserts, several of them settled (night-side city lights)
add('desert8', 'desert', 42, dict(ramp=[(0, (140, 95, 40)), (0.45, (215, 170, 90)), (0.8, (240, 210, 140)), (1, (250, 235, 190))]), craters=5, atm=(240, 210, 150), atmk=0.6, clouds=0.1, lights=0.9)
add('desert9', 'desert', 18, dict(ramp=[(0, (80, 35, 20)), (0.4, (150, 70, 40)), (0.7, (195, 115, 70)), (1, (225, 170, 125))]), craters=10, atm=(230, 140, 100), atmk=0.55, clouds=0.12, lights=0.7)
add('desert10', 'desert', 280, dict(ramp=[(0, (90, 70, 110)), (0.5, (170, 145, 185)), (1, (225, 210, 235))]), craters=8, atm=(210, 180, 240), atmk=0.6, clouds=0.15)
add('desert11', 'desert', 30, dict(ramp=[(0, (75, 50, 30)), (0.45, (140, 100, 60)), (0.8, (185, 145, 95)), (1, (215, 185, 140))], cap=(240, 238, 232)), craters=14, atm=(220, 175, 130), atmk=0.5, clouds=0.18, lights=1.0)
add('desert12', 'desert', 50, dict(ramp=[(0, (185, 165, 120)), (0.5, (235, 220, 180)), (1, (252, 248, 230))]), craters=3, atm=(245, 235, 200), atmk=0.55, clouds=0.08, lights=0.6)
add('desert13', 'desert', 355, dict(ramp=[(0, (70, 15, 20)), (0.5, (150, 40, 45)), (1, (210, 110, 105))]), craters=20, atm=(240, 110, 110), atmk=0.5, clouds=0.05)
add('desert14', 'desert', 36, dict(ramp=[(0, (110, 90, 65)), (0.5, (175, 150, 110)), (1, (225, 205, 165))]), craters=26, atm=(225, 205, 170), atmk=0.45, clouds=0.1, lights=0.8)
# forest moons: small worlds under a single canopy, a few lamps of settlement in the trees
add('forest0', 'jungle', 110, dict(tp(205, 110), dry=H(100, 0.45, 0.35), green=H(115, 0.7, 0.3), forest=H(125, 0.8, 0.16)), sea=-0.3, clouds=0.3, lights=0.35, atm=(160, 210, 255), freq=2.2, warm=0.75, wet=0.6)
add('forest1', 'jungle', 85, dict(tp(190, 85), dry=H(70, 0.5, 0.4), green=H(85, 0.65, 0.3), forest=H(95, 0.75, 0.17)), sea=-0.18, clouds=0.3, lights=0.25, atm=(190, 220, 200), freq=1.9, warm=0.7, wet=0.5)
# more ice, rock and sulphur moons, so the commonest moon types stop repeating
add('ice9', 'ice', 190, dict(ramp=[(0, (150, 200, 215)), (0.5, (205, 235, 242)), (1, (248, 254, 255))], crack=(60, 120, 140)), craters=20)
add('ice10', 'ice', 25, dict(ramp=[(0, (170, 145, 120)), (0.5, (220, 205, 190)), (1, (250, 245, 238))], crack=(120, 80, 55)), craters=12, atm=(230, 210, 190), atmk=0.3)
add('ice11', 'ice', 240, dict(ramp=[(0, (120, 125, 160)), (0.5, (185, 190, 220)), (1, (240, 242, 252))], crack=(70, 60, 120)), craters=40)
add('ice12', 'ice', 175, dict(ramp=[(0, (90, 130, 135)), (0.5, (160, 200, 200)), (1, (225, 245, 245))], crack=(30, 70, 80)), craters=8, clouds=0.2)
add('barren11', 'barren', 40, dict(ramp=[(0, (95, 85, 60)), (0.5, (160, 145, 110)), (1, (215, 200, 165))]), craters=80, maria=0.2, bumpk=1.3)
add('barren12', 'barren', 200, dict(ramp=[(0, (55, 60, 70)), (0.5, (105, 112, 125)), (1, (170, 175, 185))]), craters=110, maria=0.3, bumpk=1.4)
add('barren13', 'barren', 18, dict(ramp=[(0, (70, 50, 45)), (0.5, (130, 100, 88)), (1, (190, 165, 150))]), craters=65, maria=0.45, bumpk=1.3)
add('sulfur1', 'sulfur', 30, dict(ramp=[(0, (140, 80, 30)), (0.5, (215, 150, 70)), (1, (245, 215, 150))]), bumpk=0.8)
add('sulfur2', 'sulfur', 75, dict(ramp=[(0, (110, 120, 40)), (0.5, (190, 200, 90)), (1, (240, 245, 170))]), bumpk=0.8)
# more giants, so the background layer is not one planet over and over
add('gas_sea', 'gas', 195, dict(ramp=[(0, (15, 60, 90)), (0.5, (40, 120, 150)), (1, (150, 210, 225))], storm=(220, 250, 255)), bands=10, storms=2, atm=(120, 210, 240), atmk=0.7, halok=0.6)
add('gas_ochre', 'gas', 38, dict(ramp=[(0, (120, 80, 30)), (0.35, (185, 135, 60)), (0.7, (220, 180, 110)), (1, (240, 220, 175))], storm=(160, 70, 40)), bands=14, storms=3, atm=(230, 190, 130), atmk=0.6, halok=0.55)
add('gas_lilac', 'gas', 285, dict(ramp=[(0, (110, 90, 140)), (0.5, (175, 155, 205)), (1, (235, 225, 245))], storm=(250, 240, 255)), bands=9, storms=1, atm=(210, 190, 245), atmk=0.6, halok=0.55,
    rings=dict(tilt=0.18, rot=0.5, inner=1.4, outer=2.4, gap=0.58, ramp=[(0, (140, 125, 165)), (0.5, (225, 215, 240)), (1, (150, 135, 175))], alpha=0.75))
add('gas_ice', 'gas', 200, dict(ramp=[(0, (175, 200, 220)), (0.5, (215, 230, 242)), (1, (245, 250, 255))], storm=(150, 180, 210)), bands=5, storms=1, atm=(220, 235, 255), atmk=0.7, halok=0.6,
    rings=dict(tilt=0.12, rot=-0.6, inner=1.6, outer=1.85, gap=0.5, ramp=[(0, (110, 125, 140)), (0.5, (175, 190, 205)), (1, (110, 125, 140))], alpha=0.4))
add('ocean5', 'ocean', 265, dict(tp(265, 300), deep=H(265, 0.8, 0.3), shallow=H(250, 0.55, 0.6)), sea=0.2, clouds=0.5, atm=H(265, 0.4, 1.0), freq=1.7, warp=0.7)
add('ocean6', 'ocean', 178, dict(tp(178, 95), deep=H(185, 0.85, 0.42), shallow=H(170, 0.6, 0.78)), sea=0.1, clouds=0.35, lights=0.6, atm=(150, 230, 240), freq=2.6, warp=0.8)
add('terran5', 'terran', 25, tp(212, 25, (180, 120, 70), (120, 90, 70)), sea=-0.05, clouds=0.45, lights=0.8, atm=(120, 170, 255), freq=1.3, warm=0.1, wet=0.15)
add('terran6', 'terran', 55, tp(205, 55, (190, 170, 100)), sea=0.02, clouds=0.35, atm=(130, 180, 255), freq=1.5, warm=0.3)
add('jungle3', 'jungle', 170, dict(tp(200, 170), dry=H(170, 0.5, 0.5), green=H(170, 0.7, 0.42), forest=H(180, 0.8, 0.22)), sea=-0.1, clouds=0.7, atm=(150, 230, 255), freq=1.4, warm=0.45)
add('lava4', 'lava', 50, dict(ramp=[(0, (40, 35, 15)), (0.6, (90, 80, 30)), (1, (140, 125, 60))]), atm=(255, 200, 80), atmk=0.7, halok=0.6)
add('lava5', 'lava', 5, dict(ramp=[(0, (18, 16, 16)), (0.6, (45, 40, 38)), (1, (80, 72, 66))]), atm=(255, 90, 40), atmk=0.5, halok=0.4)
add('toxic4', 'toxic', 165, dict(ramp=[(0, (20, 70, 60)), (0.5, (60, 150, 130)), (1, (150, 220, 200))], sea=(20, 60, 55)), sea=-0.05, clouds=0.7, cloudcol=(160, 240, 215), atm=H(165, 0.5, 0.95))
add('toxic5', 'toxic', 5, dict(ramp=[(0, (90, 25, 20)), (0.5, (160, 60, 40)), (1, (220, 130, 100))], sea=(70, 20, 15)), sea=-0.05, clouds=0.8, cloudcol=(230, 150, 120), atm=H(8, 0.55, 0.95))
add('city2', 'city', 260, dict(tp(225), city=(70, 70, 85), green=(70, 80, 75), forest=(55, 60, 60)), sea=-0.08, clouds=0.2, lights=1.6, atm=(170, 150, 255), freq=1.2)
add('crystal3', 'crystal', 45, dict(a=(220, 170, 80), b=(255, 235, 170), edge=(90, 60, 20), glow=(255, 210, 120)), atm=(255, 210, 120), atmk=0.5, halok=0.5, bumpk=1.5)
add('crystal4', 'crystal', 140, dict(a=(60, 180, 110), b=(180, 255, 210), edge=(15, 60, 35), glow=(120, 255, 170)), atm=(120, 255, 170), atmk=0.5, halok=0.5, bumpk=1.5)
# ---- giants
add('gas_cream', 'gas', 40, dict(ramp=[(0, (190, 170, 130)), (0.5, (235, 222, 190)), (1, (250, 245, 230))], storm=(240, 225, 190)), bands=16, storms=1, atm=(245, 235, 210), atmk=0.6, halok=0.55,
    rings=dict(tilt=0.24, rot=0.35, inner=1.35, outer=2.3, gap=0.66, ramp=[(0, (170, 155, 125)), (0.5, (240, 230, 205)), (1, (180, 165, 135))], alpha=0.8))
add('gas_rust', 'gas', 18, dict(ramp=[(0, (90, 40, 25)), (0.35, (170, 85, 50)), (0.7, (215, 150, 100)), (1, (240, 210, 170))], storm=(250, 230, 200)), bands=11, storms=3, atm=(230, 150, 110), atmk=0.6, halok=0.55,
    rings=dict(tilt=0.33, rot=-0.4, inner=1.3, outer=1.9, gap=0.5, ramp=[(0, (120, 80, 60)), (0.5, (200, 160, 130)), (1, (130, 90, 70))], alpha=0.7))
add('gas_aurora', 'gas', 175, dict(ramp=[(0, (20, 70, 80)), (0.5, (50, 140, 150)), (1, (160, 230, 225))], storm=(200, 255, 245)), bands=8, storms=2, atm=(120, 255, 200), atmk=0.9, halok=0.8)
add('gas_storm', 'gas', 210, dict(ramp=[(0, (150, 175, 210)), (0.5, (205, 220, 240)), (1, (250, 252, 255))], storm=(90, 110, 160)), bands=6, storms=4, atm=(200, 220, 255), atmk=0.6, halok=0.55)
add('gas_hot', 'gas', 10, dict(ramp=[(0, (25, 15, 20)), (0.5, (70, 35, 40)), (1, (130, 80, 70))], storm=(255, 140, 60)), bands=9, storms=2, atm=(255, 120, 60), atmk=0.8, halok=0.7,
    glow=dict(col=(255, 90, 30), k=0.55))
add('gas_dwarf', 'gas', 340, dict(ramp=[(0, (70, 15, 30)), (0.5, (140, 40, 60)), (1, (210, 100, 110))], storm=(255, 170, 150)), bands=12, storms=1, atm=(255, 80, 110), atmk=0.9, halok=0.9,
    glow=dict(col=(255, 60, 70), k=0.8))
# ---- new kinds of world
add('eyeball0', 'eyeball', 30, dict(hot=[(0, (190, 120, 70)), (1, (240, 200, 150))], cold=[(0, (200, 215, 230)), (1, (245, 250, 255))], green=H(110, 0.5, 0.42), dry=(170, 140, 90), sea=H(205, 0.8, 0.35)), atm=(150, 190, 255))
add('eyeball1', 'eyeball', 10, dict(hot=[(0, (150, 50, 25)), (1, (230, 120, 60))], cold=[(0, (150, 165, 190)), (1, (220, 230, 245))], green=H(80, 0.45, 0.38), dry=(150, 100, 70), sea=H(195, 0.7, 0.3)), atm=(220, 170, 150))
add('carbon0', 'carbon', 0, dict(ramp=[(0, (12, 12, 14)), (0.5, (38, 38, 42)), (1, (85, 85, 90))]))
add('iron0', 'iron', 25, dict(ramp=[(0, (90, 92, 96)), (0.5, (150, 152, 156)), (1, (205, 207, 210))], rust=(140, 70, 40)))
add('shattered0', 'shattered', 15, dict(ramp=[(0, (40, 34, 30)), (0.5, (85, 74, 64)), (1, (140, 125, 110))]), atm=(255, 120, 60), atmk=0.4, halok=0.4)
add('ringed_rock0', 'barren', 25, dict(ramp=[(0, (80, 72, 64)), (0.5, (145, 132, 118)), (1, (205, 195, 180))]), craters=60, maria=0.25, bumpk=1.2,
    rings=dict(tilt=0.28, rot=0.2, inner=1.4, outer=2.05, gap=0.55, ramp=[(0, (110, 100, 90)), (0.5, (190, 180, 165)), (1, (120, 110, 100))], alpha=0.75))
add('ringed_ice0', 'ice', 200, dict(ramp=[(0, (150, 180, 210)), (0.5, (210, 228, 245)), (1, (250, 252, 255))], crack=(70, 110, 160)), craters=6,
    rings=dict(tilt=0.22, rot=-0.25, inner=1.45, outer=2.2, gap=0.6, ramp=[(0, (150, 175, 200)), (0.5, (225, 238, 250)), (1, (160, 185, 210))], alpha=0.75))

REFIX = [sp for sp in RP.SPECS if sp.get('rings')]   # gas_saturn, gas_uranus, gas_ember, gas_amber
for sp in REFIX: sp.setdefault('base', sp['type'])
if os.environ.get('REFIX'): SPECS[:] = REFIX

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, 'planets.json'); man = json.load(open(mpath)) if os.path.exists(mpath) else {}
    for sp in SPECS:
        if ONLY and sp['id'] not in ONLY: continue
        im, rf, back, front = RP.render(sp, layers=True)
        im.save(os.path.join(OUT, sp['id'] + '.webp'), 'WEBP', quality=86, method=6)
        back.save(os.path.join(OUT, sp['id'] + '_back.webp'), 'WEBP', quality=80, method=6)
        if front: front.save(os.path.join(OUT, sp['id'] + '_front.webp'), 'WEBP', quality=82, method=6)
        tex, aux, tm = RP.texture(sp); TW, TH = RP.TW, RP.TH
        tex.save(os.path.join(OUT, sp['id'] + '_tex.webp'), 'WEBP', quality=78, method=6)
        A0 = np.asarray(aux)
        A4 = np.dstack([np.asarray(Image.fromarray(np.ascontiguousarray(A0[..., c])).resize((TW * 2 // 3, TH * 2 // 3), Image.LANCZOS)) for c in range(4)])
        A4[..., 0] = np.asarray(Image.fromarray(A4[..., 0]).filter(ImageFilter.GaussianBlur(1.0 if sp['type'] in ('barren', 'sulfur') else 1.2)))
        Image.fromarray(np.concatenate([A4[..., c] for c in range(4)], 0), 'L').save(os.path.join(OUT, sp['id'] + '_aux.webp'), 'WEBP', quality=80, method=6)
        mtype = {'eyeball': 'terran', 'carbon': 'barren', 'iron': 'barren', 'shattered': 'lava'}.get(sp['base'], sp['base'])
        man[sp['id']] = dict(type=mtype, kind=sp['base'], hue=sp['hue'], r=round(rf, 4), rings=bool(sp.get('rings')), lights=bool(sp.get('lights')) or sp['base'] == 'shattered' or bool(sp.get('glow')),
                             tw=TW, th=TH, bk=tm['bk'], ecol=tm['ecol'], atm=[int(c) for c in sp['atm']] if sp.get('atm') is not None else None, atmk=sp.get('atmk', 1.0),
                             cloud=[int(c) for c in sp.get('cloudcol', (248, 249, 252))], gas=sp['base'] == 'gas', night=sp['type'] in ('terran', 'earth', 'ocean', 'jungle', 'city', 'desert'))
        json.dump(man, open(mpath, 'w'), indent=0)
        print(sp['id'], flush=True)
