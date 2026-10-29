// Точка входа Yandex Cloud Functions (среда Node.js 22, обработчик index.handler).
// Переменная окружения YDB_DATABASE — путь базы, например /ru-central1/b1g…/etn…
'use strict';
const { http } = require('./core');
const ydbStore = require('./store-ydb');
// ydb-sdk при недоступной базе может оставить необработанный отказ промиса; не роняем из-за этого экземпляр функции
process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
module.exports.handler = (event, context) => http(event, async () => ydbStore(context));
