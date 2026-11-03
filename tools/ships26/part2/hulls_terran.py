"""Confederation of Sol fleet: eighteen hulls in the Iron Vow's materials and colours.
Revision 2: the wedge hulls move away from stepped daggers toward crescent deltas, forked prows and teardrop
citadels (after the Sickle sketch), and guns are fewer and heavier. Half wedges, half blocky armoured fortresses.
Rampart is the transformer: a closed travel form and an open siege form.
Built on the Quantum Rift ship generator (tools/ships26). +Y is the bow, +Z is up."""
import os, sys, math
sys.path.insert(0, os.environ['RIFT_SHIPS26'])
import numpy as np
from render2 import mat, loft, sphere, block, wing, fin, pair
from hulls5 import rod, xf, mv, rotm
from hulls2 import engine, light, greebles, LRED, LGREEN

# Iron Vow palette
ARMOR = mat((.15, .155, .16), metal=.72, panel=1.5, grime=1.3)
DECK = mat((.19, .195, .2), metal=.7, panel=1.7, grime=1.4)
BLACK = mat((.045, .047, .05), metal=.6, panel=1.2, grime=1.2)
BROWN = mat((.25, .145, .085), metal=.55, panel=1.1, grime=1.2)
RED = mat((.34, .055, .037), metal=.5, panel=.9, grime=1.2)
STEEL = mat((.26, .265, .27), metal=.85, rough=.33, panel=.8)
GLASS = mat((.07, .12, .13), metal=.65, glass=True, rough=.15)
WIN = mat((.17, .175, .18), metal=.7, panel=1.4, grime=1.2, windows=(-1, 1, (1.0, .62, .3), 30))
EXH = mat((.7, .19, .025), emissive=(1, .28, .035), panel=0)
AMBER = mat((.6, .25, .03), emissive=(.7, .25, .04), panel=0)


# ------------------------------------------------------------------ parts
def wedge(nose, tail, w, h, z=0.0, m=ARMOR, sq=1.35, n=6, h0=.3, x=0.0):
    """A triangular hull: zero width at the nose, full width at the tail, a flattened lozenge section."""
    s = []
    for i in range(n + 1):
        t = i / n
        s.append((nose + (tail - nose) * t, x, z, max(.006, w * t), max(.006, h * (h0 + (1 - h0) * t)), sq))
    s.append((tail - .02, x, z, w * .93, h * .9, sq))
    return loft(s, m, ring=16)


def width_at(y, nose, tail, w):
    return w * min(1, max(0, (nose - y) / (nose - tail)))


def terraces(nose, tail, w, z0, levels, m=ARMOR, m2=DECK, rise=.045):
    """Stepped decks rising toward the stern, each a smaller wedge set further back."""
    out = []
    for k in range(levels):
        f = (k + 1) / (levels + 1)
        nk = nose - (nose - tail) * f * .85
        out.append(wedge(nk, tail + .02, w * (1 - f * .55) * (1 - f * .2), rise, z=z0 + rise * (k + .6), m=m if k % 2 == 0 else m2, sq=4, n=3, h0=1))
    return out


def turret(x, y, z, s=1.0, length=.36, base=RED):
    """The Iron Vow's twin gun turret, scaled."""
    m = [block((x, y, z), (.105 * s, .115 * s, .06 * s), base),
         block((x, y + .025 * s, z + .065 * s), (.085 * s, .085 * s, .05 * s), ARMOR)]
    for dx in (-.045 * s, .045 * s):
        m.append(loft([(y + .04 * s, x + dx, z + .08 * s, .024 * s, .024 * s, 2), (y + length * s, x + dx, z + .08 * s, .018 * s, .018 * s, 2)], STEEL, ring=8))
        m.append(block((x + dx, y + (length + .005) * s, z + .08 * s), (.014 * s, .008 * s, .014 * s), BLACK))
    return m


def turrets_pair(x, y, z, s=1.0, length=.36):
    return turret(x, y, z, s, length) + turret(-x, y, z, s, length)


def drives(xs, y, z, r, extra=None):
    M, G = [], []
    for x in xs:
        n, g = engine(x, y, z, r, EXH, BLACK)
        M += n; G += g
    return M, G


def bridge(y, z, w, h=.05, m=ARMOR):
    """A citadel bridge: a block with a band of amber-lit windows and a glass strip."""
    return [block((0, y, z), (w, w * .7, h), m), block((0, y, z + h + .02), (w * .8, w * .5, .02), WIN),
            block((0, y + w * .5, z + h + .02), (w * .78, .012, .016), GLASS),
            block((w * .4, y - w * .1, z + h + .08), (.012, .012, .06), STEEL)]


