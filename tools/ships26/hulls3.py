"""EV Quantum 3.6 hulls: the Que'vari (white electro-sails, light-beam propulsion), the Ina Que'var, and Mk III refits."""
import math, copy
import numpy as np
import render2
from render2 import mat, loft, torus, block, sphere, wing, fin, pair, Mesh
from hulls2 import DESIGNS, engine, light, greebles, fuse, LRED, LGREEN, LWHITE, GLASS, DARK, GUNM, GTEAL

# ------------------------------------------------------------------ Que'vari palette
PEARL = mat((0.93, 0.93, 0.9), metal=0.3, rough=0.22, panel=0.55, grime=0.15, stripe=(0.42, 0.47, (0.86, 0.72, 0.4)))
PEARL2 = mat((0.86, 0.87, 0.88), metal=0.35, rough=0.25, panel=0.7, grime=0.2)
SAIL = mat((0.6, 0.84, 1.0), metal=0.0, rough=0.95, panel=0, grime=0.0, ambient=0.78, stripe=(-0.02, 0.02, (0.82, 0.95, 1.0)))   # light-blue energy fabric
GOLD = mat((0.92, 0.76, 0.42), metal=0.95, rough=0.2, panel=0)
ELEC = mat((0.85, 0.97, 1.0), emissive=(0.86, 0.97, 1.0))          # electro edges: always lit
PRISM = mat((0.95, 0.98, 1.0), emissive=(0.92, 0.97, 1.0))
BEAM = mat((1.0, 0.95, 0.8), emissive=(1.0, 0.94, 0.78))            # light beams (glow layer: lit when thrusting)
BEAMB = mat((0.7, 0.9, 1.0), emissive=(0.7, 0.9, 1.0))

def mast(x, y, z0, h, r=0.008, m=None):
    return loft([(z0, y, x, r, r, 2), (z0 + h, y, x, r * 0.6, r * 0.6, 2)], m if m is not None else GOLD, ring=8, axis='z')

def rot_y(mesh, px, pz, ang):
    c, s_ = math.cos(ang), math.sin(ang)
    def f(V):
        x, z = V[:, 0] - px, V[:, 2] - pz
        V[:, 0] = px + x * c + z * s_; V[:, 2] = pz - x * s_ + z * c; return V
    return mesh.tf(f)
def sail(x, y, z0, h, c_root, c_tip, sweep, m=SAIL, edge=True, thick=0.006, cant=None):
    """An electro-sail: thin fin with a glowing leading edge and a gold mast. cant (radians) leans it outward from vertical
    so its face catches the light and reads as white sail area in the near-top-down sprite view; default leans away from centre."""
    if cant is None: cant = 0.0 if abs(x) < 1e-3 else (0.75 if x > 0 else -0.75)
    out = [fin(x, y, h, c_root, c_tip, sweep, thick, m, z0=z0)]
    if edge:
        k = 6; pts = []
        for i in range(k + 1):
            t = i / k; pts.append((z0 + h * t, y + c_root / 2 - (sweep + (c_root - c_tip) / 2) * t, x, 0.006, 0.006, 2))
        out += [loft(pts, ELEC, ring=6, axis='z')]
    if cant: out = [rot_y(o, x, z0, cant) for o in out]
    return out
def sail_pair(x, y, z0, h, c_root, c_tip, sweep, cant=0.75):
    """Two sails fanned into a V from the same mast step."""
    return sail(x, y, z0, h, c_root, c_tip, sweep, cant=cant) + [o.mirror() for o in sail(x, y, z0, h, c_root, c_tip, sweep, cant=cant)] if x == 0 else \
        sail(x, y, z0, h, c_root, c_tip, sweep, cant=cant) + [o.mirror() for o in sail(x, y, z0, h, c_root, c_tip, sweep, cant=cant)]

def side_sail(x0, y, z, span, c_root, c_tip, sweep, dihedral=0.15, m=SAIL):
    """Lateral sail spread like a wing (pair it), electro leading edge."""
    out = [wing((x0, y), 0, span, c_root, c_tip, sweep, 0.006, m, z=z, dihedral=dihedral)]
    k = 6; pts = []
    for i in range(k + 1):
        t = i / k; pts.append((x0 + span * t, y + c_root / 2 - (sweep + (c_root - c_tip) / 2) * t, z + dihedral * t, 0.006, 0.006, 2))
    out += [loft(pts, ELEC, ring=6, axis='x')]
    return out

