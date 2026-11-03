"""The Index at war: the eight hulls the Story Bible (Part II, 'The Index at war') gives the war network, one or two per
doctrine. Same parts and palette as hulls_index.py (worn plate with the orange stripe, black housings, amber eyes,
exposed pistons and cable), but heavier and harder: thicker armour, fewer open frames, weapons where survey tools were.
The machine language follows the Arc in Arc Raiders: insect-like drones on rotor-style thruster pods, missile racks
bolted onto bodies, armoured walkers with a single searching eye.

  Bulwark      idx_warden      defence barge: an armoured shell that unfolds a shield hoop over what it protects
               idx_wasp        interceptor drone: a single eye on four thruster pods, one cannon slung under it
  Splinter     idx_splinter_0  command cell, joined: four armoured cells locked round a data core
               idx_splinter_1  command cell, split: the cells scatter on tethers, the core runs dark
               idx_courier     archive courier: a long, fast runner carrying a glowing archive drum
  Quietus      idx_quietus     blackout relay: a tall mast of jamming vanes round a dark lens, the first ship in
  Reclamation  idx_reclaimer   salvage hulk: four jointed claws, winch cables and an open hold with a wreck in it
               idx_rocketeer   yard striker: a squat body under two swivelling missile racks
  Command      idx_ledger      War Ledger's command ship: the Kernel's war form, its petals closed into armour

+Y is the bow, +Z is up. Built on the repo's ship generator (tools/ships26)."""
import math
import numpy as np
from hulls_index import (PLATE, PLATE2, STEEL, RUST, ORE, CABLE, HOUSING, SENSOR, DATA, LAMB, lens, piston, cable, plate, bay,
                         thruster, mat, loft, sphere, block, pair, rod, xf, mv, rotm, hoop, light, greebles)

# war plating: a darker, scorched version of the survey plate, same orange stripe
WARPLATE = mat((0.6, 0.58, 0.53), metal=0.5, rough=0.45, panel=1.8, grime=2.6, stripe=(0.42, 0.5, (0.86, 0.45, 0.1)))
SCORCH = mat((0.24, 0.23, 0.22), metal=0.55, rough=0.5, panel=1.4, grime=2.4)

def _T(parts, R=None, t=(0, 0, 0)): return [xf(p, R, t=t) for p in parts]

def eye(c, r, look=(0, 1, 0.2)):
    """The war eye: a heavier hooded version of the survey lens."""
    x, y, z = c
    return lens(c, r, look) + [loft([(y - r * .2, x, z + r * .55, r * 1.15, r * .35, 3), (y + r * .9, x, z + r * .5, r * .9, r * .2, 3)], WARPLATE, ring=12)]

def rack(c, rows, cols, tube=.022, length=.16, yaw=0.0):
    """A missile rack: a boxed grid of tubes with orange warheads showing at the mouths."""
    x, y, z = c
    w, h = cols * tube * 1.25, rows * tube * 1.25
    M = [block((0, 0, 0), (w + .012, length, h + .012), SCORCH, sq=6)]
    for i in range(rows):
        for j in range(cols):
            tx, tz = -w + tube * 1.25 * (2 * j + 1), -h + tube * 1.25 * (2 * i + 1)
            M += [rod((tx, length - .01, tz), (tx, length + .012, tz), tube * .8, HOUSING), sphere((tx, length + .012, tz), tube * .5, SENSOR)]
    return _T(M, rotm('z', yaw) if yaw else None, (x, y, z))

def pod(x, y, z, r=.07):
    """An insect-drone thruster pod on a strut: a short drum with a glowing ring."""
    m = [loft([(y + .05, x, z, r * .8, r * .8, 2.4), (y + .02, x, z, r, r, 3), (y - .05, x, z, r, r, 3), (y - .08, x, z, r * .8, r * .8, 2.4)], WARPLATE, ring=14)]
    return m, [sphere((x, y - .09, z), r * .7, LAMB, layer=1)]

