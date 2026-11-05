"""Quantum Rift sky, fifth wave: exotic far objects and gas clouds for the frontier, and a horror set for the Deep.
Same pipeline and building blocks as tools/rift_decor3.py (fbm, cloud, additive colour-as-hue/alpha-as-brightness).
  Frontier far:  far_einstein_ring, far_magnetar, far_wolf_rayet, far_globular, far_tidal_stream, far_hypergiant,
                 far_eclipsing_binary, far_light_echo
  Frontier gas:  nebula_56..65   Herbig-Haro jets, cometary globules, plasma curtains, reflection haze, dark silhouettes
  Deep far:      far_eye, far_maw, far_black_sun, far_heart, far_tendril_star
  Deep gas:      nebula_66..73   flesh clouds, spore mist, tendril nebulae, ichor, bruise
Appends the new clouds to nebula_families.json ('special' for strong shapes, 'deep' for the Deep set).
usage: python3 rift_sky5.py <decor dir> [frontier | deep | names...]"""
import sys, os, math
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, map_coordinates

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/decor'
ONLY = sys.argv[2:]
# shortcuts: 'frontier' or 'deep' expand to that set's assets
_SETS = {'frontier': ['far_einstein_ring', 'far_magnetar', 'far_wolf_rayet', 'far_globular', 'far_tidal_stream', 'far_hypergiant',
                      'far_eclipsing_binary', 'far_light_echo'] + ['nebula_%d' % i for i in range(56, 66)],
         'deep': ['far_eye', 'far_maw', 'far_black_sun', 'far_heart', 'far_tendril_star'] + ['nebula_%d' % i for i in range(66, 74)]}
ONLY = [n for o in ONLY for n in _SETS.get(o, [o])]
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

import json
def rot(x, y, a): c, s = np.cos(a), np.sin(a); return x * c + y * s, -x * s + y * c
def glowpt(d, r, k=3.0): return np.exp(-(d / r) ** 2) * k

