"""Quantum Rift 2.5: pre-rendered planets in the style of EV Nova's rendered worlds.
Each planet is ray-cast on a sphere with 3D noise: continents, biomes and mountains, craters, gas bands and storms, with
bump-mapped key lighting from the upper left, ocean specular, cloud layers with shadows, night-side city lights or lava
glow, an atmosphere rim and halo, and rings with the planet's shadow across them. Output: client/assets/planets/<id>.webp
and planets.json (type, hue, radius fraction).
usage: python3 tools/rift_planets.py client/assets/planets [only_id]      (needs numpy and Pillow)"""
import sys, os, json, math, colorsys, zlib
import numpy as np
from PIL import Image, ImageFilter
sys.path.insert(0, os.path.dirname(__file__))
from rift_noise import Perlin3, fbm, ridged, warped, smooth, lerp, ramp

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/planets'; ONLY = sys.argv[2] if len(sys.argv) > 2 else None
S = 512; SS = 2
LIGHT = np.array([-0.58, -0.45, 0.68]); LIGHT /= np.linalg.norm(LIGHT)

def rot_matrix(r):
    a, b, c = r.uniform(0, 2 * math.pi, 3)
    Rz = np.array([[math.cos(a), -math.sin(a), 0], [math.sin(a), math.cos(a), 0], [0, 0, 1]])
    Rx = np.array([[1, 0, 0], [0, math.cos(b), -math.sin(b)], [0, math.sin(b), math.cos(b)]])
    Ry = np.array([[math.cos(c), 0, math.sin(c)], [0, 1, 0], [-math.sin(c), 0, math.cos(c)]])
    return Rz @ Rx @ Ry

def craters(r, n, big=0.25):
    out = []
    for _ in range(n):
        v = r.normal(size=3); v /= np.linalg.norm(v); out.append((v, 0.02 + (r.random() ** 2.6) * big))
    return out
def crater_field(Q, cs):
    h = np.zeros(Q.shape[0]); dark = np.zeros(Q.shape[0])
    for v, rad in cs:
        d = np.arccos(np.clip(Q @ v, -1, 1)) / rad; m = d < 1.4
        if not m.any(): continue
        dd = d[m]; bowl = -0.9 * (1 - smooth(0.0, 0.85, dd)) ** 1.2; rim = 0.45 * np.exp(-((dd - 0.92) / 0.14) ** 2); ejecta = 0.06 * np.exp(-(dd - 1.0) * 3) * (dd > 1)
        h[m] += (bowl + rim + ejecta) * rad * 2.2; dark[m] += (1 - smooth(0.0, 0.8, dd)) * 0.18
    return h, dark

