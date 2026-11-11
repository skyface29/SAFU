#!/usr/bin/env python3
"""Айсберг — бесплатная проверка текста на заимствования.

На своём компьютере:   python3 app.py            → http://localhost:8765
На сервере (публично): python3 app.py --public   → за nginx, либо через passenger_wsgi.py

Нужен только Python 3.8+; сторонние библиотеки не требуются.

В публичном режиме сервис открыт всем, поэтому:
  • коллекция документов и ввод ключей через интерфейс отключены;
  • число проверок с одного адреса и одновременных проверок ограничено;
  • скачиваются только страницы из открытого интернета (защита от обращений во внутреннюю сеть);
  • состояние проверок хранится в файлах, чтобы работать при нескольких процессах сервера.
"""
import base64
import json
import os
import re
import sys
import threading
import time
import uuid
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from antiplag import extract, sources
from antiplag.check import Job, run_check

ROOT = os.path.dirname(os.path.abspath(__file__))
STATIC = os.path.join(ROOT, "static")
LIBRARY = os.path.join(ROOT, "library")
JOBS_DIR = os.path.join(ROOT, "jobs")
CONFIG = os.path.join(ROOT, "config.json")

PUBLIC = os.environ.get("ICEBERG_PUBLIC") == "1" or "--public" in sys.argv
MAX_BODY = (15 if PUBLIC else 40) * 1024 * 1024
MAX_TEXT = 600_000 if PUBLIC else 2_000_000
MAX_RUNNING = int(os.environ.get("ICEBERG_MAX_RUNNING") or 3)      # одновременных проверок на сервере
PER_IP_HOUR = int(os.environ.get("ICEBERG_PER_HOUR") or 12)        # проверок в час с одного адреса
KEEP_SECONDS = 3600                                               # сколько хранится готовый отчёт
# С каких сайтов страница может обращаться к этому серверу (если она лежит отдельно, например на GitHub Pages).
ORIGINS = [o.strip().rstrip("/") for o in (os.environ.get("ICEBERG_ORIGINS") or "https://arktika-app.ru").split(",")
           if o.strip()]

JOBS = {}
JOBS_LOCK = threading.Lock()
HITS = {}  # адрес -> моменты запуска проверок

if PUBLIC:
    sources.GUARD = True


