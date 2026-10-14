"""Quantum Rift 2.1 system scenery, rendered from scratch (procedural noise, a little geometry) plus the game's own
capital-ship sprites for the ancient wrecks.
  galaxy_0..5     distant galaxies (spiral, barred, edge-on, elliptical) for the far background
  nebula_0..7     gas clouds in several colourways, drawn additively at a middle depth
  wreck_0..5      massive derelict hulls: old capital ships, broken, scorched and dark
  ruin_0..1       broken rings of an ancient gate or habitat
usage: python3 tools/rift_decor.py client/assets/decor      (needs numpy, scipy and Pillow)"""
import sys, os, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops
from scipy.ndimage import gaussian_filter, map_coordinates, binary_erosion, distance_transform_edt

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/decor'
SHIPS = os.path.join(os.path.dirname(OUT.rstrip('/')), 'ships')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(2101)

def fbm(n, octaves=6, base=4, persist=0.55, seed=None):
    """fractal noise in 0..1, tileable-ish, n x n"""
    r = np.random.default_rng(seed) if seed is not None else rng
    out = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(octaves):
        s = base * 2 ** o; g = r.standard_normal((s + 3, s + 3))
        y, x = np.mgrid[0:n, 0:n] / n * s + 1
        out += map_coordinates(g, [y, x], order=3, mode='wrap') * amp; tot += amp; amp *= persist
    out /= tot; out -= out.min(); out /= out.max() or 1; return out
def save(name, rgba, q=88):
    im = Image.fromarray(np.clip(rgba * 255, 0, 255).astype(np.uint8), 'RGBA'); im.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=q, method=6)
def radial(n):
    y, x = (np.mgrid[0:n, 0:n] - (n - 1) / 2) / (n / 2); return x, y, np.hypot(x, y)

# ------------------------------------------------------------------ galaxies
def galaxy(kind, n=384, seed=0):
    r = np.random.default_rng(seed); x, y, d = radial(n); a = np.arctan2(y, x)
    core_col = np.array([1.0, 0.92, 0.78]); arm_col = np.array([0.72, 0.82, 1.0]); hii = np.array([1.0, 0.55, 0.75])
    lum = np.zeros((n, n)); col = np.zeros((n, n, 3))
    if kind in ('spiral', 'barred'):
        arms = int(r.integers(2, 4)); k = r.uniform(3.2, 4.6); twist = r.uniform(0, 6.28)
        rr = np.maximum(d, 1e-3)
        phase = (a * arms - np.log(rr) * k * arms / 2.2 + twist)
        armv = (0.5 + 0.5 * np.cos(phase)) ** 3.2
        if kind == 'barred':
            bar = np.exp(-((x * 0.35 + y * 0.94) / 0.07) ** 2 - ((x * 0.94 - y * 0.35) / 0.42) ** 2); armv = np.maximum(armv * (d > 0.28), bar * 0.9)
        noise = fbm(n, 6, 6, 0.6, seed + 11)
        disk = np.exp(-d / 0.38) * (d < 1.0)
        arm = armv * disk * (0.45 + 0.9 * noise) * np.clip(d * 3.2, 0, 1)
        dust = (fbm(n, 5, 10, 0.55, seed + 21) > 0.62) * armv * disk * np.clip(d * 3, 0, 1) * 0.6
        core = np.exp(-(d / 0.11) ** 2) * 1.3 + np.exp(-(d / 0.26) ** 2) * 0.35
        knots = (fbm(n, 3, 40, 0.5, seed + 31) > 0.78) * arm * 1.4
        lum = core + arm - dust * 0.5 + knots * 0.4
        col = core[..., None] * core_col + arm[..., None] * arm_col + knots[..., None] * hii
    elif kind == 'edge':
        xs = x * 0.95 + y * 0.3; ys = -x * 0.3 + y * 0.95
        disk = np.exp(-np.abs(ys) / 0.035 - np.abs(xs) / 0.45) * (np.abs(xs) < 1)
        bulge = np.exp(-(xs ** 2 / 0.02 + ys ** 2 / 0.012))
        lane = 1 - 0.85 * np.exp(-(ys / 0.012) ** 2) * (np.abs(xs) < 0.85)
        noise = fbm(n, 5, 8, 0.6, seed + 41)
        lum = (disk * (0.6 + 0.6 * noise) + bulge * 1.1) * lane
        col = disk[..., None] * arm_col * (0.6 + 0.6 * noise[..., None]) + bulge[..., None] * core_col
        col *= lane[..., None]
    else:   # elliptical: a smooth, warm glow
        q = r.uniform(0.55, 0.85); xs = x * 0.8 + y * 0.6; ys = (-x * 0.6 + y * 0.8) / q
        e = np.hypot(xs, ys); lum = np.exp(-(e / 0.2) ** 0.8) * 1.2
        col = lum[..., None] * np.array([1.0, 0.86, 0.68])
    sparkle = (r.random((n, n)) > 0.9985) * np.exp(-d / 0.6) * r.uniform(0.4, 1, (n, n))
    col = col + sparkle[..., None]; lum = lum + sparkle
    alpha = np.clip(lum, 0, 1) ** 0.85 * (1 - np.clip((d - 0.82) / 0.18, 0, 1))
    rgb = np.clip(col / np.maximum(lum, 1e-3)[..., None], 0, 1.4); rgb = np.clip(rgb, 0, 1)
    save(f'galaxy_{seed}', np.dstack([rgb, alpha * 0.95]))
