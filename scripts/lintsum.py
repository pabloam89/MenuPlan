"""Print one line per ESLint message: `python scripts/lintsum.py <file>...`.

Takes every path given, not just the first: pasarle dos ficheros y que analice
solo uno hace que un lint limpio signifique lo contrario de lo que parece.
"""
import json
import subprocess
import sys

paths = sys.argv[1:]
raw = subprocess.run(
    ["npx.cmd", "eslint", *paths, "--format", "json"],
    capture_output=True, text=True, encoding="utf-8",
).stdout
start = raw.find("[")
for f in json.loads(raw[start:]):
    for m in f["messages"]:
        name = f["filePath"].replace("\\", "/").rsplit("/", 1)[-1]
        print(f"{name}:{m['line']}  {m.get('ruleId')}: {m['message'].splitlines()[0][:100]}")
