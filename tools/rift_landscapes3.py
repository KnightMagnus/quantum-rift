"""Quantum Rift: landing pictures for the third-wave worlds, made with tools/rift_landscapes.py (same terrain, sky and
structure renderer, same 612x285 output). Adds forest-moon trees and tree-villages, settler domes and a terminator town.
usage: python3 tools/rift_landscapes3.py client/assets/land <planet render dir> [scene ...]      (needs numpy and Pillow)"""
import sys, os, math, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/land'; PLANETS = sys.argv[2] if len(sys.argv) > 2 else None; ONLY = sys.argv[3:]
_a = sys.argv; sys.argv = [sys.argv[0], OUT]
import rift_landscapes as L
sys.argv = _a
import numpy as np
from PIL import Image, ImageFilter
from rift_render3d import mat, loft, block, sphere
import rift_stations as RS
if PLANETS: L.PLAN = PLANETS
T = L.T

# ---- new structures
BARK = mat((0.32, 0.22, 0.14), metal=0.05, panel=0.4, rough=0.9, grime=1.2)
CANOPY = mat((0.16, 0.32, 0.14), metal=0.0, panel=0, rough=0.9, grime=0.3)
CANOPY2 = mat((0.22, 0.4, 0.18), metal=0.0, panel=0, rough=0.9, grime=0.3)
TIMBER = mat((0.45, 0.32, 0.2), metal=0.05, panel=1.2, rough=0.8, grime=1.0, windows=(-10, 10, (1.0, 0.75, 0.4), 12))
def trees(seed, n=16, tall=1.0):
    """giant trees: straight trunks a long way up to a high canopy"""
    r = np.random.default_rng(seed); M = []
    for i in range(n):
        x, y = r.normal(0, 0.55), r.normal(0, 0.18); h = (1.1 + r.random() * 0.9) * tall; w = 0.045 + r.random() * 0.04
        M += [loft([(0, y, x, w * 1.6, w * 1.6, 2), (0.1, y, x, w, w, 2), (h, y, x, w * 0.7, w * 0.7, 2)], BARK, ring=10, axis='z')]
        for k in range(6): M.append(sphere((x + r.normal(0, 0.12), y + r.normal(0, 0.06), h * (0.78 + 0.06 * k)), 0.2 + r.random() * 0.14, CANOPY if (i + k) % 2 else CANOPY2, squash=0.65))
    return M
def treehouse(seed):
    """a tree village: platforms and huts on the trunks, rope walks between, lamps lit"""
    r = np.random.default_rng(seed); M = trees(seed, 7, 1.15)
    for i in range(6):
        x, y, z = r.normal(0, 0.45), r.normal(0, 0.12), 0.45 + r.random() * 0.6
        M += [RS.zcyl((x, y, z), 0.13, 0.012, TIMBER, ring=14), block((x, y, z + 0.06), (0.06, 0.05, 0.05), TIMBER), sphere((x + 0.07, y, z + 0.04), 0.012, RS.GAMBER)]
    for i in range(4):
        a, b = r.normal(0, 0.45, 2); M.append(block(((a + b) / 2, 0, 0.6), (abs(a - b) / 2 + 0.01, 0.004, 0.004), TIMBER))
    return M
def settler(seed):
    """settler domes, a landing pad and a comms mast"""
    r = np.random.default_rng(seed); M = []
    for i in range(6): M += L.dome(r.normal(0, 0.6), r.normal(0, 0.2), 0.12 + r.random() * 0.14, L.WHITE if i % 3 else None)
    M += [block((0.7, 0.0, 0.01), (0.22, 0.22, 0.01), RS.DARK), RS.zcyl((-0.6, 0.1, 0.35), 0.015, 0.35, RS.GUNM), sphere((-0.6, 0.1, 0.72), 0.02, RS.LRED)]
    return M
L.BUILD.update({'trees': trees, 'treehouse': treehouse, 'settler': settler})

