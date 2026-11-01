"""Quantum Rift system scenery, third wave (procedural, in the style of tools/rift_decor.py and rift_decor2.py).
  nebula_8..15     new gas clouds: emission pillars, a supernova shell, a planetary nebula, reflection wisps, an oxygen veil,
                   amber dust, a crimson storm and a dark dust cloud
  galaxy_6..11     ring galaxy, colliding pair, dusty edge-on, irregular dwarf, giant elliptical, quasar with jets
  far_*            far-sky celestial objects: protostar, pulsar, supernova, Dyson swarm, blue black hole, white-dwarf binary,
                   rogue planet, comet swarm
  wreck_6..13      faction capital hulls (rendered by tools/ships26), aged, holed and broken
  wreck_s_0..11    small wrecks: freighters, fighters, scouts and yachts, holed or snapped in two (common; the big ones are rare)
  derelict_4..7    abandoned stations from the new station designs, dark and scorched
usage: python3 tools/rift_decor3.py client/assets/decor <wreck source dir> <station dir>   (needs numpy, scipy and Pillow)"""
import sys, os, math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/decor'
WSRC = sys.argv[2] if len(sys.argv) > 2 else None
STATIONS = sys.argv[3] if len(sys.argv) > 3 else None
ONLY = sys.argv[4:]
os.makedirs(OUT, exist_ok=True)

def fbm(n, octaves=6, base=4, persist=0.55, seed=0):
    r = np.random.default_rng(seed); out = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(octaves):
        s = base * 2 ** o; g = r.standard_normal((s + 3, s + 3))
        y, x = np.mgrid[0:n, 0:n] / n * s + 1
        out += map_coordinates(g, [y, x], order=3, mode='wrap') * amp; tot += amp; amp *= persist
    out /= tot; out -= out.min(); out /= out.max() or 1; return out
def save(name, rgba, q=86):
    Image.fromarray(np.clip(rgba * 255, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=q, method=6); print(name, flush=True)
def radial(n): y, x = (np.mgrid[0:n, 0:n] - (n - 1) / 2) / (n / 2); return x, y, np.hypot(x, y)
def additive(rgb):   # nebulae are drawn additively: store colour as hue, alpha as brightness
    a = np.clip(rgb.max(axis=2), 0, 1); return np.dstack([np.clip(rgb / np.maximum(a, 1e-3)[..., None], 0, 1), a])
def want(name): return not ONLY or any(name.startswith(o) for o in ONLY)

# ================================================================== nebulae
def cloud(n, s, warp=0.35):
    w1, w2 = fbm(n, 4, 3, 0.5, s), fbm(n, 4, 3, 0.5, s + 1); y, x = np.mgrid[0:n, 0:n].astype(float)
    base = fbm(n, 7, 3, 0.58, s + 2)
    return map_coordinates(base, [(y + (w1 - 0.5) * n * warp) % n, (x + (w2 - 0.5) * n * warp) % n], order=1, mode='wrap')
def stars_in(n, s, dens, k=6): return gaussian_filter((np.random.default_rng(s).random((n, n)) > 0.9993) * dens, 0.8)[..., None] * k

def neb_pillars(n=640, s=801):   # emission nebula studded with dark globules, each with a bright rim where starlight erodes it
    x, y, d = radial(n); c = cloud(n, s)
    dens = np.clip((c - 0.3) / 0.6, 0, 1) ** 1.4 * np.clip(1 - d, 0, 1) ** 1.2
    rng = np.random.default_rng(s); glob_ = np.zeros((n, n))
    for _ in range(7):
        cx, cy, rr = rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), rng.uniform(0.04, 0.12)
        wob = 1 + 0.35 * (fbm(n, 3, 5, 0.5, int(rng.integers(1e6))) - 0.5)
        glob_ = np.maximum(glob_, (np.hypot(x - cx, (y - cy) * 1.4) < rr * wob) * 1.0)
    glob_ = gaussian_filter(glob_, 2.5); rim = np.clip(gaussian_filter(glob_, 5) - glob_, 0, 1) * 5
    col = np.array([1.0, 0.45, 0.3]) * (1 - np.clip(y, -1, 1)[..., None] * 0.25) + np.array([0.25, 0.7, 0.75]) * np.clip(-y, 0, 1)[..., None] * 0.8
    rgb = col * dens[..., None] * (1 - glob_[..., None] * 0.9) * 1.2 + rim[..., None] * np.array([1.0, 0.8, 0.55]) * np.clip(dens * 2, 0, 1)[..., None]
    return additive(rgb + stars_in(n, s, dens))
