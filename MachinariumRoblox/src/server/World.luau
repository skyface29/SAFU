--!nonstrict
-- World: процедурная постройка города Машинариум.
-- Свалка → Городская стена → Нижний город (тюрьма, оркестр) → канал →
-- Церковная площадь (фонтан, церковь с часами, паб, кухня Братства) →
-- Теплица → Великая Башня с паркуром и комнатой-головой наверху.

local CollectionService = game:GetService("CollectionService")
local Lighting = game:GetService("Lighting")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Machinarium")
local Config = require(Shared.Config)
local Art = require(Shared.Art)
local C = Config.Colors

local World = {}

local root: any
local rng = Random.new(2009)

World.Markers = {} :: { [string]: BasePart }
World.Teleports = {} :: { [string]: CFrame }
World.BoltSpots = {} :: { { pos: Vector3, big: boolean } }
World.NPC = {} :: { [string]: any }
World.Spawns = {} :: { [string]: CFrame }

----------------------------------------------------------------------
-- Помощники
----------------------------------------------------------------------
local function folder(name: string, parent: Instance): Folder
	local f = Instance.new("Folder")
	f.Name = name
	f.Parent = parent
	return f
end

local function box(parent: Instance, size: Vector3, cf: CFrame | Vector3, color: Color3, material: Enum.Material?, name: string?): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.Size = size
	p.CFrame = if typeof(cf) == "Vector3" then CFrame.new(cf) else cf
	p.Color = color
	p.Material = material or Enum.Material.Metal
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Name = name or "Part"
	p.Parent = parent
	return p
end

local function cyl(parent: Instance, d: number, h: number, cf: CFrame, color: Color3, material: Enum.Material?, name: string?): BasePart
	local p = Art.part(parent, "Cyl", Vector3.new(d, h, d), cf, color, material or Enum.Material.Metal, name)
	p.Anchored = true
	return p
end

local function ball(parent: Instance, d: number, cf: CFrame, color: Color3, material: Enum.Material?, name: string?): BasePart
	local p = Art.part(parent, "Ball", Vector3.new(d, d, d), cf, color, material or Enum.Material.Metal, name)
	p.Anchored = true
	return p
end

local function wedge(parent: Instance, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?): WedgePart
	local w = Instance.new("WedgePart")
	w.Anchored = true
	w.Size = size
	w.CFrame = cf
	w.Color = color
	w.Material = material or Enum.Material.Metal
	w.Parent = parent
	return w
end

local function truss(parent: Instance, height: number, pos: Vector3): TrussPart
	local t = Instance.new("TrussPart")
	t.Anchored = true
	t.Size = Vector3.new(2, height, 2)
	t.CFrame = CFrame.new(pos + Vector3.new(0, height / 2, 0))
	t.Color = C.IronDark
	t.Material = Enum.Material.Metal
	t.Parent = parent
	return t
end

local function marker(name: string, pos: Vector3)
	local p = box(root.Markers, Vector3.new(1, 1, 1), pos, C.Brass, Enum.Material.Neon, name)
	p.Transparency = 1
	p.CanCollide = false
	p.CanTouch = false
	p.CanQuery = false
	World.Markers[name] = p
	return p
end

local function prompt(parent: BasePart, action: string, actionText: string, objectText: string, attrs: { [string]: any }?, dist: number?, hold: number?)
	local pp = Instance.new("ProximityPrompt")
	pp.ActionText = actionText
	pp.ObjectText = objectText
	pp.MaxActivationDistance = dist or 10
	pp.HoldDuration = hold or 0
	pp.RequiresLineOfSight = false
	pp.KeyboardKeyCode = Enum.KeyCode.F
	pp:SetAttribute("Action", action)
	if attrs then
		for k, v in attrs do
			pp:SetAttribute(k, v)
		end
	end
	pp.Parent = parent
	return pp
end

local function light(parent: BasePart, range: number, brightness: number?, color: Color3?)
	local l = Instance.new("PointLight")
	l.Range = range
	l.Brightness = brightness or 1.2
	l.Color = color or C.WarmLight
	l.Shadows = false
	l.Parent = parent
	return l
end

local function bolt(pos: Vector3, big: boolean?)
	table.insert(World.BoltSpots, { pos = pos, big = big == true })
end

local function boltLine(a: Vector3, b: Vector3, n: number)
	for i = 0, n - 1 do
		local t = if n == 1 then 0.5 else i / (n - 1)
		bolt(a:Lerp(b, t))
	end
end

local function tag(inst: Instance, name: string)
	CollectionService:AddTag(inst, name)
end

-- Дверь, которая «открывается» у игрока локально, когда его сюжетная стадия >= stage
local function door(parent: Instance, size: Vector3, cf: CFrame, stage: number, label: string?)
	local d = box(parent, size, cf, C.RustDark, Enum.Material.DiamondPlate, "Door")
	d:SetAttribute("RequiredStage", stage)
	d:SetAttribute("Label", label or "")
	tag(d, "StageDoor")
	-- заклёпки/полосы
	for i = -1, 1, 2 do
		local s = box(parent, Vector3.new(size.X + 0.1, 0.4, size.Z + 0.1), cf * CFrame.new(0, i * size.Y * 0.3, 0), C.Iron, Enum.Material.Metal, "DoorBand")
		s:SetAttribute("RequiredStage", stage)
		s.CanCollide = false
		tag(s, "StageDoor")
	end
	return d
end

-- Инфо-терминал с фактом (старое радио на столбе)
local function factTerminal(id: string, pos: Vector3, rotY: number?)
	local m = Instance.new("Model")
	m.Name = "Fact_" .. id
	m.Parent = root.Facts
	local cf = CFrame.new(pos) * CFrame.Angles(0, math.rad(rotY or 0), 0)
	cyl(m, 0.4, 3, cf * CFrame.new(0, 1.5, 0), C.IronDark)
	local body = box(m, Vector3.new(2.2, 1.6, 1.2), cf * CFrame.new(0, 3.6, 0), C.RustLight, Enum.Material.Wood, "Radio")
	box(m, Vector3.new(1.2, 0.9, 0.1), cf * CFrame.new(-0.3, 3.6, -0.62), C.Soot, Enum.Material.Fabric)
	ball(m, 0.4, cf * CFrame.new(0.65, 3.8, -0.62), C.Brass)
	ball(m, 0.3, cf * CFrame.new(0.65, 3.3, -0.62), C.Brass)
	local lamp = ball(m, 0.4, cf * CFrame.new(0, 4.55, 0), Color3.fromRGB(120, 220, 255), Enum.Material.Neon, "Lamp")
	light(lamp, 8, 1, Color3.fromRGB(120, 220, 255))
	body:SetAttribute("FactId", id)
	tag(body, "FactTerminal")
	prompt(body, "Fact", "Послушать", "📻 Факт о Machinarium", { FactId = id }, 9)
	return body
end

-- Место воспоминания (скамейка со светящимся кругом)
local function memorySpot(id: string, pos: Vector3, rotY: number?)
	local m = Instance.new("Model")
	m.Name = "Memory_" .. id
	m.Parent = root.Memories
	local cf = CFrame.new(pos) * CFrame.Angles(0, math.rad(rotY or 0), 0)
	local seat = box(m, Vector3.new(5, 0.5, 1.6), cf * CFrame.new(0, 1.6, 0), C.RustLight, Enum.Material.Wood, "Bench")
	box(m, Vector3.new(5, 1.6, 0.3), cf * CFrame.new(0, 2.6, 0.7), C.RustLight, Enum.Material.Wood)
	for _, x in { -2, 2 } do
		box(m, Vector3.new(0.3, 1.6, 1.4), cf * CFrame.new(x, 0.8, 0), C.IronDark)
	end
	local glow = cyl(m, 8, 0.1, cf * CFrame.new(0, 0.06, -1.5), Color3.fromRGB(255, 200, 220), Enum.Material.Neon, "Glow")
	glow.Transparency = 0.6
	glow.CanCollide = false
	prompt(seat, "Memory", "Вспомнить", "💭 Воспоминание", { MemoryId = id }, 8)
	return seat
end

local function eggPrompt(part: BasePart, id: string, text: string)
	prompt(part, "Egg", "Осмотреть", text, { EggId = id }, 8)
	tag(part, "Egg")
	part:SetAttribute("EggId", id)
end

----------------------------------------------------------------------
-- Здания
----------------------------------------------------------------------
local houseColors = {
	Color3.fromRGB(150, 96, 60),
	Color3.fromRGB(128, 110, 86),
	Color3.fromRGB(170, 130, 90),
	Color3.fromRGB(110, 96, 80),
	Color3.fromRGB(142, 120, 100),
	Color3.fromRGB(120, 84, 56),
}

