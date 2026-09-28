--!nonstrict
-- Art: построение персонажей Machinarium из обычных деталей Roblox.
-- Все модели строятся «от ног»: точка (0,0,0) — пол под персонажем,
-- лицо смотрит в сторону -Z (как у всех моделей Roblox).

local Config = require(script.Parent.Config)
local C = Config.Colors

local Art = {}

local RAD90 = math.rad(90)

-- Создать деталь. shape: "Block" | "Ball" | "Cyl" (вертикальный цилиндр, size = (d, h, d))
-- | "CylX" (ось по X, size = (len, d, d)) | "CylZ" (ось по Z, size = (d, d, len)) | "Wedge"
function Art.part(parent: Instance, shape: string, size: Vector3, cf: CFrame, color: Color3, material: Enum.Material?, name: string?)
	local p: BasePart
	if shape == "Wedge" then
		p = Instance.new("WedgePart")
		p.Size = size
		p.CFrame = cf
	else
		local part = Instance.new("Part")
		if shape == "Ball" then
			part.Shape = Enum.PartType.Ball
			part.Size = size
			part.CFrame = cf
		elseif shape == "Cyl" then
			part.Shape = Enum.PartType.Cylinder
			part.Size = Vector3.new(size.Y, size.X, size.Z)
			part.CFrame = cf * CFrame.Angles(0, 0, RAD90)
		elseif shape == "CylX" then
			part.Shape = Enum.PartType.Cylinder
			part.Size = size
			part.CFrame = cf
		elseif shape == "CylZ" then
			part.Shape = Enum.PartType.Cylinder
			part.Size = Vector3.new(size.Z, size.X, size.Y)
			part.CFrame = cf * CFrame.Angles(0, RAD90, 0)
		else
			part.Size = size
			part.CFrame = cf
		end
		p = part
	end
	p.Color = color
	p.Material = material or Enum.Material.SmoothPlastic
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Name = name or "Part"
	p.Parent = parent
	return p
end

-- Глаза в стиле Машинариума: белые диски с чёрными зрачками.
function Art.eyes(parent: Instance, origin: CFrame, opt: { size: number?, gap: number?, y: number?, z: number?, angry: boolean?, sleepy: boolean?, lid: Color3?, rim: Color3? })
	local size = opt.size or 0.6
	local gap = opt.gap or 0.34
	local y = opt.y or 0
	local z = opt.z or -0.7
	for _, sx in { -1, 1 } do
		local base = origin * CFrame.new(sx * gap, y, z)
		-- металлическая оправа глаза
		Art.part(parent, "CylZ", Vector3.new(size * 1.18, size * 1.18, 0.1), base * CFrame.new(0, 0, 0.04), opt.rim or Color3.fromRGB(70, 56, 44), Enum.Material.Metal, "EyeRim")
		Art.part(parent, "CylZ", Vector3.new(size, size, 0.12), base, Color3.fromRGB(245, 240, 225), Enum.Material.SmoothPlastic, "Eye")
		local pupil = size * 0.42
		local pcf = base * CFrame.new(sx * -0.03, opt.sleepy and -size * 0.12 or 0, -0.06)
		Art.part(parent, "Ball", Vector3.new(pupil, pupil, pupil), pcf, C.Soot, Enum.Material.SmoothPlastic, "Pupil")
		-- блик в зрачке — глаза «живые»
		Art.part(parent, "Ball", Vector3.new(pupil * 0.32, pupil * 0.32, pupil * 0.32), pcf * CFrame.new(pupil * 0.18, pupil * 0.18, -pupil * 0.4), Color3.fromRGB(255, 255, 255), Enum.Material.Neon, "Glint")
		-- тяжёлое металлическое веко (как у Йозефа)
		if opt.lid then
			Art.part(parent, "CylZ", Vector3.new(size * 1.08, size * 1.08, 0.08), base * CFrame.new(0, size * 0.5, -0.1), opt.lid, Enum.Material.Metal, "Lid")
		end
		if opt.angry then
			Art.part(parent, "Block", Vector3.new(size * 1.1, 0.12, 0.1), base * CFrame.new(0, size * 0.55, -0.05) * CFrame.Angles(0, 0, sx * math.rad(-22)), C.Soot, nil, "Brow")
		end
		if opt.sleepy then
			Art.part(parent, "Block", Vector3.new(size * 1.05, size * 0.45, 0.14), base * CFrame.new(0, size * 0.3, -0.03), C.RustDark, nil, "Lid")
		end
	end
end

