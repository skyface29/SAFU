// Фаззинг: оформление, повторное оформление, сохранность слов, замечания.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8799/antiplagiat/', { waitUntil: 'load' });
const dir = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
const res = {};
for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.docx')).sort()) {
  const data = fs.readFileSync(path.join(dir, f)).toString('base64');
  const r = await p.evaluate(async d => {
    const bin = Uint8Array.from(atob(d), c => c.charCodeAt(0)).buffer;
    const opts = t => ({ profile: 'safu', toc: true, typography: true, pageNumbers: true, size: 14, titleXml: t });
    const txt = async buf => { const z = await Formatter.zipFiles.read(buf); const x = new TextDecoder().decode(z['word/document.xml']); const doc = new DOMParser().parseFromString(x, 'application/xml');
      const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'; let s=''; const ts=doc.getElementsByTagNameNS(W,'t'); for (const t of ts) s+=t.textContent+' '; return s; };
    try {
      const t = await Formatter.readTitle(bin.slice(0));
      const titleXml = t && t.found ? StoTools.titleXml(Object.assign({ type: 'referat' }, t)) : null;
      const r1 = await Formatter.formatDocx(bin.slice(0), opts(titleXml));
      const b1 = await r1.blob.arrayBuffer();
      const r2 = await Formatter.formatDocx(b1.slice(0), opts(null));
      const b2 = await r2.blob.arrayBuffer();
      const g = await Iceberg.gostCheck(b1.slice(0)), g2 = await Iceberg.gostCheck(b2.slice(0));
      const enc = buf => { const u8 = new Uint8Array(buf); let s = ''; for (let i = 0; i < u8.length; i += 32768) s += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(s); };
      return { ok: true, b1: enc(b1), b2: enc(b2), 
        left: g.items.filter(x => !x.ok).map(x => x.name + ': ' + x.found), left2: g2.items.filter(x => !x.ok).map(x => x.name + ': ' + x.found), titleFound: !!(t && t.found) };
    } catch (e) { return { ok: false, err: String(e && e.stack || e) }; }
  }, data);
  if (!r.ok) { console.log('FAIL', f, r.err); res[f] = { fail: r.err }; continue; }
  fs.writeFileSync(path.join(out, f), Buffer.from(r.b1, 'base64'));
  fs.writeFileSync(path.join(out, f.replace('.docx', '.2.docx')), Buffer.from(r.b2, 'base64'));
  res[f] = { left: r.left, left2: r.left2, title: r.titleFound };
}
fs.writeFileSync(path.join(out, 'res.json'), JSON.stringify(res));
console.log('page errors:', errs); await b.close(); })();