-- Дом: коробка с окнами, трубами, крышей. face — направление фасада (градусы по Y).
local function house(parent: Instance, pos: Vector3, w: number, d: number, h: number, face: number?, opts: any?)
	opts = opts or {}
	local m = Instance.new("Model")
	m.Name = opts.name or "House"
	m.Parent = parent
	local cf = CFrame.new(pos) * CFrame.Angles(0, math.rad(face or 0), 0)
	local col = opts.color or houseColors[rng:NextInteger(1, #houseColors)]
	box(m, Vector3.new(w, h, d), cf * CFrame.new(0, h / 2, 0), col, opts.material or Enum.Material.CorrodedMetal, "Walls")
	-- карниз
	box(m, Vector3.new(w + 1, 0.8, d + 1), cf * CFrame.new(0, h + 0.4, 0), C.RustDark, Enum.Material.Metal, "Roof")
	-- окна на фасаде (-Z) и сзади
	local floors = math.max(1, math.floor(h / 7))
	local cols = math.max(1, math.floor(w / 6))
	for f = 1, floors do
		for cIdx = 1, cols do
			local x = -w / 2 + (cIdx - 0.5) * (w / cols)
			local y = (f - 0.5) * (h / floors) + 1
			if not (f == 1 and cIdx == math.ceil(cols / 2) and opts.door ~= false) then
				local lit = rng:NextNumber() < 0.55
				local win = box(m, Vector3.new(2.2, 2.8, 0.2), cf * CFrame.new(x, y, -d / 2 - 0.1), if lit then C.WarmLight else Color3.fromRGB(40, 44, 48), if lit then Enum.Material.Neon else Enum.Material.Glass, "Window")
				win.CanCollide = false
				box(m, Vector3.new(2.8, 0.3, 0.5), cf * CFrame.new(x, y - 1.55, -d / 2 - 0.2), C.RustDark, Enum.Material.Metal, "Sill")
			end
		end
	end
	if opts.door ~= false then
		box(m, Vector3.new(3, 5, 0.3), cf * CFrame.new(0, 2.5, -d / 2 - 0.15), C.RustDark, Enum.Material.Wood, "FrontDoor")
	end
	-- трубы и дымоходы
	if opts.chimney ~= false then
		local chim = cyl(m, 1.4, 4, cf * CFrame.new(w * 0.3, h + 2.5, d * 0.2), C.IronDark, Enum.Material.Metal, "Chimney")
		if rng:NextNumber() < 0.5 then
			local smoke = Instance.new("ParticleEmitter")
			smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
			smoke.Rate = 2
			smoke.Lifetime = NumberRange.new(4, 6)
			smoke.Speed = NumberRange.new(2, 3)
			smoke.Size = NumberSequence.new(1, 5)
			smoke.Transparency = NumberSequence.new(0.6, 1)
			smoke.Color = ColorSequence.new(Color3.fromRGB(120, 110, 100))
			smoke.EmissionDirection = Enum.NormalId.Right
			smoke.Parent = chim
		end
	end
	-- водосточная труба сбоку
	cyl(m, 0.6, h, cf * CFrame.new(w / 2 + 0.4, h / 2, -d / 2 + 1), C.Iron, Enum.Material.Metal, "Pipe")
	return m, cf
end

----------------------------------------------------------------------
-- Освещение и атмосфера: тёплый ржавый закат
----------------------------------------------------------------------
local function setupLighting()
	Lighting.ClockTime = 17.4
	Lighting.GeographicLatitude = 30
	Lighting.Brightness = 2.2
	Lighting.Ambient = Color3.fromRGB(90, 70, 55)
	Lighting.OutdoorAmbient = Color3.fromRGB(150, 120, 90)
	Lighting.EnvironmentDiffuseScale = 0.5
	Lighting.EnvironmentSpecularScale = 0.6
	Lighting.GlobalShadows = true
	for _, c in Lighting:GetChildren() do
		if c:IsA("PostEffect") or c:IsA("Atmosphere") or c:IsA("Sky") then
			c:Destroy()
		end
	end
	local atm = Instance.new("Atmosphere")
	atm.Density = 0.36
	atm.Offset = 0.1
	atm.Color = Color3.fromRGB(210, 170, 120)
	atm.Decay = Color3.fromRGB(120, 80, 50)
	atm.Glare = 0.3
	atm.Haze = 1.6
	atm.Parent = Lighting
	local cc = Instance.new("ColorCorrectionEffect")
	cc.TintColor = Color3.fromRGB(255, 236, 205)
	cc.Saturation = -0.15
	cc.Contrast = 0.08
	cc.Brightness = 0.02
	cc.Parent = Lighting
	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.6
	bloom.Size = 30
	bloom.Threshold = 1.6
	bloom.Parent = Lighting
	local rays = Instance.new("SunRaysEffect")
	rays.Intensity = 0.06
	rays.Spread = 0.6
	rays.Parent = Lighting
end

----------------------------------------------------------------------
-- Земля и границы
----------------------------------------------------------------------
local function buildGround()
	local g = root.Ground
	box(g, Vector3.new(760, 4, 900), Vector3.new(0, -2, 20), Color3.fromRGB(96, 84, 70), Enum.Material.Concrete, "Baseplate")
	-- брусчатка площади
	box(g, Vector3.new(170, 0.4, 130), Vector3.new(0, 0.2, 30), Color3.fromRGB(128, 112, 92), Enum.Material.Cobblestone, "SquareFloor")
	-- улица Нижнего города
	box(g, Vector3.new(36, 0.4, 130), Vector3.new(0, 0.2, 172), Color3.fromRGB(110, 98, 84), Enum.Material.Cobblestone, "LowtownStreet")
	box(g, Vector3.new(200, 0.4, 24), Vector3.new(0, 0.2, 160), Color3.fromRGB(110, 98, 84), Enum.Material.Cobblestone, "LowtownCross")
	-- земля свалки
	box(g, Vector3.new(300, 0.4, 170), Vector3.new(0, 0.2, 335), Color3.fromRGB(92, 78, 60), Enum.Material.Ground, "JunkFloor")

	-- внешние стены города (x = ±230, z = -300..240)
	local walls = root.Walls
	local wallH = 46
	local function wallSeg(a: Vector3, b: Vector3)
		local mid = (a + b) / 2
		local len = (b - a).Magnitude
		local cf = CFrame.lookAt(mid, b) * CFrame.new(0, wallH / 2, 0)
		box(walls, Vector3.new(10, wallH, len), cf, Color3.fromRGB(120, 100, 80), Enum.Material.Brick, "CityWall")
		-- зубцы
		local n = math.floor(len / 8)
		for i = 0, n - 1 do
			box(walls, Vector3.new(10.4, 3, 4), cf * CFrame.new(0, wallH / 2 + 1.5, -len / 2 + 4 + i * 8), Color3.fromRGB(110, 90, 72), Enum.Material.Brick, "Crenel")
		end
	end
	wallSeg(Vector3.new(-230, 0, -300), Vector3.new(-230, 0, 240))
	wallSeg(Vector3.new(230, 0, -300), Vector3.new(230, 0, 240))
	wallSeg(Vector3.new(-230, 0, -300), Vector3.new(230, 0, -300))
	-- южная стена с воротами (разрыв x = -12..12)
	wallSeg(Vector3.new(-230, 0, 240), Vector3.new(-12, 0, 240))
	wallSeg(Vector3.new(12, 0, 240), Vector3.new(230, 0, 240))
	-- арка над воротами
	box(walls, Vector3.new(24, wallH - 22, 10), Vector3.new(0, 22 + (wallH - 22) / 2, 240), Color3.fromRGB(120, 100, 80), Enum.Material.Brick, "GateArch")
	-- площадка стражника на стене
	box(walls, Vector3.new(26, 1, 14), Vector3.new(0, wallH + 0.5, 240), C.IronDark, Enum.Material.DiamondPlate, "GuardDeck")
	-- угловые башенки
	for _, p in { Vector3.new(-230, 0, 240), Vector3.new(230, 0, 240), Vector3.new(-230, 0, -300), Vector3.new(230, 0, -300), Vector3.new(-20, 0, 240), Vector3.new(20, 0, 240) } do
		cyl(walls, 16, wallH + 10, CFrame.new(p + Vector3.new(0, (wallH + 10) / 2, 0)), Color3.fromRGB(112, 92, 74), Enum.Material.Brick, "WallTower")
		cyl(walls, 18, 2, CFrame.new(p + Vector3.new(0, wallH + 11, 0)), C.RustDark, Enum.Material.Metal)
		local roofC = 17
		for k = 0, 4 do
			cyl(walls, roofC - k * 3.4, 2, CFrame.new(p + Vector3.new(0, wallH + 13 + k * 2, 0)), C.Rust, Enum.Material.CorrodedMetal)
		end
	end

	-- силуэты дальнего города за стенами
	for i = 1, 70 do
		local ang = (i / 70) * math.pi * 2
		local r = rng:NextNumber(330, 420)
		local h = rng:NextNumber(60, 170)
		local pos = Vector3.new(math.cos(ang) * r, h / 2, math.sin(ang) * r + 20)
		local w = rng:NextNumber(20, 45)
		local p = box(root.Skyline, Vector3.new(w, h, w), CFrame.new(pos) * CFrame.Angles(0, ang, 0), Color3.fromRGB(80, 66, 56), Enum.Material.CorrodedMetal, "Silhouette")
		p.CastShadow = false
		if rng:NextNumber() < 0.5 then
			cyl(root.Skyline, 2, rng:NextNumber(15, 40), CFrame.new(pos + Vector3.new(0, h / 2 + 10, 0)), C.IronDark, Enum.Material.Metal).CastShadow = false
		end
		if rng:NextNumber() < 0.35 then
			ball(root.Skyline, w * 0.9, CFrame.new(pos + Vector3.new(0, h / 2, 0)), Color3.fromRGB(90, 72, 60), Enum.Material.CorrodedMetal).CastShadow = false
		end
	end
end

----------------------------------------------------------------------
-- 1. Свалка
----------------------------------------------------------------------
local function junkPile(parent: Instance, center: Vector3, radius: number, height: number, count: number)
	for _ = 1, count do
		local ang = rng:NextNumber(0, math.pi * 2)
		local r = rng:NextNumber(0, radius)
		local t = 1 - r / radius
		local pos = center + Vector3.new(math.cos(ang) * r, t * height * rng:NextNumber(0.4, 1), math.sin(ang) * r)
		local size = Vector3.new(rng:NextNumber(2, 7), rng:NextNumber(1, 4), rng:NextNumber(2, 7))
		local col = houseColors[rng:NextInteger(1, #houseColors)]:Lerp(C.RustDark, rng:NextNumber(0, 0.5))
		local kind = rng:NextInteger(1, 4)
		local cf = CFrame.new(pos) * CFrame.Angles(rng:NextNumber(-0.5, 0.5), rng:NextNumber(0, 6.28), rng:NextNumber(-0.5, 0.5))
		if kind == 1 then
			box(parent, size, cf, col, Enum.Material.CorrodedMetal, "Junk")
		elseif kind == 2 then
			cyl(parent, size.X * 0.6, size.Z, cf, col, Enum.Material.CorrodedMetal, "JunkPipe")
		elseif kind == 3 then
			wedge(parent, size, cf, col, Enum.Material.CorrodedMetal)
		else
			local tire = cyl(parent, size.X * 0.7, 1, cf, C.Soot, Enum.Material.Rubber, "JunkTire")
			tire.Size = Vector3.new(1, size.X * 0.7, size.X * 0.7)
		end
	end
end

local function buildJunkyard()
	local j = root.Junkyard
	-- забор свалки
	for _, x in { -150, 150 } do
		for z = 245, 410, 10 do
			box(j, Vector3.new(1, 12, 10), Vector3.new(x, 6, z), C.IronDark, Enum.Material.CorrodedMetal, "Fence")
		end
	end
	for x = -150, 150, 10 do
		box(j, Vector3.new(10, 12, 1), Vector3.new(x, 6, 412), C.IronDark, Enum.Material.CorrodedMetal, "Fence")
	end

	-- кучи мусора (декор)
	junkPile(j, Vector3.new(-90, 0, 330), 26, 14, 70)
	junkPile(j, Vector3.new(90, 0, 360), 24, 12, 60)
	junkPile(j, Vector3.new(-40, 0, 390), 16, 8, 35)
	junkPile(j, Vector3.new(110, 0, 280), 18, 10, 40)
	junkPile(j, Vector3.new(-120, 0, 275), 14, 8, 30)

	-- стартовая площадка (здесь Йозеф «очнулся»)
	local pad = cyl(j, 16, 0.6, CFrame.new(0, 0.3, 385), C.IronDark, Enum.Material.DiamondPlate, "WakePad")
	local spawn = Instance.new("SpawnLocation")
	spawn.Anchored = true
	spawn.Size = Vector3.new(6, 1, 6)
	spawn.CFrame = CFrame.new(0, 0.5, 385)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = j
	local _ = pad
	World.Spawns.junk = CFrame.new(0, 4, 385) * CFrame.Angles(0, 0, 0)
	World.Teleports.junk = World.Spawns.junk

	-- Кран с магнитом (на верху — АНТЕННА Йозефа)
	local craneBase = Vector3.new(60, 0, 320)
	box(j, Vector3.new(8, 2, 8), craneBase + Vector3.new(0, 1, 0), C.IronDark, Enum.Material.Metal, "CraneBase")
	truss(j, 36, craneBase + Vector3.new(4, 2, 0))
	box(j, Vector3.new(6, 1, 6), craneBase + Vector3.new(0, 36.5, 0), C.Rust, Enum.Material.DiamondPlate, "CraneCabin")
	box(j, Vector3.new(3, 1.5, 34), CFrame.new(craneBase + Vector3.new(0, 38, -15)), Color3.fromRGB(190, 140, 50), Enum.Material.Metal, "CraneArm")
	cyl(j, 0.3, 14, CFrame.new(craneBase + Vector3.new(0, 30, -30)), C.Soot, Enum.Material.Metal, "Rope")
	cyl(j, 6, 1.5, CFrame.new(craneBase + Vector3.new(0, 22.5, -30)), C.IronDark, Enum.Material.Metal, "Magnet")
	-- кабина крана
	box(j, Vector3.new(5, 4, 5), craneBase + Vector3.new(0, 39, 3), Color3.fromRGB(190, 140, 50), Enum.Material.Metal, "Cab")

	-- Пресс-дробилка (опасно!)
	local press = Vector3.new(-60, 0, 280)
	box(j, Vector3.new(14, 1, 14), press + Vector3.new(0, 0.5, 0), C.IronDark, Enum.Material.DiamondPlate, "PressFloor")
	for _, x in { -7, 7 } do
		box(j, Vector3.new(2, 20, 2), press + Vector3.new(x, 10, 0), C.Iron, Enum.Material.Metal, "PressPillar")
	end
	local ram = box(j, Vector3.new(12, 3, 12), press + Vector3.new(0, 16, 0), C.Rust, Enum.Material.CorrodedMetal, "PressRam")
	ram:SetAttribute("Bottom", press.Y + 2.5)
	ram:SetAttribute("Top", press.Y + 16)
	tag(ram, "Crusher")
	bolt(press + Vector3.new(0, 2, 0), true)

	-- Мини-паркур по мусору к ноге Йозефа (куча слева)
	local steps = {
		Vector3.new(-40, 3, 360),
		Vector3.new(-50, 6, 352),
		Vector3.new(-60, 9, 346),
		Vector3.new(-70, 12, 340),
		Vector3.new(-80, 15, 334),
		Vector3.new(-90, 18, 330),
	}
	for i, p in steps do
		local s = box(j, Vector3.new(6, 1.4, 6), CFrame.new(p) * CFrame.Angles(0, i * 0.4, 0), if i % 2 == 0 then C.Rust else C.IronDark, Enum.Material.CorrodedMetal, "JunkStep")
		local _ = s
		bolt(p + Vector3.new(0, 3, 0))
	end
	-- НОГА
	local leg = Art.part(j, "Cyl", Vector3.new(0.5, 2.6, 0.5), CFrame.new(-90, 20.5, 330) * CFrame.Angles(0, 0, math.rad(70)), C.Rust, Enum.Material.Metal, "JosefLeg")
	leg.Anchored = true
	light(leg, 10, 2, Color3.fromRGB(255, 220, 150))
	prompt(leg, "JosefPart", "Забрать", "🦿 Нога Йозефа", { PartId = "leg" }, 10)
	marker("Q1", Vector3.new(-90, 22, 330))

	-- РУКА в старой трубе
	local pipeCf = CFrame.new(95, 3, 300)
	local pipe = cyl(j, 7, 18, pipeCf * CFrame.Angles(math.rad(90), 0, 0), C.Iron, Enum.Material.CorrodedMetal, "BigPipe")
	pipe.CanCollide = false
	for k = -1, 1, 2 do
		cyl(j, 7.6, 0.6, pipeCf * CFrame.new(0, 0, k * 8.7) * CFrame.Angles(math.rad(90), 0, 0), C.RustDark, Enum.Material.Metal).CanCollide = false
	end
	box(j, Vector3.new(6, 0.5, 18), pipeCf * CFrame.new(0, -3.1, 0), C.IronDark, Enum.Material.Metal, "PipeFloor")
	local arm = Art.part(j, "Cyl", Vector3.new(0.4, 2.2, 0.4), CFrame.new(95, 1.2, 300) * CFrame.Angles(math.rad(90), 0, 0), C.Rust, Enum.Material.Metal, "JosefArm")
	arm.Anchored = true
	light(arm, 10, 2, Color3.fromRGB(255, 220, 150))
	prompt(arm, "JosefPart", "Забрать", "🦾 Рука Йозефа", { PartId = "arm" }, 10)

	-- АНТЕННА на кране
	local ant = Art.part(j, "Cyl", Vector3.new(0.15, 1.8, 0.15), CFrame.new(craneBase + Vector3.new(2.2, 38, -2.2)), C.Brass, Enum.Material.Metal, "JosefAntenna")
	ant.Anchored = true
	local tip = ball(j, 0.4, CFrame.new(craneBase + Vector3.new(2.2, 39, -2.2)), Color3.fromRGB(255, 120, 80), Enum.Material.Neon, "AntennaTip")
	light(tip, 12, 2)
	prompt(ant, "JosefPart", "Забрать", "📡 Антенна Йозефа", { PartId = "antenna" }, 10)
	boltLine(craneBase + Vector3.new(0, 40.5, -6), craneBase + Vector3.new(0, 40.5, -30), 7)

	-- Пасхалка: мухомор Amanita среди мусора
	local shroom = Art.Amanita(0.8)
	Art.place(shroom, CFrame.new(-125, 0.4, 395), j)
	eggPrompt(shroom.PrimaryPart, "amanita", "🍄 Мухомор")

	-- Пасхалка: вишенка Chuchel на высокой мусорной башне (по фермам)
	local tower = Vector3.new(125, 0, 395)
	truss(j, 30, tower + Vector3.new(4.5, 0, 0))
	box(j, Vector3.new(7, 1, 7), tower + Vector3.new(0, 28.5, 0), C.Rust, Enum.Material.CorrodedMetal, "CherryTop")
	local cherry = ball(j, 1.2, CFrame.new(tower + Vector3.new(0, 29.8, 0)), Color3.fromRGB(200, 20, 40), Enum.Material.SmoothPlastic, "Cherry")
	cyl(j, 0.1, 1.2, CFrame.new(tower + Vector3.new(0.2, 30.8, 0)) * CFrame.Angles(0, 0, 0.4), C.Moss, Enum.Material.SmoothPlastic)
	eggPrompt(cherry, "chuchel", "🍒 Вишенка")

	-- Воспоминание: купание — у масляной лужи
	local pool = cyl(j, 22, 0.3, CFrame.new(-10, 0.45, 300), C.Oil, Enum.Material.Glass, "OilPool")
	pool.Transparency = 0.1
	pool.Reflectance = 0.3
	memorySpot("m_swim", Vector3.new(-10, 0.4, 314), 180)

	factTerminal("f12", Vector3.new(12, 0.4, 372), 200)
	factTerminal("f01", Vector3.new(-18, 0.4, 372), 160)
	factTerminal("f27", Vector3.new(-118, 0.4, 390), 90)

	-- болты по свалке
	for _ = 1, 40 do
		bolt(Vector3.new(rng:NextNumber(-130, 130), 2, rng:NextNumber(262, 405)))
	end
	bolt(Vector3.new(95, 1.5, 306), true)
end

----------------------------------------------------------------------
-- 2. Ворота и стражник
----------------------------------------------------------------------
local function buildGate()
	local g = root.Gate
	-- створки ворот
	door(g, Vector3.new(24, 22, 2), CFrame.new(0, 11, 240), 3, "Ворота")
	-- стражник на стене
	local guard = Art.Guard()
	Art.place(guard, CFrame.new(0, 47, 238) * CFrame.Angles(0, math.rad(180), 0), g)
	guard.Parent = root.NPCs
	guard:SetAttribute("Bubbles", "💤|🔭👀|🚫🚪")
	World.NPC.Guard = guard
	-- переговорная труба у ворот (к ней подходим)
	local tube = cyl(g, 1.2, 6, CFrame.new(14, 3, 247), C.Brass, Enum.Material.Metal, "SpeakingTube")
	cyl(g, 2, 1.2, CFrame.new(14, 6.4, 246.4) * CFrame.Angles(math.rad(-60), 0, 0), C.Brass, Enum.Material.Metal)
	prompt(tube, "Guard", "Позвать стражника", "🗣️ Переговорная труба", nil, 10)
	marker("Q2", Vector3.new(14, 8, 247))
	World.Teleports.gate = CFrame.new(0, 4, 255) * CFrame.Angles(0, math.rad(0), 0)
	factTerminal("f10", Vector3.new(-16, 0.4, 250), 180)
	factTerminal("f07", Vector3.new(28, 0.4, 252), 200)
	-- высокие болты вдоль стены (для вытянутого Йозефа)
	boltLine(Vector3.new(-60, 9, 246), Vector3.new(-20, 9, 246), 6)
	boltLine(Vector3.new(20, 9, 246), Vector3.new(60, 9, 246), 6)
end

----------------------------------------------------------------------
-- 3. Нижний город, тюрьма, оркестр, крыши
----------------------------------------------------------------------
local function buildLowtown()
	local L = root.Lowtown
	-- дома вдоль главной улицы (x = ±18..) и поперечной
	local rowL = { { -34, 222, 20, 14, 18 }, { -34, 198, 18, 14, 24 }, { -32, 130, 22, 16, 20 } }
	local rowR = { { 34, 222, 20, 14, 22 }, { 34, 130, 20, 16, 16 } }
	for _, h in rowL do
		house(L, Vector3.new(h[1], 0, h[2]), h[3], h[4], h[5], -90)
	end
	for _, h in rowR do
		house(L, Vector3.new(h[1], 0, h[2]), h[3], h[4], h[5], 90)
	end
	-- дальние кварталы
	for i = 0, 5 do
		house(L, Vector3.new(-128 - (i % 2) * 40, 0, 205 - math.floor(i / 2) * 32), rng:NextNumber(18, 26), rng:NextNumber(16, 20), rng:NextNumber(16, 34), -90)
		house(L, Vector3.new(178 + (i % 2) * 30, 0, 205 - math.floor(i / 2) * 32), rng:NextNumber(18, 26), rng:NextNumber(16, 20), rng:NextNumber(16, 34), 90)
	end

	-- фонари вдоль улицы
	for z = 120, 230, 22 do
		for _, x in { -16, 16 } do
			cyl(L, 0.5, 10, CFrame.new(x, 5, z), C.IronDark, Enum.Material.Metal, "LampPost")
			local lamp = ball(L, 1.3, CFrame.new(x, 10.5, z), C.WarmLight, Enum.Material.Neon, "Lamp")
			light(lamp, 22, 1.2)
		end
	end

	-- арест-зона сразу за воротами
	local arrest = box(L, Vector3.new(30, 12, 8), Vector3.new(0, 6, 226), C.Brass, Enum.Material.Neon, "ArrestZone")
	arrest.Transparency = 1
	arrest.CanCollide = false
	tag(arrest, "ArrestZone")
	marker("Q3", Vector3.new(0, 5, 226))

	--------------------------------------------------------------
	-- ТЮРЬМА (x ≈ 100, z ≈ 178)
	--------------------------------------------------------------
	local P = Instance.new("Model")
	P.Name = "Prison"
	P.Parent = L
	local pc = Vector3.new(100, 0, 178)
	local stone = Color3.fromRGB(96, 92, 86)
	-- внешние стены тюрьмы 40x40, высота 20
	box(P, Vector3.new(40, 20, 2), pc + Vector3.new(0, 10, -20), stone, Enum.Material.Brick, "PWall")
	box(P, Vector3.new(40, 20, 2), pc + Vector3.new(0, 10, 20), stone, Enum.Material.Brick, "PWall")
	box(P, Vector3.new(2, 20, 40), pc + Vector3.new(-20, 10, 0), stone, Enum.Material.Brick, "PWall")
	-- восточная стена с отверстием вентиляции у пола (z от -2 до 2, высота 3.6)
	box(P, Vector3.new(2, 16.4, 40), pc + Vector3.new(20, 11.8, 0), stone, Enum.Material.Brick, "PWall")
	box(P, Vector3.new(2, 3.6, 18), pc + Vector3.new(20, 1.8, -11), stone, Enum.Material.Brick, "PWall")
	box(P, Vector3.new(2, 3.6, 18), pc + Vector3.new(20, 1.8, 11), stone, Enum.Material.Brick, "PWall")
	box(P, Vector3.new(42, 2, 42), pc + Vector3.new(0, 21, 0), C.IronDark, Enum.Material.Metal, "PRoof")
	box(P, Vector3.new(40, 0.4, 40), pc + Vector3.new(0, 0.2, 0), Color3.fromRGB(80, 76, 70), Enum.Material.Slate, "PFloor")
	-- решётка, делящая камеры (x = pc.X)
	for z = -19, 19, 2 do
		cyl(P, 0.4, 20, CFrame.new(pc + Vector3.new(0, 10, z)), C.IronDark, Enum.Material.Metal, "Bar")
	end
	-- решётчатое окно
	for y = 12, 16, 1 do
		box(P, Vector3.new(0.3, 0.3, 6), pc + Vector3.new(19.6, y, -8), C.IronDark)
	end
	local lampP = ball(P, 1, CFrame.new(pc + Vector3.new(10, 18, 0)), C.WarmLight, Enum.Material.Neon, "CellLamp")
	light(lampP, 30, 1.4)
	-- нары
	box(P, Vector3.new(8, 1, 4), pc + Vector3.new(14, 2, 16), C.RustLight, Enum.Material.Wood, "Bunk")
	World.Spawns.prison = CFrame.new(pc + Vector3.new(10, 3, 8)) * CFrame.Angles(0, math.rad(90), 0)
	marker("Q4", pc + Vector3.new(21, 2, 0))
	factTerminal("f11", pc + Vector3.new(15, 0.4, -15), 30)
	-- заключённые в соседней камере
	local kinds = { "fat", "skinny", "smoker" }
	for i, k in kinds do
		local pr = Art.Prisoner(k)
		Art.place(pr, CFrame.new(pc + Vector3.new(-10, 0.4, -12 + i * 7)) * CFrame.Angles(0, math.rad(-90), 0), root.NPCs)
		pr:SetAttribute("Bubbles", if k == "smoker" then "🚬💨|🤏➡️🕳️" elseif k == "fat" then "🍔❓|😴" else "🗝️❌|⬇️🤏 🕳️➡️")
	end
	-- вентиляционный тоннель: высота 3.4 — пройти можно только сжавшись
	local vent = Vector3.new(pc.X + 21, 0, pc.Z)
	box(P, Vector3.new(34, 0.4, 4), vent + Vector3.new(17, 0.2, 0), C.IronDark, Enum.Material.DiamondPlate, "VentFloor")
	box(P, Vector3.new(34, 0.6, 4), vent + Vector3.new(17, 3.7, 0), C.Iron, Enum.Material.Metal, "VentRoof")
	box(P, Vector3.new(34, 4, 0.6), vent + Vector3.new(17, 2, -2.3), C.Iron, Enum.Material.Metal, "VentWall")
	box(P, Vector3.new(34, 4, 0.6), vent + Vector3.new(17, 2, 2.3), C.Iron, Enum.Material.Metal, "VentWall")
	boltLine(vent + Vector3.new(3, 1.2, 0), vent + Vector3.new(30, 1.2, 0), 8)
	-- выход из вентиляции
	local exitZone = box(P, Vector3.new(6, 8, 8), vent + Vector3.new(38, 4, 0), C.Brass, Enum.Material.Neon, "PrisonExit")
	exitZone.Transparency = 1
	exitZone.CanCollide = false
	tag(exitZone, "PrisonExit")
	-- вывеска
	box(P, Vector3.new(12, 3, 0.4), pc + Vector3.new(0, 17, -20.3), C.Soot, Enum.Material.Metal, "Sign")

	--------------------------------------------------------------
	-- ОРКЕСТР (сцена у x = -60, z = 160)
	--------------------------------------------------------------
	local stage = cyl(L, 20, 1.2, CFrame.new(-62, 0.6, 162), C.RustLight, Enum.Material.WoodPlanks, "BandStage")
	local _ = stage
	local band = { "didgeridoo", "drum", "sax" }
	for i, k in band do
		local mus = Art.Musician(k)
		Art.place(mus, CFrame.new(-66, 1.2, 156 + i * 4) * CFrame.Angles(0, math.rad(-90 + (i - 2) * 15), 0), root.NPCs)
		mus:SetAttribute("Bubbles", if k == "didgeridoo" then "🎵❌|🐈➡️🎺✨" elseif k == "drum" then "🥁😢|🎶❓" else "🎷😴|🎵➡️🐈")
		if k == "didgeridoo" then
			World.NPC.Didgeridoo = mus
			prompt(mus.PrimaryPart, "Band", "Отдать кота", "🎶 Уличный оркестр", nil, 12)
			marker("Q5", mus.PrimaryPart.Position + Vector3.new(0, 5, 0))
		end
	end
	-- колонки и гирлянда
	for _, x in { -74, -50 } do
		box(L, Vector3.new(3, 5, 3), Vector3.new(x, 2.5, 168), C.Soot, Enum.Material.Fabric, "Speaker")
	end
	for i = 0, 10 do
		local bulb = ball(L, 0.6, CFrame.new(-74 + i * 2.4, 9 + math.sin(i / 10 * math.pi) * -1.5, 170), if i % 2 == 0 then C.WarmLight else Color3.fromRGB(255, 120, 90), Enum.Material.Neon, "Garland")
		bulb.CanCollide = false
	end
	factTerminal("f23", Vector3.new(-48, 0.4, 150), 200)
	factTerminal("f04", Vector3.new(-76, 0.4, 150), 160)

	--------------------------------------------------------------
	-- ПАРКУР ПО КРЫШАМ → гномик из Samorost
	--------------------------------------------------------------
	truss(L, 20, Vector3.new(-24.5, 0, 222))
	local roofPath = {
		Vector3.new(-34, 18.4, 222), -- крыша дома 1 (высота 18)
		Vector3.new(-34, 24.4, 198), -- дом 2
	}
	local _ = roofPath
	-- мостки между крышами
	box(L, Vector3.new(3, 0.6, 8), Vector3.new(-34, 21.5, 211), C.RustLight, Enum.Material.WoodPlanks, "Plank")
	-- трубы-перекладины к водонапорной башне
	local tankPos = Vector3.new(-60, 0, 196)
	for _, dx in { -4, 4 } do
		for _, dz in { -4, 4 } do
			cyl(L, 1, 30, CFrame.new(tankPos + Vector3.new(dx, 15, dz)), C.IronDark, Enum.Material.Metal, "TankLeg")
		end
	end
	cyl(L, 14, 10, CFrame.new(tankPos + Vector3.new(0, 35, 0)), C.Rust, Enum.Material.CorrodedMetal, "WaterTank")
	for k = 0, 3 do
		cyl(L, 14 - k * 3.5, 1.5, CFrame.new(tankPos + Vector3.new(0, 40.7 + k * 1.4, 0)), C.RustDark, Enum.Material.Metal)
	end
	box(L, Vector3.new(24, 0.6, 24), tankPos + Vector3.new(0, 29.7, 0), C.IronDark, Enum.Material.DiamondPlate, "TankDeck")
	local hops = {
		Vector3.new(-44.5, 27.5, 198),
	}
	for _, h in hops do
		box(L, Vector3.new(4, 0.8, 4), h, C.Brass, Enum.Material.Metal, "Hop")
		bolt(h + Vector3.new(0, 2.5, 0))
	end
	-- от бака — трубы к высокой крыше гнома
	local gnomeRoof = Vector3.new(-100, 0, 173)
	house(L, gnomeRoof, 20, 18, 44, 90, { chimney = false })
	for i = 1, 6 do
		local p = Vector3.new(-66, 30, 190):Lerp(Vector3.new(-92, 44, 176), i / 7)
		box(L, Vector3.new(3.6, 0.8, 3.6), p, if i % 2 == 0 then C.RustLight else C.Brass, Enum.Material.Metal, "PipeHop")
		bolt(p + Vector3.new(0, 2.5, 0))
	end
	local gnome = Art.Gnome()
	Art.place(gnome, CFrame.new(gnomeRoof + Vector3.new(0, 44.8, 0)) * CFrame.Angles(0, math.rad(90), 0), L)
	eggPrompt(gnome.PrimaryPart, "samorost", "👶 Гномик")
	memorySpot("m_sit", gnomeRoof + Vector3.new(4, 44.8, 5), 90)
	bolt(gnomeRoof + Vector3.new(-5, 47, -5), true)

	-- лаз Creaks под баком: только сжавшись (высота 3)
	local crawl = tankPos + Vector3.new(-14, 0, 0)
	box(L, Vector3.new(10, 3, 4), crawl + Vector3.new(0, 4.5, 0), Color3.fromRGB(80, 74, 66), Enum.Material.Brick, "CrawlTop")
	box(L, Vector3.new(10, 6, 1), crawl + Vector3.new(0, 3, -2.5), Color3.fromRGB(80, 74, 66), Enum.Material.Brick, "CrawlWall")
	box(L, Vector3.new(10, 6, 1), crawl + Vector3.new(0, 3, 2.5), Color3.fromRGB(80, 74, 66), Enum.Material.Brick, "CrawlWall")
	box(L, Vector3.new(1, 6, 6), crawl + Vector3.new(-5.5, 3, 0), Color3.fromRGB(80, 74, 66), Enum.Material.Brick, "CrawlEnd")
	local creakDoor = box(L, Vector3.new(0.3, 2.4, 1.6), crawl + Vector3.new(-4.8, 1.3, 0), Color3.fromRGB(60, 40, 30), Enum.Material.WoodPlanks, "CreakDoor")
	eggPrompt(creakDoor, "creaks", "🚪 Скрипучая дверца")

	-- болты по улицам
	boltLine(Vector3.new(0, 2, 225), Vector3.new(0, 2, 118), 18)
	boltLine(Vector3.new(-90, 2, 160), Vector3.new(90, 2, 160), 16)
	factTerminal("f09", Vector3.new(14, 0.4, 190), -90)
	factTerminal("f30", Vector3.new(-14, 0.4, 140), 90)
	factTerminal("f02", Vector3.new(60, 0.4, 150), 180)
	World.Teleports.lowtown = CFrame.new(0, 4, 170)

	-- Полицейский и робопёс без батарейки (атмосфера)
	local cop = Art.Policeman()
	Art.place(cop, CFrame.new(20, 0.4, 118) * CFrame.Angles(0, math.rad(200), 0), root.NPCs)
	cop:SetAttribute("Bubbles", "🔋❓🐕|👮😠🎩")
	local dog = Art.RoboDog()
	Art.place(dog, CFrame.new(24, 0.4, 116) * CFrame.Angles(0, math.rad(160), 0), root.NPCs)
	dog:SetAttribute("Bubbles", "🔋🪫|🦴❓")
end

----------------------------------------------------------------------
-- 4. Канал с маслом и мост
----------------------------------------------------------------------
local function buildCanal()
	local K = root.Canal
	local oil = box(K, Vector3.new(440, 1, 14), Vector3.new(0, -0.4, 100), C.Oil, Enum.Material.Glass, "OilCanal")
	oil.Transparency = 0.05
	oil.Reflectance = 0.25
	oil.CanCollide = false
	tag(oil, "Kill")
	oil:SetAttribute("KillText", "Бульк! Йозеф упал в масло.")
	-- набережные (скрывают землю под каналом)
	for _, z in { 92.5, 107.5 } do
		for _, sx in { -1, 1 } do
			box(K, Vector3.new(208, 1.2, 1), Vector3.new(sx * 116, 0.6, z), Color3.fromRGB(110, 100, 88), Enum.Material.Brick, "Embankment")
		end
	end
	-- главный мост
	box(K, Vector3.new(24, 1, 18), Vector3.new(0, 0.5, 100), C.RustLight, Enum.Material.WoodPlanks, "Bridge")
	for _, x in { -12, 12 } do
		box(K, Vector3.new(0.6, 3, 18), Vector3.new(x, 2, 100), C.IronDark, Enum.Material.Metal, "Rail")
	end
	-- паяльная мастерская у моста (декор) и факты
	house(K, Vector3.new(-50, 0, 80), 16, 12, 12, 0, { name = "SolderingWorks" })
	factTerminal("f21", Vector3.new(18, 0.4, 88), 180)
	-- мостик-прыжки через канал (паркур)
	for i = 0, 3 do
		box(K, Vector3.new(3, 0.8, 3), Vector3.new(60 + i * 0.5, 1.2, 93 + i * 4.5), C.Brass, Enum.Material.Metal, "Stone")
		bolt(Vector3.new(60 + i * 0.5, 3.5, 93 + i * 4.5))
	end
end

----------------------------------------------------------------------
-- 5. Церковная площадь: фонтан, церковь с часами, паб, кухня Братства
----------------------------------------------------------------------
local function buildSquare()
	local S = root.Square
	local fc = Vector3.new(0, 0, 40)
	-- фонтан
	cyl(S, 26, 2, CFrame.new(fc + Vector3.new(0, 1, 0)), Color3.fromRGB(140, 128, 110), Enum.Material.Cobblestone, "FountainRim")
	local water = cyl(S, 23, 0.4, CFrame.new(fc + Vector3.new(0, 1.9, 0)), Color3.fromRGB(70, 110, 110), Enum.Material.Glass, "FountainWater")
	water.Transparency = 0.3
	cyl(S, 3, 8, CFrame.new(fc + Vector3.new(0, 5, 0)), C.Iron, Enum.Material.Metal, "FountainPillar")
	cyl(S, 9, 1, CFrame.new(fc + Vector3.new(0, 9, 0)), C.Brass, Enum.Material.Metal, "FountainBowl")
	-- робот-статуя на фонтане
	local statue = Art.Josef(C.Brass, Color3.fromRGB(150, 120, 60))
	Art.place(statue, CFrame.new(fc + Vector3.new(0, 9.5, 0)) * CFrame.Angles(0, math.rad(180), 0), S)
	local spray = Instance.new("ParticleEmitter")
	spray.Rate = 40
	spray.Speed = NumberRange.new(8, 11)
	spray.SpreadAngle = Vector2.new(20, 20)
	spray.Lifetime = NumberRange.new(1, 1.4)
	spray.Acceleration = Vector3.new(0, -30, 0)
	spray.Size = NumberSequence.new(0.4, 0.1)
	spray.Color = ColorSequence.new(Color3.fromRGB(200, 230, 230))
	spray.Transparency = NumberSequence.new(0.2, 1)
	spray.Parent = water
	World.Teleports.square = CFrame.new(0, 4, 62)
	World.Spawns.square = CFrame.new(0, 4, 62)

	-- ЦЕРКОВЬ (x = -95), фасад смотрит на восток
	local church = Instance.new("Model")
	church.Name = "Church"
	church.Parent = S
	local cc = Vector3.new(-100, 0, 40)
	box(church, Vector3.new(30, 34, 40), cc + Vector3.new(0, 17, 0), Color3.fromRGB(140, 126, 106), Enum.Material.Brick, "Nave")
	for k = 0, 5 do
		box(church, Vector3.new(30 - k * 5, 3, 42), cc + Vector3.new(0, 35.5 + k * 3, 0), C.Rust, Enum.Material.CorrodedMetal, "Roof")
	end
	-- колокольня с часами
	local belfry = cc + Vector3.new(10, 0, 0)
	box(church, Vector3.new(12, 60, 12), belfry + Vector3.new(0, 30, 0), Color3.fromRGB(130, 116, 98), Enum.Material.Brick, "Belfry")
	for k = 0, 5 do
		cyl(church, 13 - k * 2.2, 3, CFrame.new(belfry + Vector3.new(0, 61.5 + k * 3, 0)), C.Rust, Enum.Material.CorrodedMetal)
	end
	local clockCf = CFrame.new(belfry + Vector3.new(6.1, 46, 0)) * CFrame.Angles(0, math.rad(90), 0)
	Art.part(church, "CylZ", Vector3.new(9, 9, 0.3), clockCf, C.Paper, Enum.Material.SmoothPlastic, "ClockFace").Anchored = true
	for h = 0, 11 do
		local a = h / 12 * math.pi * 2
		box(church, Vector3.new(0.3, 0.9, 0.2), clockCf * CFrame.new(math.sin(a) * 3.8, math.cos(a) * 3.8, -0.25) * CFrame.Angles(0, 0, -a), C.Soot, Enum.Material.Metal, "Tick")
	end
	local hand = box(church, Vector3.new(0.4, 3.4, 0.2), clockCf * CFrame.new(0, 1.5, -0.35), C.Soot, Enum.Material.Metal, "HourHand")
	hand:SetAttribute("Pivot", clockCf * CFrame.new(0, 0, -0.35))
	tag(hand, "ClockHand")
	box(church, Vector3.new(0.4, 2.2, 0.2), clockCf * CFrame.new(0, 1.0, -0.3) * CFrame.Angles(0, 0, math.rad(-90)) * CFrame.new(0, 0, 0), C.RustDark, Enum.Material.Metal, "MinuteHand")
	-- заводная ручка часов у двери
	local crank = box(church, Vector3.new(0.4, 0.4, 2.4), CFrame.new(cc + Vector3.new(15.6, 4, 7)), C.Brass, Enum.Material.Metal, "Crank")
	cyl(church, 0.9, 0.5, CFrame.new(cc + Vector3.new(15.6, 4, 8.4)), C.Brass, Enum.Material.Metal)
	prompt(crank, "Crank", "Крутить", "⚙️ Ручка часов", nil, 8)
	-- двери церкви
	box(church, Vector3.new(0.5, 12, 8), cc + Vector3.new(15.2, 6, 0), C.RustDark, Enum.Material.Wood, "ChurchDoor")
	-- витраж-розетка
	Art.part(church, "CylZ", Vector3.new(8, 8, 0.3), CFrame.new(cc + Vector3.new(15.2, 22, 0)) * CFrame.Angles(0, math.rad(90), 0), Color3.fromRGB(220, 150, 90), Enum.Material.Neon, "RoseWindow").Anchored = true
	-- табличка Чапека (пасхалка)
	local plaque = box(S, Vector3.new(4, 2.6, 0.3), CFrame.new(cc + Vector3.new(15.5, 4, -9)) * CFrame.Angles(0, math.rad(90), 0), C.Brass, Enum.Material.Metal, "CapekPlaque")
	local sg = Instance.new("SurfaceGui")
	sg.Face = Enum.NormalId.Front
	sg.CanvasSize = Vector2.new(400, 260)
	sg.Parent = plaque
	local tl = Instance.new("TextLabel")
	tl.Size = UDim2.fromScale(1, 1)
	tl.BackgroundTransparency = 1
	tl.TextScaled = true
	tl.Font = Enum.Font.Antique
	tl.TextColor3 = C.Soot
	tl.Text = "R.U.R.\n1920\nJosef & Karel Čapek"
	tl.Parent = sg
	eggPrompt(plaque, "capek", "🪧 Памятная табличка")
	factTerminal("f08", cc + Vector3.new(20, 0.4, -16), 90)
	factTerminal("f03", cc + Vector3.new(20, 0.4, 18), 90)

	--------------------------------------------------------------
	-- ПАБ (x = 100), вход с запада
	--------------------------------------------------------------
	local pub = Instance.new("Model")
	pub.Name = "Pub"
	pub.Parent = S
	local pb = Vector3.new(100, 0, 30)
	local pw, pd, ph = 34, 30, 16
	local wallCol = Color3.fromRGB(130, 90, 60)
	-- стены с проёмом входа на западе (z от -3 до 3)
	box(pub, Vector3.new(pw, ph, 1), pb + Vector3.new(0, ph / 2, -pd / 2), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(pw, ph, 1), pb + Vector3.new(0, ph / 2, pd / 2), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(1, ph, pd), pb + Vector3.new(pw / 2, ph / 2, 0), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(1, ph, (pd - 8) / 2), pb + Vector3.new(-pw / 2, ph / 2, -(pd + 8) / 4), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(1, ph, (pd - 8) / 2), pb + Vector3.new(-pw / 2, ph / 2, (pd + 8) / 4), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(1, ph - 9, 8), pb + Vector3.new(-pw / 2, 9 + (ph - 9) / 2, 0), wallCol, Enum.Material.WoodPlanks, "Wall")
	box(pub, Vector3.new(pw + 2, 1, pd + 2), pb + Vector3.new(0, ph + 0.5, 0), C.RustDark, Enum.Material.CorrodedMetal, "PubRoof")
	box(pub, Vector3.new(pw, 0.4, pd), pb + Vector3.new(0, 0.3, 0), Color3.fromRGB(110, 70, 45), Enum.Material.WoodPlanks, "PubFloor")
	-- вывеска «PUB» со стаканом
	local sign = box(pub, Vector3.new(0.4, 4, 10), pb + Vector3.new(-pw / 2 - 0.6, 12, 0), C.Soot, Enum.Material.Metal, "PubSign")
	local sgui = Instance.new("SurfaceGui")
	sgui.Face = Enum.NormalId.Left
	sgui.Parent = sign
	local st = Instance.new("TextLabel")
	st.Size = UDim2.fromScale(1, 1)
	st.BackgroundTransparency = 1
	st.TextScaled = true
	st.Font = Enum.Font.Fondamento
	st.TextColor3 = C.WarmLight
	st.Text = "🍺 PUB"
	st.Parent = sgui
	-- стойка, бармен, лампы
	box(pub, Vector3.new(3, 4, 18), pb + Vector3.new(12, 2, 0), C.RustDark, Enum.Material.Wood, "Bar")
	local barman = Art.Barman()
	Art.place(barman, CFrame.new(pb + Vector3.new(15, 0.4, 0)) * CFrame.Angles(0, math.rad(90), 0), root.NPCs)
	barman:SetAttribute("Bubbles", "🍺🛢️|🎩🎩🎩➡️🚪🔒|🧹")
	for _, z in { -8, 8 } do
		local l = ball(pub, 1.2, CFrame.new(pb + Vector3.new(0, 13, z)), C.WarmLight, Enum.Material.Neon, "PubLamp")
		light(l, 24, 1.5)
	end
	-- стол для «пяти в ряд»
	local tableCf = CFrame.new(pb + Vector3.new(-4, 0, -6))
	box(pub, Vector3.new(5, 0.4, 5), tableCf * CFrame.new(0, 3, 0), C.RustLight, Enum.Material.Wood, "GameTable")
	cyl(pub, 0.6, 3, tableCf * CFrame.new(0, 1.5, 0), C.RustDark, Enum.Material.Wood)
	box(pub, Vector3.new(4, 0.1, 4), tableCf * CFrame.new(0, 3.25, 0), C.Paper, Enum.Material.SmoothPlastic, "Board")
	local gbot = Art.GomokuBot()
	Art.place(gbot, tableCf * CFrame.new(0, 0.4, -4.5) * CFrame.Angles(0, math.pi, 0), root.NPCs)
	gbot:SetAttribute("Bubbles", "⚫⚪❓|🏆😎|5️⃣➡️🏁")
	prompt(gbot.PrimaryPart, "Gomoku", "Сыграть", "⚫⚪ Пять в ряд", nil, 10)
	marker("Q6", tableCf.Position + Vector3.new(0, 6, 0))
	factTerminal("f13", pb + Vector3.new(-10, 0.4, 10), 90)
	factTerminal("f20", pb + Vector3.new(4, 0.4, 12), 180)
	World.Teleports.pub = CFrame.new(pb + Vector3.new(-24, 4, 0)) * CFrame.Angles(0, math.rad(-90), 0)
	-- пластинка Floex на крыше паба (залезть по ферме сзади)
	truss(pub, ph + 2, pb + Vector3.new(pw / 2 + 2, 0, -10))
	local vinyl = cyl(pub, 3, 0.15, CFrame.new(pb + Vector3.new(6, ph + 1.1, -6)), C.Soot, Enum.Material.SmoothPlastic, "Vinyl")
	cyl(pub, 1, 0.17, CFrame.new(pb + Vector3.new(6, ph + 1.12, -6)), Color3.fromRGB(200, 60, 50), Enum.Material.SmoothPlastic)
	eggPrompt(vinyl, "floex", "💿 Пластинка")
	bolt(pb + Vector3.new(-6, ph + 3, 6), true)

	--------------------------------------------------------------
	-- КУХНЯ БРАТСТВА (задний двор паба) — здесь заперта Берта
	--------------------------------------------------------------
	local kc = Vector3.new(100, 0, 70)
	local kitchen = Instance.new("Model")
	kitchen.Name = "Kitchen"
	kitchen.Parent = S
	local kw = Color3.fromRGB(70, 66, 62)
	box(kitchen, Vector3.new(24, 14, 1), kc + Vector3.new(0, 7, -10), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(24, 14, 1), kc + Vector3.new(0, 7, 10), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(1, 14, 20), kc + Vector3.new(12, 7, 0), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(1, 14, 7), kc + Vector3.new(-12, 7, -6.5), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(1, 14, 7), kc + Vector3.new(-12, 7, 6.5), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(1, 5, 6), kc + Vector3.new(-12, 11.5, 0), kw, Enum.Material.Brick, "KWall")
	box(kitchen, Vector3.new(26, 1, 22), kc + Vector3.new(0, 14.5, 0), C.Soot, Enum.Material.Metal, "KRoof")
	door(kitchen, Vector3.new(1, 9, 6), CFrame.new(kc + Vector3.new(-12, 4.5, 0)), 8, "Кухня")
	-- чёрная шляпа над дверью — знак Братства
	Art.hat(kitchen, CFrame.new(kc + Vector3.new(-12.8, 10, 0)), "bowler", 1.4)
	for _, p in kitchen:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
		end
	end
	-- плита, кастрюля с маслом
	box(kitchen, Vector3.new(6, 3.5, 4), kc + Vector3.new(8, 1.75, -6), C.IronDark, Enum.Material.Metal, "Stove")
	local pot = cyl(kitchen, 2.6, 2, CFrame.new(kc + Vector3.new(8, 4.5, -6)), C.Iron, Enum.Material.Metal, "Pot")
	local steam = Instance.new("ParticleEmitter")
	steam.Rate = 6
	steam.Lifetime = NumberRange.new(1.5, 2.5)
	steam.Speed = NumberRange.new(2, 3)
	steam.Size = NumberSequence.new(0.5, 2)
	steam.Transparency = NumberSequence.new(0.5, 1)
	steam.EmissionDirection = Enum.NormalId.Right
	steam.Parent = pot
	local klamp = ball(kitchen, 1, CFrame.new(kc + Vector3.new(0, 12.5, 0)), C.WarmLight, Enum.Material.Neon)
	light(klamp, 20, 1.2)
	-- Берта (статичная, пока её не спасли)
	local berta = Art.Berta()
	Art.place(berta, CFrame.new(kc + Vector3.new(4, 0.4, 0)) * CFrame.Angles(0, math.rad(90), 0), root.NPCs)
	berta.Name = "BertaCaptive"
	berta:SetAttribute("Bubbles", "😢🍳🎩|🤖❤️❓|🌼")
	berta:SetAttribute("HideAtStage", 9)
	prompt(berta.PrimaryPart, "Berta", "Освободить", "👧 Берта", nil, 10)
	marker("Q8", kc + Vector3.new(-12, 6, 0))
	factTerminal("f14", kc + Vector3.new(-18, 0.4, -8), 90)
	memorySpot("m_bday", kc + Vector3.new(-26, 0.4, 14), 90)

	-- лавочки и фонари на площади
	for i = 0, 7 do
		local a = i / 8 * math.pi * 2
		local p = fc + Vector3.new(math.cos(a) * 30, 0, math.sin(a) * 30)
		cyl(S, 0.5, 11, CFrame.new(p + Vector3.new(0, 5.5, 0)), C.IronDark, Enum.Material.Metal, "LampPost")
		local lamp = ball(S, 1.4, CFrame.new(p + Vector3.new(0, 11.5, 0)), C.WarmLight, Enum.Material.Neon, "Lamp")
		light(lamp, 24, 1.1)
	end
	for i = 0, 11 do
		local a = i / 12 * math.pi * 2 + 0.2
		bolt(fc + Vector3.new(math.cos(a) * 20, 2, math.sin(a) * 20))
	end
	-- болт наверху фонтана (надо вытянуться или запрыгнуть)
	bolt(fc + Vector3.new(0, 16, 0), true)
	memorySpot("m_paint", fc + Vector3.new(-30, 0.4, 36), -90)
	factTerminal("f05", fc + Vector3.new(16, 0.4, 20), 225)
	factTerminal("f06", fc + Vector3.new(-16, 0.4, 20), 135)
	factTerminal("f25", fc + Vector3.new(0, 0.4, -24), 0)

	-- дома по краям площади
	house(S, Vector3.new(-60, 0, -10), 24, 18, 26, 0)
	house(S, Vector3.new(60, 0, -10), 24, 18, 22, 0)
	house(S, Vector3.new(-150, 0, 70), 26, 20, 30, 90)
	house(S, Vector3.new(160, 0, 20), 26, 20, 28, -90)
	house(S, Vector3.new(160, 0, 70), 22, 18, 34, -90)

	-- Кот: бродит по площади (двигает сервер)
	local cat = Art.Cat()
	Art.place(cat, CFrame.new(fc + Vector3.new(24, 0.4, -10)), root.NPCs)
	cat:SetAttribute("Bubbles", "🐟❓|😼|💤")
	prompt(cat.PrimaryPart, "Cat", "Поймать", "🐈 Кот", nil, 7)
	World.NPC.Cat = cat
	World.NPC.CatPath = {
		fc + Vector3.new(24, 0.4, -10),
		fc + Vector3.new(30, 0.4, 20),
		fc + Vector3.new(10, 0.4, 32),
		fc + Vector3.new(-26, 0.4, 24),
		fc + Vector3.new(-30, 0.4, -12),
		fc + Vector3.new(-4, 0.4, -30),
	}
end

----------------------------------------------------------------------
-- 6. Теплица с вентилятором
----------------------------------------------------------------------
local function buildGreenhouse()
	local G = root.Greenhouse
	local gc = Vector3.new(-110, 0, -60)
	local glass = Color3.fromRGB(180, 220, 200)
	local frame = C.IronDark
	-- стеклянные стены 36x36, вход с востока
	local function glassWall(size: Vector3, pos: Vector3)
		local p = box(G, size, pos, glass, Enum.Material.Glass, "Glass")
		p.Transparency = 0.55
		return p
	end
	glassWall(Vector3.new(36, 16, 0.4), gc + Vector3.new(0, 8, -18))
	glassWall(Vector3.new(36, 16, 0.4), gc + Vector3.new(0, 8, 18))
	glassWall(Vector3.new(0.4, 16, 36), gc + Vector3.new(-18, 8, 0))
	glassWall(Vector3.new(0.4, 16, 14), gc + Vector3.new(18, 8, -11))
	glassWall(Vector3.new(0.4, 16, 14), gc + Vector3.new(18, 8, 11))
	glassWall(Vector3.new(0.4, 6, 8), gc + Vector3.new(18, 13, 0))
	-- рёбра каркаса
	for i = -18, 18, 6 do
		box(G, Vector3.new(0.5, 16, 0.5), gc + Vector3.new(i, 8, -18), frame)
		box(G, Vector3.new(0.5, 16, 0.5), gc + Vector3.new(i, 8, 18), frame)
		box(G, Vector3.new(0.5, 16, 0.5), gc + Vector3.new(-18, 8, i), frame)
		box(G, Vector3.new(0.5, 16, 0.5), gc + Vector3.new(18, 8, i), frame)
	end
	-- купол из колец
	for k = 0, 6 do
		local d = 38 - k * 5
		local ring = cyl(G, d, 1.5, CFrame.new(gc + Vector3.new(0, 16.5 + k * 1.6, 0)), glass, Enum.Material.Glass, "DomeRing")
		ring.Transparency = 0.5
	end
	box(G, Vector3.new(36, 0.4, 36), gc + Vector3.new(0, 0.3, 0), C.Moss, Enum.Material.Grass, "Lawn")
	-- «дверь» теплицы — её закрывает вентилятор
	door(G, Vector3.new(0.6, 10, 8), CFrame.new(gc + Vector3.new(18, 5, 0)), 8, "Теплица")
	local fan = Art.Fan()
	Art.place(fan, CFrame.new(gc + Vector3.new(22, 0.4, 0)) * CFrame.Angles(0, math.rad(-90), 0), root.NPCs)
	fan:SetAttribute("Bubbles", "❓❓❓|😤💨|🧠❔")
	fan:SetAttribute("HideAtStage", 8)
	prompt(fan.PrimaryPart, "Fan", "Ответить на вопросы", "🌀 Вентилятор", nil, 10)
	World.NPC.Fan = fan
	marker("Q7", gc + Vector3.new(24, 7, 0))
	-- растения
	for i = 1, 22 do
		local p = gc + Vector3.new(rng:NextNumber(-15, 12), 0.4, rng:NextNumber(-15, 15))
		local h = rng:NextNumber(2, 6)
		cyl(G, 0.3, h, CFrame.new(p + Vector3.new(0, h / 2, 0)), C.Moss, Enum.Material.Grass, "Stem")
		ball(G, rng:NextNumber(1.2, 2.6), CFrame.new(p + Vector3.new(0, h, 0)), Color3.fromRGB(rng:NextInteger(90, 140), rng:NextInteger(130, 170), rng:NextInteger(60, 90)), Enum.Material.Grass, "Leaves")
		if rng:NextNumber() < 0.4 then
			ball(G, 0.8, CFrame.new(p + Vector3.new(0, h + 1, 0)), C.BertaPink, Enum.Material.SmoothPlastic, "Flower").CanCollide = false
		end
	end
	-- цветок для Берты (особый, светящийся)
	local fl = ball(G, 1.4, CFrame.new(gc + Vector3.new(-8, 4, 0)), Color3.fromRGB(255, 150, 190), Enum.Material.Neon, "BertaFlower")
	cyl(G, 0.3, 4, CFrame.new(gc + Vector3.new(-8, 2, 0)), C.Moss, Enum.Material.Grass)
	light(fl, 10, 1.5, Color3.fromRGB(255, 150, 190))
	-- Botanicula: крошечный житель-семечко
	local seed = ball(G, 0.9, CFrame.new(gc + Vector3.new(-15, 0.9, -15)), Color3.fromRGB(150, 110, 60), Enum.Material.Wood, "Seedling")
	for _, sx in { -1, 1 } do
		cyl(G, 0.08, 0.7, CFrame.new(gc + Vector3.new(-15 + sx * 0.15, 1.6, -15)), C.Moss, Enum.Material.Grass)
	end
	eggPrompt(seed, "botanicula", "🌱 Семечко")
	factTerminal("f22", gc + Vector3.new(30, 0.4, 10), -90)
	factTerminal("f29", gc + Vector3.new(0, 0.4, 10), 180)
	factTerminal("f24", gc + Vector3.new(28, 0.4, -14), -90)
	World.Teleports.greenhouse = CFrame.new(gc + Vector3.new(32, 4, 0)) * CFrame.Angles(0, math.rad(90), 0)
	for i = 0, 8 do
		bolt(gc + Vector3.new(-12 + i * 3, 2, 12))
	end
end

----------------------------------------------------------------------
-- 7. Великая Башня: паркур по спирали и комната-голова наверху
----------------------------------------------------------------------
World.TowerCheckpoints = {} :: { BasePart }

local function spinner(parent: Instance, cf: CFrame, diameter: number, speed: number)
	local axle = box(parent, Vector3.new(1, 1, 1), cf * CFrame.new(0, -1.2, 0), C.IronDark, Enum.Material.Metal, "Axle")
	axle.Transparency = 1
	axle.CanCollide = false
	local gear = Art.part(parent, "Cyl", Vector3.new(diameter, 1.2, diameter), cf, C.Brass, Enum.Material.Metal, "Gear")
	gear.Anchored = false
	gear.CustomPhysicalProperties = PhysicalProperties.new(0.7, 1, 0, 1, 1)
	-- зубья шестерёнки
	local teeth = 12
	for i = 0, teeth - 1 do
		local a = i / teeth * math.pi * 2
		local t = box(parent, Vector3.new(1.2, 1.0, 1.4), cf * CFrame.Angles(0, a, 0) * CFrame.new(0, 0, diameter / 2 + 0.4), C.Brass, Enum.Material.Metal, "Tooth")
		t.Anchored = false
		t.Massless = true
		local w = Instance.new("WeldConstraint")
		w.Part0 = gear
		w.Part1 = t
		w.Parent = t
	end
	local a0 = Instance.new("Attachment")
	a0.Name = "A0"
	a0.CFrame = CFrame.new(0, 1.2, 0) * CFrame.Angles(0, 0, math.rad(90))
	a0.Parent = axle
	local a1 = Instance.new("Attachment")
	a1.Name = "A1"
	-- у вертикального цилиндра локальная ось X смотрит вверх
	a1.CFrame = CFrame.new()
	a1.Parent = gear
	local hinge = Instance.new("HingeConstraint")
	hinge.Attachment0 = a0
	hinge.Attachment1 = a1
	hinge.ActuatorType = Enum.ActuatorType.Motor
	hinge.MotorMaxTorque = 1e9
	hinge.MotorMaxAcceleration = 50
	hinge.AngularVelocity = speed
	hinge.Parent = gear
	tag(gear, "Physical")
	return gear
end

local function mover(parent: Instance, cf: CFrame, size: Vector3, axisWorld: Vector3, range: number)
	local anchor = box(parent, Vector3.new(1, 1, 1), cf, C.IronDark, Enum.Material.Metal, "MoverAnchor")
	anchor.Transparency = 1
	anchor.CanCollide = false
	local plat = box(parent, size, cf, Color3.fromRGB(120, 150, 160), Enum.Material.DiamondPlate, "MovingPlatform")
	plat.Anchored = false
	plat.CustomPhysicalProperties = PhysicalProperties.new(0.7, 1, 0, 1, 1)
	local localAxis = cf:VectorToObjectSpace(axisWorld.Unit)
	local a0 = Instance.new("Attachment")
	a0.Axis = localAxis
	a0.Parent = anchor
	local a1 = Instance.new("Attachment")
	a1.Axis = localAxis
	a1.Parent = plat
	local pr = Instance.new("PrismaticConstraint")
	pr.Attachment0 = a0
	pr.Attachment1 = a1
	pr.ActuatorType = Enum.ActuatorType.Servo
	pr.ServoMaxForce = 1e9
	pr.Speed = 6
	pr.LimitsEnabled = true
	pr.LowerLimit = -range
	pr.UpperLimit = range
	pr.TargetPosition = range
	pr.Parent = plat
	pr:SetAttribute("Range", range)
	tag(pr, "Mover")
	tag(plat, "Physical")
	return plat
end

local function buildTower()
	local T = root.Tower
	local tc = Vector3.new(0, 0, -150)
	World.TowerCenter = tc
	local stone = Color3.fromRGB(122, 104, 86)

	-- ограда вокруг башни с воротами на юге
	local fenceR = 46
	for i = 0, 35 do
		local a = i / 36 * math.pi * 2
		local p = tc + Vector3.new(math.sin(a) * fenceR, 0, math.cos(a) * fenceR)
		if math.abs(math.sin(a) * fenceR) > 7 or math.cos(a) < 0 then
			box(T, Vector3.new(9, 8, 1), CFrame.new(p + Vector3.new(0, 4, 0)) * CFrame.Angles(0, a, 0), C.IronDark, Enum.Material.CorrodedMetal, "TowerFence")
		end
	end
	door(T, Vector3.new(14, 8, 1), CFrame.new(tc + Vector3.new(0, 4, fenceR)), 9, "Башня")
	World.Teleports.tower = CFrame.new(tc + Vector3.new(0, 4, fenceR + 10))
	marker("Q9", tc + Vector3.new(0, 10, fenceR))

	-- основание башни
	cyl(T, 30, 24, CFrame.new(tc + Vector3.new(0, 12, 0)), stone, Enum.Material.Brick, "TowerBase")
	cyl(T, 32, 2, CFrame.new(tc + Vector3.new(0, 25, 0)), C.RustDark, Enum.Material.Metal)
	-- ствол башни
	local shaftTop = 232
	cyl(T, 18, shaftTop - 24, CFrame.new(tc + Vector3.new(0, 24 + (shaftTop - 24) / 2, 0)), Color3.fromRGB(130, 100, 76), Enum.Material.CorrodedMetal, "TowerShaft")
	for y = 40, shaftTop, 30 do
		cyl(T, 21, 1.6, CFrame.new(tc + Vector3.new(0, y, 0)), C.RustDark, Enum.Material.Metal, "ShaftRing")
		for k = 0, 3 do
			local a = k / 4 * math.pi * 2 + y
			local win = box(T, Vector3.new(2, 3, 0.4), CFrame.new(tc + Vector3.new(math.sin(a) * 9.1, y + 6, math.cos(a) * 9.1)) * CFrame.Angles(0, a, 0), C.WarmLight, Enum.Material.Neon, "TowerWindow")
			win.CanCollide = false
		end
	end
	-- трубы вдоль ствола
	for _, a in { 0.8, 2.6, 4.4 } do
		cyl(T, 1.4, shaftTop - 24, CFrame.new(tc + Vector3.new(math.sin(a) * 10, 24 + (shaftTop - 24) / 2, math.cos(a) * 10)), C.Iron, Enum.Material.Metal, "TowerPipe")
	end

	-- лифт у подножия (после финала)
	local liftBtn = box(T, Vector3.new(2, 3, 1), tc + Vector3.new(9, 1.5, 16), C.Brass, Enum.Material.Metal, "LiftUp")
	prompt(liftBtn, "Lift", "Подняться", "🛗 Лифт на вершину", { Dir = "up" }, 8)

	-- СПИРАЛЬНЫЙ ПАРКУР
	local R = 21
	local theta = 0.0
	local y = -0.4
	local i = 0
	local lastBounce = false
	local cpIndex = 0
	while y < 244 do
		i += 1
		theta += 0.46
		y += if lastBounce then 9 else 3.2
		lastBounce = false
		local pos = tc + Vector3.new(math.sin(theta) * R, y, math.cos(theta) * R)
		local cf = CFrame.new(pos) * CFrame.Angles(0, theta, 0)
		local kind = i % 9
		if i <= 2 then
			kind = 1
		end
		if kind == 0 then
			cpIndex += 1
			local cp = box(T, Vector3.new(10, 1.2, 10), cf, C.Brass, Enum.Material.DiamondPlate, "Checkpoint")
			cp:SetAttribute("Index", cpIndex)
			tag(cp, "Checkpoint")
			local flag = cyl(T, 0.3, 6, cf * CFrame.new(3.5, 3.6, 3.5), C.IronDark, Enum.Material.Metal)
			local _f = flag
			local fl = box(T, Vector3.new(0.2, 2, 3), cf * CFrame.new(3.5, 5.6, 2), Color3.fromRGB(200, 60, 50), Enum.Material.Fabric, "Flag")
			fl.CanCollide = false
			fl:SetAttribute("CheckpointFlag", cpIndex)
			World.TowerCheckpoints[cpIndex] = cp
			-- у внешнего края платформы, чтобы не мешать прыжкам
			local edge = pos + Vector3.new(0, 0.6, 0) + CFrame.Angles(0, theta, 0):VectorToWorldSpace(Vector3.new(-2, 0, 3.8))
			if cpIndex == 1 then
				factTerminal("f15", edge, math.deg(theta) + 180)
			elseif cpIndex == 3 then
				factTerminal("f16", edge, math.deg(theta) + 180)
			elseif cpIndex == 5 then
				memorySpot("m_zap", pos + Vector3.new(0, 0.6, 0) + CFrame.Angles(0, theta, 0):VectorToWorldSpace(Vector3.new(0, 0, 3.4)), math.deg(theta) + 180)
			end
		elseif kind == 3 then
			spinner(T, cf, 9, if i % 2 == 0 then 0.7 else -0.7)
		elseif kind == 5 then
			box(T, Vector3.new(4, 1, 4), cf, C.RustLight, Enum.Material.Metal, "SmallStep")
		elseif kind == 6 then
			box(T, Vector3.new(7, 1.2, 9), cf, C.IronDark, Enum.Material.DiamondPlate, "ZapPlatform")
			local zap = box(T, Vector3.new(7.2, 0.3, 1.4), cf * CFrame.new(0, 0.7, 0) * CFrame.Angles(0, math.rad(90), 0), Color3.fromRGB(90, 180, 255), Enum.Material.Neon, "ZapStrip")
			zap.CanCollide = false
			tag(zap, "Kill")
			zap:SetAttribute("KillText", "Бзззт! Током ударило.")
		elseif kind == 7 then
			mover(T, cf, Vector3.new(6, 1, 6), (pos - tc) * Vector3.new(1, 0, 1), 3)
		elseif kind == 8 then
			local vent = box(T, Vector3.new(6, 1.2, 6), cf, C.IronDark, Enum.Material.Metal, "SteamVent")
			local puff = box(T, Vector3.new(4, 0.3, 4), cf * CFrame.new(0, 0.7, 0), Color3.fromRGB(240, 240, 230), Enum.Material.Neon, "SteamPad")
			puff.CanCollide = false
			puff.Transparency = 0.4
			puff:SetAttribute("Power", 85)
			tag(puff, "Bounce")
			local steam = Instance.new("ParticleEmitter")
			steam.Rate = 25
			steam.Lifetime = NumberRange.new(0.6, 1)
			steam.Speed = NumberRange.new(12, 18)
			steam.Size = NumberSequence.new(1, 3)
			steam.Transparency = NumberSequence.new(0.3, 1)
			steam.EmissionDirection = Enum.NormalId.Top
			steam.Parent = puff
			local _v = vent
			lastBounce = true
		elseif kind == 2 then
			local belt = box(T, Vector3.new(8, 1.2, 5), cf, C.Soot, Enum.Material.Rubber, "Conveyor")
			belt.AssemblyLinearVelocity = cf:VectorToWorldSpace(Vector3.new(-6, 0, 0))
			for k = -3, 3, 1.5 do
				box(T, Vector3.new(0.3, 0.1, 5), cf * CFrame.new(k, 0.65, 0), C.Iron, Enum.Material.Metal).CanCollide = false
			end
		else
			box(T, Vector3.new(7, 1.2, 7), cf, if i % 2 == 0 then C.Rust else C.RustLight, Enum.Material.DiamondPlate, "Step")
		end
		-- опорная балка к стволу
		local inner = tc + Vector3.new(math.sin(theta) * 9, y - 0.4, math.cos(theta) * 9)
		local mid = (inner + pos) / 2
		local beam = box(T, Vector3.new(0.8, 0.8, (pos - inner).Magnitude), CFrame.lookAt(mid, pos) * CFrame.new(0, -1, 0), C.IronDark, Enum.Material.Metal, "Brace")
		beam.CanCollide = false
		bolt(pos + Vector3.new(0, 3, 0))
	end
	World.TowerTopY = y

	-- КОМНАТА-ГОЛОВА на вершине
	local floorY = y + 3
	-- «шея» башни от ствола до пола комнаты
	cyl(T, 16, floorY - shaftTop, CFrame.new(tc + Vector3.new(0, shaftTop + (floorY - shaftTop) / 2 - 0.7, 0)), Color3.fromRGB(130, 100, 76), Enum.Material.CorrodedMetal, "TowerNeck")
	local roomR = 17
	local topCf = CFrame.new(tc + Vector3.new(0, floorY, 0))
	cyl(T, roomR * 2 + 1, 1.4, topCf, C.RustDark, Enum.Material.DiamondPlate, "TopFloor")
	-- вход смотрит в сторону последней ступени
	local entryAngle = theta + 0.46
	local panels = 28
	for k = 0, panels - 1 do
		local a = k / panels * math.pi * 2
		local diff = math.abs(math.atan2(math.sin(a - entryAngle), math.cos(a - entryAngle)))
		if diff > 0.24 then
			local p = tc + Vector3.new(math.sin(a) * roomR, floorY + 8, math.cos(a) * roomR)
			local isWin = k % 3 == 0
			local panel = box(T, Vector3.new(roomR * 2 * math.pi / panels + 0.3, 16, 1), CFrame.new(p) * CFrame.Angles(0, a, 0), if isWin then Color3.fromRGB(170, 200, 190) else Color3.fromRGB(150, 110, 80), if isWin then Enum.Material.Glass else Enum.Material.CorrodedMetal, "TopWall")
			if isWin then
				panel.Transparency = 0.5
			end
		end
	end
	-- купол-голова
	for k = 0, 9 do
		local d = (roomR * 2 + 4) * math.cos(k / 10 * math.pi / 2)
		cyl(T, d, 2.2, CFrame.new(tc + Vector3.new(0, floorY + 17 + k * 2.1, 0)), Color3.fromRGB(160, 110, 70), Enum.Material.CorrodedMetal, "Dome")
	end
	-- «глаза» башни — два огромных круглых окна
	for _, sx in { -1, 1 } do
		local a = entryAngle + sx * 0.5
		local ecf = CFrame.new(tc + Vector3.new(math.sin(a) * (roomR + 2.5), floorY + 22, math.cos(a) * (roomR + 2.5))) * CFrame.Angles(0, a, 0)
		Art.part(T, "CylZ", Vector3.new(8, 8, 0.6), ecf, C.WarmLight, Enum.Material.Neon, "TowerEye").Anchored = true
	end
	-- шпиль-антенна
	cyl(T, 0.8, 30, CFrame.new(tc + Vector3.new(0, floorY + 52, 0)), C.IronDark, Enum.Material.Metal, "Spire")
	local beacon = ball(T, 2.4, CFrame.new(tc + Vector3.new(0, floorY + 68, 0)), Color3.fromRGB(255, 90, 60), Enum.Material.Neon, "Beacon")
	light(beacon, 60, 3, Color3.fromRGB(255, 120, 80))

	local lampT = ball(T, 1.6, CFrame.new(tc + Vector3.new(0, floorY + 14, 0)), C.WarmLight, Enum.Material.Neon)
	light(lampT, 40, 1.6)

	-- мостик от последней ступени к входу
	local lastPos = tc + Vector3.new(math.sin(theta) * R, y, math.cos(theta) * R)
	local entryPos = tc + Vector3.new(math.sin(entryAngle) * (roomR + 1), floorY, math.cos(entryAngle) * (roomR + 1))
	local mid = (lastPos + entryPos) / 2
	box(T, Vector3.new(5, 1, (entryPos - lastPos).Magnitude + 4), CFrame.lookAt(mid, entryPos), C.Brass, Enum.Material.DiamondPlate, "TopBridge")

	-- триггер «добрался до вершины»
	local topZone = box(T, Vector3.new(14, 8, 14), CFrame.new(tc + Vector3.new(math.sin(entryAngle) * (roomR - 7), floorY + 4, math.cos(entryAngle) * (roomR - 7))), C.Brass, Enum.Material.Neon, "TowerTopZone")
	topZone.Transparency = 1
	topZone.CanCollide = false
	tag(topZone, "TowerTop")
	World.Teleports.towertop = CFrame.new(tc + Vector3.new(math.sin(entryAngle) * (roomR - 6), floorY + 4, math.cos(entryAngle) * (roomR - 6)))
	World.Spawns.towertop = World.Teleports.towertop
	marker("Q10", tc + Vector3.new(-6, floorY + 6, -6))

	-- БОМБА (примотана к опоре)
	local bombPos = tc + Vector3.new(-8, floorY, -8)
	local bomb = Instance.new("Model")
	bomb.Name = "Bomb"
	bomb.Parent = T
	local core = cyl(bomb, 3, 4, CFrame.new(bombPos + Vector3.new(0, 2.7, 0)), C.Soot, Enum.Material.Metal, "BombBody")
	for k, wire in Config.BombWires do
		local wcf = CFrame.new(bombPos + Vector3.new(-1.2 + k * 0.6, 4.9, -1.2))
		cyl(bomb, 0.2, 1.6, wcf * CFrame.Angles(math.rad(40), 0, 0), wire.color, Enum.Material.SmoothPlastic, "Wire")
	end
	local timer = box(bomb, Vector3.new(2, 1, 0.3), CFrame.new(bombPos + Vector3.new(0, 3.2, -1.6)), Color3.fromRGB(255, 60, 40), Enum.Material.Neon, "Timer")
	local _t = timer
	-- фитиль-лампа
	local fuse = ball(bomb, 0.7, CFrame.new(bombPos + Vector3.new(0, 5.2, 0)), Color3.fromRGB(255, 80, 40), Enum.Material.Neon, "Fuse")
	light(fuse, 14, 2, Color3.fromRGB(255, 80, 40))
	core:SetAttribute("HideAtStage", 11)
	for _, p in bomb:GetDescendants() do
		if p:IsA("BasePart") then
			p:SetAttribute("HideAtStage", 11)
			tag(p, "StageHide")
		end
	end
	prompt(core, "Bomb", "Обезвредить", "💣 Бомба Братства", nil, 10)

	-- ДРУГ С БОЛЬШОЙ ГОЛОВОЙ
	local friend = Art.BigHead()
	Art.place(friend, CFrame.new(tc + Vector3.new(4, floorY + 0.7, -4)) * CFrame.Angles(0, math.rad(200), 0), root.NPCs)
	friend:SetAttribute("Bubbles", "💫😵|🔧❓|🎩⚡🤕")
	prompt(friend.PrimaryPart, "Friend", "Починить", "🤖 Большеголовый друг", nil, 14)
	World.NPC.Friend = friend
	marker("Q11", tc + Vector3.new(4, floorY + 12, -4))
	factTerminal("f17", tc + Vector3.new(10, floorY + 0.7, 6), 0)
	factTerminal("f26", tc + Vector3.new(-10, floorY + 0.7, 6), 0)

	-- люк-сток, куда сбрасывают Братство в финале
	local drain = cyl(T, 6, 0.4, CFrame.new(tc + Vector3.new(0, floorY + 0.8, 8)), C.Soot, Enum.Material.Metal, "Drain")
	World.Drain = drain

	-- лифт вниз
	local down = box(T, Vector3.new(2, 3, 1), tc + Vector3.new(12, floorY + 2.2, -6), C.Brass, Enum.Material.Metal, "LiftDown")
	prompt(down, "Lift", "Спуститься", "🛗 Лифт вниз", { Dir = "down" }, 8)

	factTerminal("f18", tc + Vector3.new(14, 0.4, fenceR + 6), 180)
	factTerminal("f19", tc + Vector3.new(-14, 0.4, fenceR + 6), 180)
	factTerminal("f28", tc + Vector3.new(30, 0.4, 20), 225)
end

----------------------------------------------------------------------
-- Путь патруля Братства Чёрной Шляпы
----------------------------------------------------------------------
local function patrolPaths()
	World.NPC.BlackCapPaths = {
		Leader = { Vector3.new(-40, 0.4, 70), Vector3.new(40, 0.4, 70), Vector3.new(40, 0.4, 10), Vector3.new(-40, 0.4, 10) },
		Fat = { Vector3.new(0, 0.4, 130), Vector3.new(0, 0.4, 215), Vector3.new(-60, 0.4, 160), Vector3.new(60, 0.4, 160) },
		Thin = { Vector3.new(50, 0.4, 40), Vector3.new(80, 0.4, 70), Vector3.new(70, 0.4, 0), Vector3.new(30, 0.4, -20) },
	}
end

----------------------------------------------------------------------
function World.Build()
	local old = workspace:FindFirstChild("Machinarium")
	if old then
		old:Destroy()
	end
	root = Instance.new("Folder")
	root.Name = "Machinarium"
	for _, n in { "Ground", "Walls", "Skyline", "Junkyard", "Gate", "Lowtown", "Canal", "Square", "Greenhouse", "Tower", "NPCs", "Facts", "Memories", "Markers", "Bolts" } do
		folder(n, root)
	end
	World.Root = root

	setupLighting()
	buildGround()
	buildJunkyard()
	buildGate()
	buildLowtown()
	buildCanal()
	buildSquare()
	buildGreenhouse()
	buildTower()
	patrolPaths()

	root.Parent = workspace

	-- физические платформы башни симулирует сервер
	for _, p in CollectionService:GetTagged("Physical") do
		if p:IsA("BasePart") and not p.Anchored then
			pcall(function()
				p:SetNetworkOwner(nil)
			end)
		end
	end
	return World
end

return World
