#!/bin/sh
# Clean/hydrated checkout -> complete ZIP and matching parts below 28 MB.
# All parts extract into the same versioned folder. Requires Python 3 and Git LFS.
set -eu
ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
DEST=$(cd "${1:-..}" && pwd)/out
exec python3 "$ROOT/tools/package_archive.py" --output "$DEST"
