package ru.student.safuhub.ui.kit

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.LocalContentColor
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpOffset
import androidx.compose.ui.unit.dp
import ru.student.safuhub.ui.Sf
import ru.student.safuhub.ui.design.Haptics
import ru.student.safuhub.ui.design.gradientTint
import ru.student.safuhub.ui.theme.Brand
import ru.student.safuhub.ui.theme.Ios
import ru.student.safuhub.ui.theme.LocalDark
import ru.student.safuhub.ui.theme.Ts
import ru.student.safuhub.ui.theme.ft
import kotlin.math.roundToInt

// MARK: - Значки и кнопки

@Composable
fun SfIcon(name: String, modifier: Modifier = Modifier, size: Dp = 20.dp, tint: Color = LocalContentColor.current) {
    Icon(Sf.icon(name), contentDescription = null, modifier = modifier.size(size), tint = tint)
}

/** Значок с градиентом темы */
@Composable
fun SfGradientIcon(name: String, modifier: Modifier = Modifier, size: Dp = 20.dp) {
    Icon(Sf.icon(name), contentDescription = null, modifier = modifier.size(size).gradientTint(Brand.gradient), tint = Color.White)
}

/** Кнопка без фона: при нажатии бледнеет (как в iOS) */
@Composable
fun TextButton(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, padding: PaddingValues = PaddingValues(horizontal = 8.dp, vertical = 6.dp),
               content: @Composable RowScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Row(
        modifier.clickable(source, null, enabled = enabled) { onClick() }
            .graphicsLayer { alpha = if (pressed) 0.4f else if (enabled) 1f else 0.5f }
            .padding(padding),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/** Нажимаемая область «PressableStyle»: уменьшается при нажатии */
@Composable
fun Pressable(onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, onLongClick: (() -> Unit)? = null,
              content: @Composable BoxScope.() -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val animations = ru.student.safuhub.core.Defaults.boolOrNull("animations") ?: true
    val scale by androidx.compose.animation.core.animateFloatAsState(if (pressed && animations) 0.95f else 1f,
        spring(dampingRatio = 0.6f, stiffness = 500f), label = "p")
    Box(
        modifier
            .graphicsLayer { scaleX = scale; scaleY = scale; alpha = if (pressed) 0.85f else 1f }
            .let {
                if (onLongClick != null) it.longPressClickable(source, enabled, onClick, onLongClick)
                else it.clickable(source, null, enabled = enabled) { onClick() }
            },
        content = content,
    )
}

@OptIn(androidx.compose.foundation.ExperimentalFoundationApi::class)
fun Modifier.longPressClickable(source: MutableInteractionSource, enabled: Boolean, onClick: () -> Unit, onLongClick: () -> Unit): Modifier =
    this.then(Modifier.combinedClickable(interactionSource = source, indication = null, enabled = enabled,
        onClick = onClick, onLongClick = { Haptics.tap(); onLongClick() }))

/** Заливная кнопка (.borderedProminent) */
@Composable
fun ProminentButton(text: String, icon: String? = null, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Brand.color,
                    big: Boolean = false, onClick: () -> Unit) {
    Pressable(onClick, modifier, enabled) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(if (big) 14.dp else 10.dp))
                .background(if (enabled) color else Ios.tertiaryFill)
                .padding(horizontal = 14.dp, vertical = if (big) 14.dp else 8.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) { SfIcon(icon, size = 17.dp, tint = Color.White); Spacer(Modifier.width(6.dp)) }
            Text(text, style = ft(if (big) Ts.headline else Ts.subheadline, FontWeight.SemiBold), color = Color.White, maxLines = 1)
        }
    }
}

/** Кнопка с лёгкой подложкой (.bordered) */
@Composable
fun BorderedButton(text: String, icon: String? = null, modifier: Modifier = Modifier, enabled: Boolean = true, color: Color = Brand.color,
                   onClick: () -> Unit) {
    Pressable(onClick, modifier, enabled) {
        Row(
            Modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(color.copy(alpha = 0.14f))
                .padding(horizontal = 14.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) { SfIcon(icon, size = 17.dp, tint = color); Spacer(Modifier.width(6.dp)) }
            Text(text, style = ft(Ts.subheadline, FontWeight.SemiBold), color = if (enabled) color else Ios.tertiaryLabel, maxLines = 1)
        }
    }
}

