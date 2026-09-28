--!nonstrict
-- Effects: пузыри мыслей, двери по сюжету, вращение болтов, маркер цели,
-- паровые трамплины, двойной прыжок, толчки, воспоминания, финальная сцена.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local UserInputService = game:GetService("UserInputService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared:WaitForChild("Config"))
local Art = require(Shared:WaitForChild("Art"))
local C = Config.Colors

local Effects = {}
local player = Players.LocalPlayer
local root: any

----------------------------------------------------------------------
-- Пузыри мыслей (в Machinarium нет слов — только картинки)
----------------------------------------------------------------------
local activeBubbles: { [Instance]: BillboardGui } = {}

local function adorneeOf(target: Instance): (BasePart?, number)
	if target:IsA("Model") then
		local pp = target.PrimaryPart or target:FindFirstChildWhichIsA("BasePart", true)
		local ok, size = pcall(function()
			return target:GetExtentsSize()
		end)
		local h = if ok then size.Y else 6
		local hum = target:FindFirstChildOfClass("Humanoid")
		if hum then
			local hrp = target:FindFirstChild("HumanoidRootPart")
			return hrp, 3.5 * target:GetScale()
		end
		return pp, h + 0.8
	elseif target:IsA("BasePart") then
		return target, target.Size.Y / 2 + 2
	end
	return nil, 0
end

function Effects.bubble(target: Instance?, text: string, duration: number?)
	if not target then
		return
	end
	local part, height = adorneeOf(target)
	if not part then
		return
	end
	local old = activeBubbles[target]
	if old then
		old:Destroy()
	end
	local bb = Instance.new("BillboardGui")
	bb.Name = "ThoughtBubble"
	bb.Size = UDim2.fromOffset(math.clamp(utf8.len(text) or 4, 3, 14) * 30 + 30, 70)
	bb.StudsOffsetWorldSpace = Vector3.new(0, height, 0)
	bb.AlwaysOnTop = true
	bb.MaxDistance = 80
	bb.LightInfluence = 0
	bb.Adornee = part
	local bubble = Instance.new("Frame")
	bubble.Size = UDim2.new(1, 0, 0, 50)
	bubble.BackgroundColor3 = Color3.fromRGB(255, 253, 245)
	local cr = Instance.new("UICorner")
	cr.CornerRadius = UDim.new(0.5, 0)
	cr.Parent = bubble
	local st = Instance.new("UIStroke")
	st.Color = Color3.fromRGB(60, 40, 28)
	st.Thickness = 2.5
	st.Parent = bubble
	bubble.Parent = bb
	-- «хвостик» мысли из кружочков
	for i, s in { 12, 7 } do
		local dot = Instance.new("Frame")
		dot.Size = UDim2.fromOffset(s, s)
		dot.Position = UDim2.new(0.5, -s / 2 + i * 6, 0, 50 + (i - 1) * 9)
		dot.BackgroundColor3 = Color3.fromRGB(255, 253, 245)
		local c2 = Instance.new("UICorner")
		c2.CornerRadius = UDim.new(0.5, 0)
		c2.Parent = dot
		local s2 = Instance.new("UIStroke")
		s2.Color = Color3.fromRGB(60, 40, 28)
		s2.Thickness = 2
		s2.Parent = dot
		dot.Parent = bb
	end
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.fromScale(1, 1)
	l.Font = Enum.Font.FredokaOne
	l.TextScaled = true
	l.Text = text
	l.TextColor3 = Color3.fromRGB(60, 40, 28)
	l.Parent = bubble
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 10)
	pad.PaddingRight = UDim.new(0, 10)
	pad.PaddingTop = UDim.new(0, 6)
	pad.PaddingBottom = UDim.new(0, 6)
	pad.Parent = bubble
	bb.Parent = player:WaitForChild("PlayerGui")
	activeBubbles[target] = bb
	-- «пульс» появления
	local sc = Instance.new("UIScale")
	sc.Scale = 0.3
	sc.Parent = bubble
	TweenService:Create(sc, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	task.delay(duration or 4, function()
		if activeBubbles[target] == bb then
			activeBubbles[target] = nil
		end
		bb:Destroy()
	end)
end

-- NPC сами «думают», когда ты рядом
local function ambientBubbles()
	task.spawn(function()
		while true do
			task.wait(1.6)
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			if hrp and root then
				for _, m in root.NPCs:GetChildren() do
					local list = m:GetAttribute("Bubbles")
					if list and not activeBubbles[m] and m:GetAttribute("LocallyHidden") ~= true then
						local ok, pivot = pcall(function()
							return m:GetPivot()
						end)
						if ok and (pivot.Position - hrp.Position).Magnitude < 24 and math.random() < 0.3 then
							local opts = string.split(list, "|")
							Effects.bubble(m, opts[math.random(1, #opts)], 3.5)
						end
					end
				end
			end
		end
	end)
end

----------------------------------------------------------------------
-- Двери и предметы, зависящие от сюжета (локально для игрока)
----------------------------------------------------------------------
local function setHidden(inst: Instance, hidden: boolean)
	local parts = inst:GetDescendants()
	table.insert(parts, inst)
	for _, p in parts do
		if p:IsA("BasePart") then
			if p:GetAttribute("OrigT") == nil then
				p:SetAttribute("OrigT", p.Transparency)
				p:SetAttribute("OrigC", p.CanCollide)
			end
			p.Transparency = if hidden then 1 else p:GetAttribute("OrigT")
			p.CanCollide = if hidden then false else p:GetAttribute("OrigC")
		elseif p:IsA("ProximityPrompt") then
			p.Enabled = not hidden
		elseif p:IsA("ParticleEmitter") or p:IsA("Light") then
			p.Enabled = not hidden
		end
	end
	if inst:IsA("Model") then
		for _, p in inst:GetDescendants() do
			if p:IsA("ProximityPrompt") then
				p.Enabled = not hidden
			end
		end
		inst:SetAttribute("LocallyHidden", hidden)
	end
end

local lastStage, lastData = nil, nil
local reapplyQueued = false

function Effects.applyStage(stage: number, data: any)
	lastStage, lastData = stage, data
	for _, d in CollectionService:GetTagged("StageDoor") do
		local need = d:GetAttribute("RequiredStage") or 99
		local open = stage >= need
		if d:GetAttribute("OpenState") ~= open then
			d:SetAttribute("OpenState", open)
			if open then
				TweenService:Create(d, TweenInfo.new(0.6), { Transparency = 1 }):Play()
				d.CanCollide = false
			else
				d.Transparency = 0
				d.CanCollide = d.Name == "Door"
			end
		end
	end
	if root then
		for _, m in root.NPCs:GetChildren() do
			local hideAt = m:GetAttribute("HideAtStage")
			if hideAt then
				setHidden(m, stage >= hideAt)
			end
		end
	end
	for _, p in CollectionService:GetTagged("StageHide") do
		local hideAt = p:GetAttribute("HideAtStage")
		if hideAt then
			setHidden(p, stage >= hideAt)
		end
	end
	-- подсказки-промпты частей Йозефа прячем, если уже собраны
	if root and data then
		for _, pp in root:GetDescendants() do
			if pp:IsA("ProximityPrompt") then
				local a = pp:GetAttribute("Action")
				if a == "JosefPart" then
					local got = data.parts[pp:GetAttribute("PartId")] == true
					pp.Enabled = not got
					if pp.Parent:IsA("BasePart") then
						pp.Parent.Transparency = if got then 1 else 0
						local tip = pp.Parent.Parent:FindFirstChild("AntennaTip")
						if tip and pp:GetAttribute("PartId") == "antenna" then
							tip.Transparency = if got then 1 else 0
						end
					end
				end
			end
		end
	end
end

----------------------------------------------------------------------
-- Вращение болтов, вентилятора, флажки
----------------------------------------------------------------------
local boltBase: { [BasePart]: CFrame } = {}

local function animateWorld()
	RunService.RenderStepped:Connect(function()
		local t = os.clock()
		local cam = workspace.CurrentCamera
		local cpos = cam and cam.CFrame.Position or Vector3.zero
		for part, base in boltBase do
			if part.Parent then
				if (base.Position - cpos).Magnitude < 160 then
					local cf = base * CFrame.new(0, math.sin(t * 2 + base.Position.X) * 0.25, 0) * CFrame.Angles(0, t * 2.2 + base.Position.Z, 0)
					part.CFrame = cf
					local hole = part:FindFirstChild("Hole")
					if hole then
						hole.CFrame = cf
					end
				end
			else
				boltBase[part] = nil
			end
		end
	end)
	local function track(p)
		if p:IsA("BasePart") then
			boltBase[p] = CFrame.new(p.Position)
		end
	end
	for _, p in CollectionService:GetTagged("Bolt") do
		track(p)
	end
	CollectionService:GetInstanceAddedSignal("Bolt"):Connect(track)

	-- лопасти вентилятора
	task.spawn(function()
		local fan = root.NPCs:WaitForChild("Вентилятор", 30)
		if not fan then
			return
		end
		local blades = fan:WaitForChild("Blades")
		local hub = fan:WaitForChild("Hub")
		local base = {}
		for _, b in blades:GetChildren() do
			base[b] = hub.CFrame:ToObjectSpace(b.CFrame)
		end
		local angle = 0
		RunService.RenderStepped:Connect(function(dt)
			if fan:GetAttribute("LocallyHidden") then
				return
			end
			angle += dt * 6
			local center = hub.CFrame * CFrame.Angles(0, 0, angle)
			for b, off in base do
				b.CFrame = center * off
			end
		end)
	end)
end

----------------------------------------------------------------------
-- Маркер текущей цели
----------------------------------------------------------------------
local markerGui: any
function Effects.setMarker(target: Instance?, label: string?)
	if not markerGui then
		markerGui = Instance.new("BillboardGui")
		markerGui.Name = "QuestMarker"
		markerGui.Size = UDim2.fromOffset(120, 80)
		markerGui.AlwaysOnTop = true
		markerGui.LightInfluence = 0
		local arrow = Instance.new("TextLabel")
		arrow.Name = "Arrow"
		arrow.BackgroundTransparency = 1
		arrow.Size = UDim2.new(1, 0, 0, 44)
		arrow.Font = Enum.Font.FredokaOne
		arrow.TextScaled = true
		arrow.Text = "⬇️"
		arrow.Parent = markerGui
		local dist = Instance.new("TextLabel")
		dist.Name = "Dist"
		dist.BackgroundTransparency = 1
		dist.Size = UDim2.new(1, 0, 0, 30)
		dist.Position = UDim2.fromOffset(0, 44)
		dist.Font = Enum.Font.FredokaOne
		dist.TextScaled = true
		dist.TextColor3 = Color3.fromRGB(255, 220, 140)
		dist.TextStrokeTransparency = 0.3
		dist.Parent = markerGui
		markerGui.Parent = player:WaitForChild("PlayerGui")
		RunService.Heartbeat:Connect(function()
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			local a = markerGui.Adornee
			if hrp and a and a:IsA("BasePart") then
				local d = (a.Position - hrp.Position).Magnitude
				markerGui.Dist.Text = (markerGui:GetAttribute("Label") or "") .. " " .. math.floor(d) .. " м"
				markerGui.Enabled = d > 6
				markerGui.Arrow.Position = UDim2.fromOffset(0, math.sin(os.clock() * 4) * 5)
			end
		end)
	end
	local part = nil
	if target then
		if target:IsA("Model") then
			part = target.PrimaryPart
		elseif target:IsA("BasePart") then
			part = target
		end
	end
	markerGui.Adornee = part
	markerGui:SetAttribute("Label", label or "")
	markerGui.Enabled = part ~= nil
end

----------------------------------------------------------------------
-- Паровые трамплины, двойной прыжок, толчки
----------------------------------------------------------------------
local airJumpsUsed = 0

local function isMine(hit: BasePart): boolean
	local char = player.Character
	return char ~= nil and hit:IsDescendantOf(char)
end

local function setupMovement()
	local lastBounce = 0
	local function hookBounce(p: BasePart)
		p.Touched:Connect(function(hit)
			if isMine(hit) and os.clock() - lastBounce > 0.4 then
				lastBounce = os.clock()
				local char = player.Character
				local hrp = char and char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local v = hrp.AssemblyLinearVelocity
					hrp.AssemblyLinearVelocity = Vector3.new(v.X, p:GetAttribute("Power") or 80, v.Z)
					airJumpsUsed = 0
				end
			end
		end)
	end
	for _, p in CollectionService:GetTagged("Bounce") do
		hookBounce(p)
	end
	CollectionService:GetInstanceAddedSignal("Bounce"):Connect(hookBounce)

	UserInputService.JumpRequest:Connect(function()
		local char = player.Character
		local hum = char and char:FindFirstChildOfClass("Humanoid")
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if not hum or not hrp then
			return
		end
		local st = hum:GetState()
		if st == Enum.HumanoidStateType.Freefall or st == Enum.HumanoidStateType.Jumping then
			local max = char:GetAttribute("AirJumps") or 0
			if airJumpsUsed < max and hrp.AssemblyLinearVelocity.Y < 30 then
				airJumpsUsed += 1
				local v = hrp.AssemblyLinearVelocity
				hrp.AssemblyLinearVelocity = Vector3.new(v.X, hum.JumpPower * 1.05, v.Z)
				hum:ChangeState(Enum.HumanoidStateType.Jumping)
				-- огонёк из ранца
				local fx = Instance.new("Part")
				fx.Shape = Enum.PartType.Ball
				fx.Size = Vector3.new(1.4, 1.4, 1.4)
				fx.Material = Enum.Material.Neon
				fx.Color = Color3.fromRGB(255, 150, 60)
				fx.Anchored = true
				fx.CanCollide = false
				fx.CanQuery = false
				fx.CanTouch = false
				fx.CFrame = hrp.CFrame * CFrame.new(0, -1.5, 1)
				fx.Parent = workspace
				TweenService:Create(fx, TweenInfo.new(0.4), { Size = Vector3.new(0.1, 0.1, 0.1), Transparency = 1 }):Play()
				task.delay(0.45, function()
					fx:Destroy()
				end)
			end
		end
	end)

	local function onChar(char: Model)
		local hum = char:WaitForChild("Humanoid")
		airJumpsUsed = 0
		hum.StateChanged:Connect(function(_, new)
			if new == Enum.HumanoidStateType.Landed or new == Enum.HumanoidStateType.Running then
				airJumpsUsed = 0
			end
		end)
	end
	if player.Character then
		task.spawn(onChar, player.Character)
	end
	player.CharacterAdded:Connect(onChar)
end

function Effects.knockback(dir: Vector3)
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	local hum = char and char:FindFirstChildOfClass("Humanoid")
	if hrp and hum then
		hum:ChangeState(Enum.HumanoidStateType.Freefall)
		hrp.AssemblyLinearVelocity = dir * 70 + Vector3.new(0, 35, 0)
	end
end

----------------------------------------------------------------------
-- Воспоминания, если долго стоять без дела (как в оригинале)
----------------------------------------------------------------------
function Effects.idleMemories(getData)
	task.spawn(function()
		local lastPos = nil
		local idle = 0
		while true do
			task.wait(1)
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			if hrp then
				if lastPos and (hrp.Position - lastPos).Magnitude < 0.5 then
					idle += 1
				else
					idle = 0
				end
				lastPos = hrp.Position
				if idle == 25 then
					local data = getData()
					local pool = {}
					for _, m in Config.Memories do
						if data and data.memories and data.memories[m.id] then
							table.insert(pool, m)
						end
					end
					if #pool == 0 then
						pool = { { bubble = "👧❤️❓" } }
					end
					Effects.bubble(char, pool[math.random(1, #pool)].bubble, 6)
					idle = -40
				end
			end
		end
	end)
end

----------------------------------------------------------------------
-- Кат-сцены
----------------------------------------------------------------------
function Effects.arrest(UI)
	UI.fade(true, 0.5, "🎩🎩🎩  ➡️  🤖  ➡️  🔒")
	task.wait(2.2)
	UI.fade(false, 0.8)
end

function Effects.band()
	local mus = root.NPCs:FindFirstChild("Диджеридушник")
	local notes = { "🎵", "🎶", "🎷", "🥁" }
	for i = 1, 8 do
		if mus then
			Effects.bubble(mus, notes[(i - 1) % #notes + 1] .. notes[i % #notes + 1], 1.2)
		end
		task.wait(1.1)
	end
end

-- Финал: Братство падает в сток, Йозеф и Берта улетают на закат.
function Effects.ending(UI, data)
	local cam = workspace.CurrentCamera
	local tower = root:FindFirstChild("Tower")
	local drain = tower and tower:FindFirstChild("Drain")
	if not drain then
		return
	end
	local scene = Instance.new("Folder")
	scene.Name = "EndingScene"
	scene.Parent = workspace
	local base = drain.CFrame
	-- Братство
	local caps = {}
	for i, k in { "Leader", "Fat", "Thin" } do
		local m = Art.BlackCap(k)
		m:PivotTo(base * CFrame.new((i - 2) * 5, 0.2, 6) * CFrame.Angles(0, math.rad(180), 0))
		m.Parent = scene
		caps[i] = m
	end
	local oldType = cam.CameraType
	cam.CameraType = Enum.CameraType.Scriptable
	cam.CFrame = CFrame.lookAt(base.Position + Vector3.new(0, 14, 26), base.Position + Vector3.new(0, 2, 0))
	UI.fade(false, 0.3)
	for _, m in caps do
		Effects.bubble(m, "😱", 2)
	end
	task.wait(1.2)
	for i, m in caps do
		local start = m:GetPivot()
		task.spawn(function()
			for t = 0, 1, 0.04 do
				m:PivotTo(start:Lerp(base * CFrame.new(0, -1, 0), t) * CFrame.Angles(0, t * 6, 0))
				task.wait()
			end
			for t = 0, 1, 0.05 do
				m:PivotTo(base * CFrame.new(0, -1 - t * 15, 0) * CFrame.Angles(0, t * 12, 0))
				task.wait()
			end
			m:Destroy()
		end)
		task.wait(0.35 * i)
	end
	task.wait(2.5)
	-- летательный аппарат
	local craft = Instance.new("Model")
	craft.Name = "FlyingMachine"
	local O = CFrame.new()
	local seat = Art.part(craft, "Cyl", Vector3.new(6, 1.2, 6), O, C.Brass, Enum.Material.Metal, "Deck")
	craft.PrimaryPart = seat
	Art.part(craft, "Cyl", Vector3.new(0.4, 7, 0.4), O * CFrame.new(0, 4, 0), C.IronDark, Enum.Material.Metal, "Mast")
	local rotor = Art.part(craft, "Block", Vector3.new(12, 0.2, 0.8), O * CFrame.new(0, 7.6, 0), C.RustLight, Enum.Material.Wood, "Rotor")
	Art.part(craft, "Ball", Vector3.new(5, 5, 5), O * CFrame.new(0, 11, 0), Color3.fromRGB(200, 90, 70), Enum.Material.Fabric, "Balloon")
	local skin = Config.JosefSkins[1]
	for _, s in Config.JosefSkins do
		if s.id == data.skin then
			skin = s
		end
	end
	local j = Art.Josef(skin.body, skin.dark)
	j:PivotTo(O * CFrame.new(-1.3, 0.6, 0) * CFrame.Angles(0, math.rad(180), 0))
	j.Parent = craft
	local dressC = Config.BertaDresses[1].color
	for _, d in Config.BertaDresses do
		if d.id == data.dress then
			dressC = d.color
		end
	end
	local b = Art.Berta(dressC, data.berta and data.berta.love or 0)
	b:PivotTo(O * CFrame.new(1.4, 0.6, 0) * CFrame.Angles(0, math.rad(180), 0))
	b.Parent = craft
	for _, p in craft:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanCollide = false
		end
	end
	local startCf = base * CFrame.new(0, 3, -4)
	craft:PivotTo(startCf)
	craft.Parent = scene
	Effects.bubble(j, "🤖❤️👧", 3)
	Effects.bubble(b, "😊🌅", 3)
	-- «закат» — туда, где солнце
	local sunDir = game:GetService("Lighting"):GetSunDirection()
	local flat = Vector3.new(sunDir.X, 0, sunDir.Z)
	if flat.Magnitude < 0.1 then
		flat = Vector3.new(1, 0, 0)
	end
	flat = flat.Unit
	local t0 = os.clock()
	local conn
	conn = RunService.RenderStepped:Connect(function()
		local t = os.clock() - t0
		local pos = startCf.Position + flat * (t * t * 3 + t * 4) + Vector3.new(0, t * 5, 0)
		craft:PivotTo(CFrame.lookAt(pos, pos + flat) * CFrame.Angles(0, math.rad(90), 0))
		rotor.CFrame = craft:GetPivot() * CFrame.new(0, 7.6, 0) * CFrame.Angles(0, t * 20, 0)
		cam.CFrame = CFrame.lookAt(startCf.Position + Vector3.new(-flat.Z * 30, 18, flat.X * 30) - flat * 10, pos)
	end)
	task.wait(9)
	conn:Disconnect()
	UI.fade(true, 1, "")
	task.wait(1.2)
	scene:Destroy()
	cam.CameraType = oldType == Enum.CameraType.Scriptable and Enum.CameraType.Custom or oldType
	UI.fade(true, 0.1, "<b>КОНЕЦ</b>\n\nПо мотивам Machinarium (Amanita Design, 2009)\nРежиссёр оригинала — Якуб Дворский · Музыка — Floex\n\nФанатская игра для Roblox")
	task.wait(5)
	UI.fade(false, 1.5)
end

----------------------------------------------------------------------
-- детали могут появиться позже (стриминг, пересоздание) — применяем сюжет заново
local function queueReapply()
	if reapplyQueued or not lastStage then
		return
	end
	reapplyQueued = true
	task.delay(0.3, function()
		reapplyQueued = false
		Effects.applyStage(lastStage, lastData)
	end)
end

function Effects.Init()
	root = workspace:WaitForChild("Machinarium")
	CollectionService:GetInstanceAddedSignal("StageDoor"):Connect(queueReapply)
	CollectionService:GetInstanceAddedSignal("StageHide"):Connect(queueReapply)
	root:WaitForChild("NPCs").ChildAdded:Connect(queueReapply)
	ambientBubbles()
	animateWorld()
	setupMovement()
end

return Effects
