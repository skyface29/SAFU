#!/usr/bin/env python3
"""Сайт версий: собирает _site/versions.json из «Что нового» в коде приложений, релизов GitHub
и стресс-тестов в Actions. Черновики тоже попадают, но без файлов: пользователь видит, что версия
в работе, а скачать её можно, только когда релиз опубликуют.

Запуск в GitHub Actions (site.yml): GH_TOKEN, GITHUB_REPOSITORY; ветки с Android и Electron — ANDROID_REF,
ELECTRON_REF (если в рабочей копии этих файлов нет). Черновики API отдаёт только токену с правом записи;
локально без GH_TOKEN (публичный API) их не будет.
"""
import datetime as dt
import io
import json
import os
import re
import shutil
import subprocess
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "_site")
REPO = os.environ.get("GITHUB_REPOSITORY", "skyface29/SAFU")
TOKEN = os.environ.get("GH_TOKEN", "")
ANDROID_PATH = "android/app/src/main/java/ru/student/safuhub/screens/developer/Developer.kt"
ELECTRON_PATH = "windows/src/pages/Profile.tsx"
PLATFORMS = ["iPhone", "Mac", "Android", "Windows", "Linux"]


def api(path):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/{path}",
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "arktika-site"})
    if TOKEN:
        req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def read_source(path, ref_env):
    """Файл из ветки ref_env (там «Что нового» новее, пока её не влили в main), иначе — из рабочей копии"""
    ref = os.environ.get(ref_env, "")
    if ref:
        r = subprocess.run(["git", "-C", ROOT, "show", f"origin/{ref}:{path}"], capture_output=True)
        if r.returncode == 0:
            return r.stdout.decode("utf-8", "replace")
    p = os.path.join(ROOT, path)
    return open(p, encoding="utf-8").read() if os.path.exists(p) else ""


def unescape(s):
    return s.encode("latin-1", "backslashreplace").decode("unicode_escape").encode("latin-1").decode("utf-8") if "\\" in s else s


def strings(block, q):
    if q == '"':
        return [unescape(m) for m in re.findall(r'"((?:[^"\\]|\\.)*)"', block)]
    return [m.replace("\\'", "'") for m in re.findall(r"'((?:[^'\\]|\\.)*)'", block)]


def norm(v):
    """19.8.0 → 19.8: в релизах Windows три числа, в «Что нового» — как в приложении"""
    p = [int(x) for x in re.findall(r"\d+", v)]
    while len(p) > 2 and p[-1] == 0:
        p.pop()
    return ".".join(map(str, p))


# ---------- «Что нового» из кода ----------
notes = {p: {} for p in PLATFORMS}

with zipfile.ZipFile(os.path.join(ROOT, "SAFU.zip")) as z:
    sw = z.read("SAFU/Sources/Developer.swift").decode("utf-8")
for m in re.finditer(r'ChangelogEntry\(version: "([^"]+)", items: \[(.*?)\]\)', sw, re.S):
    notes["iPhone"].setdefault(norm(m.group(1)), strings(m.group(2), '"'))

kt = read_source(ANDROID_PATH, "ANDROID_REF")
for m in re.finditer(r'ChangelogEntry\("([^"]+)", listOf\((.*?)\)\)', kt, re.S):
    notes["Android"].setdefault(norm(m.group(1)), strings(m.group(2), '"'))

# Windows собирается из трёх веток, и в каждой свои последние версии: берём «Что нового» из всех
for ref_env in ("ELECTRON_REF", "ANDROID_REF", ""):
    ts = read_source(ELECTRON_PATH, ref_env)
    if "const CHANGELOG" not in ts:
        continue
    cl = ts[ts.index("const CHANGELOG"):]
    for m in re.finditer(r"\{ version: '([^']+)', items: \[(.*?)\] \}", cl[:cl.index("\n]\n") + 3], re.S):
        # «19.9.2 для Windows и Linux» — одна запись на обе системы
        v = m.group(1)
        plats = ["Windows", "Linux"] if "Windows" in v and "Linux" in v else ["Linux" if "Linux" in v else "Windows"]
        for plat in plats:
            notes[plat].setdefault(norm(v), strings(m.group(2), "'"))

