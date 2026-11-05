"""Lineage sheet: each Type 0 prototype beside the Concord hull it became. Usage: sheet_proto.py <render dir> <out png>"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('RIFT_SHIPS26', os.path.join(os.path.dirname(os.path.abspath(__file__)), '../ships26'))
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import hulls_proto as H
R, OUTP = sys.argv[1], sys.argv[2]
F = '/usr/share/fonts/truetype/dejavu/'
f = lambda s, b=False, m=False: ImageFont.truetype(F + ('DejaVuSansMono-Bold.ttf' if m and b else 'DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf'), s)
INK = (230, 224, 210); ACC = (222, 128, 58); DIM = (138, 136, 132); EDGE = (70, 56, 44); CELL = (21, 22, 25)
COLS, CW, CH, PAD, TOP = 4, 620, 430, 22, 240
rows = (len(H.PROTO) + COLS - 1) // COLS
W = PAD + COLS * (CW + PAD); HH = TOP + rows * (CH + PAD) + 10
S = Image.new('RGB', (W, HH), (11, 12, 14)); d = ImageDraw.Draw(S)
g = Image.new('L', S.size, 0); ImageDraw.Draw(g).ellipse((W // 2 - 1200, -700, W // 2 + 1200, 420), fill=55)
S.paste(Image.new('RGB', S.size, (130, 70, 20)), (0, 0), g.filter(ImageFilter.GaussianBlur(150)))
d.text((PAD + 10, 38), 'THE OLD PATTERNS  ·  TYPE 0', font=f(58, True, True), fill=INK)
d.text((PAD + 14, 116), 'The pre-Rift prototypes of every Concord yard hull, still built by the colonies left in the Milky Way', font=f(26), fill=ACC)
d.text((PAD + 14, 160), 'Large: the Type 0 prototype, the common ship of Part II.  Small: the Concord hull it became in the Rift.  Rendered with the ship generator (tools/ships26); framed per panel, not to scale.', font=f(19), fill=DIM)

def fit(path, bw, bh, up):
    im = Image.open(path); im = im.crop(im.getbbox())
    sc = min(bw / im.width, bh / im.height, up)
    return im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)

for i, (key, name, src, sid, role, fn) in enumerate(H.PROTO):
    x, y = PAD + (i % COLS) * (CW + PAD), TOP + (i // COLS) * (CH + PAD)
    d.rounded_rectangle((x, y, x + CW, y + CH), 14, fill=CELL, outline=EDGE, width=2)
    p = fit(os.path.join(R, key + '_hero.png'), 410, 330, 1.2)
    S.paste(p, (x + 12 + (410 - p.width) // 2, y + 18 + (330 - p.height) // 2), p)
    o = fit(os.path.join(R, 'concord_' + src + '_hero.png'), 170, 150, 1.0)
    ox, oy = x + CW - 186, y + 60
    d.rounded_rectangle((ox - 6, oy - 30, ox + 176, oy + 160), 10, outline=(48, 46, 44), width=1)
    d.text((ox + 2, oy - 24), 'became', font=f(15), fill=DIM)
    S.paste(o, (ox + (170 - o.width) // 2, oy + (150 - o.height) // 2), o)
    d.text((x + 18, y + CH - 74), name, font=f(27, True), fill=INK)
    d.text((x + 18, y + CH - 38), '%s  ·  ancestor of hull %d' % (role, sid), font=f(17), fill=DIM)
S.save(OUTP, quality=92)
print(S.size)
