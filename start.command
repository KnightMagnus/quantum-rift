#!/bin/sh
# Starts the Quantum Rift server and opens the game (macOS / Linux). Keep the window open while playing.
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Install Node.js from https://nodejs.org first."; exit 1; }
(sleep 2; open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080) &
node server/main.js
