--!nonstrict
-- Machinarium для Roblox — главный серверный скрипт.
-- Сюжет, болты, прокачка Йозефа и Берты, факты, пасхалки, чекпоинты.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ProximityPromptService = game:GetService("ProximityPromptService")
local CollectionService = game:GetService("CollectionService")
local StarterPlayer = game:GetService("StarterPlayer")
local TweenService = game:GetService("TweenService")

StarterPlayer.LoadCharacterAppearance = false
StarterPlayer.CharacterUseJumpPower = true

local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared.Config)
local World = require(script.Parent.World)
local Data = require(script.Parent.Data)
local Josef = require(script.Parent.Josef)
local NPC = require(script.Parent.NPC)

local Econ = Config.Economy

----------------------------------------------------------------------
-- Мир
----------------------------------------------------------------------
World.Build()

----------------------------------------------------------------------
-- Remotes
----------------------------------------------------------------------
local remotes = Instance.new("Folder")
remotes.Name = "Remotes"
local function remote(className: string, name: string)
	local r = Instance.new(className)
	r.Name = name
	r.Parent = remotes
	return r
end
local StateEvent: RemoteEvent = remote("RemoteEvent", "State")
local BoltsEvent: RemoteEvent = remote("RemoteEvent", "Bolts")
local NotifyEvent: RemoteEvent = remote("RemoteEvent", "Notify")
local BubbleEvent: RemoteEvent = remote("RemoteEvent", "Bubble")
local KnockEvent: RemoteEvent = remote("RemoteEvent", "Knockback")
local OpenUIEvent: RemoteEvent = remote("RemoteEvent", "OpenUI")
local Request: RemoteFunction = remote("RemoteFunction", "Request")
remotes.Parent = Shared

-- состояние сессии (не сохраняется)
type Session = {
	checkpoint: number?,
	walked: boolean,
	crank: number,
	anger: number,
	bombSeq: { string }?,
	gomokuOpen: number,
	dev: boolean,
	lastSize: number,
	lastTeleport: number,
}
local sessions: { [Player]: Session } = {}

local function notify(player: Player, text: string, kind: string?)
	NotifyEvent:FireClient(player, text, kind or "info")
end

local function bubble(player: Player?, target: Instance, text: string, duration: number?)
	if player then
		BubbleEvent:FireClient(player, target, text, duration or 4)
	else
		BubbleEvent:FireAllClients(target, text, duration or 4)
	end
end

local function pushState(player: Player)
	local data = Data.Get(player)
	if not data then
		return
	end
	local s = sessions[player]
	StateEvent:FireClient(player, data, { dev = s and s.dev or false, checkpoint = s and s.checkpoint or nil })
end

local function leaderstat(player: Player)
	local ls = player:FindFirstChild("leaderstats")
	return ls and ls:FindFirstChild("Болты")
end

local function addBolts(player: Player, amount: number, raw: boolean?)
	local data = Data.Get(player)
	if not data or amount == 0 then
		return 0
	end
	local n = amount
	if not raw and amount > 0 then
		n = math.max(1, math.floor(amount * (1 + 0.1 * (data.berta.love or 0)) + 0.5))
	end
	data.bolts = math.max(0, data.bolts + n)
	if n > 0 then
		data.totalBolts += n
	end
	local ls = leaderstat(player)
	if ls then
		ls.Value = data.bolts
	end
	BoltsEvent:FireClient(player, data.bolts, n)
	return n
end

----------------------------------------------------------------------
-- Сюжет
----------------------------------------------------------------------
local function advance(player: Player, toStage: number)
	local data = Data.Get(player)
	if not data or data.stage >= toStage then
		return false
	end
	local done = Config.Quests[data.stage]
	data.stage = toStage
	addBolts(player, Econ.QuestReward, true)
	if done then
		notify(player, "✅ " .. done.title .. " — выполнено! +" .. Econ.QuestReward .. " 🔩", "quest")
	end
	pushState(player)
	return true
end

