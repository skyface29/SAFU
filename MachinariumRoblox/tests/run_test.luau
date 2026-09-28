--!nonstrict
-- Прогон всей игры (сервер + клиент) в эмуляции Roblox: полный сюжет от свалки до финала.
local M = require("./mock")
local SRC = require("./_sources")

local game = M.game
local RS = game:GetService("ReplicatedStorage")
local SSS = game:GetService("ServerScriptService")
local SP = game:GetService("StarterPlayer")

-- маршрутизация сервер → клиент
M.routeClient = true

local function folder(name, parent)
	local f = M.Instance_new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end
local function scriptsInto(dir, parent)
	for key, src in SRC do
		local d, file = string.match(key, "^(%w+)/(.+)$")
		if d == dir then
			local cls, name = "ModuleScript", string.gsub(file, "%.luau$", "")
			if string.find(file, "%.server%.luau$") then
				cls, name = "Script", string.gsub(file, "%.server%.luau$", "")
			elseif string.find(file, "%.client%.luau$") then
				cls, name = "LocalScript", string.gsub(file, "%.client%.luau$", "")
			end
			local s = M.Instance_new(cls)
			s.Name = name
			s.Source = src
			s.Parent = parent
		end
	end
end
local shared = folder("Machinarium", RS)
scriptsInto("shared", shared)
local serverF = folder("MachinariumServer", SSS)
scriptsInto("server", serverF)
local sps = M.Instance_new("StarterPlayerScripts")
sps.Name = "StarterPlayerScripts"
sps.Parent = SP
local clientF = folder("MachinariumClient", sps)
scriptsInto("client", clientF)

-- require для «скриптов»
local cacheByRealm = { server = {}, client = {} }
local realm = "server"
local function makeRequire(r)
	local function req(inst)
		assert(type(inst) == "table" and inst.__class == "ModuleScript", "require не ModuleScript")
		local cache = cacheByRealm[r]
		if cache[inst] ~= nil then
			return cache[inst]
		end
		local fn, err = loadstring(inst.Source, "=" .. inst.Name)
		assert(fn, err)
		setfenv(fn, M.makeEnv(inst, req))
		local res = fn()
		cache[inst] = res
		return res
	end
	return req
end
local function runScript(inst, r)
	local fn, err = loadstring(inst.Source, "=" .. inst.Name)
	assert(fn, err)
	local env = M.makeEnv(inst, makeRequire(r))
	setfenv(fn, env)
	M.task.spawn(fn)
end

-- FireClient → OnClientEvent у локального игрока
local function deliver(remoteName, args)
	local remotes = shared:FindFirstChild("Remotes")
	local r = remotes and remotes:FindFirstChild(remoteName)
	if r then
		r.OnClientEvent:Fire(table.unpack(args))
	end
end
M.log = function() end

print("== сервер ==")
M.isServer = true
runScript(serverF.Main, "server")
M.advance(0.5)
local world = M.workspace:FindFirstChild("Machinarium")
assert(world, "мир не построен")
local nParts = 0
for _, d in world:GetDescendants() do
	if d:IsA("BasePart") then
		nParts += 1
	end
end
print("деталей в мире:", nParts)