# ================================================================== frontier: far objects
def far_frontier():
    n = 720; x, y, d = radial(n); a = np.arctan2(y, x)
    if want('far_einstein_ring'):   # a background galaxy lensed into a broken ring round an unseen mass
        R = .42 + (fbm(n, 3, 3, .5, 501) - .5) * .04
        ring = np.exp(-((d - R) / .035) ** 2) * (0.55 + 0.45 * np.cos(a * 2 + .6)) * (0.6 + 0.6 * fbm(n, 5, 10, .6, 502))
        arcs = np.exp(-((d - R) / .012) ** 2) * (np.cos(a * 2 + .6) > .3)
        rgb = ring[..., None] * np.array([.55, .7, 1.0]) + arcs[..., None] * np.array([.9, .95, 1.0]) * 1.2 + glowpt(d, .05, .8)[..., None] * np.array([1, .8, .55])
        save('far_einstein_ring', additive(rgb))
    if want('far_magnetar'):        # a pinpoint star in loops of twisted field lines
        lines = np.zeros((n, n))
        tw = (fbm(n, 4, 3, .5, 509) - .5) * .5
        for k in range(5):
            ang = .35 + k * .12 + (k % 2) * math.pi / 2 * .15; xr, yr = rot(x, y, ang + tw)
            lam = np.arctan2(yr, np.abs(xr) + 1e-6); rr = np.hypot(xr, yr)
            L = .25 + .12 * k
            curve = L * np.cos(lam) ** 2
            lines += np.exp(-((rr - curve) / (.01 + .025 * rr)) ** 2) * (rr > .03) * (0.3 + 0.7 * fbm(n, 4, 6, .55, 510 + k))
        rgb = lines[..., None] * np.array([.55, .45, 1.0]) * .9 + glowpt(d, .025, 3)[..., None] * np.array([.85, .9, 1]) + glowpt(d, .12, .4)[..., None] * np.array([.5, .4, 1])
        save('far_magnetar', additive(rgb))
    if want('far_wolf_rayet'):      # a hot star blowing a clean bubble, brighter on one side
        R = .5 + (fbm(n, 4, 6, .55, 520) - .5) * .08
        shell = np.exp(-((d - R) / .05) ** 2) * (0.5 + 0.8 * fbm(n, 5, 9, .6, 521)) * (0.6 + 0.4 * np.cos(a - 2.2))
        fill = np.exp(-(d / R) ** 6) * .12 * fbm(n, 4, 5, .5, 522)
        rgb = shell[..., None] * np.array([.35, .75, 1.0]) + fill[..., None] * np.array([.6, .3, .8]) + glowpt(d, .03, 3)[..., None]
        save('far_wolf_rayet', additive(rgb))
    if want('far_globular'):        # a dense ball of old stars
        rng = np.random.default_rng(530); m = np.zeros((n, n))
        for _ in range(9000):
            rr = abs(rng.normal(0, .18)) ** 1.2; t = rng.uniform(0, 6.283)
            i, j = int(n / 2 + rr * math.sin(t) * n / 2), int(n / 2 + rr * math.cos(t) * n / 2)
            if 0 <= i < n and 0 <= j < n: m[i, j] += rng.uniform(.3, 1.2)
        m = gaussian_filter(m, .9) * 3 + np.exp(-(d / .15) ** 2) * .6
        save('far_globular', additive(m[..., None] * np.array([1.0, .9, .72])))
    if want('far_tidal_stream'):    # a small galaxy pulled into a long arc
        t = np.clip((x + .9) / 1.8, 0, 1); yc = .35 * np.sin(t * math.pi * 1.1 - .4) - .05
        stream = np.exp(-((y - yc) / (.03 + .06 * t)) ** 2) * (x > -.9) * (x < .9) * (0.4 + 0.8 * fbm(n, 5, 10, .6, 540)) * (1 - t * .5)
        core = glowpt(np.hypot(x + .55, y - (.35 * math.sin(.15 * math.pi * 1.1 - .4) - .05)), .08, 1.4)
        save('far_tidal_stream', additive(stream[..., None] * np.array([.75, .82, 1]) + core[..., None] * np.array([1, .88, .7])))
    if want('far_hypergiant'):      # a swollen red star shedding shells of dust
        star = np.exp(-(d / .2) ** 4) * (0.8 + 0.4 * fbm(n, 5, 12, .6, 550)) * 1.4
        wob = (fbm(n, 4, 4, .55, 555) - .5) * .09
        shells = sum(np.exp(-((d + wob - r) / (.025 + .01 * k)) ** 2) * np.clip((fbm(n, 4, 4, .55, 551 + k) - .35) * 2.5, 0, 1) * .5 for k, r in enumerate((.32, .45, .6, .74)))
        save('far_hypergiant', additive(star[..., None] * np.array([1, .45, .2]) + shells[..., None] * np.array([1, .55, .35])))
    if want('far_eclipsing_binary'):  # one star half hidden behind its companion
        s1 = np.exp(-(np.hypot(x + .08, y) / .2) ** 6) * 1.6; s2d = np.hypot(x - .12, y + .04)
        s2 = np.exp(-(s2d / .14) ** 6)
        rgb = s1[..., None] * np.array([1, .85, .6]) * (1 - s2[..., None] * .95) + s2[..., None] * np.array([.25, .2, .3]) * .6
        rgb += (np.exp(-((s2d - .145) / .01) ** 2) * .9)[..., None] * np.array([1, .7, .45]) + glowpt(np.hypot(x + .08, y), .5, .25)[..., None] * np.array([1, .8, .55])
        save('far_eclipsing_binary', additive(rgb))
    if want('far_light_echo'):      # nested rings of light expanding from an old flare
        wob = (fbm(n, 4, 4, .55, 565) - .5) * .08
        rings = sum(np.exp(-((d + wob * (k + 1) * .5 - r) / (.015 + .015 * k)) ** 2) * np.clip((fbm(n, 4, 5, .6, 560 + k) - .3) * 2.2, 0, 1) * (1 - k * .18) for k, r in enumerate((.18, .32, .5, .7)))
        save('far_light_echo', additive(rings[..., None] * np.array([.8, .7, 1.0]) + glowpt(d, .02, 2.5)[..., None]))

# ================================================================== frontier: gas clouds
FAM = {}
def neb_jets(s, ang):
    n = 640; x, y, d = radial(n); xr, yr = rot(x, y, ang)
    jet = np.exp(-(xr / (.01 + .06 * np.abs(yr))) ** 2) * np.exp(-np.abs(yr) / .7)
    knots = sum(np.exp(-((np.abs(yr) - k) / .03) ** 2) * np.exp(-(xr / (.03 + .05 * k)) ** 2) for k in (.25, .45, .7))
    disc = np.exp(-((xr / .14) ** 2 + (yr / .03) ** 2))
    rgb = jet[..., None] * np.array([.5, .7, 1.0]) * (0.5 + fbm(n, 4, 8, .6, s))[..., None] + knots[..., None] * np.array([1, .45, .3]) * 1.2 + disc[..., None] * np.array([1, .6, .3]) * .8
    return additive(rgb)
