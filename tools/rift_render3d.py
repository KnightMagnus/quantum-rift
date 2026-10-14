"""Deferred software renderer for Nova-style ship sprites: smooth lofted geometry, model-space procedural
textures (panels, plate tone, grime, stripes, windows), key/spec/rim lighting, separate glow and light layers."""
import numpy as np, math, struct

# ------------------------------------------------------------------ materials
MATS = []
def mat(color, metal=0.5, panel=1.0, rough=0.5, stripe=None, windows=None, glass=False, emissive=None, grime=1.0, ambient=0.2):
    MATS.append(dict(color=np.array(color, float), metal=metal, panel=panel, rough=rough, stripe=stripe, windows=windows,
                     glass=glass, emissive=None if emissive is None else np.array(emissive, float), grime=grime, ambient=ambient))
    return len(MATS) - 1

# ------------------------------------------------------------------ geometry
class Mesh:
    def __init__(s, V, F, m, layer=0, smooth=True):
        s.V = np.asarray(V, float); s.F = np.asarray(F, int); s.m = m; s.layer = layer
        s.N = smooth_normals(s.V, s.F) if smooth else None
    def tf(s, fn):
        s.V = fn(s.V.copy()); s.N = smooth_normals(s.V, s.F); return s
    def mirror(s):
        V = s.V.copy(); V[:, 0] *= -1
        return Mesh(V, s.F[:, ::-1], s.m, s.layer)
def smooth_normals(V, F):
    N = np.zeros_like(V)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    for k in range(3): np.add.at(N, F[:, k], fn)
    l = np.linalg.norm(N, axis=1, keepdims=True); l[l == 0] = 1
    return N / l
def _se(a, w, h, sq):
    c, s = np.cos(a), np.sin(a)
    return w * np.sign(c) * np.abs(c) ** (2.0 / sq), h * np.sign(s) * np.abs(s) ** (2.0 / sq)
def loft(sections, m, ring=20, axis='y', caps=True, layer=0):
    """sections: (t, cu, cv, w, h, sq). axis y: u=x, v=z. axis x: u=y, v=z. axis z: u=y, v=x."""
    a = np.linspace(0, 2 * math.pi, ring, endpoint=False)
    V = []; F = []
    for (t, cu, cv, w, h, sq) in sections:
        u, v = _se(a, max(w, 1e-4), max(h, 1e-4), sq); u += cu; v += cv
        for k in range(ring):
            if axis == 'y': V.append((u[k], t, v[k]))
            elif axis == 'x': V.append((t, u[k], v[k]))
            else: V.append((v[k], u[k], t))
    n = len(sections)
    for i in range(n - 1):
        for k in range(ring):
            p, q = i * ring + k, i * ring + (k + 1) % ring
            F += [(p, q, q + ring), (p, q + ring, p + ring)]
    flip = axis != 'y'
    if caps:
        for end in (0, n - 1):
            c = len(V); t, cu, cv, *_ = sections[end]
            V.append((cu, t, cv) if axis == 'y' else ((t, cu, cv) if axis == 'x' else (cv, cu, t)))
            for k in range(ring):
                p, q = end * ring + k, end * ring + (k + 1) % ring
                F.append((c, q, p) if end == 0 else (c, p, q))
    F = np.array(F)
    if flip: F = F[:, ::-1]
    return Mesh(V, F, m, layer)
def torus(R, r, m, n=40, k=10, cy=0.0, squash=1.0, layer=0):
    V = []; F = []
    for i in range(n):
        u = 2 * math.pi * i / n
        for j in range(k):
            v = 2 * math.pi * j / k
            V.append(((R + r * math.cos(v)) * math.cos(u), cy + r * math.sin(v), (R + r * math.cos(v)) * math.sin(u) * squash))
    for i in range(n):
        for j in range(k):
            a, b = i * k + j, ((i + 1) % n) * k + j
            c, d = ((i + 1) % n) * k + (j + 1) % k, i * k + (j + 1) % k
            F += [(a, b, c), (a, c, d)]
    return Mesh(V, F, m, layer)
