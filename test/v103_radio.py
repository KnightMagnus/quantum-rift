"""Compatibility entry point for the current isolated local-radio regressions."""
import os
from pathlib import Path
import subprocess
import sys
root = Path(__file__).resolve().parents[1]
env = dict(os.environ)
if len(sys.argv) > 1:
    env["RIFT_TEST_ARTIFACTS"] = str(Path(sys.argv[1]).resolve())
for test in ["test/radio-playlists.js", "test/radio-browser.mjs"]:
    subprocess.run(["node", test], cwd=root, env=env, check=True)
