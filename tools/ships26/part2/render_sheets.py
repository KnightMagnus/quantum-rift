"""Render the supplied Part II hulls as 36-heading game sheets and yard portraits."""
import os, sys, json
from pathlib import Path
from multiprocessing import Pool
import numpy as np
from PIL import Image
ROOT = Path(__file__).resolve().parents[3]
os.environ['RIFT_SHIPS26'] = str(ROOT / 'tools/ships26')
sys.path.insert(0, os.environ['RIFT_SHIPS26'])
import hulls_terran as T
import hulls_index_war as W
from render2 import render
from rift_ships26 import layers
ROSTER = [(950+i,e[0],e[1],e[-1]) for i,e in enumerate(T.TERRAN)] + [(970+i,e[0],e[1],e[-1]) for i,e in enumerate(W.INDEX_WAR)]
def radius(mesh):
    vertices=np.concatenate([part.V for part in mesh]);return np.sqrt(vertices[:,0]**2+vertices[:,1]**2+(vertices[:,2]*.8)**2).max()
def one(entry):
    hid,key,name,fn=entry
    mesh,glow,lights,size=fn();fs=max(size,min(size*2,200));scale=fs*.47/radius(mesh)
    rolls=[0] if key=='conf_rampart_siege' else [0,-28,28]
    base=Image.new('RGBA',(fs*12,fs*3*len(rolls)));overlay=base.copy()
    for bank,roll in enumerate(rolls):
      for heading in range(36):
        output=render(mesh+glow+lights,fs,heading*10,scale,roll=roll,density=max(2.5,fs/18),ss=2)
        b,g=layers(output);index=bank*36+heading;at=(index%12*fs,index//12*fs)
        base.paste(Image.fromarray(b),at);overlay.paste(Image.fromarray(g),at)
    dest=ROOT/'client/assets/ships';base.save(dest/f'{hid}.webp',quality=90);overlay.save(dest/f'{hid}_glow.webp',quality=85)
    b,g=layers(render(mesh+glow+lights,176,205,176*.44/radius(mesh),tilt=55,density=176/18,ss=2))
    Image.fromarray(b).save(dest/f'{hid}_yard.webp',quality=90)
    return {'id':hid,'key':key,'name':name,'fs':fs,'cols':12,'banks':len(rolls)>1,'glow':True,'packed':True}
if __name__=='__main__':
    if os.environ.get('PYTHONHASHSEED')!='0':raise SystemExit('Set PYTHONHASHSEED=0')
    selected=set(sys.argv[1:]);todo=[e for e in ROSTER if not selected or e[1] in selected]
    with Pool(8) as pool:
      for result in pool.imap_unordered(one,todo):
        meta=ROOT/'tools/ships26/part2'/f"{result['id']}.json";meta.write_text(json.dumps(result));print(json.dumps(result),flush=True)
