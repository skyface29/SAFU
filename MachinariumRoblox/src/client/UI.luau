--!nonstrict
-- UI: интерфейс в стиле старой бумаги и ржавого металла.

local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Machinarium"):WaitForChild("Config"))
local C = Config.Colors

local UI = {}

local player = Players.LocalPlayer
local gui: ScreenGui
local toastHolder: Frame
local currentWindow: Frame? = nil

UI.Font = Enum.Font.FredokaOne
UI.Paper = C.Paper
UI.Ink = Color3.fromRGB(60, 40, 28)
UI.Rust = C.Rust

function UI.corner(parent: Instance, r: number?)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r or 12)
	c.Parent = parent
	return c
end

function UI.stroke(parent: Instance, color: Color3?, thick: number?)
	local s = Instance.new("UIStroke")
	s.Color = color or UI.Ink
	s.Thickness = thick or 3
	s.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
	s.Parent = parent
	return s
end

function UI.pad(parent: Instance, px: number)
	local p = Instance.new("UIPadding")
	p.PaddingLeft = UDim.new(0, px)
	p.PaddingRight = UDim.new(0, px)
	p.PaddingTop = UDim.new(0, px)
	p.PaddingBottom = UDim.new(0, px)
	p.Parent = parent
	return p
end

function UI.label(parent: Instance, text: string, size: UDim2, pos: UDim2?, textSize: number?, color: Color3?): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = size
	l.Position = pos or UDim2.new()
	l.Font = UI.Font
	l.Text = text
	l.TextSize = textSize or 20
	l.TextColor3 = color or UI.Ink
	l.TextWrapped = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.RichText = true
	l.Parent = parent
	return l
end

function UI.button(parent: Instance, text: string, size: UDim2, pos: UDim2?, color: Color3?, onClick: (() -> ())?): TextButton
	local b = Instance.new("TextButton")
	b.AutoButtonColor = true
	b.Size = size
	b.Position = pos or UDim2.new()
	b.BackgroundColor3 = color or C.RustLight
	b.Font = UI.Font
	b.Text = text
	b.TextSize = 20
	b.TextColor3 = Color3.fromRGB(255, 248, 232)
	b.TextStrokeTransparency = 0.6
	b.TextWrapped = true
	UI.corner(b, 10)
	UI.stroke(b, UI.Ink, 2)
	b.Parent = parent
	if onClick then
		b.Activated:Connect(onClick)
	end
	return b
end

function UI.panel(parent: Instance, size: UDim2, pos: UDim2?, color: Color3?): Frame
	local f = Instance.new("Frame")
	f.Size = size
	f.Position = pos or UDim2.new()
	f.BackgroundColor3 = color or UI.Paper
	UI.corner(f, 14)
	UI.stroke(f, UI.Ink, 3)
	f.Parent = parent
	return f
end

function UI.list(parent: Instance, padding: number?, horizontal: boolean?): UIListLayout
	local l = Instance.new("UIListLayout")
	l.Padding = UDim.new(0, padding or 6)
	l.SortOrder = Enum.SortOrder.LayoutOrder
	if horizontal then
		l.FillDirection = Enum.FillDirection.Horizontal
	end
	l.Parent = parent
	return l
end

function UI.scroll(parent: Instance, size: UDim2, pos: UDim2?): ScrollingFrame
	local s = Instance.new("ScrollingFrame")
	s.Size = size
	s.Position = pos or UDim2.new()
	s.BackgroundTransparency = 1
	s.BorderSizePixel = 0
	s.ScrollBarThickness = 8
	s.ScrollBarImageColor3 = C.RustDark
	s.CanvasSize = UDim2.new()
	s.AutomaticCanvasSize = Enum.AutomaticSize.Y
	s.Parent = parent
	return s
end

----------------------------------------------------------------------
-- Окна
----------------------------------------------------------------------
function UI.closeWindow()
	if currentWindow then
		currentWindow:Destroy()
		currentWindow = nil
	end