-- Шляпы
function Art.hat(parent: Instance, top: CFrame, kind: string, scale: number?)
	local s = scale or 1
	if kind == "bowler" then
		-- чёрный котелок Братства
		Art.part(parent, "Cyl", Vector3.new(2.0 * s, 0.12 * s, 2.0 * s), top * CFrame.new(0, 0.06 * s, 0), C.BlackCap, Enum.Material.Fabric, "HatBrim")
		Art.part(parent, "Cyl", Vector3.new(1.3 * s, 0.6 * s, 1.3 * s), top * CFrame.new(0, 0.4 * s, 0), C.BlackCap, Enum.Material.Fabric, "HatCrown")
		Art.part(parent, "Ball", Vector3.new(1.3 * s, 1.3 * s, 1.3 * s), top * CFrame.new(0, 0.62 * s, 0), C.BlackCap, Enum.Material.Fabric, "HatTop")
		Art.part(parent, "Cyl", Vector3.new(1.34 * s, 0.14 * s, 1.34 * s), top * CFrame.new(0, 0.18 * s, 0), Color3.fromRGB(70, 60, 50), Enum.Material.Fabric, "HatBand")
	elseif kind == "gnome" then
		-- колпачок гномика из Samorost
		local y = 0
		for i = 0, 4 do
			local d = (1.3 - i * 0.24) * s
			Art.part(parent, "Cyl", Vector3.new(d, 0.35 * s, d), top * CFrame.new(0, y + 0.17 * s, 0), Color3.fromRGB(245, 245, 240), Enum.Material.Fabric, "Cap")
			y += 0.3 * s
		end
		Art.part(parent, "Ball", Vector3.new(0.3 * s, 0.3 * s, 0.3 * s), top * CFrame.new(0, y + 0.1 * s, 0), Color3.fromRGB(245, 245, 240), Enum.Material.Fabric, "Pompom")
	elseif kind == "helmet" then
		Art.part(parent, "Ball", Vector3.new(2.1 * s, 2.1 * s, 2.1 * s), top * CFrame.new(0, -0.1 * s, 0), C.Iron, Enum.Material.Metal, "Helmet")
		Art.part(parent, "Cyl", Vector3.new(0.2 * s, 1.0 * s, 0.2 * s), top * CFrame.new(0, 1.2 * s, 0), C.Brass, Enum.Material.Metal, "Spike")
	elseif kind == "police" then
		Art.part(parent, "Cyl", Vector3.new(1.6 * s, 0.5 * s, 1.6 * s), top * CFrame.new(0, 0.25 * s, 0), Color3.fromRGB(40, 50, 80), Enum.Material.Fabric, "Cap")
		Art.part(parent, "Block", Vector3.new(1.4 * s, 0.1 * s, 0.7 * s), top * CFrame.new(0, 0.05 * s, -0.7 * s), C.Soot, nil, "Visor")
		Art.part(parent, "Ball", Vector3.new(0.3 * s, 0.3 * s, 0.3 * s), top * CFrame.new(0, 0.35 * s, -0.8 * s), C.Brass, Enum.Material.Metal, "Badge")
	elseif kind == "chef" then
		Art.part(parent, "Cyl", Vector3.new(1.2 * s, 0.8 * s, 1.2 * s), top * CFrame.new(0, 0.4 * s, 0), Color3.fromRGB(250, 250, 245), Enum.Material.Fabric, "Chef")
		Art.part(parent, "Ball", Vector3.new(1.6 * s, 1.6 * s, 1.6 * s), top * CFrame.new(0, 1.0 * s, 0), Color3.fromRGB(250, 250, 245), Enum.Material.Fabric, "ChefTop")
	end
end

