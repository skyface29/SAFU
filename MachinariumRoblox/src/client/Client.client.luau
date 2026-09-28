--!nonstrict
-- Machinarium для Roblox — клиент: HUD, магазины прокачки, энциклопедия,
-- книга подсказок, телепорты, управление размером Йозефа.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")
local TweenService = game:GetService("TweenService")
local TextChatService = game:GetService("TextChatService")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared:WaitForChild("Config"))
local Remotes = Shared:WaitForChild("Remotes")
local Request: RemoteFunction = Remotes:WaitForChild("Request")

local UI = require(script.Parent:WaitForChild("UI"))
local Effects = require(script.Parent:WaitForChild("Effects"))
local Minigames = require(script.Parent:WaitForChild("Minigames"))
local C = Config.Colors

local data = nil
local session = { dev = false }

UI.Init()
Effects.Init()

local function req(...)
	local ok, a, b = pcall(Request.InvokeServer, Request, ...)
	if not ok then
		return false, "Ошибка связи"
	end
	return a, b
end

local function countKeys(t)
	local n = 0
	for _ in t or {} do
		n += 1
	end
	return n
end

----------------------------------------------------------------------
-- Подсказки (книга прохождения)
----------------------------------------------------------------------
local Hints = {
	[1] = "Нога — на вершине мусорной горы слева: прыгай по ступенькам-обломкам. Рука — внутри большой ржавой трубы справа. Антенна — на кране: залезай по решётчатой ферме.",
	[2] = "Подойди к переговорной трубе у ворот, нажми <b>E</b> (вытянуться) и позови стражника клавишей <b>F</b>.",
	[3] = "Просто пройди в открытые ворота.",
	[4] = "Нажми <b>Q</b>, чтобы сжаться. Вентиляция — низкая дыра у пола в восточной стене камеры (рядом с нарами).",
	[5] = "Кот гуляет вокруг фонтана на площади (перейди канал по мосту). Сожмись (<b>Q</b>), подойди и поймай. Потом неси его к оркестру на сцене в Нижнем городе.",
	[6] = "Паб — справа (восток) на площади. Робот сидит за игровым столом. Блокируй его, когда у него 3–4 в ряд!",
	[7] = "Теплица — слева за площадью. Отвечай вентилятору <b>неправильно</b> 3 раза — он разозлится и улетит.",
	[8] = "Кухня Братства — за пабом, ближе к каналу. Дверь теперь открыта. Нажми <b>F</b> рядом с Бертой.",
	[9] = "Башня — самое высокое здание, за площадью. Прыгай по спирали: синие полосы бьют током, шестерёнки крутятся, пар подбрасывает. Жёлтые платформы с флажком — чекпоинты.",
	[10] = "Бомба стоит у стены в комнате наверху. Запомни порядок проводов в пузыре Главаря и режь в том же порядке.",
	[11] = "Большеголовый друг сидит в центре комнаты. Подойди и почини его (<b>F</b>).",
	[12] = "Собери все 30 фактов (радио на столбах), 12 пасхалок и 5 воспоминаний (скамейки). Прокачай Йозефа и Берту до максимума!",
}

----------------------------------------------------------------------
-- HUD
----------------------------------------------------------------------
local gui = UI.Gui

local boltPanel = UI.panel(gui, UDim2.fromOffset(190, 52), UDim2.fromOffset(12, 12), C.Paper)
local boltLabel = UI.label(boltPanel, "🔩 0", UDim2.new(1, -16, 1, 0), UDim2.fromOffset(12, 0), 30)

local questPanel = UI.panel(gui, UDim2.fromOffset(330, 0), UDim2.new(1, -342, 0, 60), C.Paper)
questPanel.AutomaticSize = Enum.AutomaticSize.Y
UI.pad(questPanel, 10)
UI.list(questPanel, 4)
local questTitle = UI.label(questPanel, "", UDim2.new(1, 0, 0, 26), nil, 22, C.RustDark)
local questText = UI.label(questPanel, "", UDim2.new(1, 0, 0, 0), nil, 17)
questText.AutomaticSize = Enum.AutomaticSize.Y
questText.LayoutOrder = 2

