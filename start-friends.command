#!/bin/sh
# Explicitly hosts a friend game on the local network and opens the host browser.
umask 077
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Install Node.js from https://nodejs.org first."; exit 1; }
echo "Hosting a friend game on your network. Keep this window open while playing."
echo "No router ports, firewall rules or tunnels are configured automatically."
node tools/start.ts --friends
