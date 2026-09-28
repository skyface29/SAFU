package ru.student.safuhub.feature.board

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.gestures.detectVerticalDragGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.student.safuhub.core.Fmt
import ru.student.safuhub.core.prefBool
import ru.student.safuhub.data.ScheduleData
import ru.student.safuhub.data.ScheduleStore
import ru.student.safuhub.feature.files.rememberThumb
import ru.student.safuhub.feature.notes.Note
import ru.student.safuhub.feature.notes.NotesStore
import ru.student.safuhub.system.rememberCamera
import ru.student.safuhub.ui.design.EmptyState
import ru.student.safuhub.ui.design.Glass
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.SubjectColor
import ru.student.safuhub.ui.kit.AlertAction
import ru.student.safuhub.ui.kit.BarButton
import ru.student.safuhub.ui.kit.ContextMenuBox
import ru.student.safuhub.ui.kit.Dialogs
import ru.student.safuhub.ui.kit.FormSection
import ru.student.safuhub.ui.kit.IconLabel
import ru.student.safuhub.ui.kit.IosMenu
import ru.student.safuhub.ui.kit.LocalDismiss
import ru.student.safuhub.ui.kit.LocalNav
import ru.student.safuhub.ui.kit.NavigationStack
import ru.student.safuhub.ui.kit.Pressable
import ru.student.safuhub.ui.kit.ProgressLabel
import ru.student.safuhub.ui.kit.Screen
import ru.student.safuhub.ui.kit.SearchField
import ru.student.safuhub.ui.kit.Share
import ru.student.safuhub.ui.kit.SfGradientIcon
import ru.student.safuhub.ui.kit.SfIcon
import ru.student.safuhub.ui.kit.SheetItem
import ru.student.safuhub.ui.kit.Spinner
import ru.student.safuhub.ui.kit.barTint
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Design
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.io.File
import kotlin.math.abs

/** Миниатюра без загрузки полного снимка в память */
@Composable
fun BoardThumb(file: File, corner: Dp = 12.dp, modifier: Modifier = Modifier) {
    val img = rememberThumb(file, 360)
    Box(modifier.clip(RoundedCornerShape(corner)).background(Ios.label.copy(alpha = 0.07f)), contentAlignment = Alignment.Center) {
        if (img != null) Image(img, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
        else SfIcon("photo", size = 18.dp, tint = Ios.tertiaryLabel)
    }
}

data class GalleryRef(val shots: List<BoardShot>, val index: Int)

// MARK: - Галерея: листать, приближать, смахнуть вниз — закрыть

@Composable
fun BoardGallery(shots: List<BoardShot>, start: Int) {
    val ctx = LocalContext.current
    val dismiss = LocalDismiss.current
    val pager = rememberPagerState(initialPage = start.coerceIn(0, maxOf(0, shots.size - 1))) { shots.size }
    var zoomed by remember { mutableStateOf(false) }
    var chrome by remember { mutableStateOf(true) }
    var drag by remember { mutableFloatStateOf(0f) }
    val scope = rememberCoroutineScope()
    val progress = minOf(1f, abs(drag) / 900f)
    val strip = rememberLazyListState()
    LaunchedEffect(pager.currentPage) { zoomed = false; strip.animateScrollToItem(maxOf(0, pager.currentPage - 2)) }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 1f - progress * 0.8f))) {
        HorizontalPager(pager, Modifier.fillMaxSize().graphicsLayer {
            translationY = drag
            val s = 1f - progress * 0.15f
            scaleX = s; scaleY = s
        }.pointerInput(zoomed) {
            if (!zoomed) detectVerticalDragGestures(
                onVerticalDrag = { c, d -> c.consume(); drag += d },
                onDragEnd = { if (abs(drag) > 360) dismiss() else drag = 0f },
                onDragCancel = { drag = 0f },
            )
        }, userScrollEnabled = !zoomed) { i ->
            ZoomableShot(shots[i].file, onZoom = { zoomed = it }, onTap = { chrome = !chrome })
        }
        AnimatedVisibility(chrome && drag == 0f, enter = fadeIn(), exit = fadeOut()) {
            Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    RoundButton("xmark") { dismiss() }
                    Spacer(Modifier.weight(1f))
                    if (pager.currentPage in shots.indices) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Text("${pager.currentPage + 1} из ${shots.size}", style = ft(Ts.subheadline, FontWeight.Bold), color = Color.White)
                            Text(Fmt.format(shots[pager.currentPage].date, "d MMMM, HH:mm"), style = ft(Ts.caption2), color = Color.White)
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    RoundButton("square.and.arrow.up") { shots.getOrNull(pager.currentPage)?.let { Share.files(ctx, listOf(it.file)) } }
                }
                Spacer(Modifier.weight(1f))
                // полоска миниатюр — прыгнуть к любому фото
                LazyRow(state = strip, modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(6.dp),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp)) {
                    itemsIndexed(shots, key = { _, s -> s.id }) { i, s ->
                        BoardThumb(s.file, 7.dp, Modifier.width(if (i == pager.currentPage) 52.dp else 40.dp).height(40.dp)
                            .let { m -> if (i == pager.currentPage) m.background(Color.White, RoundedCornerShape(7.dp)).padding(2.dp) else m }
                            .clickable { scope.launch { pager.animateScrollToPage(i) } })
                    }
                }
            }
        }
    }
}

