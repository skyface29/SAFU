#!/usr/bin/env python3
"""Страница arktika-app.ru/antiplagiat/ у себя на компьютере — для проверки перед выкладкой.

    python3 antiplagiat/site_dev.py        → http://localhost:8790/antiplagiat/

Отдаёт папку site/ репозитория и по адресу /proxy делает то же, что помощник из antiplagiat-api/
(функция Yandex Cloud или Cloudflare Worker): скачивает страницу по ?url=… и возвращает её как есть.
Страница на localhost сама выбирает /proxy.
По адресу /pulse — счётчик «сейчас на сайте» в памяти (пароль админки — local).
По адресу /ring — «Кольцо САФУ» в памяти (то же, что antiplagiat-api/ring.js, но без YDB; после перезапуска пусто).
По адресу /pay — оплата полной проверки (antiplagiat-api/pay-local.js, нужен Node.js): вместо Robokassa — /pay-fake,
которая сразу «оплачивает» заказ. Блок полной проверки виден, только если помощник сообщает, что поиск Яндекса включён —
у себя это: python3 antiplagiat/site_dev.py --fake-yandex (поиск Яндекса подменяется пустой выдачей).
"""
import hashlib
import json
import os
import secrets
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit
import urllib.error
import urllib.request
import subprocess
import shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, "..", "site"))
sys.path.insert(0, HERE)
from antiplag import sources  # noqa: E402

sources.GUARD = True  # только открытый интернет, как у настоящего помощника
FAKE_YANDEX = "--fake-yandex" in sys.argv
PAY_PORT = 8791
POST_OK = ("https://cyberleninka.ru/api/search",)
MAX = 2_500_000
TYPES = {"html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8",
         "png": "image/png", "mjs": "text/javascript; charset=utf-8", "json": "application/json", "svg": "image/svg+xml", "webmanifest": "application/manifest+json"}


RING_DOCS, RING_IDX = {}, {}


def ring_excerpt(text, positions, win=350, limit=40000):
    wins = []
    for p in sorted(set(x for x in positions if 0 <= x < len(text))):
        a, b = max(0, p - win), min(len(text), p + win)
        if wins and a <= wins[-1][1]:
            wins[-1][1] = max(wins[-1][1], b)
        else:
            wins.append([a, b])
    out, used = [], 0
    for a, b in wins:
        if used + b - a > limit:
            break
        out.append(text[a:b])
        used += b - a
    return "\n…\n".join(out)


def ring_handle(body):
    """Повторяет handle() из antiplagiat-api/ring.js."""
    action = body.get("action")
    if action == "ping":
        return 200, {"ok": True}
    if action == "add":
        text, title = str(body.get("text") or ""), str(body.get("title") or "").strip()[:160]
        fps = body.get("fps")
        if not (1000 <= len(text) <= 600000):
            return 400, {"error": "Текст должен быть от 1 тысячи до 600 тысяч знаков."}
        if not isinstance(fps, list) or not (30 <= len(fps) <= 40000):
            return 400, {"error": "Не удалось разобрать текст."}
        seen = {}
        for f in fps:
            if not (isinstance(f, list) and len(f) == 2 and all(isinstance(x, int) and 0 <= x <= 0xFFFFFFFF for x in f) and f[1] < len(text)):
                return 400, {"error": "Не удалось разобрать текст."}
            seen.setdefault(f[0], f[1])
        doc_id, key = secrets.token_urlsafe(9), secrets.token_urlsafe(15)
        RING_DOCS[doc_id] = {"title": title, "text": text, "created": time.time(), "owner": hashlib.sha256(key.encode()).hexdigest(), "fps": list(seen)}
        for fp, pos in seen.items():
            RING_IDX.setdefault(fp, {})[doc_id] = pos
        return 200, {"id": doc_id, "key": key}
    if action == "query":
        fps = body.get("fps")
        if not isinstance(fps, list) or len(fps) > 40000:
            return 400, {"error": "Слишком большой запрос."}
        lst = set(x for x in fps if isinstance(x, int))
        counts = {}
        for fp in lst:
            for d in RING_IDX.get(fp, {}):
                counts[d] = counts.get(d, 0) + 1
        docs = []
        for d, n in sorted(counts.items(), key=lambda kv: -kv[1])[:8]:
            if n < 6 or d not in RING_DOCS:
                continue
            doc = RING_DOCS[d]
            pos = [RING_IDX[fp][d] for fp in lst if d in RING_IDX.get(fp, {})]
            docs.append({"id": d, "title": doc["title"], "year": time.localtime(doc["created"]).tm_year, "hits": n,
                         "excerpt": ring_excerpt(doc["text"], pos)})
        return 200, {"docs": docs}
    if action == "delete":
        doc = RING_DOCS.get(str(body.get("id")))
        if not doc:
            return 404, {"error": "Работа не найдена — возможно, уже удалена."}
        if hashlib.sha256(str(body.get("key") or "").encode()).hexdigest() != doc["owner"]:
            return 403, {"error": "Неверный ключ удаления."}
        for fp in doc["fps"]:
            RING_IDX.get(fp, {}).pop(str(body.get("id")), None)
        del RING_DOCS[str(body.get("id"))]
        return 200, {"ok": True}
    return 400, {"error": "Неизвестное действие."}