--[[
	Универсальный робот.
	opt = {
		color, dark, material,
		legLen, legGap, legD,
		body = {shape = "Cyl"|"Ball"|"Block", size = Vector3},
		head = {shape = "Cyl"|"Ball"|"Block"|"Bullet", size = Vector3},
		neck = number,
		arms = number (длина) | nil,
		eyes = {...} для Art.eyes,
		hat = "bowler" | ...,
		hatScale = number,
	}
	Возвращает model и таблицу опорных точек (anchors).
]]
function Art.robot(name: string, opt: any): (Model, any)
	local model = Instance.new("Model")
	model.Name = name
	local color = opt.color or C.Rust
	local dark = opt.dark or C.RustDark
	local mat = opt.material or Enum.Material.Metal
	local legLen = opt.legLen or 1.6
	local legGap = opt.legGap or 0.45
	local legD = opt.legD or 0.3
	local body = opt.body or { shape = "Cyl", size = Vector3.new(1.8, 1.8, 1.8) }
	local head = opt.head or { shape = "Cyl", size = Vector3.new(1.5, 1.4, 1.5) }
	local neck = opt.neck or 0.3
	local O = CFrame.new()

	-- корень (невидимый, по нему двигаем модель)
	local root = Art.part(model, "Block", Vector3.new(1, 1, 1), O, color, nil, "Root")
	root.Transparency = 1
	root.CanCollide = false
	model.PrimaryPart = root

	-- ноги: бедро, колено-шарнир, голень, округлая ступня
	for _, sx in { -1, 1 } do
		local x = sx * legGap
		Art.part(model, "Cyl", Vector3.new(legD, legLen * 0.5, legD), O * CFrame.new(x, legLen * 0.75 + 0.15, 0), color, mat, "Thigh")
		Art.part(model, "Ball", Vector3.new(legD * 1.5, legD * 1.5, legD * 1.5), O * CFrame.new(x, legLen * 0.5 + 0.15, 0), dark, mat, "Knee")
		Art.part(model, "Cyl", Vector3.new(legD * 0.85, legLen * 0.5, legD * 0.85), O * CFrame.new(x, legLen * 0.25 + 0.15, 0), dark, mat, "Shin")
		Art.part(model, "Cyl", Vector3.new(legD * 2.6, 0.26, legD * 2.6), O * CFrame.new(x, 0.13, -legD * 0.2), dark, mat, "Heel")
		Art.part(model, "Block", Vector3.new(legD * 2.4, 0.26, legD * 2.2), O * CFrame.new(x, 0.13, -legD * 1.3), dark, mat, "Toe")
	end

	-- тело
	local bodyY = legLen + body.size.Y / 2 + 0.1
	local bodyCF = O * CFrame.new(0, bodyY, 0)
	Art.part(model, body.shape, body.size, bodyCF, color, mat, "Body")
	if body.shape == "Cyl" then
		-- фаски-обручи сверху и снизу корпуса
		for _, k in { -1, 1 } do
			Art.part(model, "Cyl", Vector3.new(body.size.X + 0.12, 0.16, body.size.Z + 0.12), bodyCF * CFrame.new(0, k * (body.size.Y / 2 - 0.08), 0), dark, Enum.Material.Metal, "Band")
		end
		-- кольцо заклёпок
		for i = 0, 9 do
			local a = i / 10 * math.pi * 2
			Art.part(model, "Ball", Vector3.new(0.13, 0.13, 0.13), bodyCF * CFrame.new(math.sin(a) * body.size.X / 2, body.size.Y / 2 - 0.26, math.cos(a) * body.size.Z / 2), C.Brass, Enum.Material.Metal, "Rivet")
		end
	elseif body.shape == "Block" then
		-- панель-пластина с болтами по углам
		Art.part(model, "Block", Vector3.new(body.size.X * 0.7, body.size.Y * 0.55, 0.08), bodyCF * CFrame.new(0, 0, -body.size.Z / 2 - 0.04), dark, Enum.Material.DiamondPlate, "Panel")
		for _, cx in { -1, 1 } do
			for _, cy in { -1, 1 } do
				Art.part(model, "Ball", Vector3.new(0.14, 0.14, 0.14), bodyCF * CFrame.new(cx * body.size.X * 0.3, cy * body.size.Y * 0.22, -body.size.Z / 2 - 0.09), C.Brass, Enum.Material.Metal, "Rivet")
			end
		end
	else
		for i = -1, 1 do
			Art.part(model, "Ball", Vector3.new(0.16, 0.16, 0.16), bodyCF * CFrame.new(i * body.size.X * 0.25, body.size.Y * 0.3, -body.size.Z / 2 + 0.05), C.Brass, Enum.Material.Metal, "Rivet")
		end
	end

	-- руки
	local armLen = opt.arms
	if armLen then
		local sh = bodyY + body.size.Y * 0.3
		for _, sx in { -1, 1 } do
			local x = sx * (body.size.X / 2 + 0.15)
			local tilt = CFrame.Angles(0, 0, sx * math.rad(8))
			Art.part(model, "Ball", Vector3.new(0.5, 0.5, 0.5), O * CFrame.new(x, sh, 0), dark, mat, "Shoulder")
			Art.part(model, "Cyl", Vector3.new(0.24, armLen * 0.5, 0.24), O * CFrame.new(x + sx * 0.04, sh - armLen * 0.25, 0) * tilt, color, mat, "UpperArm")
			Art.part(model, "Ball", Vector3.new(0.32, 0.32, 0.32), O * CFrame.new(x + sx * 0.08, sh - armLen * 0.5, 0), dark, mat, "Elbow")
			Art.part(model, "Cyl", Vector3.new(0.2, armLen * 0.5, 0.2), O * CFrame.new(x + sx * 0.13, sh - armLen * 0.75, 0) * tilt, dark, mat, "Forearm")
			-- клешня из двух пальцев
			for _, f in { -1, 1 } do
				Art.part(model, "Block", Vector3.new(0.08, 0.34, 0.16), O * CFrame.new(x + sx * 0.18 + f * 0.08, sh - armLen - 0.1, 0) * CFrame.Angles(0, 0, f * math.rad(14)), dark, mat, "Claw")
			end
		end
	end

	-- шея и голова
	local headBase = bodyY + body.size.Y / 2
	if neck > 0 then
		-- телескопическая шея из колец
		Art.part(model, "Cyl", Vector3.new(0.26, neck + 0.2, 0.26), O * CFrame.new(0, headBase + neck / 2, 0), dark, mat, "Neck")
		local rings = math.max(1, math.floor(neck / 0.25))
		for i = 1, rings do
			Art.part(model, "Cyl", Vector3.new(0.38, 0.06, 0.38), O * CFrame.new(0, headBase + i * neck / (rings + 1), 0), color, Enum.Material.Metal, "NeckRing")
		end
	end
	local hs = head.size
	local headCF = O * CFrame.new(0, headBase + neck + hs.Y / 2, 0)
	if head.shape == "Bullet" then
		-- голова-«пуля» как у Йозефа: цилиндр + полусфера сверху
		Art.part(model, "Cyl", Vector3.new(hs.X, hs.Y * 0.7, hs.Z), headCF * CFrame.new(0, -hs.Y * 0.15, 0), color, mat, "Head")
		Art.part(model, "Ball", Vector3.new(hs.X, hs.X, hs.X), headCF * CFrame.new(0, hs.Y * 0.2, 0), color, mat, "HeadTop")
	else
		Art.part(model, head.shape, hs, headCF, color, mat, "Head")
	end
	if head.shape == "Cyl" or head.shape == "Bullet" then
		Art.part(model, "Cyl", Vector3.new(hs.X + 0.1, 0.12, hs.Z + 0.1), headCF * CFrame.new(0, -hs.Y / 2 + 0.06 + (if head.shape == "Bullet" then hs.Y * 0.0 else 0), 0), dark, Enum.Material.Metal, "HeadBand")
	end
	-- болты-«уши»
	for _, sx in { -1, 1 } do
		Art.part(model, "CylX", Vector3.new(0.12, math.min(0.34, hs.Y * 0.3), math.min(0.34, hs.Y * 0.3)), headCF * CFrame.new(sx * (hs.X / 2 + 0.03), 0, 0), C.Brass, Enum.Material.Metal, "EarBolt")
	end
	local eyeOpt = opt.eyes or {}
	eyeOpt.z = eyeOpt.z or -(hs.Z / 2 + 0.02)
	Art.eyes(model, headCF, eyeOpt)

	local top = headCF * CFrame.new(0, hs.Y / 2, 0)
	if head.shape == "Bullet" then
		top = headCF * CFrame.new(0, hs.Y * 0.2 + hs.X / 2 - 0.1, 0)
	end
	if opt.hat then
		Art.hat(model, top, opt.hat, opt.hatScale)
	end

	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanTouch = false
		end
	end

	return model, { head = headCF, top = top, body = bodyCF, height = (top.Position.Y) }
end

-- Перенести модель в позицию (модель построена в начале координат)
function Art.place(model: Model, cf: CFrame, parent: Instance?)
	model:PivotTo(cf)
	if parent then
		model.Parent = parent
	end
	return model
end

local function anchorAll(model: Model)
	for _, p in model:GetDescendants() do
		if p:IsA("BasePart") then
			p.Anchored = true
			p.CanTouch = false
		end
	end
end

----------------------------------------------------------------------
-- Конкретные персонажи
----------------------------------------------------------------------