def nav(x, y, z, r=.03):
    return [light(x, y, z, LGREEN, r), light(-x, y, z, LRED, r)]


def rail(x, y0, y1, z, r, m=STEEL):
    return [loft([(y0, x, z, r, r, 2), (y1, x, z, r * .8, r * .8, 2)], m, ring=10), block((x, y1 + .005, z), (r * .55, .008, r * .55), BLACK)]


def plate(c, s, m=ARMOR, ry=0.0, rz=0.0, sq=6):
    b = block((0, 0, 0), s, m, sq=sq)
    if ry: b = xf(b, rotm('y', ry))
    if rz: b = xf(b, rotm('z', rz))
    return mv(b, *c)


def zig(seed, n, region, z, m=STEEL, size=(.022, .035, .012)):
    return greebles(seed, n, region, m, size=size, zfn=lambda x, y: z)


# ================================================================== 1 FIGHTERS
def flint():
    """Fighter, wedge: a flat arrowhead with two cannons, cockpit buried in the spine."""
    M = [wedge(.95, -.7, .55, .09, sq=1.3), wedge(.9, -.66, .58, .03, z=-.012, m=RED, sq=1.2, n=3, h0=1),
         wedge(.42, -.62, .15, .07, z=.05, m=DECK, sq=3, n=3), block((0, .22, .095), (.045, .1, .028), GLASS)]
    M += pair(block((.5, -.6, .0), (.05, .1, .035), RED)) + pair(fin(.3, -.48, .16, .2, .08, .1, .012, ARMOR, z0=.03))
    for x in (.17, -.17): M += rail(x, -.15, .82, .02, .022)
    E, G = drives((.11, -.11), -.72, .02, .085)
    return M + E, G, nav(.53, -.63, .02), 48


# ================================================================== 2 SCOUT / COURIER
def gauge():
    """Scout, fortress: a blocky survey hull carrying a forward sensor frame and twin masts."""
    M = [block((0, -.05, 0), (.17, .55, .1), ARMOR), block((0, -.1, .11), (.12, .35, .04), DECK), block((0, .38, .08), (.09, .08, .03), GLASS)]
    M += rail(0, .45, .95, 0, .025) + [sphere((0, .92, 0), .045, RED), block((0, .62, 0), (.05, .06, .05), BLACK)]
    M += pair(plate((.2, .62, 0), (.012, .14, .08), STEEL, rz=-.35)) + pair(rod((.08, .5, 0), (.17, .6, 0), .012, STEEL))
    M += [rod((.06, -.3, .14), (.06, -.3, .45), .012, STEEL), rod((-.06, -.25, .14), (-.06, -.25, .36), .012, STEEL),
          sphere((.06, -.3, .46), .025, RED), sphere((-.06, -.25, .37), .02, RED)]
    M += pair(block((.24, -.3, -.02), (.07, .2, .07), BROWN))
    E, G = drives((.08, -.08), -.62, 0, .08)
    return M + E, G, nav(.3, -.3, .03) + [light(0, .75, .19, AMBER, .025)], 56


# ================================================================== 3 INTERCEPTORS
def hatchet():
    """Interceptor, wedge: a spear nose with swept blade wings and four drives packed at the tail."""
    M = [wedge(1.0, -.55, .26, .1, sq=1.4), block((0, .25, .08), (.04, .12, .03), GLASS)]
    blade = loft([(.2, .06, 0, .03, .03, 4), (-.15, .3, 0, .08, .025, 4), (-.55, .62, -.01, .09, .02, 4), (-.68, .66, -.01, .05, .015, 4)], ARMOR, ring=12)
    M += pair(blade) + pair(block((.6, -.6, 0), (.03, .1, .03), RED)) + pair(fin(.22, -.42, .18, .22, .08, .12, .012, RED, z0=.04))
    for x in (.08, -.08): M += rail(x, .2, 1.02, -.04, .015)
    E, G = drives((.07, -.07, .2, -.2), -.6, 0, .065)
    return M + E, G, nav(.64, -.66, 0), 52


def hound():
    """Interceptor, fortress: a short brick body bolted between four oversized drive cans."""
    M = [block((0, .1, 0), (.15, .45, .1), ARMOR), plate((0, .58, 0), (.17, .04, .11), RED), block((0, .3, .11), (.08, .1, .03), GLASS)]
    for x in (.24, -.24):
        for z in (.07, -.07):
            M.append(loft([(-.6, x, z, .075, .075, 3), (.15, x, z, .085, .085, 3), (.25, x, z, .05, .05, 3)], DECK if z > 0 else BLACK, ring=12))
    M += pair(block((.16, -.1, 0), (.04, .3, .14), BROWN))
    for x in (.12, -.12): M += rail(x, .5, .85, -.05, .02)
    E, G = drives((.24, -.24), -.62, .07, .07)
    E2, G2 = drives((.24, -.24), -.62, -.07, .07)
    return M + E + E2, G + G2, nav(.32, .2, 0), 52