def fields(spec, Q, r, P, P2):
    """the surface at planet-space points Q (n,3): albedo 0-255, height, water, emissive rgb, cloud alpha, bump scale"""
    typ = spec['type']; qx, qy, qz = Q[:, 0], Q[:, 1], Q[:, 2]
    n = Q.shape[0]; alb = np.zeros((n, 3)); h = np.zeros(n); water = np.zeros(n); emis = np.zeros((n, 3)); cloud = np.zeros(n); bump = spec.get('bump', 1.0)
    pal = spec['pal']; inhabited = spec.get('lights', 0)
    if typ in ('terran', 'earth', 'ocean', 'jungle', 'city'):
        f = spec.get('freq', 1.3); base = warped(P, qx * f, qy * f, qz * f, k=spec.get('warp', 0.55), oct=7)
        mount = ridged(P2, qx * 3.2, qy * 3.2, qz * 3.2, 5)
        sea = spec['sea']; land = base + 0.12 * (mount - 0.5) * smooth(sea - 0.05, sea + 0.15, base)
        water = (land < sea).astype(float)
        tlat = np.abs(qz)  # 0 equator .. 1 pole (planet-space z is the axis)
        moist = fbm(P2, qx * 2.2 + 5, qy * 2.2, qz * 2.2, 5) * 1.6 + 0.5 + spec.get('wet', 0.0)
        temp = 1 - tlat * 1.05 - np.clip(land - sea, 0, 1) * 0.55 + fbm(P, qx * 3, qy * 3, qz * 3 + 9, 3) * 0.3 + spec.get('warm', 0.0)
        depth = np.clip((sea - land) / 0.35, 0, 1)
        ocean = lerp(pal['shallow'], pal['deep'], smooth(0, 0.6, depth) ** 0.7)
        e = np.clip((land - sea) / 0.75, 0, 1)
        grass = lerp(pal['dry'], pal['green'], smooth(0.35, 0.65, moist)); grass = lerp(grass, pal['forest'], smooth(0.6, 0.9, moist) * 0.8)
        landc = lerp(pal['beach'], grass, smooth(0.0, 0.05, e))
        landc = lerp(landc, pal['rock'], smooth(0.35, 0.7, e + (mount - 0.6) * 0.5))
        landc = lerp(landc, pal['snow'], smooth(0.72, 0.9, e + (mount - 0.6) * 0.4))
        cold = smooth(0.18, 0.02, temp); landc = lerp(landc, pal['snow'], cold); ocean = lerp(ocean, pal['ice'], smooth(0.1, -0.05, temp) * 0.95)
        alb = np.where(water[:, None] > 0, ocean, landc)
        h = np.where(water > 0, 0, (land - sea) * 0.45 + (mount - 0.5) * 0.15 * e)
        water = water * (1 - smooth(0.1, -0.05, temp))
        if typ == 'city':   # an ecumenopolis: grey sprawl in a fine grid
            grid = np.maximum(np.abs(np.sin(qx * 140)), np.abs(np.sin(qy * 140))) ; blocks = smooth(0.85, 0.98, grid)
            urb = smooth(-0.1, 0.15, base - sea + 0.1) * (1 - water)
            alb = lerp(alb, lerp(pal['city'], np.array(pal['city'], float) * 0.6, blocks), urb * 0.85)
        if inhabited:
            u = fbm(P2, qx * 9, qy * 9, qz * 9, 4); dens = smooth(0.05, 0.3, u) * (1 - water) * smooth(0.0, 0.05, e) * (1 - smooth(0.4, 0.7, e))
            if typ == 'city': dens = np.maximum(dens, 0.55 * (1 - water) * (0.5 + 0.5 * smooth(0.8, 0.98, np.maximum(np.abs(np.sin(qx * 140)), np.abs(np.sin(qy * 140))))))
            spark = smooth(0.15, 0.55, fbm(P, qx * 60, qy * 60, qz * 60, 2) + 0.3)
            emis = np.array([255, 196, 120])[None, :] * (dens * spark * inhabited)[:, None]
        cd = spec.get('clouds', 0.5)
        if cd:
            w = fbm(P2, qx * 1.6, qy * 1.6, qz * 1.6, 3)
            cn = fbm(P, qx * 2.6 + w * 3, qy * 2.6 + w * 3, qz * 3.6 + w * 2, 7)
            cloud = smooth(0.6 - cd * 0.2, 0.8 - cd * 0.15, cn + 0.5) * 0.92
    elif typ == 'desert':
        f = spec.get('freq', 1.4); base = warped(P, qx * f, qy * f, qz * f, k=0.35, oct=5); can = ridged(P2, qx * 4, qy * 4, qz * 4, 5)
        dunes = 0.5 + 0.5 * np.sin(qx * 40 + qy * 25 + fbm(P2, qx * 3, qy * 3, qz * 3, 3) * 14)
        t = np.clip(base * 1.4 + 0.5 + (dunes - 0.5) * 0.12, 0, 1)
        alb = ramp(t, pal['ramp']); canyon = smooth(0.86, 0.97, can); alb = alb * (1 - canyon[:, None] * 0.3)
        cs = craters(r, spec.get('craters', 10), 0.15); ch, cdark = crater_field(Q, cs); alb *= (1 - cdark[:, None])
        h = base * 0.35 - canyon * 0.1 + ch + (dunes - 0.5) * 0.015
        cap = smooth(0.86, 0.93, np.abs(qz) + base * 0.15); alb = lerp(alb, pal.get('cap', (235, 225, 215)), cap)
        if inhabited:
            u = fbm(P2, qx * 9, qy * 9, qz * 9, 4); emis = np.array([255, 190, 110])[None, :] * (smooth(0.2, 0.4, u) * smooth(0.1, 0.6, fbm(P, qx * 50, qy * 50, qz * 50, 2) + 0.3) * inhabited)[:, None]
        cloud = smooth(0.75, 0.95, fbm(P, qx * 3, qy * 3, qz * 6, 5) + 0.5) * spec.get('clouds', 0.2)
    elif typ == 'ice':
        base = warped(P, qx * 1.5, qy * 1.5, qz * 1.5, k=0.4, oct=6); cr1 = ridged(P2, qx * 3, qy * 3, qz * 3, 3); cr2 = ridged(P, qx * 9, qy * 9, qz * 9, 2)
        crack = np.maximum(smooth(0.93, 0.985, cr1), 0.6 * smooth(0.95, 0.995, cr2))
        alb = ramp(np.clip(base * 1.3 + 0.5, 0, 1), pal['ramp']); alb = lerp(alb, pal['crack'], crack * 0.55)
        cs = craters(r, spec.get('craters', 8), 0.12); ch, cdark = crater_field(Q, cs); alb *= (1 - cdark[:, None] * 0.5)
        h = base * 0.18 - crack * 0.05 + ch * 0.6; water = smooth(0.2, 0.5, base + 0.3) * 0.35   # glazed ice glints
        cloud = smooth(0.7, 0.95, fbm(P2, qx * 3, qy * 3, qz * 5, 5) + 0.5) * spec.get('clouds', 0.0)
    elif typ == 'lava':
        base = fbm(P, qx * 1.8, qy * 1.8, qz * 1.8, 6); cr = ridged(P2, qx * 2.4, qy * 2.4, qz * 2.4, 6); hot = smooth(0.8, 0.94, cr)
        pool = smooth(0.25, 0.35, fbm(P2, qx * 1.2 + 3, qy * 1.2, qz * 1.2, 4))
        hot = np.maximum(hot, pool)
        alb = ramp(np.clip(base * 1.2 + 0.5, 0, 1), pal['ramp']); alb = lerp(alb, (40, 18, 10), hot * 0.6)
        emis = ramp(hot, [(0, (0, 0, 0)), (0.3, (150, 30, 5)), (0.7, (255, 110, 20)), (1, (255, 220, 120))]) * 1.0
        h = base * 0.6 - hot * 0.2 + cr * 0.15
        cloud = smooth(0.7, 0.95, fbm(P, qx * 2.5, qy * 2.5, qz * 4, 5) + 0.5) * 0.35
    elif typ == 'barren':
        base = fbm(P, qx * 1.6, qy * 1.6, qz * 1.6, 7); maria = smooth(0.05, 0.2, fbm(P2, qx * 1.1, qy * 1.1, qz * 1.1, 4))
        alb = ramp(np.clip(base * 1.4 + 0.5, 0, 1), pal['ramp']); alb = alb * (1 - maria[:, None] * spec.get('maria', 0.3))
        cs = craters(r, spec.get('craters', 70), 0.3); ch, cdark = crater_field(Q, cs); alb *= (1 - cdark[:, None])
        rays = np.zeros(n)
        for v, rad in cs[:4]:
            d = np.arccos(np.clip(Q @ v, -1, 1)); rays += (smooth(0.92, 1.0, np.abs(np.sin(np.arctan2(Q @ np.cross(v, [0, 0, 1.0]), Q @ np.cross(v, np.cross(v, [0, 0, 1.0]))) * 9))) * np.exp(-d / (rad * 4)) * (d > rad)) * 0.3
        alb = alb * (1 + rays[:, None]); h = base * 0.4 + ch
    elif typ == 'toxic':
        base = warped(P, qx * 1.3, qy * 1.3, qz * 1.3, k=0.6, oct=6); alb = ramp(np.clip(base * 1.3 + 0.5, 0, 1), pal['ramp'])
        sea = spec.get('sea', 0.0); water = (base < sea).astype(float) * 0.6; alb = np.where((base < sea)[:, None], np.array(pal['sea'], float), alb); h = np.maximum(base - sea, 0) * 0.5
        w = fbm(P2, qx * 1.4, qy * 1.4, qz * 1.4, 3); cloud = smooth(0.35, 0.7, fbm(P, qx * 2.2 + w * 3, qy * 2.2 + w * 3, qz * 5, 6) + 0.5) * spec.get('clouds', 0.85)
    elif typ == 'crystal':
        # Voronoi facets: nearest of scattered seeds on the sphere
        seeds = r.normal(size=(140, 3)); seeds /= np.linalg.norm(seeds, axis=1, keepdims=True)
        dots = Q @ seeds.T; i1 = np.argmax(dots, 1); d1 = dots[np.arange(n), i1]; dots[np.arange(n), i1] = -9; d2 = dots.max(1)
        edge = smooth(0.0, 0.012, d1 - d2); facet = (np.sin(i1 * 12.9898) * 43758.5453) % 1
        alb = lerp(pal['a'], pal['b'], facet) * (0.65 + 0.35 * edge[:, None]); alb = lerp(alb, pal['edge'], (1 - edge) * 0.8)
        h = facet * 0.15 + edge * 0.06; water = 0.5 + facet * 0.5
        glow = smooth(0.94, 0.99, facet) * edge; emis = np.array(pal['glow'], float)[None, :] * glow[:, None] * 0.9
    elif typ == 'sulfur':   # an Io-like volcanic moon
        base = fbm(P, qx * 1.5, qy * 1.5, qz * 1.5, 6); alb = ramp(np.clip(base * 1.5 + 0.5, 0, 1), pal['ramp'])
        spots = smooth(0.3, 0.42, fbm(P2, qx * 3.5, qy * 3.5, qz * 3.5, 4) + 0.1); alb = lerp(alb, (40, 25, 15), spots * 0.8)
        rings_ = smooth(0.38, 0.45, fbm(P2, qx * 3.5, qy * 3.5, qz * 3.5, 4) + 0.1) - spots; alb = lerp(alb, (240, 120, 40), np.clip(rings_, 0, 1) * 0.6)
        emis = np.array([255, 120, 30])[None, :] * (smooth(0.46, 0.5, fbm(P2, qx * 3.5, qy * 3.5, qz * 3.5, 4) + 0.1))[:, None] * 0.7
        h = base * 0.4 - spots * 0.1
    elif typ == 'gas':
        lt = qz; warp = fbm(P, qx * 1.6, qy * 1.6, qz * 1.6, 5); turb = fbm(P2, qx * 5, qy * 5, qz * 9, 5)
        v = lt * spec.get('bands', 9) + warp * 1.8 + turb * 0.6
        t = 0.5 + 0.5 * np.sin(v * math.pi) ; t2 = 0.5 + 0.5 * np.sin(v * 2.37 + 1.3)
        alb = ramp(np.clip(t * 0.75 + t2 * 0.25 + turb * 0.3, 0, 1), pal['ramp'])
        fine = fbm(P, qx * 3, qy * 3, qz * 40, 4); alb *= (0.9 + fine[:, None] * 0.25)
        for _ in range(spec.get('storms', 2)):   # oval storms with a swirl
            c_lat = r.uniform(-0.6, 0.6); c_lon = r.uniform(0, 2 * math.pi); sz = r.uniform(0.08, 0.2)
            lon = np.arctan2(qy, qx); dl = np.angle(np.exp(1j * (lon - c_lon))); dd = np.hypot(dl / (sz * 1.9), (np.arcsin(np.clip(qz, -1, 1)) - c_lat) / sz)
            sw = 0.5 + 0.5 * np.sin(dd * 10 - np.arctan2(np.arcsin(np.clip(qz, -1, 1)) - c_lat, dl) * 2)
            col = np.array(pal.get('storm', (230, 150, 100)), float); alb = lerp(alb, lerp(col, col * 0.7, sw), smooth(1, 0.55, dd))
        h = np.zeros(n); bump = 0
    return alb, h, water, emis, cloud, bump

