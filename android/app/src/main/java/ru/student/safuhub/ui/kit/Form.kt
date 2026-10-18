package ru.student.safuhub.ui.kit

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import java.time.Instant

/** Form: сгруппированный список как в Настройках iOS */
@Composable
fun FormColumn(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier.fillMaxWidth().padding(top = 4.dp), content = content)
}

/** Экран-форма: панель + прокручиваемый сгруппированный список */
@Composable
fun FormScreen(
    title: String,
    large: Boolean = false,
    leading: (@Composable RowScope.() -> Unit)? = null,
    trailing: (@Composable RowScope.() -> Unit)? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    Screen(title, large = large, leading = leading, trailing = trailing) {
        FormColumn { content() }
    }
}

class SectionScope {
    internal val rows = mutableListOf<Pair<Dp, @Composable () -> Unit>>()

    /** Произвольная строка с отступами как у ячейки */
    fun row(inset: Dp = 16.dp, onClick: (() -> Unit)? = null, minHeight: Dp = 44.dp, content: @Composable RowScope.() -> Unit) {
        rows.add(inset to {
            val base = Modifier.fillMaxWidth().defaultMinSize(minHeight = minHeight)
            Row(
                (if (onClick != null) base.clickable { onClick() } else base).padding(horizontal = 16.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                content = content,
            )
        })
    }

    /** Строка без отступов (картинка, превью) */
    fun raw(inset: Dp = 0.dp, content: @Composable () -> Unit) { rows.add(inset to content) }

    fun text(text: String, color: Color? = null, size: Float = Ts.body, weight: FontWeight = FontWeight.Normal) = row {
        Text(text, style = ft(size, weight), color = color ?: Ios.label)
    }

    fun label(text: String, icon: String, tint: Color? = null) = row(inset = 54.dp) {
        RowIcon(icon, tint)
        Text(text, style = ft(Ts.body), color = Ios.label)
    }

    /** LabeledContent: название слева, значение справа */
    fun info(title: String, value: String, icon: String? = null) = row(inset = if (icon != null) 54.dp else 16.dp) {
        if (icon != null) RowIcon(icon, null)
        Text(title, style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f, fill = false))
        Spacer(Modifier.weight(1f).widthIn(min = 8.dp))
        Text(value, style = ft(Ts.body), color = Ios.secondaryLabel, textAlign = TextAlign.End, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }

    fun toggle(title: String, checked: Boolean, onChange: (Boolean) -> Unit, icon: String? = null, enabled: Boolean = true, subtitle: String? = null) =
        row(inset = if (icon != null) 54.dp else 16.dp) {
            if (icon != null) RowIcon(icon, null)
            Column(Modifier.weight(1f)) {
                Text(title, style = ft(Ts.body), color = if (enabled) Ios.label else Ios.tertiaryLabel)
                if (subtitle != null) Text(subtitle, style = ft(Ts.footnote), color = Ios.secondaryLabel)
            }
            Spacer(Modifier.width(8.dp))
            IosSwitch(checked, onChange, enabled)
        }

    fun toggle(title: String, state: MutableState<Boolean>, icon: String? = null, enabled: Boolean = true, onChange: ((Boolean) -> Unit)? = null) =
        toggle(title, state.value, { state.value = it; onChange?.invoke(it) }, icon, enabled)

    /** NavigationLink */
    fun link(title: String, icon: String? = null, value: String? = null, tint: Color? = null, subtitle: String? = null, onClick: () -> Unit) =
        row(inset = if (icon != null) 54.dp else 16.dp, onClick = { Haptics.tap(); onClick() }) {
            if (icon != null) RowIcon(icon, tint)
            Column(Modifier.weight(1f)) {
                Text(title, style = ft(Ts.body), color = Ios.label)
                if (subtitle != null) Text(subtitle, style = ft(Ts.footnote), color = Ios.secondaryLabel)
            }
            if (value != null) {
                Text(value, style = ft(Ts.body), color = Ios.secondaryLabel, maxLines = 1)
                Spacer(Modifier.width(4.dp))
            }
            SfIcon("chevron.right", size = 20.dp, tint = Ios.tertiaryLabel)
        }

    /** Кнопка в форме (цвет темы, деструктивная — красная) */
    fun button(title: String, icon: String? = null, destructive: Boolean = false, enabled: Boolean = true, trailing: (@Composable () -> Unit)? = null,
               onClick: () -> Unit) =
        row(inset = if (icon != null) 54.dp else 16.dp, onClick = if (enabled) onClick else null) {
            val c = if (!enabled) Ios.tertiaryLabel else if (destructive) Ios.red else Brand.color
            if (icon != null) { SfIcon(icon, size = 21.dp, tint = c, modifier = Modifier.width(26.dp)); Spacer(Modifier.width(12.dp)) }
            Text(title, style = ft(Ts.body), color = c, modifier = Modifier.weight(1f))
            trailing?.invoke()
        }

    /** Picker (меню): название слева, выбранное значение справа */
    fun <T> picker(title: String, options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit, icon: String? = null) =
        row(inset = if (icon != null) 54.dp else 16.dp) {
            if (icon != null) RowIcon(icon, null)
            Text(title, style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
            var open by remember { mutableStateOf(false) }
            Box {
                Row(Modifier.clickable(remember { MutableInteractionSource() }, null) { Haptics.tap(); open = true },
                    verticalAlignment = Alignment.CenterVertically) {
                    Text(options.firstOrNull { it.first == selection }?.second ?: "", style = ft(Ts.body), color = Ios.secondaryLabel, maxLines = 1,
                        overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = 220.dp))
                    SfIcon("chevron.up.chevron.down", size = 16.dp, tint = Ios.secondaryLabel)
                }
                MenuPopup(open, { open = false }, {
                    for ((v, t) in options) item(t, checked = v == selection) { onSelect(v) }
                })
            }
        }

    fun <T> picker(title: String, options: List<Pair<T, String>>, state: MutableState<T>, icon: String? = null, onChange: ((T) -> Unit)? = null) =
        picker(title, options, state.value, { state.value = it; onChange?.invoke(it) }, icon)

    fun <T> segmented(options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit) = row {
        Segmented(options, selection, onSelect)
    }

    fun <T> segmented(options: List<Pair<T, String>>, state: MutableState<T>, onChange: ((T) -> Unit)? = null) =
        segmented(options, state.value, { state.value = it; onChange?.invoke(it) })

    fun stepper(title: String, value: Int, onChange: (Int) -> Unit, range: IntRange, step: Int = 1) = row {
        Text(title, style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
        StepperControl({ onChange((value - step).coerceAtLeast(range.first)) }, { onChange((value + step).coerceAtMost(range.last)) },
            value > range.first, value < range.last)
    }

    fun stepper(title: String, state: MutableState<Int>, range: IntRange, step: Int = 1, onChange: ((Int) -> Unit)? = null) =
        stepper(title, state.value, { state.value = it; onChange?.invoke(it) }, range, step)

    fun field(placeholder: String, value: String, onChange: (String) -> Unit, keyboard: KeyboardType = KeyboardType.Text,
              secure: Boolean = false, multiline: Boolean = false, capitalize: Boolean = true, title: String? = null) = row {
        if (title != null) {
            Text(title, style = ft(Ts.body), color = Ios.label)
            Spacer(Modifier.width(12.dp))
        }
        IosTextField(value, onChange, placeholder, Modifier.weight(1f), keyboard = keyboard, secure = secure,
            singleLine = !multiline, minLines = if (multiline) 1 else 1, capitalize = capitalize,
            textAlign = if (title != null) TextAlign.End else TextAlign.Start)
    }

    fun field(placeholder: String, state: MutableState<String>, keyboard: KeyboardType = KeyboardType.Text, secure: Boolean = false,
              multiline: Boolean = false, capitalize: Boolean = true, title: String? = null) =
        field(placeholder, state.value, { state.value = it }, keyboard, secure, multiline, capitalize, title)

    fun slider(value: Float, onChange: (Float) -> Unit, range: ClosedFloatingPointRange<Float>, leading: String? = null, trailing: String? = null,
               trailingBrand: Boolean = false) = row {
        if (leading != null) SfIcon(leading, size = 18.dp, tint = Ios.secondaryLabel)
        IosSlider(value, onChange, range, Modifier.weight(1f).padding(horizontal = 8.dp))
        if (trailing != null) SfIcon(trailing, size = 20.dp, tint = if (trailingBrand) Brand.color else Ios.secondaryLabel)
    }

    fun date(title: String, value: Instant, onChange: (Instant) -> Unit, mode: DateMode = DateMode.DATE_TIME, icon: String? = null) =
        row(inset = if (icon != null) 54.dp else 16.dp) {
            if (icon != null) RowIcon(icon, null)
            Text(title, style = ft(Ts.body), color = Ios.label, modifier = Modifier.weight(1f))
            DateChips(value, onChange, mode)
        }
}

@Composable
fun RowIcon(icon: String, tint: Color?) {
    SfIcon(icon, size = 21.dp, tint = tint ?: Brand.color, modifier = Modifier.width(26.dp))
    Spacer(Modifier.width(12.dp))
}

/** Section: заголовок, карточка со строками, подпись снизу */
@Composable
fun FormSection(
    header: String? = null,
    footer: String? = null,
    headerContent: (@Composable () -> Unit)? = null,
    footerContent: (@Composable () -> Unit)? = null,
    plain: Boolean = false,
    build: SectionScope.() -> Unit,
) {
    val scope = SectionScope().apply(build)
    val dark = LocalDark.current
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 22.dp)) {
        if (headerContent != null) {
            Box(Modifier.padding(start = 16.dp, end = 16.dp, bottom = 7.dp)) { headerContent() }
        } else if (header != null) {
            Text(header.uppercase(), style = ft(Ts.footnote), color = Ios.secondaryLabel,
                modifier = Modifier.padding(start = 16.dp, end = 16.dp, bottom = 7.dp))
        }
        if (scope.rows.isNotEmpty()) {
            Column(
                Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                    .let { if (plain) it else it.background(if (dark) Ios.secondaryGrouped else Color.White) }
            ) {
                scope.rows.forEachIndexed { i, (inset, content) ->
                    if (i > 0) Box(Modifier.fillMaxWidth().padding(start = inset).height(0.5.dp).background(Ios.separator))
                    content()
                }
            }
        }
        if (footerContent != null) {
            Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp)) { footerContent() }
        } else if (!footer.isNullOrEmpty()) {
            Text(footer, style = ft(Ts.footnote), color = Ios.secondaryLabel, modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 7.dp))
        }
    }
}

