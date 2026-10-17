# Quantum Rift ship generator (2.6)

The 3D pipeline that renders every ship sprite sheet in Quantum Rift 2.6. Needs Python 3 with numpy and Pillow (`pip install numpy pillow`).

## Files

- `tools/hulls2.py`, `hulls3.py`, `hulls5.py`, `hulls52.py`, `hulls08.py`, `hulls22.py`: the 3D ship designs (`DESIGNS`), built from simple shapes (lofts, wings, fins, greebles, lights).
- `tools/artgen_mk2.py`: adds the Mk II / Mk III refit designs (kept for the enemy kingpins).
- `tools/render2.py`: the software renderer (lighting, roll, supersampling). `artgen3.py` (`build`) turns a design into meshes; `pict.py` is a helper it imports.
- `tools/rift_ships26.py`: renders the sheets. Ships up to 200 px get 108 frames (36 headings × level, roll −28°, roll +28°); bigger ships get 36 level frames. Sheets are 12 frames wide, plus an optional `_glow` layer.
- `tools/ships26_pack.py`: optional re-compression of the sheets. Updates `ships26.json`.
- `tools/sprites26_js.py`: writes `shared/sprites26.js` (frame size and banking per ship) from `ships26.json`.
- `tools/rift_roster_chart.py`: the all-ships chart. Expects a `quantum-rift` folder next to this one and uses `ships.json`.
- `ship_keys.json`: game hull id → design name. `ships26.json`: frame size, columns, banking and glow per hull. `ships.json`: ship stats for the chart.

## Use

Run from this folder, pointing at the game folder:

```
PYTHONHASHSEED=0 python3 tools/rift_ships26.py ../quantum-rift 4          # every ship, 4 processes
PYTHONHASHSEED=0 python3 tools/rift_ships26.py ../quantum-rift 2 824 825  # just these hull ids
python3 tools/sprites26_js.py ../quantum-rift
```

Keep `PYTHONHASHSEED=0` so the greeble details come out identical every run. A small ship takes about 30 seconds.
Output goes to `<game>/client/assets/ships/<id>.webp` and `<id>_glow.webp`.

To add a ship: add a design to one of the hull files (copy a similar one), map its hull id in `ship_keys.json` (or the `KEYS.update` lines in `rift_ships26.py`), render it, then rerun `sprites26_js.py`.