@Composable
private fun RoundButton(icon: String, onClick: () -> Unit) {
    Box(Modifier.size(38.dp).clip(CircleShape).background(Color.White.copy(alpha = 0.18f)).clickable { onClick() }, contentAlignment = Alignment.Center) {
        SfIcon(icon, size = 17.dp, tint = Color.White)
    }
}

/** Одно фото с приближением щипком и двойным тапом */
@Composable
fun ZoomableShot(file: File, onZoom: (Boolean) -> Unit, onTap: () -> Unit) {
    val img = rememberThumb(file, 2600)
    var scale by remember { mutableFloatStateOf(1f) }
    var offset by remember { mutableStateOf(Offset.Zero) }
    fun reset() { scale = 1f; offset = Offset.Zero; onZoom(false) }
    Box(Modifier.fillMaxSize()
        .pointerInput(Unit) {
            detectTapGestures(onTap = { onTap() }, onDoubleTap = {
                if (scale > 1.01f) reset() else { scale = 2.5f; onZoom(true) }
            })
        }
        .pointerInput(Unit) {
            detectTransformGestures(panZoomLock = false) { _, pan, zoom, _ ->
                if (zoom != 1f || scale > 1f) {
                    scale = (scale * zoom).coerceIn(1f, 5f)
                    offset = if (scale <= 1.01f) Offset.Zero else offset + pan
                    onZoom(scale > 1.01f)
                }
            }
        }, contentAlignment = Alignment.Center) {
        if (img == null) Spinner(color = Color.White)
        else Image(img, null, Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale; translationX = offset.x; translationY = offset.y },
            contentScale = ContentScale.Fit)
    }
}

/** Плашка «идёт работа» поверх экрана */
@Composable
fun ProgressOverlay(text: String) {
    Box(Modifier.fillMaxSize().clickable(remember { MutableInteractionSource() }, null) {}, contentAlignment = Alignment.Center) {
        Glass(22.dp) {
            Column(Modifier.padding(horizontal = 26.dp, vertical = 20.dp), horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Spinner(32.dp, Ios.label)
                Text(text, style = ft(Ts.subheadline, FontWeight.SemiBold, mono = true), color = Ios.label)
            }
        }
    }
}

// MARK: - Экран пары с фото

