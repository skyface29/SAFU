# API отметок (arktika-app.ru/otmetki/)

Сервер для страницы отметок посещаемости. Хранит только шифр: фамилии, отметки и предметы шифруются
в браузере ключом из кода группы (HKDF + AES-GCM), код на сервер не попадает. Сервер видит номер группы
(хеш из кода), ключи записей и хеш пропуска на запись.

| Файл | Что делает |
|---|---|
| `core.js` | протокол: `create`, `get`, `put`, `del`, `month`, `student`; проверки и ограничения (без зависимостей от Node) |
| `store-d1.js` | хранилище в Cloudflare D1 (рабочее): таблица `kv(g, k, d, s, upd)`, части студентов — в колонке `s` строки пары |
| `worker.js` | воркер Cloudflare: `fetch` → `core.http` с хранилищем D1 (привязка `DB`) |
| `proxy.js` | функция Yandex: пересылает запрос в воркер (из России Cloudflare открывается не везде) |
| `d1-local.js` | имитация D1 поверх встроенного `node:sqlite` для проверки у себя |
| `store-s3.js`, `store-ydb.js`, `index.js` | прежние хранилища Yandex (Object Storage, YDB), про запас |
| `store-mem.js` | хранилище в памяти |
| `dev-server.js` | сайт + API на одном порту для проверки у себя (D1 в памяти) |
| `pack.js` | сборка `dist/worker.js` (ES-модуль для Cloudflare) и `dist/proxy.js` (для Yandex) |

Ключи хранилища: `_w` (хеш пропуска), `meta` (список группы), `st/<метка>` (карточка студента),
`l/<дата>T<время>-<хеш>` (пара: шифр для старост и метки студентов), `s/<метка>/<дата>T…` (часть
одного студента). Пара — одна строка D1, поэтому страница студента читает только строки пар своего месяца.

## Проверить у себя

```
node otmetki-api/dev-server.js 8790 <папка с данными ветки ruz-data>
```
Открыть `http://localhost:8790/otmetki/`, в консоли браузера: `localStorage.setItem('otmetki.api','/api')`.

## Как работает сейчас (бесплатно, без карты)

```
браузер → функция Yandex otmetki (proxy.js) → воркер Cloudflare otmetki-api (worker.js) → D1 otmetki
```
1. Cloudflare, бесплатный план: воркер `otmetki-api` (`https://otmetki-api.zarubin-kirillcka.workers.dev/`),
   база D1 `otmetki`, привязка `DB`. Код: `node pack.js` → `dist/worker.js`. Таблица создаётся сама.
   Лимиты бесплатного плана: 100 тыс. запросов к воркеру, 5 млн прочитанных и 100 тыс. записанных строк в день,
   5 ГБ. При превышении Cloudflare просто отвечает ошибкой до конца суток, счёта не будет.
2. Yandex Cloud Functions: функция `otmetki`, публичная, Node.js 22, точка входа `index.handler`,
   код — `dist/proxy.js` (в консоли он лежит в `index.js`). Адрес воркера можно поменять переменной `UPSTREAM`.
   Бесплатно 1 млн вызовов и 10 ГБ×ч в месяц.
3. Адрес `https://functions.yandexcloud.net/d4e8m5ak49b1ggo0cbkh` вписан в `API_DEFAULT` в `site/otmetki/index.html`.

