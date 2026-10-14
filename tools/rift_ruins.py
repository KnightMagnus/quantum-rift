"""Quantum Rift 2.5.2: the broken rings and megastructure arcs of the system scenery, rendered with the hull pipeline.
  ruin_0, ruin_1  a shattered ring station that has come apart over the years: its segments have drifted outward and
                  tumble at their own angles, with torn spars, loose plating, dead habitat modules and a debris scatter
  arc_0, arc_1    a fragment of an ancient megastructure: layered framework rails, lattice spars, docking bays, panels and
                  a few lights still burning
Output: client/assets/decor/<name>.webp (replaces the flat 2.2 versions)
usage: python3 tools/rift_ruins.py client/assets/decor      (needs numpy and Pillow)"""
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image
from rift_render3d import render, mat, block, sphere, Mesh
import rift_stations as RS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/decor'
PLATE = mat((0.5, 0.5, 0.52), metal=0.55, panel=1.6, grime=2.2); PLATE2 = mat((0.42, 0.4, 0.38), metal=0.5, panel=1.3, grime=2.6)
SCORCH = mat((0.28, 0.25, 0.23), metal=0.4, panel=1.0, grime=3.0); TRUSS = mat((0.33, 0.34, 0.37), metal=0.85, panel=0, rough=0.35)
DEADHAB = mat((0.6, 0.58, 0.55), metal=0.4, panel=1.4, grime=2.0, windows=(-0.04, 0.04, (0.35, 0.28, 0.2), 9))
LIVEHAB = mat((0.62, 0.62, 0.66), metal=0.45, panel=1.4, grime=1.2, windows=(-0.04, 0.04, (1.0, 0.85, 0.55), 9))
GOLD = mat((0.7, 0.55, 0.3), metal=0.9, panel=0.6, rough=0.3); DIM = mat((0.6, 0.35, 0.15), emissive=(0.55, 0.32, 0.12))

def xform(m, R, t):   # rotate a mesh by matrix R about the origin, then move it by t
    return m.tf(lambda V: V @ R.T + np.asarray(t))
def rmat(ax, ay, az):
    cx, sx, cy, sy, cz, sz = math.cos(ax), math.sin(ax), math.cos(ay), math.sin(ay), math.cos(az), math.sin(az)
    return np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]]) @ np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]]) @ np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
def arc_band(R, r, a0, a1, m, z=0.0, n=None, squash=1.0):
    """a curved tube from angle a0 to a1 at radius R in the x-y plane (cross-section radius r)"""
    n = n or max(4, int(abs(a1 - a0) * 18)); k = 8; V = []; F = []
    for i in range(n + 1):
        u = a0 + (a1 - a0) * i / n
        for j in range(k):
            v = 2 * math.pi * j / k; V.append(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), z + r * math.sin(v) * squash))
    for i in range(n):
        for j in range(k):
            a, b, c, d = i * k + j, (i + 1) * k + j, (i + 1) * k + (j + 1) % k, i * k + (j + 1) % k; F += [(a, b, c), (a, c, d)]
    for end, sgn in ((0, 1), (n, -1)):   # caps
        c = len(V); u = a0 + (a1 - a0) * end / n; V.append((R * math.cos(u), R * math.sin(u), z))
        for j in range(k):
            p, q = end * k + j, end * k + (j + 1) % k; F.append((c, q, p) if sgn > 0 else (c, p, q))
    return Mesh(V, F, m)
def radial_block(R, a, w, l, h, m, z=0.0):   # a box sitting on the ring at angle a, long axis along the ring
    return RS.rot_z(block((R, 0, z), (h, l, w), m), a)

def segment(R, a0, a1, rnd, live=False):
    """one piece of a ring station: an outer habitat band, an inner rail, cross spars, modules and torn ends, centred on its own middle"""
    M = [arc_band(R, 0.065, a0, a1, DEADHAB if not live else LIVEHAB, squash=0.8), arc_band(R - 0.13, 0.022, a0 + 0.02, a1 - 0.02, TRUSS)]
    n = max(2, int((a1 - a0) / 0.09))
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n; M += [radial_block(R - 0.055, a, 0.008, 0.008, 0.06, TRUSS)]
    for i in range(int((a1 - a0) / 0.12)):
        a = a0 + (a1 - a0) * rnd.random(); M += [radial_block(R + 0.06, a, 0.03, 0.05, 0.025, PLATE if rnd.random() < 0.6 else SCORCH, z=0.01)]
    for a in (a0, a1):   # torn ends: bent spars poking out
        for _ in range(2):
            d = 0.04 + rnd.random() * 0.08; aa = a + (a1 - a0) * (0.02 if a == a0 else -0.02)
            M += [RS.rot_z(block((R + rnd.normal(0, 0.03), 0, rnd.normal(0, 0.02)), (0.006, d, 0.006), TRUSS), aa + (-1 if a == a0 else 1) * d / R * 0.7)]
    if live and rnd.random() < 0.7: M += [sphere((R * math.cos((a0 + a1) / 2), R * math.sin((a0 + a1) / 2), 0.05), 0.012, DIM)]
    return M