def render(spec, layers=False):
    r = np.random.default_rng(spec['seed']); P = Perlin3(spec['seed']); P2 = Perlin3(spec['seed'] + 999)
    typ = spec['type']; ringed = bool(spec.get('rings'))
    N = S * SS; ext = 1 / (0.42 if ringed else 0.82)   # frame half-width in planet radii
    lin = (np.arange(N) + 0.5) / N * 2 - 1
    X, Y = np.meshgrid(lin * ext, lin * ext); R2 = X * X + Y * Y; inside = R2 < 1
    Z = np.sqrt(np.clip(1 - R2, 0, 1))
    xs, ys, zs = X[inside], Y[inside], Z[inside]
    Q = np.stack([xs, -ys, zs], 1) @ rot_matrix(r).T   # surface point in planet space
    qx, qy, qz = Q[:, 0], Q[:, 1], Q[:, 2]
    alb, h, water, emis, cloud, bump = fields(spec, Q, r, P, P2)
    alb = np.clip(alb, 0, 255) / 255.0
    # ---------------------------------------------------------------- shading (screen space)
    def full(a, fill=0.0):
        o = np.full((N, N) + a.shape[1:], fill, float); o[inside] = a; return o
    H = full(h); gy, gx = np.gradient(H); k = bump * spec.get('bumpk', {'desert': 0.45, 'ice': 0.35, 'toxic': 0.4, 'city': 0.5, 'terran': 0.7, 'earth': 0.7, 'ocean': 0.7, 'jungle': 0.7}.get(typ, 1.0)) * N * 0.45
    Nx = np.where(inside, X, 0); Ny = np.where(inside, Y, 0); Nz = Z.copy()
    bx, by, bz = Nx - gx * k, Ny - gy * k, Nz; ln_ = np.sqrt(bx * bx + by * by + bz * bz) + 1e-9; bx, by, bz = bx / ln_, by / ln_, bz / ln_
    lam_s = (Nx * LIGHT[0] + Ny * LIGHT[1] + Nz * LIGHT[2])            # smooth sphere
    lam_b = (bx * LIGHT[0] + by * LIGHT[1] + bz * LIGHT[2])            # with bumps
    term = smooth(-0.12, 0.35, lam_s)                                   # soft terminator
    diff = np.clip(lam_b, 0, 1) ** 0.9 * 0.92 * term + 0.035 + 0.03 * term
    if typ == 'gas': diff = (np.clip(lam_s, 0, 1) ** 0.8 * 0.95 + 0.03) * (0.55 + 0.45 * Z ** 0.4)   # limb darkening
    A = full(alb); col = A * diff[..., None]
    # cloud shadows, then clouds
    C = full(cloud)
    if cloud.any():
        sh = int(N * 0.008 + 2); Cs = np.roll(np.roll(C, sh, 0), sh, 1)
        col *= (1 - Cs[..., None] * 0.45 * term[..., None])
        cl_l = (np.clip(lam_s, 0, 1) ** 0.8 * 0.95 + 0.04)[..., None] * np.array(spec.get('cloudcol', (248, 249, 252))) / 255
        col = col * (1 - C[..., None]) + cl_l * C[..., None]
    # specular on water and ice
    Wt = full(water) * (1 - C)
    if water.any():
        Hh = LIGHT + np.array([0, 0, 1.0]); Hh /= np.linalg.norm(Hh)
        spec_ = np.clip(Nx * Hh[0] + Ny * Hh[1] + Nz * Hh[2], 0, 1)
        col += (spec_ ** 70 * 0.75 + spec_ ** 12 * 0.08)[..., None] * Wt[..., None] * np.array([1.0, 0.97, 0.9])
    # emissive (night lights, lava)
    E = full(emis) / 255
    if emis.any():
        night = smooth(0.15, -0.2, lam_s) if typ in ('terran', 'earth', 'ocean', 'jungle', 'city', 'desert') else (0.35 + 0.65 * smooth(0.3, -0.2, lam_s))
        col += E * night[..., None] * (1 - C[..., None] * 0.7)
    # atmosphere rim inside the disc
    atm = spec.get('atm'); R1 = np.sqrt(R2)
    if atm is not None:
        a = np.array(atm, float) / 255; rim = (1 - Z) ** 2.6 * spec.get('atmk', 1.0)
        lit = smooth(-0.35, 0.5, lam_s)
        col = col + a * (rim * (0.25 + 0.95 * lit))[..., None]
    # rings
    out_rgb = np.where(inside[..., None], col, 0.0); out_a = inside.astype(float)
    bk_rgb = np.zeros((N, N, 3)); bk_a = np.zeros((N, N)); fr_rgb = np.zeros((N, N, 3)); fr_a = np.zeros((N, N))
    if ringed:
        rg = spec['rings']; ca, sa = math.cos(rg['rot']), math.sin(rg['rot'])
        Xr = X * ca + Y * sa; Yr = -X * sa + Y * ca; rr = np.sqrt(Xr ** 2 + (Yr / rg['tilt']) ** 2)
        inr, outr = rg['inner'], rg['outer']; band = (rr > inr) & (rr < outr)
        u = (rr - inr) / (outr - inr)
        dens = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(u * 47 + np.sin(u * 13) * 2)) * (0.6 + 0.4 * np.sin(u * 211)); dens *= smooth(0, 0.06, u) * smooth(1, 0.9, u)
        gap = smooth(0.02, 0.0, np.abs(u - rg.get('gap', 0.62)) - 0.02); dens *= (1 - gap * 0.9)
        rcol = ramp(u, rg['ramp']) / 255
        # ring lighting: lit side brighter; the planet's shadow falls on the far side
        Lx, Ly = LIGHT[0], LIGHT[1]; ll = math.hypot(Lx, Ly); Lx, Ly = Lx / ll, Ly / ll
        along = X * Lx + Y * Ly; perp = np.abs(-X * Ly + Y * Lx); shadow = (along < 0) & (perp < 1.0)
        rl = (0.55 + 0.5 * (1 - shadow * 0.85))[..., None]
        ring_c = rcol * rl * 0.95; ring_a = np.clip(dens, 0, 1) * band * rg.get('alpha', 0.85)
        front = Yr > 0   # nearer half (below the planet's centre in screen space)
        cover_front = ring_a * front; cover_back = ring_a * (~front) * (1 - inside)
        # ring shadow on the planet: a band offset toward the light
        if True:
            Xs, Ys = X - LIGHT[0] * 0.35, Y - LIGHT[1] * 0.35; Xsr = Xs * ca + Ys * sa; Ysr = -Xs * sa + Ys * ca; rs = np.sqrt(Xsr ** 2 + (Ysr / rg['tilt']) ** 2)
            ush = (rs - inr) / (outr - inr); shp = ((rs > inr) & (rs < outr) & (Ysr < 0)) * inside * 0.45
            out_rgb = out_rgb * (1 - shp[..., None]); fr_a = np.maximum(fr_a, shp)
        bk_rgb = ring_c * cover_back[..., None]; bk_a = cover_back.copy()
        fr_rgb = ring_c * cover_front[..., None]; fr_a = np.maximum(fr_a, cover_front)
        out_rgb = out_rgb * (1 - cover_back[..., None]) + ring_c * cover_back[..., None]
        out_a = np.maximum(out_a, cover_back)
        out_rgb = out_rgb * (1 - cover_front[..., None]) + ring_c * cover_front[..., None]
        out_a = np.maximum(out_a, cover_front)
    # halo outside the limb
    if atm is not None:
        th = spec.get('halo', 0.06); d = (R1 - 1) / th; outside = (R1 >= 1)
        dirl = smooth(-0.6, 0.9, (X * LIGHT[0] + Y * LIGHT[1]) / np.maximum(R1, 1e-6))
        g = np.exp(-np.clip(d, 0, 20) * 3.2) * outside * (0.25 + 0.75 * dirl) * spec.get('halok', 0.9)
        a = np.array(atm, float) / 255
        out_rgb = out_rgb + a * g[..., None]
        out_a = np.maximum(out_a, np.clip(g * 1.1, 0, 1))
        bk_rgb = bk_rgb + a * g[..., None]; bk_a = np.maximum(bk_a, np.clip(g * 1.1, 0, 1))
        # premultiplied -> straight colour where only halo
        only = outside & (out_a > 0) & (out_a < 1)
        out_rgb = np.where(only[..., None], out_rgb / np.maximum(out_a, 1e-4)[..., None], out_rgb)
    rgb = np.clip(out_rgb, 0, 1); A_ = np.clip(out_a, 0, 1)
    # downsample
    rgb = (rgb * A_[..., None]).reshape(S, SS, S, SS, 3).mean((1, 3)); A_ = A_.reshape(S, SS, S, SS).mean((1, 3))
    rgb = np.where(A_[..., None] > 1e-4, rgb / np.maximum(A_, 1e-4)[..., None], 0)
    img = np.dstack([rgb * 255, A_ * 255]).round().clip(0, 255).astype(np.uint8)
    if not layers: return Image.fromarray(img, 'RGBA'), (1 / ext)
    def lay(c, a):   # c is premultiplied by a
        a = np.clip(a, 0, 1); c = c.reshape(S, SS, S, SS, 3).mean((1, 3)); a = a.reshape(S, SS, S, SS).mean((1, 3))
        c = np.where(a[..., None] > 1e-4, c / np.maximum(a, 1e-4)[..., None], 0)
        return Image.fromarray(np.dstack([np.clip(c, 0, 1) * 255, a * 255]).round().astype(np.uint8), 'RGBA')
    return Image.fromarray(img, 'RGBA'), (1 / ext), lay(bk_rgb, bk_a), (lay(fr_rgb, fr_a) if ringed else None)