class Refuse(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def load_keys():
    try:
        with open(CONFIG, encoding="utf-8") as f:
            data = json.load(f)
        return {k: str(v).strip() for k, v in data.items() if k in ("brave", "google", "google_cx") and v}
    except (OSError, ValueError):
        return {}


def save_keys(data):
    old = load_keys()
    keys = {}
    for k in ("brave", "google", "google_cx"):
        value = str(data.get(k) or "").strip()
        keys[k] = old.get(k, "") if value == "__keep__" else value
    with open(CONFIG, "w", encoding="utf-8") as f:
        json.dump({k: v for k, v in keys.items() if v}, f, ensure_ascii=False, indent=2)


def safe_name(name):
    name = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", name or "документ")
    name = re.sub(r"[^\w .,()\-]+", "_", name, flags=re.UNICODE).strip(" ._")
    return (name or "документ")[:120]


def library_list():
    if not os.path.isdir(LIBRARY):
        return []
    out = []
    for name in sorted(os.listdir(LIBRARY)):
        if name.lower().endswith(".txt"):
            out.append({"name": name[:-4], "size": os.path.getsize(os.path.join(LIBRARY, name))})
    return out


# --- состояние проверок ---------------------------------------------------------
def job_file(job_id, suffix=".json"):
    return os.path.join(JOBS_DIR, job_id + suffix)


def snapshot(job):
    out = {"stage": job.stage, "progress": job.progress, "log": job.log, "done": job.done,
           "error": job.error, "counters": job.counters}
    if job.done and job.result is not None:
        out["result"] = job.result
    return out


def write_snapshot(job_id, job):
    """Сохраняет состояние в файл — так его увидит и соседний процесс сервера."""
    try:
        os.makedirs(JOBS_DIR, exist_ok=True)
        tmp = job_file(job_id, ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(snapshot(job), f, ensure_ascii=False)
        os.replace(tmp, job_file(job_id))
    except OSError:
        pass


def sweep():
    """Удаляет отчёты старше часа: из памяти и с диска."""
    now = time.time()
    with JOBS_LOCK:
        for key in [k for k, j in JOBS.items() if j.done and now - getattr(j, "finished_at", now) > KEEP_SECONDS]:
            JOBS.pop(key, None)
    if os.path.isdir(JOBS_DIR):
        for name in os.listdir(JOBS_DIR):
            path = os.path.join(JOBS_DIR, name)
            try:
                if now - os.path.getmtime(path) > KEEP_SECONDS:
                    os.remove(path)
            except OSError:
                pass


def worker(job_id, job, text, opts):
    stop = threading.Event()

    def flush():
        while not stop.wait(1.0):
            if os.path.exists(job_file(job_id, ".cancel")):
                job.cancelled = True
            write_snapshot(job_id, job)

    if PUBLIC:
        threading.Thread(target=flush, daemon=True).start()
    try:
        job.result = run_check(text, opts, job, library_dir=None if PUBLIC else LIBRARY, keys=load_keys())
        job.progress = 1.0
        job.stage = "Готово"
    except Exception as e:  # сообщение уходит в интерфейс
        job.error = str(e) or e.__class__.__name__
    finally:
        job.done = True
        job.finished_at = time.time()
        stop.set()
        if PUBLIC:
            write_snapshot(job_id, job)
        sweep()


def start_check(data, ip):
    text = str(data.get("text") or "")
    if len(text) > MAX_TEXT:
        raise Refuse(f"Текст слишком большой — больше {MAX_TEXT // 1000} тысяч знаков. Разбейте его на части.")
    opts = data.get("options") or {}
    if not isinstance(opts, dict):
        opts = {}
    if PUBLIC:
        opts["use_library"] = False
        opts["urls"] = [u for u in (opts.get("urls") or []) if isinstance(u, str)][:10]
        now = time.time()
        with JOBS_LOCK:
            recent = [t for t in HITS.get(ip, []) if now - t < 3600]
            mine = sum(1 for j in JOBS.values() if not j.done and getattr(j, "ip", None) == ip)
            running = sum(1 for j in JOBS.values() if not j.done)
            if mine:
                raise Refuse("Ваша предыдущая проверка ещё идёт — дождитесь её окончания.", 429)
            if len(recent) >= PER_IP_HOUR:
                raise Refuse("Слишком много проверок за час с вашего адреса. Попробуйте позже.", 429)
            if running >= MAX_RUNNING:
                raise Refuse("Сервис сейчас занят другими проверками. Попробуйте через пару минут.", 429)
            HITS[ip] = recent + [now]
    job = Job()
    job.ip = ip
    job_id = uuid.uuid4().hex
    with JOBS_LOCK:
        JOBS[job_id] = job
    threading.Thread(target=worker, args=(job_id, job, text, opts), daemon=True).start()
    return {"id": job_id}


def job_status(job_id):
    if not re.fullmatch(r"[0-9a-f]{32}", job_id or ""):
        raise Refuse("Проверка не найдена.", 404)
    job = JOBS.get(job_id)
    if job:
        return snapshot(job)
    try:  # проверку ведёт другой процесс сервера
        with open(job_file(job_id), encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        raise Refuse("Проверка не найдена или отчёт уже удалён.", 404)


# --- обработка запросов (общая для своего сервера и для WSGI) --------------------
TYPES = {"html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8",
         "css": "text/css; charset=utf-8", "svg": "image/svg+xml", "txt": "text/plain; charset=utf-8"}


def as_json(obj, status=200):
    return status, "application/json; charset=utf-8", json.dumps(obj, ensure_ascii=False).encode("utf-8")


def handle(method, target, body, ip):
    """Возвращает (код ответа, тип содержимого, тело)."""
    url = urlsplit(target)
    path = url.path
    try:
        if method == "GET":
            if path == "/api/status":
                return as_json(job_status(parse_qs(url.query).get("id", [""])[0]))
            if path == "/api/settings":
                keys = {} if PUBLIC else load_keys()
                return as_json({"public": PUBLIC, "brave": bool(keys.get("brave")), "google": bool(keys.get("google")),
                                "google_cx": keys.get("google_cx", ""), "max_text": MAX_TEXT})
            if path == "/api/library":
                return as_json({"items": [] if PUBLIC else library_list()})
            name = "index.html" if path in ("/", "") else path.lstrip("/")
            full = os.path.normpath(os.path.join(STATIC, name))
            if not full.startswith(STATIC + os.sep) or not os.path.isfile(full):
                return 404, "text/plain; charset=utf-8", "Страница не найдена".encode("utf-8")
            with open(full, "rb") as f:
                return 200, TYPES.get(full.rsplit(".", 1)[-1], "application/octet-stream"), f.read()
        if method != "POST":
            return as_json({"error": "Метод не поддерживается."}, 405)
        try:
            data = json.loads(body.decode("utf-8")) if body else {}
        except ValueError:
            raise Refuse("Запрос не разобран.")
        if not isinstance(data, dict):
            raise Refuse("Запрос не разобран.")
        if path == "/api/check":
            return as_json(start_check(data, ip))
        if path == "/api/cancel":
            job_id = str(data.get("id") or "")
            if re.fullmatch(r"[0-9a-f]{32}", job_id):
                job = JOBS.get(job_id)
                if job:
                    job.cancelled = True
                elif PUBLIC and os.path.exists(job_file(job_id)):
                    open(job_file(job_id, ".cancel"), "w").close()
            return as_json({"ok": True})
        if path == "/api/extract":
            try:
                raw = base64.b64decode(data.get("data") or "")
            except ValueError:
                raise Refuse("Файл не прочитан.")
            name = str(data.get("name") or "").lower()
            try:
                if name.endswith(".docx"):
                    text, flags = extract.docx_to_text(raw)
                elif name.endswith(".pdf"):
                    text, flags = extract.pdf_to_text(raw), {}
                    if text is None:
                        raise Refuse("Не удалось прочитать PDF.")
                else:
                    text, flags = extract.decode_bytes(raw), {}
            except Refuse:
                raise
            except Exception:
                raise Refuse("Не удалось прочитать файл — возможно, он повреждён или это не .docx.")
            return as_json({"text": text[:MAX_TEXT], "flags": flags})
        if PUBLIC:
            return as_json({"error": "На общем сервере эта функция отключена."}, 403)
        if path == "/api/library":
            if data.get("delete"):
                full = os.path.join(LIBRARY, safe_name(str(data["delete"])) + ".txt")
                if os.path.isfile(full):
                    os.remove(full)
            else:
                text = str(data.get("text") or "").strip()
                if len(text) < 100:
                    raise Refuse("Документ слишком короткий для коллекции.")
                os.makedirs(LIBRARY, exist_ok=True)
                with open(os.path.join(LIBRARY, safe_name(str(data.get("name"))) + ".txt"), "w",
                          encoding="utf-8") as f:
                    f.write(text[:MAX_TEXT])
            return as_json({"items": library_list()})
        if path == "/api/settings":
            save_keys(data)
            return as_json({"ok": True})
        return as_json({"error": "Не найдено."}, 404)
    except Refuse as e:
        return as_json({"error": str(e)}, e.status)
    except Exception as e:
        return as_json({"error": "Внутренняя ошибка сервера." if PUBLIC else f"Ошибка: {e}"}, 500)


def cors_headers(origin):
    """Разрешение странице с доверенного сайта вызывать сервер (только в публичном режиме)."""
    if not PUBLIC or not origin or origin.rstrip("/") not in ORIGINS:
        return []
    return [("Access-Control-Allow-Origin", origin), ("Vary", "Origin"),
            ("Access-Control-Allow-Methods", "GET, POST, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type"), ("Access-Control-Max-Age", "86400")]


SECURITY_HEADERS = [("X-Content-Type-Options", "nosniff"), ("Referrer-Policy", "no-referrer"),
                    ("X-Frame-Options", "SAMEORIGIN")]


# --- свой сервер ----------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "Iceberg/1.1"

    def log_message(self, fmt, *args):
        pass

    def client_ip(self):
        ip = self.client_address[0]
        if PUBLIC and ip in ("127.0.0.1", "::1"):  # запрос пришёл через nginx на этой же машине
            ip = (self.headers.get("X-Real-IP") or self.headers.get("X-Forwarded-For", "").split(",")[-1]).strip() or ip
        return ip

    def allowed(self):
        """На своём компьютере принимаем запросы только от страницы самого приложения."""
        if PUBLIC:
            return True
        host = (self.headers.get("Host") or "").split(":")[0]
        origin = self.headers.get("Origin")
        if host not in ("localhost", "127.0.0.1"):
            return False
        return not origin or urlsplit(origin).hostname in ("localhost", "127.0.0.1")

    def respond(self, method):
        if not self.allowed():
            return self.finish_response(*as_json({"error": "Доступ запрещён."}, 403))
        payload = b""
        if method == "POST":
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            if length > MAX_BODY:
                return self.finish_response(*as_json({"error": "Слишком большой запрос."}, 413))
            payload = self.rfile.read(length) if length > 0 else b""
        self.finish_response(*handle(method, self.path, payload, self.client_ip()))

    def finish_response(self, status, ctype, body):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store" if ctype.startswith("application/json") else "no-cache")
        for k, v in SECURITY_HEADERS + cors_headers(self.headers.get("Origin")):
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.finish_response(204, "text/plain; charset=utf-8", b"")

    def do_GET(self):
        self.respond("GET")

    def do_POST(self):
        self.respond("POST")


# --- WSGI (для Passenger на хостинге) ---------------------------------------------
REASONS = {200: "OK", 204: "No Content", 400: "Bad Request", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed",
           413: "Payload Too Large", 429: "Too Many Requests", 500: "Internal Server Error"}


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    target = environ.get("PATH_INFO") or "/"
    if environ.get("QUERY_STRING"):
        target += "?" + environ["QUERY_STRING"]
    body = b""
    result = None
    if method == "OPTIONS":
        result = (204, "text/plain; charset=utf-8", b"")
    if method == "POST":
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > MAX_BODY:
            result = as_json({"error": "Слишком большой запрос."}, 413)
        elif length > 0:
            body = environ["wsgi.input"].read(length)
    if result is None:
        result = handle(method, target, body, environ.get("REMOTE_ADDR") or "?")
    status, ctype, out = result
    headers = [("Content-Type", ctype), ("Content-Length", str(len(out))),
               ("Cache-Control", "no-store" if ctype.startswith("application/json") else "no-cache")]
    start_response(f"{status} {REASONS.get(status, 'OK')}",
                   headers + SECURITY_HEADERS + cors_headers(environ.get("HTTP_ORIGIN")))
    return [out]


def main():
    args = [a for a in sys.argv[1:] if a.isdigit()]
    port = int(os.environ.get("PORT") or (args[0] if args else 8765))
    host = os.environ.get("HOST") or "127.0.0.1"
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    address = f"http://localhost:{port}"
    print(f"Айсберг запущен: {address}" + (" (публичный режим)" if PUBLIC else "") + "\nОстановить — Ctrl+C.",
          flush=True)
    if not PUBLIC and "--no-browser" not in sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(address)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")


if __name__ == "__main__":
    main()