def beam(x, y, z, length, r, m=None):
    """A light beam streaming astern from an emitter (glow layer)."""
    return loft([(y, x, z, r * 0.4, r * 0.4, 2), (y - 0.04, x, z, r * 0.7, r * 0.7, 2), (y - length, x, z, r * 0.12, r * 0.12, 2)], BEAMB if m is None else m, ring=10, layer=1)

def emitter(x, y, z, r, beam_len, m=PRISM):
    M = [sphere((x, y, z), r, m), loft([(y + r * 0.6, x, z, r * 1.3, r * 1.3, 2), (y - r * 0.2, x, z, r * 1.5, r * 1.5, 2)], GOLD, ring=12)]
    return M, [beam(x, y - r, z, beam_len, r * 1.1)]

# ------------------------------------------------------------------ the ships
def qv_mote():
    M = [fuse([(1.0, 0, 0, 0, 2), (0.5, 0.12, 0.08, 0, 2), (-0.5, 0.16, 0.09, 0, 2), (-0.8, 0.08, 0.05, 0, 2)], PEARL)]
    M += sail_pair(0, 0.1, 0.05, 0.45, 0.8, 0.3, 0.45, cant=0.9)
    M += pair(side_sail(0.1, 0.0, 0, 0.6, 0.7, 0.2, 0.45, 0.05)[0])
    e, g = emitter(0, -0.82, 0, 0.06, 0.5)
    return M + e, g, [], 24

def qv_glimmer():
    M = [fuse([(1.0, 0, 0, 0, 2), (0.75, 0.06, 0.05, 0, 2), (0.2, 0.11, 0.09, 0.01, 2), (-0.5, 0.12, 0.09, 0.01, 2.2), (-0.85, 0.07, 0.06, 0, 2)], PEARL)]
    M += [loft([(0.6, 0, 0.07, 0, 0, 2), (0.48, 0, 0.08, 0.05, 0.035, 2), (0.25, 0, 0.08, 0.05, 0.035, 2)], GLASS, ring=10)]
    M += sail_pair(0, 0.15, 0.08, 0.6, 0.7, 0.25, 0.42, cant=0.8)
    for s in (1, -1):
        M += [x if s > 0 else x.mirror() for x in side_sail(0.1, -0.1, 0.02, 0.55, 0.5, 0.15, 0.35, 0.18)]
    e, g = emitter(0, -0.88, 0, 0.05, 0.55)
    return M + e, g, [light(0.62, -0.42, 0.1, LGREEN, 0.025), light(-0.62, -0.42, 0.1, LRED, 0.025)], 44

def qv_sloop():
    M = [fuse([(1.0, 0, 0, 0, 2), (0.8, 0.12, 0.08, 0, 2), (0.3, 0.24, 0.15, 0, 2.4), (-0.4, 0.26, 0.16, 0, 2.6), (-0.8, 0.16, 0.1, 0, 2.2)], PEARL)]
    for x in (0.3, -0.3):   # cargo pods
        M += [loft([(0.3, x, -0.05, 0.02, 0.02, 2), (0.22, x, -0.05, 0.1, 0.09, 2.5), (-0.45, x, -0.05, 0.1, 0.09, 2.5), (-0.55, x, -0.05, 0.03, 0.03, 2)], PEARL2, ring=16)]
    M += [loft([(0.82, 0, 0.08, 0, 0, 2), (0.7, 0, 0.11, 0.07, 0.04, 2), (0.5, 0, 0.11, 0.07, 0.04, 2)], GLASS, ring=10)]
    M += sail_pair(0, 0.35, 0.14, 0.55, 0.5, 0.22, 0.3, cant=0.7) + sail_pair(0, -0.2, 0.14, 0.65, 0.55, 0.22, 0.35, cant=0.85)
    eng = []; glo = []
    for x in (0.12, -0.12):
        e, g = emitter(x, -0.85, 0, 0.05, 0.5); eng += e; glo += g
    return M + eng, glo, [light(0.38, -0.5, 0.0, LGREEN, 0.03), light(-0.38, -0.5, 0.0, LRED, 0.03)], 72

