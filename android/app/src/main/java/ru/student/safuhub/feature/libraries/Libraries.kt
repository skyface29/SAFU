package ru.student.safuhub.feature.libraries

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.student.safuhub.data.Resource
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft

// Библиотеки: электронно-библиотечные системы, которыми пользуются в САФУ (как Libraries.swift на iPhone).
// Плитка «Библиотеки» рядом с Sakai и почтой: нажал — под ними раскрываются плитки ЭБС.

data class LibraryLink(val short: String, val resource: Resource)

object Libraries {
    /** n — постоянный номер (тот же, что на iPhone): по нему сайт помнит открытую страницу и после перезапуска */
    private fun lib(n: Int, short: String, title: String, about: String, url: String, icon: String) =
        LibraryLink(short, Resource(id = "A7C1B000-0000-4000-8000-%012d".format(n), title = title, subtitle = about, url = url, icon = icon, category = "Библиотеки"))

    /** Сначала самые ходовые в САФУ: Знаниум, Лань, Юрайт */
    val all = listOf(
        lib(1, "Знаниум", "Знаниум", "ЭБС: учебники и монографии", "https://znanium.ru", "book.fill"),
        lib(2, "Лань", "Лань", "ЭБС издательства «Лань»", "https://e.lanbook.com", "books.vertical.fill"),
        lib(3, "Юрайт", "Юрайт", "Образовательная платформа: учебники и курсы", "https://urait.ru", "text.book.closed.fill"),
        lib(4, "IPR SMART", "IPR SMART", "ЭБС IPR SMART (IPRbooks)", "https://www.iprbookshop.ru", "book.pages.fill"),
        lib(5, "Консультант", "Консультант студента", "ЭБС «Консультант студента»", "https://www.studentlibrary.ru", "character.book.closed.fill"),
        lib(6, "Biblioclub", "Университетская библиотека онлайн", "ЭБС biblioclub.ru", "https://biblioclub.ru", "book.closed.fill"),
        lib(7, "eLibrary", "eLIBRARY.RU", "Научные статьи и журналы, РИНЦ", "https://elibrary.ru", "doc.text.magnifyingglass"),
        lib(8, "Киберленинка", "КиберЛенинка", "Научные статьи в открытом доступе", "https://cyberleninka.ru", "magazine.fill"),
        lib(9, "НЭБ", "НЭБ", "Национальная электронная библиотека", "https://rusneb.ru", "building.2.fill"),
        lib(10, "Библиотека", "Библиотека САФУ", "Научная библиотека САФУ: каталог и ресурсы", "https://library.narfu.ru", "building.columns.fill"),
    )
}

/** Плитка «Библиотеки» в ряду быстрых кнопок: раскрывает и прячет плитки ЭБС */
@Composable
fun LibrariesTile(open: Boolean, modifier: Modifier = Modifier, onToggle: () -> Unit) {
    Pressable({ Haptics.tap(); onToggle() }, modifier) {
        Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (open) {
                Box(Modifier.size(58.dp).clip(RoundedCornerShape(29.dp)).background(Brand.color), contentAlignment = Alignment.Center) {
                    SfIcon("books.vertical.fill", size = 22.dp, tint = Color.White)
                }
            } else {
                Glass(29.dp, Modifier.size(58.dp), interactive = true, contentAlignment = Alignment.Center) {
                    SfIcon("books.vertical", size = 22.dp, tint = Brand.color)
                }
            }
            Text("Библиотеки", style = ft(Ts.caption, FontWeight.Medium), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Плитки ЭБС под быстрыми кнопками */
@Composable
fun LibrariesPanel(onOpen: (Resource) -> Unit, onClose: () -> Unit) {
    Glass(24.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Библиотеки", style = ft(Ts.headline, FontWeight.SemiBold), color = Ios.label)
                Spacer(Modifier.width(8.dp))
                Text("ЭБС для студентов САФУ", style = ft(Ts.caption), color = Ios.secondaryLabel, modifier = Modifier.weight(1f))
                Pressable({ Haptics.tap(); onClose() }) { Box(Modifier.size(30.dp), contentAlignment = Alignment.Center) { SfIcon("chevron.up", size = 13.dp, tint = Ios.secondaryLabel) } }
            }
            for (row in Libraries.all.chunked(4)) {
                Row(Modifier.fillMaxWidth()) {
                    for (lib in row) {
                        Pressable({ onOpen(lib.resource) }, Modifier.weight(1f)) {
                            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Box(Modifier.size(46.dp).clip(RoundedCornerShape(13.dp)).background(Brand.gradient), contentAlignment = Alignment.Center) {
                                    SfIcon(lib.resource.icon, size = 21.dp, tint = Color.White)
                                }
                                Text(lib.short, style = ft(11f, FontWeight.SemiBold), color = Ios.label, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            }
                        }
                    }
                    repeat(4 - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
            Text("Подписку на ЭБС оплачивает университет: зарегистрируйся в нужной библиотеке, подключившись к Wi‑Fi САФУ, — потом вход по своему логину работает и из дома. Что подключено сейчас — на сайте «Библиотека САФУ».",
                style = ft(Ts.caption2), color = Ios.secondaryLabel)
        }
    }
}