# ================================================================== BULWARK
def idx_warden():
    """Defence barge. A broad armoured shell on four thick legs of piston, a shield hoop raised over the bow on two arms,
    a ring of point-defence eyes. It parks over what it protects and takes the fire."""
    M = [loft([(.55, 0, 0, .3, .12, 3), (.35, 0, .02, .42, .17, 4), (-.4, 0, .02, .44, .18, 4), (-.6, 0, 0, .32, .13, 3)], WARPLATE, ring=22),
         loft([(.5, 0, -.08, .26, .08, 3), (-.55, 0, -.08, .3, .09, 3)], SCORCH, ring=18)]
    for k, y in enumerate((.3, .05, -.2, -.45)):   # armour bands across the back
        M.append(block((0, y, .19), (.36 - .02 * k, .07, .025), PLATE2 if k % 2 else WARPLATE, sq=5))
    for sx in (1, -1):
        for sy in (1, -1):   # piston legs braced out to the corners
            hip = (sx * .32, sy * .32, -.02); foot = (sx * .55, sy * .5, -.16)
            M += piston(hip, foot, .035) + [block((foot[0], foot[1], foot[2] - .02), (.06, .08, .02), SCORCH, sq=4)]
    for s in (1, -1):   # shield arms and the hoop they carry
        M += piston((s * .25, .3, .17), (s * .38, .62, .3), .03)
    M += [hoop(.42, .022, STEEL, c=(0, .66, .3), tilt_x=math.pi / 2 - .35)]
    G = [hoop(.42, .012, DATA, c=(0, .66, .3), tilt_x=math.pi / 2 - .35, layer=1)]
    M += eye((0, .5, .12), .07)
    for a in (-1.0, -.35, .35, 1.0):
        M += lens((.34 * math.sin(a), -.1 + .25 * math.cos(a), .2), .028, look=(math.sin(a), math.cos(a), .5))
    E, G2 = [], []
    for x in (.18, -.18):
        e, g = thruster(x, -.64, .02, .08); E += e; G2 += g
    return M + E, G + G2, [light(.44, -.2, .05, LAMB, .03), light(-.44, -.2, .05, LAMB, .03)], 200


def idx_wasp():
    """Interceptor drone. A hooded eye in an armoured body, four thruster pods on struts like rotors, a short cannon
    slung underneath. Fast, cheap and many."""
    M = [sphere((0, 0, 0), .2, WARPLATE, squash=.75), block((0, -.12, .06), (.12, .12, .05), SCORCH, sq=5)]
    M += eye((0, .17, .03), .08)
    E, G = [], []
    for sx in (1, -1):
        for sy in (1, -1):
            px, py = sx * .42, sy * .3 - .05
            M += [rod((sx * .12, sy * .08, .02), (px, py, .04), .022, STEEL), sphere((px, py, .04), .03, STEEL)]
            m, g = pod(px, py, .04, .085); M += m; G += g
    M += [block((0, .05, -.15), (.04, .1, .035), SCORCH, sq=5), rod((0, .1, -.15), (0, .55, -.15), .022, STEEL), rod((0, .5, -.15), (0, .6, -.15), .03, HOUSING)]
    return M, G, [light(.5, .25, .04, LAMB, .025), light(-.5, .25, .04, LAMB, .025)], 40

# ================================================================== SPLINTER
def _cell(k):
    """One command cell: an armoured wedge-drum with its own eye and thruster, built to survive alone."""
    M = [loft([(.28, 0, 0, .05, .05, 3), (.15, 0, 0, .12, .1, 5), (-.2, 0, 0, .13, .11, 5), (-.3, 0, 0, .09, .08, 4)], WARPLATE if k % 2 else PLATE2, ring=16)]
    M += eye((0, .2, .06), .04) + [block((0, -.05, .11), (.07, .12, .02), SCORCH, sq=5)]
    e, g = thruster(0, -.34, 0, .055)
    return M + e, g

