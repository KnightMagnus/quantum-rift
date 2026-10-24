"""Connected colony mesh, terrain conformance and shared depth-tested rasterization."""
import sys,math
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).parent))
import rift_landscapes as L
from rift_noise import Perlin3,fbm,ridged,smooth,lerp,ramp
from rift_render3d import render,mat,loft,block,sphere,Mesh,shade
import rift_stations as RS
WW,HH=L.WW,L.HH
metal=mat((.72,.83,.86),metal=.25,rough=.4,panel=.4)
blue=mat((.57,.85,.96),metal=.35,rough=.12,panel=0,ambient=.7)
wall=mat((.72,.78,.74),metal=.2,rough=.5,panel=1,windows=(-10,10,(.6,.9,1),8))
leaf=mat((.2,.51,.24),metal=0,rough=.8,ambient=.4)
garden=mat((.27,.43,.22),metal=0,rough=.9,panel=0)
soil=mat((.35,.34,.29),metal=0,rough=.9,panel=.1)
SITES=[(0,0,.75),(-1.25,.2,.59),(1.18,.32,.6),(-.65,-1,.55),(.67,-1.07,.54)]

def tube(a,b,r=.018,m=metal):
 a=np.array(a,float);b=np.array(b,float);v=b-a;v/=np.linalg.norm(v);s=np.cross(v,[0,0,1])
 if np.linalg.norm(s)<.001:s=np.array([1.,0,0])
 s/=np.linalg.norm(s);t=np.cross(v,s)
 vertices=[p+r*(math.cos(theta)*s+math.sin(theta)*t) for p in (a,b) for theta in np.linspace(0,2*math.pi,6,endpoint=False)]
 faces=[]
 for i in range(6):j=(i+1)%6;faces.extend([(i,j,j+6),(i,j+6,i+6)])
 return Mesh(vertices,faces,m)

def cluster(stage):
 inside=[];shells=[];ribs=[];count=[0,1,3,5][stage]
 for i,(x,y,r) in enumerate(SITES[:count]):
  inside += [RS.zcyl((x,y,.014),r,.014,metal,ring=36),RS.zcyl((x,y,.035),r*.94,.012,garden,ring=36)]
  for dx,dy,h in [(-.25,-.15,.19),(.18,.12,.26),(.21,-.29,.15)]:
   inside.append(block((x+dx*r,y+dy*r,.05+h*r/2),(.12*r,.1*r,h*r/2),wall))
  for dx,dy in [(-.48,.25),(.43,.38),(-.3,-.5),(.5,-.4)]:
   inside += [RS.zcyl((x+dx*r,y+dy*r,.1*r),.018*r,.1*r,RS.RUST,ring=6),sphere((x+dx*r,y+dy*r,.2*r),.10*r,leaf,squash=1.15)]
  sections=[(.035+.44*r*math.sin(t),y,x,max(.001,r*math.cos(t)),max(.001,r*math.cos(t)),2) for t in np.linspace(0,math.pi/2,14)]
  shells.append(loft(sections,blue,ring=36,axis='z'))
  for az in np.linspace(0,2*math.pi,8,endpoint=False):
   pts=[(x+r*math.cos(t)*math.cos(az),y+r*math.cos(t)*math.sin(az),.035+.44*r*math.sin(t)) for t in np.linspace(0,math.pi/2,10)]
   ribs += [tube(a,b,.005) for a,b in zip(pts,pts[1:])]
  if i:
   ax,ay,_=SITES[0] if i<3 else SITES[i-2]
   inside += [tube((ax,ay,.055),(x,y,.055),.045,metal),tube((ax,ay-.06,.025),(x,y-.06,.025),.012,RS.DARK)]
 return inside,shells,ribs

