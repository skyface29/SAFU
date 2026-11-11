"""Нормализация текста: очистка, токенизация, стемминг, поиск приёмов обхода."""
import re
from bisect import bisect_left, bisect_right

# Невидимые символы, которыми «разбавляют» текст, чтобы сбить проверку.
ZERO_WIDTH = "​‌‍⁠﻿‎‏‪‫‬‭‮⁡⁢⁣⁤᠎"
# Удаляются молча: мягкий перенос и знаки ударения (обычны в PDF и Википедии).
SILENT = "­́̀"
_STRIP = dict.fromkeys(map(ord, ZERO_WIDTH + SILENT), None)

WORD_RE = re.compile(r"[^\W_]+", re.UNICODE)
_CYR = re.compile(r"[А-Яа-яЁё]")
_LAT = re.compile(r"[A-Za-z]")

# Буквы-двойники: латиница, неотличимая на вид от кириллицы, и наоборот.
_LAT2CYR = str.maketrans("ABCEHKMOPTXYaceopxyk", "АВСЕНКМОРТХУасеорхук")
_CYR2LAT = str.maketrans("АВСЕНКМОРТХУасеорхук", "ABCEHKMOPTXYaceopxyk")

RU_STOP = set("""
и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне было вот от меня еще нет
о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до вас нибудь опять уж вам ведь там потом себя
ничего ей может они тут где есть надо ней для мы тебя их чем была сам чтоб без будто чего раз тоже себе под будет ж
тогда кто этот того потому этого какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех
никогда можно при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве три
эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда конечно всю между это также
который которая которые которого которых которой которым которыми которое которую котором является являются либо
то есть лишь однако поэтому причем притом пока этим этими эта свой своя свое свои своего своей своих своим своими
наш наша наше наши ваш ваша ваше ваши весь вся всем всеми всей такие такая такое таких таким такими такого такой
тд тп др пр см рис табл стр гг им ее её них оно те ту той тех тому теми та
""".split())

EN_STOP = set("""
a an the and or but if while of at by for with about against between into through during before after above below to
from up down in out on off over under again further then once here there when where why how all any both each few more
most other some such no nor not only own same so than too very s t can will just don should now is are was were be been
being have has had having do does did doing i me my myself we our ours ourselves you your yours yourself he him his
himself she her hers herself it its itself they them their theirs themselves what which who whom this that these those
am as until because also may might must shall would could
""".split())

# --- Стеммер Портера для русского языка (Snowball) -------------------------
_PERFECTIVE = re.compile(r"((ив|ивши|ившись|ыв|ывши|ывшись)|((?<=[ая])(в|вши|вшись)))$")
_REFLEXIVE = re.compile(r"(с[яь])$")
_ADJECTIVE = re.compile(r"(ее|ие|ые|ое|ими|ыми|ей|ий|ый|ой|ем|им|ым|ом|его|ого|ему|ому|их|ых|ую|юю|ая|яя|ою|ею)$")
_PARTICIPLE = re.compile(r"((ивш|ывш|ующ)|((?<=[ая])(ем|нн|вш|ющ|щ)))$")
_VERB = re.compile(
    r"((ила|ыла|ена|ейте|уйте|ите|или|ыли|ей|уй|ил|ыл|им|ым|ен|ило|ыло|ено|ят|ует|уют|ит|ыт|ены|ить|ыть|ишь|ую|ю)"
    r"|((?<=[ая])(ла|на|ете|йте|ли|й|л|ем|н|ло|но|ет|ют|ны|ть|ешь|нно)))$"
)
_NOUN = re.compile(
    r"(а|ев|ов|ие|ье|е|иями|ями|ами|еи|ии|и|ией|ей|ой|ий|й|иям|ям|ием|ем|ам|ом|о|у|ах|иях|ях|ы|ь|ию|ью|ю|ия|ья|я)$"
)
_RVRE = re.compile(r"^(.*?[аеиоуыэюя])(.*)$")
_DERIVATIONAL = re.compile(r".*[^аеиоуыэюя]+[аеиоуыэюя].*ость?$")
_DER = re.compile(r"ость?$")
_SUPERLATIVE = re.compile(r"(ейше|ейш)$")
_I = re.compile(r"и$")
_P = re.compile(r"ь$")
_NN = re.compile(r"нн$")


def _stem_ru(word):
    m = _RVRE.match(word)
    if not m:
        return word
    pre, rv = m.groups()
    temp = _PERFECTIVE.sub("", rv, 1)
    if temp == rv:
        rv = _REFLEXIVE.sub("", rv, 1)
        temp = _ADJECTIVE.sub("", rv, 1)
        if temp != rv:
            rv = _PARTICIPLE.sub("", temp, 1)
        else:
            temp = _VERB.sub("", rv, 1)
            rv = _NOUN.sub("", rv, 1) if temp == rv else temp
    else:
        rv = temp
    rv = _I.sub("", rv, 1)
    if _DERIVATIONAL.match(rv):
        rv = _DER.sub("", rv, 1)
    temp = _P.sub("", rv, 1)
    if temp == rv:
        rv = _SUPERLATIVE.sub("", rv, 1)
        rv = _NN.sub("н", rv, 1)
    else:
        rv = temp
    return pre + rv


