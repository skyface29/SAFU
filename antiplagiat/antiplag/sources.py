"""Поиск источников в открытом интернете и загрузка их текста.

Все источники бесплатны и не требуют регистрации:
  • веб-поиск DuckDuckGo (запросы идут редко, чтобы не упираться в ограничения),
    с запасным поисковиком Seznam на случай отказа;
  • Википедия — через официальный API, полный текст статей;
  • КиберЛенинка — открытая научная библиотека, полные тексты статей.
По желанию можно подключить свои ключи Brave Search и Google Programmable Search.
"""
import gzip
import html as htmllib
import ipaddress
import json
import re
import socket
import ssl
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zlib

from . import extract

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

SKIP_HOSTS = (
    "youtube.com", "youtu.be", "rutube.ru", "vk.com", "vkvideo.ru", "t.me", "instagram.com", "facebook.com",
    "twitter.com", "x.com", "tiktok.com", "pinterest.", "ok.ru", "ozon.ru", "wildberries.ru", "market.yandex.",
    "play.google.com", "apps.apple.com", "duckduckgo.com", "translate.google.", "maps.google.", "yandex.ru/maps",
)
SKIP_EXT = (".jpg", ".jpeg", ".png", ".gif", ".zip", ".rar", ".mp4", ".mp3", ".doc", ".docx", ".xls", ".xlsx",
            ".ppt", ".pptx", ".djvu", ".exe")


class Blocked(Exception):
    """Поисковик временно ограничил запросы."""


class Forbidden(Exception):
    """Адрес нельзя запрашивать с общего сервера."""


# На общем сервере адреса страниц приходят от посторонних людей и из поисковой выдачи.
# Чтобы через сервис нельзя было дотянуться до внутренней сети сервера, в этом режиме
# разрешены только обычные веб-адреса, ведущие в открытый интернет (в т. ч. при переадресации).
GUARD = False


def _guard(url):
    parts = urllib.parse.urlsplit(url)
    try:
        port = parts.port
    except ValueError:
        raise Forbidden(url)
    if parts.scheme not in ("http", "https") or not parts.hostname or port not in (None, 80, 443):
        raise Forbidden(url)
    try:
        infos = socket.getaddrinfo(parts.hostname, None)
    except OSError:
        raise Forbidden(url)
    if not infos:
        raise Forbidden(url)
    for info in infos:
        try:
            address = ipaddress.ip_address(info[4][0].split("%")[0])
        except ValueError:
            raise Forbidden(url)
        if not address.is_global:
            raise Forbidden(url)


class _GuardedRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if GUARD:
            _guard(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_GuardedRedirect)


def http_get(url, timeout=12, max_bytes=3_000_000, headers=None, data=None, retries=1):
    """Возвращает (итоговый URL, тип содержимого, кодировка из заголовка, байты, код ответа).

    При обрыве связи или таймауте запрос повторяется.
    """
    h = {"User-Agent": UA, "Accept-Language": "ru,en;q=0.8", "Accept-Encoding": "gzip, deflate",
         "Accept": "text/html,application/xhtml+xml,application/json,application/pdf;q=0.9,*/*;q=0.5"}
    if headers:
        h.update(headers)
    attempt = 0
    while True:
        try:
            return _http_once(url, timeout, max_bytes, h, data)
        except urllib.error.HTTPError:
            raise
        except (urllib.error.URLError, socket.timeout, ConnectionError, ssl.SSLError):
            if attempt >= retries:
                raise
            attempt += 1
            time.sleep(0.5)


