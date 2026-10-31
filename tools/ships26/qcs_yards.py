"""Render the QCS yard portraits after the canonical flight-sheet command."""
import os
import sys
from pathlib import Path
from PIL import Image
import rift_ships26 as pipeline
from artgen3 import build
from render2 import render

if __name__ == '__main__':
    if os.environ.get('PYTHONHASHSEED') != '0':
        raise SystemExit('Set PYTHONHASHSEED=0 for deterministic geometry')
    destination = Path(sys.argv[1]) / 'client' / 'assets' / 'ships'
    for hull_id in (736, 850, 851, 852, 853):
        meshes, glow, lights, size, scale, density, _ = build(pipeline.KEYS[hull_id])
        result = render(meshes + glow + lights, 400, 215, scale * 360 / size,
                        tilt=55, density=density, ss=2)
        base, _ = pipeline.layers(result)
        Image.fromarray(base, 'RGBA').save(destination / f'{hull_id}_yard.png')
