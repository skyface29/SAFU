#!/usr/bin/env python3
"""Собирает Machinarium.rbxlx — готовое место для Roblox Studio (Rojo не нужен).

Запуск:  python3 tools/build_rbxlx.py
Результат: Machinarium.rbxlx в корне проекта. Открой его в Roblox Studio и жми Play.
"""
import os
from xml.sax.saxutils import escape

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ref = 0


def ref():
    global _ref
    _ref += 1
    return f"RBX{_ref:08X}"


def cdata(src: str) -> str:
    return "<![CDATA[" + src.replace("]]>", "]]]]><![CDATA[>") + "]]>"


def item(cls, name, props="", children=""):
    return (f'<Item class="{cls}" referent="{ref()}"><Properties>'
            f'<string name="Name">{escape(name)}</string>{props}</Properties>{children}</Item>\n')


def scripts(folder):
    out = []
    base = os.path.join(ROOT, folder)
    for f in sorted(os.listdir(base)):
        if not f.endswith(".luau"):
            continue
        src = open(os.path.join(base, f), encoding="utf-8").read()
        source = f'<ProtectedString name="Source">{cdata(src)}</ProtectedString>'
        if f.endswith(".server.luau"):
            out.append(item("Script", f[:-len(".server.luau")], source))
        elif f.endswith(".client.luau"):
            out.append(item("LocalScript", f[:-len(".client.luau")], source))
        else:
            out.append(item("ModuleScript", f[:-len(".luau")], source))
    return "".join(out)


def main():
    workspace = item("Workspace", "Workspace",
                     '<bool name="StreamingEnabled">false</bool><float name="Gravity">196.2</float>',
                     item("Terrain", "Terrain"))
    replicated = item("ReplicatedStorage", "ReplicatedStorage", "",
                      item("Folder", "Machinarium", "", scripts("src/shared")))
    server = item("ServerScriptService", "ServerScriptService", "",
                  item("Folder", "MachinariumServer", "", scripts("src/server")))
    starter_player = item(
        "StarterPlayer", "StarterPlayer",
        '<bool name="LoadCharacterAppearance">false</bool>'
        '<bool name="CharacterUseJumpPower">true</bool>'
        '<float name="CharacterJumpPower">50</float>'
        '<float name="CameraMaxZoomDistance">60</float>'
        '<token name="GameSettingsAvatar">1</token>',
        item("StarterPlayerScripts", "StarterPlayerScripts", "",
             item("Folder", "MachinariumClient", "", scripts("src/client"))))
    lighting = item("Lighting", "Lighting",
                    '<float name="ClockTime">17.4</float>'
                    '<token name="Technology">4</token>'  # Future: свет и тени от каждой лампы
                    '<bool name="GlobalShadows">true</bool>')

    xml = ('<roblox xmlns:xmime="http://www.w3.org/2005/05/xmlmime" '
           'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" '
           'xsi:noNamespaceSchemaLocation="http://www.roblox.com/roblox.xsd" version="4">\n'
           + workspace + lighting + replicated + server + starter_player + '</roblox>\n')
    out = os.path.join(ROOT, "Machinarium.rbxlx")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(xml)
    print(f"Готово: {out} ({len(xml) // 1024} КБ)")


if __name__ == "__main__":
    main()
