# API отметок (arktika-app.ru/otmetki/)

Сервер для страницы отметок посещаемости. Хранит только шифр: фамилии, отметки и предметы шифруются
в браузере ключом из кода группы (HKDF + AES-GCM), код на сервер не попадает. Сервер видит номер группы
(хеш из кода), ключи записей и хеш пропуска на запись.

| Файл | Что делает |
|---|---|
| `core.js` | протокол: `create`, `get`, `put`, `del`, `month`, `student`; проверки и ограничения |
| `store-ydb.js` | хранилище в YDB serverless, таблица `kv(g, k, d, upd)` создаётся сама |
| `store-mem.js` | хранилище в памяти для локальной проверки |
| `index.js` | точка входа Yandex Cloud Functions |
| `dev-server.js` | сайт + API на одном порту для проверки у себя |
| `pack.js` | сборка в один файл `dist/index.js` + `dist/package.json` (+ zip) |

## Проверить у себя

```
node otmetki-api/dev-server.js 8790 <папка с данными ветки ruz-data>
```
Открыть `http://localhost:8790/otmetki/`, в консоли браузера: `localStorage.setItem('otmetki.api','/api')`.

## Развернуть (Yandex Cloud, бесплатный уровень)

1. YDB → создать базу, тип **Serverless**. Скопировать «Базу данных» (путь `/ru-central1/…`).
2. Сервисный аккаунт `otmetki` с ролью `ydb.editor` на каталог.
3. Cloud Functions → функция `otmetki`, **публичная**. Версия: Node.js 22, точка входа `index.handler`,
   код из `node pack.js` (файлы `dist/index.js` и `dist/package.json`), память 128 МБ, таймаут 10 с,
   сервисный аккаунт `otmetki`, переменная `YDB_DATABASE` = путь базы.
4. Адрес функции (`https://functions.yandexcloud.net/<id>`) вписать в `API_DEFAULT` в `site/otmetki/index.html`.

Ключей и токенов нет: доступ к базе даёт сервисный аккаунт функции (IAM-токен приходит в `context.token`).