def neb_shell(n=640, s=802):    # a supernova remnant: a torn shell of filaments, red outside, green-blue inside
    x, y, d = radial(n); a = np.arctan2(y, x)
    wob = (fbm(n, 4, 3, 0.5, s) - 0.5) * 0.25; R = 0.62 + wob
    fil = fbm(n, 6, 8, 0.6, s + 1); fil = (1 - np.abs(fil - 0.5) * 2) ** 5
    shell = np.exp(-((d - R) / 0.07) ** 2) * (0.4 + 0.6 * fbm(n, 4, 5, 0.5, s + 2))
    inner = np.exp(-((d - R + 0.12) / 0.1) ** 2) * 0.6
    rgb = shell[..., None] * np.array([1.0, 0.3, 0.25]) * (0.5 + fil[..., None] * 1.5) + inner[..., None] * np.array([0.3, 0.9, 0.8]) * (0.4 + fil[..., None])
    core = np.exp(-(d / 0.02) ** 2) * 2; rgb += core[..., None] * np.array([0.7, 0.85, 1.0])
    return additive(rgb * 1.1)
def neb_planetary(n=640, s=803):   # a planetary nebula: an eye of glowing gas round a white dwarf
    x, y, d = radial(n); xs, ys = x * 0.85 + y * 0.5, (-x * 0.5 + y * 0.85) / 0.7; e = np.hypot(xs, ys)
    t = fbm(n, 5, 6, 0.55, s)
    ring = np.exp(-((e - 0.45) / 0.09) ** 2) * (0.6 + 0.5 * t); halo = np.exp(-((e - 0.7) / 0.18) ** 2) * 0.35 * t
    inner = np.exp(-(e / 0.35) ** 2) * 0.5
    rgb = inner[..., None] * np.array([0.35, 0.8, 1.0]) + ring[..., None] * np.array([0.9, 0.85, 0.5]) + halo[..., None] * np.array([1.0, 0.3, 0.35])
    rgb += np.exp(-(d / 0.015) ** 2)[..., None] * 2.0
    return additive(rgb)
def neb_wisps(n=640, s=804):    # a blue reflection nebula: soft wisps lit by nearby hot stars
    x, y, d = radial(n); c = cloud(n, s, 0.5); streak = fbm(n, 5, 4, 0.6, s + 3)
    dens = np.clip((c - 0.4) / 0.5, 0, 1) ** 2 * np.clip(1 - d, 0, 1) ** 1.2
    rgb = dens[..., None] * np.array([0.45, 0.65, 1.0]) * (0.6 + streak[..., None] * 0.8)
    for cx, cy in ((-0.2, 0.1), (0.25, -0.15), (0.05, 0.3)): rgb += (np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / 0.0004) * 2)[..., None] * np.array([0.85, 0.92, 1.0])
    return additive(rgb)
def neb_veil(n=640, s=805):     # an oxygen veil: long thin green and red filaments
    x, y, d = radial(n); f1 = fbm(n, 6, 3, 0.65, s); f2 = fbm(n, 6, 3, 0.65, s + 1)
    g = (1 - np.abs(f1 - 0.5) * 2) ** 30; r_ = (1 - np.abs(f2 - 0.5) * 2) ** 34
    m1 = np.clip((fbm(n, 3, 2, 0.5, s + 7) - 0.5) / 0.15, 0, 1); m2 = np.clip((fbm(n, 3, 2, 0.5, s + 8) - 0.55) / 0.15, 0, 1)
    g = g * m1; r_ = r_ * m2
    fall = np.clip(1 - d, 0, 1) ** 1.2
    rgb = (g[..., None] * np.array([0.3, 1.0, 0.6]) + r_[..., None] * np.array([1.0, 0.3, 0.35])) * fall[..., None] * 1.4
    return additive(rgb)