/** Label(text, systemImage:) */
@Composable
fun IconLabel(text: String, icon: String, modifier: Modifier = Modifier, style: TextStyle = ft(Ts.body), color: Color = Ios.label,
              iconColor: Color = color, iconSize: Dp = 0.dp, spacing: Dp = 8.dp, maxLines: Int = Int.MAX_VALUE) {
    val size = if (iconSize > 0.dp) iconSize else (style.fontSize.value * 1.15f).dp
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(spacing)) {
        SfIcon(icon, size = size, tint = iconColor)
        Text(text, style = style, color = color, maxLines = maxLines, overflow = TextOverflow.Ellipsis)
    }
}

@Composable
fun Spinner(size: Dp = 20.dp, color: Color = Ios.secondaryLabel) {
    CircularProgressIndicator(Modifier.size(size), color = color, strokeWidth = 2.dp)
}

/** ProgressView("Текст") */
@Composable
fun ProgressLabel(text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Spinner()
        Text(text, style = ft(Ts.body), color = Ios.secondaryLabel)
    }
}

// MARK: - Переключатель

@Composable
fun IosSwitch(checked: Boolean, onChange: (Boolean) -> Unit, enabled: Boolean = true, tint: Color = Brand.color) {
    val track by animateColorAsState(if (checked) tint else Ios.fill, label = "track")
    val x by animateDpAsState(if (checked) 20.dp else 0.dp, spring(dampingRatio = 0.7f, stiffness = 700f), label = "x")
    Box(
        Modifier.size(51.dp, 31.dp).alpha(if (enabled) 1f else 0.5f).clip(CircleShape).background(track)
            .clickable(remember { MutableInteractionSource() }, null, enabled = enabled) { Haptics.tap(); onChange(!checked) }
            .padding(2.dp)
    ) {
        Box(Modifier.offset(x = x).size(27.dp).shadow(2.dp, CircleShape).clip(CircleShape).background(Color.White))
    }
}

// MARK: - Сегменты

@Composable
fun <T> Segmented(options: List<Pair<T, String>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val dark = LocalDark.current
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(9.dp)).background(Ios.tertiaryFill).padding(2.dp),
        horizontalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        for ((value, title) in options) {
            val sel = value == selection
            Box(
                Modifier.weight(1f).height(28.dp).clip(RoundedCornerShape(7.dp))
                    .background(if (sel) (if (dark) Color(0xFF636366) else Color.White) else Color.Transparent)
                    .clickable(remember { MutableInteractionSource() }, null) { if (!sel) { Haptics.tap(); onSelect(value) } },
                contentAlignment = Alignment.Center,
            ) {
                Text(title, style = ft(13f, if (sel) FontWeight.SemiBold else FontWeight.Medium), color = Ios.label, maxLines = 1,
                    overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(horizontal = 4.dp))
            }
        }
    }
}

// MARK: - Меню

class MenuScope {
    internal val items = mutableListOf<@Composable (close: () -> Unit) -> Unit>()

    fun item(title: String, icon: String? = null, destructive: Boolean = false, enabled: Boolean = true, checked: Boolean = false, onClick: () -> Unit) {
        items.add { close ->
            DropdownMenuItem(
                text = {
                    Text(title, style = ft(Ts.body), color = if (!enabled) Ios.tertiaryLabel else if (destructive) Ios.red else Ios.label)
                },
                leadingIcon = if (checked) ({ SfIcon("checkmark", size = 18.dp, tint = Ios.label) }) else null,
                trailingIcon = icon?.let { { SfIcon(it, size = 20.dp, tint = if (destructive) Ios.red else Ios.label) } },
                enabled = enabled,
                onClick = { close(); onClick() },
            )
        }
    }

    fun divider() {
        items.add { _ -> HorizontalDivider(thickness = 6.dp, color = Ios.separator.copy(alpha = 0.25f)) }
    }

