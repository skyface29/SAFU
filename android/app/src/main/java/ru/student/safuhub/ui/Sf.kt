package ru.student.safuhub.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.automirrored.rounded.Assignment
import androidx.compose.material.icons.automirrored.rounded.DirectionsBike
import androidx.compose.material.icons.automirrored.rounded.DirectionsRun
import androidx.compose.material.icons.automirrored.rounded.DirectionsWalk
import androidx.compose.material.icons.automirrored.rounded.FormatAlignLeft
import androidx.compose.material.icons.automirrored.rounded.FormatListBulleted
import androidx.compose.material.icons.automirrored.rounded.LibraryBooks
import androidx.compose.material.icons.automirrored.rounded.ListAlt
import androidx.compose.material.icons.automirrored.rounded.LiveHelp
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.automirrored.rounded.ManageSearch
import androidx.compose.material.icons.automirrored.rounded.MenuBook
import androidx.compose.material.icons.automirrored.rounded.NoteAdd
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.automirrored.rounded.ShowChart
import androidx.compose.material.icons.automirrored.rounded.StickyNote2
import androidx.compose.material.icons.automirrored.rounded.TrendingUp
import androidx.compose.material.icons.automirrored.rounded.Undo
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.CropSquare
import androidx.compose.material.icons.outlined.DonutLarge
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.UploadFile
import androidx.compose.material.icons.outlined.WbSunny
import androidx.compose.material.icons.rounded.*
import androidx.compose.ui.graphics.vector.ImageVector

/** Значки SF Symbols → Material (скруглённые) */
object Sf {
    private val cache = HashMap<String, ImageVector>()

    fun icon(name: String): ImageVector = cache.getOrPut(name) { resolve(name) }