def neb_colour(n, s, c1, c2, warp=0.35, dark=0.6, gain=1.0):
    x, y, d = radial(n); c = cloud(n, s, warp)
    fil = fbm(n, 6, 6, 0.6, s + 3); fil = (1 - np.abs(fil - 0.5) * 2) ** 6
    fall = np.clip(1 - d, 0, 1) ** 1.6 * (0.6 + 0.4 * fbm(n, 3, 2, 0.5, s + 4))
    dens = np.clip((c - 0.35) / 0.55, 0, 1) ** 1.8 * fall; mk = fbm(n, 4, 2, 0.5, s + 5)[..., None]
    rgb = (np.array(c1) * (1 - mk) + np.array(c2) * mk) * (dens[..., None] * 0.9 + (fil * dens)[..., None] * 1.4)
    dk = np.clip((fbm(n, 5, 5, 0.55, s + 6) - dark) / 0.2, 0, 1) * dens; rgb *= (1 - dk[..., None] * 0.8)
    return additive(rgb * gain + stars_in(n, s, dens))
NEBULAE = [('nebula_8', neb_pillars), ('nebula_9', neb_shell), ('nebula_10', neb_planetary), ('nebula_11', neb_wisps), ('nebula_12', neb_veil),
           ('nebula_13', lambda: neb_colour(640, 813, (1.0, 0.75, 0.35), (0.8, 0.5, 0.2), dark=0.55, gain=1.9)),
           ('nebula_14', lambda: neb_colour(640, 814, (0.95, 0.15, 0.3), (0.6, 0.1, 0.5), warp=0.5, dark=0.55, gain=1.1)),
           ('nebula_15', lambda: neb_colour(640, 815, (0.85, 0.55, 0.6), (0.55, 0.45, 0.65), warp=0.3, dark=0.5, gain=1.6))]

# ================================================================== galaxies
CORE = np.array([1.0, 0.92, 0.78]); ARM = np.array([0.72, 0.82, 1.0]); HII = np.array([1.0, 0.55, 0.75])
def gal_finish(name, col, lum, d):
    alpha = np.clip(lum, 0, 1) ** 0.85 * (1 - np.clip((d - 0.82) / 0.18, 0, 1))
    save(name, np.dstack([np.clip(col / np.maximum(lum, 1e-3)[..., None], 0, 1), alpha * 0.95]))
def spiral_field(x, y, s, arms=2, k=4.0, scale=1.0, twist=0.0):
    d = np.hypot(x, y) / scale; a = np.arctan2(y, x)
    armv = (0.5 + 0.5 * np.cos(a * arms - np.log(np.maximum(d, 1e-3)) * k * arms / 2.2 + twist)) ** 3
    disk = np.exp(-d / 0.38) * (d < 1.0)
    arm = armv * disk * np.clip(d * 3.2, 0, 1); core = np.exp(-(d / 0.11) ** 2) * 1.3 + np.exp(-(d / 0.26) ** 2) * 0.35
    return arm, core
