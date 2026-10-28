# Скан → строки текста. Убирает «тире» в широких пробелах выравнивания (под ними нет краски),
# применяет ручные исправления из fixes.txt и печатает подозрительные слова для сверки со сканом.
# python3 clean.py 00-04 00-05 ...   → lines/<стр>.json (с координатами) и text/<стр>.txt (сверенный текст)
import sys, os, re, json, difflib
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tsvlib
from PIL import Image
import pymorphy3
M = pymorphy3.MorphAnalyzer()
ST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'docs', 'stip')
HERE = os.path.dirname(os.path.abspath(__file__))
os.makedirs(HERE + '/lines', exist_ok=True); os.makedirs(HERE + '/text', exist_ok=True)
DASH = re.compile(r'^[—–\-=|`’‘_~]+$')

def fixes():
    # формат: стр<TAB>было<TAB>стало   (строка «стр<TAB>*<TAB>…» не используется)
    out = {}
    p = HERE + '/fixes.txt'
    if not os.path.exists(p): return out
    for l in open(p, encoding='utf-8'):
        l = l.rstrip('\n')
        if not l.strip() or l.startswith('#'): continue
        f = l.split('\t')
        out.setdefault(f[0], []).append((f[1], f[2], int(f[3]) if len(f) > 3 else 1))
    return out

def page(pg, FX):
    img = Image.open(f'{ST}/img/{pg}.png').convert('L')
    L = tsvlib.load(f'{ST}/tsv/{pg}.tsv')
    out, flags = [], []
    for ln in L:
        words = []
        for i, w in enumerate(ln):
            t = w['t']
            if DASH.match(t):
                k = tsvlib.ink(img, w)
                if k < 0.05: continue           # пустой промежуток — не тире
                if t in ('=', '|', '`', '’', '‘', '_', '~'): flags.append((pg, 'знак', t, ' '.join(x['t'] for x in ln)))
                t = '–' if t in ('—', '–') else t
            elif re.match(r'^[—–][А-Яа-яЁё«"(]', t):
                t = '– ' + t[1:]
                if i: flags.append((pg, 'тире-слитно', t, ' '.join(x['t'] for x in ln)))
            words.append(t)
        if not words: continue
        x0 = min(w['x'] for w in ln); y0 = min(w['y'] for w in ln)
        x1 = max(w['x'] + w['w'] for w in ln); y1 = max(w['y'] + w['h'] for w in ln)
        out.append(dict(t=' '.join(words), box=[x0, y0, x1, y1], conf=[round(w['c']) for w in ln]))
    # ручные исправления: применяются к строкам по порядку, каждое должно сработать ровно один раз
    for a, b, n in FX.get('*', []):  # общие безопасные замены (слитные «втом», «атакже»)
        for l in out:
            if a in l['t']: l['t'] = l['t'].replace(a, b); l['fixed'] = 1
    for a, b, n in FX.get(pg, []):
        hits = sum(l['t'].count(a) for l in out)
        if hits != n: raise SystemExit(f'{pg}: исправление «{a}» найдено {hits} раз, ожидалось {n}')
        for l in out:
            if a in l['t']: l['t'] = l['t'].replace(a, b); l['fixed'] = 1
    out = [l for l in out if l['t'].strip()]
    for l in out:  # маркер списка в начале строки — всегда одно и то же тире
        if l['t'].startswith('- '): l['t'] = '– ' + l['t'][2:]
    # второе распознавание (psm 6) — расхождения по словам
    alt = open(f'{ST}/ocr6/{pg}.txt', encoding='utf-8').read().split()
    mine = ' '.join(l['t'] for l in out).split()
    sm = difflib.SequenceMatcher(None, mine, alt, autojunk=False)
    for op, a1, a2, b1, b2 in sm.get_opcodes():
        if op == 'equal': continue
        A = ' '.join(mine[a1:a2]); B = ' '.join(alt[b1:b2])
        if re.sub(r'[—–\-\s]', '', A) == re.sub(r'[—–\-\s]', '', B): continue
        flags.append((pg, 'psm6', A, B))
    prev = ''
    for l in out:  # заглавная «В/С/К/О/У/И» посреди фразы и апострофы — частые ошибки распознавания
        for m in re.finditer(r'(?<=[а-яё,] )[ВСКОУИ](?= [а-яё])|[’‘`]', prev[-3:] + ' ' + l['t'] if False else l['t']):
            flags.append((pg, 'знак', m.group(0), l['t']))
        for m in re.finditer(r'(?<=[а-яё,] )[А-ЯЁ]{2,}(?= [а-яё])', l['t']):  # «КОМИССИИ» посреди строчного текста
            flags.append((pg, 'знак', m.group(0), l['t']))
        if re.match(r'^[ВСКОУИ] [а-яё]', l['t']) and re.search(r'[а-яё,]$', prev): flags.append((pg, 'знак', l['t'][:1], l['t']))
        prev = l['t']
    for l in out:
        for w in re.findall(r'[А-Яа-яЁёA-Za-z]+', l['t']):
            if len(w) > 1 and not M.word_is_known(w.lower()): flags.append((pg, 'слово', w, l['t']))
    json.dump(out, open(f'{HERE}/lines/{pg}.json', 'w'), ensure_ascii=False)
    # сверенный текст страницы: строка с отступом — начало абзаца
    x0 = min(l['box'][0] for l in out)
    open(f'{HERE}/text/{pg}.txt', 'w', encoding='utf-8').write(''.join(('  ' if l['box'][0] - x0 > 60 else '') + l['t'] + '\n' for l in out))
    return flags

if __name__ == '__main__':
    FX = fixes()
    for pg in sys.argv[1:]:
        for f in page(pg, FX): print('\t'.join(f))
