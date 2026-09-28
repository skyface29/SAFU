--!nonstrict
-- Josef: превращает стандартного R15-персонажа Roblox в Йозефа
-- (ржавый робот с головой-«пулей», большими глазами и люком в животе)
-- и управляет его главной способностью — вытягиваться и сжиматься.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared.Config)
local Art = require(Shared.Art)
local C = Config.Colors

local Josef = {}

local function findSkin(id: string)
	for _, s in Config.JosefSkins do
		if s.id == id then
			return s
		end
	end
	return Config.JosefSkins[1]
end

-- Строим детали во временной папке и привариваем к конечности.
local function attach(morph: Folder, limb: BasePart?, build: (Folder, CFrame) -> ())
	if not limb then
		return
	end
	local tmp = Instance.new("Folder")
	build(tmp, limb.CFrame)
	for _, p in tmp:GetChildren() do
		if p:IsA("BasePart") then
			p.Anchored = false
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
			p.Massless = true
			p.CastShadow = true
			local w = Instance.new("Weld")
			w.Part0 = limb
			w.Part1 = p
			w.C0 = limb.CFrame:ToObjectSpace(p.CFrame)
			w.C1 = CFrame.new()
			w.Parent = p
			p.Parent = morph
		else
			p.Parent = morph
		end
	end
	tmp:Destroy()
end

local function hideDefaultBody(character: Model)
	for _, d in character:GetDescendants() do
		if d:IsA("Accessory") or d:IsA("Shirt") or d:IsA("Pants") or d:IsA("ShirtGraphic") or d:IsA("BodyColors") then
			d:Destroy()
		elseif d:IsA("Decal") and d.Parent and d.Parent.Name == "Head" then
			d:Destroy()
		end
	end
	for _, p in character:GetChildren() do
		if p:IsA("BasePart") then
			p.Transparency = 1
		end
	end
end

