// Хранилище в Yandex Object Storage (S3). Доступ — IAM-токен сервисного аккаунта функции
// (заголовок X-YaCloud-SubjectToken, токен приходит в context.token), ключей и секретов нет.
// Раскладка в бакете (всё — шифр, кроме хеша пропуска):
//   g/<группа>/_w, g/<группа>/meta, g/<группа>/st/<метка>  — отдельные объекты
//   g/<группа>/m/<ГГГГ-ММ>  — все пары месяца одним объектом {l: {ключ: пара}, s: {метка: {ключ: часть студента}}}
// Так отметка пары — это 1 чтение и 1 запись, месяц для старосты и студента — 1 чтение.
'use strict';
const BUCKET = process.env.BUCKET || 'otmetki-arktika-data';
const HOST = process.env.S3_ENDPOINT || 'https://storage.yandexcloud.net';

module.exports = function s3Store(context, fetchImpl) {
  const f = fetchImpl || fetch;
  const tok = context && context.token && context.token.access_token;
  const H = tok ? { 'X-YaCloud-SubjectToken': tok } : {};
  const url = (g, name) => HOST + '/' + BUCKET + '/g/' + g + '/' + name;
  const months = new Map();   // кэш месяцев на время одного запроса

  async function rawGet(g, name) {
    const r = await f(url(g, name), { headers: H });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('S3 GET ' + r.status + ' ' + (await r.text()).slice(0, 200));
    return r.text();
  }
  async function rawPut(g, name, body) {
    const r = await f(url(g, name), { method: 'PUT', headers: { ...H, 'Content-Type': 'application/octet-stream' }, body });
    if (!r.ok) throw new Error('S3 PUT ' + r.status + ' ' + (await r.text()).slice(0, 200));
  }
  async function month(g, m) {
    const id = g + '/' + m;
    if (!months.has(id)) {
      const t = await rawGet(g, 'm/' + m);
      months.set(id, t ? JSON.parse(t) : { l: {}, s: {} });
    }
    return months.get(id);
  }
  // l/2026-10-29T0820-xxxx → месяц 2026-10, ключ 2026-10-29T0820-xxxx; s/<метка>/2026-10-… → то же + метка
  function where(k) {
    if (k.startsWith('l/')) return { m: k.slice(2, 9), kind: 'l', key: k.slice(2) };
    if (k.startsWith('s/')) return { m: k.slice(19, 26), kind: 's', tag: k.slice(2, 18), key: k.slice(19) };
    return null;
  }
  async function saveMonths(g, ids, check) {
    for (const m of ids) {
      const o = await month(g, m);
      await rawPut(g, 'm/' + m, JSON.stringify(o));
      if (check) {   // кто-то мог записать этот месяц одновременно — проверяем и дописываем своё
        const now = JSON.parse((await rawGet(g, 'm/' + m)) || '{"l":{},"s":{}}');
        let lost = false;
        for (const [k, v] of Object.entries(o.l)) if (now.l[k] !== v) lost = true;
        if (lost) { for (const [k, v] of Object.entries(now.l)) if (!(k in o.l)) o.l[k] = v;
          for (const [t, part] of Object.entries(now.s)) { o.s[t] = o.s[t] || {}; for (const [k, v] of Object.entries(part)) if (!(k in o.s[t])) o.s[t][k] = v; }
          await rawPut(g, 'm/' + m, JSON.stringify(o)); }
      }
    }
  }
  return {
    async get(g, k) {
      const w = where(k);
      if (!w) return rawGet(g, k);
      const o = await month(g, w.m);
      return (w.kind === 'l' ? o.l[w.key] : (o.s[w.tag] || {})[w.key]) || null;
    },
    async put(g, items) {
      const touched = new Set();
      for (const it of items) {
        const w = where(it.k);
        if (!w) { await rawPut(g, it.k, it.d); continue; }
        const o = await month(g, w.m); touched.add(w.m);
        if (w.kind === 'l') o.l[w.key] = it.d; else (o.s[w.tag] = o.s[w.tag] || {})[w.key] = it.d;
      }
      await saveMonths(g, touched, true);
    },
    async delMany(g, keys) {
      const touched = new Set();
      for (const k of keys) {
        const w = where(k); if (!w) continue;
        const o = await month(g, w.m); touched.add(w.m);
        if (w.kind === 'l') delete o.l[w.key]; else if (o.s[w.tag]) { delete o.s[w.tag][w.key]; if (!Object.keys(o.s[w.tag]).length) delete o.s[w.tag]; }
      }
      await saveMonths(g, touched, false);
    },
    // prefix: l/<ГГГГ-ММ>- или s/<метка>/<ГГГГ-ММ>-
    async list(g, prefix) {
      const w = where(prefix + 'x'), o = await month(g, w.m), out = [];
      const src = w.kind === 'l' ? o.l : (o.s[w.tag] || {});
      for (const key of Object.keys(src).sort()) if (key.startsWith(w.key.slice(0, -1))) out.push({ k: (w.kind === 'l' ? 'l/' : 's/' + w.tag + '/') + key, d: src[key] });
      return out;
    },
  };
};