local function awardEgg(player: Player, id: string)
	local data = Data.Get(player)
	if not data or data.eggs[id] then
		return false
	end
	local egg
	for _, e in Config.Eggs do
		if e.id == id then
			egg = e
		end
	end
	if not egg then
		return false
	end
	data.eggs[id] = true
	addBolts(player, egg.reward, true)
	if id == "samorost" then
		data.skins.gnome = true
	end
	OpenUIEvent:FireClient(player, "Egg", id)
	pushState(player)
	return true
end

local function unlockFact(player: Player, id: string)
	local data = Data.Get(player)
	if not data then
		return
	end
	local isNew = not data.facts[id]
	if isNew then
		data.facts[id] = true
		addBolts(player, Econ.FactReward, true)
	end
	OpenUIEvent:FireClient(player, "Fact", id, isNew)
	if isNew then
		local count = 0
		for _ in data.facts do
			count += 1
		end
		if count >= #Config.Facts then
			awardEgg(player, "allfacts")
		end
		pushState(player)
	end
end

----------------------------------------------------------------------
-- Точки появления
----------------------------------------------------------------------
local function spawnCFrame(player: Player): CFrame
	local data = Data.Get(player)
	local s = sessions[player]
	local stage = data and data.stage or 1
	if s and s.checkpoint and stage >= 9 then
		local cp = World.TowerCheckpoints[s.checkpoint]
		if cp then
			return cp.CFrame * CFrame.new(0, 4, 0)
		end
	end
	if stage <= 2 then
		return World.Spawns.junk
	elseif stage == 3 then
		return World.Teleports.gate
	elseif stage == 4 then
		return World.Spawns.prison
	elseif stage <= 8 then
		return World.Spawns.square
	elseif stage <= 10 then
		return World.Teleports.tower
	elseif stage == 11 then
		return World.Spawns.towertop
	end
	return World.Spawns.square
end

local function teleport(player: Player, cf: CFrame)
	local char = player.Character
	if char then
		char:PivotTo(cf + Vector3.new(0, 2 * char:GetScale(), 0))
	end
end

----------------------------------------------------------------------
-- Болты
----------------------------------------------------------------------
type Bolt = { part: BasePart, value: number, active: boolean, pos: Vector3 }
local bolts: { Bolt } = {}

local function makeBolt(spot)
	local p = Instance.new("Part")
	p.Name = if spot.big then "BigBolt" else "Bolt"
	p.Shape = Enum.PartType.Cylinder
	local s = if spot.big then 2.6 else 1.5
	p.Size = Vector3.new(0.5 * s, s, s)
	p.CFrame = CFrame.new(spot.pos) * CFrame.Angles(0, 0, 0)
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Material = Enum.Material.Metal
	p.Color = if spot.big then Color3.fromRGB(255, 200, 60) else Color3.fromRGB(220, 180, 90)
	p.Reflectance = 0.15
	-- дырка гайки
	local hole = Instance.new("Part")
	hole.Shape = Enum.PartType.Cylinder
	hole.Size = Vector3.new(0.52 * s, s * 0.4, s * 0.4)
	hole.CFrame = p.CFrame
	hole.Anchored = true
	hole.CanCollide = false
	hole.CanQuery = false
	hole.CanTouch = false
	hole.Color = Color3.fromRGB(60, 50, 30)
	hole.Material = Enum.Material.Metal
	hole.Name = "Hole"
	hole.Parent = p
	if spot.big then
		local l = Instance.new("PointLight")
		l.Range = 10
		l.Brightness = 1.5
		l.Color = Color3.fromRGB(255, 210, 90)
		l.Parent = p
	end
	CollectionService:AddTag(p, "Bolt")
	p.Parent = World.Root.Bolts
	table.insert(bolts, { part = p, value = if spot.big then Econ.BigBoltValue else Econ.BoltValue, active = true, pos = spot.pos })
end

for _, spot in World.BoltSpots do
	makeBolt(spot)
end

local function setBoltVisible(b: Bolt, visible: boolean)
	local t = if visible then 0 else 1
	b.part.Transparency = t
	local hole = b.part:FindFirstChild("Hole")
	if hole then
		hole.Transparency = t
	end
	local l = b.part:FindFirstChildOfClass("PointLight")
	if l then
		l.Enabled = visible
	end
end

