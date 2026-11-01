// Выбор языка: строка в «Приложение и Windows» и переключатель RU | EN на первом экране регистрации
import React from 'react'
import { Languages } from 'lucide-react'
import { kv } from '../lib/kv'
import { Lang, LANG_KEY, L, type AppLanguage } from '../lib/i18n'
import { Row, Segmented } from './kit'

/** Сохраняем выбор; главный процесс сам перезагрузит окна на новом языке */
export function setLanguage(v: AppLanguage) {
  if (v === Lang.choice) return
  kv.set(LANG_KEY, v)
  // в браузере (разработка) главного процесса нет — перезагружаемся сами
  if (!(window as any).safu?.lang) setTimeout(() => location.reload(), 50)
}

export function LanguageRow() {
  return (
    <Row
      icon={<Languages size={16} />}
      color="#6366f1"
      title={L('Язык интерфейса')}
      right={<Segmented<AppLanguage> value={Lang.choice} onChange={setLanguage} options={[
        { value: 'system', label: L`Как в Windows · ${Lang.systemIsEnglish ? 'English' : 'Русский'}` },
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'English' }
      ]} />}
    />
  )
}

/** Подпись под карточкой: что не переводится */
export function LanguageNote() {
  return <div className="tiny faint" style={{ padding: '8px 4px 0', lineHeight: 1.45 }}>{L('Названия предметов, ФИО преподавателей, аудитории и тексты ДЗ остаются как в РУЗ и на сайтах университета')}</div>
}

export function LanguageSwitch() {
  const en = Lang.en
  const pick = (english: boolean) => {
    if (english === en) return
    // совпадает с системой — оставляем «как в Windows», чтобы потом следовать за ней
    setLanguage(english === Lang.systemIsEnglish ? 'system' : english ? 'en' : 'ru')
  }
  return (
    <div className="row" role="group" aria-label="Language" style={{ gap: 2, padding: 3, borderRadius: 99, background: 'var(--glass)', border: '1px solid var(--line)' }}>
      {([['RU', false], ['EN', true]] as const).map(([t, e]) => (
        <button key={t} className="clickable" aria-pressed={e === en} onClick={() => pick(e)}
          style={{ all: 'unset', cursor: 'pointer', padding: '5px 12px', borderRadius: 99, fontSize: 13, fontWeight: 800, color: e === en ? '#fff' : 'var(--text2)', background: e === en ? 'var(--grad)' : 'transparent' }}>{t}</button>
      ))}
    </div>
  )
}
