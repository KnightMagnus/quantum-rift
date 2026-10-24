"""Quantum Rift 2.5: landing pictures in the manner of EV Nova's rendered landscapes (Bryce-style terrain).
Each scene: a sky (gradient, sun, clouds, stars, aurora or a hanging planet from tools/rift_planets.py), a voxel-space
height-field terrain lit by the sun with aerial perspective and reflective water, and rendered 3D structures (towers,
domes, spires, forges, crystal) from the hull pipeline, depth-tested into the terrain. Stations get an exterior shot of
their rendered design (tools/rift_stations.py) above a planet's limb.
Output: client/assets/land/<scene>.jpg (612x285) and scenes.json.
usage: python3 tools/rift_landscapes.py client/assets/land [only]      (needs numpy and Pillow)
For planetary context variants and colony stages use rift_colony_landscapes.py OUTPUT [SCENE].
That entrypoint never renders stations; rift_earth_colonies.py OUTPUT retains original Earth."""
import sys, os, json, math, zlib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageFilter
from rift_noise import Perlin3, fbm, ridged, smooth, lerp, ramp
from rift_render3d import render, mat, loft, block, sphere, Mesh
import rift_stations as RS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/land'; ONLY = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)
HERE = os.path.dirname(os.path.abspath(__file__)); PLAN = os.path.join(HERE, '..', 'client', 'assets', 'planets'); STA = os.path.join(HERE, '..', 'client', 'assets', 'stations')
W, H, SS = 612, 285, 2
WW, HH = W * SS, H * SS

# ---------------------------------------------------------------- structures
WIN = (1.0, 0.82, 0.5)
TOWER = mat((0.62, 0.64, 0.7), metal=0.5, panel=1.4, windows=(-10, 10, WIN, 14), grime=1.0); TOWER2 = mat((0.45, 0.5, 0.58), metal=0.6, panel=1.2, windows=(-10, 10, (0.7, 0.9, 1.0), 12))
WHITE = mat((0.9, 0.9, 0.92), metal=0.3, panel=0.5, rough=0.3, windows=(-10, 10, (0.6, 0.85, 1.0), 10)); SAND = mat((0.75, 0.62, 0.45), metal=0.1, panel=1.0, grime=1.5)
def tower(x, y, h, w, m, top=None):
    M = [loft([(0, y, x, w, w, 6), (h, y, x, w * 0.95, w * 0.95, 6), (h * 1.02, y, x, w * 0.7, w * 0.7, 6)], m, ring=12, axis='z')]
    if top: M += [loft([(h, y, x, w * 0.2, w * 0.2, 2), (h * 1.25, y, x, 0.004, 0.004, 2)], RS.GUNM, ring=8, axis='z'), sphere((x, y, h * 1.25), w * 0.12, top)]
    return M
def dome(x, y, r, m=None): return [sphere((x, y, 0), r, m or RS.GLASS, squash=0.55), RS.zcyl((x, y, 0.0), r * 1.04, r * 0.06, RS.DARK, ring=24)]
def city_cluster(seed, n=14, spread=1.0, mats=(TOWER, TOWER2), domes=2, spire=True):
    r = np.random.default_rng(seed); M = []
    for i in range(n):
        x, y = r.normal(0, 0.45 * spread), r.normal(0, 0.12 * spread); h = 0.3 + r.random() ** 1.6 * 1.2 * (1 - min(1, math.hypot(x, y) * 0.8)); w = 0.06 + r.random() * 0.07
        M += tower(x, y, h, w, mats[i % len(mats)], RS.LRED if r.random() < 0.3 else None)
    for i in range(domes): M += dome(r.normal(0, 0.5 * spread), r.normal(0, 0.1), 0.18 + r.random() * 0.12)
    M += [block((0, 0, -0.02), (1.0 * spread, 0.3 * spread, 0.04), RS.DARK)]   # the city's foundation
    if spire: M += [loft([(0, 0, 0, 0.09, 0.09, 2), (1.6, 0, 0, 0.03, 0.03, 2), (2.0, 0, 0, 0.003, 0.003, 2)], WHITE, ring=10, axis='z'), sphere((0, 0, 2.0), 0.03, RS.LWHITE)]
    return M
def outpost(seed, m=SAND):
    r = np.random.default_rng(seed); M = []
    for i in range(5): M += dome(r.normal(0, 0.6), r.normal(0, 0.25), 0.15 + r.random() * 0.15, m if i % 2 else None)
    M += [RS.zcyl((0.5, 0.1, 0.2), 0.04, 0.2, RS.DARK), sphere((0.5, 0.1, 0.45), 0.13, RS.GUNM, squash=0.3), block((-0.4, 0, 0.05), (0.25, 0.08, 0.05), m)]
    M += [sphere((0.5, 0.1, 0.5), 0.02, RS.LRED)]
    return M
