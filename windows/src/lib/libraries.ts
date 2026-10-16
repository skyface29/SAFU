// Библиотеки: электронно-библиотечные системы, которыми пользуются в САФУ (как Sources/Libraries.swift)

export type LibraryLink = { short: string; title: string; about: string; url: string; icon: string }

/** Сначала самые ходовые в САФУ: Знаниум, Лань, Юрайт */
export const LIBRARIES: LibraryLink[] = [
  { short: 'Знаниум', title: 'Знаниум', about: 'ЭБС: учебники и монографии', url: 'https://znanium.ru', icon: 'book.fill' },
  { short: 'Лань', title: 'Лань', about: 'ЭБС издательства «Лань»', url: 'https://e.lanbook.com', icon: 'books.vertical.fill' },
  { short: 'Юрайт', title: 'Юрайт', about: 'Образовательная платформа: учебники и курсы', url: 'https://urait.ru', icon: 'text.book.closed.fill' },
  { short: 'IPR SMART', title: 'IPR SMART', about: 'ЭБС IPR SMART (IPRbooks)', url: 'https://www.iprbookshop.ru', icon: 'book.pages.fill' },
  { short: 'Консультант', title: 'Консультант студента', about: 'ЭБС «Консультант студента»', url: 'https://www.studentlibrary.ru', icon: 'character.book.closed.fill' },
  { short: 'Biblioclub', title: 'Университетская библиотека онлайн', about: 'ЭБС biblioclub.ru', url: 'https://biblioclub.ru', icon: 'book.closed.fill' },
  { short: 'eLibrary', title: 'eLIBRARY.RU', about: 'Научные статьи и журналы, РИНЦ', url: 'https://elibrary.ru', icon: 'doc.text.magnifyingglass' },
  { short: 'Киберленинка', title: 'КиберЛенинка', about: 'Научные статьи в открытом доступе', url: 'https://cyberleninka.ru', icon: 'magazine.fill' },
  { short: 'НЭБ', title: 'НЭБ', about: 'Национальная электронная библиотека', url: 'https://rusneb.ru', icon: 'building.2.fill' },
  { short: 'Библиотека', title: 'Библиотека САФУ', about: 'Научная библиотека САФУ: каталог и ресурсы', url: 'https://library.narfu.ru', icon: 'building.columns.fill' }
]
