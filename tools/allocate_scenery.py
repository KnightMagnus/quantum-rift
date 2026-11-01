"""Balanced art allocation for every system: which planet render each body uses (with caps so no world repeats more
than a few times), irregular moons, forest moons, background giants, station designs, sky and clutter, wreck tiers and
landing pictures. Deterministic. Writes allocation.json for the client to read as authored overrides.
usage: python3 tools/allocate_scenery.py <inventory.json> <galaxy.json> <planets.json> <planets_new.json> <out.json>"""
import sys, json, zlib, colorsys, collections
INV, GAL, PM, PN, OUT = sys.argv[1:6]
inv = json.load(open(INV)); gal = {s['id']: s for s in json.load(open(GAL))['systems']}
old = json.load(open(PM)); new = json.load(open(PN))
arts = {**old, **new}
def h(*a): return zlib.crc32('|'.join(map(str, a)).encode())
def hue_of(hexcol):
    try:
        r, g, b = (int(hexcol[i:i + 2], 16) / 255 for i in (1, 3, 5)); return colorsys.rgb_to_hsv(r, g, b)[0] * 360
    except Exception: return 0
def hd(a, b): d = abs(a - b) % 360; return min(d, 360 - d)
FAMILY = collections.defaultdict(list)
for k, v in arts.items():
    if k in ('earth',): continue
    FAMILY[v['type']].append(k)
use = collections.Counter()
CAP = 3
IRR = ['irr_0', 'irr_1', 'irr_2', 'irr_3', 'irr_4', 'irr_5', 'irr_6', 'irr_7']
LAND = {'desert8': 'l_desert_gold_city', 'desert9': 'l_desert_canyon_colony', 'desert10': 'l_desert_lilac', 'desert11': 'l_desert_dome_colony', 'desert12': 'l_desert_saltflat_city',
        'desert13': 'l_desert_crimson_glass', 'desert14': 'l_desert_crater_town', 'forest0': 'l_forest_moon1', 'forest1': 'l_forest_moon2', 'eyeball0': 'l_eyeball_terminator', 'eyeball1': 'l_eyeball_terminator',
        'ocean5': 'l_ocean_violet', 'ocean6': 'l_ocean_archipelago', 'terran5': 'l_terran_autumn', 'terran6': 'l_terran_savanna', 'jungle3': 'l_jungle_bluegreen', 'toxic4': 'l_toxic_teal',
        'toxic5': 'l_toxic_redhaze', 'city2': 'l_city_neon', 'crystal3': 'l_crystal_gold', 'crystal4': 'l_crystal_emerald', 'iron0': 'l_iron_plains', 'carbon0': 'l_carbon_plains',
        'shattered0': 'l_shattered_seams', 'ice5': 'l_ice_teal', 'ice7': 'l_ice_deepblue', 'lava4': 'l_lava_sulfur', 'irr_4': 'l_moon_irregular', 'irr_5': 'l_moon_irregular', 'irr_7': 'l_moon_irregular',
        'ringed_rock0': 'l_moon_ringed_sky', 'ringed_ice0': 'l_moon_ringed_sky'}
POOLS = {'vashari': ['hive', 'hive_spire', 'brood_lattice'], 'ylith': ['crystal', 'chime', 'bell'], 'thalassi': ['reef', 'waterbell', 'kelp'], 'sarn': ['ring', 'bazaar', 'caravanserai'],
         'korrund': ['rock', 'forge', 'hall', 'smelter'], 'quevari': ['spindle', 'sailstation'], 'umbral': ['disc', 'voidlantern'], 'lamp': ['twin', 'disc', 'lighthouse', 'vigil'],
         'hollow': ['junk', 'gutted', 'den', 'stronghold'], 'farside': ['twin', 'prefab', 'domes', 'outpost'], 'spacer': ['drydock', 'tradepost', 'cylinder', 'refinery'],
         'quantum': ['yard', 'mirror', 'customs', 'bastion', 'cross'], 'frontier': ['outpost', 'depot', 'relay', 'biodome', 'spindle', 'cross'], 'deep': ['listening', 'lab']}
