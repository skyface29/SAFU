// Подделка Cloudflare D1 поверх встроенного SQLite в Node 22 — для проверки у себя.
'use strict';
const { DatabaseSync } = require('node:sqlite');
module.exports = function d1Local(file) {
  const db = new DatabaseSync(file || ':memory:');
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    async first() { return db.prepare(sql).get(...args) || null; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async run() { db.prepare(sql).run(...args); return { success: true }; },
  });
  return {
    prepare: sql => stmt(sql),
    async batch(list) { db.exec('BEGIN'); try { for (const s of list) await s.run(); db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } },
  };
};
