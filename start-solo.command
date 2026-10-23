#!/bin/sh
# Starts a private, single-player Quantum Rift game on this computer (macOS / Linux). Keep the window open while playing.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js from https://nodejs.org first."; exit 1; }
(sleep 2; open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080) &
SOLO=1 DATA_DIR="$(pwd)/solo-data" node tools/start.ts