local function collectBolt(player: Player, b: Bolt)
	b.active = false
	setBoltVisible(b, false)
	addBolts(player, b.value)
	task.delay(Econ.BoltRespawn, function()
		b.active = true
		setBoltVisible(b, true)
	end)
end

task.spawn(function()
	while true do
		task.wait(0.1)
		for _, player in Players:GetPlayers() do
			local data = Data.Get(player)
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			if data and hrp then
				local r = (Econ.BaseMagnet + Econ.MagnetPerLevel * (data.josef.magnet or 0)) * math.max(1, char:GetScale())
				local r2 = r * r
				local pos = hrp.Position
				local bpos = NPC.BertaPos(player)
				local br = 5 + 3 * (data.berta.basket or 0)
				local br2 = br * br
				local useBerta = bpos ~= nil and (data.berta.basket or 0) > 0
				for _, b in bolts do
					if b.active then
						local d = b.pos - pos
						if d:Dot(d) <= r2 then
							collectBolt(player, b)
						elseif useBerta then
							local d2 = b.pos - bpos
							if d2:Dot(d2) <= br2 then
								collectBolt(player, b)
							end
						end
					end
				end
			end
		end
	end
end)

-- Берта варит масляный суп
task.spawn(function()
	while true do
		task.wait(Econ.BertaCookEvery)
		for _, player in Players:GetPlayers() do
			local data = Data.Get(player)
			if data and data.berta.rescued and (data.berta.cook or 0) > 0 then
				local n = addBolts(player, data.berta.cook * Econ.BertaCookPerLevel)
				local b = NPC.Bertas[player]
				if b then
					bubble(player, b, "🍲✨ +" .. n .. "🔩", 3)
				end
			end
		end
	end
end)

----------------------------------------------------------------------
-- Персонаж
----------------------------------------------------------------------
local function setupCharacter(player: Player, char: Model)
	local data = Data.Get(player)
	if not data then
		return
	end
	local humanoid = char:WaitForChild("Humanoid", 10)
	char:WaitForChild("HumanoidRootPart", 10)
	if not humanoid then
		return
	end
	task.wait()
	char:SetAttribute("SizeMode", "normal")
	char:SetAttribute("BaseHipHeight", humanoid.HipHeight)
	Josef.BuildMorph(char, data)
	Josef.ApplyStats(char, data)
	task.wait()
	char:PivotTo(spawnCFrame(player))
	if data.berta.rescued then
		task.delay(0.3, function()
			NPC.SpawnBerta(player, data)
		end)
	end
end

local function onPlayerAdded(player: Player)
	sessions[player] = { walked = false, crank = 0, anger = 0, gomokuOpen = 0, dev = false, lastSize = 0, lastTeleport = 0 }
	local data = Data.Load(player)
	local ls = Instance.new("Folder")
	ls.Name = "leaderstats"
	local b = Instance.new("IntValue")
	b.Name = "Болты"
	b.Value = data.bolts
	b.Parent = ls
	local st = Instance.new("IntValue")
	st.Name = "Глава"
	st.Value = data.stage
	st.Parent = ls
	ls.Parent = player
	player.CharacterAdded:Connect(function(char)
		setupCharacter(player, char)
	end)
	if player.Character then
		task.spawn(setupCharacter, player, player.Character)
	end
	player.Chatted:Connect(function(msg)
		if string.find(string.lower(msg), "rebol", 1, true) then
			sessions[player].dev = true
			awardEgg(player, "rebol")
			OpenUIEvent:FireClient(player, "DevMenu")
			pushState(player)
		end
	end)
	pushState(player)
end

Players.PlayerRemoving:Connect(function(player)
	NPC.RemoveBerta(player)
	Data.Release(player)
	sessions[player] = nil
end)

-- «Глава» в таблице лидеров
task.spawn(function()
	while true do
		task.wait(1)
		for _, p in Players:GetPlayers() do
			local data = Data.Get(p)
			local ls = p:FindFirstChild("leaderstats")
			local st = ls and ls:FindFirstChild("Глава")
			if data and st then
				st.Value = data.stage
			end
		end
	end
end)

