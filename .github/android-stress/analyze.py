#!/usr/bin/env python3
"""Разбор результатов стресс-теста: падения, ANR, нативные падения, ошибки в логе,
скорость запуска, память, рывки. Печатает отчёт в Markdown; при падениях и ANR создаёт FAILED."""
import collections
import os
import re
import sys

PKG = "ru.student.safuhub"
OUT = sys.argv[1] if len(sys.argv) > 1 else "stress-out"


def read(name):
    try:
        with open(os.path.join(OUT, name), encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""


LINE = re.compile(r"^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+(.*?)\s*: (.*)$")


def norm(s):
    """Сигнатура без чисел и адресов — чтобы одинаковые падения склеивались"""
    s = re.sub(r"0x[0-9a-f]+", "#", s)
    s = re.sub(r"\d+", "#", s)
    return s.strip()[:200]


logcat = read("logcat.txt").splitlines()
phase = "start"
app_pids = set()
crashes = collections.OrderedDict()   # сигнатура → {count, phases, trace}
anrs = collections.OrderedDict()
natives = collections.OrderedDict()
errors = collections.Counter()
error_example = {}
deaths = collections.Counter()
skipped = []
i = 0
while i < len(logcat):
    raw = logcat[i]
    m = LINE.match(raw)
    if not m:
        i += 1
        continue
    _, pid, _tid, lvl, tag, msg = m.groups()
    if tag == "STRESS" and msg.startswith("phase "):
        phase = msg[6:]
    # процессы приложения
    pm = re.search(r"Start proc (\d+):%s[/ ]" % re.escape(PKG), msg)
    if pm:
        app_pids.add(pm.group(1))
    if tag == "am_proc_start" and PKG in msg:
        pm = re.search(r"\[\d+,(\d+),\d+,%s" % re.escape(PKG), msg)
        if pm:
            app_pids.add(pm.group(1))
    if tag == "AndroidRuntime" and msg.startswith("FATAL EXCEPTION"):
        trace = [msg]
        j = i + 1
        while j < len(logcat):
            mm = LINE.match(logcat[j])
            if not mm or mm.group(5) != "AndroidRuntime" or mm.group(2) != pid:
                break
            trace.append(mm.group(6))
            j += 1
        if any(PKG in t for t in trace[:3]):
            exc = next((t for t in trace if not t.startswith(("FATAL", "Process:"))), "?")
            frame = next((t.strip() for t in trace if t.strip().startswith("at " + PKG)), "")
            sig = norm(exc.split(":")[0] + " | " + frame) if frame else norm(exc)
            c = crashes.setdefault(sig, {"count": 0, "phases": set(), "trace": trace})
            c["count"] += 1
            c["phases"].add(phase)
        i = j
        continue
    if tag == "ActivityManager" and msg.startswith("ANR in " + PKG):
        block = [msg]
        j = i + 1
        while j < len(logcat) and len(block) < 14:
            mm = LINE.match(logcat[j])
            if mm and mm.group(5) == "ActivityManager":
                block.append(mm.group(6))
            j += 1
        reason = next((b for b in block if b.startswith("Reason:")), "Reason: ?")
        a = anrs.setdefault(norm(reason), {"count": 0, "phases": set(), "block": block})
        a["count"] += 1
        a["phases"].add(phase)
    if lvl == "F" and tag == "libc" and "Fatal signal" in msg and (PKG in msg or pid in app_pids):
        n = natives.setdefault(norm(msg), {"count": 0, "phases": set(), "msg": msg, "bt": []})
        n["count"] += 1
        n["phases"].add(phase)
    if lvl == "F" and tag == "DEBUG" and natives and re.match(r"\s*#\d\d pc", msg):
        last = next(reversed(natives.values()))
        if len(last["bt"]) < 20:
            last["bt"].append(msg.strip())
    if tag in ("ActivityManager", "am_proc_died", "am_kill") and PKG in msg and ("died" in msg or "Killing" in msg or tag != "ActivityManager"):
        why = re.sub(r"\d+", "#", msg)
        deaths[(phase, why[:140])] += 1
    if pid in app_pids:
        if lvl in "EF" and tag not in ("AndroidRuntime",) and not msg.lstrip().startswith(("at ", "...", "Caused by")):
            key = (tag, norm(msg)[:120])
            errors[key] += 1
            error_example.setdefault(key, (phase, msg[:300]))
        if tag == "Choreographer" and "Skipped" in msg:
            sk = re.search(r"Skipped (\d+) frames", msg)
            if sk:
                skipped.append((int(sk.group(1)), phase))
    i += 1

# monkey: что заметил он сам
monkey_rows = []
for f in sorted(os.listdir(OUT)) if os.path.isdir(OUT) else []:
    if not f.startswith("monkey_"):
        continue
    t = read(f)
    inj = re.search(r"Events injected: (\d+)", t)
    monkey_rows.append((f[7:-4], inj.group(1) if inj else "—",
                        t.count("// CRASH:"), t.count("// NOT RESPONDING:"),
                        "да" if "Monkey finished" in t else "нет"))

# dropbox — то, что система записала о падениях
def dropbox_count(name):
    return len(re.findall(r"^Process: %s" % re.escape(PKG), read(name), re.M))


db_crash, db_anr, db_native = dropbox_count("dropbox_crash.txt"), dropbox_count("dropbox_anr.txt"), dropbox_count("dropbox_native.txt")

startup = collections.defaultdict(list)
for row in read("startup.txt").splitlines():
    p = row.split()
    if len(p) == 2 and p[1].isdigit() and int(p[1]) > 0:
        startup[p[0]].append(int(p[1]))

mem = re.search(r"TOTAL PSS:\s+(\d+)", read("meminfo.txt")) or re.search(r"TOTAL\s+(\d+)", read("meminfo.txt"))
gfx = read("gfxinfo.txt")
frames = re.search(r"Total frames rendered: (\d+)", gfx)
janky = re.search(r"Janky frames: (\d+) \(([\d.]+)%\)", gfx)
p90 = re.search(r"90th percentile: (\d+)ms", gfx)

# ── отчёт ─────────────────────────────────────────────────────────────────────────────
p = print
p("# Стресс-тест Арктики для Android\n")
env = read("env.txt").strip()
version = os.environ.get("APP_VERSION", "?")
p(f"Версия **{version}** · коммит `{os.environ.get('APP_SHA', '?')}` · ветка `{os.environ.get('APP_REF', '?')}`  ")
for e in env.splitlines():
    p(e + "  ")
p("")
p("| Что | Найдено |")
p("|---|---|")
p(f"| Падения (Java/Kotlin), уникальных | **{len(crashes)}** (всего {sum(c['count'] for c in crashes.values())}, в dropbox {db_crash}) |")
p(f"| Зависания (ANR), уникальных | **{len(anrs)}** (всего {sum(a['count'] for a in anrs.values())}, в dropbox {db_anr}) |")
p(f"| Нативные падения | **{len(natives)}** (в dropbox {db_native}) |")
dead = read("dead_after.txt").strip().splitlines()
p(f"| Приложение не работало после шага | {len(dead)} |")
p(f"| Ошибки в логе приложения (E/F), разных | {len(errors)} |")
p("")

if crashes:
    p("## Падения\n")
    for n, (sig, c) in enumerate(crashes.items(), 1):
        p(f"### {n}. {c['trace'][2] if len(c['trace']) > 2 else sig}\n")
        p(f"Раз: **{c['count']}** · этапы: {', '.join(sorted(c['phases']))}\n")
        p("```")
        p("\n".join(c["trace"][:40]))
        p("```\n")
if anrs:
    p("## Зависания (ANR)\n")
    for n, (sig, a) in enumerate(anrs.items(), 1):
        p(f"### {n}. {sig}\n")
        p(f"Раз: **{a['count']}** · этапы: {', '.join(sorted(a['phases']))}\n")
        p("```")
        p("\n".join(a["block"]))
        p("```\n")
if natives:
    p("## Нативные падения\n")
    for sig, n in natives.items():
        p(f"- {n['msg']} — {n['count']} раз, этапы: {', '.join(sorted(n['phases']))}")
        if n["bt"]:
            p("```")
            p("\n".join(n["bt"]))
            p("```")
    p("")
if dead:
    p("## Приложение не работало после шагов\n")
    for d in dead:
        p(f"- {d}")
    p("")

p("## Monkey\n")
p("| Прогон | Событий | CRASH | ANR | Дошёл до конца |")
p("|---|---|---|---|---|")
for r in monkey_rows:
    p("| " + " | ".join(str(x) for x in r) + " |")
p("")

p("## Скорость и память\n")
for k, v in startup.items():
    p(f"- Холодный запуск ({k}): {', '.join(map(str, v))} мс, медиана **{sorted(v)[len(v) // 2]} мс**")
if mem:
    p(f"- Память в конце (PSS): **{int(mem.group(1)) // 1024} МБ**")
if frames and janky:
    p(f"- Кадров: {frames.group(1)}, с рывками: {janky.group(1)} ({janky.group(2)}%)" + (f", 90-й перцентиль {p90.group(1)} мс" if p90 else ""))
if skipped:
    worst = sorted(skipped, reverse=True)[:5]
    p(f"- Пропуски кадров главного потока: {len(skipped)} раз, худшие: " + ", ".join(f"{s} ({ph})" for s, ph in worst))
p("\n_Debug-сборка на эмуляторе без видеокарты: время и рывки завышены, сравнивать только между прогонами._\n")

if deaths:
    p("<details><summary>Смерти процесса (по этапам)</summary>\n")
    for (ph, why), cnt in deaths.most_common(30):
        p(f"- {ph}: {why} ×{cnt}")
    p("\n</details>\n")

if errors:
    p("<details><summary>Ошибки в логе приложения (без падений)</summary>\n")
    p("| Раз | Тег | Пример (этап) |")
    p("|---|---|---|")
    for (tag, _), cnt in errors.most_common(40):
        ph, ex = error_example[(tag, _)]
        ex = ex.replace("|", "\\|")
        p(f"| {cnt} | {tag} | {ex} ({ph}) |")
    p("\n</details>\n")

steps = read("steps.txt").strip()
if steps:
    p("<details><summary>Шаги</summary>\n\n```")
    p(steps)
    p("```\n</details>")

if crashes or anrs or natives or db_crash or db_anr or db_native:
    with open(os.path.join(OUT, "FAILED"), "w") as f:
        f.write(f"Падений: {len(crashes)}, ANR: {len(anrs)}, нативных: {len(natives)} "
                f"(dropbox: {db_crash}/{db_anr}/{db_native})\n")
