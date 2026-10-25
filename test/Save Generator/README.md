# Quantum Rift Save Generator

Create custom **Solo-mode** saves for Quantum Rift 3.4.0. Choose a player name,
starting credits, ship, personal station location and station tier. The game does
not need to be running. The generator never edits your installed game or saves.
`Example Captain.rift.json` is an optional ready-made T5 test save.

## Run on Windows

1. Extract this ZIP into a folder.
2. Install Python 3.10 or newer for Windows, including the Python launcher and Tcl/Tk support
   (included with the standard installer).
3. Double-click **Run Save Generator.bat**.
4. Choose your settings and click **Export save file**.
5. Start Quantum Rift with **Start Solo Game.bat**. At the captain selection screen,
   click **LOAD A SAVE FILE**, choose the exported `.rift.json`, then click **PLAY**
   beside your captain.

Importing a save with an existing captain name replaces that Solo slot. Export a
backup in the game first, or use a different name for each test captain.

## Build a standalone Windows EXE

Double-click **Build Windows EXE.bat** on a Windows PC with Python 3 installed.
The first build needs internet access to download PyInstaller. It creates a local
`.build-env` folder and puts the executable here:

```
dist\Quantum Rift Save Generator.exe
```

The EXE contains the catalog and does not require Python on the computer that runs
it. Build on Windows; running PyInstaller on Linux does not create a Windows EXE.

## Settings

- **Station tier 0:** no personal station. Choose a public starting port instead.
- **Station tiers 1–5:** create a claimed personal station at the selected hull.
- **Complete research:** completes projects available at the chosen tier, not
  projects that require a higher tier.
- **Starting port:** start at your personal station or any listed public port.
  Distant and hostile systems can be dangerous; the tool does not change reputation.
- **Ship:** includes all 98 player-eligible hulls, including specialist and rare hulls,
  with the game's stock weapons. NPC-only Index, Nhal and story ships are excluded.
  It does not add crew, stored ships or materials.
- **Radio and tutorial:** optional testing shortcuts stored in the exported save.

Choose an unoccupied station hull. Use different station sites for test captains
you keep at the same time.

Personal-station ownership in older game builds can be absent from the shared
station map after importing, even though the captain can use the station. The
accompanying game change repairs import ownership and rejects another captain's
claimed location. Use a fresh Solo data folder for isolated tests on older builds.

The catalog matches 3.4.0; future game versions may need a refreshed catalog. Online
servers do not accept Solo save imports.

## Command line

```
py -3 save_generator.py --output Test.rift.json --name "Test Captain" --credits 30000000 --ship 736 --tier 5 --research --all-radio
```

The command line refuses to replace an existing output file. Run without arguments
for the window. `--help` lists the options.

## Verification

Generated saves are checked through the game's real import and login code,
including all ship hulls, station sites, tiers and public starting ports. The GUI
is exercised on Linux with Tk; native Windows GUI and EXE execution are not verified
here. The ZIP contains source and build scripts, not a prebuilt Windows executable.

## Updating the catalog

From the repository root, run `node "test/Save Generator/export-catalog.ts"`, then
format `test/Save Generator/catalog.json` with the repository formatter. Re-run
the save-generator regressions before distributing the refreshed tool. This folder
is a beta testing utility and can be removed when it is no longer needed.
