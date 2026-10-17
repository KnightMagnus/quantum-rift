"""The full Quantum Rift roster (2.6, drawn from the re-rendered sprite sheets) as one wide chart: families down the side, roles across the top."""
import json, os
from PIL import Image, ImageDraw, ImageFont
import numpy as np
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RQ = os.path.join(ROOT, 'quantum-rift/client/assets')
RAW = json.load(open(os.path.join(ROOT, 'ships.json')))
F = '/usr/share/fonts/truetype/dejavu/'
ships = {s['id']: s for s in RAW if s['kind'] != 'armada'}   # 2.6: the Armada escort hulls are retired; the Que'vari endgame ship is shown
ROLES = ['FIGHTER', 'SCOUT & COURIER', 'FREIGHTER', 'LINER & YACHT', 'INTERCEPTOR', 'GUNBOAT & FRIGATE', 'DESTROYER & CRUISER', 'CARRIER', 'DREADNOUGHT & FLAGSHIP']
FAM = [('QUANTUM', (130, 190, 255), lambda s: s['cat'] == 'Quantum' and s['faction'] != 'umbral' ),
       ('MK II · ENEMY', (242, 211, 138), lambda s: s['cat'] == 'Mk II'), ('MK III · ENEMY', (90, 240, 220), lambda s: s['cat'] == 'Mk III'),
       ('WINGMATES', (255, 160, 120), lambda s: s['kind'] == 'wingmate'),
       ("QUE'VARI", (170, 215, 255), lambda s: s['cat'] == "Que'vari"), ('SPECIALISTS', (255, 205, 90), lambda s: s['cat'] == 'Specialist'), ('UMBRAL', (190, 90, 150), lambda s: s['faction'] == 'umbral'),
       ('VASHARI', (150, 220, 70), lambda s: s['cat'] == 'Vashari'), ('KORRUND', (240, 120, 50), lambda s: s['cat'] == 'Korrund'),
       ('YLITH', (230, 130, 250), lambda s: s['cat'] == 'Ylith'), ('SARN', (220, 170, 90), lambda s: s['cat'] == 'Sarn'),
       ('THALASSI', (80, 210, 215), lambda s: s['cat'] == 'Thalassi'), ('EXOTIC', (140, 230, 255), lambda s: s['cat'] == 'Exotic')]
ROLE_OF = {  # explicit roles where a subtitle does not say it plainly
    715: 7, 718: 0, 737: 0, 765: 0, 790: 0, 798: 0, 703: 1, 705: 1, 707: 1, 735: 1, 775: 1, 780: 1, 799: 1, 770: 2, 706: 2, 710: 2, 709: 3, 776: 3,
    783: 3, 820: 0, 821: 1, 822: 2, 823: 5, 824: 2, 825: 0, 826: 1, 827: 3, 828: 6, 829: 6, 805: 2, 806: 5, 807: 4, 808: 5, 809: 6, 810: 2, 811: 1, 812: 6, 813: 1, 814: 4, 784: 8, 714: 3, 736: 8, 744: 8, 717: 8, 751: 1, 752: 4, 753: 5, 754: 5, 755: 4, 756: 7, 757: 5, 758: 6, 759: 7,
    760: 4, 761: 4, 762: 5, 763: 6, 764: 8, 785: 8, 786: 8, 787: 8, 711: 5, 738: 1, 739: 2, 740: 5, 741: 5, 742: 6, 743: 7, 771: 5, 796: 4}
KEYS = [(0, ('fighter', 'drone', 'dart')), (1, ('scout', 'courier', 'explorer', 'surveyor')), (2, ('freighter', 'hauler', 'trader', 'tender', 'miner')),
        (3, ('liner', 'yacht')), (4, ('interceptor', 'raider', 'striker')), (5, ('gunboat', 'frigate', 'corvette')), (6, ('destroyer', 'cruiser')),
        (7, ('carrier',)), (8, ('dreadnought', 'flagship'))]
BASE_OF_MK = {}
def role(s):
    if s['id'] in ROLE_OF: return ROLE_OF[s['id']]
    nm = s['name'].replace(' Mk III', '').replace(' Mk II', '')
    for b in ships.values():
        if b['name'] == nm and b['id'] != s['id'] and b['id'] in ROLE_OF: return ROLE_OF[b['id']]
    t = (s.get('sub') or '').lower() + ' ' + s['name'].lower()
    for r, ks in KEYS:
        if any(k in t for k in ks): return r
    return 5
cells = {}
for fi, (fam, col, pred) in enumerate(FAM):
    for s in ships.values():
        if pred(s): cells.setdefault((fi, role(s)), []).append(s)