# ---------------------------------------------------------------- 2.5.1: surface maps for the turning planets in the game
TW, TH = 768, 384
BUMPK = {'desert': 0.45, 'ice': 0.35, 'toxic': 0.4, 'city': 0.5, 'terran': 0.7, 'earth': 0.7, 'ocean': 0.7, 'jungle': 0.7}
def texture(spec):
    """equirectangular maps: tex = albedo; aux = R height, G water/specular, B emissive, A cloud. Same noise as render()."""
    r = np.random.default_rng(spec['seed']); P = Perlin3(spec['seed']); P2 = Perlin3(spec['seed'] + 999)
    rot_matrix(r)   # keep the random stream in step with render()
    lon = (np.arange(TW) + 0.5) / TW * 2 * math.pi; lat = (0.5 - (np.arange(TH) + 0.5) / TH) * math.pi
    LO, LA = np.meshgrid(lon, lat); Q = np.stack([np.cos(LA) * np.cos(LO), np.cos(LA) * np.sin(LO), np.sin(LA)], -1).reshape(-1, 3)
    alb, h, water, emis, cloud, bump = fields(spec, Q, r, P, P2)
    alb = np.clip(alb, 0, 255).reshape(TH, TW, 3); h = np.asarray(h, float).reshape(TH, TW) * np.ones((TH, TW))
    hmin, hmax = float(h.min()), float(h.max()); hr = max(hmax - hmin, 1e-6); hn = (h - hmin) / hr
    E = np.asarray(emis, float).reshape(TH, TW, 3) * np.ones((TH, TW, 3)); ei = E.max(-1); wsum = ei.sum()
    ecol = (E.reshape(-1, 3).sum(0) / max(wsum, 1e-6) * 255 / max(1, (E.reshape(-1, 3).sum(0) / max(wsum, 1e-6)).max() / 255 * 255)).tolist() if wsum > 0 else [255, 200, 120]
    if wsum > 0: m = E.reshape(-1, 3)[ei.reshape(-1) > ei.max() * 0.5].mean(0); ecol = (m / max(m.max(), 1) * 255).tolist()
    aux = np.dstack([hn * 255, np.clip(np.asarray(water, float).reshape(TH, TW) * np.ones((TH, TW)), 0, 1) * 255, np.clip(ei / 255, 0, 1) * 255, np.clip(np.asarray(cloud, float).reshape(TH, TW) * np.ones((TH, TW)), 0, 1) * 255])
    k = bump * spec.get('bumpk', BUMPK.get(spec['type'], 1.0)) * 1.1 * hr
    return Image.fromarray(alb.round().astype(np.uint8), 'RGB'), Image.fromarray(aux.round().clip(0, 255).astype(np.uint8), 'RGBA'), dict(bk=round(k, 4), ecol=[int(c) for c in ecol])