S = {}
def scene(name, **kw): S[name] = kw
# ---- deserts (several settled)
scene('desert_gold_city', sky_top=(80, 120, 185), sky_hz=(240, 210, 160), horizon=0.5, sun=(0.78, 0.2), ground='dunes', amp=14, scale=34, ramp=T((180, 130, 60), (220, 175, 95), (240, 210, 145)), fogd=420, fog=(235, 205, 160),
      structs=[('city', 10, 150, 95), ('settler', -60, 70, 30)], planet=('gas_cream', 0.2, 0.2, 110), planet_a=0.55)
scene('desert_canyon_colony', sky_top=(140, 85, 70), sky_hz=(240, 165, 110), horizon=0.47, sun=(0.25, 0.3), sun_col=(255, 190, 130), ground='mountains', amp=42, scale=55, ridge=1.4, ramp=T((110, 50, 30), (160, 80, 45), (200, 125, 80)), rock=(140, 70, 45), fogd=330, fog=(215, 140, 95),
      structs=[('settler', 0, 60, 34), ('outpost', 40, 110, 30)], lights=True)
scene('desert_lilac', sky_top=(60, 50, 110), sky_hz=(220, 190, 230), horizon=0.5, sun=(0.7, 0.2), sun_col=(250, 230, 255), ground='dunes', amp=12, scale=32, ramp=T((120, 95, 140), (175, 150, 190), (225, 210, 235)), fogd=380, fog=(210, 190, 230),
      structs=[('crystals', -20, 60, 26)], planet=('barren9', 0.25, 0.18, 70), planet_a=0.6)
scene('desert_dome_colony', sky_top=(110, 90, 80), sky_hz=(225, 185, 140), horizon=0.5, sun=(0.7, 0.24), ground='dunes', amp=16, scale=38, ramp=T((110, 75, 45), (155, 115, 70), (195, 155, 105)), fogd=360, fog=(215, 175, 130),
      structs=[('settler', 0, 55, 40), ('city', -70, 170, 70)], planet=('barren6', 0.2, 0.16, 55), planet_a=0.6)
scene('desert_saltflat_city', sky_top=(40, 50, 100), sky_hz=(250, 190, 150), horizon=0.52, sun=(0.82, 0.46), sun_col=(255, 190, 140), ground='dunes', amp=4, scale=60, ramp=T((200, 185, 150), (240, 230, 205)), fogd=420, fog=(240, 200, 170),
      structs=[('city', 0, 170, 120), ('city', -110, 260, 90)])
scene('desert_crimson_glass', sky_top=(60, 20, 30), sky_hz=(210, 110, 100), horizon=0.48, sun=(0.3, 0.25), sun_col=(255, 170, 150), ground='mountains', amp=36, scale=50, ramp=T((80, 20, 25), (150, 45, 50), (205, 110, 105)), rock=(120, 35, 40), fogd=300, fog=(180, 90, 90),
      structs=[('crystals', 0, 70, 36)])
scene('desert_crater_town', sky_top=(70, 90, 140), sky_hz=(220, 205, 175), horizon=0.5, sun=(0.75, 0.18), ground='craters', amp=14, scale=50, ramp=T((120, 100, 75), (175, 150, 115), (220, 200, 165)), fogd=420, fog=(210, 195, 170),
      structs=[('settler', 0, 60, 36), ('outpost', -40, 120, 28)], lights=True, planet=('ringed_rock0', 0.22, 0.2, 120), planet_a=0.7)
# ---- forest moons
scene('forest_moon1', sky_top=(60, 110, 160), sky_hz=(190, 215, 210), horizon=0.44, clouds=0.4, sun=(0.75, 0.15), ground='hills', amp=20, scale=40, ramp=T((18, 40, 18), (28, 60, 24), (40, 75, 32)), rock=(60, 70, 48), fogd=150, fog=(170, 200, 190),
      structs=[('trees', -60, 60, 60), ('treehouse', 10, 45, 55), ('trees', 70, 70, 55), ('trees', -10, 120, 70), ('trees', 50, 160, 70), ('trees', -120, 200, 90), ('trees', 110, 230, 90), ('trees', 0, 280, 110)], planet=('gas_storm', 0.25, 0.16, 230), planet_a=0.85)