def block(c, s, m, sq=6, layer=0):
    x, y, z = c; w, l, h = s
    return loft([(y - l, x, z, w * 0.85, h * 0.85, sq), (y - l * 0.92, x, z, w, h, sq), (y + l * 0.92, x, z, w, h, sq), (y + l, x, z, w * 0.85, h * 0.85, sq)], m, ring=12, layer=layer)
def sphere(c, r, m, layer=0, squash=1.0):
    secs = [(c[1] + r * math.cos(t), c[0], c[2], r * math.sin(t) + 1e-3, r * math.sin(t) * squash + 1e-3, 2) for t in np.linspace(0, math.pi, 9)][::-1]
    return loft(secs, m, ring=14, layer=layer)
def wing(root, tip_dx, span, c_root, c_tip, sweep, thick, m, z=0.0, dihedral=0.0, sq=2.2, steps=6):
    """root=(x0,y0) leading-edge-centre at wing root; extends to +x."""
    x0, y0 = root; secs = []
    for i in range(steps + 1):
        t = i / steps; c = c_root + (c_tip - c_root) * t
        secs.append((x0 + span * t, y0 - sweep * t, z + dihedral * t, c / 2, thick * (1 - 0.6 * t) + 0.004, sq))
    return loft(secs, m, ring=14, axis='x')
def fin(x, y, height, c_root, c_tip, sweep, thick, m, z0=0.0):
    secs = []
    for i in range(5):
        t = i / 4; c = c_root + (c_tip - c_root) * t
        secs.append((z0 + height * t, y - sweep * t, x, c / 2, thick * (1 - 0.5 * t) + 0.003, 2.2))
    return loft(secs, m, ring=12, axis='z')
def pair(mesh): return [mesh, mesh.mirror()]

# ------------------------------------------------------------------ texture
def _hash(i, j, seed=0.0):
    return np.modf(np.abs(np.sin(i * 12.9898 + j * 78.233 + seed) * 43758.5453))[0]
def shade(P, Nm, Nv, mids, density):
    """P model positions (k,3), Nm model normals, Nv view normals, mids material ids."""
    col = np.zeros((len(P), 3)); emis = np.zeros(len(P), bool)
    L = np.array([-0.55, 0.62, 0.56]); L /= np.linalg.norm(L)
    H = L + np.array([0, 0, 1.0]); H /= np.linalg.norm(H)
    for mid in np.unique(mids):
        sel = mids == mid; M = MATS[mid]
        p = P[sel]; nm = Nm[sel]; nv = Nv[sel]
        if M['emissive'] is not None:
            col[sel] = M['emissive']; emis[sel] = True; continue
        ax = np.argmax(np.abs(nm), axis=1)
        a = np.where(ax == 0, p[:, 1], p[:, 0]); b = np.where(ax == 2, p[:, 1], p[:, 2])
        s = density * M['panel']
        ga = a * s; gb = b * s * 1.6 + 0.5 * (np.floor(ga) % 2)
        fa = np.abs(np.modf(ga)[0]); fb = np.abs(np.modf(gb)[0])
        edge = np.minimum(np.minimum(fa, 1 - fa), np.minimum(fb, 1 - fb))
        lw = 0.035 + 0.015 * (M['panel'] > 1.5)
        line = np.where(edge < lw, 0.8, 1.0) if M['panel'] > 0 else 1.0
        tone = 0.93 + 0.12 * _hash(np.floor(ga), np.floor(gb), mid) if M['panel'] > 0 else 1.0
        grime = 1.0 - M['grime'] * 0.12 * (0.5 + 0.5 * np.sin(p[:, 1] * 37 + np.sin(p[:, 0] * 23) * 2) * np.sin(p[:, 0] * 41 + p[:, 2] * 17))
        alb = M['color'][None, :] * (line * tone * grime)[:, None]
        if M['stripe'] is not None:
            y0, y1, sc = M['stripe']
            inb = (p[:, 1] > y0) & (p[:, 1] < y1) & (ax != 0)
            alb[inb] = np.array(sc) * (line if np.ndim(line) == 0 else line[inb])[:, None] if np.ndim(line) else np.array(sc)
        e = np.zeros(len(p), bool)
        if M['windows'] is not None:
            zlo, zhi, wc, dens = M['windows']
            side = (np.abs(nm[:, 0]) > 0.75) & (p[:, 2] > zlo) & (p[:, 2] < zhi)
            wy = np.abs(np.modf(p[:, 1] * dens)[0])
            row = np.abs(np.modf((p[:, 2] - zlo) / max(zhi - zlo, 1e-3) * 2)[0])
            lit = side & (wy < 0.35) & (row > 0.2) & (row < 0.6) & (_hash(np.floor(p[:, 1] * dens), np.floor(p[:, 2] * 8), 3.3) > 0.2)
            alb[lit] = wc; e = lit
        if M['glass']:
            alb = np.tile(np.array([0.08, 0.12, 0.2]), (len(p), 1)) + 0.25 * np.clip(nv[:, 1:2], 0, 1)
        diff = np.clip(nv @ L, 0, 1)
        spec = np.clip(nv @ H, 0, 1) ** (12 + 40 * (1 - M['rough'])) * (0.25 + 0.75 * M['metal']) * (1.6 if M['glass'] else 1.0)
        rim = (1 - np.clip(nv[:, 2], 0, 1)) ** 3
        amb = M.get('ambient', 0.2)
        c = alb * (amb + 0.9 * (1 - (amb - 0.2) / 0.8) * diff)[:, None] + spec[:, None] * 0.75 + rim[:, None] * np.array([0.10, 0.13, 0.2])
        c[e] = alb[e]
        col[sel] = np.clip(c, 0, 1); emis[np.where(sel)[0][e]] = True
    return col, emis

