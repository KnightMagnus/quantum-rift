"""Quantum Rift scenery (procedural, plus the game's own station sprites for the abandoned stations).
  giant_0..3      far-off gas giants, some ringed, lit from one side
  derelict_0..3   abandoned station platforms: old hulls, dark, scorched, a few lights still burning
  crystal_0..2    floating crystal formations that glow from within
  blackhole_0     a black hole with its accretion disc (drawn far away, slowly turning)
  arc_0..1        a fragment of an ancient megastructure ring
  satellite_0..2  small relay satellites and buoys
  pod_0..2        drifting cargo pods and containers
usage: python3 tools/rift_decor2.py client/assets/decor      (needs numpy, scipy and Pillow)"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/decor'
STATIONS = os.path.join(os.path.dirname(OUT.rstrip('/')), 'stations')
os.makedirs(OUT, exist_ok=True)

def fbm(n, octaves=6, base=4, persist=0.55, seed=0, m=None):
    r = np.random.default_rng(seed); m = m or n; out = np.zeros((n, m)); amp = 1; tot = 0
    for o in range(octaves):
        s = base * 2 ** o; g = r.standard_normal((s + 3, s + 3)); y, x = np.mgrid[0:n, 0:m]; y = y / n * s + 1; x = x / m * s + 1
        out += map_coordinates(g, [y, x], order=3, mode='wrap') * amp; tot += amp; amp *= persist
    out /= tot; out -= out.min(); out /= out.max() or 1; return out
def save(name, rgba, q=86): Image.fromarray(np.clip(rgba * 255, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=q, method=6)
def radial(n): y, x = (np.mgrid[0:n, 0:n] - (n - 1) / 2) / (n / 2); return x, y, np.hypot(x, y)

# ------------------------------------------------------------------ gas giants: banded, lit from one side, some with rings
GIANT = [((0.85, 0.68, 0.45), (0.6, 0.4, 0.28), True), ((0.45, 0.62, 0.9), (0.25, 0.35, 0.65), False), ((0.75, 0.5, 0.75), (0.45, 0.3, 0.55), True), ((0.55, 0.8, 0.7), (0.3, 0.5, 0.48), False)]
for i, (c1, c2, rings) in enumerate(GIANT):
    n = 640; x, y, d = radial(n); R = 0.55
    inside = d < R; z = np.sqrt(np.clip(R * R - d * d, 0, None)) / R
    lat = np.arcsin(np.clip(y / R, -1, 1)); turb = fbm(n, 5, 4, 0.6, 700 + i)
    band = 0.5 + 0.5 * np.sin(lat * 14 + turb * 3.2 + np.sin(lat * 5) * 1.5)
    col = np.array(c1) * band[..., None] + np.array(c2) * (1 - band[..., None])
    storm = np.exp(-(((x - 0.15) / 0.09) ** 2 + ((y - 0.2) / 0.05) ** 2)) * (i % 2 == 0)
    col = col * (1 - storm[..., None] * 0.4) + storm[..., None] * np.array([0.9, 0.5, 0.35]) * 0.4
    L = np.array([-0.65, -0.35, 0.68]); L /= np.linalg.norm(L)
    nx, ny = x / R, y / R; shade = np.clip(nx * L[0] + ny * L[1] + z * L[2], 0, 1) ** 0.9 * 1.15 + 0.03
    rgb = col * shade[..., None] * inside[..., None]
    rim = np.clip(1 - np.abs(d - R) / 0.02, 0, 1) * np.clip(-(nx * L[0] + ny * L[1]) + 0.3, 0, 1) * 0.25
    alpha = inside.astype(float) + rim
    rgb = rgb + rim[..., None] * np.array(c1)
    if rings:   # a tilted ring: in front of the planet below the equator, hidden behind it above
        t = 0.28; ry = y / t; rd = np.hypot(x, ry); ring = (rd > 0.72) & (rd < 0.98)
        rb = 0.55 + 0.45 * np.sin(rd * 90) * np.sin(rd * 23); ringa = ring * (0.25 + 0.55 * rb) * np.clip(1.4 - rd, 0, 1)
        behind = inside & (y < 0); ringa = ringa * (~behind)
        rcol = np.array(c1) * 0.9 * (0.5 + 0.5 * np.clip(x * L[0] * -1 + 0.6, 0, 1))[..., None]
        rgb = rgb * (1 - ringa[..., None]) + rcol * ringa[..., None]; alpha = np.clip(alpha + ringa, 0, 1)
    save(f'giant_{i}', np.dstack([np.clip(rgb, 0, 1), np.clip(alpha, 0, 1)]))

# ------------------------------------------------------------------ abandoned stations, from the station sprites
for i, k in enumerate([1, 2, 4, 5]):
    src = Image.open(os.path.join(STATIONS, f'{k}.png')).convert('RGBA').resize((480, 480), Image.LANCZOS)
    a = np.asarray(src).astype(float) / 255; rgb, al = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.3, 0.55, 0.15]); n = rgb.shape[0]
    grime = fbm(n, 6, 6, 0.6, 800 + i)[..., None]
    rgb = lum[..., None] * (np.array([0.40, 0.40, 0.42]) * (1 - grime) + np.array([0.45, 0.33, 0.25]) * grime) * 1.6
    scorch = np.clip((fbm(n, 5, 5, 0.55, 810 + i) - 0.5) / 0.22, 0, 1); rgb *= (1 - scorch[..., None] * 0.7)
    cut = fbm(n, 4, 3, 0.55, 820 + i) > 0.7; al = al * (~cut)                                 # chunks missing
    lights = (np.random.default_rng(830 + i).random((n, n)) > 0.9993) * (al > 0.8)
    rgb = rgb + gaussian_filter(lights.astype(float), 1.4)[..., None] * 25 * np.array([1.0, 0.45, 0.2])
    save(f'derelict_{i}', np.dstack([np.clip(rgb, 0, 1), al]))

# ------------------------------------------------------------------ crystal formations
def crystal(i, n=420):
    r = np.random.default_rng(900 + i); im = Image.new('RGBA', (n, n)); dr = ImageDraw.Draw(im, 'RGBA')
    hue = [(120, 230, 255), (200, 140, 255), (140, 255, 190)][i]; cx = cy = n / 2
    shards = []
    for k in range(r.integers(9, 15)):
        a = r.uniform(0, 2 * np.pi); L = r.uniform(0.18, 0.46) * n; w = r.uniform(0.03, 0.07) * n; off = r.uniform(0, 0.08) * n
        bx, by = cx + math.cos(a) * off, cy + math.sin(a) * off; tx, ty = bx + math.cos(a) * L, by + math.sin(a) * L; px, py = -math.sin(a) * w, math.cos(a) * w
        shards.append((L, [(bx + px, by + py), (bx + math.cos(a) * L * 0.75 + px * 0.8, by + math.sin(a) * L * 0.75 + py * 0.8), (tx, ty), (bx + math.cos(a) * L * 0.75 - px * 0.8, by + math.sin(a) * L * 0.75 - py * 0.8), (bx - px, by - py)], a))
    for L, poly, a in sorted(shards, key=lambda s: s[0]):
        shade = 0.55 + 0.45 * math.cos(a - 2.4); c = tuple(int(v * shade) for v in hue)
        dr.polygon(poly, fill=c + (215,)); dr.line([poly[0], poly[2]], fill=tuple(min(255, int(v * 1.25)) for v in hue) + (180,), width=2)
    glow = im.filter(ImageFilter.GaussianBlur(n * 0.05)); out = Image.alpha_composite(glow, im)
    core = Image.new('RGBA', (n, n)); ImageDraw.Draw(core).ellipse([cx - n * 0.08, cy - n * 0.08, cx + n * 0.08, cy + n * 0.08], fill=(255, 255, 255, 200)); core = core.filter(ImageFilter.GaussianBlur(n * 0.04))
    out = Image.alpha_composite(out, core); out.save(os.path.join(OUT, f'crystal_{i}.webp'), 'WEBP', quality=86, method=6)
for i in range(3): crystal(i)

# ------------------------------------------------------------------ a black hole with its accretion disc
n = 720; x, y, d = radial(n); t = 0.32; ry = y / t; rd = np.hypot(x, ry); ang = np.arctan2(ry, x)
disc = np.clip((rd - 0.22) / 0.06, 0, 1) * np.clip((0.95 - rd) / 0.5, 0, 1) * (0.6 + 0.4 * fbm(n, 5, 6, 0.6, 950)) * (0.65 + 0.35 * np.sin(ang * 3 + rd * 30))
doppler = 0.75 + 0.5 * np.clip(-x, -1, 1)
hole = d < 0.2; lens = np.exp(-((d - 0.215) / 0.012) ** 2) * 1.6
arc = np.exp(-((np.hypot(x, (y + 0.02) / 0.75) - 0.27) / 0.02) ** 2) * (y < 0) * 0.9           # the far side of the disc, bent over the top
lum = disc * doppler + lens + arc
col = np.dstack([np.clip(lum * 1.1, 0, 1), np.clip(lum * 0.75, 0, 1), np.clip(lum * 0.45 + lens * 0.4, 0, 1)])
behind = hole & (np.abs(y) > 0.02); col = col * (~hole)[..., None]
alpha = np.clip(lum, 0, 1); alpha = np.where(hole, 1.0, alpha) * (1 - np.clip((d - 0.9) / 0.1, 0, 1))
save('blackhole_0', np.dstack([col, alpha]))

# ------------------------------------------------------------------ megastructure arc fragments
for i in range(2):
    n = 900; x, y, d = radial(n); a = np.arctan2(y, x); R = 0.8; w = 0.06 + 0.02 * i
    span = (a > -2.5 + i * 0.4) & (a < -0.6 - i * 0.3); band = (np.abs(d - R) < w) & span
    broken = fbm(n, 4, 6, 0.5, 970 + i) > 0.74; band &= ~(broken & (np.abs(d - R) > w * 0.4))
    panels = 0.8 + 0.2 * (np.cos(a * 160) > 0.3) + 0.15 * (np.abs(d - R) < w * 0.12)
    shade = 0.5 + 0.5 * np.cos((d - R) / w * np.pi / 2) ** 2
    grime = fbm(n, 5, 7, 0.6, 980 + i)
    rgb = np.dstack([shade * panels * (0.38 + 0.08 * grime)] * 3) * np.array([1.0, 0.98, 1.05])
    lights = (np.cos(a * 60) > 0.985) & (np.abs(d - R) < w * 0.5) & band
    rgb = rgb + lights[..., None] * np.array([0.9, 0.7, 0.4])
    save(f'arc_{i}', np.dstack([np.clip(rgb, 0, 1), gaussian_filter(band.astype(float), 0.8)]))

# ------------------------------------------------------------------ small things: relay satellites and cargo pods
def satellite(i, n=160):
    im = Image.new('RGBA', (n, n)); dr = ImageDraw.Draw(im); c = n / 2
    panel = [(40, 70, 120), (60, 60, 90), (90, 70, 40)][i]
    for s in (-1, 1):
        x0 = c + s * 14; x1 = c + s * (60 if i != 2 else 44)
        dr.rectangle([min(x0, x1), c - 12, max(x0, x1), c + 12], fill=panel + (255,), outline=(150, 160, 180, 255))
        for k in range(1, 4): xx = x0 + (x1 - x0) * k / 4; dr.line([xx, c - 12, xx, c + 12], fill=(20, 30, 50, 255))
    dr.ellipse([c - 14, c - 14, c + 14, c + 14], fill=(150, 150, 160, 255), outline=(200, 200, 210, 255))
    if i == 1: dr.pieslice([c - 26, c - 40, c + 26, c + 4], 200, 340, fill=(190, 190, 200, 255))      # dish
    if i == 2: dr.line([c, c - 14, c, c - 52], fill=(200, 200, 210, 255), width=3); dr.ellipse([c - 5, c - 58, c + 5, c - 48], fill=(255, 80, 60, 255))
    im.save(os.path.join(OUT, f'satellite_{i}.webp'), 'WEBP', quality=90)
for i in range(3): satellite(i)
def pod(i, n=140):
    im = Image.new('RGBA', (n, n)); dr = ImageDraw.Draw(im); c = n / 2
    col = [(150, 110, 60), (80, 110, 140), (120, 120, 125)][i]
    if i < 2:
        dr.rectangle([c - 44, c - 22, c + 44, c + 22], fill=col + (255,), outline=tuple(int(v * 0.6) for v in col) + (255,), width=3)
        for k in range(-3, 4): dr.line([c + k * 12, c - 22, c + k * 12, c + 22], fill=tuple(int(v * 0.75) for v in col) + (255,), width=2)
        dr.rectangle([c - 44, c - 22, c - 34, c + 22], fill=(200, 200, 60, 255) if i == 0 else (220, 80, 60, 255))
    else:
        dr.ellipse([c - 30, c - 30, c + 30, c + 30], fill=col + (255,), outline=(70, 70, 75, 255), width=3); dr.ellipse([c - 10, c - 10, c + 10, c + 10], fill=(60, 200, 255, 255))
    im = im.rotate(np.random.default_rng(1000 + i).uniform(0, 360), resample=Image.BICUBIC)
    im.save(os.path.join(OUT, f'pod_{i}.webp'), 'WEBP', quality=90)
for i in range(3): pod(i)
print('scenery round two written to', OUT)
# Directional light and grime shade the satellites and pods.
import glob as _g
for _f in sorted(_g.glob(os.path.join(OUT, 'satellite_*.webp')) + _g.glob(os.path.join(OUT, 'pod_*.webp'))):
    _im = np.asarray(Image.open(_f).convert('RGBA')).astype(float) / 255; _n = _im.shape[0]
    _y, _x = np.mgrid[0:_n, 0:_n] / _n; _light = 1.25 - 0.75 * (_x * 0.6 + _y * 0.4)
    _noise = 1 + gaussian_filter(np.random.default_rng(len(_f)).standard_normal((_n, _n)), 1.2) * 0.18
    _rgb = np.clip(_im[..., :3] * _light[..., None] * _noise[..., None], 0, 1)
    Image.fromarray((np.dstack([_rgb, np.clip(gaussian_filter(_im[..., 3], 0.6), 0, 1)]) * 255).astype(np.uint8), 'RGBA').save(_f, 'WEBP', quality=90)