scene('forest_moon2', sky_top=(80, 100, 110), sky_hz=(200, 205, 190), horizon=0.46, clouds=0.6, sun=(0.3, 0.2), ground='mountains', amp=34, scale=50, ramp=T((30, 55, 28), (45, 75, 35), (70, 95, 55)), rock=(85, 90, 70), fogd=120, fog=(185, 195, 180),
      structs=[('trees', 0, 50, 70), ('trees', -70, 80, 60), ('treehouse', 60, 70, 50), ('trees', -30, 150, 90), ('trees', 90, 190, 90)], planet=('gas_rust', 0.78, 0.2, 170), planet_a=0.7)
# ---- other new worlds
scene('eyeball_terminator', sky_top=(30, 30, 60), sky_hz=(250, 160, 100), horizon=0.5, stars=True, sun=(0.85, 0.5), sun_col=(255, 150, 90), ground='hills', amp=18, scale=45, ramp=T((150, 160, 170), (90, 110, 60), (150, 120, 80)), wq=0.25, water_col=(30, 50, 70), fogd=360, fog=(200, 140, 110),
      structs=[('settler', -10, 60, 34)], lights=True)
scene('ocean_violet', sky_top=(50, 40, 120), sky_hz=(200, 180, 240), horizon=0.48, clouds=0.45, cloud_col=(230, 215, 255), sun=(0.7, 0.2), ground='hills', amp=12, scale=36, h0=6, ramp=T((190, 180, 200), (90, 80, 120)), wq=0.8, water_col=(50, 30, 110), fogd=420, eye=6,
      structs=[('platform', 0, 80, 40)], planet=('gas_aurora', 0.22, 0.2, 100), planet_a=0.6)
scene('ocean_archipelago', sky_top=(40, 130, 200), sky_hz=(190, 230, 240), horizon=0.48, clouds=0.35, sun=(0.75, 0.18), ground='hills', amp=16, scale=30, h0=4, ramp=T((225, 210, 160), (60, 140, 70), (80, 130, 70)), wq=0.65, water_col=(20, 130, 150), fogd=420, eye=7,
      structs=[('city', -20, 120, 70), ('dome', 30, 60, 20)])
scene('terran_autumn', sky_top=(50, 100, 180), sky_hz=(220, 210, 190), horizon=0.5, clouds=0.5, sun=(0.3, 0.22), ground='hills', amp=24, scale=50, ramp=T((160, 80, 35), (190, 120, 50), (140, 110, 80)), rock=(120, 105, 90), wq=0.3, water_col=(30, 60, 90), fogd=360,
      structs=[('city', 20, 140, 90)], planet=('barren7', 0.8, 0.16, 50), planet_a=0.5)
scene('terran_savanna', sky_top=(70, 130, 200), sky_hz=(230, 215, 170), horizon=0.5, clouds=0.3, sun=(0.7, 0.18), ground='hills', amp=12, scale=60, ramp=T((170, 150, 80), (190, 165, 95), (140, 130, 80)), fogd=420, fog=(220, 205, 165),
      structs=[('trees', -30, 70, 30), ('settler', 30, 90, 30)])
scene('jungle_bluegreen', sky_top=(50, 120, 160), sky_hz=(180, 220, 220), horizon=0.46, clouds=0.7, sun=(0.6, 0.12), ground='hills', amp=24, scale=35, ramp=T((20, 70, 70), (30, 100, 90), (50, 115, 100)), rock=(60, 90, 85), wq=0.2, water_col=(25, 70, 70), fogd=160, fog=(160, 205, 200),
      structs=[('dome', 0, 50, 22), ('trees', -40, 70, 40)])