def _http_once(url, timeout, max_bytes, h, data):
    if GUARD:
        _guard(url)
    req = urllib.request.Request(url, data=data, headers=h)
    with _opener.open(req, timeout=timeout) as resp:
        raw = resp.read(max_bytes + 1)
        enc = (resp.headers.get("Content-Encoding") or "").lower()
        if enc == "gzip":
            try:
                raw = gzip.decompress(raw)
            except Exception:
                raw = zlib.decompressobj(31).decompress(raw)
        elif enc == "deflate":
            try:
                raw = zlib.decompress(raw)
            except zlib.error:
                raw = zlib.decompress(raw, -15)
        ctype = (resp.headers.get_content_type() or "").lower()
        charset = resp.headers.get_content_charset()
        return resp.geturl(), ctype, charset, raw, resp.status


def usable_url(url):
    if not url.startswith(("http://", "https://")):
        return False
    low = url.lower()
    host = urllib.parse.urlsplit(low).netloc
    if any(s in host or s in low[:60] for s in SKIP_HOSTS):
        return False
    path = urllib.parse.urlsplit(low).path
    return not path.endswith(SKIP_EXT)


def _strip_tags(s):
    return re.sub(r"\s+", " ", htmllib.unescape(re.sub(r"<[^>]+>", "", s))).strip()


# --- DuckDuckGo ---------------------------------------------------------------
class _Throttle:
    """Общий на всё приложение ограничитель частоты запросов к поисковику.

    Если поисковик начинает отказывать, пауза между запросами растёт, а на время
    «остывания» запросы уходят в запасной поисковик.
    """

    def __init__(self, interval, max_interval):
        self.base = interval
        self.interval = interval
        self.max_interval = max_interval
        self.lock = threading.Lock()
        self.next_at = 0.0
        self.blocked_until = 0.0
        self.cooldown = 30.0
        self.turn = 0

    def available(self):
        return time.time() >= self.blocked_until

    def wait(self, cancel=None):
        """Ждёт своей очереди. Возвращает номер запроса или None, если ждать не стоит."""
        with self.lock:
            start = max(time.time(), self.next_at)
            self.next_at = start + self.interval
            self.turn += 1
            turn = self.turn
        while time.time() < start:
            if (cancel and cancel()) or not self.available():
                return None
            time.sleep(0.1)
        return turn if self.available() else None

    def blocked(self):
        with self.lock:
            self.blocked_until = time.time() + self.cooldown
            self.cooldown = min(self.cooldown * 2, 300.0)
            self.interval = min(self.interval * 1.5, self.max_interval)
            self.next_at = self.blocked_until

    def ok(self):
        with self.lock:
            self.cooldown = 30.0
            self.interval = max(self.base, self.interval * 0.95)

    def pause(self, seconds):
        """Сервис попросил притормозить: ждём и дальше ходим реже."""
        with self.lock:
            self.next_at = max(self.next_at, time.time() + seconds)
            self.interval = min(self.interval * 1.5, self.max_interval)


