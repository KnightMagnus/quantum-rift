"""Star Dredge: deterministic mesh using the game's shared 3D renderer.

Usage: python3 tools/rift_dredge.py --out /path/to/staging [--preview]
Requires numpy and Pillow. No registry edits; outputs remain in the supplied directory.
Coordinates: +Y bow, +Z dorsal. Bank order level, right (-18°), left (+18°).
"""
import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from rift_render3d import Mesh, block, loft, mat, render, _xf

FRAME = 200
COLS = 12
ROLLS = (0, -18, 18)


def prism(profile, x0, x1, material):
    """Extruded Y/Z polygon with hard edge normals, for real open-jaw geometry."""
    faces = []
    for i in range(1, len(profile)-1):
        faces.append([(x0, *profile[0]), (x0, *profile[i+1]), (x0, *profile[i])])
        faces.append([(x1, *profile[0]), (x1, *profile[i]), (x1, *profile[i+1])])
    for i, p in enumerate(profile):
        q = profile[(i+1) % len(profile)]
        faces += [[(x0, *p), (x1, *p), (x1, *q)],
                  [(x0, *p), (x1, *q), (x0, *q)]]
    vertices = np.array(faces).reshape(-1, 3)
    return Mesh(vertices, np.arange(len(vertices)).reshape(-1, 3), material)


def box(c, s, material):
    x, y, z = c
    w, l, h = s
    return prism([(y-l,z-h), (y+l,z-h), (y+l,z+h), (y-l,z+h)], x-w, x+w, material)


def build_dredge():
    brown = mat((.46,.31,.21), metal=.30, rough=.85, panel=1.5, grime=1.6, ambient=.28)
    plate = mat((.56,.39,.27), metal=.35, rough=.82, panel=1.1, grime=1.8, ambient=.25)
    charcoal = mat((.105,.113,.117), metal=.25, rough=.88, panel=.6, grime=1, ambient=.32)
    rib = mat((.17,.18,.18), metal=.3, rough=.8, panel=0, grime=1.4)
    grey = mat((.32,.33,.32), metal=.5, rough=.7, panel=.6, grime=1.3)
    edge = mat((.46,.46,.42), metal=.5, rough=.7, panel=0, grime=1.0)
    dark = mat((.045,.049,.048), metal=.1, rough=1, panel=0, grime=.4, ambient=.3)
    glass = mat((.07,.105,.115), metal=.3, rough=.6, panel=0, grime=.2)
    orange = mat((.65,.25,.065), metal=.2, rough=.9, panel=0, grime=1)
    engine = mat((.85,.5,.2), emissive=(.95,.55,.22))
    light = mat((.8,.74,.55), emissive=(.8,.74,.55))
    m = []
    # Low broad chassis supports all three cargo modules, no decorative winglets.
    m += [block((0,-.3,-.23),(1.12,1.04,.17), brown),
          box((0,.34,-.18),(1.10,.39,.22), grey)]
    # Three identical MASSIVE rear containers, physically distinct and dominant.
    for x in (-.80,0,.80):
        m += [block((x,-.52,.34),(.345,.91,.42), charcoal, sq=10)]
        # Top rails, ribbed roof and wide end frames preserve readability at 200 px.
        for sx in (-1,1):
            m += [box((x+sx*.29,-.52,.767),(.025,.86,.018), grey),
                  box((x+sx*.347,-.52,.32),(.018,.84,.022), rib)]
        for y in (-1.34,.29):
            for sx in (-1,1):
                m += [box((x+sx*.31,y,.34),(.035,.033,.40), grey)]
            m += [box((x,y,.735),(.31,.035,.034), brown),
                  box((x,y,-.03),(.31,.035,.033), grey)]
        for y in np.linspace(-1.23,.18,8):
            m += [box((x,y,.762),(.295,.013,.014), rib)]
            for sx in (-1,1):
                m += [box((x+sx*.342,y,.34),(.014,.014,.35), rib)]
        # Smaller door ribs and locking bars on both ends, no additional containers.
        for y in (-1.415,.388):
            for dx in (-.19,0,.19):
                m += [box((x+dx,y,.33),(.013,.015,.32), rib)]
    # Central elevated command spine ends BEHIND the lower scoop lip.
    m += [loft([(-.92,0,.80,.14,.08,5),(-.62,0,.86,.18,.10,6),
                 (.24,0,.68,.24,.13,6),(.86,0,.33,.32,.14,6),
                 (1.02,0,.29,.27,.11,6)], brown, ring=12),
          box((0,1.018,.30),(.24,.018,.046), glass),
          box((0,.89,.445),(.27,.13,.023), plate)]
    for x in (-.17,0,.17):
        m += [box((x,.98,.30),(.012,.024,.056), grey)]
    # Squared shoulder housings, sparse orange heat radiators.
    for s in (-1,1):
        m += [block((s*.73,.60,.03),(.32,.36,.22),brown),
              box((s*1.052,.54,.06),(.02,.19,.12),dark)]
        for y in np.linspace(.39,.69,5):
            m += [box((s*1.075,y,.06),(.009,.014,.10),orange)]
        # Intake actuators: exposed dark piston/grey shaft.
        m += [block((s*.81,.94,-.06),(.075,.28,.075),grey),
              block((s*.81,1.13,-.08),(.045,.18,.045),edge)]
    # Actual open scoop, NOT a closed ring. Lower floor projects 0.68 ahead of cab.
    m += [prism([(.83,-.34),(1.70,-.34),(1.77,-.24),(1.63,-.20),(.91,-.15)],-1.09,1.09,brown),
          prism([(.88,-.15),(1.62,-.20),(1.70,-.17),(.94,-.10)],-1.02,1.02,dark),
          box((0,.87,.00),(.98,.08,.14),dark),
          box((0,1.03,.20),(1.00,.09,.065),plate)]
    cheek = [(.79,-.34),(1.77,-.34),(1.77,-.23),(1.42,.10),(1.11,.28),(.80,.25)]
    for s in (-1,1):
        m += [prism(cheek,min(s*1.11,s*.97),max(s*1.11,s*.97),brown)]
    # Sloping intake ribs visually lead down to separate blunt cutting teeth.
    for x in np.linspace(-.86,.86,8):
        m += [prism([(.89,-.12),(1.58,-.20),(1.61,-.16),(1.05,.13),(.94,.14)],x-.021,x+.021,grey),
              box((x,1.754,-.267),(.083,.105,.047),edge)]
    # Rear propulsion with separate depth-tested emissive overlay.
    for x in (-.79,.79):
        m += [block((x,-1.43,-.18),(.18,.16,.12),grey),
              box((x,-1.595,-.18),(.125,.012,.073),dark),
              box((x,-1.610,-.18),(.087,.008,.032),engine)]
        m[-1].layer = 1
    for s in (-1,1):
        m += [box((s*.93,1.10,.25),(.028,.014,.018),light)]
        m[-1].layer = 2
    return m


