--!nonstrict
-- Graphics: «шейдеры» Машинариума — пресеты пост-обработки Roblox
-- (цветокоррекция, bloom, лучи солнца, глубина резкости, атмосфера, облака)
-- плюс экранные эффекты: виньетка, кинополосы, мерцание плёнки, пыль в воздухе.
-- Всё меняется только у этого игрока (локально).

local Players = game:GetService("Players")
local Lighting = game:GetService("Lighting")
local RunService = game:GetService("RunService")
local TweenService = game:GetService("TweenService")

local Graphics = {}
local player = Players.LocalPlayer

export type Preset = {
	id: string,
	name: string,
	desc: string,
	clock: number,
	brightness: number,
	exposure: number,
	ambient: Color3,
	outdoor: Color3,
	atmDensity: number,
	atmHaze: number,
	atmColor: Color3,
	atmDecay: Color3,
	tint: Color3,
	saturation: number,
	contrast: number,
	ccBrightness: number,
	bloom: number,
	bloomSize: number,
	bloomThreshold: number,
	rays: number,
	dofFar: number,
	dofRadius: number,
	clouds: number,
	vignette: number,
	letterbox: boolean,
	flicker: boolean,
	dust: boolean,
	shadows: boolean,
}

Graphics.Presets = {
	{
		id = "sunset",
		name = "🌅 Ржавый закат",
		desc = "Тёплый вечер, лучи солнца, мягкая дымка — как на картинах из игры.",
		clock = 17.4, brightness = 2.2, exposure = 0.1,
		ambient = Color3.fromRGB(90, 70, 55), outdoor = Color3.fromRGB(150, 120, 90),
		atmDensity = 0.36, atmHaze = 1.6, atmColor = Color3.fromRGB(210, 170, 120), atmDecay = Color3.fromRGB(120, 80, 50),
		tint = Color3.fromRGB(255, 236, 205), saturation = -0.12, contrast = 0.1, ccBrightness = 0.02,
		bloom = 0.7, bloomSize = 30, bloomThreshold = 1.4, rays = 0.1, dofFar = 0.2, dofRadius = 60,
		clouds = 0.55, vignette = 0.35, letterbox = false, flicker = false, dust = true, shadows = true,
	},
	{
		id = "cinema",
		name = "🎬 Кино",
		desc = "Контраст, сильная глубина резкости, кинополосы и виньетка.",
		clock = 17.8, brightness = 2.4, exposure = 0,
		ambient = Color3.fromRGB(70, 60, 55), outdoor = Color3.fromRGB(130, 110, 95),
		atmDensity = 0.3, atmHaze = 1.2, atmColor = Color3.fromRGB(200, 160, 120), atmDecay = Color3.fromRGB(90, 60, 45),
		tint = Color3.fromRGB(255, 232, 210), saturation = -0.05, contrast = 0.28, ccBrightness = -0.02,
		bloom = 1.0, bloomSize = 40, bloomThreshold = 1.2, rays = 0.14, dofFar = 0.5, dofRadius = 30,
		clouds = 0.5, vignette = 0.6, letterbox = true, flicker = false, dust = true, shadows = true,
	},
	{
		id = "night",
		name = "🌙 Ночной город",
		desc = "Темно, горят фонари, окна и гирлянды. Лучше всего с освещением Future.",
		clock = 21.3, brightness = 0.6, exposure = 0.35,
		ambient = Color3.fromRGB(30, 34, 50), outdoor = Color3.fromRGB(50, 56, 80),
		atmDensity = 0.42, atmHaze = 1.4, atmColor = Color3.fromRGB(70, 80, 110), atmDecay = Color3.fromRGB(40, 40, 60),
		tint = Color3.fromRGB(215, 225, 255), saturation = -0.1, contrast = 0.15, ccBrightness = 0.03,
		bloom = 1.4, bloomSize = 36, bloomThreshold = 0.9, rays = 0, dofFar = 0.15, dofRadius = 70,
		clouds = 0.4, vignette = 0.45, letterbox = false, flicker = false, dust = true, shadows = true,
	},
	{
		id = "fog",
		name = "🌫️ Туман над свалкой",
		desc = "Густая дымка, приглушённые цвета, дальние башни тонут в тумане.",
		clock = 16.2, brightness = 1.6, exposure = 0.15,
		ambient = Color3.fromRGB(100, 96, 90), outdoor = Color3.fromRGB(150, 145, 135),
		atmDensity = 0.58, atmHaze = 3.2, atmColor = Color3.fromRGB(190, 185, 170), atmDecay = Color3.fromRGB(130, 120, 105),
		tint = Color3.fromRGB(240, 238, 228), saturation = -0.35, contrast = 0.05, ccBrightness = 0.02,
		bloom = 0.5, bloomSize = 44, bloomThreshold = 1.5, rays = 0.04, dofFar = 0.3, dofRadius = 45,
		clouds = 0.85, vignette = 0.3, letterbox = false, flicker = false, dust = true, shadows = true,
	},
	{
		id = "film",
		name = "📽️ Старая плёнка",
		desc = "Сепия, мерцание кадра и тёмные края — как старая кинохроника.",
		clock = 15, brightness = 2, exposure = 0.05,
		ambient = Color3.fromRGB(100, 90, 75), outdoor = Color3.fromRGB(150, 135, 110),
		atmDensity = 0.3, atmHaze = 1.5, atmColor = Color3.fromRGB(200, 180, 150), atmDecay = Color3.fromRGB(110, 90, 70),
		tint = Color3.fromRGB(255, 225, 175), saturation = -0.85, contrast = 0.3, ccBrightness = 0,
		bloom = 0.6, bloomSize = 24, bloomThreshold = 1.4, rays = 0.05, dofFar = 0.25, dofRadius = 50,
		clouds = 0.5, vignette = 0.8, letterbox = false, flicker = true, dust = true, shadows = true,
	},
	{
		id = "vivid",
		name = "🌈 Яркий день",
		desc = "Сочные цвета, ясное небо, чёткие тени.",
		clock = 13.5, brightness = 3, exposure = 0,
		ambient = Color3.fromRGB(110, 100, 90), outdoor = Color3.fromRGB(170, 160, 150),
		atmDensity = 0.22, atmHaze = 0.8, atmColor = Color3.fromRGB(200, 210, 230), atmDecay = Color3.fromRGB(100, 120, 150),
		tint = Color3.fromRGB(255, 250, 240), saturation = 0.25, contrast = 0.12, ccBrightness = 0.03,
		bloom = 0.4, bloomSize = 24, bloomThreshold = 1.8, rays = 0.06, dofFar = 0.08, dofRadius = 80,
		clouds = 0.35, vignette = 0.15, letterbox = false, flicker = false, dust = false, shadows = true,
	},
	{
		id = "low",
		name = "⚡ Слабое устройство",
		desc = "Почти всё выключено: максимум FPS на старых телефонах.",
		clock = 17.4, brightness = 2.2, exposure = 0,
		ambient = Color3.fromRGB(120, 100, 85), outdoor = Color3.fromRGB(160, 135, 110),
		atmDensity = 0.25, atmHaze = 0.5, atmColor = Color3.fromRGB(210, 170, 120), atmDecay = Color3.fromRGB(120, 80, 50),
		tint = Color3.fromRGB(255, 240, 220), saturation = -0.1, contrast = 0.05, ccBrightness = 0,
		bloom = 0, bloomSize = 10, bloomThreshold = 3, rays = 0, dofFar = 0, dofRadius = 100,
		clouds = 0, vignette = 0, letterbox = false, flicker = false, dust = false, shadows = false,
	},
}