# ---------------------------------------------------------------- the catalogue
def H(h, s, v): r, g, b = colorsys.hsv_to_rgb(h / 360, s, v); return (r * 255, g * 255, b * 255)
SPECS = []
def add(id_, typ, hue, pal, **kw): SPECS.append(dict(id=id_, type=typ, hue=hue, pal=pal, seed=zlib.crc32(id_.encode()) % 100000 + len(SPECS) * 7919, **kw))
def terran_pal(sea_h=215, green_h=105, dry=(176, 156, 108), rock=(120, 104, 86)):
    return dict(deep=H(sea_h, 0.85, 0.32), shallow=H(sea_h - 18, 0.62, 0.62), beach=(205, 190, 140), green=H(green_h, 0.55, 0.45), forest=H(green_h + 15, 0.65, 0.28),
                dry=dry, rock=rock, snow=(240, 242, 246), ice=(225, 235, 245), city=(150, 150, 155))
add('earth', 'earth', 210, terran_pal(), sea=-0.04, clouds=0.45, warm=0.15, wet=0.18, lights=1.0, atm=(100, 160, 255), freq=1.25)
for i, (sh, gh, dry) in enumerate([(212, 100, (180, 160, 110)), (200, 120, (170, 150, 100)), (225, 85, (190, 165, 120)), (190, 140, (160, 140, 95)), (230, 70, (200, 170, 110))]):
    add(f'terran{i}', 'terran', gh, terran_pal(sh, gh, dry), sea=-0.08 + 0.04 * (i % 3), clouds=0.45 + 0.05 * i, lights=0.9 if i % 2 == 0 else 0.0, atm=(110, 170, 255), freq=1.1 + 0.15 * i, warm=0.12, wet=0.12)
