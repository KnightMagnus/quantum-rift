"""Rebuild original 32px cockpit cursors with Pillow (build time only)."""
from pathlib import Path
from PIL import Image, ImageDraw
OUT = Path(__file__).resolve().parents[1] / 'client/assets/cursors'
S = 4
INK, STEEL, CYAN = '#080e15', '#dce8ed', '#83dbec'
def render(name):
    im = Image.new('RGBA', (128,128))
    d = ImageDraw.Draw(im)
    def line(points, color=STEEL, width=1.5):
        xy = [(round(x*S), round(y*S)) for x,y in points]
        d.line(xy, fill=INK, width=round((width+2)*S), joint='curve')
        d.line(xy, fill=color, width=round(width*S), joint='curve')
    def poly(points, color=STEEL):
        d.polygon([(round(x*S),round(y*S)) for x,y in points], fill=color, outline=INK, width=2*S)
    def ring(box, color=STEEL, width=1.5):
        d.ellipse(tuple(round(v*S) for v in box), outline=INK, width=round((width+2)*S))
        d.ellipse(tuple(round((v+(1 if i<2 else -1))*S) for i,v in enumerate(box)), outline=color, width=round(width*S))
    if name in ('arrow','pointer'):
        poly([(2,2),(23,18),(14,19),(18,28),(13,30),(9,21),(3,27)])
        line([(5,8),(5,20)],CYAN if name=='pointer' else '#ffffff',1)
        if name=='pointer':
            line([(22,4),(22,10)],CYAN,2)
            line([(19,7),(25,7)],CYAN,2)
    elif name in ('friendly','neutral','hostile'):
        color={'friendly':CYAN,'neutral':'#efd18a','hostile':'#ff8177'}[name]
        if name=='hostile':
            poly([(16,3),(29,16),(16,29),(3,16)],color)
            poly([(16,7),(25,16),(16,25),(7,16)],INK)
            for p in [[(16,2),(16,10)],[(16,22),(16,30)],[(2,16),(10,16)],[(22,16),(30,16)]]: line(p,color)
        else:
            for x,y,dx,dy in [(4,4,1,1),(28,4,-1,1),(4,28,1,-1),(28,28,-1,-1)]:
                line([(x,y+6*dy),(x,y),(x+6*dx,y)],color,2)
            if name=='friendly': line([(11,16),(15,20),(22,12)],color)
        ring((14,14,18,18),STEEL,1)
    elif name in ('aim','plot'):
        color=STEEL if name=='aim' else '#efd18a'
        ring((6,6,26,26),color)
        for p in [[(16,2),(16,10)],[(16,22),(16,30)],[(2,16),(10,16)],[(22,16),(30,16)]]: line(p,color)
        ring((14,14,18,18),color,1)
    elif name=='land':
        line([(5,19),(5,27),(27,27),(27,19)],CYAN,2)
        line([(16,3),(16,18)],STEEL,2)
        line([(10,12),(16,18),(22,12)],STEEL,2)
    elif name=='resize':
        line([(3,16),(29,16)],STEEL,2)
        line([(9,10),(3,16),(9,22)],STEEL,2)
        line([(23,10),(29,16),(23,22)],STEEL,2)
        line([(16,6),(16,26)],CYAN,2)
    elif name=='busy':
        ring((3,3,29,29),'#647984',2)
        d.arc((16,16,112,112),220,335,fill=CYAN,width=12)
        line([(16,9),(16,16),(21,19)],STEEL,1.5)
    return im.resize((32,32),Image.Resampling.LANCZOS)
names=['arrow','pointer','hostile','friendly','neutral','aim','land','plot','resize','busy']
for name in names: render(name).save(OUT/(name+'.png'))
preview=Image.new('RGB',(720,140),'#101820')
d=ImageDraw.Draw(preview)
for i,name in enumerate(names):
    for y,bg in [(0,'#101820'),(70,'#d3dce0')]:
        d.rectangle((i*72,y,i*72+71,y+69),fill=bg)
        preview.paste(render(name),(i*72+20,y+8),render(name))
        d.text((i*72+4,y+47),name,fill=STEEL if y==0 else INK)
preview.save(OUT/'_preview.png')