for i, kind in enumerate(['spiral', 'barred', 'edge', 'spiral', 'elliptical', 'barred']): galaxy(kind, 384, i)

# ------------------------------------------------------------------ nebula clouds (additive, so colour = brightness)
NEB = [((0.25, 0.75, 1.0), (0.55, 0.3, 1.0)), ((1.0, 0.35, 0.55), (0.6, 0.2, 0.9)), ((1.0, 0.65, 0.3), (1.0, 0.3, 0.2)), ((0.35, 1.0, 0.65), (0.2, 0.55, 1.0)),
       ((0.75, 0.45, 1.0), (1.0, 0.4, 0.75)), ((0.4, 0.85, 1.0), (0.9, 0.95, 1.0)), ((1.0, 0.85, 0.45), (0.45, 0.85, 0.9)), ((0.95, 0.3, 0.3), (0.35, 0.25, 0.8))]
def nebula(i, n=640):
    c1, c2 = np.array(NEB[i][0]), np.array(NEB[i][1]); s = 100 + i
    warp1, warp2 = fbm(n, 4, 3, 0.5, s), fbm(n, 4, 3, 0.5, s + 1)
    y, x = np.mgrid[0:n, 0:n].astype(float)
    base = fbm(n, 7, 3, 0.58, s + 2)
    warped = map_coordinates(base, [(y + (warp1 - 0.5) * n * 0.35) % n, (x + (warp2 - 0.5) * n * 0.35) % n], order=1, mode='wrap')
    fil = fbm(n, 6, 6, 0.6, s + 3); fil = 1 - np.abs(fil - 0.5) * 2; fil = fil ** 6             # bright filaments
    _, _, d = radial(n); fall = np.clip(1 - d, 0, 1) ** 1.6 * (0.6 + 0.4 * fbm(n, 3, 2, 0.5, s + 4))   # soft, irregular edge
    dens = np.clip((warped - 0.35) / 0.55, 0, 1) ** 1.8 * fall
    mixk = fbm(n, 4, 2, 0.5, s + 5)[..., None]
    col = c1 * (1 - mixk) + c2 * mixk
    rgb = col * (dens[..., None] * 0.9 + (fil * dens)[..., None] * 1.4)
    dark = np.clip((fbm(n, 5, 5, 0.55, s + 6) - 0.62) / 0.2, 0, 1) * dens                       # dust knots that dim the glow
    rgb *= (1 - dark[..., None] * 0.7)
    stars = (np.random.default_rng(s).random((n, n)) > 0.9993) * dens
    rgb += gaussian_filter(stars, 0.8)[..., None] * 6
    a = np.clip(rgb.max(axis=2), 0, 1); rgbn = np.clip(rgb / np.maximum(a, 1e-3)[..., None], 0, 1)
    save(f'nebula_{i}', np.dstack([rgbn, a]), 82)
