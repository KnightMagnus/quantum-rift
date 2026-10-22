"""Create Quantum Rift Solo saves. Uses only Python's standard library."""
from __future__ import annotations

import argparse
import copy
import json
import re
import sys
import time
from pathlib import Path

DATA_DIR = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
CATALOG = json.loads((DATA_DIR / "catalog.json").read_text(encoding="utf-8"))
MAX_CREDITS = 9_007_199_254_740_991  # Largest integer JavaScript can store exactly.


def create_save(name="Test Captain", credits=30000, ship=703, site="site-meridian",
                tier=1, location="station", research=False, skip_tutorial=True,
                all_radio=False, ship_name=""):
    """Return a new save envelope without reading or changing any installed game."""
    name = name.strip()
    if not re.fullmatch(r"[A-Za-z0-9 _'-]{3,20}", name) or name.lower() in {
        "__proto__", "constructor", "prototype", "hasownproperty", "tostring", "valueof"
    }:
        raise ValueError("Player name must be 3–20 letters, numbers, spaces, apostrophes, _ or -.")
    if isinstance(credits, bool) or not isinstance(credits, int) or not 0 <= credits <= MAX_CREDITS:
        raise ValueError(f"Credits must be a whole number from 0 to {MAX_CREDITS:,}.")
    if isinstance(tier, bool) or not isinstance(tier, int) or not 0 <= tier <= 5:
        raise ValueError("Station tier must be 0 (no station) through 5.")
    hull = next((item for item in CATALOG["ships"] if item["id"] == ship), None)
    station_site = next((item for item in CATALOG["sites"] if item["id"] == site), None)
    if hull is None:
        raise ValueError("Choose a ship from the list.")
    if tier and station_site is None:
        raise ValueError("Choose a station location from the list.")
    if location == "station":
        if tier == 0:
            raise ValueError("Choose a public starting port when station tier is 0.")
        start = station_site
    else:
        start = next((item for item in CATALOG["locations"] if item["id"] == location), None)
        if start is None:
            raise ValueError("Choose a starting port from the list.")
    player = copy.deepcopy(CATALOG["template"])
    player.update(name=name, credits=credits, ship=copy.deepcopy(hull["loadout"]),
                  sys=start["system"], stellar=start["id"],
                  explored=list(dict.fromkeys([CATALOG["start"]["system"], start["system"]])))
    player["ship"]["name"] = ship_name.strip()[:40] or hull["name"]
    player["station"].update(claimed=bool(tier), ops=tier, refT=int(time.time() * 1000), queue=[])
    if tier:
        player["station"]["site"] = site
        if research:
            player["station"]["done"] = [item["id"] for item in CATALOG["research"] if item["ops"] <= tier]
    if skip_tutorial:
        player["tut"] = CATALOG["tutorialEnd"]
    if all_radio:
        player["radioStations"] = CATALOG["radio"].copy()
    player["log"] = []
    return {"rift": CATALOG["version"], "save": player}