def _splinter(t):
    core = [sphere((0, 0, 0), .16, DATA)] + ([sphere((0, 0, 0), .2, DATA, layer=1)] if t == 0 else [])
    M, G = list(core[:1]), list(core[1:])
    if t == 1: M = [sphere((0, 0, 0), .16, HOUSING)]   # the core goes dark when the cell scatters
    M += [hoop(.2, .018, STEEL, c=(0, 0, 0), tilt_x=0), hoop(.2, .018, STEEL, c=(0, 0, 0))]
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        m, g = _cell(k)
        if t == 0:   # joined: four cells locked nose-in round the core, a clamp ring over them
            R = rotm('z', 0); off = (.3 * math.cos(a), .3 * math.sin(a), 0)
        else:        # split: the cells break outward on their own headings, still tethered
            R = rotm('z', a - math.pi / 2 + (.5 if k % 2 else -.5)); off = (.75 * math.cos(a), .75 * math.sin(a), .03 * (k - 1.5))
            M += cable((0, 0, 0), (off[0] * .85, off[1] * .85, off[2]), .0, r=.004, n=10)
            G += [rod((0, 0, 0), (off[0] * .85, off[1] * .85, off[2]), .005, DATA, layer=1)]
        M += _T(m, R, off); G += _T(g, R, off)
    if t == 0:
        M += [hoop(.46, .03, WARPLATE, c=(0, 0, .1), tilt_x=0)] + [block((.46 * math.cos(a), .46 * math.sin(a), .1), (.05, .05, .04), SCORCH) for a in np.linspace(0, 2 * math.pi, 8, endpoint=False)]
    return M, G, [light(.5, 0, .05, LAMB, .03), light(-.5, 0, .05, LAMB, .03)], 140

def idx_splinter_0(): return _splinter(0)
def idx_splinter_1(): return _splinter(1)


def idx_courier():
    """Archive courier. A long armoured runner around a glowing archive drum, three big thrusters and almost nothing
    else; it carries the memory out when a command cell breaks."""
    M = [loft([(.85, 0, 0, .02, .02, 3), (.55, 0, 0, .08, .06, 5), (.1, 0, .0, .13, .09, 6), (-.5, 0, 0, .14, .1, 6), (-.7, 0, 0, .1, .08, 4)], WARPLATE, ring=18)]
    M += [loft([(.02, 0, .1, .1, .1, 2), (-.37, 0, .1, .1, .1, 2)], DATA, ring=16)]          # the archive drum, riding on the spine
    G = [loft([(.0, 0, .1, .11, .11, 2), (-.35, 0, .1, .11, .11, 2)], DATA, ring=16, layer=1)]
    for y in (.0, -.12, -.24, -.36):
        M += [hoop(.105, .016, STEEL, c=(0, y, .1), tilt_x=math.pi / 2)]
    M += [block((0, -.17, .02), (.06, .2, .04), SCORCH, sq=5)]
    M += eye((0, .62, .04), .04) + pair(plate((.15, -.45, 0), (.06, .2, .015), SCORCH, rz=.25))
    E = []
    for x, z in ((0, .06), (.1, -.04), (-.1, -.04)):
        e, g = thruster(x, -.74, z, .06); E += e; G += g
    return M + E, G, [light(.2, -.5, 0, LAMB, .025), light(-.2, -.5, 0, LAMB, .025)], 60