@Composable
fun BoardBatchScreen(initial: BoardBatch) {
    val ctx = LocalContext.current
    var batch by remember { mutableStateOf(initial) }
    val gallery = remember { mutableStateOf<GalleryRef?>(null) }
    var working by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    SheetItem(gallery, full = true) { g -> BoardGallery(g.shots, g.index) }

    fun reload() {
        val all = LessonPhotos.batches(batch.subject, ScheduleStore.data)
        batch = all.firstOrNull { it.id == batch.id }
            ?: batch.slot?.let { LessonPhotos.batch(it, ScheduleStore.data) }
            ?: batch.copy(shots = emptyList())
    }
    LaunchedEffect(Unit) {
        reload()
        BoardPDFBuilder.prewarm(batch)   // PDF собирается заранее в фоне
    }
    val camera = rememberCamera { f ->
        if (f != null && BoardPhoto.save(f, batch.subject) != null) { Haptics.success(); reload() }
        f?.delete()
    }
    fun sendPDF() {
        if (working != null) return
        val b = batch
        working = "Собираю PDF…"
        scope.launch {
            val f = BoardPDFBuilder.pdf(b) { i, n -> scope.launch { working = "Собираю PDF… $i из $n" } }
            working = null
            if (f != null) Share.files(ctx, listOf(f), "application/pdf")
        }
    }
    fun sendPhotos() {
        if (working != null) return
        val b = batch
        working = "Готовлю фото…"
        scope.launch {
            val copies = withContext(Dispatchers.IO) { LessonPhotosPDF.numberedCopies(b) }
            working = null
            if (copies.isNotEmpty()) Share.files(ctx, copies, "image/*")
        }
    }

    Box(Modifier.fillMaxSize()) {
        Screen("Фото пары", background = { ru.student.safuhub.ui.design.AmbientBackground() }) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(SubjectColor.color(batch.subject).copy(alpha = 0.15f)).padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(batch.subject, style = ft(Ts.title3, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                    Text("${batch.title} · ${batch.countText}", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                }
                val enabled = batch.shots.isNotEmpty() && working == null
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BigButton("Отправить PDF", "doc.richtext.fill", true, enabled, Modifier.weight(1f)) { sendPDF() }
                    BigButton("Фото по порядку", "photo.stack.fill", false, enabled, Modifier.weight(1f)) { sendPhotos() }
                }
                BigButton("Сфоткать ещё", "camera.fill", false, true, Modifier.fillMaxWidth()) { camera.open() }
                if (batch.shots.isEmpty()) Text("Фото этой пары пока нет.", style = ft(Ts.subheadline), color = Ios.secondaryLabel)
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    batch.shots.chunked(3).forEachIndexed { r, row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEachIndexed { c, s ->
                                val i = r * 3 + c
                                ContextMenuBox(items = {
                                    item("Отправить это фото", "square.and.arrow.up") { Share.files(ctx, listOf(s.file)) }
                                    item("Удалить", "trash", destructive = true) {
                                        Dialogs.actionSheet("Удалить фото?", null,
                                            AlertAction("Удалить", AlertAction.Role.DESTRUCTIVE) { s.file.delete(); BoardIndex.prune(); reload() },
                                            AlertAction("Отменить", AlertAction.Role.CANCEL))
                                    }
                                }, modifier = Modifier.weight(1f), onClick = { gallery.value = GalleryRef(batch.shots, i) }) {
                                    Box(Modifier.fillMaxWidth().aspectRatio(1f)) {
                                        BoardThumb(s.file, 12.dp, Modifier.fillMaxSize())
                                        Text("${i + 1}", style = ft(Ts.caption2, FontWeight.ExtraBold), color = Color.White, textAlign = TextAlign.Center,
                                            modifier = Modifier.align(Alignment.TopStart).padding(5.dp).size(20.dp).clip(CircleShape).background(Brand.color).padding(top = 3.dp))
                                        Text(Fmt.format(s.date, "HH:mm"), style = ft(9f, FontWeight.Bold), color = Color.White,
                                            modifier = Modifier.align(Alignment.BottomEnd).padding(5.dp).clip(CircleShape).background(Color.Black.copy(alpha = 0.45f))
                                                .padding(horizontal = 5.dp, vertical = 2.dp))
                                    }
                                }
                            }
                            repeat(3 - row.size) { Spacer(Modifier.weight(1f)) }
                        }
                    }
                }
                Text("Нажми на фото — откроется галерея: листай вбок, приближай щипком, смахни вниз, чтобы закрыть. Порядок — по времени съёмки.",
                    style = ft(Ts.caption), color = Ios.secondaryLabel)
            }
        }
        working?.let { ProgressOverlay(it) }
    }
}

@Composable
private fun BigButton(title: String, icon: String, primary: Boolean, enabled: Boolean, modifier: Modifier, onClick: () -> Unit) {
    Pressable({ Haptics.tap(); onClick() }, modifier, enabled = enabled) {
        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp))
            .background(if (primary) Brand.gradient else androidx.compose.ui.graphics.SolidColor(Ios.label.copy(alpha = 0.08f)))
            .graphicsLayer { alpha = if (enabled) 1f else 0.5f }.padding(vertical = 13.dp), horizontalArrangement = Arrangement.Center) {
            IconLabel(title, icon, style = ft(Ts.subheadline, FontWeight.Bold), color = if (primary) Color.White else Ios.label, spacing = 6.dp)
        }
    }
}

