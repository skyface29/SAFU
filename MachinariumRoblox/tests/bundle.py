#!/usr/bin/env python3
"""Упаковывает исходники игры в tests/_sources.luau (luau CLI не умеет читать файлы)."""
import os
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = ["return {"]
for folder in ("shared", "server", "client"):
    d = os.path.join(ROOT, "src", folder)
    for f in sorted(os.listdir(d)):
        if f.endswith(".luau"):
            src = open(os.path.join(d, f), encoding="utf-8").read()
            eq = "=" * 6
            assert f"]{eq}]" not in src
            out.append(f'["{folder}/{f}"] = [{eq}[{src}]{eq}],')
out.append("}")
open(os.path.join(ROOT, "tests", "_sources.luau"), "w", encoding="utf-8").write("\n".join(out))