def foundry(seed):
    r = np.random.default_rng(seed); M = [block((0, 0, 0.15), (0.6, 0.3, 0.15), RS.FORGE), block((0.2, 0.05, 0.4), (0.25, 0.18, 0.1), RS.FORGE)]
    for i in range(5): x = -0.5 + i * 0.25; h = 0.6 + r.random() * 0.6; M += [RS.zcyl((x, 0.2, h / 2), 0.05, h / 2, RS.BRASS, ring=10), sphere((x, 0.2, h), 0.04, RS.GORANGE)]
    for x in (-0.3, 0.1, 0.45): M += [block((x, -0.31, 0.12), (0.06, 0.01, 0.06), RS.GORANGE)]
    return M
def arcology(seed):
    M = []
    for i, (r_, h) in enumerate([(0.7, 0.2), (0.55, 0.2), (0.4, 0.2), (0.26, 0.25), (0.14, 0.35)]):
        z0 = sum(x[1] for x in [(0.7, 0.2), (0.55, 0.2), (0.4, 0.2), (0.26, 0.25), (0.14, 0.35)][:i])
        M += [RS.zcyl((0, 0, z0 + h / 2), r_, h / 2, TOWER if i % 2 else TOWER2, ring=24)]
    return M + [sphere((0, 0, 1.25), 0.05, RS.GTEAL)]
def crystals(seed, n=9):
    r = np.random.default_rng(seed); M = []
    for i in range(n):
        x, y = r.normal(0, 0.5), r.normal(0, 0.3); h = 0.4 + r.random() * 1.2; w = 0.06 + r.random() * 0.1; lean = r.normal(0, 0.15)
        M += [loft([(0, y, x, w, w * 0.8, 0.9), (h * 0.75, y, x + lean * h * 0.75, w * 0.75, w * 0.6, 0.9), (h, y, x + lean * h, 0.003, 0.003, 0.9)], RS.CRYS if i % 2 else RS.CRYS2, ring=6, axis='z')]
    return M
FIN = mat((0.7, 0.85, 1.0), metal=0.2, panel=0, rough=0.2, grime=0, ambient=0.6)
def spires(seed, n=7):   # Que'vari spires: tall white needles with glass sail-fins
    r = np.random.default_rng(seed); M = []
    for i in range(n):
        x, y = (i - n / 2) * 0.28 + r.normal(0, 0.06), r.normal(0, 0.08); h = 0.8 + r.random() * 1.6 * (1 - abs(i - n / 2) / n); w = 0.05 + r.random() * 0.04
        M += [loft([(0, y, x, w * 1.3, w * 1.3, 2), (h * 0.3, y, x, w * 0.8, w * 0.8, 2), (h * 0.75, y, x, w * 0.35, w * 0.35, 2), (h, y, x, 0.003, 0.003, 2)], WHITE, ring=12, axis='z')]
        for k in range(1): zf = h * 0.3; M += [Mesh(np.array([[x, y, zf], [x + 0.16, y, zf - 0.12], [x + 0.02, y, zf + 0.35]]), np.array([[0, 1, 2]]), FIN), Mesh(np.array([[x, y, zf], [x - 0.16, y, zf - 0.12], [x - 0.02, y, zf + 0.35]]), np.array([[0, 2, 1]]), FIN)]
        M += [sphere((x, y, h), 0.025, RS.GBLUE)]
    return M
def cloud_platform(seed):
    M = [loft([(-0.1, 0, 0, 0.05, 0.05, 2), (0, 0, 0, 0.8, 0.8, 2), (0.06, 0, 0, 0.75, 0.75, 2), (0.1, 0, 0, 0.3, 0.3, 2)], RS.HULL, ring=36, axis='z')]
    M += [loft([(-0.1, 0, 0, 0.12, 0.12, 2), (-0.7, 0, 0, 0.05, 0.05, 2)], RS.DARK, ring=10, axis='z')]
    return M + city_cluster(seed, 7, 0.9, domes=1, spire=False)
def sprite_of(M, size=420, tilt=80, heading=20):
    V = np.concatenate([m.V for m in M]); ext = max(np.abs(V[:, 0]).max(), np.abs(V[:, 1]).max(), V[:, 2].max() * 0.6, 0.1)
    o = render(M, size, heading, size * 0.45 / ext, tilt=tilt, density=12, ss=2); rgb, a = o[0]
    return np.clip(rgb, 0, 1), a

