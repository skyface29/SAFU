// Хранилище в памяти — для локальной проверки (node dev-server.js). Те же методы, что у store-ydb.js.
'use strict';
module.exports = function memStore() {
  const m = new Map();
  const id = (g, k) => g + '\u0000' + k;
  return {
    async get(g, k) { return m.has(id(g, k)) ? m.get(id(g, k)) : null; },
    async put(g, items) { for (const it of items) m.set(id(g, it.k), it.d); },
    async delMany(g, keys) { for (const k of keys) m.delete(id(g, k)); },
    async list(g, prefix) {
      const p = id(g, prefix), out = [];
      for (const [key, d] of m) if (key.startsWith(p)) out.push({ k: key.slice(g.length + 1), d });
      return out.sort((a, b) => (a.k < b.k ? -1 : 1));
    },
  };
};
