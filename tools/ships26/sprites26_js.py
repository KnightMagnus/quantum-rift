"""Writes shared/sprites26.js from ships26.json (the frame sizes and banking flags of the 2.6 ship sheets)."""
import json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__)); root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', 'quantum-rift')
meta = json.load(open(os.path.join(HERE, 'ships26.json')))
rows = ',\n'.join(f'  {k}: {json.dumps(v, separators=(",", ":"))}' for k, v in sorted(meta.items(), key=lambda x: int(x[0])))
open(os.path.join(root, 'shared', 'sprites26.js'), 'w').write(
  '// Quantum Rift 2.6: the re-rendered ship sheets (tools: scratchpad rift_ships26.py). fs = frame size in pixels, cols = frames per\n'
  '// row; banks = three roll sets of 36 headings (level, rolled right, rolled left), otherwise the level set only.\n'
  f'export const SPRITES = {{\n{rows}\n}};\n')
print(len(meta), 'sprites')