# ---------------------------------------------------------------- sky
def make_sky(sp, r):
    yy = np.linspace(0, 1, HH)[:, None] * np.ones((1, WW)); xx = np.ones((HH, 1)) * np.linspace(0, 1, WW)[None, :]
    hz = sp['horizon']; t = np.clip(yy / hz, 0, 1)
    sky = lerp(sp['sky_top'], sp['sky_hz'], t ** 0.8) / 255
    if sp.get('stars'):
        st = r.random((HH, WW)); sky += (st > 0.9985)[..., None] * r.uniform(0.4, 1.0, (HH, WW))[..., None] * 0.9 * (1 - t[..., None] * 0.3)
    sx, sy = sp.get('sun', (0.75, 0.22)); d = np.hypot((xx - sx) * WW / HH, yy - sy)
    sc = np.array(sp.get('sun_col', (255, 240, 210))) / 255
    sky += sc * (np.exp(-d / 0.012) * 1.6 + np.exp(-d / 0.08) * 0.45 + np.exp(-d / 0.35) * 0.18)[..., None]
    if sp.get('sun2'):
        sx2, sy2 = sp['sun2']; d2 = np.hypot((xx - sx2) * WW / HH, yy - sy2); sky += np.array((255, 190, 150)) / 255 * (np.exp(-d2 / 0.008) * 1.4 + np.exp(-d2 / 0.06) * 0.3)[..., None]
    if sp.get('aurora'):
        P = Perlin3(7); a = np.exp(-((yy - 0.25 - 0.08 * np.sin(xx * 9 + P(xx * 4, yy * 0, xx * 0) * 3)) / 0.06) ** 2) * (0.5 + 0.5 * np.sin(xx * 60 + P(xx * 9, yy * 2, 0 * xx) * 4))
        sky += a[..., None] * np.array([0.2, 0.9, 0.55]) * 0.5
    if sp.get('clouds'):
        P = Perlin3(int(r.integers(1e6))); c = fbm(P, xx * 6, yy * 22, 0.5 + 0 * xx, 6)
        cm = smooth(0.0, 0.35, c + sp['clouds'] - 0.5) * smooth(hz * 1.02, hz * 0.4, yy) * 0.85
        cc = np.array(sp.get('cloud_col', (240, 235, 230))) / 255
        lit = 0.75 + 0.25 * smooth(0.6, 0, d)[..., None]
        sky = sky * (1 - cm[..., None]) + cc * lit * cm[..., None]
    if sp.get('planet'):   # a world hanging in the sky, from the planet renders
        nm, px, py, ps = sp['planet']; f = os.path.join(PLAN, nm + '.webp')
        if os.path.exists(f):
            im = Image.open(f).convert('RGBA').resize((int(ps * SS), int(ps * SS)), Image.LANCZOS); a = np.asarray(im).astype(float) / 255
            x0, y0 = int(px * WW - ps * SS / 2), int(py * HH - ps * SS / 2); x1, y1 = max(0, x0), max(0, y0); x2, y2 = min(WW, x0 + a.shape[1]), min(HH, y0 + a.shape[0])
            if x2 > x1 and y2 > y1:
                sub = a[y1 - y0:y2 - y0, x1 - x0:x2 - x0]; k = sub[..., 3:4] * sp.get('planet_a', 1.0)
                sky[y1:y2, x1:x2] = sky[y1:y2, x1:x2] * (1 - k) + sub[..., :3] * k
    return np.clip(sky, 0, 2)

