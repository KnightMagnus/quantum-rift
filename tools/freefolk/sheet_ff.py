"""Lineup sheet for the Freefolk and/or Unsworn hulls. Usage: sheet_ff.py <render dir> <out jpg> [freefolk|unsworn]"""
import os, sys, json
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
os.environ.setdefault('RIFT_SHIPS26', os.path.join(HERE, '../pkgtest/ships26'))
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import hulls_freefolk as F
R, OUTP = sys.argv[1], sys.argv[2]; ONLY = sys.argv[3] if len(sys.argv) > 3 else None
ids = {v['key']: k for k, v in json.load(open(os.path.join(HERE, 'ff_sprites.json'))).items()} if os.path.exists(os.path.join(HERE, 'ff_sprites.json')) else {}
FD = '/usr/share/fonts/truetype/dejavu/'
f = lambda s, b=False, m=False: ImageFont.truetype(FD + ('DejaVuSansMono-Bold.ttf' if m and b else 'DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf'), s)
INK = (230, 226, 214); DIM = (140, 138, 132); CELL = (21, 22, 25)
COLS, CW, CH, PAD = 5, 500, 470, 22
def section(rows): return 120 + rows * (CH + PAD)
ffr = 0 if ONLY == 'unsworn' else (len(F.FREEFOLK) + COLS - 1) // COLS
unr = 0 if ONLY == 'freefolk' else (len(F.UNSWORN) + COLS - 1) // COLS
W = PAD + COLS * (CW + PAD); H = 230 + (section(ffr) if ffr else 0) + (section(unr) if unr else 0)
S = Image.new('RGB', (W, H), (11, 12, 14)); d = ImageDraw.Draw(S)
g = Image.new('L', S.size, 0); ImageDraw.Draw(g).ellipse((-400, -600, W // 2 + 400, 500), fill=50)
S.paste(Image.new('RGB', S.size, (40, 110, 90)), (0, 0), g.filter(ImageFilter.GaussianBlur(160)))
d.text((PAD + 10, 40), {'freefolk': 'FREEFOLK', 'unsworn': 'UNSWORN'}.get(ONLY, 'FREEFOLK  ·  UNSWORN'), font=f(60, True, True), fill=INK)
d.text((PAD + 14, 122), ('Nine hulls' if ONLY == 'freefolk' else 'Six hulls' if ONLY == 'unsworn' else 'Fifteen hulls') + ' for Part II, rendered with the Quantum Rift ship generator (tools/ships26). Framed per panel, not to scale.', font=f(22), fill=DIM)

def fit(path, bw, bh):
    im = Image.open(path); im = im.crop(im.getbbox()); sc = min(bw / im.width, bh / im.height, 1.25)
    return im.resize((max(1, int(im.width * sc)), max(1, int(im.height * sc))), Image.LANCZOS)

def draw(y0, title, sub, acc, edge, items):
    d.text((PAD + 10, y0), title, font=f(40, True, True), fill=acc)
    d.text((PAD + 14, y0 + 56), sub, font=f(20), fill=DIM)
    for i, (key, name, role, fn) in enumerate(items):
        x, y = PAD + (i % COLS) * (CW + PAD), y0 + 110 + (i // COLS) * (CH + PAD)
        d.rounded_rectangle((x, y, x + CW, y + CH), 14, fill=CELL, outline=edge, width=2)
        im = fit(os.path.join(R, key + '_hero.png'), CW - 30, CH - 120)
        S.paste(im, (x + (CW - im.width) // 2, y + 16 + (CH - 120 - im.height) // 2), im)
        d.text((x + 18, y + CH - 86), name, font=f(30, True), fill=INK)
        d.text((x + 18, y + CH - 44), role + ('  ·  hull %s' % ids[key] if key in ids else ''), font=f(18), fill=DIM)

y = 230
if ffr: draw(y, 'FREEFOLK', 'Type 0 hulls rebuilt with Index parts. Civilians: repair, translation, archives, medicine and quiet passage. Unarmed.', (110, 200, 170), (40, 82, 70), F.FREEFOLK)
y += section(ffr) if ffr else 0
if unr: draw(y, 'UNSWORN', 'Refusers on covert routes. Low tech, stripped, unmarked and very fast. Commonhold is their floating command centre.', (196, 92, 80), (82, 44, 40), F.UNSWORN)
S.save(OUTP, quality=92); print(S.size)