for i in range(8): nebula(i)

# ------------------------------------------------------------------ ancient wrecks: capital hulls, aged, broken, burnt
def frame(hull, fr):
    im = Image.open(os.path.join(SHIPS, f'{hull}.png')).convert('RGBA'); sz = im.width // 6
    return im.crop(((fr % 6) * sz, (fr // 6) * sz, (fr % 6) * sz + sz, (fr // 6) * sz + sz))
def wreck(i, hull, fr, scale, cut_angle, seed):
    r = np.random.default_rng(seed); src = frame(hull, fr); sz = src.width * scale
    big = src.resize((sz, sz), Image.LANCZOS); a = np.asarray(big).astype(float) / 255
    rgb, al = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.3, 0.55, 0.15])
    rust = np.array([0.42, 0.30, 0.22]); grey = np.array([0.38, 0.38, 0.40])
    grime = fbm(sz, 6, 8, 0.6, seed)[..., None]
    rgb = (lum[..., None] * 0.9) * (grey * (1 - grime) + rust * grime) * 1.7
    panel = fbm(sz, 2, 60, 0.5, seed + 1); rgb *= (0.85 + 0.25 * (panel > 0.5))[..., None]       # plating
    scorch = np.clip((fbm(sz, 5, 5, 0.55, seed + 2) - 0.5) / 0.25, 0, 1)
    rgb *= (1 - scorch[..., None] * 0.75)
    # hull breaches: holes punched through, with burnt rims
    holes = np.zeros((sz, sz)); yy, xx = np.mgrid[0:sz, 0:sz]
    inside = np.argwhere(al > 0.6)
    for _ in range(r.integers(6, 11)):
        cy, cx = inside[r.integers(len(inside))]; rad = r.uniform(0.02, 0.06) * sz
        n = fbm(64, 3, 4, 0.5, int(r.integers(1e6))); ang = np.arctan2(yy - cy, xx - cx)
        jag = map_coordinates(n, [((ang + np.pi) / (2 * np.pi) * 63), np.full(ang.shape, 20.0)], order=1, mode='wrap')
        holes = np.maximum(holes, (np.hypot(yy - cy, xx - cx) < rad * (0.7 + 0.6 * jag)).astype(float))
    rim = np.clip(gaussian_filter(holes, sz * 0.012) * 2.2 - holes * 2.2, 0, 1)
    rgb *= (1 - rim[..., None] * 0.8); al = al * (1 - holes)
    # break the hull in two along a jagged line, and drift the pieces apart
    ca, sa = math.cos(cut_angle), math.sin(cut_angle)
    t = (xx - sz / 2) * ca + (yy - sz / 2) * sa; u = -(xx - sz / 2) * sa + (yy - sz / 2) * ca
    jag = (fbm(256, 4, 8, 0.6, seed + 3)[0][np.clip(((u / sz + 0.5) * 255).astype(int), 0, 255)] - 0.5) * sz * 0.08
    side = t > jag + r.uniform(-0.08, 0.08) * sz
    gap = np.abs(t - jag) < sz * 0.012
    al = al * (1 - gap)
    edge = (np.abs(t - jag) < sz * 0.03) * (al > 0)
    rgb = rgb * (1 - edge[..., None] * 0.6) + edge[..., None] * np.array([0.25, 0.08, 0.02]) * 0.4
    lights = (r.random((sz, sz)) > 0.99965) * (al > 0.8) * (scorch < 0.4)                        # a few running lights still on
    glow = gaussian_filter(lights.astype(float), 1.6) * 30
    rgb = rgb + glow[..., None] * np.array([1.0, 0.55, 0.25])
    out = np.dstack([np.clip(rgb, 0, 1), np.clip(al, 0, 1)])
    A1 = out * side[..., None]; A2 = out * (~side)[..., None]
    pad = int(sz * 0.25); W = sz + pad * 2; canvas = Image.new('RGBA', (W, W))
    p1 = Image.fromarray((A1 * 255).astype(np.uint8), 'RGBA'); p2 = Image.fromarray((A2 * 255).astype(np.uint8), 'RGBA')
    off = sz * 0.06; dx, dy = ca * off, sa * off
    canvas.alpha_composite(p2.rotate(r.uniform(-9, -3), resample=Image.BICUBIC), (int(pad - dx), int(pad - dy)))
    canvas.alpha_composite(p1.rotate(r.uniform(3, 9), resample=Image.BICUBIC), (int(pad + dx), int(pad + dy)))
    bb = canvas.getbbox(); canvas = canvas.crop(bb)
    canvas.save(os.path.join(OUT, f'wreck_{i}.webp'), 'WEBP', quality=84, method=6)
for i, (hull, fr, sc, ang) in enumerate([(736, 4, 2, 0.4), (717, 10, 3, 1.9), (787, 2, 2, 2.6), (743, 16, 3, 0.9), (749, 22, 3, 2.2), (750, 28, 3, 1.3)]):
    wreck(i, hull, fr, sc, ang, 300 + i)

# ------------------------------------------------------------------ ancient ring ruins
def ruin(i, n=760, seed=0):
    r = np.random.default_rng(500 + seed); x, y, d = radial(n); a = np.arctan2(y, x)
    R, w = 0.72, 0.075; ring = np.abs(d - R) < w
    segs = r.integers(9, 14); edges = np.sort(r.uniform(0, 2 * np.pi, segs))
    keep = np.zeros_like(d, bool)
    for k in range(segs):
        if r.random() < 0.62: lo, hi = edges[k], edges[(k + 1) % segs] + (2 * np.pi if k == segs - 1 else 0); aa = (a + 2 * np.pi) % (2 * np.pi); aa = np.where(aa < lo, aa + 2 * np.pi, aa); keep |= (aa > lo + 0.04) & (aa < hi - 0.04)
    body = ring & keep
    shade = 0.55 + 0.45 * np.cos((d - R) / w * np.pi / 2) ** 2 * (0.6 + 0.4 * np.cos(a - 2.3))
    panels = 0.85 + 0.15 * (np.cos(a * 90) > 0.6) + 0.1 * (np.abs(d - R) < w * 0.15)
    grime = fbm(n, 5, 8, 0.6, 510 + seed)
    rgb = np.dstack([shade * panels * (0.42 + 0.1 * grime), shade * panels * (0.40 + 0.06 * grime), shade * panels * (0.44 + 0.02 * grime)])
    scorch = np.clip((fbm(n, 4, 6, 0.55, 520 + seed) - 0.55) / 0.2, 0, 1); rgb *= (1 - scorch[..., None] * 0.6)
    glyph = (np.abs(d - R) < w * 0.25) & (np.cos(a * 40) > 0.92) & body & (r.random() < 2)
    rgb = rgb + glyph[..., None] * np.array([0.25, 0.6, 0.7]) * 0.6                               # faint old glyph lights
    al = body.astype(float); al = gaussian_filter(al, 0.7)
    save(f'ruin_{i}', np.dstack([np.clip(rgb, 0, 1), al]), 85)
for i in range(2): ruin(i, 760, i)
print('scenery written to', OUT)
