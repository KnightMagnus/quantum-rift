"""Render capital hulls from the ship generator (tools/ships26) as sources for broken wreck scenery.
usage: PYTHONHASHSEED=0 python3 tools/wreck_sources.py <ships26 dir> <out dir>"""
import sys, os
S26, OUT = sys.argv[1], sys.argv[2]; sys.path.insert(0, S26); os.makedirs(OUT, exist_ok=True)
_a = sys.argv; sys.argv = sys.argv[:1]
import rift_ships26  # registers every hull module's DESIGNS
sys.argv = _a
import numpy as np
from PIL import Image
from artgen3 import build
from render2 import render
SMALL = [('mule', 30), ('dory', 200), ('wayfarer', 110), ('cutlass', 70), ('kestrel', 300), ('lacewing', 150), ('korrund_skiff', 240), ('vashari_mantis', 20), ('sarn_kite', 330), ('thalassi_manta', 90), ('ylith_glint', 180), ('umbral_shade', 270)]
for key, hd in SMALL + [('korrund_mountain', 20), ('ylith_cathedral', 300), ('vashari_brood', 60), ('thalassi_abyssal', 210), ('sarn_grand', 120), ('umbral_dread', 250), ('tempest', 160), ('pilgrim', 40)]:
    M, G, L, size, sc, dens, _ = build(key)
    o = render(M, 640, hd, 640 * 0.47 / (size * 0.47 / sc), tilt=25, ss=2, density=dens * 2.5)
    rgb, a = o[0]
    Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).astype(np.uint8), 'RGBA').save(os.path.join(OUT, key + '.png')); print(key, flush=True)