def ruin(seed):
    rnd = np.random.default_rng(seed); M = []; R = 1.0
    cuts = np.sort(rnd.uniform(0, 2 * math.pi, 9)); cuts = np.append(cuts, cuts[0] + 2 * math.pi)
    for i in range(9):
        a0, a1 = cuts[i] + 0.04, cuts[i + 1] - 0.04
        if a1 - a0 < 0.12 or rnd.random() < 0.18: continue   # some pieces are gone entirely
        mid = (a0 + a1) / 2; piece = segment(R, a0, a1, rnd, live=rnd.random() < 0.3)
        c = np.array([R * math.cos(mid), R * math.sin(mid), 0.0]); drift = c / R * rnd.uniform(0.04, 0.32) + np.array([0, 0, rnd.normal(0, 0.08)])
        Rm = rmat(rnd.normal(0, 0.35), rnd.normal(0, 0.35), rnd.normal(0, 0.18))   # each piece tumbles on its own
        M += [xform(m.tf(lambda V, c=c: V - c), Rm, c + drift) for m in piece]
    # the hub, cracked and adrift off-centre
    hub = [RS.zcyl((0, 0, 0), 0.16, 0.08, PLATE2, 18), RS.zcyl((0, 0, 0.1), 0.09, 0.04, SCORCH, 14)]
    for k in range(3):
        a = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(0.2, 0.5); hub += [RS.rot_z(block((0.15 + L / 2, 0, 0), (L / 2, 0.012, 0.012), TRUSS), a)]
    Rh = rmat(rnd.normal(0, 0.4), rnd.normal(0, 0.4), 0); off = np.array([rnd.normal(0, 0.12), rnd.normal(0, 0.12), 0.05])
    M += [xform(m, Rh, off) for m in hub]
    for _ in range(46):   # loose plating and debris in the gaps
        a = rnd.uniform(0, 2 * math.pi); rr = R + rnd.normal(0.08, 0.2); s = rnd.uniform(0.008, 0.035)
        b = block((0, 0, 0), (s, s * rnd.uniform(0.6, 2.2), s * 0.4), PLATE if rnd.random() < 0.5 else SCORCH)
        M += [xform(b, rmat(*rnd.uniform(0, 6.28, 3)), (rr * math.cos(a), rr * math.sin(a), rnd.normal(0, 0.06)))]
    return M
def megastructure(seed):
    rnd = np.random.default_rng(seed); M = []; R = 1.0; a0, a1 = -1.15, 1.15
    for dz, dr, rad, m in ((0.05, 0, 0.022, TRUSS), (-0.05, 0, 0.022, TRUSS), (0.0, -0.09, 0.03, PLATE2), (0.0, 0.09, 0.018, TRUSS)):
        M += [arc_band(R + dr, rad, a0, a1, m, z=dz)]
    n = 46
    for i in range(n + 1):   # lattice: alternating diagonal spars between the rails
        a = a0 + (a1 - a0) * i / n
        M += [RS.rot_z(block((R, 0, 0), (0.09, 0.006, 0.006), TRUSS), a), RS.rot_z(block((R, 0, 0), (0.006, 0.006, 0.05), TRUSS), a)]
        if i % 2 == 0: M += [RS.rot_z(block((R - 0.045, 0, 0.025 * (1 if i % 4 else -1)), (0.05, 0.006, 0.006), TRUSS), a + 0.012)]
    for i in range(14):   # panels on the outer face
        a = a0 + 0.05 + (a1 - a0 - 0.1) * rnd.random(); L = rnd.uniform(0.04, 0.09)
        M += [radial_block(R - 0.12, a, 0.04, L, 0.012, PLATE if rnd.random() < 0.6 else GOLD)]
    for i in range(5):   # docking bays and habitat blocks, a few still lit
        a = a0 + 0.15 + (a1 - a0 - 0.3) * i / 4 + rnd.normal(0, 0.03); live = rnd.random() < 0.5
        M += [radial_block(R + 0.16, a, 0.05, 0.07, 0.06, LIVEHAB if live else DEADHAB), radial_block(R + 0.24, a, 0.02, 0.05, 0.015, TRUSS)]
        if live: M += [sphere(((R + 0.27) * math.cos(a), (R + 0.27) * math.sin(a), 0.03), 0.012, RS.LRED if i % 2 else RS.GAMBER)]
    for a, sgn in ((a0, -1), (a1, 1)):   # broken ends: spars trailing off and a drifting chunk
        for _ in range(5): d = rnd.uniform(0.05, 0.16); M += [RS.rot_z(block((R + rnd.normal(0, 0.06), 0, rnd.normal(0, 0.04)), (0.006, d, 0.006), TRUSS), a + sgn * d / R * 0.6)]
        chunk = arc_band(R, 0.03, a + sgn * 0.12, a + sgn * 0.26, PLATE2)
        c = np.array([R * math.cos(a + sgn * 0.19), R * math.sin(a + sgn * 0.19), 0])
        M += [xform(chunk.tf(lambda V, c=c: V - c), rmat(rnd.normal(0, 0.5), rnd.normal(0, 0.5), rnd.normal(0, 0.3)), c * 1.06 + np.array([0, 0, 0.05]))]
    return M
def save(M, name, size=900, tilt=28, heading=0):
    V = np.concatenate([m.V for m in M]); c = (V.min(0) + V.max(0)) / 2; c[2] = 0; M = [m.tf(lambda W, c=c: W - c) for m in M]; V = np.concatenate([m.V for m in M]);   # centred in the frame
    ext = max(np.abs(V[:, 0]).max(), np.abs(V[:, 1]).max()) * 1.04
    o = render(M, size, heading, size * 0.5 / ext, tilt=tilt, density=16, ss=2); rgb, a = o[0]
    Image.fromarray(np.dstack([np.clip(rgb, 0, 1) * 255, a * 255]).round().astype(np.uint8), 'RGBA').save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=86, method=6); print(name, flush=True)
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    save(ruin(3), 'ruin_0', 760, tilt=24, heading=10); save(ruin(17), 'ruin_1', 760, tilt=30, heading=200)
    save(megastructure(5), 'arc_0', 900, tilt=20, heading=90); save(megastructure(23), 'arc_1', 900, tilt=30, heading=90)