def qv_corvette():
    M = [loft([(1.0, 0, 0, 0.01, 0.01, 2), (0.6, 0, 0, 0.16, 0.07, 2.6), (0.0, 0, 0, 0.36, 0.1, 3), (-0.6, 0, 0, 0.42, 0.1, 3.2), (-0.8, 0, 0, 0.3, 0.07, 3)], PEARL, ring=22)]
    M += [sphere((0, 0.95, 0.0), 0.06, PRISM), loft([(0.92, 0, 0, 0.07, 0.04, 2), (0.82, 0, 0, 0.09, 0.05, 2)], GOLD, ring=12)]
    M += [loft([(0.5, 0, 0.07, 0, 0, 2), (0.38, 0, 0.09, 0.06, 0.04, 2), (0.15, 0, 0.09, 0.06, 0.04, 2)], GLASS, ring=10)]
    M += sail(0, 0.05, 0.08, 0.55, 0.6, 0.22, 0.4) + sail_pair(0.05, 0.0, 0.08, 0.55, 0.6, 0.22, 0.4, cant=0.95)
    M += sail_pair(0.3, -0.3, 0.06, 0.45, 0.45, 0.15, 0.35, cant=0.9)
    eng = []; glo = []
    for x in (0.22, 0, -0.22):
        e, g = emitter(x, -0.82, 0, 0.045, 0.55); eng += e; glo += g
    return M + eng, glo, [light(0.42, -0.65, 0.05, LGREEN, 0.03), light(-0.42, -0.65, 0.05, LRED, 0.03)], 84

def qv_frigate():
    M = [fuse([(1.0, 0, 0, 0, 2), (0.82, 0.08, 0.06, 0, 2), (0.4, 0.16, 0.12, 0, 2.4), (-0.3, 0.18, 0.13, 0, 2.6), (-0.8, 0.13, 0.1, 0, 2.4), (-0.9, 0.08, 0.06, 0, 2)], PEARL)]
    M += [torus(0.2, 0.014, GOLD, cy=-0.1, squash=0.7), torus(0.17, 0.012, GOLD, cy=0.35, squash=0.7)]
    M += [loft([(0.75, 0, 0.07, 0, 0, 2), (0.62, 0, 0.1, 0.06, 0.04, 2), (0.4, 0, 0.1, 0.06, 0.04, 2)], GLASS, ring=10)]
    for s in (1, -1):
        M += [x if s > 0 else x.mirror() for x in side_sail(0.18, -0.15, -0.02, 0.6, 0.55, 0.2, 0.4, -0.05)]
    M += sail_pair(0.08, 0.25, 0.1, 0.55, 0.45, 0.18, 0.3, cant=0.7) + sail_pair(0.1, -0.25, 0.1, 0.7, 0.5, 0.18, 0.35, cant=0.95)
    M += [sphere((0, 0.97, 0), 0.04, PRISM)]
    eng = []; glo = []
    for x in (0.14, -0.14, 0.0):
        e, g = emitter(x, -0.9, 0 if x else 0.06, 0.05, 0.6); eng += e; glo += g
    return M + eng + greebles(301, 6, ((-0.08, 0.08), (-0.5, 0.3)), PEARL2, size=(0.02, 0.04, 0.01), zfn=lambda x, y: 0.12), glo, \
        [light(0.78, -0.4, 0.0, LGREEN, 0.03), light(-0.78, -0.4, 0.0, LRED, 0.03)], 124

def qv_cruiser():
    M = [loft([(1.0, 0, 0, 0.02, 0.02, 2), (0.75, 0, 0, 0.16, 0.09, 2.6), (0.2, 0, 0, 0.32, 0.14, 3), (-0.5, 0, 0, 0.36, 0.15, 3.2), (-0.85, 0, 0, 0.24, 0.1, 3)], PEARL, ring=24)]
    M += [loft([(0.9, 0, 0.0, 0.0, 0.0, 2), (0.6, 0, 0.0, 0.05, 0.05, 2), (0.3, 0, 0.0, 0.05, 0.05, 2)], PRISM, ring=10)]    # spinal prism lance
    M += [loft([(0.55, 0, 0.12, 0, 0, 2), (0.42, 0, 0.15, 0.07, 0.05, 2), (0.2, 0, 0.15, 0.07, 0.05, 2)], GLASS, ring=10)]
    for k, (y, h, c) in enumerate(((0.25, 0.5, 0.4), (-0.05, 0.62, 0.45), (-0.38, 0.72, 0.5))):
        M += sail_pair(0.08 + 0.05 * k, y, 0.12, h, c, c * 0.35, 0.3, cant=0.6 + 0.2 * k)
    for s in (1, -1):
        M += [x if s > 0 else x.mirror() for x in side_sail(0.3, -0.2, -0.03, 0.55, 0.55, 0.2, 0.4, -0.08)]
    eng = []; glo = []
    for x in (0.24, 0.08, -0.08, -0.24):
        e, g = emitter(x, -0.86, 0.02, 0.045, 0.65); eng += e; glo += g
    return M + eng + greebles(311, 10, ((-0.15, 0.15), (-0.6, 0.4)), PEARL2, size=(0.02, 0.05, 0.012), zfn=lambda x, y: 0.15), glo, \
        [light(0.82, -0.35, -0.05, LGREEN, 0.03), light(-0.82, -0.35, -0.05, LRED, 0.03)], 176

