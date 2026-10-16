# Quantum Rift v2.8.1

## Passenger transport and fixes

- Dedicated passenger seats, larger yacht and liner cabins, several passenger offers per board, and repeatable five-seat outfitter packs. Story groups wait for seats at their boarding port; occupied seats cannot be removed or stranded by ship changes.
- Correct factory-equipment resale and hull valuation, legal stock fittings, duplicate named-wingmate recruitment, and rush-repair prices.
- Combat Assist starts pursuit and primary fire for a preselected legal hostile. NPC banking stays steady through turns; hit factions may retaliate for the current system visit.
- Restore detailed Earth assets with bounded image-load recovery, add textured and varied stars, and replace the Gateway animation with a genuinely periodic vortex.
- Reduce decorative gas giants and large wrecks to 60% and 50% of their previous sizes, without changing their artwork or shrinking suns and foreground objects.
- Refresh all 73 active outfitter icons at higher resolution. Restore 750 missing original Git LFS objects used by the repository.

## Download and compatibility

Use the attached **Quantum-Rift-v2.8.1.zip** for a complete game download with actual artwork, rather than the automatically generated source archives. Extract it, then run **Start Solo Game.bat** on Windows for Solo mode, or use the existing README instructions for other platforms. Node.js 18 or newer is required.

Existing saves remain supported. Older saves cannot distinguish all previously replaced factory equipment, so migration conservatively treats up to the original stock count as included in the hull. Newly purchased replacements retain their resale basis. Back up existing saves before updating; do not overwrite saved-game data while replacing game files.

Radio functionality is unchanged. No new combat balance pass is included.

## Verification

The gameplay batch passed 39 local Node suites, formatting/type checks, network checks and targeted Chromium checks. Hosted PR CI passed fresh Git LFS checkout and verification, formatting, types, feature/contract tests and regression checks after the asset-store repair. The release is tagged on the resulting tested upstream main commit.