# ================================================================== 4 FREIGHTERS
def ox():
    """Freighter, fortress: a spine with container stacks, a command block forward and a drive block aft."""
    M = [block((0, 0, 0), (.06, .8, .05), STEEL), block((0, .7, .02), (.16, .14, .1), ARMOR), block((0, .76, .1), (.12, .06, .04), WIN), block((0, .82, .09), (.11, .015, .03), GLASS)]
    cols = [ARMOR, BROWN, RED, DECK, BROWN, ARMOR, RED, DECK]
    k = 0
    for y in (.42, .16, -.1, -.36):
        for x in (.16, -.16):
            M.append(block((x, y, 0), (.095, .115, .085), cols[k % 8])); k += 1
            M.append(block((x, y, .17), (.09, .11, .08), cols[(k + 3) % 8])); k += 1
    M += [block((0, -.66, 0), (.2, .14, .11), ARMOR), block((0, -.66, .12), (.14, .1, .03), DECK)]
    E, G = drives((.12, -.12, .0), -.82, 0, .085)
    return M + E, G, nav(.27, -.6, .05), 100


# ================================================================== 5 LINER / YACHT
def homeward():
    """Liner, fortress: a long passenger block with lit window decks and an observation gallery at the bow."""
    M = [block((0, 0, 0), (.2, .78, .12), WIN), block((0, -.05, .15), (.15, .6, .05), WIN), block((0, -.1, .22), (.1, .4, .03), DECK)]
    M += [loft([(.78, 0, .02, .19, .11, 6), (.95, 0, .02, .12, .07, 3)], GLASS, ring=16)]
    M += pair(block((.21, 0, -.02), (.012, .7, .025), RED)) + pair(block((.26, -.45, -.04), (.05, .25, .06), BROWN))
    M += [block((0, -.7, .1), (.12, .1, .05), ARMOR)]
    E, G = drives((.13, .045, -.045, -.13), -.85, 0, .055)
    return M + E, G, nav(.3, -.5, 0) + [light(0, .97, .05, AMBER, .02)], 110


# ================================================================== 6 GUNBOAT / FRIGATE
def rampart(t=0):
    """Frigate, transformer. Travel form: a closed armoured box. Siege form: the flank slabs fold down into gun
    platforms, two more turrets rise, the siege gun runs forward and anchor spades bite outward."""
    M = [block((0, 0, 0), (.18, .62, .12), ARMOR), block((0, -.05, .13), (.13, .45, .04), DECK),
         loft([(.6, 0, 0, .18, .12, 6), (.78, 0, -.01, .1, .07, 4)], RED, ring=14)]
    M += bridge(-.42, .15, .1, .04)
    gun = .95 if t == 0 else 1.25
    M += rail(0, .3, gun, .0, .035) + [block((0, .55, .0), (.06, .12, .05), BLACK)]
    G, L = [], nav(.3, -.3, .05)
    if t == 0:
        for s in (1, -1):
            M.append(plate((s * .23, -.05, 0), (.045, .56, .15), BROWN))
            M.append(plate((s * .275, -.05, 0), (.01, .5, .12), RED))
        M += turret(0, .15, .17, .8)
        E, G = drives((.1, -.1), -.68, 0, .09)
        M += E
    else:
        for s in (1, -1):
            M.append(plate((s * .47, -.05, -.02), (.045, .56, .2), BROWN, ry=math.pi / 2))
            M.append(plate((s * .47, -.05, -.06), (.01, .5, .16), RED, ry=math.pi / 2))
            M += turret(s * .47, .12, .03, .8) + turret(s * .47, -.25, .03, .8)
            M += [plate((s * .72, .3, -.06), (.025, .1, .06), STEEL, rz=-s * .5), plate((s * .72, -.4, -.04), (.02, .08, .05), STEEL, rz=s * .5)]
            M += [rod((s * .18, -.3, 0), (s * .36, -.3, -.02), .018, STEEL), rod((s * .18, .2, 0), (s * .36, .2, -.02), .018, STEEL)]
        M += turret(0, .15, .22, .95)
        E, _ = drives((.1, -.1), -.68, 0, .09)   # drives cold while anchored
        M += E
        L += [light(.62, .1, -.02, AMBER, .025), light(-.62, .1, -.02, AMBER, .025)]
    return M, G, L, 120


def rampart_siege(): return rampart(1)