local sizeLabel = UI.label(gui, "", UDim2.fromOffset(260, 26), UDim2.fromOffset(16, 70), 18, Color3.fromRGB(255, 240, 210))
sizeLabel.TextStrokeTransparency = 0.4

-- нижняя панель кнопок
local bar = Instance.new("Frame")
bar.BackgroundTransparency = 1
bar.Size = UDim2.new(1, -24, 0, 54)
bar.Position = UDim2.new(0, 12, 1, -66)
bar.Parent = gui
local barList = UI.list(bar, 8, true)
barList.HorizontalAlignment = Enum.HorizontalAlignment.Center

local function barButton(text: string, color: Color3, order: number, fn)
	local b = UI.button(bar, text, UDim2.fromOffset(118, 50), nil, color, fn)
	b.TextSize = 17
	b.LayoutOrder = order
	return b
end

local openJosef, openBerta, openBook, openEncyclopedia, openTeleport, openDev

-- вытянуться / сжаться (повторное нажатие — вернуть обычный рост)
local function toggleSize(want: string)
	if not data then
		return
	end
	local mode = if player.Character and player.Character:GetAttribute("SizeMode") == want then "normal" else want
	local ok, why = req("SetSize", mode)
	if not ok and why and why ~= "cooldown" then
		UI.toast(why, "info")
	end
end

local tallBtn = barButton("⬆️ Вытянуться [E]", C.Rust, 1, function()
	toggleSize("tall")
end)
local smallBtn = barButton("⬇️ Сжаться [Q]", C.Rust, 2, function()
	toggleSize("small")
end)
barButton("🤖 Йозеф", Color3.fromRGB(150, 110, 70), 3, function()
	openJosef()
end)
local bertaBtn = barButton("👧 Берта", C.BertaPink, 4, function()
	openBerta()
end)
barButton("📖 Подсказка", Color3.fromRGB(120, 110, 90), 5, function()
	openBook()
end)
barButton("📚 Факты", Color3.fromRGB(90, 120, 120), 6, function()
	openEncyclopedia()
end)
barButton("🗺️ Телепорт", Color3.fromRGB(90, 100, 130), 7, function()
	openTeleport()
end)
local devBtn = barButton("🛠️ rebol", Color3.fromRGB(60, 60, 60), 8, function()
	openDev()
end)
devBtn.Visible = false