# ================================================================== QUIETUS
def idx_quietus():
    """Blackout relay. A narrow armoured keel under a tall mast of stacked jamming vanes, a dark lens at the top that
    swallows signal. It arrives first and goes quiet; break the mast and the blackout fails."""
    M = [loft([(.6, 0, 0, .05, .05, 4), (.3, 0, 0, .14, .1, 6), (-.45, 0, 0, .16, .11, 6), (-.62, 0, 0, .1, .08, 4)], WARPLATE, ring=18),
         block((0, -.1, .12), (.1, .2, .03), SCORCH, sq=5)]
    M += [rod((0, -.1, .1), (0, -.1, .95), .03, STEEL)]
    for k, z in enumerate(np.linspace(.25, .8, 6)):   # jamming vanes, alternating, narrowing toward the top
        w = .32 - .035 * k
        v = block((0, 0, 0), (w, .045, .008), PLATE2 if k % 2 else SCORCH, sq=8)
        M.append(mv(xf(v, rotm('z', .5 * (1 if k % 2 else -1))), 0, -.1, z))
        M += [sphere((w * math.cos(.5) * (1 if k % 2 else -1), -.1 + w * math.sin(.5), z), .015, SENSOR)]
    M += [sphere((0, -.1, 1.0), .08, HOUSING), hoop(.1, .015, STEEL, c=(0, -.1, 1.0), tilt_x=0)]
    G = [hoop(.16, .006, DATA, c=(0, -.1, 1.0), tilt_x=0, layer=1), hoop(.24, .005, DATA, c=(0, -.1, 1.0), tilt_x=0, layer=1)]
    M += eye((0, .42, .06), .045) + piston((.12, -.3, 0), (.3, -.45, -.05), .025) + piston((-.12, -.3, 0), (-.3, -.45, -.05), .025)
    E = []
    for x in (.08, -.08):
        e, g = thruster(x, -.66, 0, .06); E += e; G += g
    return M + E, G, [light(.3, -.45, -.05, LAMB, .025), light(-.3, -.45, -.05, LAMB, .025)], 120

# ================================================================== RECLAMATION
def idx_reclaimer():
    """Salvage hulk. A heavy segmented body with an open hold amidships carrying a captured wreck section, four jointed
    claws (two forward, two reaching out), winch cables running from the claws into the hold."""
    M = []
    for k, (y, w) in enumerate(((.55, .2), (.3, .3), (-.35, .32), (-.62, .24))):   # armour segments; the gap is the hold
        M.append(loft([(y + .11, 0, .0, w * .9, .13, 4), (y - .11, 0, 0, w, .15, 4)], WARPLATE if k % 2 == 0 else PLATE2, ring=18))
    M += [block((0, -.03, -.08), (.3, .22, .04), SCORCH, sq=5)] + pair(block((.29, -.03, .02), (.02, .22, .1), STEEL, sq=5))
    wreck = [block((0, 0, 0), (.13, .17, .07), RUST, sq=4), block((.06, .08, .07), (.06, .07, .04), SCORCH, sq=4), rod((-.1, -.12, .03), (-.18, -.2, .1), .015, STEEL)]
    M += _T(wreck, rotm('z', .35), (0, -.03, .03))
    for s in (1, -1):
        for k, (sh, el, tip) in enumerate((((s * .18, .62, 0), (s * .3, .9, .02), (s * .14, 1.05, 0)), ((s * .3, .25, .02), (s * .65, .35, .05), (s * .78, .62, .0)))):
            M += [sphere(sh, .055, STEEL)] + piston(sh, el, .045) + piston(el, tip, .035)
            for d in (-.06, .06):   # claw fingers
                M += [rod(tip, (tip[0] + d * s, tip[1] + .09, tip[2]), .016, SCORCH), rod((tip[0] + d * s, tip[1] + .09, tip[2]), (tip[0] + d * s * .2, tip[1] + .15, tip[2]), .012, SCORCH)]
            M += cable(el, (s * .12, -.03, .1), .05, r=.006, n=8)
    M += eye((s * 0, .66, .12), .055) + eye((.12, .6, .1), .03) + eye((-.12, .6, .1), .03)
    E, G = [], []
    for x in (.14, 0, -.14):
        e, g = thruster(x, -.76, .0 if x else .06, .075); E += e; G += g
    return M + E, G, [light(.33, -.55, .05, LAMB, .03), light(-.33, -.55, .05, LAMB, .03)], 260