    private fun resolve(name: String): ImageVector = when (name) {
        "1.circle.fill" -> Icons.Rounded.LooksOne
        "2.circle.fill" -> Icons.Rounded.LooksTwo
        "3.circle.fill" -> Icons.Rounded.Looks3
        "4.circle.fill" -> Icons.Rounded.Looks4
        "alarm", "alarm.fill" -> Icons.Rounded.Alarm
        "antenna.radiowaves.left.and.right", "dot.radiowaves.left.and.right" -> Icons.Rounded.Sensors
        "app.badge", "app.badge.fill" -> Icons.Rounded.AppShortcut
        "archivebox", "archivebox.fill" -> Icons.Outlined.Inventory2
        "arrow.clockwise" -> Icons.Rounded.Refresh
        "arrow.counterclockwise" -> Icons.Rounded.Replay
        "arrow.down.circle.fill", "arrow.down.circle" -> Icons.Rounded.ArrowCircleDown
        "arrow.down.doc.fill", "arrow.down.doc", "square.and.arrow.down" -> Icons.Rounded.Download
        "arrow.left", "chevron.backward.circle" -> Icons.AutoMirrored.Rounded.ArrowBack
        "arrow.right" -> Icons.AutoMirrored.Rounded.ArrowForward
        "arrow.left.arrow.right.circle", "arrow.left.arrow.right" -> Icons.Rounded.SwapHorizontalCircle
        "arrow.triangle.2.circlepath", "arrow.2.circlepath" -> Icons.Rounded.Sync
        "arrow.up.arrow.down" -> Icons.Rounded.SwapVert
        "arrow.up.doc", "arrow.up.doc.fill" -> Icons.Outlined.UploadFile
        "arrow.up.forward.app", "arrow.up.forward.app.fill", "arrow.up.right.square", "arrow.up.forward" -> Icons.AutoMirrored.Rounded.OpenInNew
        "arrow.up.right" -> Icons.Rounded.NorthEast
        "arrow.uturn.backward" -> Icons.AutoMirrored.Rounded.Undo
        "arrow.uturn.backward.circle", "arrow.uturn.backward.circle.fill" -> Icons.Rounded.Restore
        "atom" -> Icons.Rounded.Science
        "banknote.fill", "banknote" -> Icons.Rounded.Payments
        "bell.badge.fill", "bell.badge" -> Icons.Rounded.NotificationsActive
        "bell.fill", "bell" -> Icons.Rounded.Notifications
        "bell.slash", "bell.slash.fill" -> Icons.Rounded.NotificationsOff
        "bicycle" -> Icons.AutoMirrored.Rounded.DirectionsBike
        "bolt.fill", "bolt" -> Icons.Rounded.Bolt
        "book.closed", "book.closed.fill" -> Icons.Rounded.Book
        "book.fill", "book", "text.book.closed.fill" -> Icons.AutoMirrored.Rounded.MenuBook
        "books.vertical", "books.vertical.fill" -> Icons.AutoMirrored.Rounded.LibraryBooks
        "brain.head.profile", "brain" -> Icons.Rounded.Psychology
        "briefcase.fill", "briefcase" -> Icons.Rounded.Work
        "bubble.left.and.bubble.right.fill", "bubble.left.and.bubble.right" -> Icons.Rounded.Forum
        "bubble.left.fill", "bubble.left" -> Icons.Rounded.ChatBubble
        "building.2", "building.2.fill", "building" -> Icons.Rounded.Apartment
        "building.columns.fill", "building.columns" -> Icons.Rounded.AccountBalance
        "bus.fill", "bus", "bus.doubledecker.fill" -> Icons.Rounded.DirectionsBus
        "calendar" -> Icons.Outlined.CalendarMonth
        "calendar.circle.fill", "calendar.circle" -> Icons.Rounded.CalendarMonth
        "calendar.badge.checkmark" -> Icons.Rounded.EventAvailable
        "calendar.badge.clock" -> Icons.Rounded.Event
        "calendar.badge.minus" -> Icons.Rounded.EventBusy
        "calendar.badge.plus" -> Icons.Rounded.EditCalendar
        "camera.fill", "camera" -> Icons.Rounded.PhotoCamera
        "camera.macro" -> Icons.Rounded.LocalFlorist
        "camera.viewfinder", "doc.viewfinder", "text.viewfinder", "doc.text.viewfinder" -> Icons.Rounded.DocumentScanner
        "car.fill", "car" -> Icons.Rounded.DirectionsCar
        "car.rear.road.lane", "road.lanes" -> Icons.Rounded.Traffic
        "character.book.closed.fill", "character.bubble.fill", "character.bubble" -> Icons.Rounded.Translate
        "chart.bar", "chart.bar.fill", "chart.bar.xaxis" -> Icons.Rounded.BarChart
        "chart.bar.doc.horizontal", "chart.bar.doc.horizontal.fill" -> Icons.Rounded.Assessment
        "chart.line.uptrend.xyaxis" -> Icons.AutoMirrored.Rounded.ShowChart
        "checklist" -> Icons.Rounded.Checklist
        "checkmark" -> Icons.Rounded.Check
        "checkmark.circle" -> Icons.Outlined.CheckCircle
        "checkmark.circle.fill" -> Icons.Rounded.CheckCircle
        "checkmark.seal.fill", "checkmark.seal" -> Icons.Rounded.Verified
        "checkmark.shield", "checkmark.shield.fill" -> Icons.Rounded.VerifiedUser
        "chevron.backward", "chevron.left" -> Icons.Rounded.ChevronLeft
        "chevron.down" -> Icons.Rounded.KeyboardArrowDown
        "chevron.up" -> Icons.Rounded.KeyboardArrowUp
        "chevron.forward", "chevron.right" -> Icons.Rounded.ChevronRight
        "chevron.left.forwardslash.chevron.right" -> Icons.Rounded.Code
        "chevron.up.chevron.down" -> Icons.Rounded.UnfoldMore
        "circle" -> Icons.Outlined.Circle
        "circle.dashed" -> Icons.Outlined.DonutLarge
        "circle.fill" -> Icons.Rounded.Circle
        "circle.grid.2x2.fill", "square.grid.2x2", "square.grid.2x2.fill" -> Icons.Rounded.GridView
        "circle.hexagongrid.fill" -> Icons.Rounded.BubbleChart
        "clock" -> Icons.Outlined.Schedule
        "clock.fill" -> Icons.Rounded.Schedule
        "clock.arrow.circlepath" -> Icons.Rounded.History
        "clock.badge.questionmark" -> Icons.Rounded.PendingActions
        "cloud.snow.fill", "cloud.snow", "snowflake", "wind.snow" -> Icons.Rounded.AcUnit
        "cloud.sun.fill", "cloud.fill", "cloud", "smoke.fill", "cloud.moon.fill" -> Icons.Rounded.WbCloudy
        "cloud.rain.fill", "cloud.drizzle.fill", "cloud.heavyrain.fill", "cloud.sun.rain.fill", "cloud.rain" -> Icons.Rounded.Umbrella
        "cloud.bolt.fill", "cloud.bolt.rain.fill" -> Icons.Rounded.Thunderstorm
        "cloud.fog.fill", "cloud.fog" -> Icons.Rounded.Dehaze
        "cloud.sleet.fill", "cloud.hail.fill" -> Icons.Rounded.Grain
        "cpu", "cpu.fill" -> Icons.Rounded.Memory
        "crown.fill", "crown" -> Icons.Rounded.WorkspacePremium
        "cup.and.saucer.fill" -> Icons.Rounded.LocalCafe
        "cylinder.split.1x2.fill", "externaldrive.fill", "externaldrive" -> Icons.Rounded.Storage
        "externaldrive.badge.checkmark", "externaldrive.fill.badge.checkmark" -> Icons.Rounded.CloudDone
        "dice.fill", "dice" -> Icons.Rounded.Casino
        "doc.badge.plus", "note.text.badge.plus" -> Icons.AutoMirrored.Rounded.NoteAdd
        "doc", "doc.fill" -> Icons.Rounded.Description
        "doc.on.clipboard" -> Icons.Rounded.ContentPaste
        "doc.on.doc", "doc.on.doc.fill" -> Icons.Rounded.ContentCopy
        "doc.richtext", "doc.richtext.fill", "doc.text", "doc.text.fill" -> Icons.AutoMirrored.Rounded.Article
        "doc.zipper" -> Icons.Rounded.FolderZip
        "dock.rectangle" -> Icons.Rounded.CallToAction
        "door.left.hand.open" -> Icons.Rounded.MeetingRoom
        "drop.fill", "drop" -> Icons.Rounded.WaterDrop
        "ellipsis", "ellipsis.circle", "ellipsis.circle.fill" -> Icons.Rounded.MoreHoriz
        "envelope.badge.fill", "mail.badge", "envelope.badge" -> Icons.Rounded.MarkEmailUnread
        "envelope.fill", "envelope" -> Icons.Rounded.Email
        "exclamationmark.arrow.triangle.2.circlepath" -> Icons.Rounded.SyncProblem
        "exclamationmark.circle.fill", "exclamationmark.circle" -> Icons.Rounded.Error
        "exclamationmark.triangle.fill", "exclamationmark.triangle" -> Icons.Rounded.Warning
        "eye" -> Icons.Rounded.Visibility
        "eye.slash", "eye.slash.fill" -> Icons.Rounded.VisibilityOff
        "face.dashed", "face.smiling" -> Icons.Rounded.Face
        "faceid", "touchid" -> Icons.Rounded.Fingerprint
        "figure.run" -> Icons.AutoMirrored.Rounded.DirectionsRun
        "figure.walk", "shoeprints.fill" -> Icons.AutoMirrored.Rounded.DirectionsWalk
        "film", "film.fill" -> Icons.Rounded.Movie
        "fish.fill" -> Icons.Rounded.SetMeal
        "flag.checkered" -> Icons.Rounded.SportsScore
        "flag.fill", "flag" -> Icons.Rounded.Flag
        "flame.fill", "flame" -> Icons.Rounded.LocalFireDepartment
        "flask.fill", "flask" -> Icons.Rounded.Science
        "folder" -> Icons.Outlined.Folder
        "folder.fill" -> Icons.Rounded.Folder
        "folder.badge.plus" -> Icons.Rounded.CreateNewFolder
        "forward.end.fill" -> Icons.Rounded.SkipNext
        "function", "x.squareroot" -> Icons.Rounded.Functions
        "gamecontroller.fill", "gamecontroller" -> Icons.Rounded.SportsEsports
        "gearshape" -> Icons.Outlined.Settings
        "gearshape.fill", "gearshape.2.fill" -> Icons.Rounded.Settings
        "gift.fill", "gift" -> Icons.Rounded.CardGiftcard
        "globe", "globe.europe.africa.fill" -> Icons.Rounded.Public
        "gobackward.15" -> Icons.Rounded.FastRewind
        "goforward.15" -> Icons.Rounded.FastForward
        "graduationcap", "graduationcap.fill" -> Icons.Rounded.School
        "grid" -> Icons.Rounded.GridOn
        "hammer.fill" -> Icons.Rounded.Handyman
        "hand.raised.fill" -> Icons.Rounded.PanTool
        "hand.thumbsup.fill" -> Icons.Rounded.ThumbUp
        "heart.fill", "heart" -> Icons.Rounded.Favorite
        "house", "house.fill" -> Icons.Rounded.Home
        "hourglass" -> Icons.Rounded.HourglassBottom
        "info.circle", "info.circle.fill" -> Icons.Rounded.Info
        "key.fill", "key" -> Icons.Rounded.Key
        "keyboard" -> Icons.Rounded.Keyboard
        "ladybug.fill" -> Icons.Rounded.BugReport
        "leaf.fill", "leaf" -> Icons.Rounded.Eco
        "lightbulb.fill", "lightbulb" -> Icons.Rounded.Lightbulb
        "line.3.horizontal.decrease.circle.fill", "line.3.horizontal.decrease.circle" -> Icons.Rounded.FilterList
        "line.3.horizontal" -> Icons.Rounded.DragHandle
        "link" -> Icons.Rounded.Link
        "list.bullet" -> Icons.AutoMirrored.Rounded.FormatListBulleted
        "list.bullet.clipboard" -> Icons.AutoMirrored.Rounded.Assignment
        "list.bullet.rectangle" -> Icons.AutoMirrored.Rounded.ListAlt
        "location.fill", "location" -> Icons.Rounded.NearMe
        "location.slash" -> Icons.Rounded.LocationOff
        "lock.fill", "lock", "lock.app" -> Icons.Rounded.Lock
        "lock.open.fill", "lock.open" -> Icons.Rounded.LockOpen
        "lock.iphone" -> Icons.Rounded.PhonelinkLock
        "lock.rectangle.stack" -> Icons.Rounded.Password
        "lock.shield.fill", "lock.shield" -> Icons.Rounded.Security
        "magnifyingglass" -> Icons.Rounded.Search
        "map", "map.fill" -> Icons.Rounded.Map
        "mappin.and.ellipse", "mappin" -> Icons.Rounded.LocationOn
        "mappin.circle.fill" -> Icons.Rounded.Place
        "megaphone.fill", "megaphone" -> Icons.Rounded.Campaign
        "mic.fill", "mic" -> Icons.Rounded.Mic
        "minus.magnifyingglass" -> Icons.Rounded.ZoomOut
        "minus.rectangle", "minus" -> Icons.Rounded.Remove
        "moon.zzz.fill", "moon.fill", "moon.stars.fill" -> Icons.Rounded.Bedtime
        "music.note" -> Icons.Rounded.MusicNote
        "nosign" -> Icons.Rounded.Block
        "note.text" -> Icons.AutoMirrored.Rounded.StickyNote2
        "paintbrush.pointed.fill", "paintbrush.fill" -> Icons.Rounded.Brush
        "paintpalette.fill", "paintpalette" -> Icons.Rounded.Palette
        "paperplane.fill", "paperplane" -> Icons.AutoMirrored.Rounded.Send
        "party.popper.fill", "party.popper" -> Icons.Rounded.Celebration
        "pause.circle.fill" -> Icons.Rounded.PauseCircle
        "pause.fill" -> Icons.Rounded.Pause
        "pencil", "pencil.circle" -> Icons.Rounded.Edit
        "pencil.and.ruler.fill" -> Icons.Rounded.DesignServices
        "person.2", "person.2.fill" -> Icons.Rounded.People
        "person.3", "person.3.fill", "person.3.sequence.fill" -> Icons.Rounded.Groups
        "person.badge.key.fill" -> Icons.Rounded.ManageAccounts
        "person.crop.circle.badge.checkmark" -> Icons.Rounded.HowToReg
        "person.crop.circle.fill", "person.crop.circle" -> Icons.Rounded.AccountCircle
        "person.crop.rectangle.stack.fill" -> Icons.Rounded.RecentActors
        "person.fill", "person" -> Icons.Rounded.Person
        "person.text.rectangle.fill" -> Icons.Rounded.Badge
        "person.wave.2.fill" -> Icons.Rounded.RecordVoiceOver
        "perspective" -> Icons.Rounded.Transform
        "photo" -> Icons.Outlined.Image
        "photo.fill" -> Icons.Rounded.Photo
        "photo.on.rectangle", "photo.on.rectangle.angled" -> Icons.Rounded.PhotoLibrary
        "photo.stack", "photo.stack.fill" -> Icons.Rounded.Collections
        "pin.fill", "pin" -> Icons.Rounded.PushPin
        "pin.slash" -> Icons.Outlined.PushPin
        "platter.filled.bottom.iphone", "iphone" -> Icons.Rounded.Smartphone
        "play.circle.fill" -> Icons.Rounded.PlayCircle
        "play.fill" -> Icons.Rounded.PlayArrow
        "play.rectangle.fill" -> Icons.Rounded.SmartDisplay
        "plus" -> Icons.Rounded.Add
        "plus.circle", "plus.circle.fill" -> Icons.Rounded.AddCircle
        "plus.magnifyingglass" -> Icons.Rounded.ZoomIn
        "questionmark.bubble.fill", "questionmark.circle", "questionmark.circle.fill" -> Icons.AutoMirrored.Rounded.LiveHelp
        "rectangle", "square" -> Icons.Outlined.CropSquare
        "rectangle.3.group" -> Icons.Rounded.Dashboard
        "rectangle.grid.1x2" -> Icons.Rounded.ViewAgenda
        "rectangle.on.rectangle.angled" -> Icons.Rounded.AutoAwesomeMotion
        "rectangle.portrait.and.arrow.right" -> Icons.AutoMirrored.Rounded.Logout
        "rectangle.split.2x1" -> Icons.Rounded.VerticalSplit
        "safari" -> Icons.Rounded.OpenInBrowser
        "scalemass.fill" -> Icons.Rounded.Scale
        "signpost.right.fill" -> Icons.Rounded.AltRoute
        "slider.horizontal.3" -> Icons.Rounded.Tune
        "sparkle", "sparkles" -> Icons.Rounded.AutoAwesome
        "speaker.wave.2.fill" -> Icons.AutoMirrored.Rounded.VolumeUp
        "square.fill" -> Icons.Rounded.CropSquare
        "square.and.arrow.up" -> Icons.Rounded.IosShare
        "square.and.pencil" -> Icons.Rounded.EditNote
        "square.grid.3x2.fill", "square.grid.3x3", "square.grid.3x3.fill" -> Icons.Rounded.Apps
        "star.fill", "star" -> Icons.Rounded.Star
        "star.leadinghalf.filled" -> Icons.Rounded.StarHalf
        "stopwatch", "stopwatch.fill", "timer" -> Icons.Rounded.Timer
        "sun.max", "sun.min" -> Icons.Outlined.WbSunny
        "sun.max.fill", "sun.horizon.fill", "sunrise.fill", "sunset.fill" -> Icons.Rounded.WbSunny
        "switch.2" -> Icons.Rounded.ToggleOn
        "tablecells", "tablecells.fill" -> Icons.Rounded.TableChart
        "terminal.fill", "terminal" -> Icons.Rounded.Terminal
        "text.alignleft" -> Icons.AutoMirrored.Rounded.FormatAlignLeft
        "text.justify" -> Icons.Rounded.FormatAlignJustify
        "textformat" -> Icons.Rounded.TextFormat
        "thermometer.snowflake", "thermometer", "thermometer.medium" -> Icons.Rounded.Thermostat
        "tornado" -> Icons.Rounded.Tornado
        "trash", "trash.fill" -> Icons.Rounded.Delete
        "tray", "tray.fill" -> Icons.Rounded.Inbox
        "trophy.fill", "trophy" -> Icons.Rounded.EmojiEvents
        "tshirt.fill" -> Icons.Rounded.Checkroom
        "umbrella.fill" -> Icons.Rounded.Umbrella
        "wand.and.stars" -> Icons.Rounded.AutoFixHigh
        "waveform" -> Icons.Rounded.GraphicEq
        "waveform.and.mic" -> Icons.Rounded.SettingsVoice
        "waveform.badge.magnifyingglass" -> Icons.AutoMirrored.Rounded.ManageSearch
        "wifi.exclamationmark", "wifi.slash" -> Icons.Rounded.WifiOff
        "wind" -> Icons.Rounded.Air
        "wrench.and.screwdriver.fill", "wrench.fill" -> Icons.Rounded.Build
        "xmark" -> Icons.Rounded.Close
        "xmark.circle", "xmark.circle.fill" -> Icons.Rounded.Cancel
        "chart.pie.fill" -> Icons.Rounded.PieChart
        "exclamationmark" -> Icons.Rounded.PriorityHigh
        "questionmark" -> Icons.Rounded.QuestionMark
        "laptopcomputer" -> Icons.Rounded.Laptop
        "desktopcomputer" -> Icons.Rounded.Computer
        "stairs" -> Icons.Rounded.Stairs
        "minus.circle.fill", "minus.circle" -> Icons.Rounded.RemoveCircle
        "network" -> Icons.Rounded.Hub
        "sum" -> Icons.Rounded.Functions
        "triangle" -> Icons.Rounded.ChangeHistory
        "trending", "chart.xyaxis.line" -> Icons.AutoMirrored.Rounded.TrendingUp
        else -> fallback(name)
    }