for i, sh in enumerate([200, 185, 215, 170, 230]):
    add(f'ocean{i}', 'ocean', sh, terran_pal(sh, 110 + i * 10), sea=0.16 + 0.03 * i, clouds=0.5, lights=0.7 if i in (0, 3) else 0, atm=H(sh, 0.45, 1.0), freq=1.6 + 0.2 * i, warp=0.7)
for i, gh in enumerate([95, 125, 75]):
    add(f'jungle{i}', 'jungle', gh, dict(terran_pal(195, gh), dry=H(gh, 0.5, 0.5), green=H(gh, 0.7, 0.42), forest=H(gh + 10, 0.8, 0.22)), sea=-0.12, clouds=0.65, lights=0.0, atm=(150, 210, 255), freq=1.4, warm=0.45)
for i, (ch, lt) in enumerate([((150, 150, 158), 1.0), ((170, 150, 120), 1.0)]):
    add(f'city{i}', 'city', 40 * i, dict(terran_pal(215), city=ch, green=(110, 120, 100), forest=(90, 100, 85)), sea=-0.05, clouds=0.25, lights=1.3, atm=(160, 180, 230), freq=1.2)
for i, (hue, rmp) in enumerate([(30, [(0, (110, 60, 30)), (0.4, (190, 120, 60)), (0.7, (225, 175, 110)), (1, (240, 215, 170))]),
                                (12, [(0, (90, 30, 20)), (0.4, (170, 70, 40)), (0.75, (210, 120, 80)), (1, (235, 180, 140))]),
                                (45, [(0, (120, 95, 55)), (0.5, (200, 175, 120)), (1, (245, 230, 190))]),
                                (0, [(0, (70, 50, 50)), (0.5, (150, 110, 100)), (1, (220, 190, 170))]),
                                (60, [(0, (100, 100, 60)), (0.5, (180, 170, 110)), (1, (230, 225, 180))])]):
    add(f'desert{i}', 'desert', hue, dict(ramp=rmp), lights=0.6 if i == 0 else 0, atm=H(hue + 10, 0.4, 1.0), atmk=0.7, craters=6 + i * 4, clouds=0.15)