def picket():
    """Frigate, wedge: a small triangular warship with two stepped decks, three turrets and a citadel bridge."""
    nose, tail, w = .95, -.85, .46
    M = [wedge(nose, tail, w, .1), wedge(nose - .03, tail + .03, w * 1.03, .03, z=-.04, m=RED, sq=1.2, n=3, h0=1),
         wedge(nose - .1, tail + .05, w * .8, .08, z=-.05, m=DECK, sq=1.4)]
    M += terraces(nose, tail, w * .7, .05, 2)
    M += turret(0, .35, .08, .7) + turrets_pair(.17, -.1, .09, .65)
    M += bridge(-.62, .17, .11, .05)
    E, G = drives((.24, 0, -.24), -.88, 0, .08)
    return M + E, G, nav(.44, -.82, 0), 120


# ================================================================== 7 DESTROYER / CRUISER
def bulwark():
    """Cruiser, fortress: three stacked armoured decks, gun sponsons down each flank and a ram prow."""
    M = [block((0, 0, 0), (.36, .74, .1), ARMOR), block((0, -.05, .15), (.27, .56, .06), DECK), block((0, -.15, .26), (.18, .38, .06), ARMOR)]
    M += [loft([(.72, 0, 0, .36, .1, 8), (.86, 0, -.02, .3, .08, 8), (.97, 0, -.03, .16, .05, 8)], ARMOR, ring=16),
          block((0, .8, .09), (.3, .07, .015), RED), block((0, .96, -.03), (.14, .015, .03), BLACK)]
    M += bridge(-.42, .33, .12, .05)
    for s in (1, -1):
        for y in (.4, 0, -.4):
            M += [block((s * .42, y, -.01), (.07, .12, .07), BROWN)] + turret(s * .44, y, .06, .5)
    M += turret(0, .45, .2, .7) + turret(0, .2, .32, .7) + turrets_pair(.15, -.55, .2, .55)
    M += pair(block((.26, -.72, .06), (.09, .1, .14), BLACK))
    M += zig(14, 18, ((-.3, .3), (-.6, .5)), .11)
    E, G = drives((.26, .09, -.09, -.26), -.84, .03, .085)
    return M + E, G, nav(.5, -.4, .05), 160


# ================================================================== 8 CARRIERS
def spearhead():
    """Carrier, wedge: a forked triangular hull with the hangar mouth between the prongs."""
    nose, tail, w = 1.0, -.9, .6
    M = []
    for s in (1, -1):
        M.append(loft([(nose, s * .2, 0, .01, .02, 1.4), (.4, s * .24, 0, .1, .06, 1.4), (-.3, s * .28, 0, .2, .1, 1.4), (tail, s * .3, 0, .3, .11, 1.4)], ARMOR, ring=16))
        M.append(loft([(nose - .05, s * .21, -.035, .015, .015, 1.3), (tail + .03, s * .31, -.035, .31, .02, 1.3)], RED, ring=12))
        M += turret(s * .3, -.1, .1, .5) + turret(s * .33, -.45, .11, .5)
    M += [block((0, -.4, .02), (.25, .5, .1), DECK), block((0, .1, -.02), (.12, .02, .08), AMBER)]
    M += terraces(-.05, tail, .5, .1, 2)
    M += bridge(-.7, .2, .13, .05)
    G = [block((0, .11, -.02), (.11, .015, .07), AMBER, layer=1)]
    L = [light(0, y, -.09, AMBER, .015) for y in (.3, .5, .7)]
    E, G2 = drives((.42, .21, -.21, -.42), -.93, 0, .08)
    return M + E, G + G2, L + nav(.62, -.88, 0), 180


# ================================================================== 9 DREADNOUGHTS
def citadel():
    """Dreadnought, fortress: a flying castle. Corner gun towers, a central keep, a gate prow and six drive towers."""
    M = [block((0, 0, 0), (.44, .8, .12), ARMOR), block((0, 0, -.14), (.36, .7, .05), DECK), block((0, -.05, .16), (.34, .62, .05), DECK)]
    M += [loft([(.78, 0, 0, .44, .12, 6), (.95, 0, -.02, .3, .09, 6)], ARMOR, ring=16), block((0, .93, -.01), (.16, .03, .07), BLACK),
          block((0, .945, .07), (.2, .02, .02), RED), block((0, .945, -.08), (.2, .02, .02), RED)]
    for sx in (1, -1):
        for sy in (1, -1):
            x, y = sx * .4, sy * .6 + (.1 if sy > 0 else 0)
            M += [block((x, y, .15), (.09, .09, .12), BROWN if sy > 0 else ARMOR), block((x, y, .28), (.1, .1, .02), RED)] + turret(x, y - .02, .31, .55)
    M += [block((0, -.15, .3), (.17, .26, .1), ARMOR), block((0, -.15, .41), (.12, .18, .03), WIN)] + bridge(-.15, .44, .1, .04)
    M += turret(0, .35, .22, .65) + turret(0, .15, .22, .65) + turrets_pair(.22, -.05, .22, .5) + turrets_pair(.22, -.35, .22, .5)
    for s in (1, -1):
        for y in (.3, -.05, -.4):
            M += turret(s * .47, y, -.02, .42)
    for x in (.34, .2, .07, -.07, -.2, -.34):
        M.append(block((x, -.84, .02), (.06, .08, .1), BLACK))
    M += zig(5, 26, ((-.32, .32), (-.55, .55)), .21)
    E, G = drives((.34, .2, .07, -.07, -.2, -.34), -.93, .02, .055)
    return M + E, G, nav(.5, -.5, .1) + [light(.4, .7, .41, AMBER, .02), light(-.4, .7, .41, AMBER, .02)], 220