-- Йозеф как NPC-модель (для финальной сцены и превью)
function Art.Josef(color: Color3?, dark: Color3?): Model
	local m, a = Art.robot("Josef", {
		color = color or C.Rust,
		dark = dark or C.RustDark,
		legLen = 1.4,
		body = { shape = "Cyl", size = Vector3.new(1.7, 1.6, 1.7) },
		head = { shape = "Bullet", size = Vector3.new(1.5, 1.7, 1.5) },
		neck = 0.35,
		arms = 1.5,
		eyes = { size = 0.62, gap = 0.3, y = 0.05, lid = color or C.Rust },
	})
	-- люк в животе (инвентарь!)
	Art.part(m, "CylZ", Vector3.new(0.8, 0.8, 0.1), a.body * CFrame.new(0, -0.1, -0.86), C.Brass, Enum.Material.Metal, "Hatch")
	Art.part(m, "CylZ", Vector3.new(0.6, 0.6, 0.1), a.body * CFrame.new(0, -0.1, -0.9), C.Soot, Enum.Material.Metal, "HatchIn")
	anchorAll(m)
	return m
end

-- Берта: круглая голова с веками и ресницами, юбка-колокол, цветок на макушке
function Art.Berta(dress: Color3?, flowerLevel: number?): Model
	local m = Instance.new("Model")
	m.Name = "Berta"
	local cream = C.BertaCream
	local dressColor = dress or cream
	local dressDark = dressColor:Lerp(Color3.new(0, 0, 0), 0.18)
	local dark = Color3.fromRGB(140, 120, 100)
	local pink = C.BertaPink
	local O = CFrame.new()
	local root = Art.part(m, "Block", Vector3.new(1, 1, 1), O, cream, nil, "Root")
	root.Transparency = 1
	root.CanCollide = false
	m.PrimaryPart = root
	-- ножки с коленками и туфельками
	for _, sx in { -1, 1 } do
		local x = sx * 0.3
		Art.part(m, "Cyl", Vector3.new(0.2, 0.75, 0.2), O * CFrame.new(x, 1.28, 0), dark, Enum.Material.Metal, "Thigh")
		Art.part(m, "Ball", Vector3.new(0.3, 0.3, 0.3), O * CFrame.new(x, 0.92, 0), cream, Enum.Material.SmoothPlastic, "Knee")
		Art.part(m, "Cyl", Vector3.new(0.17, 0.7, 0.17), O * CFrame.new(x, 0.58, 0), dark, Enum.Material.Metal, "Shin")
		Art.part(m, "Cyl", Vector3.new(0.5, 0.24, 0.5), O * CFrame.new(x, 0.12, -0.02), pink, Enum.Material.SmoothPlastic, "Shoe")
		Art.part(m, "Ball", Vector3.new(0.42, 0.42, 0.42), O * CFrame.new(x, 0.18, -0.22), pink, Enum.Material.SmoothPlastic, "ShoeToe")
		Art.part(m, "Cyl", Vector3.new(0.54, 0.05, 0.54), O * CFrame.new(x, 0.26, -0.02), dark, Enum.Material.Metal, "ShoeStrap")
	end
	-- юбка-колокол: кольца с подолом и заклёпками
	local y = 1.55
	Art.part(m, "Cyl", Vector3.new(2.14, 0.12, 2.14), O * CFrame.new(0, y - 0.18, 0), dressDark, Enum.Material.Metal, "Hem")
	for i = 0, 11 do
		local an = i / 12 * math.pi * 2
		Art.part(m, "Ball", Vector3.new(0.1, 0.1, 0.1), O * CFrame.new(math.sin(an) * 1.07, y - 0.18, math.cos(an) * 1.07), C.Brass, Enum.Material.Metal, "HemRivet")
	end
	for i = 0, 4 do
		local d = 2.05 - i * 0.24
		Art.part(m, "Cyl", Vector3.new(d, 0.26, d), O * CFrame.new(0, y, 0), if i % 2 == 0 then dressColor else dressDark, Enum.Material.SmoothPlastic, "Dress")
		y += 0.24
	end
	-- корсаж, пояс с пряжкой, пуговки, воротничок
	Art.part(m, "Cyl", Vector3.new(1.02, 0.12, 1.02), O * CFrame.new(0, y - 0.02, 0), pink, Enum.Material.SmoothPlastic, "Belt")
	Art.part(m, "Block", Vector3.new(0.22, 0.16, 0.06), O * CFrame.new(0, y - 0.02, -0.52), C.Brass, Enum.Material.Metal, "Buckle")
	Art.part(m, "Cyl", Vector3.new(0.95, 0.8, 0.95), O * CFrame.new(0, y + 0.42, 0), cream, Enum.Material.SmoothPlastic, "Chest")
	for i = 0, 2 do
		Art.part(m, "Ball", Vector3.new(0.1, 0.1, 0.1), O * CFrame.new(0, y + 0.2 + i * 0.2, -0.47), pink, Enum.Material.SmoothPlastic, "Button")
	end
	Art.part(m, "Cyl", Vector3.new(1.1, 0.1, 1.1), O * CFrame.new(0, y + 0.84, 0), pink, Enum.Material.SmoothPlastic, "Collar")
	-- ручки с локотками
	local sh = y + 0.72
	for _, sx in { -1, 1 } do
		Art.part(m, "Ball", Vector3.new(0.3, 0.3, 0.3), O * CFrame.new(sx * 0.55, sh, 0), cream, Enum.Material.SmoothPlastic, "Shoulder")
		Art.part(m, "Cyl", Vector3.new(0.14, 0.6, 0.14), O * CFrame.new(sx * 0.63, sh - 0.3, 0) * CFrame.Angles(0, 0, sx * math.rad(15)), dark, Enum.Material.Metal, "UpperArm")
		Art.part(m, "Ball", Vector3.new(0.18, 0.18, 0.18), O * CFrame.new(sx * 0.71, sh - 0.6, 0), cream, Enum.Material.SmoothPlastic, "Elbow")
		Art.part(m, "Cyl", Vector3.new(0.12, 0.55, 0.12), O * CFrame.new(sx * 0.76, sh - 0.87, -0.05) * CFrame.Angles(math.rad(10), 0, sx * math.rad(8)), dark, Enum.Material.Metal, "Forearm")
		Art.part(m, "Ball", Vector3.new(0.26, 0.26, 0.26), O * CFrame.new(sx * 0.8, sh - 1.18, -0.1), cream, Enum.Material.SmoothPlastic, "Hand")
	end
	-- шея из колечек
	for i = 0, 2 do
		Art.part(m, "Cyl", Vector3.new(0.3 - i * 0.02, 0.1, 0.3 - i * 0.02), O * CFrame.new(0, y + 0.92 + i * 0.12, 0), if i % 2 == 0 then dark else cream, Enum.Material.Metal, "NeckRing")
	end
	-- большая круглая голова
	local headCF = O * CFrame.new(0, y + 2.05, 0)
	Art.part(m, "Ball", Vector3.new(2.1, 2.1, 2.1), headCF, cream, Enum.Material.SmoothPlastic, "Head")
	-- шов-обруч вокруг головы и «ушки»-диски
	Art.part(m, "Cyl", Vector3.new(1.3, 0.06, 1.3), headCF * CFrame.new(0, -0.84, 0), dark, Enum.Material.Metal, "Seam")
	for _, sx in { -1, 1 } do
		Art.part(m, "CylX", Vector3.new(0.12, 0.5, 0.5), headCF * CFrame.new(sx * 1.03, 0.05, 0), pink, Enum.Material.SmoothPlastic, "Ear")
		Art.part(m, "CylX", Vector3.new(0.14, 0.22, 0.22), headCF * CFrame.new(sx * 1.09, 0.05, 0), C.Brass, Enum.Material.Metal, "EarBolt")
	end
	Art.eyes(m, headCF, { size = 0.58, gap = 0.34, y = 0.08, z = -0.97, rim = Color3.fromRGB(190, 170, 140) })
	-- реснички над веками
	for _, sx in { -1, 1 } do
		for k = -1, 1 do
			Art.part(m, "Block", Vector3.new(0.05, 0.24, 0.05), headCF * CFrame.new(sx * 0.34 + k * 0.14, 0.5, -1.0) * CFrame.Angles(0, 0, k * math.rad(-25)), C.Soot, nil, "Lash")
		end
	end
	-- улыбка из трёх чёрточек
	for k = -1, 1 do
		Art.part(m, "Block", Vector3.new(0.16, 0.05, 0.05), headCF * CFrame.new(k * 0.13, -0.42 + math.abs(k) * 0.05, -1.0) * CFrame.Angles(0, 0, k * math.rad(25)), C.Soot, nil, "Smile")
	end
	-- румянец
	for _, sx in { -1, 1 } do
		Art.part(m, "CylZ", Vector3.new(0.3, 0.3, 0.05), headCF * CFrame.new(sx * 0.66, -0.3, -0.82), pink, nil, "Blush")
	end
	-- цветок на макушке (растёт с прокачкой «Цветок любви»)
	local lvl = flowerLevel or 0
	local fs = 0.6 + lvl * 0.18
	local stemTop = headCF * CFrame.new(0, 1.05 + 0.5 * fs, 0)
	Art.part(m, "Cyl", Vector3.new(0.1, 1.0 * fs, 0.1), headCF * CFrame.new(0, 1.0 + 0.25 * fs, 0), C.Moss, nil, "Stem")
	Art.part(m, "Block", Vector3.new(0.35 * fs, 0.05, 0.18 * fs), headCF * CFrame.new(0.18 * fs, 1.1 + 0.2 * fs, 0) * CFrame.Angles(0, 0, math.rad(25)), C.Moss, nil, "Leaf")
	for i = 0, 5 do
		local ang = i * math.pi / 3
		Art.part(m, "Ball", Vector3.new(0.4 * fs, 0.4 * fs, 0.4 * fs), stemTop * CFrame.new(math.cos(ang) * 0.3 * fs, 0, math.sin(ang) * 0.3 * fs), pink, nil, "Petal")
	end
	Art.part(m, "Ball", Vector3.new(0.34 * fs, 0.34 * fs, 0.34 * fs), stemTop, Color3.fromRGB(240, 200, 70), Enum.Material.Neon, "FlowerCore")
	anchorAll(m)
	-- ростом примерно с Йозефа
	m:ScaleTo(0.8)
	return m
