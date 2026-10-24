"""Render planetary scene families and context variants with connected colony stages.
Usage: python tools/rift_colony_landscapes.py OUTPUT [SCENE]. Stations are never rendered.
"""
import sys,os,math,json,copy,zlib,hashlib,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent.parent
OUTPUT=Path(sys.argv[1]).resolve() if len(sys.argv)>1 else ROOT/'landscape-output'
ONLY=sys.argv[2] if len(sys.argv)>2 else None
sys.argv=[sys.argv[0],str(OUTPUT)]
import rift_colony_geometry as G
import numpy as np
from PIL import Image,ImageDraw,ImageFilter
L=G.L
OUT=OUTPUT;OUT.mkdir(parents=True,exist_ok=True)
CACHE=OUT/'cache';CACHE.mkdir(parents=True,exist_ok=True)
ART=OUT/'evidence';ART.mkdir(parents=True,exist_ok=True)
CONTEXT={r['system']:r for r in json.loads((ROOT/'tools/landscape-context.json').read_text())}
WORLDS=json.loads((ROOT/'tools/landscape-legacy-worlds.json').read_text())
FAMILIES={
 'terran':['terran_wild1','terran_wild2','terran_city1','terran_city2'],
 'city':['city1','city2','city_harbor','city_terraces'],
 'jungle':['jungle1','jungle2','jungle_delta','jungle_highlands'],
 'ocean':['ocean1','ocean2','ocean_atolls','ocean_fjords'],
 'desert':['desert1','desert2','desert3','desert_salt'],
 'ice':['ice1','ice2','ice_fjords','ice_crags'],
 'lava':['lava1','lava2','lava_caldera','lava_obsidian'],
 'barren':['moon1','moon2','moon3','moon_chasm'],
 'gas':['gas1','gas2','gas_violet_clouds','gas_amber_storm'],
 'toxic':['toxic1','toxic2','toxic_marsh','toxic_spires'],
 'crystal':['crystal1','crystal2','crystal_basin','crystal_towers']}
CONFIG={}
for biome,names in FAMILIES.items():
 existing=[n for n in names if n in L.SCENES]
 for index,name in enumerate(names):
  sp=copy.deepcopy(L.SCENES[name if name in L.SCENES else existing[index%len(existing)]])
  if name not in L.SCENES:
   sp.update(scale=sp['scale']*(1.4 if index==2 else .68),amp=sp['amp']*(.6 if index==2 else 1.35),horizon=.43 if index==2 else .55,eye=10 if index==2 else 13)
   if biome in ('terran','jungle','desert','ice','barren','toxic','crystal'):
    sp['ground']='hills' if index==2 else ('craters' if biome=='barren' else 'mountains')
   if biome in ('ocean','toxic'):sp['wq']=.87 if index==2 else .45
   if biome=='desert' and index==3:sp.update(ground='hills',ramp=L.T((149,135,115),(203,192,164),(235,225,200)),amp=6,wq=.12,water_col=(116,123,110))
   if biome=='city':sp['structs']=L.SPRAWL(7600+index)
   if biome=='gas':
    sp['ramp']=L.T((70,56,100),(131,107,156),(205,185,215)) if index==2 else L.T((138,83,33),(206,140,66),(243,210,151))
    sp['sky_top']=(30,20,54) if index==2 else (77,45,25);sp['sky_hz']=(164,131,183) if index==2 else (224,176,113)
  sp.pop('planet',None);sp.pop('sun2',None);sp['sun']=(.24,.18);sp['light']=(-.5,.65,.55)
  CONFIG[name]=(biome,sp)
# Catalog-backed named scenes, not stations.
CONFIG['inalumen']=('city',copy.deepcopy(L.SCENES['inalumen']))
CONFIG['slag']=('lava',copy.deepcopy(L.SCENES['lava1']))
CONFIG['slag'][1].update(structs=[('foundry',-24,105,42),('foundry',38,160,30)])
CONFIG['nightjar_refuge']=('ice',copy.deepcopy(L.SCENES['ice1']))
CONFIG['nightjar_refuge'][1].update(sky_top=(0,0,3),sky_hz=(14,20,30),stars=True,aurora=False,sun_col=(0,0,0),fog=(25,35,48))
CONFIG['city_harbor'][1].update(ground='hills',amp=19,scale=42,wq=.42,water_col=(30,57,72),sky_top=(30,68,112),sky_hz=(186,162,138),fog=(155,156,158),fogd=370,stars=False,clouds=.4)
CONFIG['city_terraces'][1].update(ground='hills',amp=24,scale=32,horizon=.46,wq=.12,rock=(111,108,103))
CONFIG['gloam_remnant']=('barren',copy.deepcopy(L.SCENES['moon2']))
CONFIG['gloam_remnant'][1].update(structs=[('outpost',-18,100,25),('foundry',24,160,35)],ramp=L.T((42,41,44),(91,86,89),(132,120,115)))
NAMES={'gloam-remnant':'gloam_remnant','inalumen':'inalumen','slag':'slag','nightjar-refuge':'nightjar_refuge'}
MESH={stage:G.cluster(stage) for stage in (1,2,3)}
records=[];scene_audit=[];mapping=[]