def neb_globules(s):
    """Cometary globules: dark heads with bright rims and dark tails, silhouetted against a glowing cloud, all pointing
    away from one star above the frame."""
    n = 640; x, y, d = radial(n); rng = np.random.default_rng(s)
    bg = np.clip(cloud(n, s, .4) - .2, 0, 1) * np.clip(1.1 - d, 0, 1) * 1.3
    dark = np.zeros((n, n)); rims = np.zeros((n, n))
    for _ in range(5):
        cx, cy, r = rng.uniform(-.5, .5), rng.uniform(-.2, .5), rng.uniform(.05, .09)
        head = np.hypot(x - cx, y - cy)
        tail = np.exp(-((x - cx) / (r * (1 + 1.5 * np.clip((y - cy) / .5, 0, 1)))) ** 2) * (y > cy) * np.exp(-(y - cy) / .6)
        dark = np.maximum(dark, np.maximum(np.exp(-(head / (r * .98)) ** 8), tail * .9))
        rims += np.exp(-((head - r) / .012) ** 2) * np.clip((cy - y) / r + .4, 0, 1)
    rgb = bg[..., None] * np.array([.9, .45, .5]) * (1 - dark[..., None] * .97) + rims[..., None] * np.array([1, .8, .5]) * 1.4
    return additive(rgb)
def neb_curtain(s, c1, c2):
    n = 640; x, y, d = radial(n)
    f = fbm(n, 4, 3, .5, s); fold = np.sin((x + (f - .5) * .6) * 18) * .5 + .5
    sheet = np.exp(-((y - (f - .5) * .5) / .25) ** 2) * fold ** 3 * np.clip(1 - np.abs(x), 0, 1)
    top = np.clip((y - (f - .5) * .5 + .25) / .5, 0, 1)
    rgb = sheet[..., None] * (np.array(c1) * (1 - top[..., None]) + np.array(c2) * top[..., None]) * 1.2
    return additive(rgb)
def neb_haze(s):
    n = 640; x, y, d = radial(n); c = cloud(n, s, .5)
    dens = np.clip((c - .3) / .6, 0, 1) ** 1.5 * np.exp(-(d / .55) ** 2)
    return additive(dens[..., None] * np.array([.45, .65, 1.0]) * 1.4 + glowpt(d, .03, 2.5)[..., None] * np.array([.85, .9, 1]))
def neb_silhouette(s):
    n = 640; x, y, d = radial(n); bright = np.clip(cloud(n, s, .35) - .2, 0, 1) * np.clip(1.1 - d, 0, 1) ** 1.1 * 1.4
    dark = np.clip((fbm(n, 5, 4, .6, s + 9) - .52) * 5, 0, 1) * np.exp(-((y + .05) / .3) ** 2)
    return additive(bright[..., None] * np.array([1, .55, .45]) * 1.5 * (1 - dark[..., None] * .95))