def write_save(destination, save):
    # The GUI's save dialog confirms replacement; CLI refuses accidental overwrites.
    Path(destination).write_text(json.dumps(save, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")


def launch_gui():
    import tkinter as tk
    from tkinter import filedialog, messagebox, ttk

    root = tk.Tk()
    root.title("Quantum Rift · Save Generator")
    root.geometry("680x580")
    root.minsize(620, 570)
    style = ttk.Style(root)
    if "vista" in style.theme_names():
        style.theme_use("vista")
    frame = ttk.Frame(root, padding=22)
    frame.pack(fill="both", expand=True)
    frame.columnconfigure(1, weight=1)
    ttk.Label(frame, text="Create a test captain", font=("Segoe UI", 18, "bold")).grid(
        row=0, column=0, columnspan=2, sticky="w")
    ttk.Label(frame, text=f"Quantum Rift {CATALOG['version']} · Offline Solo save files").grid(
        row=1, column=0, columnspan=2, sticky="w", pady=(4, 18))
    variables = {}

    def field(row, label, key, default, choices=None, searchable=False):
        ttk.Label(frame, text=label).grid(row=row, column=0, sticky="w", padx=(0, 18), pady=7)
        variable = variables[key] = tk.StringVar(value=default)
        if choices is None:
            widget = ttk.Entry(frame, textvariable=variable)
        else:
            widget = ttk.Combobox(frame, textvariable=variable, values=choices,
                                  state="normal" if searchable else "readonly")
            if searchable:
                def filter_choices(event):
                    if event.keysym not in {"Up", "Down", "Return", "Tab"}:
                        widget.configure(values=[value for value in choices
                                                 if variable.get().lower() in value.lower()])
                widget.bind("<KeyRelease>", filter_choices)
        widget.grid(row=row, column=1, sticky="ew", pady=7)
        return widget

    ship_choices = {f"{item['name']}  [#{item['id']}]": item["id"]
                    for item in sorted(CATALOG["ships"], key=lambda item: item["name"])}
    site_choices = {item["label"]: item["id"] for item in sorted(CATALOG["sites"], key=lambda item: item["label"])}
    port_choices = {"My station": "station", **{item["label"]: item["id"] for item in
                    sorted(CATALOG["locations"], key=lambda item: item["label"])}}
    field(2, "Player name", "name", "Test Captain")
    field(3, "Starting credits", "credits", "30000")
    field(4, "Ship (type to search)", "ship", next(key for key, value in ship_choices.items() if value == 703), list(ship_choices), True)
    field(5, "Ship name (optional)", "ship_name", "")
    field(6, "Station tier", "tier", "1", ["0", "1", "2", "3", "4", "5"])
    site_box = field(7, "Station location", "site", next(key for key, value in site_choices.items() if value == "site-meridian"), list(site_choices))
    field(8, "Start docked at", "location", "My station", list(port_choices))
    research = tk.BooleanVar(value=False)
    skip_tutorial = tk.BooleanVar(value=True)
    all_radio = tk.BooleanVar(value=False)
    for row, text, variable in [(9, "Complete research available at this station tier", research),
                                 (10, "Skip the beginner tutorial", skip_tutorial),
                                 (11, "Unlock all radio stations for testing", all_radio)]:
        ttk.Checkbutton(frame, text=text, variable=variable).grid(row=row, column=0, columnspan=2, sticky="w", pady=3)

    def tier_changed(*_):
        no_station = variables["tier"].get() == "0"
        site_box.configure(state="disabled" if no_station else "readonly")
        if no_station and variables["location"].get() == "My station":
            variables["location"].set(next(key for key, value in port_choices.items() if value == CATALOG["start"]["stellar"]))
    variables["tier"].trace_add("write", tier_changed)
    status = tk.StringVar(value="Exports a new file. Your installed game and existing saves are untouched.")
    ttk.Label(frame, textvariable=status, wraplength=600).grid(row=12, column=0, columnspan=2, sticky="w", pady=(14, 8))

    def export():
        try:
            save = create_save(name=variables["name"].get(),
                credits=int(variables["credits"].get().replace(",", "")),
                ship=ship_choices.get(variables["ship"].get()), site=site_choices.get(variables["site"].get()),
                tier=int(variables["tier"].get()), location=port_choices.get(variables["location"].get()),
                research=research.get(), skip_tutorial=skip_tutorial.get(), all_radio=all_radio.get(),
                ship_name=variables["ship_name"].get())
            filename = re.sub(r"[^A-Za-z0-9_-]", "_", save["save"]["name"]) + ".rift.json"
            destination = filedialog.asksaveasfilename(parent=root, title="Export Quantum Rift save",
                initialfile=filename, defaultextension=".rift.json", filetypes=[("Quantum Rift save", "*.rift.json"), ("JSON", "*.json")])
            if destination:
                write_save(destination, save)
                status.set(f"Saved: {destination}")
                messagebox.showinfo("Save exported", "Open Quantum Rift in Solo mode, then choose Import save file.\n\nImporting the same player name replaces that Solo slot. Use a new name to keep both.", parent=root)
        except (ValueError, OSError) as error:
            messagebox.showerror("Cannot export save", str(error), parent=root)
    ttk.Button(frame, text="Export save file…", command=export).grid(row=13, column=0, columnspan=2, sticky="ew", pady=6, ipady=5)
    root.mainloop()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Export without opening the GUI")
    parser.add_argument("--name", default="Test Captain")
    parser.add_argument("--credits", type=int, default=30000)
    parser.add_argument("--ship", type=int, default=703, help="Hull ID from catalog.json")
    parser.add_argument("--site", default="site-meridian")
    parser.add_argument("--tier", type=int, default=1)
    parser.add_argument("--location", default="station", help="Port ID, or 'station'")
    parser.add_argument("--research", action="store_true")
    parser.add_argument("--all-radio", action="store_true")
    parser.add_argument("--tutorial", action="store_true", help="Keep the beginner tutorial")
    parser.add_argument("--ship-name", default="")
    arguments = parser.parse_args()
    if arguments.output:
        try:
            if arguments.output.exists():
                raise ValueError("Output file already exists; choose another path.")
            save = create_save(name=arguments.name, credits=arguments.credits, ship=arguments.ship,
                site=arguments.site, tier=arguments.tier, location=arguments.location,
                research=arguments.research, skip_tutorial=not arguments.tutorial,
                all_radio=arguments.all_radio, ship_name=arguments.ship_name)
            write_save(arguments.output, save)
        except (ValueError, OSError) as error:
            parser.error(str(error))
    else:
        launch_gui()


if __name__ == "__main__":
    main()
