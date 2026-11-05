"""Re-cast the planet's shadow on the rings of the supplied Sol giants (Saturn and Uranus).

The Sol giants are supplied artwork rather than rift_planets.py renders, so their front layers carried a flat,
hand-painted shadow that did not follow the ring plane. This tool keeps the supplied planet and ring pixels, removes
that old shadow from the front layer and the still image, and replaces it with the same ray-cast ring shadow that
rift_planets.py bakes for the generated ringed giants (same light direction, density banding and softness).

Ring geometry (rotation, tilt, inner and outer radius in planet radii) is fitted from the supplied ring pixels, so
the shadow lines up with the rings that are actually drawn.

usage: python3 tools/sol_ring_shadows.py [client/assets/planets]      (needs numpy and Pillow)"""
import sys, os, json, math
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from rift_noise import smooth

OUT = sys.argv[1] if len(sys.argv) > 1 else 'client/assets/planets'
LIGHT = np.array([-0.58, -0.45, 0.68]); LIGHT /= np.linalg.norm(LIGHT)   # rift_planets.py key light
IDS = ['sol_saturn', 'sol_uranus']
RING_ALPHA = 0.85   # rift_planets.py default ring opacity


def load(name):
    return np.asarray(Image.open(os.path.join(OUT, name + '.webp')).convert('RGBA')).astype(float) / 255


def grid(size, radius_fraction):
    ext = 1 / radius_fraction   # frame half-width in planet radii
    lin = (np.arange(size) + 0.5) / size * 2 - 1
    return np.meshgrid(lin * ext, lin * ext)


def fit_rings(ring, X, Y):
    """Search ring rotation and tilt that best explain the supplied ring pixels outside the disk."""
    outside = np.hypot(X, Y) > 1.15
    best = None
    for rot in np.linspace(-math.pi / 2, math.pi / 2, 181):
        ca, sa = math.cos(rot), math.sin(rot)
        Xr, Yr = X * ca + Y * sa, -X * sa + Y * ca
        for tilt in np.linspace(0.03, 0.6, 58):
            rr = np.sqrt(Xr ** 2 + (Yr / tilt) ** 2)
            inner, outer = np.percentile(rr[ring], [1, 99])
            predicted = (rr > inner) & (rr < outer) & outside
            score = (predicted & ring).sum() / max(1, (predicted | ring).sum())
            if best is None or score > best[0]:
                best = (score, rot, tilt, inner, outer)
    return best


def density(u, gap):
    """rift_planets.py ring banding, so the shadow shows the same gaps as generated rings."""
    d = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(u * 47 + np.sin(u * 13) * 2)) * (0.6 + 0.4 * np.sin(u * 211))
    d *= smooth(0, 0.06, u) * smooth(1, 0.9, u)
    return d * (1 - smooth(0.02, 0.0, np.abs(u - gap) - 0.02) * 0.9)


def ring_shadow(X, Y, rot, tilt, inner, outer, gap=0.62):
    """Ray-cast lit surface points toward the light onto the ring plane (rift_planets.py geometry)."""
    R2 = X * X + Y * Y; inside = R2 < 1; Z = np.sqrt(np.clip(1 - R2, 0, 1))
    ca, sa = math.cos(rot), math.sin(rot)
    Xr, Yr = X * ca + Y * sa, -X * sa + Y * ca
    lam_s = X * LIGHT[0] + Y * LIGHT[1] + Z * LIGHT[2]
    st = math.sqrt(max(1e-6, 1 - tilt * tilt))
    Lx_, Ly_, Lz_ = LIGHT[0] * ca + LIGHT[1] * sa, -LIGHT[0] * sa + LIGHT[1] * ca, LIGHT[2]
    nY, nZ = -st, tilt
    ndl = nY * Ly_ + nZ * Lz_
    uu = -(nY * Yr + nZ * Z) / (ndl if abs(ndl) > 1e-6 else 1e-6)
    Hx, Hy, Hz = Xr + uu * Lx_, Yr + uu * Ly_, Z + uu * Lz_
    rh = np.sqrt(Hx ** 2 + (Hy * tilt + Hz * st) ** 2)
    uh = np.clip((rh - inner) / (outer - inner), 0, 1)
    return ((uu > 0) * (rh > inner) * (rh < outer) * inside * np.clip(density(uh, gap), 0, 1)
            * RING_ALPHA * 0.75 * smooth(-0.05, 0.25, lam_s))


def save(array, name, quality):
    image = Image.fromarray((np.clip(array, 0, 1) * 255).round().astype(np.uint8), 'RGBA')
    image.save(os.path.join(OUT, name + '.webp'), 'WEBP', quality=quality, method=6)


def main():
    manifest = json.load(open(os.path.join(OUT, 'planets.json')))
    for planet in IDS:
        front, back, still = load(planet + '_front'), load(planet + '_back'), load(planet)
        size = front.shape[0]
        X, Y = grid(size, manifest[planet]['r'])
        disk = np.hypot(X, Y) < 1.0
        bright = lambda layer: (layer[..., 3] > 0.15) & (layer[..., :3].max(-1) > 0.2)
        ring = (bright(front) | bright(back)) & (np.hypot(X, Y) > 1.15)
        score, rot, tilt, inner, outer = fit_rings(ring, X, Y)
        print(f'{planet}: fit {score:.2f} rot {rot:.3f} tilt {tilt:.3f} rings {inner:.2f}-{outer:.2f}')
        # The old painted shadow is the near-black part of the front layer over the disk.
        old = (front[..., :3].max(-1) < 0.12) & (front[..., 3] > 0.0) & disk
        old_alpha = np.where(old, front[..., 3], 0.0)
        ring_alpha = np.where(old, 0.0, front[..., 3])
        ring_rgb = front[..., :3]
        # Undo the old darkening on the still, then apply the new shadow beneath the near ring.
        restored = still.copy()
        restored[..., :3] = np.where(old[..., None], still[..., :3] / np.maximum(1 - old_alpha, 0.2)[..., None], still[..., :3])
        shadow = ring_shadow(X, Y, rot, tilt, inner, outer) * (1 - ring_alpha)
        restored[..., :3] *= (1 - shadow)[..., None]
        new_alpha = ring_alpha + shadow * (1 - ring_alpha)
        new_rgb = np.where(new_alpha[..., None] > 1e-4, ring_rgb * (ring_alpha / np.maximum(new_alpha, 1e-4))[..., None], 0)
        save(np.dstack([new_rgb, new_alpha]), planet + '_front', 82)
        save(restored, planet, 86)


if __name__ == '__main__':
    main()
