#!/usr/bin/env python3
"""Страница arktika-app.ru/antiplagiat/ у себя на компьютере — для проверки перед выкладкой.

    python3 antiplagiat/site_dev.py        → http://localhost:8790/antiplagiat/

Отдаёт папку site/ репозитория и по адресу /proxy делает то же, что помощник из antiplagiat-api/
(функция Yandex Cloud или Cloudflare Worker): скачивает страницу по ?url=… и возвращает её как есть.
Страница на localhost сама выбирает /proxy.
"""
import json
import os
import sys
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
        self.reply(404, "text/plain", b"")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8790
    print(f"Страница: http://localhost:{port}/antiplagiat/  (остановить — Ctrl+C)", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