-- data: профиль игрока (для скина, собранных частей и ракетного ранца)
function Josef.BuildMorph(character: Model, data: any)
	local old = character:FindFirstChild("JosefMorph")
	if old then
		old:Destroy()
	end
	hideDefaultBody(character)

	local skin = findSkin(data.skin)
	local body, dark = skin.body, skin.dark
	local mat = if skin.id == "chrome" or skin.id == "gold" then Enum.Material.Metal else Enum.Material.CorrodedMetal
	local darkMat = Enum.Material.Metal
	local parts = data.parts or {}

	local morph = Instance.new("Folder")
	morph.Name = "JosefMorph"
	morph.Parent = character

	local function limb(name: string): BasePart?
		local p = character:FindFirstChild(name)
		if p and p:IsA("BasePart") then
			return p
		end
		return nil
	end

	-- ГОЛОВА: цилиндр + купол, огромные глаза
	attach(morph, limb("Head"), function(f, cf)
		Art.part(f, "Cyl", Vector3.new(0.34, 0.8, 0.34), cf * CFrame.new(0, -0.65, 0), dark, darkMat, "Neck")
		Art.part(f, "Cyl", Vector3.new(1.6, 0.14, 1.6), cf * CFrame.new(0, -0.35, 0), dark, darkMat, "HeadRing")
		Art.part(f, "Cyl", Vector3.new(1.5, 1.15, 1.5), cf * CFrame.new(0, 0.22, 0), body, mat, "HeadCan")
		Art.part(f, "Ball", Vector3.new(1.5, 1.5, 1.5), cf * CFrame.new(0, 0.8, 0), body, mat, "HeadDome")
		Art.eyes(f, cf * CFrame.new(0, 0.35, 0), { size = 0.62, gap = 0.31, z = -0.76 })
		-- «рот»-решётка
		for i = -1, 1 do
			Art.part(f, "Block", Vector3.new(0.08, 0.2, 0.05), cf * CFrame.new(i * 0.14, -0.12, -0.76), C.Soot, nil, "Grill")
		end
		-- болтики по бокам головы
		for _, sx in { -1, 1 } do
			Art.part(f, "CylX", Vector3.new(0.14, 0.34, 0.34), cf * CFrame.new(sx * 0.78, 0.25, 0), C.Brass, Enum.Material.Metal, "EarBolt")
		end
		if parts.antenna then
			Art.part(f, "Cyl", Vector3.new(0.08, 0.9, 0.08), cf * CFrame.new(0.35, 1.7, 0.1) * CFrame.Angles(0, 0, math.rad(-12)), C.Brass, Enum.Material.Metal, "Antenna")
			Art.part(f, "Ball", Vector3.new(0.24, 0.24, 0.24), cf * CFrame.new(0.45, 2.15, 0.1), Color3.fromRGB(255, 120, 80), Enum.Material.Neon, "AntennaTip")
		end
		if skin.hat then
			Art.hat(f, cf * CFrame.new(0, 1.45, 0), skin.hat, 0.85)
		end
	end)

	-- Классический R6-персонаж: упрощённый Йозеф
	if not limb("UpperTorso") and limb("Torso") then
		attach(morph, limb("Torso"), function(f, cf)
			Art.part(f, "Cyl", Vector3.new(1.9, 1.9, 1.9), cf * CFrame.new(0, 0.05, 0), body, mat, "BodyCan")
			Art.part(f, "CylZ", Vector3.new(0.95, 0.95, 0.12), cf * CFrame.new(0, -0.1, -0.95), C.Brass, Enum.Material.Metal, "Hatch")
			Art.part(f, "CylZ", Vector3.new(0.72, 0.72, 0.12), cf * CFrame.new(0, -0.1, -1.0), Color3.fromRGB(50, 40, 34), Enum.Material.Metal, "HatchIn")
			Art.part(f, "Cyl", Vector3.new(0.3, 0.9, 0.3), cf * CFrame.new(0.45, 0.4, 0.95), dark, darkMat, "Exhaust")
		end)
		for _, side in { "Left", "Right" } do
			if side == "Right" or parts.arm then
				attach(morph, limb(side .. " Arm"), function(f, cf)
					Art.part(f, "Ball", Vector3.new(0.6, 0.6, 0.6), cf * CFrame.new(0, 0.7, 0), dark, darkMat, "Shoulder")
					Art.part(f, "Cyl", Vector3.new(0.34, 1.9, 0.34), cf, body, mat, "Arm")
					Art.part(f, "Block", Vector3.new(0.3, 0.5, 0.3), cf * CFrame.new(0, -1.05, 0), dark, darkMat, "Claw")
				end)
			end
			if side == "Right" or parts.leg then
				attach(morph, limb(side .. " Leg"), function(f, cf)
					Art.part(f, "Cyl", Vector3.new(0.36, 1.8, 0.36), cf * CFrame.new(0, 0.1, 0), body, mat, "Leg")
					Art.part(f, "Block", Vector3.new(0.85, 0.34, 1.25), cf * CFrame.new(0, -0.83, -0.15), dark, darkMat, "Foot")
				end)
			end
		end
		return
	end

	-- ТЕЛО-БАНКА с люком в животе
	attach(morph, limb("UpperTorso"), function(f, cf)
		Art.part(f, "Cyl", Vector3.new(1.9, 1.6, 1.9), cf * CFrame.new(0, -0.15, 0), body, mat, "BodyCan")
		Art.part(f, "Cyl", Vector3.new(1.4, 0.22, 1.4), cf * CFrame.new(0, 0.72, 0), dark, darkMat, "Collar")
		Art.part(f, "CylZ", Vector3.new(0.95, 0.95, 0.12), cf * CFrame.new(0, -0.25, -0.93), C.Brass, Enum.Material.Metal, "Hatch")
		Art.part(f, "CylZ", Vector3.new(0.72, 0.72, 0.12), cf * CFrame.new(0, -0.25, -0.98), Color3.fromRGB(50, 40, 34), Enum.Material.Metal, "HatchIn")
		Art.part(f, "Block", Vector3.new(0.12, 0.3, 0.12), cf * CFrame.new(0.42, -0.25, -1.02), C.Brass, Enum.Material.Metal, "HatchLatch")
		for i = -2, 2 do
			local a = i * 0.45
			Art.part(f, "Ball", Vector3.new(0.13, 0.13, 0.13), cf * CFrame.new(math.sin(a) * 0.95, 0.45, -math.cos(a) * 0.95), C.Brass, Enum.Material.Metal, "Rivet")
		end
		-- выхлопная трубка на спине
		Art.part(f, "Cyl", Vector3.new(0.3, 0.9, 0.3), cf * CFrame.new(0.45, 0.3, 0.95), dark, darkMat, "Exhaust")
		if (data.josef and data.josef.rocket or 0) > 0 then
			for _, sx in { -1, 1 } do
				Art.part(f, "Cyl", Vector3.new(0.5, 1.2, 0.5), cf * CFrame.new(sx * 0.45, -0.1, 1.1), Color3.fromRGB(180, 60, 50), Enum.Material.Metal, "Rocket")
				Art.part(f, "Cyl", Vector3.new(0.36, 0.2, 0.36), cf * CFrame.new(sx * 0.45, -0.75, 1.1), C.Soot, Enum.Material.Metal, "Nozzle")
			end
		end
	end)
	attach(morph, limb("LowerTorso"), function(f, cf)
		Art.part(f, "Cyl", Vector3.new(1.55, 0.55, 1.55), cf * CFrame.new(0, 0.05, 0), dark, darkMat, "Hips")
	end)

	-- РУКИ-трубочки (левой нет, пока не найдена на свалке)
	for _, side in { "Left", "Right" } do
		local visible = side == "Right" or parts.arm
		if visible then
			attach(morph, limb(side .. "UpperArm"), function(f, cf)
				Art.part(f, "Ball", Vector3.new(0.6, 0.6, 0.6), cf * CFrame.new(0, 0.4, 0), dark, darkMat, "Shoulder")
				Art.part(f, "Cyl", Vector3.new(0.34, 1.1, 0.34), cf, body, mat, "UpperArm")
			end)
			attach(morph, limb(side .. "LowerArm"), function(f, cf)
				Art.part(f, "Ball", Vector3.new(0.42, 0.42, 0.42), cf * CFrame.new(0, 0.45, 0), dark, darkMat, "Elbow")
				Art.part(f, "Cyl", Vector3.new(0.3, 1.0, 0.3), cf, body, mat, "LowerArm")
			end)
			attach(morph, limb(side .. "Hand"), function(f, cf)
				for _, sx in { -1, 1 } do
					Art.part(f, "Block", Vector3.new(0.14, 0.5, 0.3), cf * CFrame.new(sx * 0.13, -0.1, 0) * CFrame.Angles(0, 0, sx * math.rad(12)), dark, darkMat, "Claw")
				end
			end)
		end
	end

	-- НОГИ-палочки с круглыми ступнями (левая — пока не найдена)
	for _, side in { "Left", "Right" } do
		local visible = side == "Right" or parts.leg
		if visible then
			attach(morph, limb(side .. "UpperLeg"), function(f, cf)
				Art.part(f, "Cyl", Vector3.new(0.38, 1.2, 0.38), cf, body, mat, "UpperLeg")
			end)
			attach(morph, limb(side .. "LowerLeg"), function(f, cf)
				Art.part(f, "Ball", Vector3.new(0.5, 0.5, 0.5), cf * CFrame.new(0, 0.55, 0), dark, darkMat, "Knee")
				Art.part(f, "Cyl", Vector3.new(0.32, 1.2, 0.32), cf, body, mat, "LowerLeg")
			end)
			attach(morph, limb(side .. "Foot"), function(f, cf)
				Art.part(f, "Block", Vector3.new(0.85, 0.34, 1.25), cf * CFrame.new(0, -0.02, -0.15), dark, darkMat, "Foot")
			end)
		else
			-- временная «ходуля» вместо ноги
			attach(morph, limb(side .. "LowerLeg"), function(f, cf)
				Art.part(f, "Cyl", Vector3.new(0.16, 2.2, 0.16), cf * CFrame.new(0, -0.1, 0), C.IronDark, Enum.Material.Metal, "Stilt")
			end)
		end
	end
