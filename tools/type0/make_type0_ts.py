"""Write shared/ships-type0.ts: the 25 Type 0 hull definitions, derived from their Concord descendants' stats.

Stats start from the descendant (shared/assets.json for 703-717, shared/ships23.ts for 820-829) and are adjusted
for older technology: slower, less shield, heavier armour, cheaper. Weapons, cargo, crew and slots are unchanged.
usage: python3 make_type0_ts.py <game dir> <out .ts>"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
game, out = sys.argv[1], sys.argv[2]
sprites = json.load(open(os.path.join(HERE, 'type0_sprites.json')))
A = json.load(open(os.path.join(game, 'shared', 'assets.json')))['ships']
s23 = json.loads(subprocess.check_output(['node', '--experimental-strip-types', '--no-warnings', '-e',
      "import('./shared/ships23.ts').then(m=>console.log(JSON.stringify(m.SHIPS23)))"], cwd=game))
SRC = {int(k): v for k, v in A.items()}; SRC.update({s['id']: s for s in s23})

DESIGN_ID = {'gnat': 703, 'dory': 704, 'kestrel': 705, 'mule': 706, 'wayfarer': 707, 'cutlass': 708, 'lacewing': 709, 'crawler': 710,
             'bramble': 711, 'barge': 712, 'halberd': 713, 'pilgrim': 714, 'hive': 715, 'tempest': 716, 'bastion': 717,
             'wasp': 820, 'swift': 821, 'pelican': 822, 'sabre': 823, 'caravel': 824, 'talon': 825, 'lighthouse': 826,
             'monarch': 827, 'aegis': 828, 'vigil': 829}
DESC = {
    'gnat': 'A capsule on one big engine, with two propellant tanks on struts. Couriers have flown them between the colonies since before Earth went.',
    'dory': 'Two bare containers in an open frame, a capsule cab up front and three engines behind. It hauls anything that fits.',
    'kestrel': 'A slim scout with stubby forward-swept wings and a heat-tiled nose. Old, but its sensors still look further than you expect.',
    'mule': 'Six cargo cans strapped along an open spine. Nobody loves a Mule, and every yard owns three.',
    'wayfarer': 'An explorer with a ring of bolted habitat cans turning around its spine. Long voyages are survivable with a little gravity.',
    'cutlass': 'A flat delta with its two engines hung on pylons above the wing. Fast, cheap and easy to patch.',
    'lacewing': 'A sail yacht that really sails: square films on cross booms, catching starlight. Its engine is there for docking.',
    'crawler': 'An open drill cone, two mining arms and a frame full of hoppers. Asteroid crews swear by it and at it.',
    'bramble': 'A plated hull with four open gun mounts and spare tanks on stub wings. Colony militias have kept them flying for generations.',
    'barge': 'Containers clamped along a long girder, a capsule cab and a big radiator. Slow, patient and nearly unsinkable.',
    'halberd': 'A segmented spine with fuel tanks slung on outriggers and one long rail gun along the top. The colonies\' standard escort.',
    'pilgrim': 'Three habitat cans stacked nose to tail, lit by rows of small windows. Families still cross the neighbourhood in them.',
    'hive': 'A six-sided frame of open cradles, each holding a little Gnat. Miners and survey crews use them as mother ships.',
    'tempest': 'A gun spine with two slab wings strutted on and five engines. Built in a hurry, and it still looks it.',
    'bastion': 'An armour-belted hull with sponson cans on trusses and big single-gun turrets. The heaviest thing most colonies ever built.',
    'wasp': 'A fat can on an oversized engine, with two guns on struts. Cheap enough to lose and quick enough to be annoying.',
    'swift': 'A capsule on a long boom, a cargo can underneath and two outrigger engines. Light, fast and fragile.',
    'pelican': 'Jointed cranes with claws up front and a towing frame behind. Every salvage crew started on one.',
    'sabre': 'A hard-edged wedge with one open gun mount and strapped-on tanks. The colonies\' all-rounder.',
    'caravel': 'Containers on an open spine, with a gun mount at each end. A merchant that can say no.',
    'talon': 'A heavy fighter with straight wings, rocket pods and drop tanks. It hits hard and turns like a brick.',
    'lighthouse': 'A great antenna dish on the bow, masts and radiators behind. It maps systems the slow, careful way.',
    'monarch': 'A polished hull with a long window band and gold foil trim. It was luxury once, and it still tries.',
    'aegis': 'Armour slabs hung off the sides and open twin-gun mounts. It escorts convoys by getting in the way.',
    'vigil': 'An open coilgun of rings runs out past the bow. Behind it are an old hull and a broadside of single guns.',
}
ADJ = dict(speed=0.9, accel=0.85, turn=0.9, shield=0.7, shieldRe=0.8, armor=1.15, mass=1.15, cost=0.75, strength=0.9)
KEEP = ['sub', 'cargo', 'fuel', 'space', 'guns', 'turrets', 'crew', 'size', 'weapons']

sys.path.insert(0, HERE); os.environ.setdefault('RIFT_SHIPS26', os.path.join(HERE, 'ships26'))
rows = []
for sid, m in sorted(sprites.items(), key=lambda kv: int(kv[0])):
    design = m['key'].replace('proto_', ''); did = DESIGN_ID[design]; s = SRC[did]
    base = s['name'].split()[0] if s['name'] != 'Ore Crawler' and s['name'] != 'Longhaul Barge' else {'Ore Crawler': 'Crawler', 'Longhaul Barge': 'Barge'}[s['name']]
    e = {'id': int(sid), 'name': f'{base} Type 0', 'descendant': did}
    for k in KEEP: e[k] = s[k]
    for k, f in ADJ.items(): e[k] = int(round(s[k] * f / (1000 if k == 'cost' else 1))) * (1000 if k == 'cost' else 1)
    e['tech'] = max(1, s['tech'] - 1)
    e['desc'] = DESC[design]
    rows.append(e)

def ts(e):
    lines = []
    for k, v in e.items():
        lines.append(f'    {k}: {json.dumps(v, ensure_ascii=False)},' if not isinstance(v, list) else f'    {k}: {json.dumps(v)},')
    return '  type0({\n' + '\n'.join(lines) + '\n  }),'

body = '\n'.join(ts(e) for e in rows)
spr = '\n'.join(f"  {sid}: {{ fs: {m['fs']}, cols: {m['cols']}, banks: true, glow: true, packed: true }}," for sid, m in sorted(sprites.items(), key=lambda kv: int(kv[0])))
open(out, 'w').write(f"""// Quantum Rift Part II: the Type 0 hulls, pre-Rift prototypes of the Concord yard ships (art: tools/type0/hulls_proto.py).
// They are the common ships of the Milky Way. Stats derive from each descendant: slower, less shield, heavier armour, cheaper.
import type {{ Ship23Hull }} from './ships23.ts';
import type {{ SpriteSheetConfig }} from './sprites26.ts';