for v in cells.values(): v.sort(key=lambda s: s['cost'])
LW, CW, RH = 190, 400, 230   # label column, role column width, row height
PER = 4   # at most four ships side by side in a cell; more wrap onto a second line
LINES = [max([-(-len(cells.get((fi, ri), [])) // PER) for ri in range(len(ROLES))] + [1]) for fi in range(len(FAM))]
TOPS = [sum(LINES[:fi]) * RH for fi in range(len(FAM))]
W = LW + CW * len(ROLES) + 40; H = 230 + RH * sum(LINES) + 70
img = Image.new('RGB', (W, H), (6, 7, 14)); d = ImageDraw.Draw(img)
rng = np.random.default_rng(9)
for _ in range(5000):
    x, y = rng.integers(0, W), rng.integers(0, H); b = int(255 * rng.uniform(0.2, 1) ** 2); d.point((int(x), int(y)), (b, b, b))
d.text((W // 2, 30), 'QUANTUM RIFT  ·  THE FULL ROSTER  ·  2.6', font=ImageFont.truetype(F + 'DejaVuSerif-Bold.ttf', 64), fill=(215, 190, 255), anchor='mt')
d.text((W // 2, 112), f'{sum(len(v) for v in cells.values())} ships by family and role, cheapest first in each cell · price in credits · cargo hold in tons', font=ImageFont.truetype(F + 'DejaVuSans.ttf', 26), fill=(230, 200, 140), anchor='mt')
fr = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 22); ff = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 24)
fn = ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 14); fp = ImageFont.truetype(F + 'DejaVuSans.ttf', 13)
Y0 = 190
for ri, r in enumerate(ROLES):
    x = LW + ri * CW
    d.rectangle((x + 4, Y0 - 16, x + CW - 4, Y0 + 22), fill=(18, 20, 34)); d.text((x + CW // 2, Y0 + 3), r, font=fr, fill=(220, 220, 235), anchor='mm')
SPR = json.load(open(os.path.join(ROOT, 'ships26.json')))
def sprite(h):   # 2.6: one frame of the new sheet, nose toward the lower left like the shipyard pictures, trimmed to the ship
    m = SPR[str(h)]; fs = m['fs']; k = 21; sh = Image.open(os.path.join(RQ, 'ships', f'{h}.webp')).convert('RGBA')
    f = sh.crop(((k % m['cols']) * fs, (k // m['cols']) * fs, (k % m['cols'] + 1) * fs, (k // m['cols'] + 1) * fs)); b = f.getbbox()
    return f.crop(b) if b else f
def cr(n): return f'{n / 1e6:.2f}'.rstrip('0').rstrip('.') + 'M' if n >= 1e6 else f'{n // 1000}k'
for fi, (fam, col, pred) in enumerate(FAM):
    y0 = Y0 + 40 + TOPS[fi]; RHf = RH * LINES[fi]
    d.rectangle((20, y0 + 4, W - 20, y0 + RHf - 4), fill=(10, 11, 20) if fi % 2 else (14, 15, 26))
    d.rectangle((20, y0 + 4, 26, y0 + RHf - 4), fill=col)
    d.text((40, y0 + RHf // 2), fam, font=ff, fill=col, anchor='lm')
    for ri in range(len(ROLES)):
        full = cells.get((fi, ri), [])
        if not full: continue
        nl = -(-len(full) // PER); per = -(-len(full) // nl)
        off = (LINES[fi] - nl) * RH // 2   # centre a shorter cell vertically in a tall row
        for li in range(nl):
            lst = full[li * per:(li + 1) * per]; y = y0 + off + li * RH
            x0 = LW + ri * CW; n = len(lst); cw = (CW - 10) / n; sz = int(min(150, cw - 6, RH - 70))
            for k, s in enumerate(lst):
                cx = int(x0 + 5 + cw * (k + 0.5))
                im = sprite(s['id']); want = min(sz, max(64, SPR[str(s['id'])]['fs'] * 1.25)); k = want / max(im.width, im.height)   # relative sizes, but small ships stay visible
                im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS)
                img.paste(im, (cx - im.width // 2, y + 12 + (sz - im.height) // 2 + max(0, (150 - sz) // 2)), im)
                name = s['name'].replace('Wingmate ', '').replace(' Mk III', ' III').replace(' Mk II', ' II')
                f2 = fn if d.textlength(name, font=fn) <= cw - 4 else ImageFont.truetype(F + 'DejaVuSans-Bold.ttf', 11)
                while d.textlength(name, font=f2) > cw - 4 and len(name) > 6: name = name[:-2]
                d.text((cx, y + RH - 50), name, font=f2, fill=(235, 235, 240), anchor='mt')
                lab = ('hire' if s['kind'] in ('wingmate', 'armada') else 'enemy' if s['kind'] in ('mk2', 'mk3') else cr(s['cost'])) + '  ·  ' + (f"{s['cargo']} t" if s['cargo'] else 'no hold')
                d.text((cx, y + RH - 30), lab, font=fp if d.textlength(lab, font=fp) <= cw - 2 else ImageFont.truetype(F + 'DejaVuSans.ttf', 10), fill=(242, 211, 138) if s['cargo'] else (255, 140, 120), anchor='mt')
d.text((W // 2, H - 40), 'Specialists are built from blueprints found in play. Wingmates, Exotics and the Constitution come from your Personal Station. Mk II and Mk III refits are no longer sold: rogue kingpins fly them in Armada contracts. Ships with no hold need a Cargo Compression outfit.', font=ImageFont.truetype(F + 'DejaVuSans.ttf', 20), fill=(160, 165, 185), anchor='mt')
img.save(os.path.join(ROOT, 'out', 'Quantum Rift - Full Roster 2.6.png')); print(img.size)
