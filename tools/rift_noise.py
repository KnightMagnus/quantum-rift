"""Shared noise for the 2.5 art tools: vectorized 3D Perlin gradient noise, fBm, ridged and domain-warped variants."""
import numpy as np

class Perlin3:
    def __init__(s, seed):
        r = np.random.default_rng(seed); p = r.permutation(256); s.p = np.concatenate([p, p]).astype(np.int32)
        g = r.normal(size=(256, 3)); s.g = g / np.linalg.norm(g, axis=1, keepdims=True)
    def __call__(s, x, y, z):
        xi, yi, zi = np.floor(x).astype(np.int32), np.floor(y).astype(np.int32), np.floor(z).astype(np.int32)
        xf, yf, zf = x - xi, y - yi, z - zi; xi &= 255; yi &= 255; zi &= 255
        u, v, w = [t * t * t * (t * (t * 6 - 15) + 10) for t in (xf, yf, zf)]
        p, g = s.p, s.g
        def grad(ix, iy, iz, dx, dy, dz):
            h = p[p[p[ix] + iy] + iz]; G = g[h]; return G[..., 0] * dx + G[..., 1] * dy + G[..., 2] * dz
        x1, y1, z1 = (xi + 1) & 255, (yi + 1) & 255, (zi + 1) & 255
        n000 = grad(xi, yi, zi, xf, yf, zf); n100 = grad(x1, yi, zi, xf - 1, yf, zf)
        n010 = grad(xi, y1, zi, xf, yf - 1, zf); n110 = grad(x1, y1, zi, xf - 1, yf - 1, zf)
        n001 = grad(xi, yi, z1, xf, yf, zf - 1); n101 = grad(x1, yi, z1, xf - 1, yf, zf - 1)
        n011 = grad(xi, y1, z1, xf, yf - 1, zf - 1); n111 = grad(x1, y1, z1, xf - 1, yf - 1, zf - 1)
        a = n000 + u * (n100 - n000); b = n010 + u * (n110 - n010); c = n001 + u * (n101 - n001); d = n011 + u * (n111 - n011)
        e = a + v * (b - a); f = c + v * (d - c); return e + w * (f - e)   # roughly -1..1

def fbm(P, x, y, z, oct=6, lac=2.03, gain=0.5):
    a, f, t, n = 1.0, 1.0, 0.0, 0.0
    for o in range(oct):
        t = t + a * P(x * f + o * 17.3, y * f - o * 9.1, z * f + o * 5.7); n += a; a *= gain; f *= lac
    return t / n   # about -0.6..0.6

def ridged(P, x, y, z, oct=5, lac=2.1, gain=0.5):
    a, f, t, n = 1.0, 1.0, 0.0, 0.0
    for o in range(oct):
        r = 1 - np.abs(P(x * f + o * 11.1, y * f + o * 3.3, z * f - o * 7.7)); t = t + a * r * r; n += a; a *= gain; f *= lac
    return t / n   # 0..1

def warped(P, x, y, z, k=0.6, oct=6):
    qx = fbm(P, x + 1.7, y + 9.2, z + 3.1, 4); qy = fbm(P, x + 8.3, y + 2.8, z + 7.7, 4); qz = fbm(P, x + 4.4, y + 6.6, z + 1.9, 4)
    return fbm(P, x + k * qx * 4, y + k * qy * 4, z + k * qz * 4, oct)

def smooth(a, b, v): t = np.clip((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def lerp(a, b, t): t = np.asarray(t)[..., None]; return np.asarray(a, float) * (1 - t) + np.asarray(b, float) * t
def ramp(v, stops):
    """stops: [(pos, (r,g,b)), ...] sorted by pos; v any array -> colours (..., 3)"""
    pos = np.array([s[0] for s in stops]); cols = np.array([s[1] for s in stops], float)
    out = np.empty(v.shape + (3,))
    for c in range(3): out[..., c] = np.interp(v, pos, cols[:, c])
    return out
