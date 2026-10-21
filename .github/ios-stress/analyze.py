#!/usr/bin/env python3
"""Разбор стресс-теста iPhone: отчёты о падениях (.ips), ход «обезьяны», шаги. Отчёт — Markdown;
при падениях создаёт FAILED."""
import collections
import datetime as dt
import json
import os
import re
import sys

OUT = sys.argv[1] if len(sys.argv) > 1 else "stress-out"


def read(name):
    try:
        with open(os.path.join(OUT, name), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


phases = []
for row in read("phases.txt").splitlines():
    t, _, name = row.partition(" ")
    if t.isdigit():
        phases.append((int(t), name))


def phase_at(ts):
    cur = "?"
    for t, name in phases:
        if t <= ts:
            cur = name
    return cur


def parse_ips(path):
    """Первая строка .ips — заголовок (JSON), дальше — тело (JSON)"""
    with open(path, encoding="utf-8", errors="replace") as f:
        text = f.read()
    head, _, body = text.partition("\n")
    try:
        h = json.loads(head)
        b = json.loads(body) if body.strip().startswith("{") else {}
    except ValueError:
        return None
    images = [i.get("name") or "?" for i in b.get("usedImages", [])]

    def frames(fs):
        out = []
        for fr in fs[:25]:
            img = images[fr["imageIndex"]] if 0 <= fr.get("imageIndex", -1) < len(images) else "?"
            sym = fr.get("symbol") or f"+{fr.get('imageOffset', 0)}"
            loc = f" ({os.path.basename(fr['sourceFile'])}:{fr.get('sourceLine', '?')})" if fr.get("sourceFile") else ""
            out.append(f"{img:<22} {sym}{loc}")
        return out

    threads = b.get("threads", [])
    ft = b.get("faultingThread", 0)
    crashed = threads[ft]["frames"] if 0 <= ft < len(threads) else []
    last = b.get("lastExceptionBacktrace") or []
    exc = b.get("exception", {})
    asi = []
    for v in (b.get("asi") or {}).values():
        asi += v if isinstance(v, list) else [str(v)]
    stamp = h.get("timestamp") or b.get("captureTime") or ""
    try:
        ts = int(dt.datetime.strptime(stamp[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc).timestamp())
        off = re.search(r"([+-])(\d\d)(\d\d)$", stamp.strip())
        if off:
            ts -= (1 if off.group(1) == "+" else -1) * (int(off.group(2)) * 3600 + int(off.group(3)) * 60)
    except ValueError:
        ts = 0
    stack = frames(last) if last else frames(crashed)
    first_app = next((s for s in stack if s.startswith("SAFU ") or s.startswith("SAFU.debug.dylib")), stack[0] if stack else "?")
    return {
        "proc": h.get("app_name") or b.get("procName") or os.path.basename(path),
        "type": f"{exc.get('type', '?')} {exc.get('signal', '')}".strip(),
        "asi": [a for a in asi if a][:4],
        "stack": stack,
        "sig": re.sub(r"\+ ?\d+|0x[0-9a-f]+|\d+", "#", f"{exc.get('type')} {first_app}"),
        "phase": phase_at(ts),
        "bug": h.get("bug_type", "?"),
    }


crashes = collections.OrderedDict()
harness = collections.Counter()   # падения раннера XCTest и xcodebuild — сбой теста, не приложения
cdir = os.path.join(OUT, "crashes")
for name in sorted(os.listdir(cdir)) if os.path.isdir(cdir) else []:
    if not name.endswith(".ips"):
        continue
    c = parse_ips(os.path.join(cdir, name))
    if not c or c["bug"] not in ("309", 309):
        continue
    if c["proc"] != "SAFU":
        harness[f"{c['proc']}: {c['type']} в {next((x for x in c['stack'] if 'Monkey' in x), c['stack'][0] if c['stack'] else '?').strip()}"] += 1
        continue
    e = crashes.setdefault(c["sig"], dict(c, count=0, phases=set()))
    e["count"] += 1
    e["phases"].add(c["phase"])

monkey_rows = []
for f in sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []:
    if f.startswith("monkey_") and f.endswith(".txt"):
        t = read(f)
        done = re.search(r"MONKEY: готово, событий (\d+) за (\d+) с, перезапусков (\d+), выходов из приложения (\d+)", t)
        last = re.findall(r"MONKEY: (\d+) событий за (\d+) с", t)
        monkey_rows.append((f[7:-4], done.group(1) if done else (f"до {last[-1][0]}" if last else "—"),
                            done.group(2) + " с" if done else (f"{last[-1][1]} с" if last else "—"),
                            done.group(3) if done else str(t.count("MONKEY: приложения нет")),
                            done.group(4) if done else "—", "да" if done else "нет"))

errors = collections.Counter()
example = {}
for line in read("errors.txt").splitlines():
    m = re.search(r"\b(E|F[a-z]*|Error|Fault)\b\s+SAFU\[\d+:[0-9a-f]+\]\s+(\[[^\]]+\])?\s*(.*)$", line)
    if not m:
        continue
    key = (m.group(2) or "", re.sub(r"\d+|0x[0-9a-f]+", "#", m.group(3))[:110])
    errors[key] += 1
    example.setdefault(key, m.group(3)[:240])

p = print
p("# Стресс-тест Арктики для iPhone\n")
p(f"Версия **{os.environ.get('APP_VERSION', '?')}** · коммит `{os.environ.get('APP_SHA', '?')}` · ветка `main`  ")
for e in read("env.txt").strip().splitlines():
    p(e + "  ")
p("")
dead = read("dead_after.txt").strip().splitlines()
relaunch = sum(int(r[3]) for r in monkey_rows if r[3].isdigit())
p("| Что | Найдено |")
p("|---|---|")
p(f"| Падения, уникальных | **{len(crashes)}** (всего {sum(c['count'] for c in crashes.values())}) |")
p(f"| «Обезьяна» нашла приложение закрытым | {relaunch} раз |")
p(f"| Приложение не работало после шага | {len(dead)} |")
p(f"| Ошибки в системном журнале приложения, разных | {len(errors)} |")
if harness:
    p(f"| Сбои самого теста (раннер XCTest) | {sum(harness.values())} — это не падения приложения |")
p("")
if harness:
    p("<details><summary>Сбои самого теста</summary>\n")
    for k, v in harness.most_common():
        p(f"- {v}× {k}")
    p("\n</details>\n")
for n, c in enumerate(crashes.values(), 1):
    p(f"### {n}. {c['type']}" + (f" — {c['asi'][0][:160]}" if c["asi"] else ""))
    p(f"\nРаз: **{c['count']}** · этапы: {', '.join(sorted(c['phases']))}\n")
    p("```")
    p("\n".join(c["asi"][1:] + c["stack"]))
    p("```\n")
if dead:
    p("## Приложение не работало после шагов\n")
    for d in dead:
        p(f"- {d}")
    p("")
# завершения процесса и фатальные ошибки — из системного журнала и stderr запусков
ends = collections.Counter()
for line in read("sim_log.txt").splitlines():
    if "safuhub" in line or "SAFU[" in line:
        if re.search(r"(?i)termination|exited|crash|signal|fatal|exception", line):
            ends[re.sub(r"\d{2}:\d{2}:\d{2}\.\d+|\b\d+\b|0x[0-9a-f]+", "#", line.split(" ", 2)[-1])[:220]] += 1
fatal = collections.Counter()
sdir = os.path.join(OUT, "stderr")
for name in os.listdir(sdir) if os.path.isdir(sdir) else []:
    for line in read(os.path.join("stderr", name)).splitlines():
        if re.search(r"Fatal error|fatal error|Terminating app|libc\+\+abi", line):
            fatal[line.strip()[:300]] += 1
if fatal:
    p("## Фатальные ошибки (stderr приложения)\n")
    p("```")
    for line, cnt in fatal.most_common(10):
        p(f"{cnt}× {line}")
    p("```\n")
if ends:
    p("<details><summary>Завершения процесса по системному журналу</summary>\n")
    p("```")
    for line, cnt in ends.most_common(15):
        p(f"{cnt}× {line}")
    p("```\n</details>\n")
found = read("reports_found.txt").strip().splitlines()
p(f"Отчётов о падениях в системе за прогон: {len(found)}" + (" — " + ", ".join(os.path.basename(x) for x in found[:6]) if found else "") + "\n")

p("## «Обезьяна»\n")
p("| Прогон | Событий | Время | Приложение закрыто | Уходов из приложения | Дошла до конца |")
p("|---|---|---|---|---|---|")
for r in monkey_rows:
    p("| " + " | ".join(r) + " |")
p("")
if errors:
    p("<details><summary>Ошибки в системном журнале приложения</summary>\n")
    p("| Раз | Подсистема | Пример |")
    p("|---|---|---|")
    for key, cnt in errors.most_common(30):
        ex = example[key].replace("|", "\\|")
        p(f"| {cnt} | {key[0]} | {ex} |")
    p("\n</details>\n")
steps = read("steps.txt").strip()
if steps:
    p("<details><summary>Шаги</summary>\n\n```")
    p(steps)
    p("```\n</details>")

unfinished = [r[0] for r in monkey_rows if r[5] != "да"]
if unfinished:
    with open(os.path.join(OUT, "INCOMPLETE"), "w") as f:
        f.write("«Обезьяна» не дошла до конца: " + ", ".join(unfinished) + "\n")

if crashes or fatal:
    with open(os.path.join(OUT, "FAILED"), "w") as f:
        f.write(f"Падений: {len(crashes)} уникальных, всего {sum(c['count'] for c in crashes.values())}; "
                f"фатальных ошибок в stderr: {sum(fatal.values())}\n")