scene('toxic_teal', sky_top=(20, 70, 70), sky_hz=(120, 210, 190), horizon=0.5, clouds=0.7, cloud_col=(150, 230, 210), sun=(0.6, 0.15), ground='hills', amp=22, scale=40, ramp=T((25, 70, 60), (45, 110, 95), (80, 150, 130)), wq=0.3, water_col=(20, 90, 70), fogd=150, fog=(120, 200, 180),
      structs=[('arcology', 0, 80, 45)])
scene('toxic_redhaze', sky_top=(90, 25, 20), sky_hz=(220, 120, 90), horizon=0.5, clouds=0.75, cloud_col=(220, 130, 100), sun=(0.3, 0.2), sun_col=(255, 190, 150), ground='mountains', amp=30, scale=50, ramp=T((80, 25, 20), (130, 50, 35), (170, 90, 70)), fogd=150, fog=(200, 110, 85),
      structs=[('dome', 0, 60, 22)])
scene('city_neon', sky_top=(4, 4, 18), sky_hz=(70, 30, 90), horizon=0.42, stars=True, sun=(0.9, 0.5), sun_col=(255, 120, 200), ground='city', amp=6, scale=40, ramp=T((30, 30, 42), (55, 50, 70)), fogd=300, fog=(70, 35, 90), amb=0.18, lights=True,
      structs=L.SPRAWL(7), planet=('barren8', 0.15, 0.15, 60), planet_a=0.8)
scene('crystal_gold', sky_top=(60, 40, 10), sky_hz=(240, 200, 120), horizon=0.5, sun=(0.75, 0.18), ground='hills', amp=18, scale=40, ramp=T((120, 90, 40), (170, 135, 65), (215, 180, 100)), fogd=300, fog=(220, 180, 110),
      structs=[('crystals', 0, 40, 30), ('crystals', 30, 80, 36)])
scene('crystal_emerald', sky_top=(10, 40, 25), sky_hz=(130, 210, 160), horizon=0.5, clouds=0.3, cloud_col=(200, 250, 220), sun=(0.3, 0.2), ground='mountains', amp=30, scale=50, ramp=T((30, 80, 50), (60, 140, 90), (140, 210, 160)), fogd=300, fog=(120, 200, 150),
      structs=[('crystals', 10, 50, 36), ('crystals', -30, 90, 40)])
scene('iron_plains', sky_top=(0, 0, 4), sky_hz=(30, 28, 30), horizon=0.5, stars=True, sun=(0.8, 0.12), ground='craters', amp=12, scale=55, ramp=T((90, 85, 82), (150, 145, 140), (200, 195, 190)), fogd=5000, fog=(20, 18, 20), amb=0.1, light=(-0.6, 0.45, 0.45),
      structs=[('foundry', 0, 70, 50)])
scene('carbon_plains', sky_top=(0, 0, 3), sky_hz=(20, 18, 24), horizon=0.5, stars=True, sun=(0.2, 0.15), ground='hills', amp=14, scale=45, ramp=T((15, 15, 17), (35, 35, 38), (70, 70, 75)), fogd=5000, fog=(14, 14, 18), amb=0.1,
      structs=[('outpost', 0, 60, 30)], planet=('gas_hot', 0.72, 0.25, 160), planet_a=1.0)
scene('shattered_seams', sky_top=(15, 6, 6), sky_hz=(130, 50, 30), horizon=0.5, stars=True, sun=(0.75, 0.25), sun_col=(255, 140, 80), ground='mountains', amp=40, scale=45, ramp=T((35, 30, 28), (60, 50, 45), (90, 80, 70)), lava=True, fogd=250, fog=(110, 45, 30), amb=0.3,
      structs=[('foundry', 10, 80, 50)])