local current: any = nil
local fx: { [string]: Instance } = {}
local overlay: ScreenGui
local vignetteFrames: { Frame } = {}
local bars: { Frame } = {}
local dustPart: BasePart? = nil

local function effect(className: string): any
	local e = fx[className]
	if e and e.Parent then
		return e
	end
	-- берём эффект, созданный сервером, или создаём свой
	for _, c in Lighting:GetChildren() do
		if c.ClassName == className then
			fx[className] = c
			return c
		end
	end
	local ok, inst = pcall(Instance.new, className)
	if ok and inst then
		inst.Parent = Lighting
		fx[className] = inst
		return inst
	end
	return nil
end

local function buildOverlay()
	overlay = Instance.new("ScreenGui")
	overlay.Name = "GfxOverlay"
	overlay.IgnoreGuiInset = true
	overlay.ResetOnSpawn = false
	overlay.DisplayOrder = -10
	overlay.Parent = player:WaitForChild("PlayerGui")
	-- виньетка из четырёх градиентных краёв
	local edges = {
		{ UDim2.new(1, 0, 0.35, 0), UDim2.new(0, 0, 0, 0), 90 },
		{ UDim2.new(1, 0, 0.35, 0), UDim2.new(0, 0, 0.65, 0), -90 },
		{ UDim2.new(0.3, 0, 1, 0), UDim2.new(0, 0, 0, 0), 0 },
		{ UDim2.new(0.3, 0, 1, 0), UDim2.new(0.7, 0, 0, 0), 180 },
	}
	for _, e in edges do
		local f = Instance.new("Frame")
		f.Size = e[1]
		f.Position = e[2]
		f.BackgroundColor3 = Color3.fromRGB(20, 12, 6)
		f.BorderSizePixel = 0
		f.BackgroundTransparency = 0
		local g = Instance.new("UIGradient")
		g.Rotation = e[3]
		g.Transparency = NumberSequence.new({
			NumberSequenceKeypoint.new(0, 0.3),
			NumberSequenceKeypoint.new(1, 1),
		})
		g.Parent = f
		f.Parent = overlay
		table.insert(vignetteFrames, f)
	end
	-- кинополосы
	for i, pos in { UDim2.new(0, 0, 0, 0), UDim2.new(0, 0, 1, 0) } do
		local b = Instance.new("Frame")
		b.Size = UDim2.new(1, 0, 0, 0)
		b.Position = pos
		b.AnchorPoint = Vector2.new(0, if i == 1 then 0 else 1)
		b.BackgroundColor3 = Color3.new(0, 0, 0)
		b.BorderSizePixel = 0
		b.Parent = overlay
		table.insert(bars, b)
	end
