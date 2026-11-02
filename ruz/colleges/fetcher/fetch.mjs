// Загрузчик PDF колледжей с narfu.ru в ветку college-inbox репозитория (её читает сборщик зеркала, ruz.yml).
// narfu.ru не открывается с зарубежных серверов, поэтому этот скрипт запускается из России:
//   • функция Yandex Cloud по таймеру (index.handler ниже), или
//   • на компьютере: GITHUB_TOKEN=… node ruz/colleges/fetcher/fetch.mjs
// Нужен токен GitHub с правом записи в репозиторий (fine-grained: Contents — Read and write, только этот репозиторий).
// Скачивает только новые файлы (сверяет со списком index.json в ветке), ничего не удаляет.
const REPO = process.env.GITHUB_REPO || 'skyface29/SAFU';
const BRANCH = process.env.INBOX_BRANCH || 'college-inbox';
const UA = 'Mozilla/5.0 (arktika-app.ru schedule mirror; +https://arktika-app.ru/raspisanie/)';
const NARFU = 'https://narfu.ru';

const SOURCES = [
  // ТК Императора Петра I: недельные PDF «gruppy-s-02.11.pdf» прямо на странице расписания
  { page: '/ltk/obrazovatelnaya/raspisanie/', dir: 'ltk', pick: (href, text) => /\/upload\/.*gruppy-[a-z]-\d{2}\.\d{2}\.pdf$/i.test(href) || /неделя\s+с/i.test(text) && /\.pdf$/i.test(href), name: href => decodeURIComponent(href.split('/').pop()) },
  // ТК Северодвинска: расписание на семестр
  { page: '/sf/stc/forstud/class.php', dir: 'sevtk', pick: (href) => /\.pdf$/i.test(href) && /расписани/i.test(decodeURIComponent(href)), name: href => 'semester-' + decodeURIComponent(href.split('/').pop()).replace(/[^\wА-Яа-яЁё.-]+/g, '_') },
  // ТК Северодвинска: замены на день «02.11.26-O.pdf» (O — очная)
  { page: '/sf/stc/forstud/', dir: 'sevtk/zamena', pick: (href) => /\/rasp\/\d{2}\.\d{2}\.\d{2}-O\.pdf$/i.test(href), name: href => decodeURIComponent(href.split('/').pop()) },
];

const links = (html, base) => [...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map(m => { let h = m[1].replace(/&amp;/g, '&'); try { h = new URL(h, base).href; } catch {} return [h, m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()]; });

async function get(url, binary = false) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ru' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return binary ? Buffer.from(await r.arrayBuffer()) : r.text();
}

function github(token) {
  const api = (path, init = {}) => fetch(`https://api.github.com/repos/${REPO}/${path}`, {
    ...init, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'arktika-college-fetcher', ...(init.headers || {}) },
  });
  return {
    async ensureBranch() {
      if ((await api(`branches/${BRANCH}`)).ok) return;
      // отдельная ветка без истории main: в ней только PDF колледжей
      const post = async (path, body) => { const r = await api(path, { method: 'POST', body: JSON.stringify(body) }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
      const tree = await post('git/trees', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: '# PDF колледжей САФУ\n\nПишет ruz/colleges/fetcher/fetch.mjs, читает сборщик зеркала (ruz.yml). Руками не трогать.\n' }] });
      const commit = await post('git/commits', { message: 'Ветка для PDF колледжей', tree: tree.sha, parents: [] });
      const r = await api('git/refs', { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${BRANCH}`, sha: commit.sha }) });
      if (!r.ok) throw new Error('не создать ветку: HTTP ' + r.status);
    },
    async read(path) {
      const r = await api(`contents/${encodeURI(path)}?ref=${BRANCH}`);
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      const j = await r.json();
      return { sha: j.sha, text: Buffer.from(j.content, 'base64').toString('utf8') };
    },
    async write(path, buf, message, sha) {
      const r = await api(`contents/${encodeURI(path)}`, { method: 'PUT', body: JSON.stringify({ message, branch: BRANCH, content: buf.toString('base64'), ...(sha ? { sha } : {}) }) });
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
    },
  };
}

export async function run({ token = process.env.GITHUB_TOKEN, log = console.log } = {}) {
  if (!token) throw new Error('нужен GITHUB_TOKEN');
  const gh = github(token);
  await gh.ensureBranch();
  const idxFile = await gh.read('index.json');
  const index = idxFile ? JSON.parse(idxFile.text) : { files: {} };   // url → { path, at }
  let added = 0;
  for (const s of SOURCES) {
    let html;
    try { html = await get(NARFU + s.page); } catch (e) { log('страница не открылась:', e.message); continue; }
    for (const [href, text] of links(html, NARFU + s.page)) {
      if (!href.startsWith(NARFU) || !s.pick(href, text) || index.files[href]) continue;
      try {
        const buf = await get(href, true);
        if (buf.subarray(0, 4).toString() !== '%PDF') { log('не PDF:', href); continue; }
        const path = `${s.dir}/${s.name(href)}`;
        const old = await gh.read(path).catch(() => null);
        await gh.write(path, buf, `PDF колледжа: ${path}`, old?.sha);
        index.files[href] = { path, at: Date.now(), title: text.slice(0, 120) };
        added++; log('добавлен', path);
      } catch (e) { log('не скачался:', href, e.message); }
    }
  }
  if (added) await gh.write('index.json', Buffer.from(JSON.stringify(index, null, 1)), `Список PDF колледжей (+${added})`, idxFile?.sha);
  return { added };
}

// Yandex Cloud Functions: точка входа fetch.handler, таймер раз в час; переменная окружения GITHUB_TOKEN
export const handler = async () => ({ statusCode: 200, body: JSON.stringify(await run()) });

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fetch.mjs')) {
  run().then(r => console.log('готово, новых файлов:', r.added)).catch(e => { console.error(e.message); process.exit(1); });
}