def idx_rocketeer():
    """Yard striker. A squat armoured body on two thruster pods, two missile racks on swivel mounts above it, a single
    hooded eye. Built to put warheads into repair yards, then run."""
    M = [loft([(.35, 0, 0, .12, .1, 4), (.15, 0, .02, .2, .14, 5), (-.25, 0, .02, .22, .15, 5), (-.4, 0, 0, .16, .11, 4)], WARPLATE, ring=18)]
    M += eye((0, .33, .05), .055)
    for s in (1, -1):
        M += [rod((s * .12, -.05, .14), (s * .2, -.05, .24), .03, STEEL), sphere((s * .2, -.05, .24), .04, STEEL)]
        M += rack((s * .22, -.12, .3), 2, 3, .024, .17)
    E, G = [], []
    for s in (1, -1):
        M += [rod((s * .18, -.2, 0), (s * .34, -.3, -.02), .025, STEEL)]
        m, g = pod(s * .36, -.33, -.02, .08); M += m; G += g
    return M, G, [light(.42, -.3, 0, LAMB, .025), light(-.42, -.3, 0, LAMB, .025)], 70

# ================================================================== COMMAND
def idx_ledger():
    """War Ledger's command ship: the Kernel's war form. The same data core as the survey Kernel, but its six petals are
    closed into a faceted armoured shell with only slits of light between them; a crown of eyes and masts on top, two
    drone bays on each flank, heavy thrusters aft."""
    M = [sphere((0, 0, 0), .3, DATA)]
    G = [sphere((0, 0, 0), .34, DATA, layer=1)]
    for k in range(6):   # petals closed: tilted inward over the core, gaps of light between them
        a = 2 * math.pi * k / 6
        p = block((0, 0, 0), (.24, .07, .22), WARPLATE if k % 2 else PLATE2, sq=10)
        p = xf(p, rotm('x', .75)); p = xf(p, rotm('z', a - math.pi / 2))
        M.append(mv(p, .3 * math.cos(a), .3 * math.sin(a), .1))
        M += piston((.2 * math.cos(a), .2 * math.sin(a), -.1), (.42 * math.cos(a), .42 * math.sin(a), -.12), .03)
    M += [loft([(.3, 0, -.14, .32, .06, 4), (-.4, 0, -.14, .36, .07, 4)], SCORCH, ring=20), sphere((0, 0, .26), .13, SCORCH, squash=.6)]
    for x in (.0, .1, -.1, .2, -.2):   # crown: eyes on short masts
        h = .28 - abs(x) * .6
        M += [rod((x, -.05, .2), (x, -.05, .2 + h), .014, STEEL)] + lens((x, -.03, .22 + h), .03, look=(0, 1, .3))
    M += eye((0, .48, .06), .08)
    for s in (1, -1):
        M += bay((s * .37, .05, -.12), s, .05, .1) + bay((s * .37, -.22, -.12), s, .05, .1)
    E = []
    for x in (.22, .07, -.07, -.22):
        e, g = thruster(x, -.5, -.1, .08); E += e; G += g
        M += [rod((x, -.42, -.1), (x * .4, -.2, -.05), .03, STEEL)]
    return M + E, G, [light(.45, .0, -.1, LAMB, .03), light(-.45, .0, -.1, LAMB, .03)], 240


INDEX_WAR = [
    ('idx_warden', 'Warden', 'BULWARK  ·  DEFENCE BARGE', idx_warden),
    ('idx_wasp', 'Wasp', 'BULWARK  ·  INTERCEPTOR DRONE', idx_wasp),
    ('idx_splinter_0', 'Splinter — joined', 'SPLINTER  ·  COMMAND CELL', idx_splinter_0),
    ('idx_splinter_1', 'Splinter — split', 'SPLINTER  ·  COMMAND CELL', idx_splinter_1),
    ('idx_courier', 'Courier', 'SPLINTER  ·  ARCHIVE COURIER', idx_courier),
    ('idx_quietus', 'Quietus', 'QUIETUS  ·  BLACKOUT RELAY', idx_quietus),
    ('idx_reclaimer', 'Reclaimer', 'RECLAMATION  ·  SALVAGE HULK', idx_reclaimer),
    ('idx_rocketeer', 'Rocketeer', 'RECLAMATION  ·  YARD STRIKER', idx_rocketeer),
    ('idx_ledger', 'Ledger', 'COMMAND  ·  WAR LEDGER', idx_ledger),
]
