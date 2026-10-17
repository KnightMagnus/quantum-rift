"""Restore missing capital-ship banks using recovered original 2.6 geometry.

PYTHONHASHSEED=0 python3 tools/ships26/repair_banks.py GAME OUTPUT [--processes 4]
Requires numpy/Pillow. Writes only the 17 repaired base/glow sheets and proof JSON.
Existing level frames are copied pixel-for-pixel; new bank frames use original
model-space rolls (-28,+28 degrees), lighting, sizing and supersampling. Output
WebP is lossless so copying old level pixels introduces no generational loss.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
from multiprocessing import Pool
import numpy as np
from PIL import Image
import rift_ships26 as original

IDS = (717,734,736,743,744,750,769,774,779,784,785,786,787,789,792,795,804)
GAME = OUTPUT = None

def initialize(game, output):
    global GAME, OUTPUT
    GAME, OUTPUT = game, output

def repair(hid):
    # Each worker starts a fresh material registry, matching standalone renders.
    M,G,L,size,sc,density,_ = original.build(original.KEYS[hid])
    fs = original.out_size(size,hid)
    old = [Image.open(GAME / f'{hid}{suffix}.webp').convert('RGBA') for suffix in ('','_glow')]
    assert all(im.size == (fs*12,fs*3) for im in old), f'{hid}: expected original 36-frame sheets'
    sheets = [Image.new('RGBA',(fs*12,fs*9)) for _ in old]
    for im,source in zip(sheets,old): im.paste(source,(0,0))
    identity = []
    for heading in (0,6,12,18,24,30):
        b,_ = original.layers(original.render(M+G+L,fs,heading*10,sc*fs/size,roll=0,density=density*fs/size,ss=2))
        x,y=heading%12*fs,heading//12*fs
        a=b[:,:,3]>30; c=np.array(old[0].crop((x,y,x+fs,y+fs)))[:,:,3]>30
        iou=float(np.logical_and(a,c).sum()/np.logical_or(a,c).sum())
        assert iou>.97, f'{hid} heading{heading}: original silhouette mismatch {iou}'
        identity.append(iou)
    for bank,roll in enumerate(original.ROLLS[1:],1):
        for heading in range(36):
            layers=original.layers(original.render(M+G+L,fs,heading*10,sc*fs/size,roll=roll,density=density*fs/size,ss=2))
            idx=bank*36+heading; at=(idx%12*fs,idx//12*fs)
            for sheet,pixels in zip(sheets,layers): sheet.paste(Image.fromarray(pixels),at)
    files=[]
    for sheet,source,suffix in zip(sheets,old,('','_glow')):
        path=OUTPUT/f'{hid}{suffix}.webp'; sheet.save(path,'WEBP',lossless=True,exact=True,method=4)
        decoded=Image.open(path).convert('RGBA')
        assert np.array_equal(np.array(decoded.crop((0,0,fs*12,fs*3))),np.array(source))
        files.append({'name':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size})
    print(f'done {hid} {original.KEYS[hid]} {fs}px 108 frames',flush=True)
    return {'id':hid,'design':original.KEYS[hid],'fs':fs,'rolls':original.ROLLS,'neutralSilhouetteIoU':identity,'neutralPixelsPreserved':True,'files':files}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('game',type=Path);parser.add_argument('output',type=Path);parser.add_argument('--processes',type=int,default=4)
    args=parser.parse_args()
    if os.environ.get('PYTHONHASHSEED')!='0': parser.error('set PYTHONHASHSEED=0 for deterministic refit greebles')
    GAME=args.game.resolve()/'client/assets/ships';OUTPUT=args.output.resolve();OUTPUT.mkdir(parents=True,exist_ok=True)
    # maxtasksperchild keeps material IDs independent of worker scheduling.
    with Pool(args.processes,maxtasksperchild=1,initializer=initialize,initargs=(GAME,OUTPUT)) as pool: rows=list(pool.imap_unordered(repair,IDS))
    (OUTPUT/'render-proof.json').write_text(json.dumps(sorted(rows,key=lambda r:r['id']),indent=2)+'\n')