_ddg = _Throttle(9.0, 16.0)   # проверено: при паузе 9–10 с поисковик не отказывает
_seznam = _Throttle(3.0, 8.0)
_DDG_HTML = re.compile(
    r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>(?:.*?class="result__snippet"[^>]*>(.*?)</a>)?', re.S)
_DDG_HTML2 = re.compile(
    r'href="([^"]+)"[^>]*class="result__a"[^>]*>(.*?)</a>(?:.*?class="result__snippet"[^>]*>(.*?)</a>)?', re.S)
_DDG_LITE = re.compile(
    r"href=\"([^\"]+)\"[^>]*class='result-link'[^>]*>(.*?)</a>(?:.*?class='result-snippet'[^>]*>(.*?)</td>)?", re.S)


def _ddg_unwrap(href):
    href = htmllib.unescape(href)
    if "duckduckgo.com/y.js" in href:
        return None  # реклама
    m = re.search(r"[?&]uddg=([^&]+)", href)
    if m:
        return urllib.parse.unquote(m.group(1))
    if href.startswith("//"):
        return "https:" + href
    return href


def search_ddg(query, cancel=None):
    turn = _ddg.wait(cancel)
    if turn is None:
        raise Blocked("DuckDuckGo")
    lite = turn % 2 == 0
    base = "https://lite.duckduckgo.com/lite/?" if lite else "https://html.duckduckgo.com/html/?"
    try:
        _, _, _, raw, status = http_get(base + urllib.parse.urlencode({"q": query, "kl": "ru-ru"}), timeout=15)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            _ddg.blocked()
            raise Blocked("DuckDuckGo")
        raise
    page = raw.decode("utf-8", "replace")
    if status == 202 or "anomaly" in page[:20000]:
        _ddg.blocked()
        raise Blocked("DuckDuckGo")
    _ddg.ok()
    found = _DDG_LITE.findall(page) if lite else (_DDG_HTML.findall(page) or _DDG_HTML2.findall(page))
    out = []
    for href, title, snippet in found:
        url = _ddg_unwrap(href)
        if url:
            out.append({"url": url, "title": _strip_tags(title), "snippet": _strip_tags(snippet or "")})
    return out


def web_search_blocked_since(moment):
    """Отказывал ли основной веб-поиск после указанного момента."""
    return _ddg.blocked_until > moment


# --- Seznam (запасной поисковик) -------------------------------------------------
_SEZNAM = re.compile(r'<a\b[^>]*data-e-a="heading"[^>]*>(.*?)</a>', re.S)


def search_seznam(query, cancel=None):
    if _seznam.wait(cancel) is None:
        raise Blocked("Seznam")
    try:
        _, _, _, raw, _ = http_get("https://search.seznam.cz/?" + urllib.parse.urlencode({"q": query}), timeout=15)
    except urllib.error.HTTPError as e:
        if e.code in (403, 429):
            _seznam.blocked()
            raise Blocked("Seznam")
        raise
    page = raw.decode("utf-8", "replace")
    out, seen = [], set()
    for m in _SEZNAM.finditer(page):
        href = re.search(r'href="([^"]+)"', m.group(0))
        if not href:
            continue
        url = htmllib.unescape(href.group(1)).split("#")[0]
        if url in seen or "seznam.cz" in url:
            continue
        seen.add(url)
        out.append({"url": url, "title": _strip_tags(m.group(1)), "snippet": ""})
    _seznam.ok()
    return out


def search_web(query, keys=None, cancel=None):
    """Веб-поиск с запасными вариантами. Возвращает (результаты, имя поисковика)."""
    keys = keys or {}
    if keys.get("brave"):
        try:
            return search_brave(query, keys["brave"]), "brave"
        except Exception:
            pass
    if keys.get("google") and keys.get("google_cx"):
        try:
            return search_google(query, keys["google"], keys["google_cx"]), "google"
        except Exception:
            pass
    words = query.split()
    phrase = '"' + " ".join(words[:7]) + '"'
    if _ddg.available():
        # Пока основной поисковик «отдыхает» между запросами, пробуем найти дословную
        # фразу во втором поисковике; не нашлось — запрос всё равно уйдёт в основной.
        if _ddg.next_at - time.time() > 2.5 and _seznam.available() and len(words) >= 5:
            try:
                found = search_seznam(phrase, cancel)
                if found:
                    return found, "seznam"
            except Exception:
                pass
        try:
            return search_ddg(query, cancel), "ddg"
        except Blocked:
            pass
    found = search_seznam(phrase, cancel) if len(words) >= 5 else []
    if not found:
        found = search_seznam(query, cancel)
    return found, "seznam"


# --- Необязательные поисковые API со своим ключом --------------------------------
def search_brave(query, key):
    url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode({"q": query, "count": 20})
    _, _, _, raw, _ = http_get(url, headers={"X-Subscription-Token": key, "Accept": "application/json"})
    data = json.loads(raw.decode("utf-8", "replace"))
    return [{"url": r.get("url", ""), "title": _strip_tags(r.get("title", "")),
             "snippet": _strip_tags(r.get("description", ""))}
            for r in (data.get("web") or {}).get("results", [])]


def search_google(query, key, cx):
    url = "https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(
        {"key": key, "cx": cx, "q": query, "num": 10})
    _, _, _, raw, _ = http_get(url)
    data = json.loads(raw.decode("utf-8", "replace"))
    return [{"url": r.get("link", ""), "title": r.get("title", ""), "snippet": r.get("snippet", "")}
            for r in data.get("items", [])]