end

-- Братство Чёрной Шляпы
function Art.BlackCap(kind: string): Model
	local pale = C.Pale
	local dark = Color3.fromRGB(90, 88, 84)
	if kind == "Fat" then
		local m, a = Art.robot("Толстый", {
			color = pale,
			dark = dark,
			legLen = 1.2,
			legGap = 0.7,
			legD = 0.4,
			body = { shape = "Ball", size = Vector3.new(3.4, 3.4, 3.4) },
			head = { shape = "Ball", size = Vector3.new(1.4, 1.4, 1.4) },
			neck = 0,
			arms = 1.6,
			eyes = { size = 0.42, gap = 0.26, angry = true },
			hat = "bowler",
			hatScale = 0.85,
		})
		Art.part(m, "Block", Vector3.new(1.2, 0.12, 0.1), a.body * CFrame.new(0, 1.0, -1.66), C.Soot, nil, "Stitch")
		anchorAll(m)
		return m
	elseif kind == "Thin" then
		local m = Art.robot("Тонкий", {
			color = pale,
			dark = dark,
			legLen = 2.8,
			legGap = 0.25,
			legD = 0.22,
			body = { shape = "Cyl", size = Vector3.new(0.8, 2.4, 0.8) },
			head = { shape = "Cyl", size = Vector3.new(0.9, 1.3, 0.9) },
			neck = 0.8,
			arms = 2.0,
			eyes = { size = 0.36, gap = 0.2, angry = true },
			hat = "bowler",
			hatScale = 0.7,
		})
		return m
	else
		local m, a = Art.robot("Главарь", {
			color = Color3.fromRGB(150, 146, 136),
			dark = C.IronDark,
			legLen = 2.0,
			legGap = 0.45,
			body = { shape = "Block", size = Vector3.new(1.8, 2.4, 1.3) },
			head = { shape = "Block", size = Vector3.new(1.5, 1.3, 1.3) },
			neck = 0.4,
			arms = 1.9,
			eyes = { size = 0.46, gap = 0.3, angry = true },
			hat = "bowler",
		})
		-- усы главаря
		for _, sx in { -1, 1 } do
			Art.part(m, "Block", Vector3.new(0.6, 0.14, 0.1), a.head * CFrame.new(sx * 0.32, -0.38, -0.7) * CFrame.Angles(0, 0, sx * math.rad(-15)), C.Soot, nil, "Mustache")
		end
		-- чёрный галстук
		Art.part(m, "Wedge", Vector3.new(0.1, 1.1, 0.4), a.body * CFrame.new(0, 0.3, -0.7) * CFrame.Angles(0, math.rad(90), math.rad(180)), C.BlackCap, nil, "Tie")
		anchorAll(m)
		return m
	end
