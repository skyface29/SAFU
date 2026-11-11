#!/usr/bin/env python3
"""Страница arktika-app.ru/antiplagiat/ у себя на компьютере — для проверки перед выкладкой.

    python3 antiplagiat/site_dev.py        → http://localhost:8790/antiplagiat/

Отдаёт папку site/ репозитория и по адресу /proxy делает то же, что помощник из antiplagiat-api/
(функция Yandex Cloud или Cloudflare Worker): скачивает страницу по ?url=… и возвращает её как есть.
Страница на localhost сама выбирает /proxy.
По адресу /pulse — счётчик «сейчас на сайте» в памяти (пароль админки — local).
По адресу /ring — «Кольцо САФУ» в памяти (то же, что antiplagiat-api/ring.js, но без YDB; после перезапуска пусто).
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

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.normpath(os.path.join(HERE, "..", "site"))
sys.path.insert(0, HERE)
from antiplag import sources  # noqa: E402

sources.GUARD = True  # только открытый интернет, как у настоящего помощника
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


PULSE = {}   # (час, раздел, браузер) → время


def pulse_stats():
    now = time.time() * 1000
    h = int(now // 3600e3)
    day = int((now + 3 * 3600e3) // (24 * 3600e3)) * 24 - 3
    def by(cond):
        out = {}
        for (hh, p, sid), t in PULSE.items():
            if cond(hh, t):
                out.setdefault(p, set()).add(sid)
        return {p: len(v) for p, v in out.items()}
    def total(cond):
        return len({sid for (hh, p, sid), t in PULSE.items() if cond(hh, t)})
    on = lambda hh, t: hh >= h - 1 and t > now - 390e3
    hourly = {}
    for (hh, p, sid), t in PULSE.items():
        if hh >= h - 47:
            hourly.setdefault((hh, p), set()).add(sid)
    return {"now": now, "online": by(on), "onlineTotal": total(on), "today": by(lambda hh, t: hh >= day),
            "todayTotal": total(lambda hh, t: hh >= day), "weekTotal": total(lambda hh, t: hh >= h - 167),
            "hourly": [{"h": hh, "p": p, "n": len(v)} for (hh, p), v in sorted(hourly.items())],
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

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/proxy":
            return self.proxy("GET")
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
        if urlsplit(self.path).path == "/pulse":
            length = min(int(self.headers.get("Content-Length") or 0), 2000)
            try:
                d = json.loads(self.rfile.read(length).decode("utf-8"))
                import re as _re
                if _re.fullmatch(r"[\w-]{8,40}", str(d.get("s"))) and _re.fullmatch(r"[a-z]{2,20}", str(d.get("p"))):
                    now = time.time() * 1000
                    PULSE[(int(now // 3600e3), d["p"], d["s"])] = now
                    return self.reply(204, "text/plain", b"")
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    print(f"Страница: http://localhost:{port}/antiplagiat/  (остановить — Ctrl+C)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