----------------------------------------------------------------------
-- Братство толкается и отбирает болты
----------------------------------------------------------------------
NPC.Init(World, {
	onBump = function(player: Player, cap: Model, dir: Vector3)
		local data = Data.Get(player)
		if not data or data.stage >= Config.FinalStage or data.stage < 4 then
			return
		end
		local stolen = math.min(data.bolts, Econ.BlackCapSteal)
		if stolen > 0 then
			addBolts(player, -stolen, true)
		end
		KnockEvent:FireClient(player, dir)
		bubble(player, cap, "😈👊 " .. (if stolen > 0 then "💰-" .. stolen else "🎩"), 2.5)
		notify(player, "Чёрная Шляпа толкнул тебя" .. (if stolen > 0 then " и стащил " .. stolen .. " 🔩" else "!"), "bad")
	end,
}, Data.Get)

----------------------------------------------------------------------
-- Касания: убивалки, чекпоинты, сюжетные зоны
----------------------------------------------------------------------
local function playerFromHit(hit: BasePart): (Player?, Model?)
	local model = hit:FindFirstAncestorOfClass("Model")
	while model and not model:FindFirstChildOfClass("Humanoid") do
		model = model:FindFirstAncestorOfClass("Model")
	end
	if not model then
		return nil
	end
	return Players:GetPlayerFromCharacter(model), model
end

local killDebounce: { [Model]: number } = {}
local function hookKill(part: BasePart)
	part.CanTouch = true
	part.Touched:Connect(function(hit)
		local player, char = playerFromHit(hit)
		if not player or not char then
			return
		end
		local hum = char:FindFirstChildOfClass("Humanoid")
		if hum and hum.Health > 0 and (killDebounce[char] or 0) < os.clock() then
			killDebounce[char] = os.clock() + 2
			hum.Health = 0
			local text = part:GetAttribute("KillText")
			if text then
				notify(player, text, "bad")
			end
		end
	end)
end
for _, p in CollectionService:GetTagged("Kill") do
	hookKill(p)
end
CollectionService:GetInstanceAddedSignal("Kill"):Connect(hookKill)