end

local function buildDust()
	local p = Instance.new("Part")
	p.Name = "GfxDust"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.Transparency = 1
	p.Size = Vector3.new(40, 20, 40)
	p.Parent = workspace.CurrentCamera
	local e = Instance.new("ParticleEmitter")
	e.Name = "Motes"
	e.Texture = "rbxasset://textures/particles/sparkles_main.dds"
	e.Rate = 14
	e.Lifetime = NumberRange.new(5, 9)
	e.Speed = NumberRange.new(0.2, 0.8)
	e.SpreadAngle = Vector2.new(180, 180)
	e.Size = NumberSequence.new(0.12)
	e.Transparency = NumberSequence.new({
		NumberSequenceKeypoint.new(0, 1),
		NumberSequenceKeypoint.new(0.3, 0.55),
		NumberSequenceKeypoint.new(1, 1),
	})
	e.LightInfluence = 1
	e.Color = ColorSequence.new(Color3.fromRGB(255, 230, 190))
	e.Shape = Enum.ParticleEmitterShape.Box
	e.ShapeStyle = Enum.ParticleEmitterShapeStyle.Volume
	e.Parent = p
	dustPart = p
end

function Graphics.Apply(id: string)
	local preset = Graphics.Presets[1]
	for _, p in Graphics.Presets do
		if p.id == id then
			preset = p
		end
	end
	current = preset
	local t = TweenInfo.new(1.2, Enum.EasingStyle.Sine)

	TweenService:Create(Lighting, t, {
		ClockTime = preset.clock,
		Brightness = preset.brightness,
		ExposureCompensation = preset.exposure,
		Ambient = preset.ambient,
		OutdoorAmbient = preset.outdoor,
	}):Play()
	Lighting.GlobalShadows = preset.shadows

	local atm = effect("Atmosphere")
	if atm then
		TweenService:Create(atm, t, { Density = preset.atmDensity, Haze = preset.atmHaze, Color = preset.atmColor, Decay = preset.atmDecay }):Play()
	end
	local cc = effect("ColorCorrectionEffect")
	if cc then
		TweenService:Create(cc, t, { TintColor = preset.tint, Saturation = preset.saturation, Contrast = preset.contrast, Brightness = preset.ccBrightness }):Play()
	end
	local bloom = effect("BloomEffect")
	if bloom then
		bloom.Enabled = preset.bloom > 0
		TweenService:Create(bloom, t, { Intensity = preset.bloom, Size = preset.bloomSize, Threshold = preset.bloomThreshold }):Play()
	end
	local rays = effect("SunRaysEffect")
	if rays then
		rays.Enabled = preset.rays > 0
		TweenService:Create(rays, t, { Intensity = preset.rays }):Play()
	end
	local dof = effect("DepthOfFieldEffect")
	if dof then
		dof.Enabled = preset.dofFar > 0
		TweenService:Create(dof, t, { FarIntensity = preset.dofFar, InFocusRadius = preset.dofRadius }):Play()
	end
	local terrain = workspace:FindFirstChildOfClass("Terrain")
	local clouds = terrain and terrain:FindFirstChildOfClass("Clouds")
	if clouds then
		clouds.Enabled = preset.clouds > 0
		TweenService:Create(clouds, t, { Cover = preset.clouds }):Play()
	end

	for _, f in vignetteFrames do
		TweenService:Create(f, t, { BackgroundTransparency = 1 - preset.vignette }):Play()
	end
	for _, b in bars do
		TweenService:Create(b, t, { Size = UDim2.new(1, 0, if preset.letterbox then 0.09 else 0, 0) }):Play()
	end
	if dustPart then
		local m = dustPart:FindFirstChild("Motes") :: ParticleEmitter
		if m then
			m.Enabled = preset.dust
		end
	end
end

function Graphics.Current(): string
	return current and current.id or "sunset"
end

function Graphics.Init()
	buildOverlay()
	buildDust()
	-- автофокус глубины резкости на Йозефе, пыль вокруг камеры, мерцание плёнки
	RunService.RenderStepped:Connect(function()
		local cam = workspace.CurrentCamera
		if not cam then
			return
		end
		local char = player.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		local dof = fx["DepthOfFieldEffect"]
		if dof and hrp then
			(dof :: any).FocusDistance = math.clamp((cam.CFrame.Position - hrp.Position).Magnitude, 4, 200)
		end
		if dustPart then
			dustPart.CFrame = CFrame.new(cam.CFrame.Position + cam.CFrame.LookVector * 12)
		end
		local cc = fx["ColorCorrectionEffect"]
		if current and current.flicker and cc then
			(cc :: any).Brightness = current.ccBrightness + (math.random() - 0.5) * 0.05
		end
	end)
	Graphics.Apply("sunset")
end

return Graphics