def galaxies():
    n = 384; x, y, d = radial(n)
    # ring galaxy: a bright blue ring of new stars around an old yellow core
    ring = np.exp(-((d - 0.6) / 0.07) ** 2) * (0.5 + 0.7 * fbm(n, 5, 8, 0.6, 61)); core = np.exp(-(d / 0.08) ** 2) * 1.2
    knots = (fbm(n, 3, 40, 0.5, 62) > 0.75) * ring
    gal_finish('galaxy_6', ring[..., None] * ARM + core[..., None] * CORE + knots[..., None] * HII, ring + core + knots * 0.5, d)
    # colliding pair: two spirals with a tidal bridge
    a1, c1 = spiral_field(x + 0.35, y + 0.1, 63, 2, 4.2, 0.55, 0.5); a2, c2 = spiral_field(x - 0.4, y - 0.15, 64, 2, 3.6, 0.42, 2.0)
    bridge = np.exp(-((y - (x * 0.3 - 0.0)) / 0.05) ** 2) * (np.abs(x) < 0.4) * 0.35 * fbm(n, 4, 6, 0.6, 65)
    lum = a1 + c1 + a2 + c2 + bridge; gal_finish('galaxy_7', (a1 + a2 + bridge)[..., None] * ARM + (c1 + c2)[..., None] * CORE, lum, d)
    # dusty edge-on with a thick lane and a halo
    xs = x * 0.97 + y * 0.25; ys = -x * 0.25 + y * 0.97
    disk = np.exp(-np.abs(ys) / 0.05 - np.abs(xs) / 0.5) * (np.abs(xs) < 1); bulge = np.exp(-(xs ** 2 / 0.03 + ys ** 2 / 0.02)) * 1.2
    lane = 1 - 0.95 * np.exp(-(ys / 0.02) ** 2) * (np.abs(xs) < 0.9) * (0.7 + 0.3 * fbm(n, 5, 10, 0.6, 66))
    halo = np.exp(-np.hypot(xs, ys * 2) / 0.35) * 0.25
    lum = (disk + bulge + halo) * lane; gal_finish('galaxy_8', (disk[..., None] * ARM + (bulge + halo)[..., None] * CORE) * lane[..., None], lum, d)
    # irregular dwarf: clumps of star-forming knots
    cl = np.clip((fbm(n, 5, 4, 0.6, 67) - 0.45) / 0.4, 0, 1) * np.exp(-d / 0.4); kn = (fbm(n, 3, 30, 0.5, 68) > 0.72) * cl * 1.5
    gal_finish('galaxy_9', cl[..., None] * np.array([0.7, 0.75, 1.0]) + kn[..., None] * HII, cl + kn * 0.6, d)
    # giant elliptical with a swarm of globular clusters
    e = np.hypot(x * 0.8 + y * 0.6, (-x * 0.6 + y * 0.8) / 0.75); lum = np.exp(-(e / 0.25) ** 0.7) * 1.3
    gl = (np.random.default_rng(69).random((n, n)) > 0.9975) * np.exp(-d / 0.7); gl = gaussian_filter(gl.astype(float), 1.0) * 8
    gal_finish('galaxy_10', lum[..., None] * np.array([1.0, 0.85, 0.65]) + gl[..., None], lum + gl, d)
    # quasar: a blazing core and twin jets
    core = np.exp(-(d / 0.03) ** 2) * 3 + np.exp(-(d / 0.12) ** 2) * 0.6
    jx = x * 0.8 - y * 0.6; jy = x * 0.6 + y * 0.8
    jet = np.exp(-(jy / (0.012 + 0.05 * np.abs(jx))) ** 2) * np.exp(-np.abs(jx) / 0.5) * (0.6 + 0.4 * fbm(n, 4, 12, 0.6, 70)) * 1.2
    host = np.exp(-d / 0.25) * 0.35
    gal_finish('galaxy_11', core[..., None] * np.array([0.85, 0.9, 1.0]) + jet[..., None] * np.array([0.45, 0.65, 1.0]) + host[..., None] * CORE, core + jet + host, d)

