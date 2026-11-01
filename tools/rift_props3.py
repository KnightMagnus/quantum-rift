"""Quantum Rift: third-wave 3D props, in the hull pipeline's lit style (tools/rift_render3d.py).
  decor:   satellite_3..6, pod_3..6, crystal_3..4, iceberg_0..2, beacon_0..1, ruin_2..3, arc_2, leviathan_0, swarm_0
  objects: rock10..17 (ice, iron, carbon, banded, frosted), crys4..5 (gold and green shards)
usage: python3 tools/rift_props3.py <decor dir> <objects dir> [name ...]      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DECOR, OBJ = sys.argv[1], sys.argv[2]; ONLY = sys.argv[3:]
_a = sys.argv; sys.argv = sys.argv[:1]
import rift_stations as S
sys.argv = _a
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, block, sphere, Mesh
from rift_noise import Perlin3, fbm
os.makedirs(DECOR, exist_ok=True); os.makedirs(OBJ, exist_ok=True)
zcyl, flat_torus, panel, arm, light, rot_z = S.zcyl, S.flat_torus, S.panel, S.arm, S.light, S.rot_z
HULL, HULLB, HAB, DARK, GUNM, GLASS, SOLAR, RUST, TANK = S.HULL, S.HULLB, S.HAB, S.DARK, S.GUNM, S.GLASS, S.SOLAR, S.RUST, S.TANK
LRED, LGREEN, LWHITE, GAMBER, GBLUE, GTEAL, GVIOLET, GORANGE = S.LRED, S.LGREEN, S.LWHITE, S.GAMBER, S.GBLUE, S.GTEAL, S.GVIOLET, S.GORANGE
ICE = mat((0.72, 0.84, 0.92), metal=0.35, rough=0.18, panel=0, grime=0.3)
ICE2 = mat((0.55, 0.72, 0.85), metal=0.4, rough=0.15, panel=0, grime=0.2)
IRON = mat((0.5, 0.48, 0.46), metal=0.85, rough=0.35, panel=0, grime=1.2)
CARBON = mat((0.13, 0.12, 0.12), metal=0.3, rough=0.6, panel=0, grime=0.4)
BAND = mat((0.48, 0.38, 0.3), metal=0.1, rough=0.85, panel=0, grime=0.5, stripe=(-0.15, 0.15, (0.7, 0.55, 0.38)))
BONE = mat((0.78, 0.72, 0.6), metal=0.1, rough=0.6, panel=0.2, grime=1.6)
BONE2 = mat((0.6, 0.55, 0.45), metal=0.1, rough=0.7, panel=0.2, grime=2.0)
ORANGE = mat((0.85, 0.45, 0.15), metal=0.4, panel=1.2, grime=1.4)
CRATE = [mat((0.75, 0.4, 0.15), metal=0.3, panel=2.0, grime=1.5), mat((0.25, 0.45, 0.6), metal=0.3, panel=2.0, grime=1.5), mat((0.55, 0.55, 0.5), metal=0.3, panel=2.0, grime=1.5)]
ANCIENT = mat((0.5, 0.48, 0.52), metal=0.6, rough=0.4, panel=1.8, grime=1.6)
GOLDC = mat((0.95, 0.75, 0.3), metal=0.95, panel=0, rough=0.08, grime=0); GREENC = mat((0.4, 0.9, 0.55), metal=0.9, panel=0, rough=0.07, grime=0)
GGOLD = mat((1, 0.8, 0.4), emissive=(1.0, 0.82, 0.45)); GGREEN = mat((0.5, 1, 0.6), emissive=(0.5, 1.0, 0.6)); GWARM = mat((1, 0.8, 0.45), emissive=(1.0, 0.82, 0.5))

def want(n): return not ONLY or any(n.startswith(o) for o in ONLY)
def save(M, out, name, size, tilt=40, heading=30, k=0.42, ss=3, density=10, crop=False):
    if not want(name): return
    V = np.concatenate([m.V for m in M]); ext = np.abs(V).max() or 1
    rgb, a = render(M, size, heading, size * k / ext, tilt=tilt, density=density, ss=ss)[0]
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).round().astype(np.uint8), 'RGBA')
    if crop:   # long, thin subjects: trim to the subject, then centre it back in a square frame
        im = im.crop(im.getbbox()); s_ = int(max(im.size) * 1.08); sq = Image.new('RGBA', (s_, s_)); sq.paste(im, ((s_ - im.width) // 2, (s_ - im.height) // 2)); im = sq.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(out, name + '.webp'), 'WEBP', quality=88, method=6); print(name, flush=True)
def rock(seed, m, elong=1.0, craters=4, rough=0.55):
    P = Perlin3(seed); r = np.random.default_rng(seed)
    secs = [(math.cos(t), 0, 0, math.sin(t) + 1e-3, math.sin(t) + 1e-3, 2) for t in np.linspace(0, math.pi, 30)][::-1]
    s = loft(secs, m, ring=40)
    def f(V):
        n = np.linalg.norm(V, axis=1, keepdims=True) + 1e-9; d = V / n
        h = 1 + rough * fbm(P, d[:, 0] * 1.3, d[:, 1] * 1.3, d[:, 2] * 1.3, 4)[:, None] + 0.14 * fbm(P, d[:, 0] * 5, d[:, 1] * 5, d[:, 2] * 5, 3)[:, None]
        for _ in range(craters):
            c = r.normal(size=3); c /= np.linalg.norm(c); dd = np.arccos(np.clip(d @ c, -1, 1)) / r.uniform(0.25, 0.5)
            h = h - (0.2 * np.clip(1 - dd * dd, 0, 1))[:, None] + (0.06 * np.exp(-((dd - 1) / 0.15) ** 2))[:, None]
        out = d * h; out[:, 1] *= elong; return out
    return s.tf(f)
def shard(d, L, w, m, base=0.55):
    sh = loft([(0, 0, 0, w, w * 0.8, 0.9), (L * 0.75, 0, 0, w * 0.75, w * 0.6, 0.9), (L, 0, 0, 0.003, 0.003, 0.9)], m, ring=6, axis='x')
    ax = np.array([1.0, 0, 0]); v = np.cross(ax, d); c = ax @ d; vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]]); R = np.eye(3) + vx + vx @ vx / (1 + c + 1e-9)
    return sh.tf(lambda V: V @ R.T + d * base)
def rod(p0, p1, r, m, ring=8):
    p0, p1 = np.array(p0, float), np.array(p1, float); d = p1 - p0; L = np.linalg.norm(d)
    base = loft([(0, 0, 0, r, r, 2), (L, 0, 0, r, r, 2)], m, ring=ring)
    z = np.array([0, 1.0, 0]); u = d / L; v = np.cross(z, u); s = np.linalg.norm(v); c = z @ u
    if s < 1e-9: R = np.eye(3) if c > 0 else np.diag([1, -1, -1.0])
    else:
        k = v / s; K = np.array([[0, -k[2], k[1]], [k[2], 0, -k[0]], [-k[1], k[0], 0]]); R = np.eye(3) + K * s + K @ K * (1 - c)
    return base.tf(lambda V: V @ R.T + p0)

# ---------------------------------------------------------------- satellites and buoys (160 px)
save([zcyl((0, 0, 0), 0.25, 0.5, ORANGE), zcyl((0, 0, 0.55), 0.12, 0.08, DARK), sphere((0, 0, 0.7), 0.12, LRED), block((0, 0, -0.55), (0.32, 0.32, 0.05), DARK)], DECOR, 'satellite_3', 160, tilt=55)
save([sphere((0, 0, 0), 0.45, HULL), sphere((0.2, -0.3, 0.15), 0.12, GBLUE), loft([(0.0, 0, 0, 0.02, 0.02, 2), (1.1, 0, 0, 0.01, 0.01, 2)], GUNM, ring=6, axis='z'), sphere((0, 0, 1.1), 0.04, LWHITE),
      arm(0.5, 0.4, 0.9, 0.02, GUNM), arm(3.6, 0.4, 0.9, 0.02, GUNM)], DECOR, 'satellite_4', 160, tilt=45)
save([block((0, 0, 0), (0.18, 0.18, 0.18), HULLB), panel(-1.0, -0.25, -0.22, 0.25, 0, SOLAR), panel(0.22, -0.25, 1.0, 0.25, 0, SOLAR), block((0, 0, 0), (1.0, 0.02, 0.02), GUNM),
      loft([(0.18, 0, 0, 0.05, 0.05, 2), (0.3, 0, 0, 0.3, 0.3, 2), (0.32, 0, 0, 0.3, 0.3, 2)], HULL, ring=20, axis='z'), sphere((0, 0, 0.4), 0.04, GAMBER)], DECOR, 'satellite_5', 160, tilt=50)
mine = [sphere((0, 0, 0), 0.4, DARK)]
for d in [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1), (0.7, 0.7, 0), (-0.7, 0.7, 0), (0.7, -0.7, 0), (-0.7, -0.7, 0)]:
    d = np.array(d, float); d /= np.linalg.norm(d); mine.append(rod(d * 0.35, d * 0.62, 0.035, GUNM)); mine.append(sphere(tuple(d * 0.64), 0.05, RUST))
mine += [sphere((0, -0.28, 0.25), 0.07, LRED)]
save(mine, DECOR, 'satellite_6', 160, tilt=40)
# ---------------------------------------------------------------- cargo and drift (140 px)
save([block((0, 0, 0), (0.6, 0.25, 0.22), CRATE[0]), block((0.1, 0.05, 0.45), (0.55, 0.24, 0.22), CRATE[1]), block((-0.1, -0.02, 0.9), (0.5, 0.23, 0.2), CRATE[2])], DECOR, 'pod_3', 140, tilt=45, heading=40)
save([loft([(-0.8, 0, 0, 0.25, 0.25, 2), (-0.7, 0, 0, 0.3, 0.3, 2), (0.7, 0, 0, 0.3, 0.3, 2), (0.8, 0, 0, 0.25, 0.25, 2)], TANK, ring=18, axis='x'), block((0, 0, 0.3), (0.6, 0.04, 0.02), GUNM), sphere((0.82, 0, 0), 0.05, LRED)], DECOR, 'pod_4', 140, tilt=40)
save([loft([(-0.7, 0, 0, 0.05, 0.05, 2), (-0.5, 0, 0, 0.32, 0.32, 2), (0.3, 0, 0, 0.35, 0.35, 2), (0.6, 0, 0, 0.2, 0.2, 2)], HULL, ring=18, axis='y'), sphere((0, 0.15, 0.25), 0.12, GLASS), block((0, -0.62, 0), (0.12, 0.05, 0.12), ORANGE), sphere((0, 0.58, 0.1), 0.05, GAMBER)], DECOR, 'pod_5', 140, tilt=45)
rng = np.random.default_rng(4); cl = []
for i in range(7):
    c = rng.normal(0, 0.45, 3); c[2] *= 0.4; cl.append(rot_z(block(tuple(c), tuple(rng.uniform(0.12, 0.25, 3)), CRATE[i % 3]), rng.uniform(0, 3)))
save(cl, DECOR, 'pod_6', 140, tilt=50)
# ---------------------------------------------------------------- glowing crystal formations (420 px)
for name, seed, ms, glow in (('crystal_3', 3, (GOLDC, S.CRYS2), GGOLD), ('crystal_4', 4, (GREENC, ICE), GGREEN)):
    r = np.random.default_rng(seed); M = [rock(400 + seed, CARBON, 0.9, 2, 0.4)]
    for j in range(11):
        d = r.normal(size=3); d[2] = abs(d[2]) + 0.3; d /= np.linalg.norm(d); M.append(shard(d, r.uniform(0.7, 1.5), r.uniform(0.1, 0.22), ms[j % 2]))
    for j in range(5):
        d = r.normal(size=3); d[2] = abs(d[2]); d /= np.linalg.norm(d); M.append(sphere(tuple(d * 0.9), 0.06, glow))
    save(M, DECOR, name, 420, tilt=45, heading=seed * 70, k=0.4)
# ---------------------------------------------------------------- drifting icebergs (420 px)
for i in range(3):
    M = [rock(500 + i, ICE if i != 1 else ICE2, 1.3 + 0.2 * i, 2, 0.7)]
    r = np.random.default_rng(510 + i)
    for j in range(5):
        c = r.normal(0, 1.2, 3); c[2] *= 0.3; M.append(rock(520 + i * 10 + j, ICE2 if j % 2 else ICE, 1.0, 1, 0.6).tf(lambda V, c=c, s=r.uniform(0.12, 0.25): V * s + c))
    save(M, DECOR, f'iceberg_{i}', 420, tilt=40, heading=i * 80, k=0.4)
# ---------------------------------------------------------------- Lamplighter lamp buoys (200 px)
for i in range(2):
    M = [zcyl((0, 0, 0), 0.08, 0.6, DARK), block((0, 0, -0.62), (0.3, 0.3, 0.05), DARK), zcyl((0, 0, 0.68), 0.18, 0.12, S.BRASS), sphere((0, 0, 0.7), 0.15, GWARM), loft([(0.82, 0, 0, 0.2, 0.2, 2), (1.0, 0, 0, 0.01, 0.01, 2)], S.BRASS, ring=12, axis='z')]
    if i: M += [arm(a, 0.1, 0.55, 0.03, DARK, -0.5) for a in (0, 2.1, 4.2)] + [sphere((0.55 * math.cos(a), 0.55 * math.sin(a), -0.5), 0.04, GWARM) for a in (0, 2.1, 4.2)]
    save(M, DECOR, f'beacon_{i}', 200, tilt=50, k=0.4)
# ---------------------------------------------------------------- ancient ruins (760 px) and a megastructure arc (900 px)
def ring_ruin(seed, R=1.0, w=0.09):
    r = np.random.default_rng(seed); M = []; a0 = 0
    while a0 < 2 * math.pi - 0.2:
        span = r.uniform(0.25, 0.8)
        if r.random() < 0.65:
            arc = flat_torus(R, w, ANCIENT, arc=span / (2 * math.pi), n=96, k=8); M.append(rot_z(arc, a0))
            for t in np.linspace(a0 + 0.05, a0 + span - 0.05, max(2, int(span * 8))):
                M.append(rot_z(block((R, 0, w + 0.02), (0.03, 0.012, 0.02), GTEAL if r.random() < 0.3 else ANCIENT), t))
            M.append(rot_z(block((R, 0, 0), (w * 1.6, 0.02, w * 1.4), DARK), a0 + span))   # snapped end
        a0 += span + r.uniform(0.1, 0.35)
    return M
save(ring_ruin(31) + [rot_z(block((0.2, 0.1, 0.05), (0.1, 0.06, 0.04), ANCIENT), 0.4)], DECOR, 'ruin_2', 760, tilt=55, k=0.43)
gate = ring_ruin(47, 1.0, 0.12)
r = np.random.default_rng(48)
for j in range(9):
    a = r.uniform(0, 6.28); d = np.array([math.cos(a), math.sin(a), 0.3]); d /= np.linalg.norm(d)
    gate.append(shard(d, r.uniform(0.25, 0.45), 0.06, S.CRYS, base=1.0))
save(gate, DECOR, 'ruin_3', 760, tilt=55, k=0.43, crop=True)
arcM = []
for k in range(3):
    arcM.append(rot_z(flat_torus(2.0, 0.06, ANCIENT, z=(k - 1) * 0.18, arc=0.18, n=160, k=8), -0.55))
for t in np.linspace(-0.55, -0.55 + 0.18 * 2 * math.pi, 22):
    arcM.append(rod((2.0 * math.cos(t), 2.0 * math.sin(t), -0.18), (2.0 * math.cos(t), 2.0 * math.sin(t), 0.18), 0.025, DARK))
    arcM.append(sphere((2.06 * math.cos(t), 2.06 * math.sin(t), 0), 0.02, GTEAL))
save([m.tf(lambda V: V - np.array([2.0 * math.cos(0.0), 0, 0])) for m in arcM], DECOR, 'arc_2', 900, tilt=60, k=0.43, crop=True)
# ---------------------------------------------------------------- the bones of something vast (900 px)
lev = []
spine = [(x, 0.18 * math.sin(x * 1.6), 0.0) for x in np.linspace(-1.6, 1.6, 26)]
for i, (x, y, z) in enumerate(spine):
    s_ = 0.11 * (1 - abs(x) / 2.2) + 0.03
    lev.append(sphere((x, y, z), s_, BONE if i % 2 else BONE2, squash=0.8))
    if -1.1 < x < 0.9 and i % 2 == 0:
        for side in (1, -1):
            pts = [(x + 0.04 * t, y + side * (0.12 + 0.55 * math.sin(t * 1.4) * (1 - abs(x) / 1.8)), -0.15 * t * t) for t in np.linspace(0, 1.6, 7)]
            for p0, p1 in zip(pts, pts[1:]): lev.append(rod(p0, p1, 0.035, BONE))
lev += [sphere((1.75, 0.05, 0.0), 0.2, BONE, squash=0.7), loft([(1.7, 0, 0, 0.1, 0.08, 2), (2.2, 0, 0, 0.02, 0.02, 2)], BONE2, ring=10, axis='x').tf(lambda V: V + np.array([0, 0.05, -0.05]))]
save(lev, DECOR, 'leviathan_0', 900, tilt=55, heading=20, k=0.44, crop=True)
# ---------------------------------------------------------------- a feral swarm cloud (420 px): hundreds of small drones
sw = []; r = np.random.default_rng(77)
for i in range(160):
    c = r.normal(0, [0.8, 0.5, 0.15]); sw.append(sphere(tuple(c), r.uniform(0.04, 0.075), S.CHITIN if i % 4 else S.CHITIN2, squash=0.6))
    if i % 9 == 0: sw.append(sphere(tuple(c + [0, 0, 0.04]), 0.015, GAMBER))
save(sw, DECOR, 'swarm_0', 420, tilt=50, k=0.4, crop=True)
# ---------------------------------------------------------------- asteroids (128 px): ice, iron, carbon, banded, frosted
specs = [(ICE, 1.0, 2), (ICE2, 1.3, 1), (IRON, 1.1, 5), (IRON, 1.4, 3), (CARBON, 1.0, 6), (CARBON, 1.2, 4), (BAND, 1.1, 3), (BAND, 1.5, 2)]
for i, (m, el, cr) in enumerate(specs):
    save([rock(700 + i, m, el, cr)], OBJ, f'rock{10 + i}', 128, tilt=30 + i * 6, heading=i * 41)
for i, (ms, gl) in enumerate(((GOLDC, GGOLD), (GREENC, GGREEN))):
    M = [rock(760 + i, CARBON)]; r = np.random.default_rng(770 + i)
    for j in range(6):
        d = r.normal(size=3); d /= np.linalg.norm(d); M.append(shard(d, r.uniform(0.9, 1.4), r.uniform(0.14, 0.24), ms))
    save(M, OBJ, f'crys{4 + i}', 128, tilt=40, heading=i * 50, k=0.4)