    fun header(text: String) {
        items.add { _ ->
            Text(text, style = ft(Ts.footnote), color = Ios.secondaryLabel, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
        }
    }
}

/** Выпадающее меню у кнопки (Menu) */
@Composable
fun IosMenu(items: MenuScope.() -> Unit, modifier: Modifier = Modifier, label: @Composable () -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box(modifier) {
        Box(Modifier.clickable(remember { MutableInteractionSource() }, null) { Haptics.tap(); open = true }) { label() }
        MenuPopup(open, { open = false }, items)
    }
}

@Composable
fun MenuPopup(open: Boolean, onClose: () -> Unit, items: MenuScope.() -> Unit, offset: DpOffset = DpOffset(0.dp, 0.dp)) {
    val dark = LocalDark.current
    DropdownMenu(
        expanded = open, onDismissRequest = onClose, offset = offset,
        shape = RoundedCornerShape(14.dp),
        containerColor = if (dark) Color(0xFF2C2C2E) else Color(0xFFF7F7F8),
        modifier = Modifier.widthIn(min = 220.dp),
    ) {
        val scope = MenuScope().apply(items)
        for (it in scope.items) it(onClose)
    }
}

/** Контекстное меню по долгому нажатию */
@Composable
fun ContextMenuBox(items: MenuScope.() -> Unit, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable BoxScope.() -> Unit) {
    var open by remember { mutableStateOf(false) }
    var at by remember { mutableStateOf(Offset.Zero) }
    val density = LocalDensity.current
    Box(modifier.pointerInput(onClick) {
        detectTapGestures(
            onLongPress = { at = it; Haptics.tap(); open = true },
            onTap = { onClick?.invoke() },
        )
    }) {
        content()
        Box(Modifier.offset { androidx.compose.ui.unit.IntOffset(at.x.roundToInt(), at.y.roundToInt()) }) {
            MenuPopup(open, { open = false }, items)
        }
    }
}

// MARK: - Поля ввода

@Composable
fun IosTextField(
    value: String,
    onChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    style: TextStyle = ft(Ts.body),
    keyboard: KeyboardType = KeyboardType.Text,
    secure: Boolean = false,
    singleLine: Boolean = true,
    minLines: Int = 1,
    enabled: Boolean = true,
    capitalize: Boolean = true,
    onDone: (() -> Unit)? = null,
    textAlign: TextAlign = TextAlign.Start,
    color: Color = Ios.label,
) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        modifier = modifier,
        enabled = enabled,
        textStyle = style.copy(color = color, textAlign = textAlign),
        singleLine = singleLine,
        minLines = minLines,
        cursorBrush = SolidColor(Brand.color),
        keyboardOptions = KeyboardOptions(
            keyboardType = keyboard,
            capitalization = if (capitalize && !secure && keyboard == KeyboardType.Text) androidx.compose.ui.text.input.KeyboardCapitalization.Sentences else androidx.compose.ui.text.input.KeyboardCapitalization.None,
            autoCorrectEnabled = capitalize && !secure,
            imeAction = if (singleLine) androidx.compose.ui.text.input.ImeAction.Done else androidx.compose.ui.text.input.ImeAction.Default,
        ),
        keyboardActions = KeyboardActions(onDone = { onDone?.invoke(); defaultKeyboardAction(androidx.compose.ui.text.input.ImeAction.Done) }),
        visualTransformation = if (secure) PasswordVisualTransformation() else VisualTransformation.None,
        decorationBox = { inner ->
            Box(contentAlignment = if (textAlign == TextAlign.Center) Alignment.Center else Alignment.CenterStart) {
                if (value.isEmpty()) Text(placeholder, style = style.copy(textAlign = textAlign), color = Ios.tertiaryLabel,
                    modifier = if (textAlign == TextAlign.Center) Modifier.fillMaxWidth() else Modifier)
                inner()
            }
        },
    )
}