def sky_for(sp,ctx,worldid):
 spec=copy.deepcopy(sp);spec.pop('planet',None);spec.pop('sun2',None)
 spec['sun_col']=(0,0,0) if worldid=='nightjar-refuge' or spec.get('sun_col')==(0,0,0) else (tuple(map(int,ctx['decor']['sun']['core'].split(','))) if ctx else spec.get('sun_col',(255,240,210)))
 rng=np.random.default_rng(spec['seed']);sky=L.make_sky(spec,rng)
 # Only expose faint real system nebula in low atmospheric opacity/night/airless view.
 dark=(sum(spec['sky_top'])<125 or spec['ground']=='craters')
 if ctx and dark and ctx['decor']['neb']:
  desc=ctx['decor']['neb'][0];path=ROOT/'client/assets/decor'/(desc['img']+'.webp')
  if path.exists():
   im=Image.open(path).convert('RGBA').resize((L.WW,L.HH),Image.Resampling.LANCZOS)
   a=np.asarray(im).astype(float)/255;weight=a[:,:,3:4]*.12
   sky=sky*(1-weight)+a[:,:,:3]*weight
 # Actual catalog neighbor moons use the exact existing planet selector asset.
 if ctx:
  neighbor=next((p for p in ctx['neighbors'] if p['id']!=worldid and p['kind']=='moon' and p.get('rendered')),None)
  if neighbor:
   path=ROOT/'client/assets/planets'/(neighbor['rendered']['id']+'.webp')
   if path.exists():
    im=Image.open(path).convert('RGBA').resize((96,96),Image.Resampling.LANCZOS);a=np.asarray(im).astype(float)/255
    x0=int(L.WW*.63);y0=40;weight=a[:,:,3:4]*(.75 if dark else .3)
    sky[y0:y0+96,x0:x0+96]=sky[y0:y0+96,x0:x0+96]*(1-weight)+a[:,:,:3]*weight
 # Distant procedural background giant is valid scene metadata, not labeled as a local moon.
 giant=next((p for p in (ctx['decor']['bgp'] if ctx else []) if (p.get('rendered') or {}).get('rings')),None)
 if giant and dark:
  # Exact chosen rendered asset, never an arbitrary ringed replacement.
  path=ROOT/'client/assets/planets'/(giant['rendered']['id']+'.webp')
  if path.exists():
   im=Image.open(path).convert('RGBA').resize((220,220),Image.Resampling.LANCZOS)
   a=np.asarray(im).astype(float)/255;x0=int(L.WW*.72);y0=25
   weight=a[:,:,3:4]*.55;sky[y0:y0+220,x0:x0+220]=sky[y0:y0+220,x0:x0+220]*(1-weight)+a[:,:,:3]*weight
 return np.clip(sky,0,2)

def save_set(name,frames,metadata):
 files=[]
 for stage,pixels in enumerate(frames):
  stem='l_'+name+('_col'+str(stage) if stage else '')
  path=OUT/(stem+'.jpg');im=Image.fromarray((np.clip(pixels,0,1)*255).astype('uint8')).resize((612,285),Image.Resampling.LANCZOS);im.save(path,quality=87)
  entry=dict(file=path.name,bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest(),width=612,height=285,stage=stage,**metadata);records.append(entry);files.append(entry)
 return files

