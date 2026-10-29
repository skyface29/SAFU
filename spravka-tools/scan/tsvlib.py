# Чтение TSV tesseract: строки слов с координатами и проверка «чернил» под словом
import csv, re
from PIL import Image
def load(tsv):
    rows = list(csv.DictReader(open(tsv, encoding='utf-8'), delimiter='\t', quoting=csv.QUOTE_NONE))
    lines = {}
    for r in rows:
        if r['level'] != '5' or not r['text'].strip(): continue
        k = (int(r['block_num']), int(r['par_num']), int(r['line_num']))
        lines.setdefault(k, []).append(dict(t=r['text'], x=int(r['left']), y=int(r['top']), w=int(r['width']), h=int(r['height']), c=float(r['conf'])))
    return [lines[k] for k in sorted(lines)]
def ink(img, wd, pad=0):
    box = img.crop((wd['x'] - pad, wd['y'] - pad, wd['x'] + wd['w'] + pad, wd['y'] + wd['h'] + pad))
    px = box.getdata(); n = len(px) or 1
    return sum(1 for p in px if p < 110) / n
