#!/bin/sh
# Builds out/Quantum Rift vX.Y.Z.zip with everything inside a "Quantum Rift vX.Y.Z" folder. Run from the quantum-rift folder.
set -e
V=$(node -p "require('./package.json').version"); NAME="Quantum Rift v$V"; OUT=$(cd "${1:-..}" && pwd)/out; STAGE=$(mktemp -d)
mkdir -p "$STAGE/$NAME" "$OUT"
tar --exclude=./data --exclude=./solo-data --exclude=./node_modules --exclude='*.log' --exclude=./CONTINUE.md --exclude='__pycache__' -cf - . | tar -xf - -C "$STAGE/$NAME"
rm -f "$OUT/$NAME.zip"; (cd "$STAGE" && zip -qr -9 "$OUT/$NAME.zip" "$NAME"); rm -rf "$STAGE"
echo "$OUT/$NAME.zip"