for _, cp in CollectionService:GetTagged("Checkpoint") do
	cp.Touched:Connect(function(hit)
		local player = playerFromHit(hit)
		if not player then
			return
		end
		local data = Data.Get(player)
		local s = sessions[player]
		if not data or not s or data.stage < 9 then
			return
		end
		local idx = cp:GetAttribute("Index")
		if idx == 1 and (s.checkpoint == nil or s.checkpoint < 1) then
			s.walked = true
		end
		if (s.checkpoint or 0) < idx then
			s.checkpoint = idx
			notify(player, "🚩 Чекпоинт " .. idx .. "/" .. #World.TowerCheckpoints, "info")
			OpenUIEvent:FireClient(player, "Checkpoint", idx)
		end
	end)
end

local function zone(tagName: string, fn: (Player, any, Session) -> ())
	for _, z in CollectionService:GetTagged(tagName) do
		local busy: { [Player]: boolean } = {}
		z.Touched:Connect(function(hit)
			local player = playerFromHit(hit)
			if not player or busy[player] then
				return
			end
			local data = Data.Get(player)
			local s = sessions[player]
			if data and s then
				busy[player] = true
				fn(player, data, s)
				task.delay(1, function()
					busy[player] = nil
				end)
			end
		end)
	end
end

zone("ArrestZone", function(player, data)
	if data.stage == 3 then
		advance(player, 4)
		OpenUIEvent:FireClient(player, "Arrest")
		task.wait(1.2)
		teleport(player, World.Spawns.prison)
		notify(player, "Братство Чёрной Шляпы бросило тебя в тюрьму! Сожмись [Q] и ищи вентиляцию.", "quest")
	end
end)

zone("PrisonExit", function(player, data)
	if data.stage == 4 then
		advance(player, 5)
	end
end)

zone("TowerTop", function(player, data, s)
	if data.stage == 9 then
		advance(player, 10)
		notify(player, "Ты на вершине! Бомба где-то здесь…", "quest")
	end
	if s.walked then
		s.walked = false
		awardEgg(player, "towerrun")
	end
end)

----------------------------------------------------------------------
-- ProximityPrompt — все взаимодействия
----------------------------------------------------------------------
local partNames = { leg = "ногу", arm = "руку", antenna = "антенну" }

local actions = {}

actions.JosefPart = function(player, data, s, prompt)
	local id = prompt:GetAttribute("PartId")
	if data.parts[id] then
		notify(player, "Это уже на тебе.", "info")
		return
	end
	data.parts[id] = true
	notify(player, "🔧 Йозеф прикрутил " .. (partNames[id] or id) .. "!", "good")
	local char = player.Character
	if char then
		Josef.Refresh(char, data)
	end
	if data.parts.leg and data.parts.arm and data.parts.antenna then
		advance(player, 2)
		notify(player, "Йозеф снова целый! Теперь он умеет ВЫТЯГИВАТЬСЯ — клавиша E.", "quest")
	end
	pushState(player)
end

actions.Guard = function(player, data, s, prompt)
	local guard = World.NPC.Guard
	if data.stage < 2 then
		bubble(player, guard, "🤖❓🦿🦾📡", 3)
		notify(player, "Сначала собери себя на свалке.", "info")
		return
	end
	if data.stage > 2 then
		bubble(player, guard, "👋🚪", 2)
		return
	end
	local char = player.Character
	if not char or char:GetAttribute("SizeMode") ~= "tall" then
		bubble(player, guard, "👀❓ ⬇️🤏", 3)
		notify(player, "Стражник смотрит поверх тебя. Вытянись [E] и позови снова!", "info")
		return
	end
	bubble(player, guard, "😲👍🚪🔓", 3)
	advance(player, 3)
	notify(player, "Ворота открыты! Добро пожаловать в Машинариум.", "quest")
end

actions.Fact = function(player, data, s, prompt)
	unlockFact(player, prompt:GetAttribute("FactId"))
end

actions.Memory = function(player, data, s, prompt)
	local id = prompt:GetAttribute("MemoryId")
	local isNew = not data.memories[id]
	if isNew then
		data.memories[id] = true
		for _, m in Config.Memories do
			if m.id == id then
				addBolts(player, m.reward, true)
			end
		end
		pushState(player)
	end
	OpenUIEvent:FireClient(player, "Memory", id, isNew)
end

actions.Egg = function(player, data, s, prompt)
	local id = prompt:GetAttribute("EggId")
	if id == "creaks" then
		local char = player.Character
		if not char or char:GetAttribute("SizeMode") ~= "small" then
			notify(player, "Слишком большой, чтобы дотянуться до дверцы.", "info")
			return
		end
	end
	if not awardEgg(player, id) then
		notify(player, "Эту пасхалку ты уже нашёл 😉", "info")
	end
end

actions.Crank = function(player, data, s, prompt)
	s.crank += 1
	for _, hand in CollectionService:GetTagged("ClockHand") do
		local pivot: CFrame = hand:GetAttribute("Pivot")
		if pivot then
			local angle = -(s.crank % 12) * math.pi / 6
			TweenService:Create(hand, TweenInfo.new(0.4, Enum.EasingStyle.Back), {
				CFrame = pivot * CFrame.Angles(0, 0, angle) * CFrame.new(0, 1.5, 0),
			}):Play()
		end
	end
	notify(player, "🕰️ " .. (s.crank % 12 == 0 and 12 or s.crank % 12) .. " час(ов)", "info")
	if s.crank % 12 == 0 then
		awardEgg(player, "clock")
	end
end

actions.Cat = function(player, data, s, prompt)
	local cat = World.NPC.Cat
	if data.stage ~= 5 or data.hasCat then
		bubble(player, cat, "😼", 2)
		return
	end
	local char = player.Character
	if not char or char:GetAttribute("SizeMode") ~= "small" then
		bubble(player, cat, "🙀💨", 2)
		notify(player, "Кот боится больших роботов. Сожмись [Q] и подкрадись!", "info")
		return
	end
	data.hasCat = true
	bubble(player, cat, "😾➡️🤖", 2)
	notify(player, "🐈 Кот пойман и спрятан в живот! Неси его музыкантам.", "good")
	pushState(player)
end

actions.Band = function(player, data, s, prompt)
	local mus = World.NPC.Didgeridoo
	if data.stage < 5 then
		bubble(player, mus, "🎵❌", 2)
		return
	end
	if data.stage == 5 then
		if not data.hasCat then
			bubble(player, mus, "🎺🚫 🐈❓", 3)
			notify(player, "Диджериду забито. Нужен кот с площади!", "info")
			return
		end
		data.hasCat = false
		bubble(player, mus, "🐈➡️🎺💨✨🎶", 4)
		advance(player, 6)
		OpenUIEvent:FireClient(player, "Band")
		notify(player, "Оркестр снова играет! Загляни в паб на площади.", "quest")
		return
	end
	bubble(player, mus, "🎶😊🎶", 2)
end

actions.Gomoku = function(player, data, s, prompt)
	if data.stage < 6 then
		bubble(player, prompt.Parent.Parent, "🤖💤", 2)
		return
	end
	s.gomokuOpen = os.clock()
	OpenUIEvent:FireClient(player, "Gomoku")
end

actions.Fan = function(player, data, s, prompt)
	local fan = World.NPC.Fan
	if data.stage < 7 then
		bubble(player, fan, "💤🌀", 2)
		notify(player, "Вентилятор пока дремлет.", "info")
		return
	end
	OpenUIEvent:FireClient(player, "Quiz", s.anger)
end

actions.Berta = function(player, data, s, prompt)
	local captive = prompt.Parent and prompt.Parent.Parent
	if data.stage < 8 then
		bubble(player, captive, "😢🔒", 2)
		return
	end
	if data.stage == 8 then
		data.berta.rescued = true
		advance(player, 9)
		NPC.SpawnBerta(player, data)
		OpenUIEvent:FireClient(player, "BertaRescued")
		notify(player, "❤️ Берта свободна и пойдёт с тобой! Её можно прокачивать.", "quest")
		pushState(player)
	end
end

actions.Bomb = function(player, data, s, prompt)
	if data.stage ~= 10 then
		if data.stage < 10 then
			notify(player, "Сначала доберись до вершины.", "info")
		end
		return
	end
	local ids = {}
	for _, w in Config.BombWires do
		table.insert(ids, w.id)
	end
	for i = #ids, 2, -1 do
		local j = math.random(1, i)
		ids[i], ids[j] = ids[j], ids[i]
	end
	s.bombSeq = ids
	OpenUIEvent:FireClient(player, "Bomb", ids)
end

actions.Friend = function(player, data, s, prompt)
	local friend = World.NPC.Friend
	if data.stage < 11 then
		bubble(player, friend, "😵💫 💣❗", 3)
		if data.stage == 10 then
			notify(player, "Сначала обезвредь бомбу!", "info")
		end
		return
	end
	if data.stage == 11 then
		bubble(nil, friend, "😃❤️🤖", 4)
		advance(player, 12)
		data.endings += 1
		data.skins.blackcap = true
		OpenUIEvent:FireClient(player, "Ending")
		pushState(player)
		return
	end
	bubble(player, friend, "😃👋", 2)
end

actions.Lift = function(player, data, s, prompt)
	local dir = prompt:GetAttribute("Dir")
	if dir == "up" then
		if data.stage < 10 then
			notify(player, "Лифт заработает, когда ты впервые поднимешься наверх пешком.", "info")
			return
		end
		s.walked = false
		teleport(player, World.Teleports.towertop)
	else
		teleport(player, World.Teleports.tower)
	end
end

ProximityPromptService.PromptTriggered:Connect(function(prompt, player)
	local action = prompt:GetAttribute("Action")
	local fn = action and actions[action]
	local data = Data.Get(player)
	local s = sessions[player]
	if fn and data and s then
		local ok, err = pcall(fn, player, data, s, prompt)
		if not ok then
			warn("[Machinarium] action", action, err)
		end
	end
end)

----------------------------------------------------------------------
-- Запросы клиента
----------------------------------------------------------------------
local handlers = {}

handlers.GetState = function(player, data, s)
	return { data = data, session = { dev = s.dev, checkpoint = s.checkpoint } }
end

handlers.SetSize = function(player, data, s, mode)
	if os.clock() - s.lastSize < 0.35 then
		return false, "cooldown"
	end
	s.lastSize = os.clock()
	if mode ~= "tall" and mode ~= "small" and mode ~= "normal" then
		return false
	end
	if mode == "tall" and data.stage < 2 and not s.dev then
		return false, "Сначала найди все свои части на свалке."
	end
	if mode == "small" and data.stage < 4 and not s.dev then
		return false, "Сжиматься Йозеф научится в тюрьме."
	end
	local char = player.Character
	if not char then
		return false
	end
	local ok, why = Josef.SetSize(char, data, mode)
	if not ok and why == "noroom" then
		return false, "Не помещаюсь! Над головой мало места."
	end
	return ok
end

local function buy(player, data, list, store, id)
	local u = Config.FindUpgrade(list, id)
	if not u then
		return false, "?"
	end
	local lvl = store[id] or 0
	if lvl >= u.max then
		return false, "Уже максимум!"
	end
	local cost = Config.UpgradeCost(u, lvl)
	if data.bolts < cost then
		return false, "Не хватает болтов: нужно " .. cost .. " 🔩"
	end
	addBolts(player, -cost, true)
	store[id] = lvl + 1
	return true
end

handlers.BuyJosef = function(player, data, s, id)
	local ok, why = buy(player, data, Config.JosefUpgrades, data.josef, id)
	if ok then
		local char = player.Character
		if char then
			if id == "stretch" and char:GetAttribute("SizeMode") == "tall" then
				Josef.SetSize(char, data, "normal")
			end
			if id == "rocket" then
				Josef.Refresh(char, data)
			else
				Josef.ApplyStats(char, data)
			end
		end
		pushState(player)
	end
	return ok, why
end

handlers.BuyBerta = function(player, data, s, id)
	if not data.berta.rescued then
		return false, "Сначала спаси Берту!"
	end
	local ok, why = buy(player, data, Config.BertaUpgrades, data.berta, id)
	if ok then
		if id == "love" then
			NPC.SpawnBerta(player, data)
		end
		local b = NPC.Bertas[player]
		if b then
			bubble(player, b, "😍⬆️", 2)
		end
		pushState(player)
	end
	return ok, why
end

handlers.Skin = function(player, data, s, id)
	local skin
	for _, sk in Config.JosefSkins do
		if sk.id == id then
			skin = sk
		end
	end
	if not skin then
		return false
	end
	if not data.skins[id] then
		if skin.cost < 0 then
			return false, "Этот скин выдаётся за достижение."
		end
		if data.bolts < skin.cost then
			return false, "Не хватает болтов: нужно " .. skin.cost .. " 🔩"
		end
		addBolts(player, -skin.cost, true)
		data.skins[id] = true
	end
	data.skin = id
	local char = player.Character
	if char then
		Josef.Refresh(char, data)
	end
	pushState(player)
	return true
end

handlers.Dress = function(player, data, s, id)
	if not data.berta.rescued then
		return false, "Сначала спаси Берту!"
	end
	local dress
	for _, d in Config.BertaDresses do
		if d.id == id then
			dress = d
		end
	end
	if not dress then
		return false
	end
	if not data.dresses[id] then
		if data.bolts < dress.cost then
			return false, "Не хватает болтов: нужно " .. dress.cost .. " 🔩"
		end
		addBolts(player, -dress.cost, true)
		data.dresses[id] = true
	end
	data.dress = id
	NPC.SpawnBerta(player, data)
	pushState(player)
	return true
end

handlers.Teleport = function(player, data, s, id)
	if os.clock() - s.lastTeleport < 2 then
		return false, "Подожди секунду…"
	end
	for _, t in Config.Teleports do
		if t.id == id then
			if data.stage < t.stage and not s.dev then
				return false, "Это место ещё не открыто по сюжету."
			end
			local cf = World.Teleports[id]
			if not cf then
				return false
			end
			s.lastTeleport = os.clock()
			s.walked = false
			teleport(player, cf)
			return true
		end
	end
	return false
end

handlers.GomokuResult = function(player, data, s, win)
	if s.gomokuOpen == 0 or os.clock() - s.gomokuOpen < 8 then
		return false
	end
	s.gomokuOpen = 0
	if win ~= true then
		return true
	end
	data.wins += 1
	addBolts(player, Econ.GomokuReward, true)
	if data.stage == 6 then
		advance(player, 7)
		notify(player, "🗝️ Робот отдал ключ от задней комнаты паба! Теперь — теплица.", "quest")
	else
		pushState(player)
	end
	return true
end

handlers.QuizAnswer = function(player, data, s, index, answer)
	local q = Config.FanQuiz[index]
	if not q or data.stage < 7 then
		return nil
	end
	local correct = answer == q.correct
	local opened = false
	if correct then
		if not data.quiz[tostring(index)] then
			data.quiz[tostring(index)] = true
			addBolts(player, 10, true)
			local all = true
			for i = 1, #Config.FanQuiz do
				if not data.quiz[tostring(i)] then
					all = false
				end
			end
			if all then
				awardEgg(player, "quizmaster")
			end
		end
		bubble(player, World.NPC.Fan, "😊👍", 1.5)
	else
		s.anger += 1
		bubble(player, World.NPC.Fan, string.rep("😤", math.min(s.anger, 3)) .. "💨", 1.5)
		if s.anger >= Config.FanAngerToOpen and data.stage == 7 then
			opened = true
			advance(player, 8)
			notify(player, "🌀 Вентилятор взбесился и улетел! В теплице ты нашёл цветок для Берты 🌸", "quest")
		end
	end
	pushState(player)
	return { correct = correct, anger = s.anger, opened = opened }
end

handlers.BombResult = function(player, data, s, order)
	if data.stage ~= 10 or not s.bombSeq or type(order) ~= "table" then
		return false
	end
	for i, id in s.bombSeq do
		if order[i] ~= id then
			s.bombSeq = nil
			notify(player, "💥 Неверный провод! Бомба заискрила — попробуй ещё раз.", "bad")
			return false
		end
	end
	s.bombSeq = nil
	advance(player, 11)
	notify(player, "💣✂️ Бомба обезврежена! Теперь почини друга с большой головой.", "quest")
	return true
end

handlers.Egg = function(player, data, s, id)
	if id == "rebol" then
		s.dev = true
		awardEgg(player, "rebol")
		pushState(player)
		return true
	end
	return false
end

handlers.SetGfx = function(player, data, s, id)
	if type(id) == "string" and #id <= 16 then
		data.gfx = id
		return true
	end
	return false
end

handlers.HintBook = function(player, data, s)
	if not data.hintBook then
		data.hintBook = true
		pushState(player)
	end
	return true
end

handlers.Radar = function(player, data, s)
	if (data.josef.radar or 0) < 1 then
		return nil
	end
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if not hrp then
		return nil
	end
	local best, bestD, bestName = nil, math.huge, nil
	for _, part in CollectionService:GetTagged("FactTerminal") do
		if not data.facts[part:GetAttribute("FactId")] then
			local d = (part.Position - hrp.Position).Magnitude
			if d < bestD then
				best, bestD, bestName = part.Position, d, "📻 факт"
			end
		end
	end
	for _, part in CollectionService:GetTagged("Egg") do
		if not data.eggs[part:GetAttribute("EggId")] then
			local d = (part.Position - hrp.Position).Magnitude
			if d < bestD then
				best, bestD, bestName = part.Position, d, "🥚 пасхалка"
			end
		end
	end
	if best then
		return { pos = best, name = bestName, dist = math.floor(bestD) }
	end
	return nil
end

handlers.Respawn = function(player, data, s)
	local char = player.Character
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hum then
		hum.Health = 0
	end
	return true
end

Request.OnServerInvoke = function(player, action, ...)
	local fn = handlers[action]
	local data = Data.Get(player)
	local s = sessions[player]
	if not fn or not data or not s then
		return false
	end
	local ok, a, b = pcall(fn, player, data, s, ...)
	if not ok then
		warn("[Machinarium] request", action, a)
		return false
	end
	return a, b
end

----------------------------------------------------------------------
-- Старт
----------------------------------------------------------------------
Players.CharacterAutoLoads = true
Players.RespawnTime = 2
Players.PlayerAdded:Connect(onPlayerAdded)
for _, p in Players:GetPlayers() do
	task.spawn(onPlayerAdded, p)
end
Data.StartAutosave()

print("[Machinarium] Город построен. Болтов на карте:", #bolts)