/** A Type 0 hull definition before the shared defaults are added. */
type Type0Input = Omit<Ship23Hull, 'cat' | 'faction' | 'kind' | 'armorRe' | 'fuelRe' | 'buy' | 'ai' | 'fastJump' | 'glow' | 'pilot' | 'img'> & {{
  /** Hull ID of the Concord ship this prototype became in the Rift. */
  descendant: number;
}};

const type0 = (input: Type0Input) => ({{
  cat: 'Milky Way',
  faction: 'common',
  kind: 'hull',
  armorRe: 0,
  fuelRe: 0,
  buy: 50,
  ai: 3,
  fastJump: false,
  glow: true,
  pilot: '',
  ...input,
  img: `ships/${{input.id}}_yard.webp`,
}});

/** The 25 Type 0 hulls (ids 1010-1034). */
export const TYPE0_HULLS = [
{body}
];

/** Hull IDs of every Type 0, for Milky Way shipyards, traffic and defence fleets. */
export const TYPE0_IDS: number[] = TYPE0_HULLS.map((hull) => hull.id);

/** Concord descendant hull ID -> its Type 0 hull ID. Use it to swap common hulls for Milky Way systems. */
export const TYPE0_OF: Record<number, number> = Object.fromEntries(TYPE0_HULLS.map((hull) => [hull.descendant, hull.id]));

/** Sprite sheets rendered by tools/type0/rift_type0_sheets.py. Merge into SPRITES in shared/sprites26.ts. */
export const TYPE0_SPRITES: Record<number, SpriteSheetConfig> = {{
{spr}
}};
""")
print('wrote', out, len(rows))