# ================================================================== revision 2: crescent family and new fortresses
def crescent(nose, tail, span, h, p=2.1, z=0.0, m=ARMOR, scale=1.0, sq=1.5, n=16):
    """A crescent delta: a needle bow widening along concave leading edges to the full span at a straight stern."""
    secs = []
    for i in range(n + 1):
        t = i / n
        y = nose - (nose - tail) * (t ** 0.8)
        s_ = min(1, max(0, (nose - y) / (nose - tail)))
        secs.append((y, 0, z, max(.006, span * s_ ** p * scale), max(.006, h * (0.25 + 0.75 * min(1, t * 1.6))), sq))
    secs.append((tail - .015, 0, z, span * scale * .96, h * .85, sq))
    return loft(secs, m, ring=28)


def teardrop(cy, length, w, h, z, m, sq=2.0, n=12):
    """Pointed toward the bow, round at the stern."""
    secs = []
    for i in range(n + 1):
        t = i / n
        k = math.sqrt(max(0.0, 1 - t ** 5))
        secs.append((cy + length / 2 - length * t, 0, z, max(w * t ** .85 * k, .004), max(h * t ** .6 * k, .004), sq))
    return loft(secs, m, ring=22)


def citadel_bands(cy, length, w, z0, bands, top=WIN):
    """Swept armour bands stepping up to a lit teardrop, all pointing at the bow."""
    out = []
    for k in range(bands):
        f = k / bands
        out.append(teardrop(cy - length * f * .2, length * (1 - f * .45), w * (1 - f * .5), .05, z0 + .045 * k, DECK if k % 2 == 0 else ARMOR, sq=2.4))
    out.append(teardrop(cy - length * .25, length * .42, w * .32, .045, z0 + .045 * bands, top, sq=2))
    return out


def horn(x0, y0, s, r=.04, reach=.25):
    """A hooked wingtip pod curling forward and outward."""
    return loft([(y0 - .05, x0, 0, r * .85, r * .75, 2), (y0 + reach * .25, x0 + s * r * .5, 0, r * 1.1, r * .9, 2),
                 (y0 + reach * .7, x0 + s * r * 1.2, .005, r * .75, r * .6, 2), (y0 + reach, x0 + s * r * 1.7, .01, r * .25, r * .25, 2)], ARMOR, ring=14)


def battlements(xs, y, z, w=.06, l=.085, h=.065, cap=RED):
    """Square drive housings standing proud of a straight stern, each with a cap plate."""
    M = []
    for x in xs:
        M += [block((x, y - .03, z + .01), (w, l, h), ARMOR), block((x, y - .02, z + .01 + h + .012), (w * .82, l * .7, .012), cap)]
    E, G = drives(xs, y - .03 - l - .04, z + .01, w * .75)
    return M + E, G


def canted_fins(x, y, height, croot, ctip, sweep, cant=.45, m=ARMOR, z0=-.05):
    M = []
    for s in (1, -1):
        f = fin(0, y, -height, croot, ctip, sweep, .014, m, z0=z0)
        M.append(mv(xf(f, rotm('y', s * cant)), s * x, 0, 0))
    return M