scene('ice_teal', sky_top=(30, 70, 90), sky_hz=(160, 225, 215), horizon=0.5, clouds=0.3, sun=(0.7, 0.2), ground='mountains', amp=34, scale=55, ramp=T((110, 170, 160), (180, 225, 215), (235, 250, 248)), rock=(90, 140, 135), fogd=400, fog=(160, 215, 205),
      structs=[('outpost', 0, 60, 28)])
scene('ice_deepblue', sky_top=(5, 15, 50), sky_hz=(70, 110, 180), horizon=0.5, stars=True, aurora=True, sun=(0.15, 0.45), sun_col=(190, 210, 255), ground='hills', amp=22, scale=50, ramp=T((60, 100, 160), (130, 170, 225), (220, 235, 250)), fogd=420, fog=(80, 120, 180),
      structs=[('dome', 0, 50, 20), ('settler', -40, 90, 30)], lights=True)
scene('lava_sulfur', sky_top=(40, 35, 10), sky_hz=(200, 170, 60), horizon=0.5, clouds=0.5, cloud_col=(170, 150, 60), sun=(0.8, 0.25), sun_col=(255, 230, 140), ground='mountains', amp=34, scale=50, ramp=T((50, 45, 20), (95, 85, 35), (140, 125, 60)), lava=True, fogd=260, fog=(170, 150, 60), amb=0.35,
      structs=[('foundry', 0, 70, 46)])
scene('moon_irregular', sky_top=(0, 0, 3), sky_hz=(6, 6, 10), horizon=0.62, stars=True, sun=(0.85, 0.12), ground='craters', amp=22, scale=40, ramp=T((60, 55, 50), (115, 105, 95), (165, 155, 145)), fogd=5000, fog=(8, 8, 10), amb=0.08, light=(-0.7, 0.4, 0.4),
      structs=[('settler', 0, 45, 30)], planet=('gas_cream', 0.3, 0.3, 300), planet_a=1.0, lights=True)
scene('moon_ringed_sky', sky_top=(0, 0, 3), sky_hz=(10, 10, 16), horizon=0.55, stars=True, sun=(0.2, 0.1), ground='craters', amp=14, scale=50, ramp=T((140, 160, 180), (200, 215, 230), (240, 245, 250)), fogd=5000, fog=(10, 10, 16), amb=0.08,
      structs=[('dome', 0, 50, 20)], planet=('ringed_ice0', 0.62, 0.3, 320), planet_a=1.0)

# which world each landing picture belongs to
FOR = {'desert_gold_city': 'desert8', 'desert_canyon_colony': 'desert9', 'desert_lilac': 'desert10', 'desert_dome_colony': 'desert11', 'desert_saltflat_city': 'desert12',
       'desert_crimson_glass': 'desert13', 'desert_crater_town': 'desert14', 'forest_moon1': 'forest0', 'forest_moon2': 'forest1', 'eyeball_terminator': 'eyeball0, eyeball1',
       'ocean_violet': 'ocean5', 'ocean_archipelago': 'ocean6', 'terran_autumn': 'terran5', 'terran_savanna': 'terran6', 'jungle_bluegreen': 'jungle3', 'toxic_teal': 'toxic4',
       'toxic_redhaze': 'toxic5', 'city_neon': 'city2', 'crystal_gold': 'crystal3', 'crystal_emerald': 'crystal4', 'iron_plains': 'iron0', 'carbon_plains': 'carbon0',
       'shattered_seams': 'shattered0', 'ice_teal': 'ice5', 'ice_deepblue': 'ice7', 'lava_sulfur': 'lava4', 'moon_irregular': 'irr_4, irr_5, irr_7', 'moon_ringed_sky': 'moons of ringed worlds'}

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for name, sp in S.items():
        if ONLY and name not in ONLY: continue
        img = L.build_scene(name, sp)
        im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((L.W, L.H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 40, 2))
        im.save(os.path.join(OUT, f'l_{name}.jpg'), quality=87); print(name, flush=True)