def qv_carrier():
    M = []
    for x in (0.36, -0.36):   # twin hulls
        M += [loft([(0.95, x, 0, 0.02, 0.02, 2), (0.7, x, 0, 0.11, 0.08, 2.4), (-0.6, x, 0, 0.15, 0.1, 2.6), (-0.85, x, 0, 0.09, 0.06, 2.2)], PEARL, ring=18)]
    M += [block((0, 0.0, 0.0), (0.32, 0.5, 0.05), PEARL2)]                    # flight deck between hulls
    for y in (0.35, 0.0, -0.35): M += [block((0, y, 0.055), (0.2, 0.06, 0.006), ELEC)]
    for k in range(7):   # an arc of sails across the deck
        a = -0.75 + k * 0.25; x = 0.42 * math.sin(a); y = -0.05 - 0.15 * math.cos(a) * 0.6
        M += sail(x, y, 0.06, 0.5 + 0.15 * math.cos(a), 0.35, 0.12, 0.2, cant=a * 1.1)
    eng = []; glo = []
    for x in (0.36, -0.36):
        for dx in (0.06, -0.06):
            e, g = emitter(x + dx, -0.88, 0, 0.04, 0.6); eng += e; glo += g
    return M + eng, glo, [light(0.52, -0.6, 0.0, LGREEN, 0.03), light(-0.52, -0.6, 0.0, LRED, 0.03)], 214