for i, (hue, rmp, cr) in enumerate([(205, [(0, (150, 180, 210)), (0.5, (210, 228, 245)), (1, (250, 252, 255))], (70, 110, 160)),
                                    (180, [(0, (140, 190, 195)), (0.6, (210, 235, 235)), (1, (250, 255, 255))], (60, 120, 130)),
                                    (225, [(0, (160, 165, 200)), (0.5, (215, 215, 240)), (1, (248, 248, 255))], (90, 90, 160)),
                                    (30, [(0, (190, 175, 160)), (0.5, (230, 220, 210)), (1, (252, 250, 245))], (150, 100, 70)),
                                    (200, [(0, (110, 130, 150)), (0.5, (180, 195, 210)), (1, (235, 240, 245))], (60, 70, 90))]):
    add(f'ice{i}', 'ice', hue, dict(ramp=rmp, crack=cr), atm=H(hue, 0.25, 1.0) if i < 3 else None, atmk=0.6, craters=4 + i * 6, clouds=0.25 if i == 2 else 0)
for i, (hue, rmp) in enumerate([(15, [(0, (25, 20, 20)), (0.6, (60, 45, 40)), (1, (100, 80, 70))]), (0, [(0, (30, 15, 15)), (0.6, (70, 35, 30)), (1, (110, 70, 60))]),
                                (30, [(0, (35, 30, 25)), (0.6, (80, 70, 55)), (1, (120, 105, 85))]), (330, [(0, (25, 15, 25)), (0.6, (60, 40, 55)), (1, (100, 75, 90))])]):
    add(f'lava{i}', 'lava', hue, dict(ramp=rmp), atm=(255, 110, 50), atmk=0.7, halok=0.6)
for i, (hue, rmp, mar) in enumerate([(0, [(0, (70, 70, 72)), (0.5, (130, 128, 125)), (1, (190, 188, 185))], 0.35), (30, [(0, (80, 65, 50)), (0.5, (140, 120, 95)), (1, (195, 175, 150))], 0.25),
                                     (15, [(0, (90, 60, 50)), (0.5, (150, 110, 90)), (1, (200, 165, 140))], 0.2), (210, [(0, (60, 65, 75)), (0.5, (115, 120, 130)), (1, (175, 180, 190))], 0.3),
                                     (45, [(0, (90, 85, 60)), (0.5, (150, 140, 110)), (1, (210, 200, 170))], 0.15), (0, [(0, (40, 38, 38)), (0.5, (85, 82, 80)), (1, (140, 136, 132))], 0.4)]):
    add(f'barren{i}', 'barren', hue, dict(ramp=rmp), craters=50 + i * 12, maria=mar, bumpk=1.3)
add('sulfur0', 'sulfur', 50, dict(ramp=[(0, (150, 120, 40)), (0.5, (220, 200, 90)), (1, (250, 240, 170))]), bumpk=0.8)
for i, (hue, rmp, sea) in enumerate([(75, [(0, (70, 80, 20)), (0.5, (140, 150, 50)), (1, (200, 200, 110))], (60, 90, 30)), (100, [(0, (40, 70, 40)), (0.5, (100, 130, 60)), (1, (170, 190, 110))], (40, 70, 50)),
                                     (45, [(0, (90, 70, 20)), (0.5, (170, 140, 40)), (1, (220, 200, 100))], (90, 70, 20)), (285, [(0, (60, 30, 70)), (0.5, (120, 70, 120)), (1, (190, 140, 180))], (70, 30, 80))]):
    add(f'toxic{i}', 'toxic', hue, dict(ramp=rmp, sea=sea), sea=-0.05, clouds=0.75, cloudcol=tuple(min(255, c + 60) for c in rmp[1][1]), atm=H(hue, 0.5, 0.95))
for i, (hue, a, b, e, g) in enumerate([(275, (150, 110, 220), (220, 200, 255), (60, 30, 90), (220, 160, 255)), (180, (90, 200, 200), (200, 255, 250), (20, 60, 70), (140, 255, 240)), (330, (230, 120, 180), (255, 210, 235), (90, 30, 60), (255, 150, 210))]):
    add(f'crystal{i}', 'crystal', hue, dict(a=a, b=b, edge=e, glow=g), atm=g, atmk=0.5, halok=0.5, bumpk=1.5)