# ================================================================== the Deep: far objects
def far_deep():
    n = 720; x, y, d = radial(n); a = np.arctan2(y, x)
    if want('far_eye'):             # a vast faint eye in a red nebula; the pupil is a slit of nothing
        ex, ey = x / .9, y / .42; e = np.hypot(ex, ey)
        lids = np.exp(-((e - 1) / .05) ** 2) * .6
        fib = (1 - np.abs(fbm(n, 5, 20, .6, 602) - .5) * 2) ** 6
        iris = np.exp(-(d / .24) ** 2) * (0.35 + 0.5 * fbm(n, 5, 14, .6, 601) + 0.6 * fib) * np.clip((d - .02) / .04, 0, 1)
        pupil = np.exp(-((x / .035) ** 2 + (y / .26) ** 2))
        veins = (1 - np.abs(fbm(n, 6, 6, .6, 603) - .5) * 2) ** 16 * (e < 1) * (d > .3) * .7
        mist = np.clip(cloud(n, 604, .4) - .35, 0, 1) * np.clip(1.2 - e, 0, 1) * .6
        rgb = (iris[..., None] * np.array([1, .25, .1]) + lids[..., None] * np.array([.6, .15, .15]) + veins[..., None] * np.array([.9, .1, .1]) + mist[..., None] * np.array([.5, .08, .12])) * (1 - pupil[..., None])
        save('far_eye', additive(rgb))
    if want('far_maw'):             # a hole in the sky ringed with pale tooth-like filaments that curl inward
        teeth = np.zeros((n, n))
        rng = np.random.default_rng(615)
        for k in range(19):
            t = k / 19 * 6.283 + rng.uniform(-.12, .12); xr, yr = rot(x, y, t)
            L = rng.uniform(.18, .42); bend = rng.uniform(.6, 1.6) * (1 if k % 2 else -1)
            u = np.clip(xr - .22, 0, None)
            yy = yr - bend * u ** 2                                  # each filament hooks sideways, like a curved fang
            teeth += np.exp(-(yy / (.022 * np.clip(1 - u / L, 0.05, 1) + .003)) ** 2) * (xr > .22) * (u < L)
        glow = np.exp(-((d - .25) / .06) ** 2) * .7
        hole = d < .22
        rgb = teeth[..., None] * np.array([.9, .85, .75]) * .8 + glow[..., None] * np.array([.6, .1, .25])
        rgba = additive(rgb); rgba[hole] = [0, 0, 0, 1.0]
        save('far_maw', rgba)
    if want('far_black_sun'):       # a dark disc with a writhing red corona
        cor = np.exp(-((d - .3) / (.04 + .12 * fbm(n, 5, 6, .6, 610))) ** 2) * (0.5 + 0.6 * (0.5 + 0.5 * np.cos(a * 11 + fbm(n, 4, 5, .5, 611) * 8)))
        flares = (1 - np.abs(fbm(n, 6, 5, .6, 612) - .5) * 2) ** 20 * (d > .29) * np.exp(-(d - .3) / .2) * 1.4
        rgb = cor[..., None] * np.array([1, .2, .1]) + flares[..., None] * np.array([1, .5, .2])
        rgba = additive(rgb); disc = d < .28; rgba[disc] = [0.02, 0, 0, 1.0]
        save('far_black_sun', rgba)
    if want('far_heart'):           # a red nebula threaded with dark veins, like something alive
        c = np.clip(cloud(n, 620, .4) - .25, 0, 1) * np.exp(-(d / .6) ** 2) * 1.6
        veins = (1 - np.abs(fbm(n, 6, 4, .65, 621) - .5) * 2) ** 12
        bright = (1 - np.abs(fbm(n, 6, 7, .65, 622) - .5) * 2) ** 22 * c * 2
        rgb = c[..., None] * np.array([.85, .12, .15]) * (1 - veins[..., None] * .8) + bright[..., None] * np.array([1, .5, .4])
        save('far_heart', additive(rgb))
    if want('far_tendril_star'):    # a star gripped by dark tendrils that block its light in long fingers
        star = glowpt(d, .06, 2.5) + np.exp(-(d / .35) ** 2) * .5
        fingers = np.zeros((n, n))
        for k in range(7):
            t0 = k / 7 * 6.283 + .3; xr, yr = rot(x, y, t0)
            wob = .06 * np.sin(xr * 9 + k)
            fingers += np.exp(-((yr - wob) / (.012 + .05 * np.clip(xr, 0, 1))) ** 2) * (xr > .04)
        rgb = star[..., None] * np.array([.95, .85, 1.0]) * (1 - np.clip(fingers, 0, 1)[..., None] * .95)
        save('far_tendril_star', additive(rgb))

# ================================================================== the Deep: gas clouds
def neb_flesh(s, c1, c2):
    n = 640; x, y, d = radial(n); c = cloud(n, s, .45)
    dens = np.clip((c - .3) / .55, 0, 1) ** 1.5 * np.clip(1 - d, 0, 1) ** 1.3
    veins = (1 - np.abs(fbm(n, 6, 5, .65, s + 1) - .5) * 2) ** 14
    mk = fbm(n, 4, 2, .5, s + 2)[..., None]
    rgb = (np.array(c1) * (1 - mk) + np.array(c2) * mk) * dens[..., None] * 1.3 * (1 - veins[..., None] * .6) + (veins * dens)[..., None] * np.array([1, .3, .3]) * .7
    return additive(rgb)