/** Поле поиска (.searchable) */
@Composable
fun SearchField(value: String, onChange: (String) -> Unit, placeholder: String = "Поиск", modifier: Modifier = Modifier) {
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(Ios.tertiaryFill).padding(horizontal = 8.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SfIcon("magnifyingglass", size = 18.dp, tint = Ios.secondaryLabel)
        Spacer(Modifier.width(6.dp))
        IosTextField(value, onChange, placeholder, Modifier.weight(1f), capitalize = false)
        if (value.isNotEmpty()) {
            SfIcon("xmark.circle.fill", size = 17.dp, tint = Ios.tertiaryLabel,
                modifier = Modifier.clickable(remember { MutableInteractionSource() }, null) { onChange("") })
        }
    }
}

// MARK: - Слайдер и степпер

@Composable
fun IosSlider(value: Float, onChange: (Float) -> Unit, range: ClosedFloatingPointRange<Float>, modifier: Modifier = Modifier, steps: Int = 0) {
    Slider(value, onChange, modifier, valueRange = range, steps = steps,
        colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = Brand.color, inactiveTrackColor = Ios.fill,
            activeTickColor = Color.Transparent, inactiveTickColor = Color.Transparent))
}

@Composable
fun StepperControl(onMinus: () -> Unit, onPlus: () -> Unit, minusEnabled: Boolean = true, plusEnabled: Boolean = true) {
    Row(Modifier.clip(RoundedCornerShape(8.dp)).background(Ios.tertiaryFill).height(32.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.width(47.dp).height(32.dp).clickable(enabled = minusEnabled) { Haptics.tap(); onMinus() }, contentAlignment = Alignment.Center) {
            SfIcon("minus", size = 18.dp, tint = if (minusEnabled) Ios.label else Ios.tertiaryLabel)
        }
        Box(Modifier.width(1.dp).height(18.dp).background(Ios.separator))
        Box(Modifier.width(47.dp).height(32.dp).clickable(enabled = plusEnabled) { Haptics.tap(); onPlus() }, contentAlignment = Alignment.Center) {
            SfIcon("plus", size = 18.dp, tint = if (plusEnabled) Ios.label else Ios.tertiaryLabel)
        }
    }
}

// MARK: - Мелочи

/** Капсула с текстом (бейдж) */
@Composable
fun Capsule(text: String, color: Color, textColor: Color = color, bgAlpha: Float = 0.14f, style: TextStyle = ft(Ts.caption, FontWeight.Bold),
            icon: String? = null, modifier: Modifier = Modifier, hPad: Dp = 8.dp, vPad: Dp = 3.dp) {
    Row(modifier.clip(CircleShape).background(color.copy(alpha = bgAlpha)).padding(horizontal = hPad, vertical = vPad),
        verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        if (icon != null) SfIcon(icon, size = (style.fontSize.value).dp, tint = textColor)
        Text(text, style = style, color = textColor, maxLines = 1)
    }
}

@Composable
fun Divider(modifier: Modifier = Modifier, alpha: Float = 1f) {
    Box(modifier.fillMaxWidth().height(0.5.dp).background(Ios.separator.copy(alpha = Ios.separator.alpha * alpha)))
}

@Composable
fun VSpace(h: Dp) = Spacer(Modifier.height(h))

@Composable
fun HSpace(w: Dp) = Spacer(Modifier.width(w))

@Composable
fun ColumnScope.Fill() = Spacer(Modifier.weight(1f))

@Composable
fun RowScope.Fill(min: Dp = 0.dp) = Spacer(Modifier.weight(1f).widthIn(min = min))

@Composable
fun Bordered(color: Color, radius: Dp, width: Dp = 1.dp): Modifier = Modifier.border(BorderStroke(width, color), RoundedCornerShape(radius))

@Composable
fun ProvideInk(color: Color, content: @Composable () -> Unit) = CompositionLocalProvider(LocalContentColor provides color) { content() }

fun Modifier.minTouch() = this.defaultMinSize(minWidth = 44.dp, minHeight = 44.dp)

@Composable
fun rememberBool(v: Boolean = false) = remember { mutableStateOf(v) }

@Composable
fun <T> rememberNull(): MutableState<T?> = remember { mutableStateOf<T?>(null) }

@Composable
fun rememberText(v: String = "") = remember { mutableStateOf(v) }

@Composable
fun FillWidth(content: @Composable ColumnScope.() -> Unit) = Column(Modifier.fillMaxWidth(), content = content)
