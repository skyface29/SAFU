#!/usr/bin/env python3
"""UDID симулятора для стресс-теста: самый новый iOS, iPhone «Pro» (не Max), иначе любой iPhone."""
import json
import re
import subprocess
import sys

raw = subprocess.run(["xcrun", "simctl", "list", "devices", "available", "-j"],
                     capture_output=True, text=True, check=True).stdout
devices = json.loads(raw)["devices"]


def version(runtime):
    m = re.search(r"iOS-(\d+)-(\d+)", runtime)
    return (int(m.group(1)), int(m.group(2))) if m else None


best = None
for runtime, items in devices.items():
    v = version(runtime)
    if not v:
        continue
    for d in items:
        name = d.get("name", "")
        if not name.startswith("iPhone"):
            continue
        score = (v, "Pro" in name and "Max" not in name, name)
        if best is None or score > best[0]:
            best = (score, d["udid"], name, runtime)

if not best:
    sys.exit("Нет доступных симуляторов iPhone")
print(f"{best[2]} · {best[3]}", file=sys.stderr)
print(best[1])