# ================================================================== 1 FIGHTERS (fortress)
def rivet():
    """Fighter, fortress: an armoured brick with two blunt forward tines and a single heavy cannon between them."""
    M = [block((0, -.05, 0), (.15, .45, .11), ARMOR), block((0, -.15, .12), (.1, .25, .03), DECK), block((0, .12, .1), (.07, .09, .035), GLASS)]
    for s in (1, -1):
        M.append(loft([(.25, s * .14, 0, .07, .09, 5), (.55, s * .13, -.005, .06, .075, 5), (.78, s * .11, -.01, .035, .05, 4), (.84, s * .1, -.01, .018, .03, 3)], ARMOR, ring=14))
        M.append(block((s * .14, .45, .085), (.05, .14, .012), RED))
    M += rail(0, .3, .74, -.01, .04) + [block((0, .3, -.01), (.06, .06, .06), BLACK)]
    M += pair(plate((.2, -.2, 0), (.04, .26, .09), BROWN))
    B, G = battlements((.08, -.08), -.48, 0, w=.065, l=.07, h=.07)
    return M + B, G, nav(.24, -.3, .05), 48


# ================================================================== 2 COURIER (wedge)
def writ():
    """Courier, wedge: a narrow blade with two long horns sweeping forward from the stern like a tuning fork, the
    pilot under a glass teardrop on the spine. Unarmed and fast."""
    nose, tail, span = .95, -.55, .34
    M = [crescent(nose, tail, span, .07, p=1.4), crescent(nose, tail, span, .02, p=1.4, z=-.028, m=RED, scale=1.04, sq=1.2, n=10)]
    for s_ in (1, -1):
        M.append(loft([(tail - .02, s_ * span * .95, 0, .04, .035, 2), (tail + .25, s_ * (span + .05), 0, .035, .03, 2),
                       (tail + .55, s_ * (span + .02), .005, .022, .02, 2), (tail + .78, s_ * (span - .06), .01, .008, .008, 2)], ARMOR, ring=12))
    M += [teardrop(.0, .7, .1, .045, .05, ARMOR, sq=2.4), teardrop(.05, .42, .055, .035, .085, GLASS, sq=2)]
    B, G = battlements((0, .13, -.13), tail, .0, w=.04, l=.05, h=.04)
    E2, G2 = drives((span * .95, -span * .95), tail - .07, 0, .025)
    return M + B + E2, G + G2, nav(span + .04, tail + .5, .02) + [light(0, .95, .02, AMBER, .02)], 56


# ================================================================== 4 ORE FREIGHTER (wedge)
def ingot():
    """Ore freighter, wedge: two long prongs carrying open cradles of cast ingots between them, a crescent stern block with drives. Unarmed."""
    M = []
    for s in (1, -1):
        M.append(loft([(.95, s * .26, 0, .015, .02, 1.6), (.6, s * .27, 0, .06, .06, 1.6), (0, s * .29, 0, .1, .085, 1.6), (-.5, s * .31, 0, .12, .09, 1.6)], ARMOR, ring=16))
        M.append(loft([(.9, s * .265, -.04, .015, .012, 1.3), (-.5, s * .315, -.04, .125, .015, 1.3)], RED, ring=12))
    for y in (.5, .17, -.16):   # open cradles, each carrying a stack of cast ingots
        M += [block((0, y, -.07), (.24, .1, .02), STEEL)] + pair(rod((.24, y + .08, -.07), (.2, y + .08, .07), .014, STEEL)) + pair(rod((.24, y - .08, -.07), (.2, y - .08, .07), .014, STEEL))
        for k, (dx, dz) in enumerate(((-.1, -.03), (0, -.03), (.1, -.03), (-.05, .02), (.05, .02))):
            M.append(block((dx, y, dz), (.045, .085, .022), BROWN if k % 2 else RED, sq=4))
    M += [crescent(-.3, -.78, .46, .1, p=1.3, m=ARMOR, sq=1.8, n=8), teardrop(-.58, .3, .16, .05, .08, WIN, sq=2.2)]
    B, G = battlements((.3, .1, -.1, -.3), -.78, 0, w=.055, l=.06, h=.06)
    return M + B, G, nav(.42, -.7, 0), 100


# ================================================================== 5 YACHT (wedge)
def pennant():
    """Yacht, wedge: a long teardrop body under a glass canopy, a thin crescent wing arcing round its stern. Unarmed."""
    M = [teardrop(.05, 1.6, .16, .1, 0, ARMOR, sq=2.4), teardrop(.12, 1.0, .1, .05, .06, GLASS, sq=2.2),
         teardrop(.05, 1.5, .165, .02, -.04, RED, sq=2)]
    for s in (1, -1):
        secs = []
        for i in range(9):
            t = i / 8; x = .1 + .55 * t
            y = -.42 - .22 * math.sin(t * math.pi * .8) + .3 * t ** 3
            secs.append((s * x, y, -.01 + .03 * t, .1 * (1 - .7 * t) + .012, .02 * (1 - .5 * t) + .004, 2.2))
        w = loft(secs, ARMOR, ring=14, axis='x')
        M.append(w)
        M.append(sphere((s * .66, -.11, .02), .025, ARMOR))
    E, G = drives((.06, -.06), -.78, 0, .05)
    return M + E, G, nav(.66, -.11, .03), 72