def ina_quevar():
    """The Ina Que'var: a gargantuan whale-shaped sail-ship. Broad rounded head, long tapering body, tail flukes,
    pectoral sails, a dorsal forest of white electro-sails, and great light beams streaming astern."""
    skin = mat((0.92, 0.92, 0.9), metal=0.25, rough=0.3, panel=0.9, grime=0.25, windows=(-0.02, 0.025, (0.75, 0.9, 1.0), 40),
               stripe=(0.55, 0.58, (0.86, 0.72, 0.4)))
    belly = mat((0.8, 0.82, 0.86), metal=0.3, panel=1.4, grime=0.3)
    # body: rounded head forward, widest just behind the head, long taper to the tail stock
    prof = [(0.98, 0.0, 0.0, -0.01, 2), (0.93, 0.12, 0.09, -0.01, 2), (0.8, 0.24, 0.16, 0.0, 2.1), (0.55, 0.3, 0.2, 0.0, 2.2), (0.25, 0.3, 0.2, 0.0, 2.2),
            (-0.1, 0.26, 0.17, 0.0, 2.1), (-0.45, 0.18, 0.12, 0.0, 2), (-0.7, 0.1, 0.07, 0.0, 2), (-0.82, 0.06, 0.045, 0.0, 2)]
    M = [fuse(prof, skin, ring=32)]
    # ventral pleats
    for k in range(9):
        x = -0.16 + k * 0.04
        M += [loft([(0.85, x, -0.15, 0.008, 0.008, 2), (0.2, x * 1.2, -0.19, 0.01, 0.01, 2), (-0.35, x * 0.8, -0.14, 0.008, 0.008, 2)], belly, ring=6)]
    # brow: a prism eye-band of light on each side of the head
    for s in (1, -1):
        M += [loft([(0.78, 0.2 * s, 0.07, 0.006, 0.012, 2), (0.6, 0.27 * s, 0.07, 0.01, 0.016, 2), (0.45, 0.28 * s, 0.06, 0.006, 0.012, 2)], PRISM, ring=8)]
    M += [sphere((0, 0.72, 0.17), 0.06, GLASS, squash=0.5)]
    # tail flukes
    M += pair(wing((0.03, -0.76), 0, 0.4, 0.24, 0.1, 0.16, 0.014, skin, dihedral=0.04))
    for s in (1, -1):
        k = 6; pts = [(0.03 + 0.4 * t, -0.76 + 0.12 - (0.16 + 0.07) * t, 0.04 * t, 0.006, 0.006, 2) for t in [i / k for i in range(k + 1)]]
        e = loft(pts, ELEC, ring=6, axis='x'); M += [e if s > 0 else e.mirror()]
    # pectoral sails, spread wide
    for s in (1, -1):
        for part in side_sail(0.26, 0.42, -0.02, 0.55, 0.36, 0.12, 0.4, -0.06):
            M += [part if s > 0 else part.mirror()]
        for part in side_sail(0.18, -0.15, 0.0, 0.42, 0.3, 0.1, 0.32, 0.05):
            M += [part if s > 0 else part.mirror()]
    # dorsal forest of electro-sails along the spine, tallest amidships
    rows = [(0.62, 0.0, 0.45, 0.24), (0.42, 0.11, 0.6, 0.27), (0.42, -0.11, 0.6, 0.27), (0.2, 0.0, 0.72, 0.3), (0.05, 0.13, 0.62, 0.26),
            (0.05, -0.13, 0.62, 0.26), (-0.15, 0.0, 0.6, 0.26), (-0.32, 0.09, 0.45, 0.22), (-0.32, -0.09, 0.45, 0.22), (-0.5, 0.0, 0.32, 0.18)]
    for y, x, h, c in rows:
        z0 = 0.16 if y > -0.2 else 0.1
        M += sail(x, y, z0, h * 0.68, c, c * 0.35, c * 0.55, cant=(0.0 if x == 0 else (0.85 if x > 0 else -0.85)))
        if x == 0: M += sail_pair(0.02, y - 0.02, z0, h * 0.5, c * 0.8, c * 0.3, c * 0.5, cant=1.05)
    # turret blisters (gold) for the Sail Lances and Halo Bursts
    for k in range(10):
        a = k * math.pi / 5; x = 0.22 * math.cos(a); y = 0.35 + 0.3 * math.sin(a) * 0.8
        M += [sphere((x, y, 0.15 if abs(x) < 0.15 else 0.1), 0.025, GOLD, squash=0.6)]
    # stern emitters: the light that drives her
    eng = []; glo = []
    for x, z, r in ((0.0, 0.02, 0.06), (0.12, 0.0, 0.045), (-0.12, 0.0, 0.045), (0.06, 0.09, 0.035), (-0.06, 0.09, 0.035)):
        e, g = emitter(x, -0.86, z, r, 0.25); eng += e; glo += g
    # beams streaming back from each sail tip row (glow layer)
    for y, x, h, c in rows[::2]:
        glo += [beam(x, y - c * 0.5, 0.16 + h * 0.5, 0.3, 0.018)]
    return M + eng, glo, [light(0.8, 0.38, -0.08, LGREEN, 0.025), light(-0.8, 0.38, -0.08, LRED, 0.025), light(0, -0.8, 0.05, LWHITE, 0.02)], 380

QV = dict(qv_mote=qv_mote, qv_glimmer=qv_glimmer, qv_sloop=qv_sloop, qv_corvette=qv_corvette, qv_frigate=qv_frigate,
          qv_cruiser=qv_cruiser, qv_carrier=qv_carrier, ina=ina_quevar)
DESIGNS.update(QV)