def make_terrain(sp, sky, r):
    P = Perlin3(sp['seed']); P2 = Perlin3(sp['seed'] + 5)
    amp, sc, kind = sp['amp'], sp['scale'], sp['ground']
    def raw_hf(x, z):
        u, v = x / sc, z / sc
        if kind == 'dunes': return amp * (0.5 * fbm(P, u, v, 0.3 + 0 * u, 4) + 0.35 * np.abs(np.sin(u * 3 + v * 1.3 + fbm(P2, u * 0.5, v * 0.5, 0 * u, 3) * 4)))
        if kind == 'clouds': return amp * (fbm(P, u * 0.7, v * 0.7, 0.3 + 0 * u, 5) + 0.3 * fbm(P2, u * 3, v * 3, 0 * u, 3))
        if kind == 'city': return amp * 0.15 * fbm(P, u, v, 0 * u, 3)
        if kind == 'craters':
            h = amp * 0.6 * fbm(P, u, v, 0 * u, 6)
            for cx, cz, cr in sp['_cr']: d = np.hypot(x - cx, z - cz) / cr; h = h + amp * cr / sc * 1.0 * (np.where(d < 1, d * d - 1, 0) + 0.45 * np.exp(-((d - 1) / 0.2) ** 2))
            return h
        m = ridged(P, u, v, 0.37 + 0 * u, 6); b = fbm(P2, u * 0.4, v * 0.4, 0 * u, 4)
        if kind == 'hills': return amp * (0.9 * (fbm(P, u * 0.8, v * 0.8, 0.37 + 0 * u, 6) + 0.5) + 0.25 * m * m)
        dist = 0.35 + 0.65 * smooth(0.3, 2.5, z / sc)   # the mountains rise in the distance; the foreground is lower
        return amp * (m * m * sp.get('ridge', 1.0) * dist + b * 0.6)
    def hf(x,z):
        original=raw_hf(x,z)
        if '_site' not in sp:return original
        sx,sz,level=sp['_site']
        distance=np.sqrt(((x-sx)/12)**2+((z-sz)/10)**2)
        weight=1-smooth(.90,1.35,distance)
        return original*(1-weight)+level*weight
    if kind == 'craters': sp['_cr'] = [(r.normal(0, 150), r.uniform(70, 500), r.uniform(6, 28)) for _ in range(70)]
    if sp.get('wq') is not None:   # water level at a height quantile of the visible land
        zz, xx_ = np.meshgrid(np.geomspace(15, 400, 40), np.linspace(-1, 1, 60)); hs = hf(xx_ * zz * 0.9, zz); sp['water'] = water_ = float(np.quantile(hs, sp['wq']))
    hz = sp['horizon'] * HH; f = WW * 0.55; eye = sp.get('eye', 8.0); cam = float(hf(np.array([0.0]), np.array([4.0]))[0]) + eye
    zfar = sp.get('far', 700); zs = np.concatenate([np.linspace(1.5, 30, 220), np.geomspace(30, zfar, 520)[1:]])
    img = sky.copy(); ybuf = np.full(WW, HH, float); depth = np.full((HH, WW), np.inf)
    cols = (np.arange(WW) - WW / 2) / f
    L = np.array(sp.get('light', (-0.5, 0.65, 0.55))); L /= np.linalg.norm(L)
    fogc = np.array(sp.get('fog', sp['sky_hz'])) / 255; water = sp.get('water'); wcol = np.array(sp.get('water_col', (30, 60, 90))) / 255
    gramp = sp['ramp']
    for z in zs:
        x = cols * z; hgt = hf(x, np.full_like(x, z)); isw = np.zeros_like(x, bool)
        if water is not None: isw = hgt < water; hgt = np.where(isw, water, hgt)
        y = hz + (cam - hgt) * f / z
        e = 0.6 * max(1, z / 60); hx = (hf(x + e, np.full_like(x, z)) - hf(x - e, np.full_like(x, z))) / (2 * e); hzz = (hf(x, np.full_like(x, z + e)) - hf(x, np.full_like(x, z - e))) / (2 * e)
        n = np.stack([-hx, np.ones_like(hx), -hzz], 1); n /= np.linalg.norm(n, axis=1, keepdims=True)
        lam = np.clip(n @ np.array([L[0], L[1], -L[2]]), 0, 1)
        slope = 1 - n[:, 1]; hn = (hgt - sp.get('h0', 0)) / (amp * 1.2)
        base = ramp(np.clip(hn + (fbm(P2, x / 7, z / 7, 0.9 + 0 * x, 3)) * 0.12, 0, 1), gramp) / 255
        if sp.get('rock'): base = lerp(base, np.array(sp['rock']) / 255, smooth(0.25, 0.55, slope))
        if sp.get('snowline') is not None: base = lerp(base, np.array((235, 240, 248)) / 255, smooth(sp['snowline'], sp['snowline'] + 0.12, hn) * (1 - smooth(0.35, 0.6, slope)))
        c = base * (sp.get('amb', 0.28) + 0.85 * lam)[:, None]
        if sp.get('lava'):
            glow = smooth(0.8, 0.9, ridged(P2, x / 20, z / 20, 0.5 + 0 * x, 3)) * (hn < 0.35)
            if '_site' in sp:
                sx,sz,_=sp['_site'];distance=np.sqrt(((x-sx)/12)**2+((z-sz)/10)**2)
                glow *= smooth(.90,1.35,distance) # Same immutable cooled-rock shelf for all colony stages.
            c = c * (1 - glow[:, None]) + np.array([1.4, 0.55, 0.12]) * glow[:, None]
        if sp.get('lights') and kind == 'city':
            lt = (Perlin3(99)(x * 0.9, z * 0.9, 0 * x) > 0.42) * (hn < 0.3) * (r.random(x.shape) < 0.3)
            c = np.where(lt[:, None], np.array([1.0, 0.85, 0.55]), c)
        fog = float(1 - np.exp(-z / sp.get('fogd', 320))); c = c * (1 - fog) + fogc * fog
        yi = np.clip(y, 0, HH).astype(int)
        for col in np.where(yi < ybuf)[0]:
            y0, y1 = yi[col], int(ybuf[col])
            if isw[col]:   # water: the sky mirrored, darkened, with ripples
                rows = np.arange(y0, y1); mir = np.clip((2 * hz - rows).astype(int), 0, HH - 1); rip = (np.sin(rows * 0.9 + col * 0.05 + z * 0.3) * 2).astype(int)
                refl = img[mir, np.clip(col + rip, 0, WW - 1)] if False else sky[mir, np.clip(col + rip, 0, WW - 1)]
                fr = 0.35 + 0.5 * (1 - np.clip((rows - hz) / (HH - hz), 0, 1)) ** 2
                img[y0:y1, col] = (wcol * (1 - fr[:, None]) + refl * fr[:, None]) * (1 - fog) + fogc * fog
            else: img[y0:y1, col] = c[col]
            depth[y0:y1, col] = z; ybuf[col] = y0
    sp['_cam'] = cam; sp['_f'] = f; sp['_hz'] = hz; sp['_hf'] = hf
    return img, depth