# версии, которых нет в «Что нового» самих приложений: самые ранние, убранные позже и Mac
extra = json.load(open(os.path.join(HERE, "history-extra.json"), encoding="utf-8"))
extra_notes = {}
for e in extra:
    extra_notes[(e["platform"], norm(e["version"]))] = e


# ---------- релизы: вышедшие и черновики ----------
TAGS = [("mac-build-", "Mac"), ("build-", "iPhone"), ("android-", "Android"), ("win-", "Windows"), ("linux-", "Linux")]
MAIN_ASSET = {"iPhone": r"-v[\d.]+-build\d+\.ipa$|\.ipa$", "Mac": r"\.dmg$", "Android": r"\.apk$", "Windows": r"\.exe$",
              "Linux": r"\.(AppImage|deb|rpm)$"}
releases = []
page = 1
while True:
    chunk = api(f"releases?per_page=100&page={page}")
    releases += chunk
    if len(chunk) < 100:
        break
    page += 1

best = {}
for r in releases:
    tag = r.get("tag_name", "")
    plat = next((p for pre, p in TAGS if tag.startswith(pre)), None)
    m = re.search(r"(\d+(?:\.\d+)+)", r.get("name") or "")
    b = re.search(r"сборка (\d+)", r.get("name") or "")
    if not plat or not m:
        continue
    v = norm(m.group(1))
    build = int(b.group(1)) if b else 0
    draft = bool(r.get("draft"))
    key = (plat, v)
    # вышедшая сборка версии важнее черновика той же версии, среди равных — с бо́льшим номером
    if key in best and (best[key]["draft"], -best[key]["build"]) <= (draft, -build):
        continue
    # файлы и страница черновика видны только участникам репозитория — на сайт их не выносим
    assets = [] if draft else [a for a in r.get("assets", []) if re.search(MAIN_ASSET[plat], a["name"], re.I)]
    # у iPhone два одинаковых файла: с номером версии и SAFU.ipa — оставляем первый
    if plat == "iPhone":
        assets = sorted(assets, key=lambda a: a["name"] == "SAFU.ipa")[:1]
    when = (r.get("created_at") if draft else r.get("published_at")) or ""
    best[key] = {
        "platform": plat, "version": v, "build": build, "draft": draft,
        "date": (dt.datetime.strptime(when, "%Y-%m-%dT%H:%M:%SZ") + dt.timedelta(hours=3)).strftime("%Y-%m-%d") if when else "",
        "published": when,
        # из какого коммита собрано: у черновиков из веток тут SHA, у сборок main — просто «main»
        "commit": r.get("target_commitish") or "",
        "page": "" if draft else r.get("html_url", ""),
        "downloads": [{"name": a["name"], "url": a["browser_download_url"], "size": a.get("size", 0)} for a in assets],
    }

rows = []
for (plat, v), rel in best.items():
    items, note = notes[plat].get(v), ""
    if items is None and (plat, v) in extra_notes:
        items, note = extra_notes[(plat, v)]["items"], extra_notes[(plat, v)].get("note", "")
    if items is None and plat == "Mac" and v in notes["iPhone"]:
        items, note = notes["iPhone"][v], "Mac собирается из того же кода, что и iPhone этой версии"
    rel.update({"items": items or [], "note": note if items else "Список изменений этой сборки не сохранился"})
    rows.append(rel)