# ---------------------------------------------------------------- terrain (voxel space, front to back)
def make_terrain(sp, sky, r):
    P = Perlin3(sp['seed']); P2 = Perlin3(sp['seed'] + 5)
    amp, sc, kind = sp['amp'], sp['scale'], sp['ground']
    def hf(x, z):
        u, v = x / sc, z / sc
        if kind == 'dunes': return amp * (0.5 * fbm(P, u, v, 0.3 + 0 * u, 4) + 0.35 * np.abs(np.sin(u * 3 + v * 1.3 + fbm(P2, u * 0.5, v * 0.5, 0 * u, 3) * 4)))
        if kind == 'clouds': return amp * (fbm(P, u * 0.7, v * 0.7, 0.3 + 0 * u, 5) + 0.3 * fbm(P2, u * 3, v * 3, 0 * u, 3))
        if kind == 'city': return amp * 0.15 * fbm(P, u, v, 0 * u, 3)
        if kind == 'craters':
            h = amp * 0.6 * fbm(P, u, v, 0 * u, 6)
            for cx, cz, cr in sp['_cr']: d = np.hypot(x - cx, z - cz) / cr; h = h + amp * cr / sc * 1.0 * (np.where(d < 1, d * d - 1, 0) + 0.45 * np.exp(-((d - 1) / 0.2) ** 2))
            return h
        m = ridged(P, u, v, 0.37 + 0 * u, 6); b = fbm(P2, u * 0.4, v * 0.4, 0 * u, 4)
        if kind == 'hills': return amp * (0.9 * (fbm(P, u * 0.8, v * 0.8, 0.37 + 0 * u, 6) + 0.5) + 0.25 * m * m)
        dist = 0.35 + 0.65 * smooth(0.3, 2.5, z / sc)   # the mountains rise in the distance; the foreground is lower
        return amp * (m * m * sp.get('ridge', 1.0) * dist + b * 0.6)
    if kind == 'craters': sp['_cr'] = [(r.normal(0, 150), r.uniform(70, 500), r.uniform(6, 28)) for _ in range(70)]
    if sp.get('wq') is not None:   # water level at a height quantile of the visible land
        zz, xx_ = np.meshgrid(np.geomspace(15, 400, 40), np.linspace(-1, 1, 60)); hs = hf(xx_ * zz * 0.9, zz); sp['water'] = water_ = float(np.quantile(hs, sp['wq']))
    hz = sp['horizon'] * HH; f = WW * 0.55; eye = sp.get('eye', 8.0); cam = float(hf(np.array([0.0]), np.array([4.0]))[0]) + eye
    zfar = sp.get('far', 700); zs = np.concatenate([np.linspace(1.5, 30, 220), np.geomspace(30, zfar, 520)[1:]])
    img = sky.copy(); ybuf = np.full(WW, HH, float); depth = np.full((HH, WW), np.inf)
    cols = (np.arange(WW) - WW / 2) / f
    L = np.array(sp.get('light', (-0.5, 0.65, 0.55))); L /= np.linalg.norm(L)
    fogc = np.array(sp.get('fog', sp['sky_hz'])) / 255; water = sp.get('water'); wcol = np.array(sp.get('water_col', (30, 60, 90))) / 255
    gramp = sp['ramp']
    for z in zs:
        x = cols * z; hgt = hf(x, np.full_like(x, z)); isw = np.zeros_like(x, bool)
        if water is not None: isw = hgt < water; hgt = np.where(isw, water, hgt)
        y = hz + (cam - hgt) * f / z
        e = 0.6 * max(1, z / 60); hx = (hf(x + e, np.full_like(x, z)) - hf(x - e, np.full_like(x, z))) / (2 * e); hzz = (hf(x, np.full_like(x, z + e)) - hf(x, np.full_like(x, z - e))) / (2 * e)
        n = np.stack([-hx, np.ones_like(hx), -hzz], 1); n /= np.linalg.norm(n, axis=1, keepdims=True)
        lam = np.clip(n @ np.array([L[0], L[1], -L[2]]), 0, 1)
        slope = 1 - n[:, 1]; hn = (hgt - sp.get('h0', 0)) / (amp * 1.2)
        base = ramp(np.clip(hn + (fbm(P2, x / 7, z / 7, 0.9 + 0 * x, 3)) * 0.12, 0, 1), gramp) / 255
        if sp.get('rock'): base = lerp(base, np.array(sp['rock']) / 255, smooth(0.25, 0.55, slope))
        if sp.get('snowline') is not None: base = lerp(base, np.array((235, 240, 248)) / 255, smooth(sp['snowline'], sp['snowline'] + 0.12, hn) * (1 - smooth(0.35, 0.6, slope)))
        c = base * (sp.get('amb', 0.28) + 0.85 * lam)[:, None]
        if sp.get('lava'):
            glow = smooth(0.8, 0.9, ridged(P2, x / 20, z / 20, 0.5 + 0 * x, 3)) * (hn < 0.35)
            c = c * (1 - glow[:, None]) + np.array([1.4, 0.55, 0.12]) * glow[:, None]
        if sp.get('lights') and kind == 'city':
            lt = (Perlin3(99)(x * 0.9, z * 0.9, 0 * x) > 0.42) * (hn < 0.3) * (r.random(x.shape) < 0.3)
            c = np.where(lt[:, None], np.array([1.0, 0.85, 0.55]), c)
        fog = float(1 - np.exp(-z / sp.get('fogd', 320))); c = c * (1 - fog) + fogc * fog
        yi = np.clip(y, 0, HH).astype(int)
        for col in np.where(yi < ybuf)[0]:
            y0, y1 = yi[col], int(ybuf[col])
            if isw[col]:   # water: the sky mirrored, darkened, with ripples
                rows = np.arange(y0, y1); mir = np.clip((2 * hz - rows).astype(int), 0, HH - 1); rip = (np.sin(rows * 0.9 + col * 0.05 + z * 0.3) * 2).astype(int)
                refl = img[mir, np.clip(col + rip, 0, WW - 1)] if False else sky[mir, np.clip(col + rip, 0, WW - 1)]
                fr = 0.35 + 0.5 * (1 - np.clip((rows - hz) / (HH - hz), 0, 1)) ** 2
                img[y0:y1, col] = (wcol * (1 - fr[:, None]) + refl * fr[:, None]) * (1 - fog) + fogc * fog
            else: img[y0:y1, col] = c[col]
            depth[y0:y1, col] = z; ybuf[col] = y0
    sp['_cam'] = cam; sp['_f'] = f; sp['_hz'] = hz; sp['_hf'] = hf
    return img, depth