def generate(name,biome,config):
 global records,scene_audit,mapping
 records=[];scene_audit=[];mapping=[]
 start=time.monotonic();sp=copy.deepcopy(config);sp['seed']=zlib.crc32(name.encode())%100000
 sp.pop('planet',None);sp.pop('sun2',None);sp['sun']=(.24,.18);sp['light']=(-.5,.65,.55)
 sky=sky_for(sp,None,None);rng=np.random.default_rng(sp['seed']);L.make_sky(sp,rng);raw,rawdepth=G.make_terrain(sp,sky,rng)
 hf=sp['_hf'];choices=[]
 for sx in (-18,-10,0,10,18):
  for sz in (30,36,42,48,54):
   gx,gz=np.meshgrid(np.linspace(sx-10,sx+10,7),np.linspace(sz-9,sz+9,7));hs=hf(gx,gz);water=sp.get('water',-1e6)
   level=max(float(np.median(hs)),float(water)+.9)
   px=(L.WW/2+gx*sp['_f']/gz).astype(int);py=(sp['_hz']+(sp['_cam']-level)*sp['_f']/gz).astype(int)
   on=(px>=0)&(px<L.WW)&(py>L.HH*.45)&(py<L.HH*.92)
   sampled=rawdepth[np.clip(py,0,L.HH-1),np.clip(px,0,L.WW-1)]
   visible=np.mean(on&(sampled>=gz-1.5));submerged=float(np.mean(hs<water+.4)) if water>-1e5 else 0
   choices.append((np.std(hs)+(1-visible)*35+submerged*24+max(0,level)*.02,sx,sz,level))
 _,sx,sz,level=min(choices);sp['_site']=(sx,sz,level)
 rng=np.random.default_rng(sp['seed']);L.make_sky(sp,rng);base,depth=G.make_terrain(sp,sky,rng)
 # Gas slab rests above cloud tops instead of being sliced through cloud terrain.
 terrainlevel=level
 if biome=='gas':level+=1.1
 render_site=(sx,sz,level)
 # Real foreground props and far settlements share terrain mesh depth.
 props=[];rng=np.random.default_rng(sp['seed']+901)
 for index in range(65):
  wz=float(rng.uniform(16,180));wx=float(rng.uniform(-.85,.85)*wz)
  if abs(wx-sx)<14 and abs(wz-sz)<12:continue
  ground=float(sp['_hf'](np.array([wx]),np.array([wz]))[0])
  if ground<=sp.get('water',-1e6):continue
  x=(wx-sx)/5;y=(wz-sz)/5;z=(ground-level)/5;s=float(rng.uniform(.08,.20))
  if biome in ('terran','jungle'):
   s*=1.4 if biome=='jungle' else 1
   props += [G.RS.zcyl((x,y,z+s*.75),s*.09,s*.75,G.RS.RUST,ring=6),G.sphere((x,y,z+s*1.8),s*.65,G.leaf,squash=1.5)]
  elif biome=='crystal':
   props += [G.loft([(z,y,x,s,s,1),(z+s*2,y,x+s*.25,s*.6,s*.6,1),(z+s*3,y,x+s*.4,.001,.001,1)],G.RS.CRYS,ring=6,axis='z')]
  elif biome not in ('gas','ocean','city'):props += [G.sphere((x,y,z+s*.25),s,G.RS.ROCK,squash=.45)]
 G.raster(props,base,depth,sp,render_site)
 if biome=='gas':
  support=[G.block((0,-.2,-.09),(2.2,1.8,.09),G.RS.HULL)]
  for x,y in [(-1.8,-1.6),(1.8,-1.6),(-1.8,1.3),(1.8,1.3)]:support.append(G.RS.zcyl((x,y,-.55),.07,.5,G.RS.DARK,ring=10))
  G.raster(support,base,depth,sp,render_site)
 if name in ('inalumen','slag','gloam_remnant'):
  far=[]
  for kind,wx,wz,width in sp.get('structs',[]):
   wz=max(wz,95);ground=float(sp['_hf'](np.array([float(wx)]),np.array([float(wz)]))[0]);factor=width/14
   for mesh in L.BUILD[kind](sp['seed']+int(wx)):
    mesh.tf(lambda v,wx=wx,wz=wz,ground=ground,factor=factor:v*factor+np.array([(wx-sx)/5,(wz-sz)/5,(ground-level)/5]));far.append(mesh)
  G.raster(far,base,depth,sp,render_site)
 # Far architecture enriches city/industrial scenes without entering growth footprint.
 if biome=='city':
  far=[]
  for i in range(10):
   wz=110+(i//5)*60;wx=(i%5-2)*40;ground=float(sp['_hf'](np.array([float(wx)]),np.array([float(wz)]))[0])
   for m in L.city_cluster(sp['seed']+i,n=9,spread=1.1,domes=0,spire=i%3==0):
    m.tf(lambda v,wx=wx,wz=wz,ground=ground:v*np.array([2.,2.,2.])+np.array([(wx-sx)/5,(wz-sz)/5,(ground-level)/5]));far.append(m)
  G.raster(far,base,depth,sp,render_site)
 contact=[]
 for mx,my,radius in G.SITES:
  a=np.linspace(0,2*math.pi,40);xs=sx+5*(mx+radius*np.cos(a));zs=sz+5*(my+radius*np.sin(a))
  contact.append(float(np.max(np.abs(sp['_hf'](xs,zs)-terrainlevel))))
 assert max(contact)<1e-7,(name,contact)
 frames=[base.copy()];audits=[];lastarea=0
 for stage in (1,2,3):
  image=base.copy();d=depth.copy();inside,shell,ribs=MESH[stage]
  G.raster(inside,image,d,sp,render_site);G.raster(shell,image,d.copy(),sp,render_site,True);G.raster(ribs,image,d,sp,render_site)
  changed=np.max(abs(image-base),axis=2)>1e-9;y,x=np.where(changed)
  assert len(y)>lastarea,(name,stage,'visible growth');lastarea=len(y)
  assert not changed[:120].any(),(name,'sky changed')
  audits.append(dict(stage=stage,changedPixels=len(y),bounds=[int(x.min()),int(y.min()),int(x.max()+1),int(y.max()+1)]));frames.append(image)
 # Native representative images retained for review and exact immutable-stage comparisons.
 for stage,frame in enumerate(frames):
  Image.fromarray((np.clip(frame,0,1)*255).astype('uint8')).save(ART/(name+('_col'+str(stage) if stage else '')+'.png'))
 save_set(name,frames,dict(biome=biome,seed=sp['seed'],kind='family'))
 related=[w for w in WORLDS if (NAMES.get(w['id'])==name or (w['id'] not in NAMES and w['scene']==name and w['id']!='earth'))]
 # Context variants keep identical terrain/colony position. Only actual sky metadata differs.
 skymask=~np.isfinite(depth)
 watermask=np.zeros(depth.shape,bool);reflection=None
 if 'water' in sp:
  yy,xx=np.mgrid[:L.HH,:L.WW];zz=np.where(np.isfinite(depth),depth,1e9)
  expected=sp['_hz']+(sp['_cam']-sp['water'])*sp['_f']/zz
  watermask=np.isfinite(depth)&(abs(yy-expected)<1.3)
  wy,wx=np.where(watermask);wz=zz[watermask]
  mir=np.clip((2*sp['_hz']-wy).astype(int),0,L.HH-1)
  rip=(np.sin(wy*.9+wx*.05+wz*.3)*2).astype(int);rx=np.clip(wx+rip,0,L.WW-1)
  factor=(.35+.5*(1-np.clip((wy-sp['_hz'])/(L.HH-sp['_hz']),0,1))**2)*np.exp(-wz/sp.get('fogd',320))
  reflection=(mir,rx,factor)
 for world in related:
  ctx=CONTEXT[world['system']];contextsky=sky_for(sp,ctx,world['id']);variant=[]
  for frame in frames:
   image=frame.copy();image[skymask]=contextsky[skymask]
   if reflection is not None:
    mir,rx,factor=reflection
    unchanged=np.max(abs(frame-base),axis=2)<1e-9;valid=unchanged[watermask]
    selected=image[watermask];delta=(contextsky[mir,rx]-sky[mir,rx])*factor[:,None]
    selected[valid]+=delta[valid];image[watermask]=selected
   variant.append(image)
  key=name+'__'+world['id'].replace(':','_')
  if not any(m['key']==key for m in mapping):save_set(key,variant,dict(biome=biome,seed=sp['seed'],kind='context',system=world['system'],base=name))
  mapping.append(dict(world=world['id'],key=key,base=name,system=world['system'],sun=ctx['decor']['sun']['core'],nebula=ctx['decor']['neb'],backgroundWorlds=ctx['decor']['bgp']))
 scene_audit.append(dict(name=name,biome=biome,seed=sp['seed'],site=sp['_site'],groundResidual=max(contact),stages=audits,seconds=time.monotonic()-start))
 print(name,'files',len(records),'worlds',len(mapping),'seconds',round(time.monotonic()-start,2),flush=True)
 return records,scene_audit,mapping

def work(task):
 name,biome,sp=task
 return generate(name,biome,sp)

if __name__=='__main__':
 from concurrent.futures import ProcessPoolExecutor
 allrecords=[];allaudits=[];allmapping=[]
 with ProcessPoolExecutor(max_workers=2) as pool:
  for r,a,m in pool.map(work,[(name,biome,sp) for name,(biome,sp) in CONFIG.items() if ONLY is None or name==ONLY]):
   allrecords.extend(r);allaudits.extend(a);allmapping.extend(m)
   (ART/'inventory.json').write_text(json.dumps(allrecords,indent=2));(ART/'scene-audit.json').write_text(json.dumps(allaudits,indent=2));(ART/'world-mapping.json').write_text(json.dumps(allmapping,indent=2))
 print('FINISHED',len(CONFIG),'base scenes',len(allrecords),'JPEGs',len(allmapping),'context worlds',flush=True)
