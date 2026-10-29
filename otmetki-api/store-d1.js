// Хранилище в Cloudflare D1 (SQLite). Бесплатный план без карты: при исчерпании дневного лимита запросы
// просто не проходят, денег не списывают. Таблица создаётся сама.
// Строки: g — номер группы, k — ключ (_w, meta, st/<метка>, l/<дата>…), d — шифр,
// s — у пары: части студентов {метка: шифр}. Так отметка пары — 1 записанная строка,
// а страница студента читает строки месяца и берёт из них только свою часть.
'use strict';
const TAG = /^[abcdefghjklmnpqrstuvwxyz2-9]{16}$/;
let inited = null;

module.exports = function d1Store(db) {
  if (!inited) inited = db.prepare('CREATE TABLE IF NOT EXISTS kv (g TEXT NOT NULL, k TEXT NOT NULL, d TEXT NOT NULL, s TEXT, upd INTEGER NOT NULL, PRIMARY KEY (g, k)) WITHOUT ROWID').run()
    .catch(e => { inited = null; throw e; });
  const ready = () => inited;
  // s/<метка>/<дата>… → часть студента внутри строки пары l/<дата>…
  const part = k => k.startsWith('s/') ? { tag: k.slice(2, 18), lk: 'l/' + k.slice(19) } : null;
  const range = p => [p, p.slice(0, -1) + String.fromCharCode(p.charCodeAt(p.length - 1) + 1)];   // все ключи, начинающиеся с p
  return {
    async get(g, k) {
      await ready(); const w = part(k);
      if (!w) { const r = await db.prepare('SELECT d FROM kv WHERE g = ?1 AND k = ?2').bind(g, k).first(); return r ? r.d : null; }
      const r = await db.prepare('SELECT s FROM kv WHERE g = ?1 AND k = ?2').bind(g, w.lk).first();
      return r && r.s ? JSON.parse(r.s)[w.tag] || null : null;
    },
    async put(g, items) {
      await ready(); const now = Date.now(), rows = new Map();
      for (const it of items) {
        const w = part(it.k);
        if (w) { const r = rows.get(w.lk) || {}; (r.s = r.s || {})[w.tag] = it.d; rows.set(w.lk, r); }
        else { const r = rows.get(it.k) || {}; r.d = it.d; rows.set(it.k, r); }
      }
      const st = [];
      for (const [k, r] of rows) {
        if (r.d === undefined) continue;   // части без самой пары не бывает: ядро всегда шлёт пару целиком
        st.push(db.prepare('INSERT INTO kv (g, k, d, s, upd) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT (g, k) DO UPDATE SET d = excluded.d, s = excluded.s, upd = excluded.upd')
          .bind(g, k, r.d, k.startsWith('l/') ? JSON.stringify(r.s || {}) : null, now));
      }
      if (st.length) await db.batch(st);
    },
    async delMany(g, keys) {
      await ready(); const gone = new Set(keys.filter(k => !k.startsWith('s/'))), st = [];
      for (const k of gone) st.push(db.prepare('DELETE FROM kv WHERE g = ?1 AND k = ?2').bind(g, k));
      for (const k of keys) {
        const w = part(k); if (!w || gone.has(w.lk) || !TAG.test(w.tag)) continue;
        st.push(db.prepare(`UPDATE kv SET s = json_remove(s, '$."${w.tag}"') WHERE g = ?1 AND k = ?2`).bind(g, w.lk));
      }
      if (st.length) await db.batch(st);
    },
    // prefix: l/<ГГГГ-ММ>- (пары месяца) или s/<метка>/<ГГГГ-ММ>- (части одного студента за месяц)
    async list(g, prefix) {
      await ready();
      if (prefix.startsWith('l/')) {
        const [a, b] = range(prefix);
        const { results } = await db.prepare('SELECT k, d FROM kv WHERE g = ?1 AND k >= ?2 AND k < ?3 ORDER BY k').bind(g, a, b).all();
        return results.map(r => ({ k: r.k, d: r.d }));
      }
      const tag = prefix.slice(2, 18); if (!TAG.test(tag)) return [];
      const [a, b] = range('l/' + prefix.slice(19));
      const { results } = await db.prepare(`SELECT k, json_extract(s, '$."${tag}"') AS v FROM kv WHERE g = ?1 AND k >= ?2 AND k < ?3 AND v IS NOT NULL ORDER BY k`).bind(g, a, b).all();
      return results.map(r => ({ k: 's/' + tag + '/' + r.k.slice(2), d: r.v }));
    },
  };
};