def place(img, depth, sp, spr, x, z, width):
    """paste a rendered structure standing on the terrain at world (x, z), depth-tested, fogged"""
    rgb, a = spr; hf, f, hz, cam = sp['_hf'], sp['_f'], sp['_hz'], sp['_cam']
    g = float(hf(np.array([float(x)]), np.array([float(z)]))[0]); g = max(g, sp.get('water', -1e9) if sp.get('water') is not None else g)
    wpx = width * f / z; s = wpx / rgb.shape[1]
    if wpx < 3: return
    im = Image.fromarray((np.dstack([rgb, a[..., None]]) * 255).astype(np.uint8), 'RGBA').resize((max(1, int(rgb.shape[1] * s)), max(1, int(rgb.shape[0] * s))), Image.LANCZOS)
    A = np.asarray(im).astype(float) / 255; hgt, wid = A.shape[:2]
    bottom = np.where(A[..., 3].max(1) > 0.1)[0]; bot = bottom.max() if len(bottom) else hgt - 1
    cx = WW / 2 + x * f / z; gy = hz + (cam - g) * f / z
    x0, y0 = int(cx - wid / 2), int(gy - bot)
    fog = 1 - math.exp(-z / sp.get('fogd', 320)); fogc = np.array(sp.get('fog', sp['sky_hz'])) / 255
    for yy in range(max(0, y0), min(HH, y0 + hgt)):
        xs = slice(max(0, x0), min(WW, x0 + wid)); sx = slice(xs.start - x0, xs.stop - x0)
        if xs.start >= xs.stop: continue
        row = A[yy - y0, sx]; ok = (depth[yy, xs] > z - 0.5) | (yy > gy)
        k = row[:, 3] * ok; col = row[:, :3] * (1 - fog) + fogc * fog
        img[yy, xs] = img[yy, xs] * (1 - k[:, None]) + col * k[:, None]

# ---------------------------------------------------------------- scenes
def T(*stops): return [(i / (len(stops) - 1), s) for i, s in enumerate(stops)]
def SPRAWL(seed):   # an ecumenopolis: city blocks all the way to the horizon
    r = np.random.default_rng(seed); out = [('city', 0, 75, 48), ('arcology', -38, 95, 30)]
    for i in range(16): z = 90 + r.random() ** 0.8 * 380; out.append(('city' if r.random() < 0.8 else 'arcology', float(r.uniform(-0.45, 0.45) * z * 1.4), z, float(r.uniform(40, 70))))
    return out
SCENES = {}
def scene(name, **kw): SCENES[name] = kw
scene('terran_city1', sky_top=(40, 95, 190), sky_hz=(175, 205, 235), horizon=0.52, clouds=0.55, sun=(0.8, 0.18), ground='hills', amp=22, scale=60, ramp=T((70, 110, 50), (95, 130, 60), (120, 125, 90), (140, 130, 115)), rock=(120, 112, 100), snowline=0.85, wq=0.3, water_col=(30, 70, 100), fogd=380,
      structs=[('city', 0, 120, 90)], planet=('terran1', 0.18, 0.18, 70), planet_a=0.35)
scene('terran_city2', sky_top=(60, 70, 150), sky_hz=(240, 170, 130), horizon=0.5, clouds=0.45, cloud_col=(250, 200, 170), sun=(0.25, 0.42), sun_col=(255, 200, 150), ground='hills', amp=26, scale=55, ramp=T((60, 95, 45), (100, 120, 60), (130, 120, 90)), rock=(110, 100, 90), wq=0.3, water_col=(40, 50, 80), fogd=300,
      structs=[('city', 15, 150, 110), ('city', -110, 260, 90)], lights=True)
scene('terran_wild1', sky_top=(35, 90, 185), sky_hz=(185, 215, 240), horizon=0.46, clouds=0.5, sun=(0.7, 0.16), ground='mountains', amp=45, scale=70, ramp=T((60, 100, 45), (90, 115, 55), (125, 115, 95), (150, 140, 130)), rock=(115, 108, 100), snowline=0.6, wq=0.25, water_col=(25, 60, 90), fogd=420,
      structs=[('outpost', -20, 60, 30)])
scene('terran_wild2', sky_top=(50, 110, 200), sky_hz=(200, 220, 235), horizon=0.5, clouds=0.6, sun=(0.3, 0.2), ground='hills', amp=30, scale=50, ramp=T((80, 125, 55), (60, 100, 40), (110, 120, 80)), rock=(105, 100, 90), wq=0.3, water_col=(30, 80, 95), fogd=350,
      structs=[('dome', 12, 45, 18)], planet=('barren0', 0.82, 0.16, 46), planet_a=0.5)
scene('earth', sky_top=(40, 100, 200), sky_hz=(190, 215, 240), horizon=0.5, clouds=0.5, sun=(0.75, 0.2), ground='hills', amp=18, scale=50, ramp=T((80, 115, 60), (100, 125, 70), (135, 130, 105)), rock=(125, 118, 105), wq=0.35, water_col=(25, 70, 110), fogd=380,
      structs=[('city', 30, 140, 120), ('city', -90, 230, 90)], planet=('barren0', 0.14, 0.14, 40), planet_a=0.6)
scene('ocean1', sky_top=(30, 100, 200), sky_hz=(180, 220, 240), horizon=0.48, clouds=0.5, sun=(0.7, 0.2), ground='hills', amp=14, scale=40, h0=6, ramp=T((200, 190, 140), (70, 130, 60), (90, 120, 70)), wq=0.75, water_col=(15, 80, 120), fogd=420, eye=6,
      structs=[('platform', 10, 80, 40), ('platform', -60, 200, 40)])