# ================================================================== far-sky celestial objects
def far_objects():
    n = 720; x, y, d = radial(n); a = np.arctan2(y, x)
    # protostar: a hot young star inside an edge-on disc, with bipolar jets
    ys = y / 0.18; disc = np.exp(-((np.hypot(x, ys) - 0.45) / 0.3) ** 2) * (np.abs(y) < 0.2) * (0.5 + 0.5 * fbm(n, 5, 8, 0.6, 81))
    lane = 1 - 0.9 * np.exp(-(y / 0.02) ** 2) * (np.abs(x) < 0.7)
    jet = np.exp(-(x / (0.01 + 0.06 * np.abs(y))) ** 2) * np.exp(-np.abs(y) / 0.45) * (0.5 + 0.5 * fbm(n, 4, 10, 0.6, 82))
    star = np.exp(-(d / 0.04) ** 2) * 3
    rgb = (disc[..., None] * np.array([1.0, 0.55, 0.35]) + star[..., None] * np.array([1.0, 0.95, 0.85])) * lane[..., None] + jet[..., None] * np.array([0.6, 0.75, 1.0]) * 1.4
    save('far_protostar', additive(rgb))
    # pulsar: a blue-white point with twin sweeping beams and a faint wind nebula
    beam = np.exp(-((x * 0.7 + y * 0.7) / (0.006 + 0.04 * np.abs(-x * 0.7 + y * 0.7))) ** 2) * np.exp(-np.abs(-x * 0.7 + y * 0.7) / 0.6)
    wind = np.exp(-(d / 0.25) ** 2) * (0.3 + 0.7 * fbm(n, 5, 6, 0.6, 83)) * 0.5
    rgb = beam[..., None] * np.array([0.6, 0.8, 1.0]) * 1.4 + wind[..., None] * np.array([0.45, 0.4, 1.0]) + np.exp(-(d / 0.02) ** 2)[..., None] * 3
    save('far_pulsar', additive(rgb))
    # supernova: a star blowing apart, a blinding core inside an expanding ragged shell
    shell = np.exp(-((d - 0.5 - (fbm(n, 4, 5, 0.5, 84) - 0.5) * 0.15) / 0.06) ** 2)
    rays = (0.5 + 0.5 * np.cos(a * 24 + fbm(n, 3, 4, 0.5, 85) * 4)) ** 8 * np.exp(-d / 0.25)
    rgb = shell[..., None] * np.array([1.0, 0.5, 0.3]) + rays[..., None] * np.array([1.0, 0.9, 0.7]) + np.exp(-(d / 0.08) ** 2)[..., None] * np.array([1.0, 1.0, 0.95]) * 3
    save('far_supernova', additive(rgb))
    # Dyson swarm: a star half-hidden by a cloud of collector panels catching its light
    star = np.exp(-(d / 0.18) ** 2) * 2.2 + np.exp(-(d / 0.4) ** 2) * 0.4
    rng = np.random.default_rng(86); pan = np.zeros((n, n))
    for _ in range(900):
        rr = rng.uniform(0.22, 0.75); th = rng.uniform(0, 6.283); px = rr * math.cos(th); py = rr * math.sin(th) * 0.45
        i, j = int((py + 1) / 2 * n), int((px + 1) / 2 * n); s_ = rng.integers(2, 5)
        pan[max(0, i - s_):i + s_, max(0, j - s_ * 2):j + s_ * 2] = rng.uniform(0.4, 1.0)
    lit = np.exp(-(d / 0.5) ** 2)
    rgb = star[..., None] * np.array([1.0, 0.88, 0.6]) * (1 - pan[..., None] * 0.8) + pan[..., None] * lit[..., None] * np.array([1.0, 0.75, 0.35]) * 0.9
    save('far_dyson', additive(rgb))
    # a blue black hole: a hot accretion disc seen nearly edge-on, lensed over the top
    ys = y / 0.22; r_ = np.hypot(x, ys); disc = np.exp(-((r_ - 0.55) / 0.25) ** 2) * (r_ > 0.2) * (0.6 + 0.4 * np.cos(a * 30 + r_ * 20))
    lens = np.exp(-((d - 0.3) / 0.04) ** 2) * (y < 0) * 0.9
    hole = d < 0.2
    rgb = (disc[..., None] * np.array([0.5, 0.75, 1.0]) * (1 + 0.6 * np.clip(-x, 0, 1))[..., None] + lens[..., None] * np.array([0.75, 0.9, 1.0])) * (~hole)[..., None]
    rgba = additive(rgb); rgba[hole] = [0, 0, 0, 1.0]; rgba[..., 3] = np.maximum(rgba[..., 3], (d < 0.205) * 1.0)
    save('far_blackhole_blue', rgba)
    # white-dwarf binary: a dwarf stripping gas from a red giant in a glowing stream
    giant = np.exp(-(((x + 0.35) ** 2 + y ** 2) / 0.09)) * 1.5; dwarf = np.exp(-(((x - 0.45) ** 2 + (y + 0.05) ** 2) / 0.0006)) * 3
    t = np.clip((x + 0.1) / 0.55, 0, 1); stream = np.exp(-((y - (-0.05 * t - 0.25 * t * (1 - t))) / 0.02) ** 2) * (x > -0.1) * (x < 0.45)
    disc = np.exp(-((np.hypot(x - 0.45, (y + 0.05) / 0.35) - 0.08) / 0.03) ** 2)
    rgb = giant[..., None] * np.array([1.0, 0.45, 0.25]) + dwarf[..., None] * np.array([0.85, 0.9, 1.0]) + (stream + disc)[..., None] * np.array([1.0, 0.7, 0.5])
    save('far_binary_dwarf', additive(rgb))

