"""Проверка документа: поиск источников, сравнение, сбор отчёта."""
import os
import re
import time
import urllib.parse
from bisect import bisect_left
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

from . import sources
from .match import align, shingle_index
from .text import Tokens, WordIndex, bibliography_start, clean_text, quote_spans, sentences, stem, normalize_word, \
    WORD_RE, RU_STOP, EN_STOP

# Сколько запросов и страниц тратить на проверку разной глубины.
DEPTH = {
    "fast": {"web": 5, "wiki": 6, "sci": 12, "pages": 30, "rounds": 1, "seconds": 80},
    "std": {"web": 14, "wiki": 16, "sci": 36, "pages": 90, "rounds": 2, "seconds": 240},
    "deep": {"web": 36, "wiki": 40, "sci": 90, "pages": 220, "rounds": 3, "seconds": 600},
}
MAX_SOURCE_CHARS = 700_000
MIN_SOURCE_WORDS = 8
MAX_SOURCES = 80


class Job:
    """Состояние одной проверки; опрашивается интерфейсом."""

    def __init__(self):
        self.stage = "Подготовка"
        self.progress = 0.0
        self.log = []
        self.done = False
        self.error = None
        self.result = None
        self.cancelled = False
        self.counters = {"queries": 0, "pages": 0, "sources": 0}

    def say(self, message):
        self.log.append(message)

    def set(self, stage, progress=None):
        self.stage = stage
        if progress is not None:
            self.progress = max(self.progress, min(0.99, progress))


def _url_key(url):
    p = urllib.parse.urlsplit(url)
    host = p.netloc.lower()
    for prefix in ("www.", "m."):
        if host.startswith(prefix):
            host = host[len(prefix):]
    return host + urllib.parse.unquote(p.path).rstrip("/") + ("?" + p.query if p.query else "")


def _domain(url):
    host = urllib.parse.urlsplit(url).netloc.lower()
    return host[4:] if host.startswith("www.") else host


def _bigrams(text):
    stems = []
    for m in WORD_RE.finditer(text):
        w, _ = normalize_word(m.group())
        if len(w) < 2 or w.isdigit() or w in RU_STOP or w in EN_STOP:
            continue
        stems.append(stem(w))
    return {(stems[i], stems[i + 1]) for i in range(len(stems) - 1)}


def _excerpt(text, a, b, limit=700):
    piece = text[a:b]
    if len(piece) > limit:
        half = limit // 2
        piece = piece[:half].rstrip() + " … " + piece[-half:].lstrip()
    return re.sub(r"\s+", " ", piece)


def summarize(n_words, area_end, source_list, quotes, use_quotes=True):
    """Доли оригинального текста, дословных и перефразированных заимствований, цитат."""
    cat = bytearray(n_words)  # 0 оригинал, 1 дословно, 2 перефраз, 3 цитата
    for src in source_list:
        for sp in src["spans"]:
            code = 1 if sp["type"] == "exact" else 2
            for w in range(sp["ws"], min(sp["we"] + 1, area_end)):
                if cat[w] == 0 or (code == 1 and cat[w] == 2):
                    cat[w] = code
    if use_quotes:
        for a, b in quotes:
            for w in range(a, min(b, area_end)):
                if cat[w]:
                    cat[w] = 3
    total = max(1, area_end)
    counts = [0, 0, 0, 0]
    for w in range(area_end):
        counts[cat[w]] += 1
    pct = [round(100.0 * c / total, 2) for c in counts]
    return {"original": pct[0], "exact": pct[1], "para": pct[2], "cite": pct[3],
            "borrowed": round(pct[1] + pct[2], 2), "words": total}


def load_library(folder):
    items = []
    if not os.path.isdir(folder):
        return items
    for name in sorted(os.listdir(folder)):
        if not name.lower().endswith(".txt"):
            continue
        try:
            with open(os.path.join(folder, name), encoding="utf-8") as f:
                items.append((name[:-4], f.read()))
        except OSError:
            continue
    return items


