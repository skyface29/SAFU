"""Minimal stdlib PDF probe: object stats, producer, page count, images, fonts, text via ToUnicode."""
import re, sys, zlib

def load(path):
    return open(path, 'rb').read()

def objects(data):
    objs = {}
    for m in re.finditer(rb'(\d+)\s+(\d+)\s+obj\b(.*?)endobj', data, re.S):
        objs[int(m.group(1))] = m.group(3)
    # object streams
    for num, body in list(objs.items()):
        if b'/ObjStm' in body:
            s = stream(body)
            if s is None: continue
            n = int(re.search(rb'/N\s+(\d+)', body).group(1))
            first = int(re.search(rb'/First\s+(\d+)', body).group(1))
            hdr = s[:first].split()
            for i in range(n):
                on, off = int(hdr[2*i]), int(hdr[2*i+1])
                end = int(hdr[2*i+3]) if i+1 < n else len(s)-first
                objs.setdefault(on, s[first+off:first+end])
    return objs

def stream(body):
    m = re.search(rb'stream\r?\n(.*)endstream', body, re.S)
    if not m: return None
    raw = m.group(1)
    if b'/FlateDecode' in body.split(b'stream')[0]:
        try: return zlib.decompress(raw)
        except Exception:
            try: return zlib.decompressobj().decompress(raw)
            except Exception: return None
    return raw

def parse_cmap(s):
    mp = {}
    for blk in re.findall(rb'beginbfchar(.*?)endbfchar', s, re.S):
        for a, b in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>', blk):
            mp[int(a, 16)] = bytes.fromhex(b.decode()).decode('utf-16-be', 'replace')
    for blk in re.findall(rb'beginbfrange(.*?)endbfrange', s, re.S):
        for a, b, c in re.findall(rb'<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<[0-9A-Fa-f]+>|\[[^\]]*\])', blk):
            lo, hi = int(a, 16), int(b, 16)
            if c.startswith(b'<'):
                base = int(c[1:-1], 16)
                for k in range(lo, hi+1):
                    mp[k] = chr(base + k - lo)
            else:
                for k, h in zip(range(lo, hi+1), re.findall(rb'<([0-9A-Fa-f]+)>', c)):
                    mp[k] = bytes.fromhex(h.decode()).decode('utf-16-be', 'replace')
    return mp

def ref(body, key):
    m = re.search(rb'/' + key + rb'\s+(\d+)\s+0\s+R', body)
    return int(m.group(1)) if m else None

def main(path, maxlines):
    data = load(path)
    objs = objects(data)
    prod = re.findall(rb'/(Producer|Creator)\s*\(([^)]*)\)', data)
    print('producer/creator:', [(k.decode(), v.decode('latin1')) for k, v in prod])
    pages = [n for n, b in objs.items() if re.search(rb'/Type\s*/Page\b', b)]
    imgs = [n for n, b in objs.items() if b'/Subtype/Image' in b.replace(b' ', b'')]
    fonts = {n: re.search(rb'/BaseFont\s*/(\S+)', b).group(1).decode() for n, b in objs.items() if re.search(rb'/Type\s*/Font', b) and re.search(rb'/BaseFont', b)}
    print('pages:', len(pages), 'images:', len(imgs), 'fonts:', sorted(set(fonts.values()))[:10])
    for n in imgs[:3]:
        b = objs[n]; w = re.search(rb'/Width\s+(\d+)', b); h = re.search(rb'/Height\s+(\d+)', b)
        print('  image', n, w and w.group(1), h and h.group(1))
    m = re.search(rb'/MediaBox\s*\[([^\]]*)\]', data)
    print('mediabox:', m and m.group(1).decode())
    # font name -> cmap
    cmaps = {}
    for n, b in objs.items():
        if n in fonts:
            tu = ref(b, rb'ToUnicode')
            if tu and tu in objs:
                s = stream(objs[tu])
                if s: cmaps[n] = parse_cmap(s)
    # page resources font map
    out = []
    def pkey(n):
        return n
    for pn in sorted(pages, key=pkey)[:int(sys.argv[3]) if len(sys.argv)>3 else 1]:
        pb = objs[pn]
        res = pb
        r = ref(pb, rb'Resources')
        if r: res = objs[r]
        fm = re.search(rb'/Font\s*<<(.*?)>>', res, re.S)
        if not fm:
            fr = ref(res, rb'Font')
            fm_body = objs.get(fr, b'') if fr else b''
        else:
            fm_body = fm.group(1)
        fontmap = {k.decode(): int(v) for k, v in re.findall(rb'/(\w+)\s+(\d+)\s+0\s+R', fm_body)}
        cs = re.search(rb'/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)', pb).group(1)
        content = b''.join(stream(objs[int(x)]) or b'' for x in re.findall(rb'(\d+)\s+0\s+R', cs))
        print('page content bytes:', len(content))
        cur = None; line = ''
        for tok in re.finditer(rb'/(\w+)\s+[\d.]+\s+Tf|\[(.*?)\]\s*TJ|<([0-9A-Fa-f]*)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj|(ET)|([-\d.]+\s+[-\d.]+\s+T[dD])', content, re.S):
            if tok.group(1):
                cur = cmaps.get(fontmap.get(tok.group(1).decode()), {})
                continue
            if tok.group(5) or tok.group(6):
                if line.strip(): out.append(line)
                line = ''
                continue
            parts = []
            if tok.group(2) is not None:
                parts = re.findall(rb'<([0-9A-Fa-f]*)>|\(((?:\\.|[^\\)])*)\)', tok.group(2))
            elif tok.group(3) is not None:
                parts = [(tok.group(3), None)]
            else:
                parts = [(None, tok.group(4))]
            for hx, lit in parts:
                if hx:
                    step = 4 if cur and max(cur, default=0) > 255 or len(hx) % 4 == 0 and cur and any(k > 255 for k in cur) else 2
                    for i in range(0, len(hx), step):
                        c = int(hx[i:i+step], 16)
                        line += (cur or {}).get(c, '?')
                elif lit:
                    for ch in lit:
                        line += (cur or {}).get(ch, chr(ch))
    if True:
        print('---- first text lines (page 1) ----')
        for l in out[:maxlines]:
            print(l)
        print('total text runs page1:', len(out))

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    main(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 60)