# ================================================================== broken capital wrecks and abandoned stations
def breakup(src, seed, cut_angle, n_holes=(6, 11)):
    r = np.random.default_rng(seed); a = np.asarray(src).astype(float) / 255; rgb, al = a[..., :3], a[..., 3]; sz = rgb.shape[0]
    lum = rgb @ np.array([0.3, 0.55, 0.15])
    grime = fbm(sz, 6, 8, 0.6, seed)[..., None]
    rgb = lum[..., None] * (np.array([0.38, 0.38, 0.40]) * (1 - grime) + np.array([0.42, 0.30, 0.22]) * grime) * 1.7
    scorch = np.clip((fbm(sz, 5, 5, 0.55, seed + 2) - 0.5) / 0.25, 0, 1); rgb *= (1 - scorch[..., None] * 0.75)
    holes = np.zeros((sz, sz)); yy, xx = np.mgrid[0:sz, 0:sz]; inside = np.argwhere(al > 0.6)
    for _ in range(r.integers(*n_holes)):
        cy, cx = inside[r.integers(len(inside))]; rad = r.uniform(0.02, 0.06) * sz
        nn = fbm(64, 3, 4, 0.5, int(r.integers(1e6))); ang = np.arctan2(yy - cy, xx - cx)
        jag = map_coordinates(nn, [((ang + np.pi) / (2 * np.pi) * 63), np.full(ang.shape, 20.0)], order=1, mode='wrap')
        holes = np.maximum(holes, (np.hypot(yy - cy, xx - cx) < rad * (0.7 + 0.6 * jag)).astype(float))
    rim = np.clip(gaussian_filter(holes, sz * 0.012) * 2.2 - holes * 2.2, 0, 1); rgb *= (1 - rim[..., None] * 0.8); al = al * (1 - holes)
    out = None
    if cut_angle is not None:
        ca, sa = math.cos(cut_angle), math.sin(cut_angle)
        t = (xx - sz / 2) * ca + (yy - sz / 2) * sa; u = -(xx - sz / 2) * sa + (yy - sz / 2) * ca
        jag = (fbm(256, 4, 8, 0.6, seed + 3)[0][np.clip(((u / sz + 0.5) * 255).astype(int), 0, 255)] - 0.5) * sz * 0.08
        side = t > jag + r.uniform(-0.08, 0.08) * sz; gap = np.abs(t - jag) < sz * 0.012; al = al * (1 - gap)
        edge = (np.abs(t - jag) < sz * 0.03) * (al > 0); rgb = rgb * (1 - edge[..., None] * 0.6) + edge[..., None] * np.array([0.25, 0.08, 0.02]) * 0.4
    lights = (r.random((sz, sz)) > 0.99988) * (al > 0.8) * (scorch < 0.4)
    rgb = rgb + gaussian_filter(lights.astype(float), 1.6)[..., None] * 30 * np.array([1.0, 0.55, 0.25])
    img = np.dstack([np.clip(rgb, 0, 1), np.clip(al, 0, 1)])
    if cut_angle is None: return Image.fromarray((img * 255).astype(np.uint8), 'RGBA')
    A1 = img * side[..., None]; A2 = img * (~side)[..., None]
    pad = int(sz * 0.25); W = sz + pad * 2; canvas = Image.new('RGBA', (W, W))
    p1 = Image.fromarray((A1 * 255).astype(np.uint8), 'RGBA'); p2 = Image.fromarray((A2 * 255).astype(np.uint8), 'RGBA')
    off = sz * 0.06; dx, dy = ca * off, sa * off
    canvas.alpha_composite(p2.rotate(r.uniform(-9, -3), resample=Image.BICUBIC), (int(pad - dx), int(pad - dy)))
    canvas.alpha_composite(p1.rotate(r.uniform(3, 9), resample=Image.BICUBIC), (int(pad + dx), int(pad + dy)))
    return canvas.crop(canvas.getbbox())
