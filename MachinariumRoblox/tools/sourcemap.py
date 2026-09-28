#!/usr/bin/env python3
"""Генерирует sourcemap.json (как `rojo sourcemap`) для luau-lsp без установки Rojo."""
import json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def scripts(folder):
    out = []
    for f in sorted(os.listdir(os.path.join(ROOT, folder))):
        if not f.endswith('.luau'):
            continue
        path = f"{folder}/{f}"
        if f.endswith('.server.luau'):
            out.append({"name": f[:-len('.server.luau')], "className": "Script", "filePaths": [path]})
        elif f.endswith('.client.luau'):
            out.append({"name": f[:-len('.client.luau')], "className": "LocalScript", "filePaths": [path]})
        else:
            out.append({"name": f[:-len('.luau')], "className": "ModuleScript", "filePaths": [path]})
    return out

tree = {"name": "Machinarium", "className": "DataModel", "filePaths": ["default.project.json"], "children": [
    {"name": "ReplicatedStorage", "className": "ReplicatedStorage", "children": [
        {"name": "Machinarium", "className": "Folder", "children": scripts("src/shared")}]},
    {"name": "ServerScriptService", "className": "ServerScriptService", "children": [
        {"name": "MachinariumServer", "className": "Folder", "children": scripts("src/server")}]},
    {"name": "StarterPlayer", "className": "StarterPlayer", "children": [
        {"name": "StarterPlayerScripts", "className": "StarterPlayerScripts", "children": [
            {"name": "MachinariumClient", "className": "Folder", "children": scripts("src/client")}]}]},
]}
with open(os.path.join(ROOT, "sourcemap.json"), "w") as fh:
    json.dump(tree, fh, indent=1)
print("sourcemap.json готов")
