--!nonstrict
-- NPC: Братство Чёрной Шляпы (патруль), кот, Берта-компаньон,
-- движущиеся платформы, пресс на свалке.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")
local CollectionService = game:GetService("CollectionService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared.Config)
local Art = require(Shared.Art)

local NPC = {}
NPC.BlackCaps = {} :: { Model }
NPC.Bertas = {} :: { [Player]: Model }

local World
local hooks

local function flat(v: Vector3): Vector3
	return Vector3.new(v.X, 0, v.Z)
end

local function groundY(pos: Vector3, ignore: { Instance }): number?
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = ignore
	params.RespectCanCollide = true
	local hit = workspace:Raycast(pos + Vector3.new(0, 6, 0), Vector3.new(0, -40, 0), params)
	if hit then
		return hit.Position.Y
	end
	return nil
end

----------------------------------------------------------------------
-- Патруль Братства
----------------------------------------------------------------------
local function startPatrol(model: Model, path: { Vector3 }, speed: number)
	local idx = 1
	local pos = path[1]
	local bumpCooldown: { [Player]: number } = {}
	local t0 = math.random() * 10
	RunService.Heartbeat:Connect(function(dt)
		local target = path[idx]
		local delta = flat(target - pos)
		local dist = delta.Magnitude
		if dist < 0.5 then
			idx = idx % #path + 1
		else
			pos += delta.Unit * math.min(dist, speed * dt)
		end
		local bob = math.abs(math.sin((os.clock() + t0) * 6)) * 0.25
		local look = if dist > 0.01 then delta.Unit else Vector3.new(0, 0, -1)
		model:PivotTo(CFrame.lookAt(pos + Vector3.new(0, bob, 0), pos + Vector3.new(0, bob, 0) + look))
	end)
	-- проверка столкновений с игроками (5 раз в секунду)
	task.spawn(function()
		while model.Parent do
			task.wait(0.2)
			for _, plr in Players:GetPlayers() do
				local char = plr.Character
				local hrp = char and char:FindFirstChild("HumanoidRootPart")
				if hrp then
					local d = flat(hrp.Position - pos)
					if d.Magnitude < 4.2 and math.abs(hrp.Position.Y - pos.Y) < 8 then
						local now = os.clock()
						if (bumpCooldown[plr] or 0) < now then
							bumpCooldown[plr] = now + 3
							if hooks and hooks.onBump then
								hooks.onBump(plr, model, if d.Magnitude > 0.1 then d.Unit else Vector3.new(0, 0, 1))
							end
						end
					end
				end
			end
		end
	end)
end

----------------------------------------------------------------------
-- Кот гуляет по площади
----------------------------------------------------------------------
local function startCat()
	local cat: Model = World.NPC.Cat
	local path = World.NPC.CatPath
	if not cat or not path then
		return
	end
	local idx = 1
	local pos = path[1]
	local pause = 0
	RunService.Heartbeat:Connect(function(dt)
		if pause > 0 then
			pause -= dt
			return
		end
		local target = path[idx]
		local delta = flat(target - pos)
		if delta.Magnitude < 0.4 then
			idx = idx % #path + 1
			pause = 2 + math.random() * 3
			return
		end
		pos += delta.Unit * math.min(delta.Magnitude, 5 * dt)
		cat:PivotTo(CFrame.lookAt(pos, pos + delta.Unit))
	end)
end

----------------------------------------------------------------------
-- Берта-компаньон
----------------------------------------------------------------------
local function dressColor(id: string): Color3
	for _, d in Config.BertaDresses do
		if d.id == id then
			return d.color
		end
	end
	return Config.BertaDresses[1].color
end

function NPC.RemoveBerta(player: Player)
	local b = NPC.Bertas[player]
	if b then
		b:Destroy()
		NPC.Bertas[player] = nil
	end
end

function NPC.SpawnBerta(player: Player, data: any)
	local prev = NPC.Bertas[player]
	local prevCf = if prev then prev:GetPivot() else nil
	NPC.RemoveBerta(player)
	if not data.berta.rescued then
		return
	end
	local model = Art.Berta(dressColor(data.dress), data.berta.love)
	model.Name = "Berta_" .. player.UserId
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.CanCollide = false
			p.CanQuery = false
		end
	end
	model:SetAttribute("Owner", player.UserId)
	model:SetAttribute("Bubbles", "❤️|🤖❤️🤖|🍲😊|🌼")
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart")
	if prevCf then
		model:PivotTo(prevCf)
	elseif hrp then
		model:PivotTo(hrp.CFrame * CFrame.new(3, -3, 3))
	end
	-- табличка с именем
	local bb = Instance.new("BillboardGui")
	bb.Size = UDim2.fromOffset(160, 26)
	bb.StudsOffsetWorldSpace = Vector3.new(0, 7.2, 0)
	bb.AlwaysOnTop = false
	bb.MaxDistance = 60
	bb.Adornee = model.PrimaryPart
	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.fromScale(1, 1)
	tl.BackgroundTransparency = 1
	tl.Font = Enum.Font.FredokaOne
	tl.TextScaled = true
	tl.TextColor3 = Config.Colors.BertaPink
	tl.TextStrokeTransparency = 0.4
	tl.Text = "Берта ❤ " .. player.DisplayName
	tl.Parent = bb
	bb.Parent = model.PrimaryPart
	model.Parent = World.Root.NPCs
	NPC.Bertas[player] = model
end

function NPC.BertaPos(player: Player): Vector3?
	local b = NPC.Bertas[player]
	if b and b.PrimaryPart then
		return b.PrimaryPart.Position
	end
	return nil
end

local function startBertaLoop(getData)
	local t = 0
	RunService.Heartbeat:Connect(function(dt)
		t += dt
		if t < 1 / 20 then
			return
		end
		local step = t
		t = 0
		for player, model in NPC.Bertas do
			local char = player.Character
			local hrp = char and char:FindFirstChild("HumanoidRootPart")
			local data = getData(player)
			if hrp and model.Parent and data then
				local scale = char:GetScale()
				local goal = (hrp.CFrame * CFrame.new(3.5 * scale, 0, 4 * scale)).Position
				local cur = model:GetPivot()
				local curPos = cur.Position
				local dist = (flat(goal) - flat(curPos)).Magnitude
				local gy = groundY(goal, { char, model }) or (hrp.Position.Y - 3 * scale)
				if dist > 70 or math.abs(gy - curPos.Y) > 30 then
					model:PivotTo(CFrame.new(goal.X, gy, goal.Z) * hrp.CFrame.Rotation)
				elseif dist > 1.2 then
					local speed = 18 + 8 * (data.berta.wheels or 0)
					local move = math.min(dist, speed * step)
					local dir = (flat(goal) - flat(curPos)).Unit
					local np = curPos + dir * move
					local y = curPos.Y + (gy - curPos.Y) * math.min(1, step * 10)
					local hop = math.abs(math.sin(os.clock() * 12)) * 0.3
					model:PivotTo(CFrame.lookAt(Vector3.new(np.X, y + hop, np.Z), Vector3.new(np.X, y + hop, np.Z) + dir))
				else
					-- стоим рядом и смотрим туда же, куда Йозеф
					local look = flat(hrp.CFrame.LookVector)
					if look.Magnitude > 0.1 then
						model:PivotTo(CFrame.lookAt(curPos, curPos + look.Unit))
					end
				end
			end
		end
	end)
end

----------------------------------------------------------------------
-- Движущиеся платформы и пресс
----------------------------------------------------------------------
local function startMachines()
	task.spawn(function()
		local sign = 1
		while true do
			task.wait(2.6)
			sign = -sign
			for _, pr in CollectionService:GetTagged("Mover") do
				local r = pr:GetAttribute("Range") or 3
				pr.TargetPosition = r * sign
			end
		end
	end)
	for _, ram in CollectionService:GetTagged("Crusher") do
		local top = ram.CFrame
		local bottom = top - Vector3.new(0, (ram:GetAttribute("Top") or 16) - (ram:GetAttribute("Bottom") or 2.5), 0)
		CollectionService:AddTag(ram, "Kill")
		ram:SetAttribute("KillText", "Хрусь! Попал под пресс.")
		task.spawn(function()
			while ram.Parent do
				task.wait(2.5)
				local down = TweenService:Create(ram, TweenInfo.new(0.35, Enum.EasingStyle.Quad, Enum.EasingDirection.In), { CFrame = bottom })
				down:Play()
				down.Completed:Wait()
				task.wait(0.8)
				local up = TweenService:Create(ram, TweenInfo.new(1.6, Enum.EasingStyle.Sine), { CFrame = top })
				up:Play()
				up.Completed:Wait()
			end
		end)
	end
end

----------------------------------------------------------------------
function NPC.Init(world, h, getData)
	World = world
	hooks = h
	local paths = World.NPC.BlackCapPaths
	for _, kind in { "Leader", "Fat", "Thin" } do
		local m = Art.BlackCap(kind)
		m.Name = "BlackCap_" .. kind
		m:SetAttribute("Bubbles", if kind == "Leader" then "💣🗼😈|🎩🎩🎩|👧🔒🍳" elseif kind == "Fat" then "🍗😋|😈👊|🤖➡️🗑️" else "💰💰|😏|🔪🍎")
		m:SetAttribute("HideAtStage", Config.FinalStage)
		m:SetAttribute("BlackCap", true)
		m:PivotTo(CFrame.new(paths[kind][1]))
		m.Parent = World.Root.NPCs
		table.insert(NPC.BlackCaps, m)
		startPatrol(m, paths[kind], if kind == "Thin" then 7 elseif kind == "Fat" then 4.5 else 5.5)
	end
	startCat()
	startBertaLoop(getData)
	startMachines()
end

return NPC
