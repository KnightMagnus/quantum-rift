"""Retain Earth JPEG byte-for-byte; conform connected meshes to actual original terrain."""
import sys,json,copy,zlib,hashlib,shutil
from pathlib import Path
R=Path(__file__).resolve().parent.parent
O=Path(sys.argv[1]).resolve()
sys.argv=[sys.argv[0],str(O)]
import rift_colony_geometry as G
import numpy as np
from PIL import Image,ImageDraw
L=G.L;A=O/'evidence';A.mkdir(parents=True,exist_ok=True)
sp=copy.deepcopy(L.SCENES['earth']);sp['seed']=zlib.crc32(b'earth')%100000
rng=np.random.default_rng(sp['seed']);sky=L.make_sky(sp,rng);_,depth=G.make_terrain(sp,sky,rng)
hf=sp['_hf'];choices=[]
for sx in range(0,61,4):
 for sz in range(18,81,4):
  x,z=np.meshgrid(np.linspace(sx-7,sx+7,8),np.linspace(sz-6,sz+6,8));h=hf(x,z)
  px=L.WW/2+x*sp['_f']/z;py=sp['_hz']+(sp['_cam']-h)*sp['_f']/z
  if np.min(h)<=sp.get('water',-1e6)+.4 or px.min()<L.WW*.5 or px.max()>L.WW*.96 or py.min()<L.HH*.61 or py.max()>L.HH*.97:continue
  choices.append((float(h.std()),sx,sz,float(np.median(h))))
assert choices,'No honest dry unobstructed Earth site'
_,sx,sz,level=min(choices);site=(sx,sz,level)
base=np.asarray(Image.open(R/'client/assets/land/l_earth.jpg').convert('RGB').resize((L.WW,L.HH),Image.Resampling.LANCZOS)).astype(float)/255
shutil.copyfile(R/'client/assets/land/l_earth.jpg',O/'l_earth.jpg')
rows=[];frames=[base]
for stage in (1,2,3):
 im=base.copy();d=depth.copy();parts=G.cluster(stage)
 for group in parts:
  for mesh in group:
   # Physical support follows preserved existing geography, never grades/repaints protected Earth.
   mesh.tf(lambda v:np.column_stack((v[:,0],v[:,1],v[:,2]+(hf(sx+5*v[:,0],sz+5*v[:,1])-level)/5)))
 G.raster(parts[0],im,d,sp,site);G.raster(parts[1],im,d.copy(),sp,site,True);G.raster(parts[2],im,d,sp,site)
 changed=np.max(abs(im-base),axis=2)>1e-9;assert not changed[:int(L.HH*.6)].any()
 image=Image.fromarray((np.clip(im,0,1)*255).astype('uint8'));image.save(A/('earth_col'+str(stage)+'.png'))
 p=O/('l_earth_col'+str(stage)+'.jpg');image.resize((612,285),Image.Resampling.LANCZOS).save(p,quality=87)
 rows.append(dict(file=p.name,bytes=p.stat().st_size,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),width=612,height=285,stage=stage,biome='earth',kind='protected-derivative',seed=sp['seed']))
 frames.append(im)
(A/'earth-derivative-inventory.json').write_text(json.dumps(rows,indent=2))
sheet=Image.new('RGB',(1224,620),(8,14,20));draw=ImageDraw.Draw(sheet)
for stage,pixels in enumerate(frames):
 image=Image.fromarray((pixels*255).clip(0,255).astype('uint8')).resize((612,285))
 sheet.paste(image,((stage%2)*612,25+(stage//2)*310));draw.text(((stage%2)*612+5,(stage//2)*310+5),'EARTH RETAINED BASE' if not stage else 'EARTH COL'+str(stage),fill='white')
sheet.save(A/'earth-four-stages.png');print('Earth original retained, three terrain-conforming derivatives',site,flush=True)
