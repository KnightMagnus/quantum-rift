"""Deterministic large motherlodes in the existing rift_objects lit-3D style.

Usage: python3 tools/rift_motherlodes.py client/assets/objects
Requires the existing art toolchain (numpy, Pillow). Verified with numpy2.5.4
and Pillow13.0.0 under Python3.14. Generates only three NEW
motherlode files; never regenerates or changes ordinary rock mappings.
"""
import hashlib
import json
import math
from pathlib import Path
import sys
import numpy as np
from PIL import Image
from rift_render3d import render, mat, loft, sphere
from rift_noise import Perlin3, fbm


def body(seed, material, elongation):
    noise = Perlin3(seed)
    shape = loft([(math.cos(t), 0, 0, math.sin(t) + .001,
                   math.sin(t) + .001, 2) for t in np.linspace(0, math.pi, 28)][::-1],
                 material, ring=36)
    def deform(vertices):
        d = vertices / (np.linalg.norm(vertices, axis=1, keepdims=True) + 1e-9)
        h = 1 + .48 * fbm(noise, d[:, 0]*1.3, d[:, 1]*1.3, d[:, 2]*1.3, 4)
        h += .12 * fbm(noise, d[:, 0]*5, d[:, 1]*5, d[:, 2]*5, 3)
        v = d * h[:, None]
        v[:, 1] *= elongation
        return v
    return shape.tf(deform)


def main():
    out = Path(sys.argv[1] if len(sys.argv)>1 else 'client/assets/objects')
    out.mkdir(parents=True, exist_ok=True)
    specs = [('ore', (0.43,.37,.29), 1.35, (.56,.40,.20)),
             ('gas', (.30,.38,.34), .85, (.26,.52,.43)),
             ('shards', (.38,.33,.40), 1.05, (.52,.43,.64))]
    report=[]
    for i, (family, color, elongation, seamcolor) in enumerate(specs):
        rockmat=mat(color, metal=.06, panel=0, rough=.9, grime=.5)
        seam=mat(seamcolor, metal=.35 if i==2 else .1, panel=0, rough=.45, grime=.2)
        meshes=[body(730+i, rockmat, elongation)]
        rng=np.random.default_rng(900+i)
        for j in range(9):
            d=rng.normal(size=3);d/=np.linalg.norm(d)
            if i==2:
                crystal=loft([(0,0,0,.11,.09,.9),(.48,0,0,.1,.07,.9),(.8,0,0,.002,.002,.9)], seam, ring=6,axis='z')
                meshes.append(crystal.tf(lambda v,d=d: v+d*.65))
            else:
                meshes.append(sphere(tuple(d*.86),.16 if i==0 else .23,seam,squash=.55))
        extent=np.abs(np.concatenate([m.V for m in meshes])).max()
        rgb,alpha=render(meshes,384,37+i*55,384*.40/extent,tilt=45,ss=2,density=10)[0]
        rgba=np.dstack([np.clip(rgb,0,1)*255,np.clip(alpha,0,1)*255]).round().astype(np.uint8)
        image=Image.fromarray(rgba,'RGBA');p=out/f'motherlode-{family}.webp'
        image.save(p,'WEBP',lossless=True,method=6,exact=True)
        assert image.getbbox() and rgba[:,:,3].min()==0 and rgba[:,:,3].max()>0
        report.append({'file':p.name,'width':384,'height':384,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
    print(json.dumps(report,indent=2))


if __name__=='__main__':
    main()
