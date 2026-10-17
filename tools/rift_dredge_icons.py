"""Small code-native industrial UI icons, no external model or source raster."""
from pathlib import Path
from PIL import Image, ImageDraw
out=Path(__file__).resolve().parents[1]/'client/assets/icons'
for kind in ['blueprint','plasma','part']:
 im=Image.new('RGBA',(64,64));d=ImageDraw.Draw(im)
 if kind=='blueprint':
  d.rounded_rectangle((3,3,60,60),7,fill='#102735',outline='#8fe4ed',width=2)
  for x in [14,27,40]:d.rectangle((x,13,x+10,36),outline='#9ee9f0',width=2)
  d.line([(11,34),(8,48),(56,48),(53,34)],fill='#9ee9f0',width=3)
 elif kind=='plasma':
  d.ellipse((13,13,51,51),fill='#ffad40',outline='#fff1b0',width=3)
  for a,b in [((32,2),(32,10)),((32,54),(32,62)),((2,32),(10,32)),((54,32),(62,32))]:d.line([a,b],fill='#ffc362',width=3)
  d.polygon([(34,17),(25,33),(34,33),(29,47),(41,29),(32,29)],fill='#fff3d1')
 else:
  d.rounded_rectangle((9,15,55,49),5,fill='#694b38',outline='#c6c7bf',width=3)
  for x in [17,29,41]:d.rectangle((x,20,x+6,44),fill='#303638')
  d.line((10,50,54,50),fill='#ffb34b',width=3)
 im.save(out/f'dredge-{kind}.png')