def neb_spores(s):
    n = 640; x, y, d = radial(n); c = cloud(n, s, .5); rng = np.random.default_rng(s)
    dens = np.clip((c - .35) / .5, 0, 1) ** 2 * np.clip(1 - d, 0, 1)
    motes = gaussian_filter((rng.random((n, n)) > .9985) * 1.0, 1.0) * 14 * (dens > .05)
    return additive(dens[..., None] * np.array([.45, .75, .25]) + motes[..., None] * np.array([.8, 1, .4]))
def neb_tendrils(s):
    """Tendril nebula: long curling ridges of violet gas, warped so they coil and fork like something reaching."""
    n = 640; x, y, d = radial(n)
    w1, w2 = fbm(n, 4, 2, .5, s), fbm(n, 4, 2, .5, s + 1)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    base = fbm(n, 6, 3, .6, s + 2)
    warped = map_coordinates(base, [(yy + (w1 - .5) * n * .6) % n, (xx + (w2 - .5) * n * .6) % n], order=1, mode='wrap')
    ridge = (1 - np.abs(warped - .5) * 2) ** 18
    env = np.clip(1 - d, 0, 1) ** 1.1 * np.clip((fbm(n, 3, 2, .5, s + 3) - .15) * 2.2, 0, 1)
    glow = np.clip(cloud(n, s + 4, .4) - .45, 0, 1) * np.clip(1 - d, 0, 1) * .5
    return additive(ridge[..., None] * env[..., None] * np.array([.7, .25, .9]) * 1.6 + glow[..., None] * np.array([.35, .08, .3]))
def neb_ichor(s):
    n = 640; x, y, d = radial(n); c = cloud(n, s, .35)
    dens = np.clip((c - .45) / .4, 0, 1) ** 2 * np.clip(1 - d, 0, 1) ** 1.5
    fil = (1 - np.abs(fbm(n, 6, 6, .6, s + 3) - .5) * 2) ** 10 * dens
    return additive(dens[..., None] * np.array([.4, .9, .2]) * 1.3 + fil[..., None] * np.array([.8, 1, .4]))
def neb_bruise(s):
    n = 640; x, y, d = radial(n); c = cloud(n, s, .4)
    dens = np.clip((c - .3) / .6, 0, 1) ** 1.4 * np.clip(1 - d, 0, 1) ** 1.2
    mk = fbm(n, 4, 3, .5, s + 1)[..., None]
    return additive((np.array([.35, .1, .45]) * (1 - mk) + np.array([.55, .15, .2]) * mk) * dens[..., None] * 1.4)

NEB5 = [(56, 'special', lambda: neb_jets(5601, .3)), (57, 'special', lambda: neb_jets(5701, 1.3)),
        (58, 'special', lambda: neb_globules(5801)), (59, 'special', lambda: neb_globules(5901)),
        (60, 'teal', lambda: neb_curtain(6001, (.2, 1, .6), (.6, .3, 1))), (61, 'green', lambda: neb_curtain(6101, (.4, 1, .3), (1, .3, .4))),
        (62, 'blue', lambda: neb_haze(6201)), (63, 'blue', lambda: neb_haze(6301)),
        (64, 'mixed', lambda: neb_silhouette(6401)), (65, 'mixed', lambda: neb_silhouette(6501)),
        (66, 'deep', lambda: neb_flesh(6601, (.8, .12, .18), (.45, .1, .3))), (67, 'deep', lambda: neb_flesh(6701, (.6, .15, .3), (.9, .3, .25))),
        (68, 'deep', lambda: neb_spores(6801)), (69, 'deep', lambda: neb_spores(6901)),
        (70, 'deep', lambda: neb_tendrils(7001)), (71, 'deep', lambda: neb_tendrils(7101)),
        (72, 'deep', lambda: neb_ichor(7201)), (73, 'deep', lambda: neb_bruise(7301))]

if __name__ == '__main__':
    far_frontier(); far_deep()
    fp = os.path.join(OUT, 'nebula_families.json'); fam = json.load(open(fp)) if os.path.exists(fp) else {}
    for k, f, fn in NEB5:
        fam[str(k)] = f
        if want(f'nebula_{k}'): save(f'nebula_{k}', fn(), 84)
    json.dump(fam, open(fp, 'w'), indent=0)