# ------------------------------------------------------------------ rasterizer
def _xf(V, heading, tilt, roll):
    h, t, r = map(math.radians, (heading, tilt, roll))
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    x, z = x * math.cos(r) - z * math.sin(r), x * math.sin(r) + z * math.cos(r)
    xr = x * math.cos(h) + y * math.sin(h); yr = -x * math.sin(h) + y * math.cos(h)
    yv = yr * math.cos(t) + z * math.sin(t); zv = -yr * math.sin(t) + z * math.cos(t)
    return np.stack([xr, yv, zv], 1)
def render(meshes, size, heading, scale, tilt=45, roll=0, ss=3, density=6.0, bg=None):
    S = size * ss
    Vm = np.concatenate([m.V for m in meshes]); Nm = np.concatenate([m.N for m in meshes])
    off = np.cumsum([0] + [len(m.V) for m in meshes])[:-1]
    F = np.concatenate([m.F + o for m, o in zip(meshes, off)])
    fmat = np.concatenate([[m.m] * len(m.F) for m in meshes]); flay = np.concatenate([[m.layer] * len(m.F) for m in meshes])
    Vv = _xf(Vm, heading, tilt, roll); Nv = _xf(Nm, heading, tilt, roll)
    px = Vv[:, 0] * scale * ss + S / 2; py = S / 2 - Vv[:, 1] * scale * ss; pz = Vv[:, 2]
    out = {}
    zb = np.full((S, S), -1e9); fid = np.full((S, S), -1); bary = np.zeros((S, S, 2))
    order = [0, 1, 2]
    for layer in order:
        if layer > 0:
            lz = np.full((S, S), -1e9); lf = np.full((S, S), -1); lb = np.zeros((S, S, 2))
            Z, FI, B = lz, lf, lb
        else:
            Z, FI, B = zb, fid, bary
        for f in np.where(flay == layer)[0]:
            a, b, c = F[f]
            xs = px[[a, b, c]]; ys = py[[a, b, c]]
            x0, x1 = int(max(0, xs.min())), int(min(S - 1, xs.max()) + 1); y0, y1 = int(max(0, ys.min())), int(min(S - 1, ys.max()) + 1)
            if x0 >= x1 or y0 >= y1: continue
            d = (ys[1] - ys[2]) * (xs[0] - xs[2]) + (xs[2] - xs[1]) * (ys[0] - ys[2])
            if abs(d) < 1e-9: continue
            X, Y = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
            l0 = ((ys[1] - ys[2]) * (X - xs[2]) + (xs[2] - xs[1]) * (Y - ys[2])) / d
            l1 = ((ys[2] - ys[0]) * (X - xs[2]) + (xs[0] - xs[2]) * (Y - ys[2])) / d
            l2 = 1 - l0 - l1
            ins = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
            z = l0 * pz[a] + l1 * pz[b] + l2 * pz[c]
            sub = Z[y0:y1, x0:x1]; upd = ins & (z > sub)
            if layer > 0: upd &= z > zb[y0:y1, x0:x1] - 1e-4
            sub[upd] = z[upd]; FI[y0:y1, x0:x1][upd] = f
            B[y0:y1, x0:x1, 0][upd] = l0[upd]; B[y0:y1, x0:x1, 1][upd] = l1[upd]
        cov = FI >= 0
        img = np.zeros((S, S, 3)); em = np.zeros((S, S), bool)
        if cov.any():
            fi = FI[cov]; b0 = B[..., 0][cov]; b1 = B[..., 1][cov]; b2 = 1 - b0 - b1
            tri = F[fi]
            P = Vm[tri[:, 0]] * b0[:, None] + Vm[tri[:, 1]] * b1[:, None] + Vm[tri[:, 2]] * b2[:, None]
            nm = Nm[tri[:, 0]] * b0[:, None] + Nm[tri[:, 1]] * b1[:, None] + Nm[tri[:, 2]] * b2[:, None]
            nv = Nv[tri[:, 0]] * b0[:, None] + Nv[tri[:, 1]] * b1[:, None] + Nv[tri[:, 2]] * b2[:, None]
            nv /= np.maximum(np.linalg.norm(nv, axis=1, keepdims=True), 1e-9); nv[nv[:, 2] < 0] *= -1
            nm /= np.maximum(np.linalg.norm(nm, axis=1, keepdims=True), 1e-9)
            col, e = shade(P, nm, nv, fmat[fi], density)
            img[cov] = col; em[cov] = e
        a = cov.reshape(size, ss, size, ss).mean((1, 3))
        rgb = (img * cov[..., None]).reshape(size, ss, size, ss, 3).sum((1, 3)) / np.maximum(cov.reshape(size, ss, size, ss).sum((1, 3)), 1)[..., None]
        out[layer] = (rgb, a)
    return out

def to555(rgb, mask, floor=1):
    q = np.clip(np.round(rgb * 31), floor, 31).astype(np.uint16)
    v = (q[..., 0] << 10) | (q[..., 1] << 5) | q[..., 2]
    return v, mask
def encode_rled(w, h, frames):
    """frames: list of (v uint16 hxw, mask bool hxw)."""
    out = bytearray(struct.pack('>5H', w, h, 16, 0, len(frames)) + b'\0' * 6)
    for v, mask in frames:
        for y in range(h):
            row = mask[y]; line = bytearray(); x = 0
            idx = np.flatnonzero(np.diff(np.concatenate([[0], row.astype(np.int8), [0]])))
            runs = [(int(a), int(b)) for a, b in zip(idx[::2], idx[1::2])]
            for s0, e0 in runs:
                if s0 > x: line += bytes([3]) + ((s0 - x) * 2).to_bytes(3, 'big')
                px = v[y, s0:e0].astype('>u2').tobytes()
                line += bytes([2]) + len(px).to_bytes(3, 'big') + px
                if len(px) % 4: line += b'\0' * (4 - len(px) % 4)
                x = e0
            out += bytes([1]) + len(line).to_bytes(3, 'big') + line
        out += b'\0\0\0\0'
    return bytes(out)
