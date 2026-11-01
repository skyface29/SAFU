import { L } from './i18n'
// Библиотеки: электронно-библиотечные системы, которыми пользуются в САФУ (как Sources/Libraries.swift)

export type LibraryLink = { short: string; title: string; about: string; url: string; icon: string }

/** Сначала самые ходовые в САФУ: Знаниум, Лань, Юрайт */
export const LIBRARIES: LibraryLink[] = [
  { short: L('Знаниум'), title: L('Знаниум'), about: L('ЭБС: учебники и монографии'), url: 'https://znanium.ru', icon: 'book.fill' },
  { short: L('Лань'), title: L('Лань'), about: L('ЭБС издательства «Лань»'), url: 'https://e.lanbook.com', icon: 'books.vertical.fill' },
  { short: L('Юрайт'), title: L('Юрайт'), about: L('Образовательная платформа: учебники и курсы'), url: 'https://urait.ru', icon: 'text.book.closed.fill' },
  { short: 'IPR SMART', title: 'IPR SMART', about: L('ЭБС IPR SMART (IPRbooks)'), url: 'https://www.iprbookshop.ru', icon: 'book.pages.fill' },
  { short: L('Консультант'), title: L('Консультант студента'), about: L('ЭБС «Консультант студента»'), url: 'https://www.studentlibrary.ru', icon: 'character.book.closed.fill' },
  { short: 'Biblioclub', title: L('Университетская библиотека онлайн'), about: L('ЭБС biblioclub.ru'), url: 'https://biblioclub.ru', icon: 'book.closed.fill' },
  { short: 'eLibrary', title: 'eLIBRARY.RU', about: L('Научные статьи и журналы, РИНЦ'), url: 'https://elibrary.ru', icon: 'doc.text.magnifyingglass' },
  { short: L('Киберленинка'), title: L('КиберЛенинка'), about: L('Научные статьи в открытом доступе'), url: 'https://cyberleninka.ru', icon: 'magazine.fill' },
  { short: L('НЭБ'), title: L('НЭБ'), about: L('Национальная электронная библиотека'), url: 'https://rusneb.ru', icon: 'building.2.fill' },
  { short: L('Библиотека'), title: L('Библиотека САФУ'), about: L('Научная библиотека САФУ: каталог и ресурсы'), url: 'https://library.narfu.ru', icon: 'building.columns.fill' }
]
