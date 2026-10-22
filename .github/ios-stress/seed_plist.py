#!/usr/bin/env python3
"""Готовое состояние для iPhone: то же, что у Android (seed.py), но в настройках приложения (plist).
Аргументы: путь к android-stress/seed.py, куда записать ru.student.safuhub.plist."""
import base64
import json
import plistlib
import subprocess
import sys

raw = subprocess.run([sys.executable, sys.argv[1]], capture_output=True, text=True, check=True).stdout
values = {}
for key, v in json.loads(raw).items():
    if v["t"] == "b":
        values[key] = bool(v["v"])
    elif v["t"] == "data":
        data = base64.b64decode(v["v"])
        if key == "notes.v2":
            # у iPhone в заметке обязательно поле items
            notes = json.loads(data)
            for n in notes:
                n.setdefault("items", [])
            data = json.dumps(notes, ensure_ascii=False).encode("utf-8")
        values[key] = data
with open(sys.argv[2], "wb") as f:
    plistlib.dump(values, f, fmt=plistlib.FMT_BINARY)
print(f"записано ключей: {len(values)}")