# --- Википедия -----------------------------------------------------------------
# API Википедии пускает без регистрации примерно 10 запросов в минуту, поэтому
# поиск идёт по одному запросу с паузой, а сами статьи читаются как обычные страницы.
_wiki = _Throttle(6.0, 12.0)
WIKI_UA = "IcebergTextChecker/1.0 (local desktop app; python-urllib)"


def _wiki_get(url, cancel=None):
    for attempt in range(3):
        if _wiki.wait(cancel) is None:
            raise Blocked("Wikipedia")
        try:
            result = http_get(url, headers={"User-Agent": WIKI_UA})
            _wiki.ok()
            return result
        except urllib.error.HTTPError as e:
            if e.code != 429 or attempt == 2:
                raise
            try:
                delay = float(e.headers.get("Retry-After") or 5)
            except (TypeError, ValueError):
                delay = 5.0
            _wiki.pause(min(max(delay, 3.0), 30.0))


def search_wikipedia(query, lang="ru", limit=3, cancel=None):
    url = f"https://{lang}.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "list": "search", "srsearch": query, "format": "json", "srlimit": limit,
         "srprop": "snippet"})
    _, _, _, raw, _ = _wiki_get(url, cancel)
    data = json.loads(raw.decode("utf-8", "replace"))
    out = []
    for r in data.get("query", {}).get("search", []):
        title = r["title"]
        out.append({"url": f"https://{lang}.wikipedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
                    "title": title + " — Википедия", "snippet": _strip_tags(r.get("snippet", "")),
                    "kind": "wiki"})
    return out


def search_wikipedia_text(words, lang="ru", cancel=None):
    """Ищет статью по началу предложения из текста (поиск Википедии сам учитывает формы слов)."""
    return search_wikipedia(" ".join(words[:10]), lang, 3, cancel)


# --- КиберЛенинка ----------------------------------------------------------------
def search_cyberleninka(query, limit=5):
    body = json.dumps({"mode": "articles", "q": query, "size": limit, "from": 0}).encode()
    _, _, _, raw, _ = http_get("https://cyberleninka.ru/api/search", data=body,
                               headers={"Content-Type": "application/json"})
    data = json.loads(raw.decode("utf-8", "replace"))
    out = []
    for a in data.get("articles", []):
        link = a.get("link") or ""
        if not link:
            continue
        out.append({"url": "https://cyberleninka.ru" + link, "title": _strip_tags(a.get("name", "")),
                    "snippet": _strip_tags(a.get("annotation") or ""), "kind": "science"})
    return out


# --- Загрузка страницы ---------------------------------------------------------
def fetch_page(cand):
    """Скачивает источник и возвращает (заголовок, текст) или None."""
    url = cand["url"]
    final, ctype, charset, raw, _ = http_get(url, timeout=12, retries=0)
    if "pdf" in ctype or raw[:5] == b"%PDF-":
        text = extract.pdf_to_text(raw)
        return (cand.get("title") or url, text) if text else None
    if ctype and not any(t in ctype for t in ("html", "xml", "text/plain")):
        return None
    page = extract.decode_bytes(raw, charset)
    if "text/plain" in ctype:
        return cand.get("title") or url, page
    title, text = extract.html_to_text(page)
    if len(text) < 400 and len(page) > 20000:
        # разметка сломана настолько, что разбор потерял текст — берём грубую очистку
        rough = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", page)
        text = _strip_tags(rough)
    return title or cand.get("title") or url, text