local player = M.newPlayer("Tester", 101)
M.localPlayer = player
game:GetService("Players").__props.LocalPlayer = player
game:GetService("Players").PlayerAdded:Fire(player)
M.advance(0.2)
local char = player:LoadCharacter()
M.advance(0.5)
assert(char:FindFirstChild("JosefMorph"), "морф Йозефа не построен")
print("морф: деталей", #char.JosefMorph:GetChildren())

print("== клиент ==")
M.isServer = false
local pumped = 0
-- доставка событий клиенту в цикле
local function pump()
	while pumped < #M.clientEvents do
		pumped += 1
		local e = M.clientEvents[pumped]
		if e.player == nil or e.player == player then
			deliver(e.remote, e.args)
		end
	end
end
runScript(clientF.Client, "client")
M.advance(0.5)
pump()
M.isServer = true

local Remotes = shared.Remotes
local Request = Remotes.Request
local function request(...)
	M.isServer = true
	local a, b = Request.OnServerInvoke(player, ...)
	return a, b
end
local PPS = game:GetService("ProximityPromptService")
local function findPrompt(action, key, val)
	for _, d in world:GetDescendants() do
		if d.__class == "ProximityPrompt" and d:GetAttribute("Action") == action and (key == nil or d:GetAttribute(key) == val) then
			return d
		end
	end
	error("нет промпта " .. action .. " " .. tostring(val))
end
local function prompt(action, key, val)
	PPS.PromptTriggered:Fire(findPrompt(action, key, val), player)
	M.advance(0.4)
	pump()
end
local function touchTag(tag, idx)
	local parts = game:GetService("CollectionService"):GetTagged(tag)
	assert(#parts > 0, "нет зон " .. tag)
	table.sort(parts, function(a, b)
		return (a:GetAttribute("Index") or 0) < (b:GetAttribute("Index") or 0)
	end)
	local p = parts[idx or 1]
	p.Touched:Fire(player.Character.HumanoidRootPart)
	M.advance(1.5)
	pump()
end
local function data()
	return request("GetState").data
end
local function expectStage(n)
	local s = data().stage
	assert(s == n, "ожидалась стадия " .. n .. ", а сейчас " .. s)
	print("  стадия", n, "✔")
end

print("== сюжет ==")
expectStage(1)
for _, id in { "leg", "arm", "antenna" } do
	prompt("JosefPart", "PartId", id)
end
expectStage(2)
prompt("Guard")
expectStage(2)
M.advance(0.5)
assert(request("SetSize", "tall"), "не вытянулся")
assert(player.Character:GetAttribute("SizeMode") == "tall")
print("  масштаб tall:", player.Character:GetScale())
prompt("Guard")
expectStage(3)
touchTag("ArrestZone")
expectStage(4)
M.advance(0.5)
assert(request("SetSize", "small"), "не сжался")
touchTag("PrisonExit")
expectStage(5)
prompt("Band")
expectStage(5)
M.advance(0.5)
request("SetSize", "normal")
prompt("Cat")
assert(not data().hasCat, "кот пойман без сжатия")
M.advance(0.5)
request("SetSize", "small")
prompt("Cat")
assert(data().hasCat, "кот не пойман")
prompt("Band")
expectStage(6)
-- Братство толкается и ворует болты
do
	local capModel = world.NPCs:FindFirstChild("BlackCap_Leader")
	local before = #M.clientEvents
	player.Character:PivotTo(capModel:GetPivot())
	M.advance(0.6)
	pump()
	local knocked = false
	for i = before + 1, #M.clientEvents do
		if M.clientEvents[i].remote == "Knockback" then
			knocked = true
		end
	end
	assert(knocked, "Чёрная Шляпа не толкнул игрока")
	print("  толчок Братства ✔")
end
-- ловушки убивают
do
	local kill = game:GetService("CollectionService"):GetTagged("Kill")[1]
	kill.Touched:Fire(player.Character.HumanoidRootPart)
	M.advance(0.2)
	assert(player.Character.Humanoid.Health == 0, "ловушка не сработала")
	print("  ловушка ✔")
	local c2 = player:LoadCharacter()
	M.advance(1)
	assert(c2:FindFirstChild("JosefMorph"), "морф после возрождения")
	M.advance(0.5)
	request("SetSize", "small")
end
prompt("Gomoku")
M.advance(9)
assert(request("GomokuResult", true))
expectStage(7)
prompt("Fan")
local r = request("QuizAnswer", 1, 1)
assert(r and r.correct, "правильный ответ не засчитан")
for i = 1, 3 do
	r = request("QuizAnswer", 2, 1)
	assert(r and not r.correct)
end
assert(r.opened, "вентилятор не улетел")
expectStage(8)
prompt("Berta")
expectStage(9)
assert(world.NPCs:FindFirstChild("Berta_101"), "Берта не идёт за игроком")
M.advance(31)
pump()
for i = 1, 20 do
	local ok = pcall(touchTag, "Checkpoint", i)
	if not ok then
		break
	end
end
touchTag("TowerTop")
expectStage(10)
assert(data().eggs.towerrun, "нет пасхалки towerrun")
prompt("Bomb")
local seq = nil
for i = #M.clientEvents, 1, -1 do
	local e = M.clientEvents[i]
	if e.remote == "OpenUI" and e.args[1] == "Bomb" then
		seq = e.args[2]
		break
	end
end
assert(seq, "нет последовательности бомбы")
assert(request("BombResult", { "x", "y", "z", "w" }) == false)
prompt("Bomb")
for i = #M.clientEvents, 1, -1 do
	local e = M.clientEvents[i]
	if e.remote == "OpenUI" and e.args[1] == "Bomb" then
		seq = e.args[2]
		break
	end
end
assert(request("BombResult", seq) == true, "бомба не обезврежена")
expectStage(11)
prompt("Friend")
expectStage(12)
M.advance(20)
pump()

print("== коллекционка ==")
for _, d in world:GetDescendants() do
	if d.__class == "ProximityPrompt" then
		local a = d:GetAttribute("Action")
		if a == "Fact" or a == "Memory" or a == "Egg" then
			PPS.PromptTriggered:Fire(d, player)
		end
	end
end
M.advance(1)
pump()
for i = 1, 12 do
	prompt("Crank")
end
local dd = data()
local function count(t)
	local n = 0
	for _ in t do
		n += 1
	end
	return n
end
print("  факты", count(dd.facts), "пасхалки", count(dd.eggs), "воспоминания", count(dd.memories))
assert(count(dd.facts) == 30, "не все факты доступны на карте")
assert(count(dd.memories) == 5, "не все воспоминания")
request("Egg", "rebol")
dd = data()
print("  пасхалки после rebol:", count(dd.eggs))
local missing = {}
local Config = makeRequire("server")(shared.Config)
for _, e in Config.Eggs do
	if not dd.eggs[e.id] then
		table.insert(missing, e.id)
	end
end
print("  не найдены:", table.concat(missing, ", "))

print("== прокачка ==")
print("  болтов:", dd.bolts)
for _, u in Config.JosefUpgrades do
	local ok, why = request("BuyJosef", u.id)
	print("  купить", u.id, ok, why or "")
end
for _, u in Config.BertaUpgrades do
	local ok, why = request("BuyBerta", u.id)
	print("  купить Берте", u.id, ok, why or "")
end
print("  скин chrome:", request("Skin", "chrome"))
print("  скин blackcap:", request("Skin", "blackcap"))
print("  платье rose:", request("Dress", "rose"))
for _, t in Config.Teleports do
	M.advance(2.1)
	local ok, why = request("Teleport", t.id)
	assert(ok, "телепорт " .. t.id .. ": " .. tostring(why))
end
print("  телепорты ✔")
print("  радар:", request("Radar"))

print("== сохранение ==")
M.bindToClose()
local saved = M.stored["u_101"]
print("  сохранено:", saved ~= nil)

print("== клиентские окна ==")
M.isServer = false
M.advance(1)
pump()
local pg = player.PlayerGui
local gui = pg:FindFirstChild("MachinariumUI")
assert(gui, "нет UI")
local function buttons(root)
	local out = {}
	for _, d in root:GetDescendants() do
		if d.__class == "TextButton" then
			table.insert(out, d)
		end
	end
	return out
end
local function currentWindows()
	local out = {}
	for _, c in gui:GetChildren() do
		if c.__class == "Frame" and c.ZIndex == 10 then
			table.insert(out, c)
		end
	end
	return out
end
-- кнопки нижней панели и всё внутри открывающихся окон
local barButtons = {}
for _, c in gui:GetChildren() do
	if c.__class == "Frame" and c.Size and c.Size.Y.Offset == 54 then
		barButtons = buttons(c)
	end
end
print("  кнопок на панели:", #barButtons)
assert(#barButtons >= 8)
local clicks = 0
for _, b in barButtons do
	b.Activated:Fire()
	M.advance(0.5)
	pump()
	for _, w in currentWindows() do
		for _, wb in buttons(w) do
			if wb.Text ~= "✕" and wb.Parent then
				wb.Activated:Fire()
				clicks += 1
				M.advance(0.4)
				pump()
			end
		end
	end
end
print("  нажато кнопок в окнах:", clicks)
-- пауки: книга подсказок (hintBook ещё не открыт)
local function openUI(...)
	shared.Remotes.OpenUI.OnClientEvent:Fire(...)
	M.advance(0.3)
	pump()
end
for _, e in { { "Fact", "f01", true }, { "Egg", "rebol" }, { "Memory", "m_swim", true }, { "BertaRescued" }, { "DevMenu" }, { "Checkpoint", 3 }, { "Arrest" }, { "Band" } } do
	openUI(table.unpack(e))
	M.advance(3)
end
openUI("Gomoku")
for _, w in currentWindows() do
	local bs = buttons(w)
	for i = 1, #bs, 7 do
		if bs[i].Text == "" then
			bs[i].Activated:Fire()
			M.advance(0.5)
		end
	end
end
openUI("Quiz", 0)
for _, w in currentWindows() do
	for _, b in buttons(w) do
		if b.Text ~= "✕" then
			b.Activated:Fire()
			M.advance(1)
			break
		end
	end
end
openUI("Bomb", { "red", "blue", "yellow", "green" })
M.advance(5)
for _, w in currentWindows() do
	for _, b in buttons(w) do
		if b.Text ~= "✕" then
			b.Activated:Fire()
			M.advance(0.2)
		end
	end
end
M.advance(3)
openUI("Ending")
M.advance(25, 0.1)
pump()
-- мини-игра с пауками
local bookBtn
for _, b in barButtons do
	if string.find(b.Text, "Подсказка") then
		bookBtn = b
	end
end
M.isServer = true
local st = request("GetState")
print("  книга открыта до пауков?", st.data.hintBook)
M.isServer = false
bookBtn.Activated:Fire()
M.advance(30, 0.05)
for _, w in currentWindows() do
	for _, b in buttons(w) do
		if b.Text == "✕" then
			b.Activated:Fire()
		end
	end
end
M.advance(1)
pump()
M.isServer = true
st = request("GetState")
print("  книга открыта после пауков?", st.data.hintBook)
print("ВСЕ ТЕСТЫ ПРОЙДЕНЫ ✔")
