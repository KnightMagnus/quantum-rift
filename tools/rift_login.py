"""Quantum Rift 2.5: the login backdrop, composed from the game's own renders: a city-lit world filling the lower left
(tools/rift_planets.py at high resolution), its moon, nebulae and galaxies from the scenery set, a low sun with a flare,
and a patrol of Quantum ships crossing toward the Rift. Output: client/assets/ui/login_bg.jpg (1920x1080)
usage: python3 tools/rift_login.py client/assets/ui/login_bg.jpg      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
import rift_planets as RP

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/ui/login_bg.jpg'
A = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'assets')
W, H = 1920, 1080; r = np.random.default_rng(2025)
img = Image.new('RGBA', (W, H), (3, 4, 10, 255))
# stars
st = np.zeros((H, W, 3))
for _ in range(2600):
    x, y = r.integers(0, W), r.integers(0, H); b = r.uniform(0.25, 1.0) ** 2; c = np.array([1, 1, 1]) if r.random() < 0.7 else np.array(r.choice([(0.8, 0.85, 1.0), (1.0, 0.9, 0.75)]))
    st[y, x] = c * b
    if b > 0.7: st[max(0, y - 1):y + 2, max(0, x - 1):x + 2] += c * b * 0.25
img = Image.fromarray((np.clip(st, 0, 1) * 255).astype(np.uint8)).convert('RGBA')
def add(im, x, y, alpha=1.0, mode='alpha'):
    global img
    im = im.convert('RGBA')
    if mode == 'add':
        base = np.asarray(img).astype(float); a = np.asarray(im).astype(float); h_, w_ = a.shape[:2]
        x0, y0 = max(0, x), max(0, y); x1, y1 = min(W, x + w_), min(H, y + h_)
        if x1 <= x0 or y1 <= y0: return
        sub = a[y0 - y:y1 - y, x0 - x:x1 - x]; base[y0:y1, x0:x1, :3] += sub[..., :3] * (sub[..., 3:4] / 255) * alpha
        img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)); return
    if alpha < 1: a = np.asarray(im).copy(); a[..., 3] = (a[..., 3] * alpha).astype(np.uint8); im = Image.fromarray(a)
    layer = Image.new('RGBA', (W, H), (0, 0, 0, 0)); layer.paste(im, (x, y), im); img = Image.alpha_composite(img, layer)
# nebulae and a galaxy, additive
for nm, x, y, s, a in [('nebula_3', 900, -200, 1300, 0.55), ('nebula_6', -300, 100, 1100, 0.45), ('nebula_1', 1200, 350, 900, 0.35), ('galaxy_2', 1500, 80, 260, 0.8)]:
    f = os.path.join(A, 'decor', nm + '.webp')
    if os.path.exists(f): add(Image.open(f).resize((s, s), Image.LANCZOS), x, y, a, 'add')
# the sun and its flare, upper left
yy, xx = np.mgrid[0:H, 0:W]; d = np.hypot(xx - 260, yy - 170)
sun = (np.exp(-d / 14) * 2.2 + np.exp(-d / 120) * 0.5 + np.exp(-d / 500) * 0.18)[..., None] * np.array([1.0, 0.93, 0.8])
streak = (np.exp(-np.abs(yy - 170) / 3) * np.exp(-np.abs(xx - 260) / 700) * 0.5)[..., None] * np.array([0.8, 0.85, 1.0])
base = np.asarray(img).astype(float); base[..., :3] += (sun + streak) * 255; img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
# the moon
RP.S = 360; RP.SS = 2
moon = [s for s in RP.SPECS if s['id'] == 'barren3'][0]; mim, _ = RP.render(moon); add(mim.resize((230, 230), Image.LANCZOS), 1500, 520)
# the great world, lower left, with city lights on its night side
RP.S = 1500; RP.SS = 1
w = dict([s for s in RP.SPECS if s['id'] == 'terran0'][0]); w['lights'] = 1.2; w['seed'] = 4242
wim, _ = RP.render(w); add(wim.resize((2300, 2300), Image.LANCZOS), -900, 420)
# a patrol of Quantum ships heading for the Rift
def ship(h, frame, size, x, y, glow=True):
    f = os.path.join(A, 'ships', f'{h}.png'); g = os.path.join(A, 'ships', f'{h}_glow.png')
    if not os.path.exists(f): return
    sh = Image.open(f).convert('RGBA'); fs = sh.width // 6; fr = sh.crop(((frame % 6) * fs, (frame // 6) * fs, (frame % 6 + 1) * fs, (frame // 6 + 1) * fs)).resize((size, size), Image.LANCZOS)
    add(fr, x, y)
    if glow and os.path.exists(g):
        gl = Image.open(g).convert('RGBA'); gf = gl.crop(((frame % 6) * fs, (frame // 6) * fs, (frame % 6 + 1) * fs, (frame // 6 + 1) * fs)).resize((size, size), Image.LANCZOS); add(gf, x, y, 1.0, 'add')
for h, fr, sz, x, y in [(829, 7, 300, 1180, 600), (823, 7, 150, 1020, 760), (823, 7, 140, 1430, 820), (821, 7, 90, 900, 520)]: ship(h, fr, sz, x, y)
# vignette
v = 1 - 0.55 * np.clip((np.hypot((xx - W / 2) / W, (yy - H / 2) / H) - 0.25) * 1.6, 0, 1)
base = np.asarray(img).astype(float); base[..., :3] *= v[..., None]; img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
img.convert('RGB').save(OUT, quality=84, optimize=True, progressive=True); print(OUT, os.path.getsize(OUT) // 1024, 'KB')