_EN_SUFFIXES = (
    "ization", "ational", "fulness", "ousness", "iveness", "ations", "ation", "ments", "ment",
    "ingly", "edly", "ness", "ings", "ing", "ies", "ied", "ely", "ed", "es", "ly", "s",
)


def _stem_en(word):
    if len(word) <= 3:
        return word
    for suf in _EN_SUFFIXES:
        if word.endswith(suf) and len(word) - len(suf) >= 3:
            word = word[: -len(suf)]
            break
    if len(word) > 4 and word[-1] in "ey":
        word = word[:-1]
    return word


_stem_cache = {}


def stem(word):
    """Основа слова: гасит падежи, времена и числа, чтобы ловить перефразирование."""
    s = _stem_cache.get(word)
    if s is None:
        if _CYR.search(word):
            s = _stem_ru(word)
        elif _LAT.search(word):
            s = _stem_en(word)
        else:
            s = word
        if len(_stem_cache) < 400000:
            _stem_cache[word] = s
    return s


def clean_text(raw):
    """Убирает невидимые символы и выравнивает переводы строк.

    Возвращает (текст, число скрытых символов нулевой ширины).
    """
    zero_width = sum(raw.count(ch) for ch in ZERO_WIDTH)
    text = raw.translate(_STRIP)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace(" ", " ").replace("\t", " ")
    text = re.sub(r"[ \f\v]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip(), zero_width


def normalize_word(word):
    """Приводит слово к виду для сравнения. Возвращает (слово, была_ли_подмена_букв)."""
    swapped = False
    if _CYR.search(word) and _LAT.search(word):
        n_cyr = len(_CYR.findall(word))
        n_lat = len(_LAT.findall(word))
        fixed = word.translate(_LAT2CYR if n_cyr >= n_lat else _CYR2LAT)
        # Подменой считаем только случай, когда слово стало целиком одноалфавитным.
        if not (_CYR.search(fixed) and _LAT.search(fixed)):
            word = fixed
            swapped = True
    return word.lower().replace("ё", "е"), swapped


class Tokens:
    """Текст, разобранный на слова.

    words   — (начало, конец) каждого слова в тексте
    norm    — нормализованная форма каждого слова
    cidx    — номера «содержательных» слов (без предлогов, союзов, чисел)
    stems   — основы содержательных слов, параллельно cidx
    """

    __slots__ = ("text", "words", "norm", "cidx", "stems", "swapped")

    def __init__(self, text):
        self.text = text
        self.words = []
        self.norm = []
        self.cidx = []
        self.stems = []
        self.swapped = []
        for m in WORD_RE.finditer(text):
            raw = m.group()
            norm, swapped = normalize_word(raw)
            idx = len(self.words)
            self.words.append((m.start(), m.end()))
            self.norm.append(norm)
            if swapped:
                self.swapped.append(idx)
            if len(norm) < 2 or norm.isdigit() or norm in RU_STOP or norm in EN_STOP:
                continue
            self.cidx.append(idx)
            self.stems.append(stem(norm))


class WordIndex:
    """Быстрый перевод позиций в тексте в номера слов."""

    def __init__(self, tokens):
        self.starts = [w[0] for w in tokens.words]
        self.ends = [w[1] for w in tokens.words]

    def range(self, start, end):
        """Полуинтервал номеров слов, лежащих внутри [start, end)."""
        a = bisect_left(self.starts, start)
        b = bisect_right(self.ends, end)
        return a, max(a, b)


_SENT_SPLIT = re.compile(r"(?<=[.!?…])[\"»”)\]]*\s+(?=[\"«“(\[]*[A-ZА-ЯЁ0-9])|\n+")


def sentences(text):
    """Отрезки (начало, конец) предложений."""
    out = []
    pos = 0
    for m in _SENT_SPLIT.finditer(text):
        if m.start() > pos:
            out.append((pos, m.start()))
        pos = m.end()
    if pos < len(text):
        out.append((pos, len(text)))
    return out


_QUOTE_RES = [
    re.compile(r"«([^«»]{15,2000})»"),
    re.compile(r"“([^“”]{15,2000})”"),
    re.compile(r"„([^„“]{15,2000})“"),
    re.compile(r"\"([^\"\n]{15,1500})\""),
]


def quote_spans(text):
    """Отрезки текста внутри кавычек — кандидаты в оформленные цитаты."""
    spans = []
    for rx in _QUOTE_RES:
        for m in rx.finditer(text):
            spans.append((m.start(1), m.end(1)))
    spans.sort()
    return spans


_BIB_RE = re.compile(
    r"^[ \t]*(?:\d+[.)]?[ \t]*)?(список\s+(?:использованн\w+\s+|использ\.\s+)?(?:литературы|источников)(?:\s+и\s+литературы)?"
    r"|список\s+цитируем\w+\s+(?:литературы|источников)|библиографический\s+список|библиография|литература"
    r"|references|bibliography|works\s+cited)[ \t]*:?[ \t]*$",
    re.IGNORECASE | re.MULTILINE,
)


def bibliography_start(text):
    """Позиция заголовка списка литературы (во второй половине текста) или None."""
    found = None
    for m in _BIB_RE.finditer(text):
        if m.start() > len(text) * 0.4:
            found = m.start()
    return found