scene('ocean2', sky_top=(80, 120, 190), sky_hz=(250, 200, 160), horizon=0.5, clouds=0.4, cloud_col=(255, 210, 180), sun=(0.5, 0.44), sun_col=(255, 210, 160), ground='hills', amp=12, scale=35, h0=6, ramp=T((190, 175, 130), (60, 110, 60)), wq=0.8, water_col=(20, 50, 80), fogd=360, eye=5,
      structs=[('dome', -15, 55, 22)], planet=('gas_neptune', 0.2, 0.22, 90), planet_a=0.55)
scene('jungle1', sky_top=(60, 120, 170), sky_hz=(190, 215, 205), horizon=0.46, clouds=0.7, sun=(0.65, 0.12), ground='hills', amp=24, scale=35, ramp=T((30, 70, 30), (45, 95, 35), (60, 110, 45)), rock=(70, 85, 55), wq=0.2, water_col=(30, 60, 50), fogd=170, fog=(170, 200, 185),
      structs=[('dome', 0, 50, 22), ('dome', 30, 80, 20)])
scene('jungle2', sky_top=(70, 110, 120), sky_hz=(200, 210, 170), horizon=0.5, clouds=0.6, sun=(0.3, 0.2), ground='mountains', amp=40, scale=45, ramp=T((25, 60, 25), (40, 90, 30), (70, 100, 50)), rock=(80, 90, 60), wq=0.2, water_col=(35, 60, 45), fogd=150, fog=(190, 205, 175),
      structs=[('arcology', -20, 90, 45)])
scene('desert1', sky_top=(90, 130, 190), sky_hz=(235, 205, 160), horizon=0.5, sun=(0.75, 0.2), sun2=(0.62, 0.28), ground='dunes', amp=14, scale=35, ramp=T((170, 120, 70), (210, 160, 100), (230, 190, 135)), fogd=420, fog=(230, 200, 160),
      structs=[('outpost', -10, 50, 26)], planet=('barren2', 0.22, 0.2, 60), planet_a=0.55)
scene('desert2', sky_top=(150, 90, 70), sky_hz=(240, 170, 110), horizon=0.48, sun=(0.3, 0.3), sun_col=(255, 190, 130), ground='mountains', amp=40, scale=60, ridge=1.3, ramp=T((120, 60, 35), (170, 90, 50), (200, 130, 80)), rock=(140, 75, 45), fogd=360, fog=(220, 150, 100),
      structs=[('outpost', 20, 80, 30)])
scene('desert3', sky_top=(110, 120, 150), sky_hz=(220, 210, 180), horizon=0.52, sun=(0.82, 0.14), ground='dunes', amp=10, scale=28, ramp=T((180, 160, 110), (215, 195, 140)), fogd=330, fog=(220, 210, 180),
      structs=[('city', 0, 160, 80)], lights=False)
scene('ice1', sky_top=(15, 25, 60), sky_hz=(110, 150, 190), horizon=0.5, stars=True, aurora=True, sun=(0.15, 0.46), sun_col=(200, 220, 255), ground='mountains', amp=36, scale=60, ramp=T((150, 175, 200), (210, 225, 240), (245, 250, 255)), rock=(120, 140, 165), fogd=420, fog=(120, 155, 190),
      structs=[('dome', 0, 50, 20), ('dome', -20, 70, 14)], lights=True)
scene('ice2', sky_top=(80, 130, 190), sky_hz=(215, 230, 245), horizon=0.48, clouds=0.4, sun=(0.7, 0.2), ground='hills', amp=20, scale=45, ramp=T((190, 210, 230), (230, 240, 250), (250, 252, 255)), rock=(150, 170, 190), wq=0.2, water_col=(40, 70, 100), fogd=380, fog=(200, 220, 240),
      structs=[('outpost', 10, 70, 28)], planet=('gas_uranus', 0.22, 0.2, 110), planet_a=0.7)
scene('lava1', sky_top=(30, 10, 10), sky_hz=(160, 60, 30), horizon=0.5, clouds=0.5, cloud_col=(90, 40, 30), sun=(0.8, 0.25), sun_col=(255, 150, 90), ground='mountains', amp=38, scale=50, ramp=T((30, 25, 25), (50, 40, 38), (75, 60, 55)), rock=(45, 38, 36), lava=True, fogd=260, fog=(120, 50, 30), amb=0.35,
      structs=[('foundry', 0, 70, 50)])
scene('lava2', sky_top=(10, 8, 12), sky_hz=(120, 50, 40), horizon=0.52, stars=True, sun=(0.2, 0.3), sun_col=(255, 130, 80), ground='hills', amp=20, scale=40, ramp=T((25, 20, 20), (55, 45, 40)), lava=True, fogd=240, fog=(90, 35, 25), amb=0.3,
      structs=[('foundry', -15, 90, 55), ('dome', 25, 60, 18)], planet=('gas_ember', 0.75, 0.2, 120), planet_a=0.8)
scene('moon1', sky_top=(0, 0, 3), sky_hz=(8, 8, 14), horizon=0.5, stars=True, sun=(0.85, 0.12), ground='craters', amp=16, scale=60, ramp=T((70, 70, 72), (130, 128, 125), (170, 168, 165)), fogd=5000, fog=(10, 10, 14), amb=0.08, light=(-0.7, 0.4, 0.4),
      structs=[('dome', 0, 50, 20), ('outpost', 25, 90, 30)], planet=('earth', 0.25, 0.25, 130), planet_a=1.0, lights=True)