enum class DateMode { DATE, TIME, DATE_TIME }

/** Серые капсулы даты и времени (как компактный DatePicker iOS) */
@Composable
fun DateChips(value: Instant, onChange: (Instant) -> Unit, mode: DateMode) {
    val ctx = androidx.compose.ui.platform.LocalContext.current
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        if (mode != DateMode.TIME) {
            Chip(ru.student.safuhub.core.Fmt.format(value, "d MMM yyyy 'г.'")) { DatePickers.pickDate(ctx, value, onChange) }
        }
        if (mode != DateMode.DATE) {
            Chip(ru.student.safuhub.core.Fmt.format(value, "HH:mm")) { DatePickers.pickTime(ctx, value, onChange) }
        }
    }
}

@Composable
private fun Chip(text: String, onClick: () -> Unit) {
    Box(Modifier.clip(RoundedCornerShape(7.dp)).background(Ios.tertiaryFill).clickable { Haptics.tap(); onClick() }
        .padding(horizontal = 10.dp, vertical = 6.dp)) {
        Text(text, style = ft(Ts.body), color = Ios.label)
    }
}

/** Системные диалоги выбора даты и времени */
object DatePickers {
    fun pickDate(ctx: android.content.Context, value: Instant, onChange: (Instant) -> Unit) {
        val z = value.atZone(ru.student.safuhub.core.Cal.zone)
        android.app.DatePickerDialog(ctx, { _, y, m, d ->
            onChange(z.withYear(y).withMonth(m + 1).withDayOfMonth(d).toInstant())
        }, z.year, z.monthValue - 1, z.dayOfMonth).show()
    }

    fun pickTime(ctx: android.content.Context, value: Instant, onChange: (Instant) -> Unit) {
        val z = value.atZone(ru.student.safuhub.core.Cal.zone)
        android.app.TimePickerDialog(ctx, { _, h, m ->
            onChange(z.withHour(h).withMinute(m).withSecond(0).withNano(0).toInstant())
        }, z.hour, z.minute, true).show()
    }
}

@Composable
fun SmallIconBox(icon: String, bg: Color, size: Dp = 29.dp, iconSize: Dp = 17.dp) {
    Box(Modifier.size(size).clip(RoundedCornerShape(7.dp)).background(bg), contentAlignment = Alignment.Center) {
        SfIcon(icon, size = iconSize, tint = Color.White)
    }
}