def rgba(layer):
    rgb, a = layer
    return Image.fromarray(np.dstack((np.clip(rgb,0,1)*255,a*255)).round().astype('uint8'))


def composite_layers(layers):
    # Emission is a separate game overlay; portrait/contact sheet includes it.
    out = rgba(layers[0])
    for k in (1,2): out = Image.alpha_composite(out,rgba(layers[k]))
    return out


def checker(size):
    out=Image.new('RGBA',size,(23,27,32,255)); d=ImageDraw.Draw(out)
    for y in range(0,size[1],16):
        for x in range(0,size[0],16):
            if (x//16+y//16)%2: d.rectangle((x,y,x+15,y+15),fill=(31,35,40,255))
    return out


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--out',type=Path,required=True)
    p.add_argument('--preview',action='store_true')
    a=p.parse_args(); a.out.mkdir(parents=True,exist_ok=True)
    meshes=build_dredge(); vertices=np.concatenate([m.V for m in meshes])
    # One scale across every heading/bank: prevents turn-dependent sprite pumping.
    extent=max(np.abs(_xf(vertices,h,45,r)[:,:2]).max() for r in ROLLS for h in range(0,360,10))
    scale=FRAME*.455/extent
    # Mesh archive permits independent inspection without importing Python source.
    np.savez_compressed(a.out/'dredge-mesh.npz',
        **{f'{i}_{k}':getattr(m,k) for i,m in enumerate(meshes) for k in ('V','F','N')},
        materials=np.array([m.m for m in meshes]),layers=np.array([m.layer for m in meshes]))
    gallery=checker((6*240,3*245)); gd=ImageDraw.Draw(gallery)
    selected=(0,60,120,180,240,300)
    sheets=[Image.new('RGBA',(COLS*FRAME,9*FRAME)) for _ in range(2)]
    evidence=[]; turn=[]
    for bank,roll in enumerate(ROLLS):
        for h in range(0,360,10):
            if a.preview and h not in selected: continue
            layers=render(meshes,FRAME,h,scale,tilt=45,roll=roll,ss=2,density=5)
            base=rgba(layers[0]); glow=Image.alpha_composite(rgba(layers[1]),rgba(layers[2]))
            frame=bank*36+h//10; xy=(frame%COLS*FRAME,frame//COLS*FRAME)
            sheets[0].paste(base,xy); sheets[1].paste(glow,xy)
            alpha=np.array(base.getchannel('A')); bbox=base.getbbox()
            assert bbox and min(bbox)>0 and bbox[2]<FRAME and bbox[3]<FRAME, (frame,bbox)
            evidence.append(dict(frame=frame,heading=h,roll=roll,bbox=bbox,
                                 clearPixels=int((alpha==0).sum()),opaquePixels=int((alpha==255).sum())))
            comp=composite_layers(layers)
            if bank==0: turn.append(comp)
            if h in selected:
                x=selected.index(h)*240+20;y=bank*245+25
                gallery.alpha_composite(comp,(x,y))
                gd.text((x,y+204),f'{h:03d} deg / bank {roll:+d}',fill='white')
        print(f'bank {roll:+d} complete',flush=True)
    gallery.convert('RGB').save(a.out/'contact-sheet.png')
    for suffix,sheet in zip(('', '_glow'),sheets):
        sheet.save(a.out/f'dredge{suffix}.webp',lossless=True,method=6)
    portrait=composite_layers(render(meshes,640,150,640*.43/extent,tilt=40,ss=2,density=5))
    portrait.save(a.out/'dredge-portrait.png')
    portrait.resize((176,176),Image.Resampling.LANCZOS).save(a.out/'dredge_yard.png')
    turn[0].save(a.out/'turntable.webp',save_all=True,append_images=turn[1:],duration=90,loop=0,lossless=True)
    report=dict(frameSize=FRAME,cols=COLS,banks=True,glow=True,packed=True,
                frameCount=len(evidence),rolls=ROLLS,headings=list(range(0,360,10)),
                scale=scale,meshCount=len(meshes),vertices=len(vertices),
                triangles=sum(len(m.F) for m in meshes),modelBounds=[vertices.min(0).tolist(),vertices.max(0).tolist()],
                sourceSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),frames=evidence)
    (a.out/'render-evidence.json').write_text(json.dumps(report,indent=2)+'\n')


if __name__=='__main__': main()
