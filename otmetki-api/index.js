// Точка входа Yandex Cloud Functions (среда Node.js 22, обработчик index.handler).
// Хранилище: Object Storage (по умолчанию; переменная BUCKET) или YDB (STORE=ydb, YDB_DATABASE, нужен пакет ydb-sdk).
'use strict';
const { http } = require('./core');
const makeStore = process.env.STORE === 'ydb' ? require('./store-ydb') : require('./store-s3');
// ydb-sdk при недоступной базе может оставить необработанный отказ промиса; не роняем из-за этого экземпляр функции
process.on('unhandledRejection', e => console.error('unhandled', e && e.message));
module.exports.handler = (event, context) => http(event, async () => makeStore(context));