scene('moon2', sky_top=(0, 0, 4), sky_hz=(10, 8, 6), horizon=0.48, stars=True, sun=(0.15, 0.1), ground='craters', amp=20, scale=50, ramp=T((80, 65, 50), (140, 120, 95), (180, 165, 140)), fogd=5000, fog=(12, 10, 8), amb=0.08, light=(0.6, 0.45, 0.4),
      structs=[('outpost', -10, 60, 30)], planet=('gas_jovian', 0.7, 0.28, 220), planet_a=1.0)
scene('moon3', sky_top=(0, 0, 2), sky_hz=(6, 8, 12), horizon=0.52, stars=True, sun=(0.5, 0.06), ground='craters', amp=12, scale=45, ramp=T((60, 65, 75), (115, 120, 130), (170, 175, 185)), fogd=5000, fog=(8, 9, 12), amb=0.07,
      structs=[('city', 0, 120, 70)], planet=('gas_saturn', 0.2, 0.25, 200), planet_a=1.0, lights=True)
scene('toxic1', sky_top=(80, 90, 30), sky_hz=(190, 200, 100), horizon=0.5, clouds=0.75, cloud_col=(170, 180, 90), sun=(0.6, 0.15), sun_col=(240, 255, 170), ground='hills', amp=22, scale=40, ramp=T((70, 75, 30), (100, 110, 40), (130, 130, 60)), wq=0.3, water_col=(60, 80, 20), fogd=150, fog=(160, 170, 80),
      structs=[('arcology', 0, 80, 45)])
scene('toxic2', sky_top=(50, 30, 60), sky_hz=(160, 110, 150), horizon=0.5, clouds=0.6, cloud_col=(150, 110, 150), sun=(0.3, 0.2), sun_col=(255, 200, 255), ground='mountains', amp=34, scale=50, ramp=T((50, 35, 55), (85, 60, 90), (120, 95, 120)), wq=0.25, water_col=(60, 30, 70), fogd=170, fog=(140, 100, 140),
      structs=[('dome', -10, 60, 22), ('dome', 15, 75, 18)])
scene('crystal1', sky_top=(30, 15, 60), sky_hz=(170, 130, 220), horizon=0.5, stars=True, sun=(0.75, 0.18), sun_col=(230, 200, 255), ground='hills', amp=18, scale=40, ramp=T((70, 55, 100), (110, 90, 150), (150, 130, 190)), fogd=300, fog=(150, 120, 200),
      structs=[('crystals', 0, 40, 30), ('crystals', -25, 70, 30), ('crystals', 30, 110, 40)], planet=('crystal1', 0.2, 0.2, 80), planet_a=0.7)
scene('crystal2', sky_top=(10, 40, 50), sky_hz=(130, 210, 210), horizon=0.5, clouds=0.3, cloud_col=(200, 250, 250), sun=(0.3, 0.2), ground='mountains', amp=30, scale=50, ramp=T((40, 80, 90), (80, 140, 150), (150, 210, 210)), rock=(60, 110, 120), fogd=300, fog=(120, 200, 200),
      structs=[('crystals', 10, 50, 36), ('crystals', -20, 90, 40)])
scene('city1', sky_top=(5, 8, 25), sky_hz=(60, 50, 80), horizon=0.42, stars=True, sun=(0.9, 0.5), sun_col=(255, 150, 120), ground='city', amp=6, scale=40, ramp=T((40, 40, 48), (60, 60, 70)), fogd=320, fog=(50, 45, 70), amb=0.2, lights=True,
      structs=SPRAWL(1), planet=('barren3', 0.15, 0.15, 60), planet_a=0.8)
scene('city2', sky_top=(60, 80, 140), sky_hz=(220, 200, 180), horizon=0.44, clouds=0.35, sun=(0.2, 0.3), ground='city', amp=6, scale=40, ramp=T((60, 72, 60), (85, 95, 80), (100, 100, 100)), fogd=360, fog=(200, 190, 180),
      structs=SPRAWL(2))
scene('gas1', sky_top=(60, 40, 20), sky_hz=(230, 180, 120), horizon=0.5, sun=(0.75, 0.2), ground='clouds', amp=10, scale=40, ramp=T((150, 100, 60), (210, 160, 110), (240, 215, 175)), fogd=420, fog=(230, 190, 140), eye=14,
      structs=[('cplatform', 0, 60, 40), ('cplatform', -50, 160, 40)], planet=('barren1', 0.2, 0.18, 50), planet_a=0.6)
scene('gas2', sky_top=(15, 30, 80), sky_hz=(110, 160, 230), horizon=0.5, sun=(0.3, 0.2), ground='clouds', amp=12, scale=45, ramp=T((40, 70, 140), (80, 120, 200), (170, 200, 240)), fogd=420, fog=(110, 150, 220), eye=14,
      structs=[('cplatform', 15, 70, 45)], planet=('ice2', 0.78, 0.2, 60), planet_a=0.6)