def run_check(raw_text, opts, job, library_dir=None, keys=None):
    started = time.time()
    keys = keys or {}
    depth = DEPTH.get(opts.get("depth"), DEPTH["std"])
    deadline = started + depth["seconds"]

    text, zero_width = clean_text(raw_text)
    doc = Tokens(text)
    widx = WordIndex(doc)
    n_words = len(doc.words)
    if n_words < 20:
        raise ValueError("Текст слишком короткий: для проверки нужно хотя бы 20 слов.")

    bib_pos = bibliography_start(text) if opts.get("skip_bibliography", True) else None
    area_end = widx.range(0, bib_pos)[1] if bib_pos is not None else n_words
    if area_end < 20:
        area_end, bib_pos = n_words, None
    area_chars = bib_pos if bib_pos is not None else len(text)
    c_end = bisect_left(doc.cidx, area_end)
    doc.cidx = doc.cidx[:c_end]
    doc.stems = doc.stems[:c_end]
    D = doc.stems
    doc_shingles = {(D[i], D[i + 1], D[i + 2]) for i in range(len(D) - 2)}
    doc_bigrams = {(D[i], D[i + 1]) for i in range(len(D) - 1)}
    cyr = sum(1 for w in doc.norm[:2000] if re.search("[а-я]", w))
    lang = "ru" if cyr >= min(len(doc.norm), 2000) * 0.5 else "en"

    quotes = []
    for a, b in quote_spans(text[:area_chars]):
        qa, qb = widx.range(a, b)
        if qb - qa >= 4:
            quotes.append((qa, qb))

    # Предложения, из которых можно делать поисковые запросы.
    sents = []
    for a, b in sentences(text[:area_chars]):
        ws, we = widx.range(a, b)
        if we - ws < 7:
            continue
        content = bisect_left(doc.cidx, we) - bisect_left(doc.cidx, ws)
        if content >= 5:
            sents.append((ws, we))

    covered = bytearray(n_words)
    found = []          # найденные источники
    seen = {}           # ключ URL -> кандидат
    stats = {"web": 0, "wiki": 0, "sci": 0, "pages": 0, "candidates": 0, "web_blocked": False}

    def consider(title, src_text, url, kind):
        src_text, _ = clean_text(src_text[:MAX_SOURCE_CHARS])
        src = Tokens(src_text)
        if len(src.stems) < 20:
            return 0
        index = shingle_index(src.stems)
        shared = 0
        for g in (doc_shingles if len(doc_shingles) < len(index) else index):
            if g in index and g in doc_shingles:
                shared += 1
                if shared >= 3:
                    break
        if shared < 3:
            return 0
        spans = align(doc, src, index)
        words = sum(min(sp["we"], area_end - 1) - sp["ws"] + 1 for sp in spans)
        if not spans or words < MIN_SOURCE_WORDS:
            return 0
        for sp in spans:
            sp["excerpt"] = _excerpt(src_text, sp.pop("s_from"), sp.pop("s_to"))
            for w in range(sp["ws"], min(sp["we"] + 1, n_words)):
                covered[w] = 1
        title = re.split(r"\s+[–—-]\s+тема научной статьи", title or "")[0].strip()
        if title.isupper():
            title = title.capitalize()
        found.append({"url": url, "title": (title or url)[:200], "domain": _domain(url) if url else "",
                      "kind": kind, "spans": spans, "words": words})
        return words

    # 1. Своя коллекция документов.
    if opts.get("use_library", True) and library_dir:
        items = load_library(library_dir)
        if items:
            job.set("Сверка с вашей коллекцией", 0.02)
            hits = sum(1 for name, body in items if consider(name, body, "", "library"))
            job.say(f"Коллекция: проверено документов — {len(items)}, с совпадениями — {hits}.")

    use_web = opts.get("web", True)
    use_wiki = opts.get("wiki", True)
    use_sci = opts.get("science", True)
    left = {"web": depth["web"] if use_web else 0, "wiki": depth["wiki"] if use_wiki else 0,
            "sci": depth["sci"] if use_sci else 0, "pages": depth["pages"]}

    def sentence_coverage(s):
        ws, we = s
        return sum(covered[ws:we]) / (we - ws)

    used = {"web": set(), "wiki": set(), "sci": set()}

    def pick(kind, n, avoid=()):
        """Выбирает n ещё не найденных предложений, равномерно по тексту, для одного вида поиска."""
        cands = [i for i, snt in enumerate(sents) if i not in used[kind] and sentence_coverage(snt) < 0.4]
        if n <= 0 or not cands:
            return []
        fresh = [i for i in cands if i not in avoid]
        if len(fresh) >= n:
            cands = fresh
        if len(cands) > n:
            step = len(cands) / n
            cands = [cands[int(k * step + step / 2)] for k in range(n)]
        used[kind].update(cands)
        return cands

    def words_of(ws, we):
        return [text[a:b] for a, b in doc.words[ws:we]]

    def web_query(i):
        ws, we = sents[i]
        return " ".join(words_of(ws, min(we, ws + 12)))

    def sci_query(i):
        ws, we = sents[i]
        return " ".join(words_of(ws, min(we, ws + 9)))

    def wiki_query(i):
        ws, we = sents[i]
        return " ".join(w for w in words_of(ws, we) if not w.isdigit())

    engines = {}

    def do_web(q):
        if job.cancelled or time.time() > deadline:
            return "web", None
        try:
            res, engine = sources.search_web(q, keys, cancel=lambda: job.cancelled or time.time() > deadline)
            engines[engine] = engines.get(engine, 0) + 1
            return "web", res
        except Exception:
            return "web", None

    def do_wiki(q):
        try:
            return "wiki", sources.search_wikipedia_text(
                q.split(), lang, cancel=lambda: job.cancelled or time.time() > deadline)
        except Exception:
            return "wiki", None

    def do_sci(q):
        try:
            return "sci", sources.search_cyberleninka(q)
        except Exception:
            return "sci", None

    def do_fetch(cand):
        try:
            return "page", (cand, sources.fetch_page(cand))
        except Exception:
            return "page", (cand, None)

    search_pool = ThreadPoolExecutor(max_workers=4)
    web_pool = ThreadPoolExecutor(max_workers=2)
    wiki_pool = ThreadPoolExecutor(max_workers=2)
    fetch_pool = ThreadPoolExecutor(max_workers=8)
    planned = [1]
    finished = [0]

    def tick(stage):
        job.set(stage, 0.05 + 0.93 * finished[0] / max(planned[0], 1))

    def submit_fetch(cand, pending):
        if left["pages"] <= 0:
            return
        left["pages"] -= 1
        cand["state"] = "fetching"
        planned[0] += 1
        pending.add(fetch_pool.submit(do_fetch, cand))

    def register(results, kind, pending):
        """Отбирает из выдачи страницы, которые стоит скачать и сравнить."""
        keep_top = {"web": 4, "wiki": 2, "sci": 3}[kind]
        fresh = []
        for rank, r in enumerate(results):
            url = r.get("url") or ""
            if not sources.usable_url(url):
                continue
            key = _url_key(url)
            if key in seen:
                seen[key]["hits"] += 1
                continue
            score = len(_bigrams(r.get("title", "") + " . " + r.get("snippet", "")) & doc_bigrams)
            cand = dict(r, hits=1, score=score, rank=rank, state="new",
                        kind=r.get("kind") or ("web" if kind == "web" else kind))
            seen[key] = cand
            stats["candidates"] += 1
            fresh.append(cand)
        for n, cand in enumerate(sorted(fresh, key=lambda c: (-c["score"], c["rank"]))):
            if n < keep_top or cand["score"] >= 3:
                submit_fetch(cand, pending)

    try:
        pending = set()
        # Ссылки, которые пользователь указал сам, проверяем в первую очередь.
        for url in opts.get("urls") or []:
            url = url.strip()
            if url and sources.usable_url(url) and _url_key(url) not in seen:
                cand = {"url": url, "title": "", "snippet": "", "hits": 1, "score": 99, "rank": 0, "kind": "web"}
                seen[_url_key(url)] = cand
                left["pages"] += 1
                submit_fetch(cand, pending)

        rounds = depth["rounds"]
        for rnd in range(rounds + 3):
            if job.cancelled or time.time() > deadline:
                break
            rounds_left = max(1, rounds - rnd)
            for_web = pick("web", -(-left["web"] // rounds_left))
            for_wiki = pick("wiki", -(-left["wiki"] // rounds_left), avoid=for_web)
            for_sci = pick("sci", -(-left["sci"] // rounds_left))
            if not (for_web or for_wiki or for_sci or pending):
                if rnd:
                    job.say("Все фрагменты либо найдены, либо уже проверены по всем источникам.")
                break
            if rnd:
                job.say(f"Круг {rnd + 1}: ищу источники для ещё не найденных фрагментов.")
            # Веб-поиск и Википедия ограничены по частоте, поэтому им достаются разные предложения.
            for i in for_web:
                left["web"] -= 1
                planned[0] += 1
                pending.add(web_pool.submit(do_web, web_query(i)))
            for i in for_wiki:
                q = wiki_query(i)
                if q:
                    left["wiki"] -= 1
                    planned[0] += 1
                    pending.add(wiki_pool.submit(do_wiki, q))
            for i in for_sci:
                left["sci"] -= 1
                planned[0] += 1
                pending.add(search_pool.submit(do_sci, sci_query(i)))

            while pending:
                if job.cancelled:
                    break
                done, pending = wait(pending, timeout=1.0, return_when=FIRST_COMPLETED)
                for fut in done:
                    finished[0] += 1
                    kind, payload = fut.result()
                    if kind == "page":
                        cand, page = payload
                        stats["pages"] += 1
                        if page and page[1]:
                            title = cand.get("title") if cand.get("kind") == "science" else page[0]
                            consider(title or page[0], page[1], cand["url"], cand.get("kind", "web"))
                    elif payload:
                        stats[kind] += 1
                        register(payload, kind, pending)
                job.counters = {"queries": stats["web"] + stats["wiki"] + stats["sci"], "pages": stats["pages"],
                                "sources": len(found)}
                tick("Ищу источники и сравниваю тексты")
    finally:
        for pool in (search_pool, web_pool, wiki_pool, fetch_pool):
            pool.shutdown(wait=False)

    if job.cancelled:
        raise RuntimeError("Проверка отменена.")
    stats["engines"] = engines
    stats["web_blocked"] = bool(use_web and not keys and sources.web_search_blocked_since(started))
    if stats["web_blocked"]:
        job.say("Основной веб-поиск ограничил частоту запросов — часть поиска прошла через запасной поисковик.")

    job.set("Собираю отчёт", 0.99)
    found.sort(key=lambda s: -s["words"])
    found = found[:MAX_SOURCES]
    for n, src in enumerate(found):
        src["id"] = n
        src["percent"] = round(100.0 * src["words"] / max(1, area_end), 2)

    swapped = [text[doc.words[i][0]:doc.words[i][1]] for i in doc.swapped[:12]]
    flags = opts.get("flags") or {}
    suspicious = {
        "swapped_words": len(doc.swapped),
        "swapped_samples": swapped,
        "zero_width": zero_width,
        "hidden_chars": int(flags.get("hidden_chars") or 0),
        "hidden_kinds": flags.get("hidden_kinds") or {},
        "hidden_samples": flags.get("hidden_samples") or [],
    }
    suspicious["alert"] = bool(suspicious["swapped_words"] >= 3 or zero_width >= 5
                               or suspicious["hidden_chars"] >= 20)

    flat = []
    for a, b in doc.words:
        flat.append(a)
        flat.append(b)
    stats.update({"words": n_words, "chars": len(text), "sentences": len(sents),
                  "seconds": round(time.time() - started, 1), "sources": len(found)})
    return {
        "text": text,
        "words": flat,
        "area_end": area_end,
        "bibliography": bib_pos is not None,
        "quotes": quotes,
        "sources": found,
        "summary": summarize(n_words, area_end, found, quotes, opts.get("quotes", True)),
        "suspicious": suspicious,
        "stats": stats,
        "depth": opts.get("depth", "std"),
        "created": time.strftime("%d.%m.%Y %H:%M"),
    }
