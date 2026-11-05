"""Write shared/ships-freefolk.ts and shared/ships-unsworn.ts: the Freefolk and Unsworn hull definitions.

Each hull starts from the Type 0 hull closest to its job (shared/ships-type0.ts) and is adjusted:
  Freefolk  Index parts give better shields and sensors; they are civilians, so no weapons at all.
  Unsworn   stripped and over-engined: much faster, far lighter, thin armour and shields, almost no weapons.
usage: RIFT_SHIPS26=tools/ships26 python3 make_ff_ts.py <path to ships-type0.ts> <out dir>   (writes ships-freefolk.ts and ships-unsworn.ts)"""
import json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
type0_ts, out = os.path.abspath(sys.argv[1]), sys.argv[2]
sprites = json.load(open(os.path.join(HERE, 'ff_sprites.json')))
T0 = {h['id']: h for h in json.loads(subprocess.check_output(['node', '--experimental-strip-types', '--no-warnings', '-e',
      f"import({json.dumps('file://' + type0_ts)}).then(m=>console.log(JSON.stringify(m.TYPE0_HULLS)))"]))}

FREE = dict(shield=1.25, shieldRe=1.3, armor=1.0, speed=1.0, accel=1.0, turn=1.0, mass=1.05, cost=1.15)
RUN = dict(shield=0.6, shieldRe=0.8, armor=0.6, speed=1.4, accel=1.5, turn=1.2, mass=0.65, cost=1.1)

# key: (name, sub, base Type 0 id, adjustment, overrides, desc)
SPEC = {
    'ff_tallow': ('Tallow', 'Station Shuttle', 1010, FREE, {}, 'A Type 0 capsule riding an Index thruster pod. Freefolk use them to get between docks, and to get people off stations quietly.'),
    'ff_hawser': ('Hawser', 'Dock Tug', 1028, FREE, {}, 'Piston clamp arms, cable winches and a heavy push plate. It berths ships twice its size at Index docks built for machines.'),
    'ff_interpreter': ('Interpreter', 'Translator', 1012, FREE, {}, 'A cluster of Index eyes and a listening dish on an old scout hull. It carries the people who talk to the machines.'),
    'ff_mender': ('Mender', 'Repair Tender', 1013, FREE, {'cargo': 40}, 'Four jointed Index arms around a workshop can. Menders patch Index stations and human ships alike, and ask no questions.'),
    'ff_gleaner': ('Gleaner', 'Salvager', 1017, FREE, {}, 'An open cradle, a cutter arm and a winch. Gleaners strip wrecks for parts the Index lets them keep.'),
    'ff_ferryman': ('Ferryman', 'Passage Ship', 1030, FREE, {'crew': 30}, 'A passenger hull on an Index cargo body. The hold behind the cargo plating takes forty people who were never aboard.'),
    'ff_drumbarge': ('Drumbarge', 'Archive Barge', 1019, FREE, {}, 'Six glowing Index archive drums in a truss cradle. It moves the record between stations, a few lifetimes of it per trip.'),
    'ff_mercy': ('Mercy', 'Hospital Ship', 1021, FREE, {'crew': 40}, 'White hab cans and Index sensor eyes, with docking collars on a ring for casualty boats. It treats anyone who reaches it.'),
    'ff_steading': ('Steading', 'Habitat Ship', 1022, FREE, {'crew': 120, 'cargo': 120, 'tech': 3}, 'A spun ring of homes and glasshouses on an old Index hull. A whole Freefolk family line lives aboard and moves with the work.'),
    'un_needle': ('Needle', 'Courier', 1026, RUN, {'cargo': 4}, 'A capsule on one huge bell and two drop tanks. It carries papers and one passenger, and nothing in the Confederation catches it.'),
    'un_hush': ('Hush', 'Dark Runner', 1015, RUN, {'weapons': []}, 'A flat soot-black hull with shrouded bells and heat louvres. It crosses picket lines cold and lights its drive only when it has to.'),
    'un_shrike': ('Shrike', 'Escort', 1025, RUN, {}, 'A needle hull with one gun and two outrigger drives. It does not fight; it makes pursuers think twice.'),
    'un_sparrow': ('Sparrow', 'Passage Boat', 1026, RUN, {'crew': 14, 'cargo': 10}, 'A long can for twelve passengers on a cluster of four bells. Most of the Unsworn left the Confederation in one.'),
    'un_smokejack': ('Smokejack', 'Smuggling Runner', 1011, RUN, {'weapons': []}, 'Cargo cans on a quick-release spine and a drive bigger than the ship. If it is boarded, the cans are already drifting.'),
    'un_commonhold': ('Commonhold', 'Command Centre', 1024, dict(shield=1.0, shieldRe=1.0, armor=1.4, speed=0.35, accel=0.4, turn=0.5, mass=1.4, cost=1.6),
                      {'weapons': [], 'guns': 0, 'turrets': 0, 'crew': 300, 'cargo': 400},
                      'A hollowed ore rock with habitat cans dug in, antenna masts and docking booms full of runners. From outside it looks like dead mining spoil. This is where the Unsworn decide things.'),
}

