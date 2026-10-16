"""Render an original, genuinely periodic Sol Gateway vortex (numpy and Pillow).

    python3 tools/rift_wormhole.py client/assets/wormhole.png
    python3 tools/rift_wormhole.py --check

The atlas contains 32 DIFFERENT samples at t=i/32, never the duplicate t=1.
Every animated term is an integer harmonic of 2*pi*t, so both the field and
its velocity agree across the loop. Five spiral arms advance four arm periods
per loop (288 degrees), matching the old vortex's approximate angular tempo.
No source image, endpoint crossfade, random-per-frame noise or external art is used.
"""
import argparse
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image

FRAMES = 32
COLUMNS = 8
FRAME_MS = 55
SIZE = 320
SUPERSAMPLE = 2


def vortex(t, size=SIZE, supersample=SUPERSAMPLE):
    """Linear premultiplied RGBA field, accepting unwrapped t for endpoint tests."""
    n = size * supersample
    p = (np.arange(n, dtype=np.float64) + 0.5) / n * 2.30 - 1.15
    x, y = np.meshgrid(p, p)
    # A slightly oblique portal, with the white throat anchored at its centre.
    u = x * math.cos(0.12) + y * math.sin(0.12)
    v = (-x * math.sin(0.12) + y * math.cos(0.12)) * 1.10
    r = np.hypot(u, v)
    theta = np.arctan2(v, u)
    phase = math.tau * t
    edge = np.clip((1.03 - r) / 0.22, 0, 1)
    edge = edge * edge * (3 - 2 * edge)
    envelope = np.exp(-((r - 0.44) / 0.37) ** 4) * edge
    # Coupled, periodic distortions provide internal flow instead of rotating a still.
    warp = (0.18 * np.sin(3 * theta + 8 * r + phase)
            + 0.09 * np.sin(7 * theta - 11 * r - 2 * phase))
    spiral = 5 * theta + 18.5 * np.log(r + 0.19) - 4 * phase + warp
    arms = np.exp(2.7 * (np.cos(spiral) - 1))
    filaments = np.exp(9 * (np.cos(2 * spiral + 3 * r + 0.30 * np.sin(theta + phase)) - 1))
    ripples = 0.70 + 0.30 * np.cos(24 * r + 2 * np.sin(3 * theta) - 3 * phase)
    texture = (0.76 + 0.11 * np.sin(31 * u + 19 * v + 2 * phase)
               + 0.08 * np.sin(46 * v - 17 * u - phase)
               + 0.05 * np.sin(73 * u + 21 * v + 3 * phase))
    halo = np.exp(-((r - 0.36) / 0.29) ** 2)
    light = envelope * (0.08 * halo + 1.04 * arms * ripples + 0.23 * filaments) * texture
    highlights = envelope * arms ** 2 * 0.23
    core = np.exp(-(r / 0.18) ** 4) * 1.02
    throat = np.exp(-(r / 0.245) ** 2) * 0.22
    rgb = (light[..., None] * np.array([0.40, 0.60, 1.00])
           + highlights[..., None] * np.array([0.82, 0.92, 1.00])
           + throat[..., None] * np.array([0.35, 0.65, 1.00])
           + core[..., None] * np.array([0.92, 0.98, 1.00]))
    rgb = np.clip(rgb, 0, 1)
    alpha = np.clip(np.max(rgb, axis=2) * 1.35, 0, 1)
    field = np.dstack([rgb, alpha])
    return field.reshape(size, supersample, size, supersample, 4).mean(axis=(1, 3))


def frame(t, size=SIZE):
    field = vortex(t, size)
    alpha = field[..., 3:]
    rgb = np.divide(field[..., :3], alpha, out=np.zeros_like(field[..., :3]), where=alpha > 0)
    return Image.fromarray(np.rint(np.clip(np.dstack([rgb, alpha]), 0, 1) * 255).astype(np.uint8))


def check(size=96):
    start, end = vortex(0, size), vortex(1, size)
    endpoint = float(np.max(np.abs(start - end)))
    assert endpoint < 1e-12, f'nonperiodic procedural endpoint: {endpoint}'
    assert frame(0, size).tobytes() == frame(1, size).tobytes(), 'quantized endpoint differs'
    eps = 0.0001
    velocity_start = (vortex(eps, size) - vortex(-eps, size)) / (2 * eps)
    velocity_end = (vortex(1 + eps, size) - vortex(1 - eps, size)) / (2 * eps)
    velocity_error = float(np.max(np.abs(velocity_start - velocity_end)))
    assert velocity_error < 1e-8, f'nonperiodic velocity: {velocity_error}'
    fields = [vortex(i / FRAMES, size) for i in range(FRAMES)]
    deltas = [float(np.abs(fields[(i + 1) % FRAMES][..., :3] - f[..., :3]).mean())
              for i, f in enumerate(fields)]
    # A rigidly rotated still preserves radial brightness moments. Our internal
    # ripples and distortions change them, establishing genuine animated flow.
    p = (np.arange(size) + 0.5) / size * 2 - 1
    x, y = np.meshgrid(p, p)
    moments = [float(np.mean(f[..., :3].mean(axis=2) * (x * x + y * y))) for f in fields]
    internal_motion = max(moments) - min(moments)
    assert internal_motion > 0.0001, 'animation collapsed to a rotated still'
    median = float(np.median(deltas[:-1]))
    ratio = deltas[-1] / median
    assert 0.80 < ratio < 1.20, f'wrap is an outlier: {ratio}'
    # Sampling must not include a duplicate endpoint that would pause for one frame.
    assert all(d > 0.001 for d in deltas), 'duplicate or motionless adjacent frame'
    return dict(frames=FRAMES, columns=COLUMNS, frame_ms=FRAME_MS, frame_size=SIZE,
                endpoint_max_error=endpoint, quantized_endpoint_identical=True, velocity_max_error=velocity_error,
                internal_motion_radial_moment_span=internal_motion,
                adjacent_median=median, wrap_delta=deltas[-1], wrap_to_median=ratio)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output', nargs='?', default='client/assets/wormhole.png')
    parser.add_argument('--check', action='store_true', help='verify periodic field without writing artwork')
    args = parser.parse_args()
    result = check()
    if not args.check:
        image = Image.new('RGBA', (COLUMNS * SIZE, math.ceil(FRAMES / COLUMNS) * SIZE))
        for i in range(FRAMES):
            image.paste(frame(i / FRAMES), ((i % COLUMNS) * SIZE, (i // COLUMNS) * SIZE))
        output = Path(args.output)
        output.parent.mkdir(parents=True, exist_ok=True)
        image.save(output, optimize=True)
        result['output'] = str(output)
        result['bytes'] = output.stat().st_size
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