scene('inalumen', sky_top=(60, 50, 120), sky_hz=(225, 200, 240), horizon=0.5, clouds=0.35, cloud_col=(250, 235, 255), sun=(0.72, 0.2), sun_col=(255, 245, 255), ground='hills', amp=16, scale=45, ramp=T((190, 185, 215), (225, 220, 240), (245, 245, 252)), wq=0.25, water_col=(90, 90, 160), fogd=330, fog=(215, 200, 235),
      structs=[('spires', 0, 70, 60), ('spires', -60, 150, 50), ('spires', 70, 190, 50)], planet=('crystal0', 0.2, 0.2, 70), planet_a=0.5)
scene('threshold', sky_top=(2, 2, 10), sky_hz=(30, 30, 60), horizon=0.62, stars=True, sun=(0.85, 0.14), sun_col=(230, 235, 255), ground='hills', amp=10, scale=40, ramp=T((170, 175, 200), (215, 220, 235)), fogd=600, fog=(40, 40, 70), amb=0.2,
      structs=[('spires', 0, 55, 55)], planet=('gas_violet', 0.22, 0.3, 160), planet_a=1.0)
STATIONS = ['ring', 'spindle', 'cross', 'rock', 'twin', 'yard', 'disc', 'hive', 'crystal', 'reef', 'forge', 'junk']

def make_station(nm, r):
    yy, xx = np.mgrid[0:HH, 0:WW] / np.array([HH, WW])[:, None, None]
    bg = np.zeros((HH, WW, 3)) + 0.012; st = r.random((HH, WW)); bg += (st > 0.998)[..., None] * r.uniform(0.3, 1.0, (HH, WW))[..., None]
    pk = ['terran0', 'ocean1', 'desert1', 'ice1', 'gas_jovian2', 'gas_neptune2', 'toxic1', 'crystal0', 'lava1', 'jungle1', 'barren4', 'city0'][STATIONS.index(nm)]
    f = os.path.join(PLAN, pk + '.webp')
    if os.path.exists(f):
        ps = int(WW * 1.35); im = Image.open(f).convert('RGBA').resize((ps, ps), Image.LANCZOS); a = np.asarray(im).astype(float) / 255
        y0 = int(HH * 0.55); x0 = int(WW * 0.5 - ps / 2); h_ = min(HH - y0, ps); sub = a[:h_, max(0, -x0):max(0, -x0) + WW]
        k = sub[..., 3:4]; bg[y0:y0 + h_, :sub.shape[1]] = bg[y0:y0 + h_, :sub.shape[1]] * (1 - k) + sub[..., :3] * k
    M = RS.DESIGNS[nm](); V = np.concatenate([m.V for m in M]); rad = np.sqrt(V[:, 0] ** 2 + V[:, 1] ** 2).max()
    S = WW; o = render(M, S, 25, S * 0.2 / rad, tilt=35, density=12, ss=1); rgb, a = o[0]
    off = (S - HH) // 2 + int(HH * 0.06); rgb = rgb[off:off + HH]; a = a[off:off + HH][..., None]
    return np.clip(rgb, 0, 1) * a + bg * (1 - a)

BUILD = {'spires': spires, 'city': lambda s: city_cluster(s), 'outpost': outpost, 'dome': lambda s: dome(0, 0, 0.4), 'foundry': foundry, 'arcology': arcology, 'crystals': crystals,
         'platform': lambda s: [block((0, 0, 0.02), (0.9, 0.5, 0.04), RS.HULL)] + city_cluster(s, 8, 0.8, domes=1, spire=False), 'cplatform': cloud_platform}
def build_scene(name, sp):
    sp = dict(sp); sp['seed'] = zlib.crc32(name.encode()) % 100000; r = np.random.default_rng(sp['seed'])
    sky = make_sky(sp, r); img, depth = make_terrain(sp, sky, r)
    for kind, x, z, w in sorted(sp.get('structs', []), key=lambda s: -s[2]):
        spr = sprite_of(BUILD[kind](sp['seed'] + int(x)), size=380 if w < 60 else 520, tilt=84)
        place(img, depth, sp, spr, x, z, w * (0.5 if kind in ('dome',) else 1.0))
    return img

if __name__ == '__main__':
    man = {}
    for name, sp in SCENES.items():
        if ONLY and not name.startswith(ONLY): continue
        img = build_scene(name, sp)
        im = Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS).filter(ImageFilter.UnsharpMask(1.2, 40, 2))
        im.save(os.path.join(OUT, f'l_{name}.jpg'), quality=87); print(name, flush=True)
    for nm in STATIONS:
        if ONLY and not ('st_' + nm).startswith(ONLY): continue
        img = make_station(nm, np.random.default_rng(len(nm)))
        Image.fromarray((np.clip(img, 0, 1) * 255).astype(np.uint8)).resize((W, H), Image.LANCZOS).save(os.path.join(OUT, f'l_st_{nm}.jpg'), quality=87); print('st_' + nm, flush=True)