----------------------------------------------------------------------
-- Обновление HUD и мира
----------------------------------------------------------------------
local function updateQuest()
	if not data then
		return
	end
	local q = Config.Quests[data.stage] or Config.Quests[Config.FinalStage]
	questTitle.Text = q.title
	local extra = ""
	if data.stage == 1 then
		local got = {}
		for _, id in { "leg", "arm", "antenna" } do
			table.insert(got, (if data.parts[id] then "✅ " else "⬜ ") .. ({ leg = "нога", arm = "рука", antenna = "антенна" })[id])
		end
		extra = "\n" .. table.concat(got, "   ")
	elseif data.stage == 5 then
		extra = if data.hasCat then "\n🐈 Кот у тебя в животе!" else "\n🐈 Кот ещё не пойман"
	elseif data.stage == Config.FinalStage then
		extra = string.format("\n📻 %d/%d   🥚 %d/%d   💭 %d/%d", countKeys(data.facts), #Config.Facts, countKeys(data.eggs), #Config.Eggs, countKeys(data.memories), #Config.Memories)
	end
	questText.Text = q.text .. extra
	-- маркер цели
	local markers = workspace:FindFirstChild("Machinarium") and workspace.Machinarium:FindFirstChild("Markers")
	local target = nil
	if data.stage == 5 and not data.hasCat then
		target = workspace.Machinarium.NPCs:FindFirstChild("Кот")
	elseif data.stage == 1 then
		-- ближайшая несобранная часть
		for _, pp in workspace.Machinarium.Junkyard:GetDescendants() do
			if pp:IsA("ProximityPrompt") and pp:GetAttribute("Action") == "JosefPart" and not data.parts[pp:GetAttribute("PartId")] then
				target = pp.Parent
				break
			end
		end
	elseif markers and q.marker ~= "" then
		target = markers:FindFirstChild(q.marker)
	end
	Effects.setMarker(target, "🎯")
	tallBtn.Visible = data.stage >= 2 or session.dev
	smallBtn.Visible = data.stage >= 4 or session.dev
	bertaBtn.Visible = data.berta.rescued
	devBtn.Visible = session.dev == true
end

local shownBolts = 0
local function setBolts(n: number, delta: number?)
	if delta and delta ~= 0 then
		local pop = UI.label(gui, (if delta > 0 then "+" else "") .. delta .. " 🔩", UDim2.fromOffset(160, 30), UDim2.fromOffset(40, 60), 24, if delta > 0 then Color3.fromRGB(255, 220, 120) else Color3.fromRGB(255, 120, 100))
		pop.TextStrokeTransparency = 0.3
		TweenService:Create(pop, TweenInfo.new(0.9), { Position = UDim2.fromOffset(40, 30), TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
		task.delay(1, function()
			pop:Destroy()
		end)
	end
	local from = shownBolts
	shownBolts = n
	task.spawn(function()
		for i = 1, 10 do
			boltLabel.Text = "🔩 " .. math.floor(from + (n - from) * i / 10)
			task.wait(0.02)
		end
	end)
end

local function onState(newData, newSession)
	local prevStage = data and data.stage
	data = newData
	session = newSession or session
	if data then
		data.bolts = data.bolts or 0
		setBolts(data.bolts)
		updateQuest()
		Effects.applyStage(data.stage, data)
		if prevStage and prevStage ~= data.stage then
			local q = Config.Quests[data.stage]
			if q then
				UI.toast("📜 Новая глава: <b>" .. q.title .. "</b>", "quest")
			end
		end
	end
end

----------------------------------------------------------------------
-- Окно: прокачка Йозефа
----------------------------------------------------------------------
local function upgradeRow(parent, u, level, onBuy)
	local row = UI.panel(parent, UDim2.new(1, -10, 0, 74), nil, Color3.fromRGB(245, 234, 208))
	UI.label(row, u.icon, UDim2.fromOffset(50, 74), UDim2.fromOffset(8, 0), 38)
	UI.label(row, "<b>" .. u.name .. "</b>  " .. string.rep("●", level) .. string.rep("○", u.max - level), UDim2.new(1, -220, 0, 30), UDim2.fromOffset(62, 6), 20)
	UI.label(row, u.desc, UDim2.new(1, -220, 0, 34), UDim2.fromOffset(62, 34), 16, Color3.fromRGB(110, 80, 60))
	local text = if level >= u.max then "МАКС" else ("🔩 " .. Config.UpgradeCost(u, level))
	local b = UI.button(row, text, UDim2.fromOffset(140, 50), UDim2.new(1, -150, 0, 12), if level >= u.max then Color3.fromRGB(120, 120, 110) else Color3.fromRGB(110, 150, 80), onBuy)
	return row, b
end

function openJosef()
	if not data then
		return
	end
	local _, content = UI.window("🤖 Прокачка Йозефа", 620, 560)
	local sc = UI.scroll(content, UDim2.fromScale(1, 1))
	UI.list(sc, 8)
	local header = UI.label(sc, "Болты: <b>🔩 " .. data.bolts .. "</b>. Тратишь болты — Йозеф становится лучше!", UDim2.new(1, -10, 0, 30), nil, 18)
	header.LayoutOrder = 0
	for i, u in Config.JosefUpgrades do
		local row = upgradeRow(sc, u, data.josef[u.id] or 0, function()
			local ok, why = req("BuyJosef", u.id)
			if ok then
				UI.toast(u.icon .. " " .. u.name .. " улучшен!", "good")
				task.wait(0.15)
				openJosef()
			else
				UI.toast(why or "Не получилось", "bad")
			end
		end)
		row.LayoutOrder = i
	end
	local sk = UI.label(sc, "<b>🎨 Покраска</b>", UDim2.new(1, -10, 0, 34), nil, 22)
	sk.LayoutOrder = 50
	for i, s in Config.JosefSkins do
		local owned = data.skins[s.id]
		local row = UI.panel(sc, UDim2.new(1, -10, 0, 54), nil, Color3.fromRGB(245, 234, 208))
		row.LayoutOrder = 50 + i
		local sw = Instance.new("Frame")
		sw.Size = UDim2.fromOffset(38, 38)
		sw.Position = UDim2.fromOffset(10, 8)
		sw.BackgroundColor3 = s.body
		UI.corner(sw, 19)
		UI.stroke(sw, UI.Ink, 2)
		sw.Parent = row
		UI.label(row, s.name .. (if data.skin == s.id then "  <b>(надет)</b>" else ""), UDim2.new(1, -220, 1, 0), UDim2.fromOffset(60, 0), 19)
		local txt = if owned then "Надеть" elseif s.cost < 0 then "🔒 достижение" else ("🔩 " .. s.cost)
		UI.button(row, txt, UDim2.fromOffset(140, 40), UDim2.new(1, -150, 0, 7), if owned then C.Rust else Color3.fromRGB(110, 150, 80), function()
			local ok, why = req("Skin", s.id)
			if ok then
				openJosef()
			else
				UI.toast(why or "Не получилось", "bad")
			end
		end)
	end
end

----------------------------------------------------------------------
-- Окно: прокачка Берты
----------------------------------------------------------------------
function openBerta()
	if not data then
		return
	end
	local _, content = UI.window("👧 Берта", 620, 560)
	if not data.berta.rescued then
		UI.label(content, "Берта в плену у Братства Чёрной Шляпы. Пройди сюжет, чтобы её спасти!", UDim2.new(1, 0, 0, 80), nil, 22)
		return
	end
	local sc = UI.scroll(content, UDim2.fromScale(1, 1))
	UI.list(sc, 8)
	local h = UI.label(sc, "Берта ходит за тобой, варит масляный суп, собирает болты и радует Йозефа ❤️", UDim2.new(1, -10, 0, 44), nil, 18)
	h.LayoutOrder = 0
	for i, u in Config.BertaUpgrades do
		local row = upgradeRow(sc, u, data.berta[u.id] or 0, function()
			local ok, why = req("BuyBerta", u.id)
			if ok then
				UI.toast(u.icon .. " " .. u.name .. " — Берта довольна!", "good")
				task.wait(0.15)
				openBerta()
			else
				UI.toast(why or "Не получилось", "bad")
			end
		end)
		row.LayoutOrder = i
	end
	local dh = UI.label(sc, "<b>👗 Платья</b>", UDim2.new(1, -10, 0, 34), nil, 22)
	dh.LayoutOrder = 50
	for i, d in Config.BertaDresses do
		local owned = data.dresses[d.id]
		local row = UI.panel(sc, UDim2.new(1, -10, 0, 54), nil, Color3.fromRGB(245, 234, 208))
		row.LayoutOrder = 50 + i
		local sw = Instance.new("Frame")
		sw.Size = UDim2.fromOffset(38, 38)
		sw.Position = UDim2.fromOffset(10, 8)
		sw.BackgroundColor3 = d.color
		UI.corner(sw, 19)
		UI.stroke(sw, UI.Ink, 2)
		sw.Parent = row
		UI.label(row, d.name .. (if data.dress == d.id then "  <b>(надето)</b>" else ""), UDim2.new(1, -220, 1, 0), UDim2.fromOffset(60, 0), 19)
		UI.button(row, if owned then "Надеть" else ("🔩 " .. d.cost), UDim2.fromOffset(140, 40), UDim2.new(1, -150, 0, 7), if owned then C.BertaPink else Color3.fromRGB(110, 150, 80), function()
			local ok, why = req("Dress", d.id)
			if ok then
				openBerta()
			else
				UI.toast(why or "Не получилось", "bad")
			end
		end)
	end
end

----------------------------------------------------------------------
-- Окно: энциклопедия (факты, пасхалки, воспоминания)
----------------------------------------------------------------------
function openEncyclopedia(tab: string?)
	if not data then
		return
	end
	tab = tab or "facts"
	local _, content = UI.window("📚 Энциклопедия Machinarium", 660, 600)
	local tabs = Instance.new("Frame")
	tabs.BackgroundTransparency = 1
	tabs.Size = UDim2.new(1, 0, 0, 44)
	tabs.Parent = content
	UI.list(tabs, 6, true)
	local defs = {
		{ "facts", "📻 Факты " .. countKeys(data.facts) .. "/" .. #Config.Facts },
		{ "eggs", "🥚 Пасхалки " .. countKeys(data.eggs) .. "/" .. #Config.Eggs },
		{ "mem", "💭 Воспоминания " .. countKeys(data.memories) .. "/" .. #Config.Memories },
	}
	for i, d in defs do
		local b = UI.button(tabs, d[2], UDim2.new(1 / 3, -4, 1, 0), nil, if tab == d[1] then C.Rust else Color3.fromRGB(150, 130, 110), function()
			openEncyclopedia(d[1])
		end)
		b.TextSize = 16
		b.LayoutOrder = i
	end
	local sc = UI.scroll(content, UDim2.new(1, 0, 1, -52), UDim2.fromOffset(0, 52))
	UI.list(sc, 6)
	local function entry(order, title, body, unlocked)
		local f = UI.panel(sc, UDim2.new(1, -10, 0, 0), nil, if unlocked then Color3.fromRGB(245, 234, 208) else Color3.fromRGB(200, 190, 170))
		f.AutomaticSize = Enum.AutomaticSize.Y
		f.LayoutOrder = order
		UI.pad(f, 8)
		UI.list(f, 2)
		UI.label(f, "<b>" .. title .. "</b>", UDim2.new(1, 0, 0, 24), nil, 19)
		local b = UI.label(f, body, UDim2.new(1, 0, 0, 0), nil, 16, Color3.fromRGB(90, 66, 50))
		b.AutomaticSize = Enum.AutomaticSize.Y
		b.LayoutOrder = 2
	end
	if tab == "facts" then
		for i, f in Config.Facts do
			local got = data.facts[f.id]
			entry(i, (if got then "📻 " else "🔒 ") .. i .. ". " .. (if got then f.title else "???"), if got then f.text else "Найди радио-терминал на столбе, чтобы узнать этот факт.", got)
		end
	elseif tab == "eggs" then
		for i, e in Config.Eggs do
			local got = data.eggs[e.id]
			entry(i, (if got then "🥚 " else "❔ ") .. (if got then e.name else "Секрет"), (if got then "Найдено! " else "Подсказка: ") .. e.hint .. "  (+" .. e.reward .. " 🔩)", got)
		end
	else
		for i, m in Config.Memories do
			local got = data.memories[m.id]
			entry(i, (if got then "💭 " else "🔒 ") .. (if got then m.name else "???"), if got then m.bubble else "Посиди на скамейке со светящимся кругом — Йозеф что-нибудь вспомнит.", got)
		end
	end
end

----------------------------------------------------------------------
-- Окно: книга подсказок (сначала — мини-игра с пауками!)
----------------------------------------------------------------------
function openBook()
	if not data then
		return
	end
	if not data.hintBook then
		Minigames.Spiders(UI, function(success)
			if success then
				req("HintBook")
				data.hintBook = true
				task.defer(openBook)
			end
		end)
		return
	end
	local _, content = UI.window("📖 Книга подсказок", 560, 420)
	local q = Config.Quests[data.stage] or Config.Quests[Config.FinalStage]
	UI.label(content, "<b>" .. q.title .. "</b>", UDim2.new(1, 0, 0, 34), nil, 24, C.RustDark)
	local body = UI.label(content, Hints[data.stage] or "", UDim2.new(1, 0, 0, 200), UDim2.fromOffset(0, 40), 20)
	body.TextYAlignment = Enum.TextYAlignment.Top
	UI.label(content, "<i>Управление: E — вытянуться, Q — сжаться, F — взаимодействие, пробел в воздухе — ракетный ранец.</i>", UDim2.new(1, 0, 0, 50), UDim2.new(0, 0, 1, -52), 16, Color3.fromRGB(110, 80, 60))
end

----------------------------------------------------------------------
-- Окно: телепорт
----------------------------------------------------------------------
function openTeleport()
	if not data then
		return
	end
	local _, content = UI.window("🗺️ Куда поехать?", 460, 520)
	local sc = UI.scroll(content, UDim2.fromScale(1, 1))
	UI.list(sc, 6)
	for i, t in Config.Teleports do
		local open = data.stage >= t.stage or session.dev
		local b = UI.button(sc, (if open then "🚋 " else "🔒 ") .. t.name, UDim2.new(1, -10, 0, 50), nil, if open then C.Rust else Color3.fromRGB(140, 130, 120), function()
			local ok, why = req("Teleport", t.id)
			if ok then
				UI.closeWindow()
			elseif why then
				UI.toast(why, "info")
			end
		end)
		b.LayoutOrder = i
	end
	local r = UI.button(sc, "🔄 Возродиться (если застрял)", UDim2.new(1, -10, 0, 44), nil, Color3.fromRGB(120, 90, 80), function()
		req("Respawn")
		UI.closeWindow()
	end)
	r.LayoutOrder = 100
end

----------------------------------------------------------------------
-- Меню разработчика rebol (как в оригинале — прыжки по уровням)
----------------------------------------------------------------------
function openDev()
	local _, content = UI.window("🛠️ rebol — меню разработчиков", 460, 520)
	local sc = UI.scroll(content, UDim2.fromScale(1, 1))
	UI.list(sc, 6)
	local l = UI.label(sc, "Как в оригинальной игре: секретное слово <b>rebol</b> открывает тестовое меню. Все локации доступны!", UDim2.new(1, -10, 0, 60), nil, 17)
	l.LayoutOrder = 0
	for i, t in Config.Teleports do
		local b = UI.button(sc, "✨ " .. t.name, UDim2.new(1, -10, 0, 44), nil, Color3.fromRGB(70, 70, 80), function()
			req("Teleport", t.id)
		end)
		b.LayoutOrder = i
	end
end

----------------------------------------------------------------------
-- Сообщения от сервера
----------------------------------------------------------------------
Remotes:WaitForChild("State").OnClientEvent:Connect(onState)
Remotes:WaitForChild("Bolts").OnClientEvent:Connect(function(n, delta)
	if data then
		data.bolts = n
	end
	setBolts(n, delta)
end)
Remotes:WaitForChild("Notify").OnClientEvent:Connect(function(text, kind)
	UI.toast(text, kind)
end)
Remotes:WaitForChild("Bubble").OnClientEvent:Connect(function(target, text, dur)
	Effects.bubble(target, text, dur)
end)
Remotes:WaitForChild("Knockback").OnClientEvent:Connect(function(dir)
	Effects.knockback(dir)
end)

Remotes:WaitForChild("OpenUI").OnClientEvent:Connect(function(kind, a, b)
	if kind == "Fact" then
		for i, f in Config.Facts do
			if f.id == a then
				UI.card("Факт №" .. i .. ": " .. f.title, f.text .. (if b then "\n\n<b>+" .. Config.Economy.FactReward .. " 🔩</b>" else ""), "📻")
			end
		end
	elseif kind == "Egg" then
		for _, e in Config.Eggs do
			if e.id == a then
				UI.card("Пасхалка найдена!", "<b>" .. e.name .. "</b>\n" .. e.hint .. "\n\n<b>+" .. e.reward .. " 🔩</b>", "🥚", Color3.fromRGB(255, 230, 170))
			end
		end
	elseif kind == "Memory" then
		for _, m in Config.Memories do
			if m.id == a then
				UI.card("Воспоминание: " .. m.name, m.bubble .. (if b then "\n\n<b>+" .. m.reward .. " 🔩</b>" else ""), "💭", Color3.fromRGB(255, 225, 235))
				if player.Character then
					Effects.bubble(player.Character, m.bubble, 6)
				end
			end
		end
	elseif kind == "Gomoku" then
		Minigames.Gomoku(UI, function(win)
			local ok = req("GomokuResult", win)
			if win and ok then
				UI.toast("🏆 Победа в «пять в ряд»! +" .. Config.Economy.GomokuReward .. " 🔩", "good")
			end
		end)
	elseif kind == "Quiz" then
		Minigames.Quiz(UI, a or 0, function(index, answer)
			return req("QuizAnswer", index, answer)
		end)
	elseif kind == "Bomb" then
		Minigames.Bomb(UI, a, function(order)
			return req("BombResult", order) == true
		end)
	elseif kind == "Arrest" then
		Effects.arrest(UI)
	elseif kind == "Band" then
		Effects.band()
	elseif kind == "BertaRescued" then
		UI.card("Берта спасена!", "Теперь она ходит за тобой. Открой меню «👧 Берта», чтобы прокачать её: суп, корзинка, цветок любви, колёсики и платья.", "❤️", Color3.fromRGB(255, 225, 235))
	elseif kind == "Ending" then
		UI.closeWindow()
		Effects.ending(UI, data)
		UI.card("Город спасён!", "Ты прошёл сюжет. Открыт скин «В чёрной шляпе». Теперь собирай все факты, пасхалки и воспоминания, прокачивай Йозефа и Берту!", "🌅", Color3.fromRGB(255, 214, 150))
	elseif kind == "DevMenu" then
		session.dev = true
		devBtn.Visible = true
		openDev()
	elseif kind == "Checkpoint" then
		local tower = workspace.Machinarium:FindFirstChild("Tower")
		if tower then
			for _, f in tower:GetChildren() do
				if f:GetAttribute("CheckpointFlag") and f:GetAttribute("CheckpointFlag") <= a then
					f.Color = Color3.fromRGB(90, 190, 90)
				end
			end
		end
	end
end)

----------------------------------------------------------------------
-- Клавиши: E — вытянуться, Q — сжаться. Секретное слово rebol.
----------------------------------------------------------------------
local typed = ""
UserInputService.InputBegan:Connect(function(input, gp)
	if gp or UserInputService:GetFocusedTextBox() then
		return
	end
	if input.UserInputType ~= Enum.UserInputType.Keyboard then
		return
	end
	local name = input.KeyCode.Name
	if #name == 1 then
		typed = string.sub(typed .. string.lower(name), -5)
		if typed == "rebol" then
			typed = ""
			local ok = req("Egg", "rebol")
			if ok then
				session.dev = true
				devBtn.Visible = true
				openDev()
			end
			return
		end
	end
	if input.KeyCode == Enum.KeyCode.E then
		toggleSize("tall")
	elseif input.KeyCode == Enum.KeyCode.Q then
		toggleSize("small")
	end
end)

-- новый чат: слово rebol
pcall(function()
	TextChatService.MessageReceived:Connect(function(msg)
		if msg.TextSource and msg.TextSource.UserId == player.UserId and string.find(string.lower(msg.Text), "rebol", 1, true) then
			local ok = req("Egg", "rebol")
			if ok then
				session.dev = true
				devBtn.Visible = true
			end
		end
	end)
end)

-- радар (если прокачан)
task.spawn(function()
	local radarLabel = UI.label(gui, "", UDim2.fromOffset(300, 26), UDim2.fromOffset(16, 96), 18, Color3.fromRGB(160, 230, 255))
	radarLabel.TextStrokeTransparency = 0.4
	while true do
		task.wait(2)
		if data and (data.josef.radar or 0) > 0 then
			local r = req("Radar")
			if type(r) == "table" then
				radarLabel.Text = "📡 Ближайший " .. r.name .. ": " .. r.dist .. " м"
			else
				radarLabel.Text = "📡 Всё найдено!"
			end
		end
		local char = player.Character
		local mode = char and char:GetAttribute("SizeMode") or "normal"
		sizeLabel.Text = if mode == "tall" then "📏 Йозеф вытянулся" elseif mode == "small" then "🤏 Йозеф сжался" else ""
	end
end)

Effects.idleMemories(function()
	return data
end)

-- начальное состояние
task.spawn(function()
	local st = req("GetState")
	if type(st) == "table" and st.data then
		onState(st.data, st.session)
	end
	UI.card("Machinarium", "Ты — Йозеф, маленький робот. Братство Чёрной Шляпы разобрало тебя и выкинуло на свалку, похитило Берту и хочет взорвать Башню.\n\n<b>E</b> — вытянуться, <b>Q</b> — сжаться, <b>F</b> — взаимодействие.\nСобирай 🔩 болты и прокачивайся!", "🤖")
end)