end

function UI.isOpen(): boolean
	return currentWindow ~= nil
end

-- Окно по центру. Возвращает frame, content, close()
function UI.window(title: string, w: number, h: number, onClose: (() -> ())?)
	UI.closeWindow()
	local vp = workspace.CurrentCamera.ViewportSize
	w = math.min(w, vp.X - 24)
	h = math.min(h, vp.Y - 90)
	local f = UI.panel(gui, UDim2.fromOffset(w, h), UDim2.new(0.5, -w / 2, 0.5, -h / 2 + 10))
	f.ZIndex = 10
	-- «ржавая» шапка
	local head = Instance.new("Frame")
	head.Size = UDim2.new(1, 0, 0, 44)
	head.BackgroundColor3 = C.Rust
	UI.corner(head, 12)
	head.Parent = f
	local t = UI.label(head, title, UDim2.new(1, -60, 1, 0), UDim2.fromOffset(16, 0), 24, Color3.fromRGB(255, 244, 222))
	t.TextStrokeTransparency = 0.5
	local closed = false
	local function close()
		if closed then
			return
		end
		closed = true
		if currentWindow == f then
			currentWindow = nil
		end
		f:Destroy()
		if onClose then
			onClose()
		end
	end
	local x = UI.button(head, "✕", UDim2.fromOffset(36, 36), UDim2.new(1, -42, 0, 4), Color3.fromRGB(170, 70, 50), close)
	x.TextSize = 22
	local content = Instance.new("Frame")
	content.BackgroundTransparency = 1
	content.Size = UDim2.new(1, -24, 1, -60)
	content.Position = UDim2.fromOffset(12, 52)
	content.Parent = f
	currentWindow = f
	f.Destroying:Connect(function()
		if not closed then
			closed = true
			if currentWindow == f then
				currentWindow = nil
			end
			if onClose then
				onClose()
			end
		end
	end)
	-- появление
	local sc = Instance.new("UIScale")
	sc.Scale = 0.85
	sc.Parent = f
	TweenService:Create(sc, TweenInfo.new(0.18, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	return f, content, close
end

----------------------------------------------------------------------
-- Всплывающие сообщения
----------------------------------------------------------------------
local kindColors = {
	info = Color3.fromRGB(236, 222, 190),
	good = Color3.fromRGB(200, 230, 170),
	bad = Color3.fromRGB(240, 170, 150),
	quest = Color3.fromRGB(255, 214, 130),
}

function UI.toast(text: string, kind: string?)
	local f = UI.panel(toastHolder, UDim2.new(1, 0, 0, 0), nil, kindColors[kind or "info"] or kindColors.info)
	f.AutomaticSize = Enum.AutomaticSize.Y
	UI.pad(f, 8)
	local l = UI.label(f, text, UDim2.new(1, 0, 0, 0), nil, 19)
	l.AutomaticSize = Enum.AutomaticSize.Y
	l.TextXAlignment = Enum.TextXAlignment.Center
	f.BackgroundTransparency = 1
	TweenService:Create(f, TweenInfo.new(0.2), { BackgroundTransparency = 0 }):Play()
	task.delay(if kind == "quest" then 6 else 4, function()
		if f.Parent then
			local tw = TweenService:Create(f, TweenInfo.new(0.4), { BackgroundTransparency = 1 })
			TweenService:Create(l, TweenInfo.new(0.4), { TextTransparency = 1 }):Play()
			local st = f:FindFirstChildOfClass("UIStroke")
			if st then
				TweenService:Create(st, TweenInfo.new(0.4), { Transparency = 1 }):Play()
			end
			tw:Play()
			tw.Completed:Wait()
			f:Destroy()
		end
	end)
	-- не больше 5 сообщений сразу
	local items = {}
	for _, c in toastHolder:GetChildren() do
		if c:IsA("Frame") then
			table.insert(items, c)
		end
	end
	if #items > 5 then
		items[1]:Destroy()
	end
end

-- Большая «карточка» по центру (факт, пасхалка, воспоминание)
function UI.card(title: string, body: string, emoji: string?, color: Color3?)
	local f = UI.panel(gui, UDim2.fromOffset(460, 0), UDim2.new(0.5, -230, 0.18, 0), color or UI.Paper)
	f.AutomaticSize = Enum.AutomaticSize.Y
	f.ZIndex = 20
	UI.pad(f, 14)
	UI.list(f, 6)
	if emoji then
		local e = UI.label(f, emoji, UDim2.new(1, 0, 0, 56), nil, 48)
		e.TextXAlignment = Enum.TextXAlignment.Center
	end
	local t = UI.label(f, "<b>" .. title .. "</b>", UDim2.new(1, 0, 0, 30), nil, 26)
	t.TextXAlignment = Enum.TextXAlignment.Center
	local b = UI.label(f, body, UDim2.new(1, 0, 0, 0), nil, 20)
	b.AutomaticSize = Enum.AutomaticSize.Y
	b.TextXAlignment = Enum.TextXAlignment.Center
	local ok = UI.button(f, "Понятно", UDim2.new(1, 0, 0, 40), nil, C.Rust, function()
		f:Destroy()
	end)
	ok.LayoutOrder = 10
	local sc = Instance.new("UIScale")
	sc.Scale = 0.7
	sc.Parent = f
	TweenService:Create(sc, TweenInfo.new(0.25, Enum.EasingStyle.Back), { Scale = 1 }):Play()
	task.delay(12, function()
		if f.Parent then
			f:Destroy()
		end
	end)
	return f
end

function UI.fade(toBlack: boolean, time: number?, text: string?)
	local f = gui:FindFirstChild("Fade") :: Frame
	if not f then
		f = Instance.new("Frame")
		f.Name = "Fade"
		f.Size = UDim2.fromScale(1, 1)
		f.BackgroundColor3 = Color3.new(0, 0, 0)
		f.BackgroundTransparency = 1
		f.ZIndex = 50
		f.Parent = gui
		local l = UI.label(f, "", UDim2.fromScale(1, 1), nil, 40, Color3.fromRGB(255, 240, 220))
		l.Name = "Text"
		l.TextXAlignment = Enum.TextXAlignment.Center
		l.ZIndex = 51
	end
	local l = f:FindFirstChild("Text") :: TextLabel
	l.Text = text or ""
	TweenService:Create(f, TweenInfo.new(time or 0.6), { BackgroundTransparency = if toBlack then 0 else 1 }):Play()
	TweenService:Create(l, TweenInfo.new(time or 0.6), { TextTransparency = if toBlack then 0 else 1 }):Play()
end

function UI.Init()
	gui = Instance.new("ScreenGui")
	gui.Name = "MachinariumUI"
	gui.ResetOnSpawn = false
	gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
	gui.IgnoreGuiInset = false
	gui.Parent = player:WaitForChild("PlayerGui")
	UI.Gui = gui

	toastHolder = Instance.new("Frame")
	toastHolder.Name = "Toasts"
	toastHolder.BackgroundTransparency = 1
	toastHolder.Size = UDim2.new(0, 420, 0.5, 0)
	toastHolder.Position = UDim2.new(0.5, -210, 0, 70)
	toastHolder.Parent = gui
	local l = UI.list(toastHolder, 6)
	l.VerticalAlignment = Enum.VerticalAlignment.Top

	-- мелкие экраны (телефон)
	local sc = Instance.new("UIScale")
	sc.Parent = gui
	local function rescale()
		local vp = workspace.CurrentCamera.ViewportSize
		sc.Scale = math.clamp(math.min(vp.X / 1100, vp.Y / 700), 0.6, 1)
	end
	rescale()
	workspace.CurrentCamera:GetPropertyChangedSignal("ViewportSize"):Connect(rescale)
	return gui
end

return UI