/** Строка пары с фото: полоска миниатюр. Если задан onShot — миниатюры открывают галерею */
@Composable
fun BoardBatchRow(batch: BoardBatch, showSubject: Boolean = false, onShot: ((Int) -> Unit)? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text(if (showSubject) batch.subject else batch.title, style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label,
                    maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(if (showSubject) "${batch.title} · ${batch.countText}" else batch.countText, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1)
            }
        }
        // все фото по порядку; полоска сама доезжает до самых новых
        val state = rememberLazyListState()
        LaunchedEffect(batch.shots.size) { if (batch.shots.isNotEmpty()) state.scrollToItem(batch.shots.size - 1) }
        LazyRow(state = state, modifier = Modifier.height(48.dp), horizontalArrangement = Arrangement.spacedBy(6.dp), userScrollEnabled = onShot != null) {
            itemsIndexed(batch.shots, key = { _, s -> s.id }) { i, s ->
                BoardThumb(s.file, 9.dp, Modifier.width(64.dp).height(48.dp).let { m -> if (onShot != null) m.clickable { onShot(i) } else m })
            }
        }
    }
}

/** Все пары с фото одного предмета (или всех, если subject == null) */
@Composable
fun BoardBatchesListScreen(subject: String?) {
    val nav = LocalNav.current
    var list by remember { mutableStateOf<List<BoardBatch>>(emptyList()) }
    LaunchedEffect(Unit) {
        val d = ScheduleStore.data
        list = withContext(Dispatchers.IO) { if (subject != null) LessonPhotos.batches(subject, d) else LessonPhotos.allBatches(d, 100) }
    }
    Screen(if (subject == null) "Фото с пар" else "Фото доски") {
        FormSection {
            if (list.isEmpty()) text("Фото доски пока нет. Снимай прямо на паре — кнопка камеры есть на главной, в карточке пары, в шторке уведомлений и на странице предмета.",
                color = null, size = Ts.subheadline)
            for (b in list) {
                row(onClick = { nav?.push { BoardBatchScreen(b) } }) {
                    Box(Modifier.weight(1f)) { BoardBatchRow(b, showSubject = subject == null) }
                    SfIcon("chevron.right", size = 16.dp, tint = Ios.tertiaryLabel)
                }
            }
        }
    }
}

// MARK: - Карточка «Фото доски» на главной

@Composable
fun BoardHomeCard(data: ScheduleData, onCamera: (String) -> Unit, onOpen: (BoardBatch) -> Unit) {
    val ctx = LocalContext.current
    var open by prefBool("board.card.open", false)
    var latest by remember { mutableStateOf<BoardBatch?>(null) }
    var working by remember { mutableStateOf<String?>(null) }
    val gallery = remember { mutableStateOf<GalleryRef?>(null) }
    val scope = rememberCoroutineScope()
    SheetItem(gallery, full = true) { g -> BoardGallery(g.shots, g.index) }
    val slot = LessonPhotos.currentSlot(data)
    val entriesCount = BoardIndex.entries.size
    LaunchedEffect(data, entriesCount) {
        latest = withContext(Dispatchers.IO) {
            slot?.let { LessonPhotos.batch(it, data) } ?: LessonPhotos.allBatches(data, 1).firstOrNull()
        }
    }
    val summary = latest?.takeIf { it.shots.isNotEmpty() }?.let { b ->
        val isCurrent = slot?.let { b.slot?.key == it.key } ?: false
        (if (isCurrent) "эта пара" else b.shortDate) + " · " + b.countText
    } ?: if (slot != null) "сфоткай доску этой пары" else "фото пока нет"
    Glass(22.dp, Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp).animateContentSize(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.weight(1f).clickable(remember { MutableInteractionSource() }, null) { Haptics.tap(); open = !open },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SfGradientIcon("camera.viewfinder", size = 20.dp)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
                        Text("Фото доски", style = ft(Ts.subheadline, FontWeight.Bold, Design.ROUNDED), color = Ios.label)
                        Text(summary, style = ft(Ts.caption), color = Ios.secondaryLabel, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (BoardIndex.working > 0) Spinner(16.dp)
                }
                if (slot != null) {
                    Pressable({ Haptics.tap(); onCamera(slot.lesson.subject) }) {
                        Box(Modifier.size(34.dp).clip(CircleShape).background(Brand.gradient), contentAlignment = Alignment.Center) {
                            SfIcon("camera.fill", size = 16.dp, tint = Color.White)
                        }
                    }
                }
                val rot by animateFloatAsState(if (open) 180f else 0f, label = "rot")
                Box(Modifier.size(30.dp).clip(CircleShape).background(Ios.label.copy(alpha = 0.07f))
                    .clickable { Haptics.tap(); open = !open }, contentAlignment = Alignment.Center) {
                    SfIcon("chevron.down", size = 14.dp, tint = Ios.secondaryLabel, modifier = Modifier.graphicsLayer { rotationZ = rot })
                }
            }
            if (open) {
                val b = latest
                if (b != null && b.shots.isNotEmpty()) {
                    Box(Modifier.clickable(remember { MutableInteractionSource() }, null) { onOpen(b) }) {
                        BoardBatchRow(b, showSubject = true) { i -> gallery.value = GalleryRef(b.shots, i) }
                    }
                    Pressable({
                        if (working != null) return@Pressable
                        working = "Собираю PDF…"
                        scope.launch {
                            val f = BoardPDFBuilder.pdf(b) { i, n -> scope.launch { working = "Собираю PDF… $i из $n" } }
                            working = null
                            if (f != null) Share.files(ctx, listOf(f), "application/pdf")
                        }
                    }, Modifier.fillMaxWidth()) {
                        Row(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.color.copy(alpha = 0.12f)).padding(vertical = 10.dp),
                            horizontalArrangement = Arrangement.Center) {
                            IconLabel(working ?: "Отправить ребятам PDF (${b.shots.size})", if (working == null) "paperplane.fill" else "hourglass",
                                style = ft(Ts.subheadline, FontWeight.SemiBold), iconColor = Brand.color)
                        }
                    }
                } else {
                    Text("На паре нажми на камеру — фото лягут в папку предмета по порядку, а после пары их можно одним PDF отправить группе. Кнопка камеры есть и в уведомлении о паре.",
                        style = ft(Ts.caption), color = Ios.secondaryLabel)
                }
            }
        }
    }
}

