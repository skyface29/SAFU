"""Извлечение текста из HTML, DOCX и (если установлен pypdf) PDF."""
import io
import re
import zipfile
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

try:  # необязательная зависимость: позволяет читать PDF-источники из сети
    import pypdf  # type: ignore
except Exception:  # pragma: no cover
    pypdf = None

_SKIP_TAGS = {"script", "style", "noscript", "svg", "nav", "footer", "aside", "form", "template",
              "iframe", "select", "button", "canvas", "figure"}
_BLOCK_TAGS = {"p", "div", "br", "li", "ul", "ol", "tr", "td", "th", "table", "h1", "h2", "h3", "h4", "h5", "h6",
               "section", "article", "blockquote", "pre", "dd", "dt", "header", "main"}
_VOID = {"br", "img", "hr", "meta", "link", "input", "source", "wbr", "area", "base", "col", "embed", "track"}


class _TextParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.title = []
        self._skip = 0
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        if tag in _VOID:
            if tag == "br":
                self.parts.append("\n")
            return
        if tag == "title":
            self._in_title = True
        elif tag in _SKIP_TAGS:
            self._skip += 1
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
        elif tag in _SKIP_TAGS:
            self._skip = max(0, self._skip - 1)
        elif tag in _BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data):
        if self._in_title:
            self.title.append(data)
        elif not self._skip:
            self.parts.append(data)


def html_to_text(html):
    """Возвращает (заголовок, текст) страницы без меню, скриптов и разметки."""
    parser = _TextParser()
    try:
        parser.feed(html)
        parser.close()
    except Exception:
        pass
    text = "".join(parser.parts)
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r" ?\n ?", "\n", text)
    text = re.sub(r"\n{2,}", "\n", text)
    title = re.sub(r"\s+", " ", "".join(parser.title)).strip()
    return title, text.strip()


def decode_bytes(data, header_charset=None):
    """Декодирует страницу: кодировка из заголовка, из <meta>, затем UTF-8 и Windows-1251."""
    candidates = []
    if header_charset:
        candidates.append(header_charset)
    m = re.search(rb"<meta[^>]+charset=[\"']?([\w-]+)", data[:4096], re.I)
    if m:
        candidates.append(m.group(1).decode("ascii", "ignore"))
    candidates += ["utf-8", "cp1251"]
    for enc in candidates:
        try:
            return data.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return data.decode("utf-8", "replace")


def pdf_to_text(data, max_pages=80):
    if pypdf is None:
        return None
    try:
        reader = pypdf.PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages[:max_pages]:
            pages.append(page.extract_text() or "")
        text = "\n".join(pages)
        return re.sub(r"-\n(?=[а-яёa-z])", "", text)
    except Exception:
        return None


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _run_hidden(run):
    """Скрыт ли фрагмент: атрибут «скрытый», белый цвет или микроскопический кегль."""
    props = run.find(_W + "rPr")
    if props is None:
        return None
    vanish = props.find(_W + "vanish")
    if vanish is not None and vanish.get(_W + "val", "true") not in ("0", "false"):
        return "скрытый текст"
    color = props.find(_W + "color")
    if color is not None and (color.get(_W + "val") or "").upper() in ("FFFFFF", "FEFEFE", "FDFDFD"):
        return "белый текст"
    size = props.find(_W + "sz")
    if size is not None:
        try:
            if float(size.get(_W + "val")) <= 4:  # в полупунктах: 2 pt и меньше
                return "микрошрифт"
        except (TypeError, ValueError):
            pass
    return None


def docx_to_text(data):
    """Читает .docx. Возвращает (текст без скрытых вставок, сведения о скрытых вставках)."""
    with zipfile.ZipFile(io.BytesIO(data)) as zf:
        xml = zf.read("word/document.xml")
    root = ET.fromstring(xml)
    paragraphs = []
    hidden = {}
    hidden_chars = 0
    samples = []
    for par in root.iter(_W + "p"):
        chunks = []
        for run in par.iter(_W + "r"):
            reason = _run_hidden(run)
            piece = []
            for node in run:
                if node.tag == _W + "t":
                    piece.append(node.text or "")
                elif node.tag == _W + "tab":
                    piece.append(" ")
                elif node.tag in (_W + "br", _W + "cr"):
                    piece.append("\n")
                elif node.tag == _W + "noBreakHyphen":
                    piece.append("-")
            piece = "".join(piece)
            if not piece:
                continue
            if reason:
                hidden[reason] = hidden.get(reason, 0) + len(piece)
                hidden_chars += len(piece)
                if len(samples) < 5 and piece.strip():
                    samples.append(piece.strip()[:80])
                continue
            chunks.append(piece)
        paragraphs.append("".join(chunks))
    text = "\n".join(paragraphs)
    flags = {"hidden_chars": hidden_chars, "hidden_kinds": hidden, "hidden_samples": samples}
    return text, flags
