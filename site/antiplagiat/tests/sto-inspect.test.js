// Тесты строгого инспектора СТО (sto-inspect.js): оформленный файл должен проходить проверку
// без единого замечания, а испорченный — ловиться по конкретным правилам.
// Запуск: node site/antiplagiat/tests/sto-inspect.test.js   (нужен playwright)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..', '..');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css', png: 'image/png', json: 'application/json' };

let fail = 0, n = 0;
const results = [];
async function T(name, fn) { n++; try { await fn(); results.push('✓ ' + name); } catch (e) { fail++; results.push('✗ ' + name + '\n   ' + (e && e.message || e)); } }
const assert = (c, msg) => { if (!c) throw new Error(msg || 'условие не выполнено'); };
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error((msg ? msg + ': ' : '') + 'получили ' + JSON.stringify(got) + ', ожидали ' + JSON.stringify(want)); };

(async () => {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    let f = path.join(SITE, decodeURIComponent(u.pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(SITE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[f.split('.').pop()] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://localhost:' + server.address().port;
  const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/antiplagiat/', { waitUntil: 'load' });
  await page.addScriptTag({ path: path.join(__dirname, 'fixtures.js') });
  await page.evaluate(() => {
    const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const text = p => { let s = ''; for (const t of p.getElementsByTagNameNS(W, 't')) s += t.textContent; return s; };
    window.__fmt = async key => {
      const buf = await StoFixtures.docx(StoFixtures[key]);
      const t = await Formatter.readTitle(buf.slice(0));
      const titleXml = t && t.found ? StoTools.titleXml(Object.assign({ type: 'referat' }, t)) : null;
      const r = await Formatter.formatDocx(buf.slice(0), { profile: 'safu', toc: true, typography: true, pageNumbers: true, size: 14, titleXml });
      return await r.blob.arrayBuffer();
    };
    window.__src = async key => await StoFixtures.docx(StoFixtures[key]);
    window.__inspect = async buf => { const r = await StoInspect.inspect(buf, { size: 14, binding: false }); return { ok: r.ok, issues: r.issues.map(x => x.rule), checked: r.checked }; };
    window.__mutate = async (buf, kind) => {
      const z = await Formatter.unzip(buf);
      const ent = z.find(e => e.name === 'word/document.xml');
      const doc = new DOMParser().parseFromString(new TextDecoder().decode(ent.data), 'application/xml');
      const body = doc.getElementsByTagNameNS(W, 'body')[0];
      const paras = [...body.getElementsByTagNameNS(W, 'p')];
      const pPr = p => [...p.childNodes].find(c => c.localName === 'pPr');
      const set = (p, name, attrs) => { let e = [...(pPr(p) || {}).childNodes || []].find(c => c.localName === name); if (!e) { e = doc.createElementNS(W, 'w:' + name); pPr(p).appendChild(e); } for (const k in attrs) e.setAttributeNS(W, 'w:' + k, attrs[k]); };
      if (kind === 'heading') {
        const p = paras.find(p => text(p).trim() === '1 Первые экспедиции');
        if (!p) throw new Error('заголовок «1 Первые экспедиции» не найден');
        for (const b of [...p.getElementsByTagNameNS(W, 'b')]) b.parentNode.removeChild(b);
        for (const b of [...p.getElementsByTagNameNS(W, 'bCs')]) b.parentNode.removeChild(b);
        set(p, 'jc', { val: 'center' }); set(p, 'ind', { firstLine: '0' }); set(p, 'spacing', { after: '0' });
      } else if (kind === 'body') {
        const p = paras.find(p => { const s = text(p); return s.trim().length > 120 && !/^(рисунок|таблица)/i.test(s.trim()); });
        if (!p) throw new Error('абзац основного текста не найден');
        for (const r of p.getElementsByTagNameNS(W, 'r')) {
          const rPr = [...r.childNodes].find(c => c.localName === 'rPr'); if (!rPr) continue;
          let f = [...rPr.childNodes].find(c => c.localName === 'rFonts');
          if (!f) { f = doc.createElementNS(W, 'w:rFonts'); rPr.appendChild(f); }
          f.setAttributeNS(W, 'w:ascii', 'Calibri'); f.setAttributeNS(W, 'w:hAnsi', 'Calibri');
          let sz = [...rPr.childNodes].find(c => c.localName === 'sz');
          if (!sz) { sz = doc.createElementNS(W, 'w:sz'); rPr.appendChild(sz); }
          sz.setAttributeNS(W, 'w:val', '20');
        }
        set(p, 'spacing', { line: '240', lineRule: 'auto' });
      } else if (kind === 'table') {
        const tbls = [...body.getElementsByTagNameNS(W, 'tbl')];
        const tbl = tbls[tbls.length - 1]; if (!tbl) throw new Error('таблица не найдена');
        const tblPr = [...tbl.childNodes].find(c => c.localName === 'tblPr');
        let jc = [...tblPr.childNodes].find(c => c.localName === 'jc');
        if (!jc) { jc = doc.createElementNS(W, 'w:jc'); tblPr.appendChild(jc); }
        jc.setAttributeNS(W, 'w:val', 'left');
        const cp = tbl.getElementsByTagNameNS(W, 'p')[0];
        for (const r of cp.getElementsByTagNameNS(W, 'r')) {
          const rPr = [...r.childNodes].find(c => c.localName === 'rPr'); if (!rPr) continue;
          let sz = [...rPr.childNodes].find(c => c.localName === 'sz');
          if (!sz) { sz = doc.createElementNS(W, 'w:sz'); rPr.appendChild(sz); }
          sz.setAttributeNS(W, 'w:val', '28');
        }
      } else if (kind === 'footer') {
        const fe = z.find(e => /^word\/footer\d*\.xml$/.test(e.name)); if (!fe) throw new Error('колонтитул не найден');
        fe.data = new TextEncoder().encode(new TextDecoder().decode(fe.data).replace(/(<w:sz w:val=")\d+(")/g, '$120$2'));
      } else if (kind === 'typo') {
        const p = paras.find(p => { const t = text(p); return t.trim().length > 90 && !/^(рисунок|таблица)/i.test(t.trim()); });
        if (!p) throw new Error('абзац не найден');
        const t0 = p.getElementsByTagNameNS(W, 't')[0];
        t0.textContent = 'Пример текста ( скобка и точка .';
      }
      const xml = new XMLSerializer().serializeToString(doc), enc = new TextEncoder();
      const entries = z.map(e => e.name === 'word/document.xml' ? { name: e.name, data: enc.encode(xml) } : { name: e.name, data: e.data });
      return await (await Formatter.zipFiles(entries)).arrayBuffer();
    };
  });

  for (const key of ['REFERAT', 'METOD_PDF', 'REPORT_WORD']) {
    await T('оформленный ' + key + ' проходит инспектор без замечаний', async () => {
      const r = await page.evaluate(async k => await __inspect(await __fmt(k)), key);
      assert(r.ok, 'замечания: ' + r.issues.join(' | '));
      assert(r.checked > 0, 'ни одного абзаца не проверено');
    });
  }
  await T('исходный (неоформленный) файл даёт замечания', async () => {
    const r = await page.evaluate(async () => await __inspect(await __src('REFERAT')));
    assert(!r.ok && r.issues.length > 0, 'инспектор не увидел нарушений в исходнике');
  });
  await T('заголовок: ловится выравнивание по центру', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'heading')));
    assert(r.issues.includes('Заголовок: по левому краю'), r.issues.join('; '));
  });
  await T('заголовок: ловится пропавший абзацный отступ', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'heading')));
    assert(r.issues.includes('Заголовок: абзацный отступ 1,25 см'), r.issues.join('; '));
  });
  await T('заголовок: ловится интервал после не 12 пт', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'heading')));
    assert(r.issues.includes('Заголовок: интервал 12 пт после'), r.issues.join('; '));
  });
  await T('основной текст: ловится чужой шрифт', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'body')));
    assert(r.issues.includes('Шрифт Times New Roman'), r.issues.join('; '));
  });
  await T('основной текст: ловится кегль не 14 пт', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'body')));
    assert(r.issues.includes('Кегль основного текста'), r.issues.join('; '));
  });
  await T('основной текст: ловится одинарный интервал', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'body')));
    assert(r.issues.includes('Межстрочный интервал 1,5'), r.issues.join('; '));
  });
  await T('таблица: ловится отсутствие центрирования', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('METOD_PDF'), 'table')));
    assert(r.issues.includes('Таблица: по центру'), r.issues.join('; '));
  });
  await T('таблица: ловится кегль текста в ячейке', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('METOD_PDF'), 'table')));
    assert(r.issues.includes('Текст таблицы: кегль на 1–2 пт меньше'), r.issues.join('; '));
  });
  await T('номер страницы: ловится недопустимый кегль', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'footer')));
    assert(r.issues.includes('Номер страницы: кегль 12–14'), r.issues.join('; '));
  });
  await T('типографика: ловится пробел после скобки', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'typo')));
    assert(r.issues.includes('Типографика: без пробела после скобки'), r.issues.join('; '));
  });
  await T('типографика: ловится пробел перед знаком', async () => {
    const r = await page.evaluate(async () => await __inspect(await __mutate(await __fmt('REFERAT'), 'typo')));
    assert(r.issues.includes('Типографика: без пробела перед знаком'), r.issues.join('; '));
  });
  await T('оценка готовности: 100 у оформленного, меньше у испорченного', async () => {
    const good = await page.evaluate(async () => (await StoInspect.inspect(await __fmt('REFERAT'), { size: 14, binding: false })).score);
    const bad = await page.evaluate(async () => (await StoInspect.inspect(await __mutate(await __fmt('REFERAT'), 'body'), { size: 14, binding: false })).score);
    assert(good === 100, 'оформленный: ' + good); assert(bad < 100, 'испорченный: ' + bad);
  });
  await T('у замечаний есть пункт СТО и подсказка «как исправить»', async () => {
    const r = await page.evaluate(async () => {
      const ins = await StoInspect.inspect(await __src('REFERAT'), { all: true, size: 14, binding: false });
      const x = ins.issues.find(i => i.clause) || ins.issues[0] || {};
      return { clause: x.clause, hint: x.hint, grade: ins.grade, score: ins.score };
    });
    assert(r.clause, 'нет пункта СТО'); assert(r.hint, 'нет подсказки'); assert(r.grade, 'нет оценки готовности');
  });
  await T('на странице нет ошибок JavaScript', async () => assert(!errors.length, errors.join(' | ')));

  console.log(results.join('\n'));
  console.log(n + ' из ' + n + ' проверок пройдено' + (fail ? ', провалено ' + fail : ''));
  await browser.close(); server.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
