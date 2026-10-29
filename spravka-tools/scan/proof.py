# Картинка для сверки: строка скана, под ней — распознанный текст. python3 proof.py 00-04 [часть из 3]
import sys, json, os
from PIL import Image, ImageDraw, ImageFont
HERE = os.path.dirname(os.path.abspath(__file__))
F = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf', 44)
OUT = '/tmp/claude-0/-home-claude/748256b5-e9d4-585a-adc3-b754a338f39f/scratchpad/proof'
os.makedirs(OUT, exist_ok=True)
def render(pg, parts=3):
    img = Image.open(os.path.join(HERE, '..', 'docs', 'stip', 'img', pg + '.png')).convert('L')
    L = json.load(open(f'{HERE}/lines/{pg}.json'))
    X0 = max(0, min(l['box'][0] for l in L) - 20); X1 = min(img.width, max(l['box'][2] for l in L) + 20)
    W = X1 - X0
    tiles = []
    for l in L:
        x0, y0, x1, y1 = l['box']
        a = img.crop((X0, y0 - 6, X1, y1 + 6))
        t = Image.new('L', (W, 62), 255); d = ImageDraw.Draw(t)
        d.text((x0 - X0, 4), l['t'], font=F, fill=0)
        if d.textlength(l['t'], font=F) > W - (x0 - X0):  # не влезло — мельче
            t = Image.new('L', (W, 62), 255); d = ImageDraw.Draw(t)
            f2 = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSerifCondensed.ttf', 40)
            d.text((x0 - X0, 6), l['t'], font=f2, fill=0)
        tiles.append((a, t))
    n = len(tiles); per = -(-n // parts); files = []
    for k in range(parts):
        chunk = tiles[k * per:(k + 1) * per]
        if not chunk: continue
        H = sum(a.height + t.height + 10 for a, t in chunk)
        canvas = Image.new('RGB', (W, H), 'white'); y = 0
        for a, t in chunk:
            canvas.paste(a.convert('RGB'), (0, y)); y += a.height
            tr = Image.new('RGB', t.size, (255, 236, 236)); tr.paste((200, 0, 0), mask=Image.eval(t, lambda v: 255 - v))
            canvas.paste(tr, (0, y)); y += t.height + 10
        fn = f'{OUT}/{pg}-{k + 1}.png'; canvas.save(fn); files.append(fn)
    return files
if __name__ == '__main__':
    for fn in render(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 3): print(fn)