# public — вышла, скачать можно; work — самый новый черновик, новее всего вышедшего: над ним идёт работа;
# test — черновик, который так и не вышел для всех: его изменения вошли в следующие версии
newest = {}
for plat in PLATFORMS:
    mine = sorted((r for r in rows if r["platform"] == plat), key=lambda r: [int(x) for x in r["version"].split(".")], reverse=True)
    for r in mine:
        r["status"] = "test" if r["draft"] else "public"
    if mine:
        newest[plat] = mine[0]
        if mine[0]["draft"]:
            mine[0]["status"] = "work"


# ---------- стресс-тесты: прогон после выпуска (или сборки черновика) самой новой версии ----------
STRESS = {"iPhone": "ios-stress.yml", "Android": "android-stress.yml", "Linux": "linux-stress.yml", "Windows": "linux-stress.yml"}
WHAT = {"iPhone": "симулятор iPhone", "Android": "эмулятор Android", "Linux": "Ubuntu, собранный .deb",
        "Windows": "тот же код на Linux"}
for plat, wf in STRESS.items():
    latest = newest.get(plat)
    if not latest:
        continue
    try:
        runs = api(f"actions/workflows/{wf}/runs?per_page=15").get("workflow_runs", [])
    except Exception:
        continue
    # тест мог начаться, пока сборка ещё шла: проверяет он код коммита, поэтому считаем от времени коммита
    # (если релиз указывает на SHA), но не позже самого релиза
    since = latest["published"]
    if re.fullmatch(r"[0-9a-f]{40}", latest["commit"]):
        try:
            since = min(since or "9", api(f"commits/{latest['commit']}")["commit"]["committer"]["date"])
        except Exception:
            pass
    after = [x for x in runs if x.get("created_at", "") >= since]
    done = [x for x in after if x["status"] == "completed" and x["conclusion"] in ("success", "failure")]
    if done and done[0]["conclusion"] == "success":
        latest["test"] = "passed"
        latest["testNote"] = f"Стресс-тест ({WHAT[plat]}): тысячи случайных нажатий без падений"
    elif any(x["status"] != "completed" for x in after):
        latest["test"] = "running"
        latest["testNote"] = f"Идёт стресс-тест ({WHAT[plat]})"

for r in rows:
    r.pop("published", None)
    r.pop("draft", None)
    r.pop("commit", None)
rows.sort(key=lambda r: (PLATFORMS.index(r["platform"]), [-int(x) for x in (r["version"].split(".") + ["0"] * 4)[:4]]))

os.makedirs(OUT, exist_ok=True)
# og.png — картинка превью ссылки (Telegram и мессенджеры)
for name in ("index.html", "og.png", "CNAME"):
    if os.path.exists(os.path.join(HERE, name)):
        shutil.copy(os.path.join(HERE, name), os.path.join(OUT, name))
# raspisanie/ — зеркало расписания РУЗ САФУ (arktika-app.ru/raspisanie/); данные — из ветки ruz-data (ruz.yml)
if os.path.isdir(os.path.join(HERE, "raspisanie")):
    shutil.copytree(os.path.join(HERE, "raspisanie"), os.path.join(OUT, "raspisanie"), dirs_exist_ok=True)
    data = os.path.join(ROOT, "ruz-data")
    if os.path.isdir(data):
        shutil.copytree(data, os.path.join(OUT, "raspisanie", "data"), dirs_exist_ok=True, ignore=shutil.ignore_patterns(".git", "*.md"))
        print("расписание:", len(os.listdir(os.path.join(data, "snapshots"))) - 1 if os.path.isdir(os.path.join(data, "snapshots")) else 0, "копий в архиве")
json.dump({"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "repo": REPO, "versions": rows},
          open(os.path.join(OUT, "versions.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
from collections import Counter
print("версий на сайте:", len(rows), dict(Counter(r["platform"] for r in rows)))
print("в работе:", [f'{r["platform"]} {r["version"]}' for r in rows if r["status"] == "work"],
      "тестовых сборок:", sum(r["status"] == "test" for r in rows))
print("без списка изменений:", [f'{r["platform"]} {r["version"]}' for r in rows if not r["items"]])