// MARK: - Поиск по доскам

@Composable
fun BoardSearchScreen() {
    val nav = LocalNav.current
    var query by remember { mutableStateOf("") }
    val open = remember { mutableStateOf<BoardEntry?>(null) }
    val scope = rememberCoroutineScope()
    SheetItem(open) { e -> NavigationStack { BoardDetail(e) } }
    LaunchedEffect(Unit) { BoardIndex.prune() }
    val results = BoardIndex.search(query)
    Screen("Доски", background = { ru.student.safuhub.ui.design.AmbientBackground() },
        trailing = {
            IosMenu(items = {
                item("Распознать старые фото", "text.viewfinder") { Haptics.tap(); BoardScan.indexExisting() }
            }) { Box(Modifier.padding(8.dp)) { SfIcon("ellipsis.circle", size = 22.dp, tint = barTint()) } }
        }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            SearchField(query, { query = it }, "Слово с доски: интеграл, вариант 2…")
            if (!BoardOCR.ready) {
                Glass(18.dp, Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        IconLabel("Распознавание текста", "text.viewfinder", style = ft(Ts.subheadline, FontWeight.Bold), iconColor = Brand.color)
                        Text("Чтобы искать по словам с доски, скачай модели распознавания русского и английского (≈38 МБ, один раз). Потом всё работает без интернета.",
                            style = ft(Ts.caption), color = Ios.secondaryLabel)
                        if (BoardOCR.downloading) {
                            ru.student.safuhub.ui.design.ProgressBar(BoardOCR.progress, Brand.color)
                            Text("Скачиваю… ${(BoardOCR.progress * 100).toInt()}%", style = ft(Ts.caption, FontWeight.SemiBold), color = Ios.secondaryLabel)
                        } else {
                            ru.student.safuhub.ui.kit.ProminentButton("Скачать и распознать", "arrow.down.circle.fill") {
                                scope.launch {
                                    if (BoardOCR.download()) { Haptics.success(); BoardScan.indexExisting() }
                                    else Dialogs.alert("Не получилось скачать", "Проверь интернет и попробуй ещё раз.")
                                }
                            }
                        }
                    }
                }
            }
            if (BoardIndex.working > 0) {
                Glass(18.dp, Modifier.fillMaxWidth()) {
                    Row(Modifier.padding(14.dp)) { ProgressLabel("Распознаю доски: ${BoardIndex.working}") }
                }
            }
            if (BoardIndex.entries.isEmpty()) {
                EmptyState("text.viewfinder", "Сфоткай доску",
                    "На главной в карточке пары — «Фото доски в папку предмета». Приложение распознает текст, а здесь по нему можно будет искать.",
                    Modifier.padding(top = 30.dp))
            } else if (results.isEmpty()) {
                Text("Ничего не нашлось по «$query»", style = ft(Ts.subheadline), color = Ios.secondaryLabel, textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 30.dp))
            }
            if (query.isEmpty()) {
                Pressable({ nav?.push { BoardBatchesListScreen(null) } }, Modifier.fillMaxWidth()) {
                    Glass(18.dp, Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(14.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            SfGradientIcon("photo.stack.fill", size = 20.dp)
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                Text("Фото по парам", style = ft(Ts.subheadline, FontWeight.SemiBold), color = Ios.label)
                                Text("По порядку съёмки, отправка одним PDF", style = ft(Ts.caption), color = Ios.secondaryLabel)
                            }
                            SfIcon("chevron.right", size = 13.dp, tint = Ios.tertiaryLabel)
                        }
                    }
                }
            }
            for (e in results.take(200)) {
                Pressable({ Haptics.tap(); open.value = e }, Modifier.fillMaxWidth()) { BoardRow(e, query) }
            }
        }
    }
}