rows = []
for sid, m in sorted(sprites.items(), key=lambda kv: int(kv[0])):
    name, sub, base, adj, ovr, desc = SPEC[m['key']]; b = T0[base]
    e = {'id': int(sid), 'name': name, 'sub': sub, 'faction': 'freefolk' if m['key'].startswith('ff_') else 'unsworn'}
    for k in ('cargo', 'fuel', 'space', 'guns', 'turrets', 'crew', 'size', 'weapons', 'strength', 'tech'): e[k] = b[k]
    for k, f in adj.items():
        v = b[k] * f
        e[k] = int(round(v / 1000)) * 1000 if k == 'cost' else max(1, int(round(v)))
    e['size'] = 0  # placeholder, set from the art below
    if m['key'].startswith('ff_'): e.update(weapons=[], guns=0, turrets=0)
    if m['key'].startswith('un_'):
        e['fuel'] = int(b['fuel'] * 1.3)
        if m['key'] != 'un_shrike': e['weapons'] = []
    e.update(ovr); e['desc'] = desc
    rows.append((m, e))

sys.path.insert(0, HERE); os.environ.setdefault("RIFT_SHIPS26", os.path.join(HERE, "..", "ships26"))
import hulls_freefolk as F
SIZE = {k: fn()[3] for k, *_, fn in F.ALL}

def ts(e):
    return '  hull({\n' + '\n'.join(f'    {k}: {json.dumps(v, ensure_ascii=False)},' for k, v in e.items()) + '\n  }),'
HEAD = {
    'freefolk': ('Freefolk (1040-1048)', 'Type 0 hulls rebuilt with Index parts. Civilians: unarmed.', 'FREEFOLK'),
    'unsworn': ('Unsworn (1050-1055)', 'Covert, low tech, very fast. Commonhold (1055) is their floating command centre: NPC only, never sold.', 'UNSWORN'),
}
for fac, (title, blurb, P) in HEAD.items():
    body = []
    mine = [(m, e) for m, e in rows if e['faction'] == fac]
    for m, e in mine:
        e['size'] = SIZE[m['key']]; body.append(ts(e))
    spr = '\n'.join(f"  {e['id']}: {{ fs: {m['fs']}, cols: {m['cols']}, banks: true, glow: true, packed: true }}," for m, e in mine)
    extra = ("export const UNSWORN_SOLD_IDS: number[] = UNSWORN_HULLS.filter((h) => h.id !== 1055).map((h) => h.id);\n"
             "export const UNSWORN_COMMAND_ID = 1055;\n") if fac == 'unsworn' else ''
    open(os.path.join(out, f'ships-{fac}.ts'), 'w').write(f"""// Quantum Rift Part II: {title} hulls (art: tools/{fac}/hulls_freefolk.py).
// {blurb}
import type {{ Ship23Hull }} from './ships23.ts';
import type {{ SpriteSheetConfig }} from './sprites26.ts';

type HullInput = Omit<Ship23Hull, 'cat' | 'faction' | 'kind' | 'armorRe' | 'fuelRe' | 'buy' | 'ai' | 'fastJump' | 'glow' | 'pilot' | 'img'> & {{
  faction: '{fac}';
}};

const hull = (input: HullInput) => ({{
  cat: '{fac.title()}',
  kind: 'hull',
  armorRe: 0,
  fuelRe: 0,
  buy: 50,
  ai: {1 if fac == 'freefolk' else 2},
  fastJump: {'true' if fac == 'unsworn' else 'false'},
  glow: true,
  pilot: '',
  ...input,
  img: `ships/${{input.id}}_yard.webp`,
}});

export const {P}_HULLS = [
{chr(10).join(body)}
];

export const {P}_IDS: number[] = {P}_HULLS.map((h) => h.id);
{extra}
/** Sprite sheets rendered by tools/{fac}/rift_ff_sheets.py. Merge into SPRITES in shared/sprites26.ts. */
export const {P}_SPRITES: Record<number, SpriteSheetConfig> = {{
{spr}
}};
""")
    print('wrote', fac, len(mine))