end

-- Стражник на стене
function Art.Guard(): Model
	local m, a = Art.robot("Стражник", {
		color = C.Iron,
		dark = C.IronDark,
		legLen = 2.2,
		legGap = 0.6,
		legD = 0.45,
		body = { shape = "Block", size = Vector3.new(2.8, 2.8, 2.0) },
		head = { shape = "Cyl", size = Vector3.new(1.6, 1.4, 1.6) },
		neck = 0.2,
		arms = 2.2,
		eyes = { size = 0.4, gap = 0.28, sleepy = true },
		hat = "helmet",
		hatScale = 0.85,
	})
	-- алебарда
	Art.part(m, "Cyl", Vector3.new(0.18, 7, 0.18), a.body * CFrame.new(1.9, 0.5, -0.3), C.RustDark, Enum.Material.Wood, "Pole")
	Art.part(m, "Wedge", Vector3.new(0.1, 1.2, 1.0), a.body * CFrame.new(1.9, 4.1, -0.7), C.Iron, Enum.Material.Metal, "Blade")
	-- подзорная труба на поясе
	Art.part(m, "CylX", Vector3.new(1.2, 0.3, 0.3), a.body * CFrame.new(-1.3, -0.9, -0.6), C.Brass, Enum.Material.Metal, "Spyglass")
	anchorAll(m)
	return m
end

-- Уличный оркестр: диджериду, барабан, саксофон
function Art.Musician(kind: string): Model
	if kind == "didgeridoo" then
		local m, a = Art.robot("Диджеридушник", {
			color = Color3.fromRGB(128, 110, 80),
			dark = C.RustDark,
			legLen = 1.4,
			body = { shape = "Cyl", size = Vector3.new(1.4, 1.8, 1.4) },
			head = { shape = "Ball", size = Vector3.new(1.4, 1.4, 1.4) },
			arms = 1.3,
			eyes = { size = 0.44, gap = 0.26, sleepy = true },
		})
		Art.part(m, "Cyl", Vector3.new(0.4, 4.0, 0.4), a.head * CFrame.new(0, -1.8, -1.3) * CFrame.Angles(math.rad(-25), 0, 0), Color3.fromRGB(150, 100, 50), Enum.Material.Wood, "Didgeridoo")
		anchorAll(m)
		return m
	elseif kind == "drum" then
		local m, a = Art.robot("Барабанщик", {
			color = Color3.fromRGB(120, 100, 88),
			dark = C.IronDark,
			legLen = 1.0,
			body = { shape = "Ball", size = Vector3.new(2.2, 2.2, 2.2) },
			head = { shape = "Cyl", size = Vector3.new(1.2, 1.0, 1.2) },
			arms = 1.2,
			eyes = { size = 0.4, gap = 0.24 },
		})
		Art.part(m, "Cyl", Vector3.new(1.8, 1.0, 1.8), a.body * CFrame.new(0, -0.6, -1.7), Color3.fromRGB(180, 60, 50), Enum.Material.SmoothPlastic, "Drum")
		Art.part(m, "Cyl", Vector3.new(1.82, 0.08, 1.82), a.body * CFrame.new(0, -0.08, -1.7), C.Paper, Enum.Material.Fabric, "DrumSkin")
		anchorAll(m)
		return m
	else
		local m, a = Art.robot("Саксофонист", {
			color = Color3.fromRGB(140, 120, 110),
			dark = C.RustDark,
			legLen = 1.8,
			body = { shape = "Cyl", size = Vector3.new(1.2, 1.8, 1.2) },
			head = { shape = "Bullet", size = Vector3.new(1.2, 1.4, 1.2) },
			arms = 1.3,
			eyes = { size = 0.44, gap = 0.24 },
		})
		Art.part(m, "Cyl", Vector3.new(0.3, 1.8, 0.3), a.body * CFrame.new(0.2, 0, -0.9) * CFrame.Angles(0, 0, math.rad(15)), C.Brass, Enum.Material.Metal, "Sax")
		Art.part(m, "Cyl", Vector3.new(0.6, 0.5, 0.6), a.body * CFrame.new(0.5, -0.9, -1.0), C.Brass, Enum.Material.Metal, "SaxBell")
		anchorAll(m)
		return m
	end
end