SMALL_WRECKS = ['mule', 'dory', 'wayfarer', 'cutlass', 'kestrel', 'lacewing', 'korrund_skiff', 'vashari_mantis', 'sarn_kite', 'thalassi_manta', 'ylith_glint', 'umbral_shade']
WRECKS = ['korrund_mountain', 'ylith_cathedral', 'vashari_brood', 'thalassi_abyssal', 'sarn_grand', 'umbral_dread', 'tempest', 'pilgrim']
DERELICTS = ['vigil', 'bazaar', 'tradepost', 'drydock']

if __name__ == '__main__':
    for name, fn in NEBULAE:
        if want(name): save(name, fn(), 82)
    if want('galaxy'): galaxies()
    if want('far_'): far_objects()
    if WSRC and want('wreck'):
        for i, key in enumerate(WRECKS):
            src = Image.open(os.path.join(WSRC, key + '.png')).convert('RGBA'); src = src.crop(src.getbbox())
            s = max(src.size); sq = Image.new('RGBA', (s, s)); sq.paste(src, ((s - src.width) // 2, (s - src.height) // 2)); sq = sq.resize((520, 520), Image.LANCZOS)
            im = breakup(sq, 900 + i, [0.5, 1.8, 2.4, 1.0, 2.1, 1.4, 0.7, 2.7][i])
            im.save(os.path.join(OUT, f'wreck_{6 + i}.webp'), 'WEBP', quality=84, method=6); print(f'wreck_{6 + i}', key, flush=True)
    if WSRC and want('wreck_s'):
        for i, key in enumerate(SMALL_WRECKS):
            src = Image.open(os.path.join(WSRC, key + '.png')).convert('RGBA'); src = src.crop(src.getbbox())
            s = max(src.size); sq = Image.new('RGBA', (s, s)); sq.paste(src, ((s - src.width) // 2, (s - src.height) // 2)); sq = sq.resize((240, 240), Image.LANCZOS)
            im = breakup(sq, 1200 + i, (None if i % 3 == 1 else [0.6, 2.0, 1.2, 2.6][i % 4]), (2, 5))
            im.save(os.path.join(OUT, f'wreck_s_{i}.webp'), 'WEBP', quality=84, method=6); print(f'wreck_s_{i}', key, flush=True)
    if STATIONS and want('derelict'):
        for i, key in enumerate(DERELICTS):
            src = Image.open(os.path.join(STATIONS, f's_{key}_landed.webp')).convert('RGBA').resize((480, 480), Image.LANCZOS)
            im = breakup(src, 950 + i, None, (3, 6)); im.save(os.path.join(OUT, f'derelict_{4 + i}.webp'), 'WEBP', quality=84, method=6); print(f'derelict_{4 + i}', key, flush=True)