# ================================================================== 7 CRUISER (wedge): the Sickle
NOSE_S, TAIL_S, SPAN_S = 1.0, -0.62, 0.96
def sickle():
    """Cruiser, wedge: a crescent delta with hooked wingtips, a straight stern lined with seven drive housings and a
    raised teardrop citadel inside swept armour bands. Two canted ventral fins. Drawn from the Sickle sketch."""
    M = [crescent(NOSE_S, TAIL_S, SPAN_S, .11), crescent(NOSE_S, TAIL_S, SPAN_S, .03, z=-.035, m=RED, scale=1.015, sq=1.2, n=10),
         crescent(NOSE_S, TAIL_S, SPAN_S, .08, z=-.06, m=DECK, scale=.82, sq=1.4, n=10)]
    M += pair(horn(SPAN_S * .97, TAIL_S + .02, 1, .04, .25))
    M += [teardrop(-.02, .95, .42, .05, .07, DECK, sq=2.4), teardrop(-.06, .78, .32, .055, .11, ARMOR, sq=2.4),
          teardrop(-.1, .58, .22, .06, .155, DECK, sq=2.2), teardrop(-.14, .38, .13, .05, .2, WIN, sq=2)]
    M += [block((0, -.2, .245), (.07, .07, .02), GLASS)] + bridge(-.34, .2, .1, .045)
    xs = [0, .15, -.15, .31, -.31, .48, -.48]
    for x in xs:
        M += [block((x, TAIL_S - .03, .02), (.06, .085, .065), ARMOR), block((x, TAIL_S - .02, .09), (.05, .06, .012), RED),
              block((x, TAIL_S + .07, .02), (.045, .03, .045), DECK)]
    E, G = drives(xs, TAIL_S - .13, .02, .045)
    E2, G2 = drives((SPAN_S * .97, -SPAN_S * .97), TAIL_S - .09, 0, .03)
    M += turrets_pair(.24, -.05, .06, .42, .24) + turrets_pair(.46, -.4, .05, .4, .22)
    M += rail(0, .3, 1.04, .03, .022) + [block((0, .45, .035), (.03, .12, .025), BLACK)]
    for s in (1, -1):
        f = fin(0, -.05, -.24, .34, .14, .2, .014, ARMOR, z0=-.06)
        M.append(mv(xf(f, rotm('y', s * .45)), s * .3, 0, 0))
        M.append(mv(xf(block((0, -.18, -.27), (.014, .06, .012), RED), rotm('y', s * .45)), s * .3, 0, 0))
    L = nav(SPAN_S * .98, TAIL_S + .05, .03) + [light(0, 1.0, .03, AMBER, .015)] + [light(x, TAIL_S + .02, .08, AMBER, .012) for x in (.15, -.15, .48, -.48)]
    return M + E + E2, G + G2, L, 180


# ================================================================== 8 CARRIER (fortress)
def anvil():
    """Carrier, fortress: two armoured hangar towers bridged by three spans, the launch bay open between them,
    hangar mouths lit at the bow, a command block on the starboard tower. Two point-defence mounts only."""
    M = []
    for s in (1, -1):
        M += [block((s * .27, 0, 0), (.15, .78, .13), ARMOR), block((s * .27, -.05, .14), (.11, .6, .035), DECK),
              block((s * .27, .79, 0), (.1, .012, .08), BLACK), block((s * .27, .8, 0), (.085, .008, .02), AMBER),
              plate((s * .42, 0, 0), (.012, .7, .1), BROWN), block((s * .43, .3, -.02), (.008, .32, .05), RED)]
    for y in (.5, .05, -.45):
        M += [block((0, y, .05), (.13, .06, .05), DECK), block((0, y + .065, .05), (.12, .008, .03), RED)]
    M += [block((0, 0, -.06), (.12, .74, .025), BLACK)]
    M += [block((.27, -.35, .23), (.07, .14, .06), ARMOR), block((.27, -.35, .3), (.055, .1, .015), WIN), rod((.27, -.4, .3), (.27, -.4, .42), .01, STEEL)]
    M += turret(-.27, .4, .19, .45, .2) + turret(.27, .4, .19, .45, .2)
    B, G = battlements((.36, .27, .18, -.18, -.27, -.36), -.8, 0, w=.04, l=.07, h=.07)
    G += [block((0, .0, -.034), (.03, .7, .004), AMBER, layer=1)]
    L = [light(0, y, -.03, AMBER, .014) for y in np.linspace(-.6, .6, 7)] + nav(.43, -.6, .1)
    return M + B, G, L, 180