-- Заключённые в тюрьме
function Art.Prisoner(kind: string): Model
	if kind == "fat" then
		return Art.robot("Толстый заключённый", {
			color = Color3.fromRGB(150, 120, 90),
			legLen = 1.0,
			legGap = 0.6,
			body = { shape = "Ball", size = Vector3.new(2.8, 2.8, 2.8) },
			head = { shape = "Cyl", size = Vector3.new(1.2, 0.8, 1.2) },
			neck = 0,
			arms = 1.3,
			eyes = { size = 0.36, gap = 0.22, sleepy = true },
		})
	elseif kind == "skinny" then
		return Art.robot("Тощий заключённый", {
			color = Color3.fromRGB(120, 124, 110),
			legLen = 2.4,
			legGap = 0.2,
			legD = 0.2,
			body = { shape = "Cyl", size = Vector3.new(0.7, 2.0, 0.7) },
			head = { shape = "Block", size = Vector3.new(0.9, 1.4, 0.9) },
			neck = 0.5,
			arms = 1.8,
			eyes = { size = 0.3, gap = 0.2 },
		})
	else
		local m, a = Art.robot("Курильщик", {
			color = Color3.fromRGB(100, 96, 90),
			legLen = 1.5,
			body = { shape = "Block", size = Vector3.new(1.6, 1.6, 1.2) },
			head = { shape = "Cyl", size = Vector3.new(1.3, 1.1, 1.3) },
			arms = 1.3,
			eyes = { size = 0.4, gap = 0.26, sleepy = true },
		})
		local cig = Art.part(m, "CylX", Vector3.new(0.7, 0.12, 0.12), a.head * CFrame.new(0.35, -0.35, -0.75), C.Paper, nil, "Cigarette")
		local smoke = Instance.new("ParticleEmitter")
		smoke.Texture = "rbxasset://textures/particles/smoke_main.dds"
		smoke.Rate = 3
		smoke.Lifetime = NumberRange.new(2, 3)
		smoke.Speed = NumberRange.new(1, 2)
		smoke.Size = NumberSequence.new(0.3, 1.5)
		smoke.Transparency = NumberSequence.new(0.5, 1)
		smoke.Color = ColorSequence.new(Color3.fromRGB(200, 200, 200))
		smoke.Parent = cig
		anchorAll(m)
		return m
	end
end

-- Бармен и робот-игрок в «пять в ряд»
function Art.Barman(): Model
	local m = Art.robot("Бармен", {
		color = Color3.fromRGB(160, 140, 110),
		dark = C.RustDark,
		legLen = 1.4,
		body = { shape = "Cyl", size = Vector3.new(2.0, 2.0, 2.0) },
		head = { shape = "Cyl", size = Vector3.new(1.3, 1.1, 1.3) },
		arms = 1.4,
		eyes = { size = 0.44, gap = 0.26 },
		hat = "chef",
		hatScale = 0.7,
	})
	return m
end

function Art.GomokuBot(): Model
	local m, a = Art.robot("Игрок в «пять в ряд»", {
		color = Color3.fromRGB(110, 120, 130),
		dark = C.IronDark,
		legLen = 1.0,
		body = { shape = "Block", size = Vector3.new(1.8, 1.6, 1.4) },
		head = { shape = "Block", size = Vector3.new(1.6, 1.2, 1.2) },
		arms = 1.2,
		eyes = { size = 0.5, gap = 0.34 },
	})
	-- антенна-«мозг»
	Art.part(m, "Cyl", Vector3.new(0.1, 0.8, 0.1), a.top * CFrame.new(0, 0.4, 0), C.Iron, Enum.Material.Metal, "Antenna")
	Art.part(m, "Ball", Vector3.new(0.3, 0.3, 0.3), a.top * CFrame.new(0, 0.85, 0), Color3.fromRGB(255, 80, 60), Enum.Material.Neon, "Bulb")
	anchorAll(m)
	return m
end

function Art.Policeman(): Model
	local m = Art.robot("Полицейский", {
		color = Color3.fromRGB(80, 90, 120),
		dark = Color3.fromRGB(40, 46, 66),
		legLen = 1.8,
		body = { shape = "Cyl", size = Vector3.new(2.2, 2.2, 2.2) },
		head = { shape = "Cyl", size = Vector3.new(1.3, 1.1, 1.3) },
		arms = 1.6,
		eyes = { size = 0.4, gap = 0.24 },
		hat = "police",
	})
	return m
end

function Art.RoboDog(): Model
	local m = Instance.new("Model")
	m.Name = "Робопёс"
	local O = CFrame.new()
	local root = Art.part(m, "Block", Vector3.new(1, 1, 1), O, C.Iron, nil, "Root")
	root.Transparency = 1
	m.PrimaryPart = root
	Art.part(m, "CylZ", Vector3.new(1.1, 1.1, 2.0), O * CFrame.new(0, 1.3, 0), C.Iron, Enum.Material.Metal, "Body")
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			Art.part(m, "Cyl", Vector3.new(0.2, 0.9, 0.2), O * CFrame.new(sx * 0.35, 0.45, sz * 0.7), C.IronDark, Enum.Material.Metal, "Leg")
		end
	end
	local head = O * CFrame.new(0, 1.8, -1.2)
	Art.part(m, "Block", Vector3.new(0.9, 0.8, 1.0), head, C.Iron, Enum.Material.Metal, "Head")
	Art.eyes(m, head, { size = 0.3, gap = 0.2, z = -0.52, sleepy = true })
	Art.part(m, "CylX", Vector3.new(0.3, 0.3, 0.3), head * CFrame.new(0, -0.1, -0.6), C.Soot, nil, "Nose")
	-- пустой отсек для батарейки
	Art.part(m, "Block", Vector3.new(0.5, 0.3, 0.6), O * CFrame.new(0, 1.9, 0.2), Color3.fromRGB(200, 60, 50), Enum.Material.Neon, "BatterySlot")
	Art.part(m, "Cyl", Vector3.new(0.1, 0.8, 0.1), O * CFrame.new(0, 1.9, 1.2) * CFrame.Angles(math.rad(-40), 0, 0), C.IronDark, Enum.Material.Metal, "Tail")
	anchorAll(m)
	return m
end

-- Робокот
function Art.Cat(): Model
	local m = Instance.new("Model")
	m.Name = "Кот"
	local O = CFrame.new()
	local col = Color3.fromRGB(70, 66, 62)
	local root = Art.part(m, "Block", Vector3.new(1, 1, 1), O, col, nil, "Root")
	root.Transparency = 1
	m.PrimaryPart = root
	Art.part(m, "CylZ", Vector3.new(0.9, 0.9, 1.6), O * CFrame.new(0, 0.9, 0), col, Enum.Material.Metal, "Body")
	for _, sx in { -1, 1 } do
		for _, sz in { -1, 1 } do
			Art.part(m, "Cyl", Vector3.new(0.14, 0.6, 0.14), O * CFrame.new(sx * 0.28, 0.3, sz * 0.55), C.Soot, Enum.Material.Metal, "Leg")
		end
	end
	local head = O * CFrame.new(0, 1.35, -0.95)
	Art.part(m, "Ball", Vector3.new(0.9, 0.9, 0.9), head, col, Enum.Material.Metal, "Head")
	for _, sx in { -1, 1 } do
		Art.part(m, "Wedge", Vector3.new(0.12, 0.45, 0.35), head * CFrame.new(sx * 0.25, 0.5, 0), col, Enum.Material.Metal, "Ear")
	end
	Art.eyes(m, head, { size = 0.3, gap = 0.17, z = -0.4 })
	Art.part(m, "Cyl", Vector3.new(0.1, 1.2, 0.1), O * CFrame.new(0, 1.4, 1.0) * CFrame.Angles(math.rad(-30), 0, 0), col, Enum.Material.Metal, "Tail")
	anchorAll(m)
	return m
