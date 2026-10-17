# Recovered original ship pipeline

Recovered from the user's `quantum-rift-ship-generator.zip` (v2.6 GitHub migration
source), not reconstructed from flat images. `ORIGINAL-README.md` preserves the
supplied instructions. Hull definitions, materials and renderer remain original.
Local adaptations put data beside scripts, render banks for **all** sizes and
restart workers per hull so material IDs cannot depend on scheduling.

Python 3 with NumPy and Pillow (WebP support) is required. Use a virtual environment:

```sh
python3 -m venv .artifacts/ship-render-env
.artifacts/ship-render-env/bin/pip install numpy pillow
PYTHONHASHSEED=0 .artifacts/ship-render-env/bin/python tools/ships26/rift_ships26.py /path/to/staging-game 4 736
```

The staging directory must have `client/assets/ships/`. Without hull IDs the
command renders the recovered fleet; it does **not** include later native models
such as Star Dredge (`tools/rift_dredge.py`). Never blanket-render a production
checkout: existing healthy artwork and newer designs should remain unchanged.
Output is WebP base plus optional `_glow`, 12 columns, 36 headings per roll set:
level, right (−28°), left (+28°). These are genuine model-space rolls. Star Dredge
uses its own intentional ±18° banks. Large original hulls retain their frame size.

To create a ship, define a mesh-building function in an appropriate `hulls*.py`
and register it in `hulls2.DESIGNS`. Map its new numeric ID to the design key in
`ship_keys.json` (values follow existing `[source ID, design key]` entries), or
`KEYS.update` in `rift_ships26.py`. Render only that ID into staging. The renderer
updates this directory's `ships26.json`. Review all headings and three roll sets,
including base/glow alignment, before copying approved outputs to game assets.
Update the corresponding entry in `shared/sprites26.js` from that metadata,
retaining current JSDoc and unrelated/newer records. Do not blindly run the old
`sprites26_js.py`: it rewrites the registry using only the recovered old roster.

`ships26_pack.py` is retained for provenance, not required: sheets already render
to compressed WebP. Its optional lossy quality pass can resize enemy-only ships
and remove old PNGs; don't run it on the current fleet. For new asset-only
recompression, preserve dimensions/frame ordering and update only that entry.

## Reproducing the 3.0.5 capital-ship repair

```sh
PYTHONHASHSEED=0 .artifacts/ship-render-env/bin/python tools/ships26/repair_banks.py /path/to/3.0.4-game /path/to/output --processes 4
```

This bounded command repairs only the 17 original 36-frame large sheets. It checks
six neutral silhouettes against original geometry, copies the original 36 neutral
frames pixel-exactly, adds 72 bank frames and matching glows, and encodes losslessly
with transparent RGB retained. `render-proof.json` records IDs, geometry checks,
output hashes and preservation proof. It expects the original 3.0.4 sheets; it
refuses to reinterpret an already banked sheet. No game saves/network are used.