def raster(meshes,img,depth,sp,site,transparent=False):
 sx,sz,level=site;scale=5.0
 for mesh in meshes:
  vertices=mesh.V.copy();world=vertices*scale
  world[:,0]+=sx;world[:,1]+=sz;world[:,2]+=level
  z=world[:,1];px=L.WW/2+world[:,0]*sp['_f']/z;py=sp['_hz']+(sp['_cam']-world[:,2])*sp['_f']/z
  for face in mesh.F:
   ids=np.asarray(face);x=px[ids];y=py[ids]
   left=max(0,int(np.floor(x.min())));right=min(L.WW-1,int(np.ceil(x.max())));top=max(0,int(np.floor(y.min())));bottom=min(L.HH-1,int(np.ceil(y.max())))
   if left>right or top>bottom:continue
   denominator=(y[1]-y[2])*(x[0]-x[2])+(x[2]-x[1])*(y[0]-y[2])
   if abs(denominator)<1e-8:continue
   yy,xx=np.mgrid[top:bottom+1,left:right+1];xx=xx+.5;yy=yy+.5
   a=((y[1]-y[2])*(xx-x[2])+(x[2]-x[1])*(yy-y[2]))/denominator
   b=((y[2]-y[0])*(xx-x[2])+(x[0]-x[2])*(yy-y[2]))/denominator;c=1-a-b
   hit=(a>=0)&(b>=0)&(c>=0)
   inv=a/z[ids[0]]+b/z[ids[1]]+c/z[ids[2]];distance=1/np.maximum(inv,1e-8)
   view=depth[top:bottom+1,left:right+1];hit &= distance<=view+.055
   if not np.any(hit):continue
   weights=np.stack((a,b,c),-1)/z[ids];weights/=np.maximum(weights.sum(-1,keepdims=True),1e-8)
   positions=weights[hit]@vertices[ids];normals=weights[hit]@mesh.N[ids];normals/=np.maximum(np.linalg.norm(normals,axis=1,keepdims=True),1e-8)
   # Existing mesh material shader, normal orientation transformed to camera frame.
   camera_normals=np.column_stack((normals[:,0],normals[:,2],-normals[:,1]))
   color,_=shade(positions,normals,camera_normals,np.full(len(positions),mesh.m),12)
   fog=1-np.exp(-distance[hit]/sp.get('fogd',320));fogcolor=np.array(sp.get('fog',sp['sky_hz']))/255
   color=color*(1-fog[:,None])+fogcolor*fog[:,None]
   region=img[top:bottom+1,left:right+1]
   if transparent:
    alpha=.12+.15*(1-np.clip(abs(camera_normals[:,2]),0,1))**2
    color=color*.35+np.array([.48,.78,.91])*.65
    region[hit]=region[hit]*(1-alpha[:,None])+color*alpha[:,None]
   else:
    region[hit]=color;view[hit]=distance[hit]
 return img,depth