PULSE = {}   # (час, раздел, браузер) → (время, устройство, отпечаток сети)
PULSE_CFG = {"banner": None}


def pulse_device(ua, touch):
    """То же, что device() в stats-api/pulse.js (упрощённо)."""
    import re as _re
    os_ = ("iOS" if _re.search(r"iPhone|iPod", ua) else "iPadOS" if "iPad" in ua or ("Macintosh" in ua and touch)
           else "Android" if "Android" in ua else "Windows" if "Windows" in ua else "macOS" if "Mac OS X" in ua else "Linux" if "Linux" in ua else "другая")
    kind = "tablet" if os_ == "iPadOS" or (os_ == "Android" and "Mobile" not in ua) else "phone" if os_ == "iOS" or "Mobi" in ua else "desktop"
    br = ("Яндекс Браузер" if "YaBrowser" in ua else "Edge" if "Edg" in ua else "Firefox" if "Firefox" in ua
          else "Chrome" if "Chrome" in ua else "Safari" if "Safari" in ua else "другой")
    return kind + "|" + os_ + "|" + br


def pulse_stats():
    now = time.time() * 1000
    h = int(now // 3600e3)
    day = int((now + 3 * 3600e3) // (24 * 3600e3)) * 24 - 3
    def by(cond):
        out = {}
        for (hh, p, sid), (t, _, _) in PULSE.items():
            if cond(hh, t):
                out.setdefault(p, set()).add(sid)
        return {p: len(v) for p, v in out.items()}
    def total(cond):
        return len({sid for (hh, p, sid), (t, _, _) in PULSE.items() if cond(hh, t)})
    def nets(cond):
        return len({n for (hh, p, sid), (t, _, n) in PULSE.items() if cond(hh, t) and n})
    on = lambda hh, t: hh >= h - 1 and t > now - 390e3
    today = lambda hh, t: hh >= day
    hourly, hourly_total, devices = {}, {}, {}
    for (hh, p, sid), (t, dev, _) in PULSE.items():
        if hh >= h - 47:
            hourly.setdefault((hh, p), set()).add(sid)
            hourly_total.setdefault(hh, set()).add(sid)
        if today(hh, t) and dev:
            devices.setdefault(dev, set()).add(sid)
    return {"now": now, "online": by(on), "onlineTotal": total(on), "today": by(today),
            "todayTotal": total(today), "weekTotal": total(lambda hh, t: hh >= h - 167),
            "onlineNets": nets(on), "todayNets": nets(today), "devices": {d: len(v) for d, v in devices.items()},
            "hourlyTotal": [{"h": hh, "n": len(v)} for hh, v in sorted(hourly_total.items())],
            "hourly": [{"h": hh, "p": p, "n": len(v)} for (hh, p), v in sorted(hourly.items())],
            "banner": PULSE_CFG["banner"] if PULSE_CFG["banner"] and (not PULSE_CFG["banner"]["until"] or PULSE_CFG["banner"]["until"] > now) else None,
            "can": {"dispatch": False, "billing": True},
            # пример того, что вернёт выгрузка биллинга (у себя — выдуманные цифры)
            "usage": {"month": time.strftime("%Y-%m"), "cost": 0.0, "updated": time.strftime("%Y-%m-%d"), "files": 11,
                      "free": [{"key": "calls", "label": "Вызовы функций", "unit": "вызовов", "limit": 1e6, "used": 431250},
                               {"key": "compute", "label": "Время работы функций", "unit": "ГБ×ч", "limit": 10, "used": 2.37},
                               {"key": "ydbru", "label": "Запросы к базе YDB", "unit": "RU", "limit": 1e6, "used": 742000},
                               {"key": "ydbgb", "label": "Данные в YDB", "unit": "ГБ", "limit": 1, "used": 0.04}],
                      "skus": [{"service": "Cloud Functions", "sku": "Вызовы функций", "unit": "вызов", "quantity": 431250, "cost": 0},
                               {"service": "Managed Service for YDB", "sku": "Запросы (Request Units)", "unit": "RU", "quantity": 742000, "cost": 0}]}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def reply(self, status, ctype, body, extra=()):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in extra:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def proxy(self, method):
        query = parse_qs(urlsplit(self.path).query)
        url = (query.get("url") or [""])[0]
        if not url:
            return self.reply(200, "application/json", b'{"ok":true,"service":"antiplagiat"}')
        data = None
        if method == "POST":
            if url not in POST_OK:
                return self.reply(403, "application/json", '{"error":"сюда отправлять нельзя"}'.encode())
            length = min(int(self.headers.get("Content-Length") or 0), 10000)
            data = self.rfile.read(length)
        try:
            headers = {"Content-Type": "application/json"} if data else None
            final, ctype, charset, raw, status = sources.http_get(url, timeout=15, max_bytes=MAX, headers=headers,
                                                                  data=data, retries=0)
        except urllib.error.HTTPError as e:
            final, ctype, charset, raw, status = url, e.headers.get_content_type(), e.headers.get_content_charset(), \
                e.read(MAX), e.code
        except sources.Forbidden:
            return self.reply(400, "application/json", '{"error":"адрес не разрешён"}'.encode())
        except Exception as e:
            return self.reply(502, "application/json", json.dumps({"error": str(e)[:200]}).encode())
        ctype = (ctype or "application/octet-stream") + (f"; charset={charset}" if charset else "")
        self.reply(200, ctype, raw[:MAX], [("X-Status", str(status)), ("X-Final-Url", final)])

    def pay(self, body=None):
        req = urllib.request.Request(f"http://127.0.0.1:{PAY_PORT}{self.path}", data=body, method="POST" if body is not None else "GET",
                                     headers={"Content-Type": "application/json"})
        opener = urllib.request.build_opener(type("NoRedirect", (urllib.request.HTTPRedirectHandler,), {"redirect_request": lambda *a: None}))
        try:
            r = opener.open(req, timeout=10)
            status, headers, data = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, headers, data = e.code, e.headers, e.read()
        except OSError:
            return self.reply(503, "application/json", '{"error":"Оплата у себя не запущена: нужен Node.js."}'.encode())
        extra = [("Location", headers["Location"])] if headers.get("Location") else []
        self.reply(status, headers.get("Content-Type") or "application/json", data, extra)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/proxy":
            q = parse_qs(urlsplit(self.path).query)
            if FAKE_YANDEX and not q.get("url"):
                if q.get("ysearch"):
                    t = (q.get("t") or [""])[0]
                    if not t:
                        return self.reply(402, "application/json", '{"error":"нужен код полной проверки"}'.encode())
                    return self.reply(200, "application/json", b'{"done":true,"results":[]}')
                return self.reply(200, "application/json", b'{"ok":true,"service":"antiplagiat","yandex":true,"paid":true}')
            return self.proxy("GET")
        if path == "/pay-fake":
            return self.pay()
        if path == "/pulse":
            if self.headers.get("X-Admin-Token") != "local":
                return self.reply(403, "application/json", '{"error":"Нужен пароль администратора."}'.encode())
            return self.reply(200, "application/json", json.dumps(pulse_stats(), ensure_ascii=False).encode())
        name = path.lstrip("/")
        if not name or name.endswith("/"):
            name += "index.html"
        full = os.path.normpath(os.path.join(SITE, name))
        if os.path.isdir(full):
            return self.reply(301, "text/plain", b"", [("Location", path + "/")])
        if not full.startswith(SITE + os.sep) or not os.path.isfile(full):
            return self.reply(404, "text/plain; charset=utf-8", "Не найдено".encode())
        with open(full, "rb") as f:
            self.reply(200, TYPES.get(full.rsplit(".", 1)[-1], "application/octet-stream"), f.read())

    def do_POST(self):
        if urlsplit(self.path).path == "/proxy":
            return self.proxy("POST")
        if urlsplit(self.path).path == "/pay":
            length = min(int(self.headers.get("Content-Length") or 0), 10000)
            return self.pay(self.rfile.read(length))
        if urlsplit(self.path).path == "/pulse":
            length = min(int(self.headers.get("Content-Length") or 0), 2000)
            try:
                d = json.loads(self.rfile.read(length).decode("utf-8"))
                import re as _re
                now = time.time() * 1000
                js = lambda code, obj: self.reply(code, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False).encode())
                if d.get("action"):
                    if self.headers.get("X-Admin-Token") != "local":
                        return js(403, {"error": "Нужен пароль администратора."})
                    if d["action"] == "banner":
                        text = str(d.get("text") or "").strip()[:300]
                        hours = min(max(float(d.get("hours") or 0), 0), 720)
                        PULSE_CFG["banner"] = {"id": format(int(now), "x"), "text": text, "kind": d.get("kind") if d.get("kind") in ("info", "warn", "ok") else "info",
                                               "sections": [x for x in (d.get("sections") or []) if _re.fullmatch(r"[a-z]{2,20}", str(x))],
                                               "until": now + hours * 3600e3 if hours else 0, "at": now} if text else None
                        return js(200, {"ok": True, "banner": PULSE_CFG["banner"]})
                    if d["action"] == "dispatch":
                        return js(400, {"error": "Кнопки управления не подключены: задайте GH_TOKEN у функции."})
                    return js(400, {"error": "Неизвестная команда."})
                if _re.fullmatch(r"[\w-]{8,40}", str(d.get("s"))) and _re.fullmatch(r"[a-z]{2,20}", str(d.get("p"))):
                    ip = (self.headers.get("X-Forwarded-For") or self.client_address[0]).split(",")[0].strip()
                    PULSE[(int(now // 3600e3), d["p"], d["s"])] = (now, pulse_device(self.headers.get("User-Agent") or "", d.get("m") == 1),
                                                                   hashlib.sha256(("net|" + time.strftime("%Y-%m-%d") + ip).encode()).hexdigest()[:16])
                    b = PULSE_CFG["banner"]
                    live = b and (not b["until"] or b["until"] > now) and (not b["sections"] or d["p"] in b["sections"])
                    return js(200, {"b": {"id": b["id"], "text": b["text"], "kind": b["kind"]}} if live else {})
            except ValueError:
                pass
            return self.reply(400, "text/plain", b"bad")
        if urlsplit(self.path).path == "/ring":
            length = min(int(self.headers.get("Content-Length") or 0), 3_000_000)
            try:
                status, obj = ring_handle(json.loads(self.rfile.read(length).decode("utf-8")))
            except ValueError:
                status, obj = 400, {"error": "Запрос не разобран."}
            return self.reply(status, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False).encode())
        self.reply(404, "text/plain", b"")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    port = int(args[0]) if args else 8790
    PAY_PORT = port + 1
    if shutil.which("node"):
        subprocess.Popen(["node", os.path.join(HERE, "..", "antiplagiat-api", "pay-local.js"), str(PAY_PORT), f"http://localhost:{port}"])
    print(f"Страница: http://localhost:{port}/antiplagiat/  (остановить — Ctrl+C)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