end

-- Вентилятор у теплицы (с глазами, задаёт вопросы)
function Art.Fan(): Model
	local m = Instance.new("Model")
	m.Name = "Вентилятор"
	local O = CFrame.new()
	local root = Art.part(m, "Block", Vector3.new(1, 1, 1), O, C.Iron, nil, "Root")
	root.Transparency = 1
	m.PrimaryPart = root
	Art.part(m, "Cyl", Vector3.new(0.4, 3.0, 0.4), O * CFrame.new(0, 1.5, 0), C.IronDark, Enum.Material.Metal, "Stand")
	Art.part(m, "Cyl", Vector3.new(2.0, 0.3, 2.0), O * CFrame.new(0, 0.15, 0), C.IronDark, Enum.Material.Metal, "Base")
	local hub = O * CFrame.new(0, 4.6, 0)
	Art.part(m, "CylZ", Vector3.new(4.4, 4.4, 0.3), hub * CFrame.new(0, 0, 0.3), C.Iron, Enum.Material.DiamondPlate, "Ring")
	local blades = Instance.new("Model")
	blades.Name = "Blades"
	blades.Parent = m
	for i = 0, 3 do
		Art.part(blades, "Block", Vector3.new(0.9, 1.9, 0.08), hub * CFrame.Angles(0, 0, i * math.pi / 2) * CFrame.new(0, 1.0, -0.1) * CFrame.Angles(0, math.rad(20), 0), Color3.fromRGB(200, 190, 170), Enum.Material.Metal, "Blade")
	end
	Art.part(m, "CylZ", Vector3.new(0.9, 0.9, 0.5), hub * CFrame.new(0, 0, -0.2), C.Brass, Enum.Material.Metal, "Hub")
	Art.eyes(m, hub * CFrame.new(0, 2.6, 0), { size = 0.6, gap = 0.4, z = 0, angry = false })
	anchorAll(m)
	return m
end

-- Друг с огромной головой (наверху Башни)
function Art.BigHead(): Model
	local m, a = Art.robot("Большеголовый друг", {
		color = Color3.fromRGB(170, 150, 120),
		dark = C.RustDark,
		legLen = 1.0,
		body = { shape = "Cyl", size = Vector3.new(1.6, 1.4, 1.6) },
		head = { shape = "Ball", size = Vector3.new(6, 6, 6) },
		neck = 0.6,
		arms = 1.2,
		eyes = { size = 1.4, gap = 0.9, sleepy = true, y = 0.4 },
	})
	-- «шов» на голове
	Art.part(m, "Block", Vector3.new(0.2, 2.0, 0.1), a.head * CFrame.new(1.2, 1.6, -2.4) * CFrame.Angles(0, 0, math.rad(25)), C.Soot, nil, "Scar")
	anchorAll(m)
	return m
end

-- Гномик из Samorost (пасхалка)
function Art.Gnome(): Model
	local m, a = Art.robot("Гномик", {
		color = Color3.fromRGB(245, 245, 238),
		dark = Color3.fromRGB(200, 200, 190),
		material = Enum.Material.Fabric,
		legLen = 0.4,
		legD = 0.2,
		legGap = 0.2,
		body = { shape = "Cyl", size = Vector3.new(0.8, 0.8, 0.8) },
		head = { shape = "Ball", size = Vector3.new(0.9, 0.9, 0.9) },
		neck = 0,
		arms = 0.5,
		eyes = { size = 0.26, gap = 0.14 },
		hat = "gnome",
		hatScale = 0.55,
	})
	local _ = a
	return m
end

-- Мухомор Amanita
function Art.Amanita(scale: number?): Model
	local s = scale or 1
	local m = Instance.new("Model")
	m.Name = "Мухомор"
	local O = CFrame.new()
	local stem = Art.part(m, "Cyl", Vector3.new(0.8 * s, 1.6 * s, 0.8 * s), O * CFrame.new(0, 0.8 * s, 0), Color3.fromRGB(245, 240, 225), Enum.Material.SmoothPlastic, "Stem")
	m.PrimaryPart = stem
	Art.part(m, "Cyl", Vector3.new(2.4 * s, 0.35 * s, 2.4 * s), O * CFrame.new(0, 1.7 * s, 0), Color3.fromRGB(200, 40, 30), Enum.Material.SmoothPlastic, "Cap")
	Art.part(m, "Ball", Vector3.new(2.2 * s, 2.2 * s, 2.2 * s), O * CFrame.new(0, 1.55 * s, 0), Color3.fromRGB(200, 40, 30), Enum.Material.SmoothPlastic, "CapTop")
	local rnd = Random.new(7)
	for _ = 1, 9 do
		local ang = rnd:NextNumber(0, math.pi * 2)
		local r = rnd:NextNumber(0.2, 0.9) * s
		local pos = Vector3.new(math.cos(ang) * r, 0, math.sin(ang) * r)
		local h = math.sqrt(math.max(0, (1.1 * s) ^ 2 - r * r))
		Art.part(m, "Ball", Vector3.new(0.28 * s, 0.28 * s, 0.28 * s), O * CFrame.new(pos.X, 1.55 * s + h, pos.Z), Color3.fromRGB(250, 250, 245), nil, "Dot")
	end
	anchorAll(m)
	return m
end

return Art