    private fun fallback(name: String): ImageVector = when {
        name.startsWith("cloud") -> Icons.Rounded.WbCloudy
        name.startsWith("sun") -> Icons.Rounded.WbSunny
        name.startsWith("moon") -> Icons.Rounded.Bedtime
        name.startsWith("person") -> Icons.Rounded.Person
        name.startsWith("doc") -> Icons.Rounded.Description
        name.startsWith("folder") -> Icons.Rounded.Folder
        name.startsWith("calendar") -> Icons.Rounded.CalendarMonth
        name.startsWith("clock") -> Icons.Rounded.Schedule
        name.startsWith("bus") -> Icons.Rounded.DirectionsBus
        name.startsWith("book") -> Icons.AutoMirrored.Rounded.MenuBook
        name.startsWith("photo") -> Icons.Rounded.Photo
        name.startsWith("star") -> Icons.Rounded.Star
        name.startsWith("envelope") -> Icons.Rounded.Email
        name.startsWith("lock") -> Icons.Rounded.Lock
        name.startsWith("bell") -> Icons.Rounded.Notifications
        name.startsWith("chart") -> Icons.Rounded.BarChart
        name.startsWith("checkmark") -> Icons.Rounded.Check
        name.startsWith("xmark") -> Icons.Rounded.Close
        else -> Icons.Rounded.Circle
    }
}