# ================================================================== 9 DREADNOUGHT (wedge)
def dominion():
    """Dreadnought, wedge: two crescents, one riding over the other like chevrons, with the wingtips of the lower one
    curling far forward. A long forked prow cradles one spinal siege gun; a banded citadel and a dorsal sail sit on the
    upper crescent; nine stern drive housings. Two heavy turrets, no batteries."""
    nose, tail, span = .8, -.82, 1.0
    M = [crescent(nose, tail, span, .12, p=1.25), crescent(nose, tail, span, .03, z=-.04, m=RED, scale=1.012, sq=1.2, n=10, p=1.25),
         crescent(nose, tail, span * .8, .09, z=-.075, m=DECK, sq=1.4, n=10, p=1.25),
         crescent(.55, -.5, .62, .1, z=.08, m=ARMOR, p=1.5, sq=1.6), crescent(.53, -.48, .63, .02, z=.05, m=RED, p=1.5, sq=1.2, n=8)]
    for s in (1, -1):
        M.append(loft([(tail - .03, s * span * .97, 0, .06, .05, 2), (tail + .25, s * (span + .07), 0, .055, .045, 2), (tail + .55, s * (span + .05), .01, .04, .035, 2),
                       (tail + .8, s * (span - .05), .02, .02, .02, 2)], ARMOR, ring=14))
        M.append(loft([(.3, s * .1, .0, .06, .07, 1.6), (.9, s * .09, .0, .045, .05, 1.6), (1.2, s * .07, .0, .018, .022, 1.6)], ARMOR, ring=14))
        M.append(loft([(.35, s * .1, -.045, .06, .012, 1.3), (1.17, s * .07, -.035, .018, .01, 1.3)], RED, ring=10))
    M += rail(0, .25, 1.12, .0, .04) + [block((0, .35, .0), (.06, .1, .05), BLACK)]
    M += citadel_bands(-.12, .7, .34, .16, 3)
    M += [loft([(-.2, 0, .32, .012, .01, 2), (-.38, 0, .42, .015, .1, 2), (-.58, 0, .34, .012, .06, 2)], ARMOR, ring=12)]
    M += bridge(-.42, .32, .09, .045)
    M += turret(.42, -.45, .08, .7, .3) + turret(-.42, -.45, .08, .7, .3)
    M += canted_fins(.38, -.25, .28, .4, .16, .22, z0=-.08)
    xs = [0, .12, -.12, .25, -.25, .39, -.39, .54, -.54]
    B, G = battlements(xs, tail, .02, w=.05, l=.08, h=.07)
    L = nav(span + .06, tail + .5, .03) + [light(0, 1.2, .0, AMBER, .015)] + [light(x, tail + .03, .1, AMBER, .012) for x in (.25, -.25, .54, -.54)]
    return M + B, G, L, 220


# ------------------------------------------------------------------ roster
# key, name, role, hull style, function
TERRAN = [
    ('conf_flint', 'Flint', 'Fighter', 'wedge', flint),
    ('conf_rivet', 'Rivet', 'Fighter', 'fortress', rivet),
    ('conf_writ', 'Writ', 'Courier', 'wedge', writ),
    ('conf_gauge', 'Gauge', 'Scout', 'fortress', gauge),
    ('conf_hatchet', 'Hatchet', 'Interceptor', 'wedge', hatchet),
    ('conf_hound', 'Hound', 'Interceptor', 'fortress', hound),
    ('conf_ox', 'Ox', 'Freighter', 'fortress', ox),
    ('conf_ingot', 'Ingot', 'Ore freighter', 'wedge', ingot),
    ('conf_homeward', 'Homeward', 'Liner', 'fortress', homeward),
    ('conf_pennant', 'Pennant', 'Yacht', 'wedge', pennant),
    ('conf_rampart', 'Rampart', 'Siege frigate (transformer)', 'fortress', rampart),
    ('conf_rampart_siege', 'Rampart (siege)', 'Siege frigate, deployed', 'fortress', rampart_siege),
    ('conf_picket', 'Picket', 'Frigate', 'wedge', picket),
    ('conf_sickle', 'Sickle', 'Cruiser', 'wedge', sickle),
    ('conf_bulwark', 'Bulwark', 'Cruiser', 'fortress', bulwark),
    ('conf_anvil', 'Anvil', 'Carrier', 'fortress', anvil),
    ('conf_spearhead', 'Spearhead', 'Carrier', 'wedge', spearhead),
    ('conf_dominion', 'Dominion', 'Dreadnought', 'wedge', dominion),
    ('conf_citadel', 'Citadel', 'Dreadnought', 'fortress', citadel),
]