AUTHORED = {'luna': 'luna', 'waystation-hub': 'crescent', 'longhaul-depot': 'refinery', 'cinder-hold': 'stronghold', 'farside-span': 'farside', 'threshold': 'relay',
            'twins-exchange': 'cylinder', 'nightjar-beacon': 'biodome', 'aureole-ring': 'ring', 'reliquary-watch': 'disc', 'glasswake-foundry': 'forge', 'palinode-observatory': 'crystal'}
NEB = {'umbral': [7, 1, 14, 15], 'deep': [4, 9, 15, 0], 'farside': [6, 5, 3, 10, 11], 'vashari': [3, 12, 13, 6], 'korrund': [2, 13, 8, 6], 'ylith': [0, 5, 10, 11],
       'thalassi': [0, 5, 11, 12], 'sarn': [2, 13, 7, 8], 'quevari': [6, 5, 11, 0], 'hollow': [1, 7, 14], 'frontier': [2, 3, 6, 8, 9, 13], 'lamp': [10, 13, 6, 2],
       'spacer': [3, 6, 11, 13], 'quantum': [0, 3, 5, 11]}
FAR = ['far_protostar', 'far_pulsar', 'far_supernova', 'far_dyson', 'far_blackhole_blue', 'far_binary_dwarf']
GIANTS = [k for k, v in arts.items() if v.get('gas')]
OTHER_BG = [k for k in arts if k not in GIANTS and k not in ('earth',) and not k.startswith('city')]
WILD = {'frontier', 'deep', 'umbral'}
bg_use = collections.Counter(); st_use = collections.Counter(); gal_use = collections.Counter()
out = {}; forest_left = 3
for s in sorted(inv, key=lambda s: h(s['id'])):
    sid = s['id']; g = gal[sid]; fac = s['faction'] if not s['farside'] else 'farside'; wild = fac in WILD or s['farside']
    rec = {'bodies': {}, 'stations': {}, 'background': [], 'sky': {}, 'clutter': {}}
    # ---- planets and moons
    for b in g['stellars']:
        if b['kind'] not in ('planet', 'moon'): continue
        cur = next((x['art'] for x in s['stellars'] if x['id'] == b['id']), None)
        if cur == 'earth' or b['id'] in ('luna',): rec['bodies'][b['id']] = {'art': cur}; continue
        fam = arts.get(cur, {}).get('type', 'barren')
        if b['kind'] == 'moon' and fam in ('jungle', 'terran', 'ocean') and forest_left > 0:
            pick = 'forest0' if forest_left % 2 else 'forest1'; forest_left -= 1
        elif b['kind'] == 'moon' and (b['r'] or 60) <= 46 and fam in ('barren', 'ice', 'sulfur') and h(b['id'], 'irr') % 100 < 40:
            cands = sorted(IRR, key=lambda k: (use[k], h(b['id'], k))); pick = cands[0]
        else:
            pool = FAMILY.get(fam) or FAMILY['barren']; bh = hue_of(b.get('color') or '#888888')
            pick = min(pool, key=lambda k: (use[k] >= CAP, use[k] * 40 + hd(bh, arts[k]['hue']) + (h(b['id'], k) % 30)))
        use[pick] += 1
        rec['bodies'][b['id']] = {'art': pick, **({'shape': 'irregular'} if pick.startswith('irr_') else {}), **({'landing': LAND[pick]} if pick in LAND else {})}
    # ---- stations
    for b in g['stellars']:
        if b['kind'] != 'station': continue
        if b['id'] in AUTHORED: d = AUTHORED[b['id']]
        else:
            pool = POOLS.get(fac, POOLS['frontier']); d = min(pool, key=lambda k: (st_use[(fac, k)], h(b['id'], k)))
        st_use[(fac, d)] += 1; rec['stations'][b['id']] = {'design': d, 'landing': f's_{d}_landed'}
    # ---- background worlds: 0 to 2, capped so no world shows up in more than 8 systems
    nbg = [0, 1, 1, 1, 2, 2][h(sid, 'bg') % 6]
    for i in range(nbg):
        pool = GIANTS if i == 0 else OTHER_BG
        k = min(pool, key=lambda k: (bg_use[k] >= 8, bg_use[k], h(sid, k, i))); bg_use[k] += 1
        rec['background'].append({'art': k, 'large': i == 0})
    # ---- sky
    pal = NEB.get(fac, list(range(16))); n = 1 + h(sid, 'nn') % 3 + (1 if s['danger'] >= 3 else 0)
    rec['sky']['nebulae'] = list(dict.fromkeys([f'nebula_{pal[(h(sid, "n", i)) % len(pal)]}' if h(sid, 'nx', i) % 10 < 8 else f'nebula_{h(sid, "nr", i) % 16}' for i in range(n)]))
    ng = [0, 1, 1, 2][h(sid, 'g') % 4]
    gl = []
    for i in range(ng):
        k = min(range(12), key=lambda k: (gal_use[k], h(sid, 'gal', k, i))); gal_use[k] += 1; gl.append(f'galaxy_{k}')
    rec['sky']['galaxies'] = gl
    if not s['scene'] and h(sid, 'far') % 100 < (18 if wild else 7): rec['sky']['far'] = FAR[h(sid, 'farp') % len(FAR)]
    sun = ['yellow', 'yellow', 'orange', 'red dwarf', 'white', 'blue-white giant', 'white dwarf', 'orange'][h(sid, 'sun') % 8]
    rec['sky']['sun'] = sun
    # ---- clutter: wrecks in two tiers, faction props, asteroid sets by field type
    massive = h(sid, 'mw') % 100 < (11 if wild or s['danger'] >= 3 else 3)
    fw = {'korrund': 6, 'ylith': 7, 'vashari': 8, 'thalassi': 9, 'sarn': 10, 'umbral': 11}
    if massive: rec['clutter']['massive_wreck'] = f"wreck_{fw.get(fac, [0, 1, 2, 3, 4, 5, 12, 13][h(sid, 'mwi') % 8])}"
    rec['clutter']['small_wrecks'] = list(dict.fromkeys([f'wreck_s_{(h(sid, "sw", i)) % 12}' for i in range(min(4, h(sid, 'swn') % 3 + (1 if s['danger'] >= 2 else 0) + (1 if wild else 0)))]))
    props = []
    if fac == 'lamp': props += ['beacon_0', 'beacon_1']
    if fac in ('thalassi', 'deep') and h(sid, 'lev') % 3 == 0: props.append('leviathan_0')
    if fac == 'vashari' and h(sid, 'sw') % 2 == 0: props.append('swarm_0')
    if fac == 'hollow' or (wild and h(sid, 'mine') % 4 == 0): props.append('satellite_6')
    if fac in ('spacer', 'sarn', 'quantum') or h(sid, 'pods') % 3 == 0: props += [f'pod_{3 + h(sid, "pod") % 4}']
    if fac == 'deep' and h(sid, 'ruin') % 3 == 0: props.append('ruin_3')
    if any(arts.get(rec['bodies'][b]['art'], {}).get('type') == 'ice' for b in rec['bodies']): props.append(f'iceberg_{h(sid, "ice") % 3}')
    rec['clutter']['props'] = props
    rockset = 'ice' if 'iceberg_0' in ' '.join(props) or any(p.startswith('iceberg') for p in props) else 'iron' if fac == 'korrund' else 'carbon' if fac in ('deep', 'umbral') else 'banded' if h(sid, 'rk') % 3 == 0 else 'stone'
    rec['clutter']['rocks'] = {'ice': ['rock10', 'rock11'], 'iron': ['rock12', 'rock13'], 'carbon': ['rock14', 'rock15'], 'banded': ['rock16', 'rock17'], 'stone': [f'rock{i}' for i in range(10)]}[rockset]
    rec['clutter']['shards'] = ['crys0', 'crys1', 'crys2', 'crys3', 'crys4', 'crys5']
    out[sid] = rec
json.dump(out, open(OUT, 'w'), indent=1)
bu = collections.Counter(v['art'] for r in out.values() for v in r['bodies'].values())
print('bodies', sum(bu.values()), 'distinct art', len(bu), 'max use', bu.most_common(3))
print('background max', bg_use.most_common(3), 'irregular moons', sum(1 for r in out.values() for v in r['bodies'].values() if v.get('shape')))
print('massive wrecks', sum(1 for r in out.values() if 'massive_wreck' in r['clutter']), 'far objects', sum(1 for r in out.values() if 'far' in r['sky']))
print('stations', collections.Counter(v['design'] for r in out.values() for v in r['stations'].values()).most_common(8))