@Composable
private fun BoardRow(entry: BoardEntry, query: String) {
    val snippet = run {
        val text = entry.text.replace("\n", " · ")
        val q = query.trim().lowercase().split(" ").firstOrNull { it.isNotEmpty() } ?: ""
        val idx = if (q.isEmpty()) -1 else text.lowercase().indexOf(q)
        if (idx < 0) { if (text.isEmpty()) "Текст не распознан" else text.take(120) }
        else {
            val start = maxOf(0, idx - 40)
            val end = minOf(text.length, start + 140)
            (if (start > 0) "…" else "") + text.substring(start, end) + (if (end < text.length) "…" else "")
        }
    }
    Glass(18.dp, Modifier.fillMaxWidth()) {
        Row(Modifier.padding(12.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            BoardThumb(entry.file, 12.dp, Modifier.size(64.dp))
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(entry.subject, style = ft(Ts.caption, FontWeight.Bold), color = Brand.color, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false))
                    Spacer(Modifier.weight(1f))
                    Text(Fmt.relative(entry.date), style = ft(Ts.caption2), color = Ios.tertiaryLabel)
                }
                Text(snippet, style = ft(Ts.caption), color = Ios.label, maxLines = 3, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
fun BoardDetail(entry: BoardEntry) {
    val ctx = LocalContext.current
    val dismiss = LocalDismiss.current
    val img = rememberThumb(entry.file, 2600)
    fun show(t: String) { Haptics.success(); Dialogs.showToast(t) }
    Screen(entry.subject, background = { ru.student.safuhub.ui.design.AmbientBackground() },
        trailing = { BarButton("Готово", bold = true) { dismiss() } }) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(16.dp)), contentAlignment = Alignment.Center) {
                if (img != null) Image(img, null, Modifier.fillMaxWidth().aspectRatio(img.width.toFloat() / img.height), contentScale = ContentScale.Fit)
                else Box(Modifier.fillMaxWidth().height(200.dp), contentAlignment = Alignment.Center) { Spinner() }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Action("doc.on.doc", "Копировать", Modifier.weight(1f)) { Share.copy(entry.text); show("Текст скопирован") }
                Action("note.text.badge.plus", "В заметки", Modifier.weight(1f)) {
                    NotesStore.upsert(Note(title = "Доска · " + Fmt.format(entry.date, "d MMMM"), text = entry.text, subject = entry.subject))
                    show("Добавлено в заметки")
                }
                Action("square.and.arrow.up", "Поделиться", Modifier.weight(1f)) { Share.text(ctx, entry.text.ifEmpty { entry.subject }) }
            }
            Glass(20.dp, Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconLabel("Текст с доски", "text.viewfinder", style = ft(Ts.headline, FontWeight.SemiBold, Design.ROUNDED), iconColor = Brand.color)
                    SelectionContainer {
                        Text(entry.text.ifEmpty { if (BoardOCR.ready) "Текст не распознан — попробуй снять ближе и ровнее." else "Скачай модели распознавания на экране «Доски», чтобы получить текст." },
                            style = ft(Ts.body), color = if (entry.text.isEmpty()) Ios.secondaryLabel else Ios.label)
                    }
                }
            }
        }
    }
}

@Composable
private fun Action(icon: String, title: String, modifier: Modifier, onClick: () -> Unit) {
    Pressable(onClick, modifier) {
        Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(Brand.color.copy(alpha = 0.12f)).padding(vertical = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            SfIcon(icon, size = 19.dp, tint = Brand.color)
            Text(title, style = ft(Ts.caption2, FontWeight.SemiBold), color = Brand.color)
        }
    }
}