# ------------------------------------------------------------------ Mk III: obsidian armor, quantum conduits, extra drive pods
OBSIDIAN = (0.25, 0.27, 0.33)
CONDUIT = mat((0.35, 1.0, 0.95), emissive=(0.35, 1.0, 0.92))
MK3_KEYS = ['cutlass', 'halberd', 'bramble', 'hive', 'tempest', 'bastion']
def mk3(key):
    def make():
        M, G, L, size = DESIGNS[key]()
        V = np.concatenate([x.V for x in M])
        # re-skin every hull material: obsidian plate with a teal quantum stripe; keep glass/emissive parts
        seen = {}
        for mesh in M:
            src = render2.MATS[mesh.m]
            if src['emissive'] is not None or src['glass']: continue
            if mesh.m not in seen:
                m = copy.deepcopy(src)
                lum = float(np.mean(src['color']))
                m['color'] = np.array(OBSIDIAN) * (0.85 + 0.5 * lum); m['metal'] = 0.85; m['rough'] = 0.25; m['panel'] = max(1.4, src['panel'])
                m['grime'] = 0.5; m['stripe'] = (-0.3, -0.2, (0.3, 0.95, 0.9)); m['windows'] = None
                render2.MATS.append(m); seen[mesh.m] = len(render2.MATS) - 1
            mesh.m = seen[mesh.m]
        # engine glow goes quantum-teal
        for g in G: g.m = GTEAL
        xs = np.abs(V[:, 0]); x1 = max(0.08, np.percentile(xs, 92)); y0, y1 = np.percentile(V[:, 1], 5), np.percentile(V[:, 1], 95)
        ztop = np.percentile(V[:, 2], 90); ymid = (y0 + y1) / 2
        # glowing conduits running along the dorsal hull
        for x in (x1 * 0.35, -x1 * 0.35):
            M += [loft([(y1 * 0.8, x, ztop + 0.004, 0.006, 0.004, 2), (ymid, x * 1.2, ztop + 0.006, 0.007, 0.004, 2), (y0 * 0.85, x * 1.1, ztop * 0.8, 0.006, 0.004, 2)], CONDUIT, ring=6)]
        # side drive pods with teal glow
        pod = mat(OBSIDIAN, metal=0.85, rough=0.25, panel=1.8, grime=0.5)
        px = x1 * 0.95; pr = max(0.05, 0.06 * (1 if size < 150 else 0.8))
        for s in (1, -1):
            M += [loft([(y0 * 0.2, s * px, -0.02, pr * 0.4, pr * 0.4, 2), (y0 * 0.35, s * px, -0.02, pr, pr, 2.4), (y0 * 0.95, s * px, -0.02, pr, pr, 2.4)], pod, ring=14)]
            M += [loft([(y0 * 0.3, s * px, pr * 0.6, 0.004, 0.004, 2), (y0 * 0.9, s * px, pr * 0.6, 0.004, 0.004, 2)], CONDUIT, ring=6)]
            n, g = engine(s * px, y0 * 0.98, -0.02, pr * 0.85, GTEAL, DARK); M += n; G += g
        # armor plating and sensor fins
        M += greebles(hash(key) % 1000 + 777, 14 + size // 10, ((-x1 * 0.7, x1 * 0.7), (y0 * 0.7, y1 * 0.7)), pod, size=(0.035, 0.06, 0.016), zfn=lambda x, y: ztop)
        M += pair(fin(px * 0.6, y0 * 0.6, 0.12 if size < 150 else 0.09, 0.2, 0.08, 0.1, 0.012, pod, z0=ztop * 0.6))
        return M, G, L, size
    return make
for k in MK3_KEYS: DESIGNS[k + '_mk3'] = mk3(k)

# ------------------------------------------------------------------ 3.7 Umbral: Que'vari hulls corrupted to darkness (obsidian violet, black-violet sails, red edges)
U_HULL = mat((0.2, 0.16, 0.24), metal=0.7, rough=0.3, panel=1.4, grime=0.6, stripe=(0.42, 0.47, (0.6, 0.1, 0.16)))
U_HULL2 = mat((0.16, 0.13, 0.2), metal=0.7, rough=0.3, panel=1.6, grime=0.7)
U_SAIL = mat((0.3, 0.1, 0.38), metal=0.0, rough=0.9, panel=0, grime=0.0, ambient=0.6, stripe=(-0.02, 0.02, (0.55, 0.12, 0.25)))
U_TRIM = mat((0.35, 0.08, 0.1), metal=0.9, rough=0.25, panel=0)
U_EDGE = mat((1.0, 0.25, 0.35), emissive=(1.0, 0.22, 0.32))
U_BEAM = mat((0.8, 0.2, 0.5), emissive=(0.75, 0.18, 0.5))
def umbral(key):
    def make():
        M, G, L, size = DESIGNS[key]()
        swap = {PEARL: U_HULL, PEARL2: U_HULL2, SAIL: U_SAIL, GOLD: U_TRIM, ELEC: U_EDGE, PRISM: U_EDGE, BEAM: U_BEAM, BEAMB: U_BEAM}
        for mesh in M + G:
            if mesh.m in swap: mesh.m = swap[mesh.m]
        return M, G, L, size
    return make
UMBRAL = {'umbral_shade': 'qv_glimmer', 'umbral_hunter': 'qv_corvette', 'umbral_reaver': 'qv_frigate', 'umbral_dread': 'qv_cruiser'}
for k, src in UMBRAL.items(): DESIGNS[k] = umbral(src)