end

----------------------------------------------------------------------
-- Размер: normal / tall / small
----------------------------------------------------------------------
function Josef.TallScale(data: any): number
	return Config.Size.TallBase + Config.Size.TallPerLevel * (data.josef.stretch or 0)
end

function Josef.CurrentMode(character: Model): string
	return character:GetAttribute("SizeMode") or "normal"
end

local function roomAbove(character: Model, extra: number): boolean
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if not hrp then
		return false
	end
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	params.FilterDescendantsInstances = { character }
	for _, off in { Vector3.zero, Vector3.new(0.6, 0, 0), Vector3.new(-0.6, 0, 0), Vector3.new(0, 0, 0.6), Vector3.new(0, 0, -0.6) } do
		local hit = workspace:Raycast(hrp.Position + off, Vector3.new(0, extra, 0), params)
		if hit and hit.Instance.CanCollide then
			return false
		end
	end
	return true
end

-- Возвращает ok, причина
function Josef.SetSize(character: Model, data: any, mode: string): (boolean, string?)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid or humanoid.Health <= 0 then
		return false, "dead"
	end
	local target = Config.Size.Normal
	if mode == "tall" then
		target = Josef.TallScale(data)
	elseif mode == "small" then
		target = Config.Size.Small
	end
	local current = character:GetScale()
	if math.abs(current - target) < 0.01 then
		return true
	end
	if target > current then
		-- хватит ли места над головой?
		local height = 5.2
		if not roomAbove(character, height * (target - current) + 1) then
			return false, "noroom"
		end
	end
	local baseHip = character:GetAttribute("BaseHipHeight") or humanoid.HipHeight / current
	character:SetAttribute("BaseHipHeight", baseHip)
	character:ScaleTo(target)
	humanoid.HipHeight = baseHip * target
	character:SetAttribute("SizeMode", mode)
	-- немного поднимаем, чтобы не застрять в полу при росте
	local hrp = character:FindFirstChild("HumanoidRootPart")
	if hrp and target > current then
		hrp.CFrame += Vector3.new(0, (target - current) * 2.2, 0)
	end
	return true
end

function Josef.ApplyStats(character: Model, data: any)
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	if not humanoid then
		return
	end
	humanoid.UseJumpPower = true
	humanoid.WalkSpeed = 16 + 3 * (data.josef.speed or 0)
	humanoid.JumpPower = 50 + 7 * (data.josef.jump or 0)
	character:SetAttribute("AirJumps", data.josef.rocket or 0)
end

-- Перестроить внешний вид (после покупки скина / находки части тела)
function Josef.Refresh(character: Model, data: any)
	local scale = character:GetScale()
	if math.abs(scale - 1) > 0.01 then
		character:ScaleTo(1)
	end
	Josef.BuildMorph(character, data)
	if math.abs(scale - 1) > 0.01 then
		character:ScaleTo(scale)
	end
	Josef.ApplyStats(character, data)
end

return Josef