GAS = [('jovian', 30, [(0, (120, 80, 50)), (0.3, (200, 150, 100)), (0.55, (235, 215, 180)), (0.8, (180, 110, 70)), (1, (240, 230, 210))], (200, 90, 60)),
       ('saturn', 45, [(0, (170, 140, 90)), (0.5, (225, 200, 150)), (1, (245, 235, 205))], (240, 210, 160)),
       ('neptune', 220, [(0, (30, 60, 140)), (0.5, (60, 110, 200)), (1, (150, 190, 240))], (230, 240, 255)),
       ('uranus', 185, [(0, (110, 180, 190)), (0.5, (150, 210, 215)), (1, (200, 235, 235))], (230, 250, 250)),
       ('violet', 280, [(0, (70, 40, 110)), (0.4, (130, 80, 170)), (0.7, (190, 150, 220)), (1, (240, 220, 250))], (240, 200, 255)),
       ('ember', 10, [(0, (90, 25, 20)), (0.4, (170, 60, 40)), (0.7, (220, 120, 80)), (1, (250, 200, 160))], (255, 220, 160)),
       ('jade', 140, [(0, (30, 80, 60)), (0.5, (80, 160, 120)), (1, (190, 230, 200))], (220, 250, 230)),
       ('amber', 50, [(0, (110, 80, 20)), (0.4, (190, 150, 50)), (0.7, (230, 200, 110)), (1, (250, 240, 200))], (200, 120, 40))]
for i, (nm, hue, rmp, storm) in enumerate(GAS):
    ring = None
    if i % 2 == 1 or nm == 'saturn':
        rr = np.random.default_rng(i)
        ring = dict(tilt=0.2 + rr.random() * 0.14, rot=(rr.random() - 0.5) * 0.5, inner=1.3 + rr.random() * 0.12, outer=2.05 + rr.random() * 0.3, gap=0.55 + rr.random() * 0.15,
                    ramp=[(0, tuple(c * 0.7 for c in rmp[1][1])), (0.5, rmp[-1][1]), (1, tuple(c * 0.8 for c in rmp[len(rmp) // 2][1]))])
    add(f'gas_{nm}', 'gas', hue, dict(ramp=rmp, storm=storm), bands=7 + (i * 3) % 8, storms=1 + i % 3, atm=tuple(min(255, c + 30) for c in rmp[len(rmp) // 2][1]), atmk=0.6, halok=0.55, rings=ring)
    if nm in ('jovian', 'neptune', 'ember', 'jade'):   # an unringed twin with different bands
        add(f'gas_{nm}2', 'gas', hue, dict(ramp=[(p_, c_) for (p_, _), (_, c_) in zip(rmp, rmp[::-1])] if nm != 'jovian' else rmp, storm=storm), bands=11 + i % 5, storms=2, atm=tuple(min(255, c + 30) for c in rmp[len(rmp) // 2][1]), atmk=0.6, halok=0.55)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    man = {}
    mpath = os.path.join(OUT, 'planets.json')
    if (ONLY or os.environ.get('MAPS_ONLY')) and os.path.exists(mpath): man = json.load(open(mpath))
    for sp in SPECS:
        if ONLY and sp['id'] != ONLY and not sp['id'].startswith(ONLY): continue
        if os.environ.get('MAPS_ONLY') and sp['id'] in man: rf = man[sp['id']]['r']   # re-bake only the surface maps
        else:
            im, rf, back, front = render(sp, layers=True); im.save(os.path.join(OUT, sp['id'] + '.webp'), 'WEBP', quality=86, method=6)
            back.save(os.path.join(OUT, sp['id'] + '_back.webp'), 'WEBP', quality=80, method=6)
            if front: front.save(os.path.join(OUT, sp['id'] + '_front.webp'), 'WEBP', quality=82, method=6)
        tex, aux, tm = texture(sp); tex.save(os.path.join(OUT, sp['id'] + '_tex.webp'), 'WEBP', quality=78, method=6); A0 = np.asarray(aux); A4 = np.dstack([np.asarray(Image.fromarray(np.ascontiguousarray(A0[..., c])).resize((TW * 2 // 3, TH * 2 // 3), Image.LANCZOS)) for c in range(4)]);   # each map on its own (an RGBA resize would premultiply by the cloud alpha)
        A4[..., 0] = np.asarray(Image.fromarray(A4[..., 0]).filter(ImageFilter.GaussianBlur(1.0 if sp['type'] in ('barren', 'sulfur') else 1.2)));   # soften the relief so coasts do not step
        stack = np.concatenate([A4[..., c] for c in range(4)], 0)   # four grey maps stacked: height, water, emissive, cloud
        Image.fromarray(stack, 'L').save(os.path.join(OUT, sp['id'] + '_aux.webp'), 'WEBP', quality=80, method=6)
        man[sp['id']] = dict(type=sp['type'], hue=sp['hue'], r=round(rf, 4), rings=bool(sp.get('rings')), lights=bool(sp.get('lights')), tw=TW, th=TH, bk=tm['bk'], ecol=tm['ecol'],
                             atm=[int(c) for c in sp['atm']] if sp.get('atm') is not None else None, atmk=sp.get('atmk', 1.0), cloud=[int(c) for c in sp.get('cloudcol', (248, 249, 252))],
                             gas=sp['type'] == 'gas', night=sp['type'] in ('terran', 'earth', 'ocean', 'jungle', 'city', 'desert'))
        print(sp['id'], os.path.getsize(os.path.join(OUT, sp['id'] + '.webp')) // 1024, 'KB', flush=True)
    json.dump(man, open(mpath, 'w'), indent=0)
