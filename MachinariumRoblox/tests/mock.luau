--!nonstrict
-- Мини-эмуляция Roblox API для прогона скриптов игры вне Roblox (luau CLI).
-- Не полная: ровно столько, чтобы выполнить постройку мира и серверную логику.

local M = {}

----------------------------------------------------------------------
-- typeof
----------------------------------------------------------------------
local rawtypeof = typeof
local function mtypeof(v)
	if type(v) == "table" then
		local mt = getmetatable(v)
		if mt and mt.__type then
			return mt.__type
		end
	end
	return rawtypeof(v)
end
M.typeof = mtypeof

----------------------------------------------------------------------
-- Vector3 / Vector2
----------------------------------------------------------------------
local V3 = {}
V3.__type = "Vector3"
local function v3(x, y, z)
	return setmetatable({ X = x or 0, Y = y or 0, Z = z or 0 }, V3)
end
V3.__index = function(t, k)
	if k == "Magnitude" then
		return math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z)
	elseif k == "Unit" then
		local m = math.sqrt(t.X * t.X + t.Y * t.Y + t.Z * t.Z)
		if m == 0 then
			return v3(0 / 0, 0 / 0, 0 / 0)
		end
		return v3(t.X / m, t.Y / m, t.Z / m)
	elseif k == "x" then
		return t.X
	elseif k == "y" then
		return t.Y
	elseif k == "z" then
		return t.Z
	end
	return V3[k]
end
local function isv3(a)
	return type(a) == "table" and getmetatable(a) == V3
end
V3.__add = function(a, b)
	assert(isv3(a) and isv3(b), "Vector3 + non-Vector3")
	return v3(a.X + b.X, a.Y + b.Y, a.Z + b.Z)
end
V3.__sub = function(a, b)
	assert(isv3(a) and isv3(b), "Vector3 - non-Vector3")
	return v3(a.X - b.X, a.Y - b.Y, a.Z - b.Z)
end
V3.__mul = function(a, b)
	if type(a) == "number" then
		return v3(a * b.X, a * b.Y, a * b.Z)
	elseif type(b) == "number" then
		return v3(a.X * b, a.Y * b, a.Z * b)
	end
	assert(isv3(a) and isv3(b), "bad Vector3 *")
	return v3(a.X * b.X, a.Y * b.Y, a.Z * b.Z)
end
V3.__div = function(a, b)
	if type(b) == "number" then
		return v3(a.X / b, a.Y / b, a.Z / b)
	end
	return v3(a.X / b.X, a.Y / b.Y, a.Z / b.Z)
end
V3.__unm = function(a)
	return v3(-a.X, -a.Y, -a.Z)
end
V3.__eq = function(a, b)
	return a.X == b.X and a.Y == b.Y and a.Z == b.Z
end
V3.__tostring = function(a)
	return string.format("%.2f, %.2f, %.2f", a.X, a.Y, a.Z)
end
function V3.Dot(a, b)
	return a.X * b.X + a.Y * b.Y + a.Z * b.Z
end
function V3.Cross(a, b)
	return v3(a.Y * b.Z - a.Z * b.Y, a.Z * b.X - a.X * b.Z, a.X * b.Y - a.Y * b.X)
end
function V3.Lerp(a, b, t)
	return a + (b - a) * t
end
M.Vector3 = {
	new = v3,
	zero = v3(0, 0, 0),
	one = v3(1, 1, 1),
	xAxis = v3(1, 0, 0),
	yAxis = v3(0, 1, 0),
	zAxis = v3(0, 0, 1),
}

local V2 = { __type = "Vector2" }
V2.__index = function(t, k)
	if k == "Magnitude" then
		return math.sqrt(t.X * t.X + t.Y * t.Y)
	end
	return V2[k]
end
local function v2(x, y)
	return setmetatable({ X = x or 0, Y = y or 0 }, V2)
end
V2.__sub = function(a, b)
	return v2(a.X - b.X, a.Y - b.Y)
end
V2.__add = function(a, b)
	return v2(a.X + b.X, a.Y + b.Y)
end
M.Vector2 = { new = v2, zero = v2(0, 0) }

----------------------------------------------------------------------
-- CFrame
----------------------------------------------------------------------
local CF = { __type = "CFrame" }
local function cfraw(px, py, pz, r)
	return setmetatable({ p = v3(px, py, pz), r = r }, CF)
end
local I = { 1, 0, 0, 0, 1, 0, 0, 0, 1 }
local function matmul(a, b)
	local r = {}
	for i = 0, 2 do
		for j = 0, 2 do
			local s = 0
			for k = 0, 2 do
				s += a[i * 3 + k + 1] * b[k * 3 + j + 1]
			end
			r[i * 3 + j + 1] = s
		end
	end
	return r
end
local function matvec(a, v)
	return v3(a[1] * v.X + a[2] * v.Y + a[3] * v.Z, a[4] * v.X + a[5] * v.Y + a[6] * v.Z, a[7] * v.X + a[8] * v.Y + a[9] * v.Z)
end
local function transpose(a)
	return { a[1], a[4], a[7], a[2], a[5], a[8], a[3], a[6], a[9] }
end
local function isnan(x)
	return x ~= x or x - x ~= 0
end
local function checkcf(c)
	for _, x in c.r do
		assert(not isnan(x), "NaN в CFrame")
	end
	assert(not isnan(c.p.X) and not isnan(c.p.Y) and not isnan(c.p.Z), "NaN в позиции CFrame")
	return c
end
CF.__index = function(t, k)
	if k == "Position" or k == "p" then
		return rawget(t, "p")
	elseif k == "X" then
		return t.p.X
	elseif k == "Y" then
		return t.p.Y
	elseif k == "Z" then
		return t.p.Z
	elseif k == "Rotation" then
		return cfraw(0, 0, 0, t.r)
	elseif k == "LookVector" then
		return v3(-t.r[3], -t.r[6], -t.r[9])
	elseif k == "RightVector" then
		return v3(t.r[1], t.r[4], t.r[7])
	elseif k == "UpVector" then
		return v3(t.r[2], t.r[5], t.r[8])
	end
	return CF[k]
end
CF.__mul = function(a, b)
	if getmetatable(b) == CF then
		local p = matvec(a.r, b.p) + a.p
		return checkcf(cfraw(p.X, p.Y, p.Z, matmul(a.r, b.r)))
	elseif isv3(b) then
		return matvec(a.r, b) + a.p
	end
	error("CFrame * " .. mtypeof(b))
end
CF.__add = function(a, b)
	assert(isv3(b), "CFrame + non-Vector3")
	local p = a.p + b
	return cfraw(p.X, p.Y, p.Z, a.r)
end
CF.__sub = function(a, b)
	assert(isv3(b), "CFrame - non-Vector3")
	local p = a.p - b
	return cfraw(p.X, p.Y, p.Z, a.r)
end
local function inv3(m)
	local a, b, c, d, e, f, g, h, i = table.unpack(m)
	local A, B, Cc = e * i - f * h, -(d * i - f * g), d * h - e * g
	local det = a * A + b * B + c * Cc
	assert(math.abs(det) > 1e-12, "вырожденная матрица")
	return {
		A / det, -(b * i - c * h) / det, (b * f - c * e) / det,
		B / det, (a * i - c * g) / det, -(a * f - c * d) / det,
		Cc / det, -(a * h - b * g) / det, (a * e - b * d) / det,
	}
end
function CF.Inverse(a)
	local rt = inv3(a.r)
	local p = matvec(rt, -a.p)
	return cfraw(p.X, p.Y, p.Z, rt)
end
function CF.ToObjectSpace(a, b)
	return a:Inverse() * b
end
function CF.ToWorldSpace(a, b)
	return a * b
end
function CF.VectorToWorldSpace(a, v)
	return matvec(a.r, v)
end
function CF.VectorToObjectSpace(a, v)
	return matvec(inv3(a.r), v)
end
function CF.PointToWorldSpace(a, v)
	return a * v
end
function CF.PointToObjectSpace(a, v)
	return a:Inverse() * v
end
function CF.Lerp(a, b, t)
	local p = a.p:Lerp(b.p, t)
	return cfraw(p.X, p.Y, p.Z, if t < 0.5 then a.r else b.r)
end
function CF.GetComponents(a)
	return a.p.X, a.p.Y, a.p.Z, table.unpack(a.r)
end
local function rx(a)
	local c, s = math.cos(a), math.sin(a)
	return { 1, 0, 0, 0, c, -s, 0, s, c }
end
local function ry(a)
	local c, s = math.cos(a), math.sin(a)
	return { c, 0, s, 0, 1, 0, -s, 0, c }
end
local function rz(a)
	local c, s = math.cos(a), math.sin(a)
	return { c, -s, 0, s, c, 0, 0, 0, 1 }
end
local function lookAt(at, target, up)
	up = up or v3(0, 1, 0)
	local look = (target - at)
	if look.Magnitude < 1e-9 then
		return cfraw(at.X, at.Y, at.Z, table.clone(I))
	end
	look = look.Unit
	local right = look:Cross(up)
	if right.Magnitude < 1e-6 then
		right = look:Cross(v3(0, 0, 1))
	end
	right = right.Unit
	local up2 = right:Cross(look).Unit
	local back = -look
	return checkcf(cfraw(at.X, at.Y, at.Z, { right.X, up2.X, back.X, right.Y, up2.Y, back.Y, right.Z, up2.Z, back.Z }))
end
M.CFrame = {
	new = function(x, y, z, ...)
		assert(select("#", ...) == 0, "CFrame.new с поворотом не поддержан в моке")
		if x == nil then
			return cfraw(0, 0, 0, table.clone(I))
		elseif isv3(x) then
			assert(y == nil, "CFrame.new(pos, lookAt) устарел — используй CFrame.lookAt")
			return cfraw(x.X, x.Y, x.Z, table.clone(I))
		end
		assert(type(x) == "number" and type(y) == "number" and type(z) == "number", "CFrame.new: нужны 3 числа")
		return cfraw(x, y, z, table.clone(I))
	end,
	Angles = function(a, b, c)
		assert(type(a) == "number" and type(b) == "number" and type(c) == "number", "CFrame.Angles: нужны 3 числа")
		return cfraw(0, 0, 0, matmul(matmul(rx(a), ry(b)), rz(c)))
	end,
	lookAt = lookAt,
	identity = cfraw(0, 0, 0, table.clone(I)),
}
M.CFrame.fromEulerAnglesXYZ = M.CFrame.Angles

----------------------------------------------------------------------
-- Прочие типы данных
----------------------------------------------------------------------
local function valueType(name, fields)
	local mt = { __type = name }
	mt.__index = mt
	return function(...)
		local t = { ... }
		local o = {}
		for i, f in fields do
			o[f] = t[i]
		end
		return setmetatable(o, mt)
	end, mt
end

local C3mt = { __type = "Color3" }
C3mt.__index = C3mt
local function c3(r, g, b)
	return setmetatable({ R = r or 0, G = g or 0, B = b or 0 }, C3mt)
end
function C3mt.Lerp(a, b, t)
	return c3(a.R + (b.R - a.R) * t, a.G + (b.G - a.G) * t, a.B + (b.B - a.B) * t)
end
M.Color3 = {
	new = c3,
	fromRGB = function(r, g, b)
		assert(type(r) == "number" and type(g) == "number" and type(b) == "number", "Color3.fromRGB")
		return c3(r / 255, g / 255, b / 255)
	end,
}

local UDmt = { __type = "UDim" }
UDmt.__index = UDmt
M.UDim = {
	new = function(s, o)
		return setmetatable({ Scale = s or 0, Offset = o or 0 }, UDmt)
	end,
}
local UD2mt = { __type = "UDim2" }
UD2mt.__index = UD2mt
local function udim2(xs, xo, ys, yo)
	return setmetatable({ X = M.UDim.new(xs, xo), Y = M.UDim.new(ys, yo) }, UD2mt)
end
M.UDim2 = {
	new = function(a, b, c, d)
		return udim2(a or 0, b or 0, c or 0, d or 0)
	end,
	fromOffset = function(x, y)
		return udim2(0, x or 0, 0, y or 0)
	end,
	fromScale = function(x, y)
		return udim2(x or 0, 0, y or 0, 0)
	end,
}

M.NumberRange = { new = valueType("NumberRange", { "Min", "Max" }) }
M.NumberSequence = { new = valueType("NumberSequence", { "a", "b" }) }
M.ColorSequence = { new = valueType("ColorSequence", { "a", "b" }) }
M.PhysicalProperties = { new = valueType("PhysicalProperties", { "Density", "Friction", "Elasticity", "FW", "EW" }) }
M.TweenInfo = { new = valueType("TweenInfo", { "Time", "Style", "Dir" }) }

-- Enum.X.Y
local enumCache = {}
M.Enum = setmetatable({}, {
	__index = function(_, typeName)
		if not enumCache[typeName] then
			enumCache[typeName] = setmetatable({}, {
				__index = function(t, itemName)
					local item = setmetatable({ Name = itemName, EnumType = typeName }, {
						__type = "EnumItem",
						__tostring = function()
							return "Enum." .. typeName .. "." .. itemName
						end,
					})
					rawset(t, itemName, item)
					return item
				end,
			})
		end
		return enumCache[typeName]
	end,
})

local Randmt = { __type = "Random" }
Randmt.__index = Randmt
function Randmt.NextNumber(self, a, b)
	a = a or 0
	b = b or 1
	return a + math.random() * (b - a)
end
function Randmt.NextInteger(self, a, b)
	return math.random(a, b)
end
M.Random = {
	new = function(seed)
		return setmetatable({}, Randmt)
	end,
}

----------------------------------------------------------------------
-- Сигналы и планировщик
----------------------------------------------------------------------
M.clock = 0
local waiting = {} -- { co, wake }
local Signal = {}
Signal.__index = Signal
function Signal.new()
	return setmetatable({ handlers = {}, waiters = {} }, Signal)
end
function Signal:Connect(fn)
	local h = { fn = fn, on = true }
	table.insert(self.handlers, h)
	return {
		Disconnect = function()
			h.on = false
		end,
		Connected = true,
	}
end
Signal.connect = Signal.Connect
function Signal:Once(fn)
	local c
	c = self:Connect(function(...)
		c.Disconnect()
		fn(...)
	end)
	return c
end
function Signal:Fire(...)
	for _, h in table.clone(self.handlers) do
		if h.on then
			local co = coroutine.create(h.fn)
			local ok, err = coroutine.resume(co, ...)
			if not ok then
				error(debug.traceback(co, tostring(err)), 0)
			end
		end
	end
	local ws = self.waiters
	self.waiters = {}
	for _, co in ws do
		coroutine.resume(co, ...)
	end
end
function Signal:Wait()
	table.insert(self.waiters, coroutine.running())
	return coroutine.yield()
end
M.Signal = Signal

local function resumeChecked(co, ...)
	local ok, err = coroutine.resume(co, ...)
	if not ok then
		error(debug.traceback(co, tostring(err)), 0)
	end
end

M.task = {
	spawn = function(fn, ...)
		local co = if type(fn) == "thread" then fn else coroutine.create(fn)
		resumeChecked(co, ...)
		return co
	end,
	defer = function(fn, ...)
		local co = coroutine.create(fn)
		local args = { ... }
		table.insert(waiting, { co = co, wake = M.clock, args = args })
		return co
	end,
	delay = function(t, fn, ...)
		local co = coroutine.create(fn)
		table.insert(waiting, { co = co, wake = M.clock + (t or 0), args = { ... } })
		return co
	end,
	wait = function(t)
		local co = coroutine.running()
		if not coroutine.isyieldable() then
			M.clock += (t or 0.03)
			return t or 0.03
		end
		table.insert(waiting, { co = co, wake = M.clock + (t or 0.03), args = {} })
		coroutine.yield()
		return t or 0.03
	end,
	cancel = function() end,
}

M.heartbeat = Signal.new()
M.renderStepped = Signal.new()

-- продвинуть время на dt секунд с шагом step
function M.advance(dt, step)
	step = step or 0.05
	local target = M.clock + dt
	while M.clock < target do
		M.clock += step
		M.heartbeat:Fire(step)
		M.renderStepped:Fire(step)
		local ready = {}
		for i = #waiting, 1, -1 do
			if waiting[i].wake <= M.clock then
				table.insert(ready, waiting[i])
				table.remove(waiting, i)
			end
		end
		for _, w in ready do
			if coroutine.status(w.co) == "suspended" then
				resumeChecked(w.co, table.unpack(w.args))
			end
		end
	end
end

----------------------------------------------------------------------
-- Instance
----------------------------------------------------------------------
local classParents = {
	Part = "BasePart",
	WedgePart = "BasePart",
	TrussPart = "BasePart",
	SpawnLocation = "Part",
	MeshPart = "BasePart",
	BasePart = "PVInstance",
	Model = "PVInstance",
	PVInstance = "Instance",
	Workspace = "Model",
	PointLight = "Light",
	Light = "Instance",
	ColorCorrectionEffect = "PostEffect",
	BloomEffect = "PostEffect",
	SunRaysEffect = "PostEffect",
	PostEffect = "Instance",
	Script = "LuaSourceContainer",
	LocalScript = "Script",
	ModuleScript = "LuaSourceContainer",
	RemoteEvent = "Instance",
	RemoteFunction = "Instance",
	TextLabel = "GuiObject",
	TextButton = "GuiButton",
	GuiButton = "GuiObject",
	Frame = "GuiObject",
	ScrollingFrame = "GuiObject",
	GuiObject = "GuiBase2d",
	ScreenGui = "LayerCollector",
	BillboardGui = "LayerCollector",
	SurfaceGui = "LayerCollector",
	LayerCollector = "GuiBase2d",
	Weld = "JointInstance",
	WeldConstraint = "Instance",
	HingeConstraint = "Constraint",
	PrismaticConstraint = "Constraint",
	Accessory = "Accoutrement",
}

local function isA(cls, want)
	local c = cls
	while c do
		if c == want then
			return true
		end
		c = classParents[c]
	end
	return want == "Instance"
end

local Inst = {}
local instMethods = {}
local allTagged = {} -- tag -> { inst = true }
local tagAdded = {}

local function newInstance(className, props)
	local self = {
		__class = className,
		__props = {
			Name = className,
			ClassName = className,
		},
		__children = {},
		__attrs = {},
		__signals = {},
		__tags = {},
	}
	setmetatable(self, Inst)
	-- значения по умолчанию
	if isA(className, "BasePart") then
		self.__props.Size = v3(4, 1, 2)
		self.__props.CFrame = M.CFrame.new()
		self.__props.Transparency = 0
		self.__props.CanCollide = true
		self.__props.CanTouch = true
		self.__props.CanQuery = true
		self.__props.Anchored = false
		self.__props.AssemblyLinearVelocity = v3(0, 0, 0)
	elseif className == "Humanoid" then
		self.__props.Health = 100
		self.__props.WalkSpeed = 16
		self.__props.JumpPower = 50
		self.__props.HipHeight = 2
	elseif className == "ProximityPrompt" then
		self.__props.Enabled = true
	elseif className == "Attachment" then
		self.__props.CFrame = M.CFrame.new()
	elseif className == "UIListLayout" then
		self.__props.AbsoluteContentSize = v2(0, 0)
	end
	for k, v in props or {} do
		self.__props[k] = v
	end
	return self
end
M.newInstance = newInstance

local function sig(self, name)
	local s = self.__signals[name]
	if not s then
		s = Signal.new()
		self.__signals[name] = s
	end
	return s
end

local eventNames = {
	Touched = true,
	TouchEnded = true,
	ChildAdded = true,
	ChildRemoved = true,
	DescendantAdded = true,
	Destroying = true,
	AncestryChanged = true,
	Changed = true,
	Activated = true,
	MouseButton1Click = true,
	OnClientEvent = true,
	OnServerEvent = true,
	Triggered = true,
	CharacterAdded = true,
	CharacterRemoving = true,
	Chatted = true,
	Died = true,
	StateChanged = true,
	Completed = true,
	PlayerAdded = true,
	PlayerRemoving = true,
	PromptTriggered = true,
	FocusLost = true,
	InputBegan = true,
	MessageReceived = true,
}

Inst.__type = "Instance"
Inst.__index = function(self, k)
	local props = rawget(self, "__props")
	if k == "Parent" then
		return props.Parent
	end
	if k == "Position" and props.CFrame and isA(rawget(self, "__class"), "BasePart") then
		return props.CFrame.Position
	end
	if k == "Orientation" then
		return v3(0, 0, 0)
	end
	local v = props[k]
	if v ~= nil then
		return v
	end
	if eventNames[k] then
		return sig(self, k)
	end
	if instMethods[k] then
		return instMethods[k]
	end
	if k == "AbsoluteSize" or k == "AbsolutePosition" or k == "ViewportSize" then
		return v2(1280, 720)
	end
	-- дочерний объект по имени
	for _, c in rawget(self, "__children") do
		if c.__props.Name == k then
			return c
		end
	end
	return nil
end

local function descendantsAdded(root, inst)
	local p = root
	while p do
		sig(p, "DescendantAdded"):Fire(inst)
		p = p.__props.Parent
	end
end

Inst.__newindex = function(self, k, v)
	local props = rawget(self, "__props")
	if k == "Parent" then
		local old = props.Parent
		if old == v then
			return
		end
		if old then
			local ch = old.__children
			local idx = table.find(ch, self)
			if idx then
				table.remove(ch, idx)
			end
			sig(old, "ChildRemoved"):Fire(self)
		end
		props.Parent = v
		if v then
			assert(getmetatable(v) == Inst, "Parent должен быть Instance")
			table.insert(v.__children, self)
			sig(v, "ChildAdded"):Fire(self)
			descendantsAdded(v, self)
		end
		sig(self, "AncestryChanged"):Fire(self, v)
		return
	end
	if k == "Position" and isA(rawget(self, "__class"), "BasePart") then
		local cf = props.CFrame or M.CFrame.new()
		props.CFrame = cf - cf.Position + v
		return
	end
	if k == "CFrame" then
		assert(mtypeof(v) == "CFrame", "CFrame = " .. mtypeof(v))
	end
	if k == "Size" and isA(rawget(self, "__class"), "BasePart") then
		assert(mtypeof(v) == "Vector3", "Size = " .. mtypeof(v))
	end
	if k == "Size" and isA(rawget(self, "__class"), "GuiObject") then
		assert(mtypeof(v) == "UDim2", "Size = " .. mtypeof(v))
	end
	if k == "Color" and isA(rawget(self, "__class"), "BasePart") then
		assert(mtypeof(v) == "Color3", k .. " = " .. mtypeof(v))
	end
	if k == "BackgroundColor3" or k == "TextColor3" then
		assert(mtypeof(v) == "Color3", k .. " = " .. mtypeof(v))
	end
	if k == "Text" then
		assert(type(v) == "string", "Text = " .. type(v))
	end
	props[k] = v
	local s = self.__signals["Prop_" .. k]
	if s then
		s:Fire()
	end
end
Inst.__tostring = function(self)
	return self.__props.Name
end

function instMethods:IsA(c)
	return isA(self.__class, c)
end
function instMethods:GetChildren()
	return table.clone(self.__children)
end
function instMethods:GetDescendants()
	local out = {}
	local function rec(i)
		for _, c in i.__children do
			table.insert(out, c)
			rec(c)
		end
	end
	rec(self)
	return out
end
function instMethods:FindFirstChild(name, recursive)
	for _, c in self.__children do
		if c.__props.Name == name then
			return c
		end
	end
	if recursive then
		for _, c in self.__children do
			local r = c:FindFirstChild(name, true)
			if r then
				return r
			end
		end
	end
	return nil
end
function instMethods:WaitForChild(name, timeout)
	local c = self:FindFirstChild(name)
	if c then
		return c
	end
	if timeout then
		return nil
	end
	-- ждём появления (как Roblox)
	while true do
		local ch = sig(self, "ChildAdded"):Wait()
		if ch.__props.Name == name then
			return ch
		end
	end
end
function instMethods:FindFirstChildOfClass(cls)
	for _, c in self.__children do
		if c.__class == cls then
			return c
		end
	end
	return nil
end
function instMethods:FindFirstChildWhichIsA(cls, recursive)
	for _, c in self.__children do
		if c:IsA(cls) then
			return c
		end
	end
	if recursive then
		for _, c in self.__children do
			local r = c:FindFirstChildWhichIsA(cls, true)
			if r then
				return r
			end
		end
	end
	return nil
end
function instMethods:FindFirstAncestorOfClass(cls)
	local p = self.__props.Parent
	while p do
		if p.__class == cls then
			return p
		end
		p = p.__props.Parent
	end
	return nil
end
function instMethods:FindFirstAncestorWhichIsA(cls)
	local p = self.__props.Parent
	while p do
		if p:IsA(cls) then
			return p
		end
		p = p.__props.Parent
	end
	return nil
end
function instMethods:IsDescendantOf(other)
	local p = self.__props.Parent
	while p do
		if p == other then
			return true
		end
		p = p.__props.Parent
	end
	return false
end
function instMethods:Destroy()
	sig(self, "Destroying"):Fire()
	self.Parent = nil
	for _, c in table.clone(self.__children) do
		c:Destroy()
	end
end
function instMethods:ClearAllChildren()
	for _, c in table.clone(self.__children) do
		c:Destroy()
	end
end
function instMethods:SetAttribute(k, v)
	local t = mtypeof(v)
	assert(v == nil or t == "string" or t == "number" or t == "boolean" or t == "Vector3" or t == "CFrame" or t == "Color3", "атрибут неподдерживаемого типа: " .. t)
	self.__attrs[k] = v
end
function instMethods:GetAttribute(k)
	return self.__attrs[k]
end
function instMethods:GetAttributes()
	return table.clone(self.__attrs)
end
function instMethods:GetPropertyChangedSignal(k)
	return sig(self, "Prop_" .. k)
end
function instMethods:GetAttributeChangedSignal(k)
	return sig(self, "Attr_" .. k)
end
function instMethods:SetNetworkOwner() end
function instMethods:Clone()
	local c = newInstance(self.__class, table.clone(self.__props))
	c.__props.Parent = nil
	for _, ch in self.__children do
		ch:Clone().Parent = c
	end
	return c
end

-- PVInstance
local function modelParts(m)
	local out = {}
	for _, d in m:GetDescendants() do
		if d:IsA("BasePart") then
			table.insert(out, d)
		end
	end
	return out
end
function instMethods:GetPivot()
	if self:IsA("BasePart") then
		return self.__props.CFrame
	end
	local pp = self.__props.PrimaryPart
	if pp then
		return pp.__props.CFrame
	end
	if self.__props.WorldPivot then
		return self.__props.WorldPivot
	end
	local parts = modelParts(self)
	if #parts > 0 then
		return M.CFrame.new(parts[1].__props.CFrame.Position)
	end
	return M.CFrame.new()
end
function instMethods:PivotTo(cf)
	assert(mtypeof(cf) == "CFrame", "PivotTo(" .. mtypeof(cf) .. ")")
	if self:IsA("BasePart") then
		self.CFrame = cf
		return
	end
	local cur = self:GetPivot()
	local delta = cf * cur:Inverse()
	for _, p in modelParts(self) do
		p.__props.CFrame = delta * p.__props.CFrame
	end
	if not self.__props.PrimaryPart then
		self.__props.WorldPivot = cf
	end
end
function instMethods:GetExtentsSize()
	local parts = modelParts(self)
	local minY, maxY = math.huge, -math.huge
	for _, p in parts do
		local y = p.__props.CFrame.Position.Y
		local h = p.__props.Size.Y / 2
		minY = math.min(minY, y - h)
		maxY = math.max(maxY, y + h)
	end
	if #parts == 0 then
		return v3(0, 0, 0)
	end
	return v3(4, maxY - minY, 4)
end
function instMethods:GetBoundingBox()
	return self:GetPivot(), self:GetExtentsSize()
end
function instMethods:GetScale()
	return self.__attrs.__scale or 1
end
function instMethods:ScaleTo(s)
	assert(type(s) == "number" and s > 0, "ScaleTo")
	local cur = self.__attrs.__scale or 1
	local k = s / cur
	local pivot = self:GetPivot()
	for _, p in modelParts(self) do
		p.__props.Size = p.__props.Size * k
		local rel = pivot:ToObjectSpace(p.__props.CFrame)
		p.__props.CFrame = pivot * (rel.Rotation + rel.Position * k)
	end
	self.__attrs.__scale = s
end
function instMethods:AddTag(tag)
	M.CollectionService:AddTag(self, tag)
end
function instMethods:HasTag(tag)
	return self.__tags[tag] == true
end
-- Humanoid
function instMethods:ChangeState() end
function instMethods:GetState()
	return M.Enum.HumanoidStateType.Running
end
function instMethods:LoadAnimation()
	return { Play = function() end, Stop = function() end }
end
-- Remote
function instMethods:FireClient(player, ...)
	M.log("FireClient", self.__props.Name, ...)
	table.insert(M.clientEvents, { remote = self.__props.Name, player = player, args = { ... } })
end
function instMethods:FireAllClients(...)
	table.insert(M.clientEvents, { remote = self.__props.Name, args = { ... } })
end
function instMethods:FireServer(...)
	local s = sig(self, "OnServerEvent")
	s:Fire(M.localPlayer, ...)
end
function instMethods:InvokeServer(...)
	local fn = self.__props.OnServerInvoke
	assert(fn, "нет OnServerInvoke")
	return fn(M.localPlayer, ...)
end
-- GUI
function instMethods:TweenPosition() end
function instMethods:TweenSize() end

M.clientEvents = {}
M.log = function() end

function M.Instance_new(className, parent)
	local i = newInstance(className)
	if parent then
		i.Parent = parent
	end
	return i
end

----------------------------------------------------------------------
-- Сервисы
----------------------------------------------------------------------
local game = newInstance("DataModel", { Name = "Game" })
M.game = game
local services = {}

local CollectionService = newInstance("CollectionService")
function CollectionService:AddTag(inst, tag)
	inst.__tags[tag] = true
	allTagged[tag] = allTagged[tag] or {}
	if not allTagged[tag][inst] then
		allTagged[tag][inst] = true
		if tagAdded[tag] then
			tagAdded[tag]:Fire(inst)
		end
	end
end
function CollectionService:GetTagged(tag)
	local out = {}
	for inst in allTagged[tag] or {} do
		if inst.__props.Parent ~= nil or inst.__class == "Workspace" then
			table.insert(out, inst)
		end
	end
	return out
end
function CollectionService:GetInstanceAddedSignal(tag)
	tagAdded[tag] = tagAdded[tag] or Signal.new()
	return tagAdded[tag]
end
function CollectionService:HasTag(inst, tag)
	return inst.__tags[tag] == true
end
M.CollectionService = CollectionService
services.CollectionService = CollectionService

local workspace = newInstance("Workspace", { Name = "Workspace", Gravity = 196.2 })
workspace.__props.CurrentCamera = newInstance("Camera", { CFrame = M.CFrame.new(0, 50, 50), ViewportSize = v2(1280, 720) })
function workspace:Raycast(origin, dir, params)
	assert(isv3(origin) and isv3(dir), "Raycast args")
	return nil
end
function workspace:GetServerTimeNow()
	return M.clock
end
M.workspace = workspace
services.Workspace = workspace

local Players = newInstance("Players", { Name = "Players", RespawnTime = 5, CharacterAutoLoads = true })
M.players = {}
function Players:GetPlayers()
	return table.clone(M.players)
end
function Players:GetPlayerFromCharacter(char)
	for _, p in M.players do
		if p.__props.Character == char then
			return p
		end
	end
	return nil
end
function Players:GetPlayerByUserId(id)
	for _, p in M.players do
		if p.__props.UserId == id then
			return p
		end
	end
end
services.Players = Players

local RunService = newInstance("RunService", { Name = "RunService" })
RunService.__props.Heartbeat = M.heartbeat
RunService.__props.RenderStepped = M.renderStepped
RunService.__props.Stepped = M.heartbeat
function RunService:IsStudio()
	return true
end
function RunService:IsServer()
	return M.isServer
end
function RunService:IsClient()
	return not M.isServer
end
services.RunService = RunService

local TweenService = newInstance("TweenService")
function TweenService:Create(inst, info, goals)
	assert(mtypeof(info) == "TweenInfo", "TweenInfo")
	local completed = Signal.new()
	return {
		Play = function()
			for k, v in goals do
				inst[k] = v
			end
			M.task.defer(function()
				completed:Fire(M.Enum.PlaybackState.Completed)
			end)
		end,
		Cancel = function() end,
		Completed = completed,
	}
end
services.TweenService = TweenService

local DataStoreService = newInstance("DataStoreService")
M.stored = {}
function DataStoreService:GetDataStore(name)
	return {
		GetAsync = function(_, key)
			return M.stored[key]
		end,
		SetAsync = function(_, key, value)
			-- проверка, что данные сериализуемы
			local function check(v, path)
				local t = mtypeof(v)
				if t == "table" then
					local hasArray, hasDict = false, false
					for k, x in v do
						if type(k) == "number" then
							hasArray = true
						elseif type(k) == "string" then
							hasDict = true
						else
							error("ключ неподдерживаемого типа в " .. path)
						end
						check(x, path .. "." .. tostring(k))
					end
					assert(not (hasArray and hasDict), "смешанная таблица в " .. path)
				else
					assert(t == "string" or t == "number" or t == "boolean", "несериализуемое значение " .. t .. " в " .. path)
				end
			end
			check(value, key)
			M.stored[key] = value
		end,
	}
end
services.DataStoreService = DataStoreService

local Lighting = newInstance("Lighting", { Name = "Lighting" })
function Lighting:GetSunDirection()
	return v3(0.5, 0.3, 0.5).Unit
end
services.Lighting = Lighting

local ProximityPromptService = newInstance("ProximityPromptService")
services.ProximityPromptService = ProximityPromptService

local ReplicatedStorage = newInstance("ReplicatedStorage", { Name = "ReplicatedStorage" })
services.ReplicatedStorage = ReplicatedStorage
local ServerScriptService = newInstance("ServerScriptService", { Name = "ServerScriptService" })
services.ServerScriptService = ServerScriptService
local StarterPlayer = newInstance("StarterPlayer", { Name = "StarterPlayer" })
services.StarterPlayer = StarterPlayer
services.StarterGui = newInstance("StarterGui")
services.SoundService = newInstance("SoundService")
services.Debris = newInstance("Debris")
function services.Debris:AddItem() end

local UserInputService = newInstance("UserInputService", { TouchEnabled = false, KeyboardEnabled = true })
UserInputService.__props.JumpRequest = Signal.new()
function UserInputService:IsKeyDown()
	return false
end
function UserInputService:GetMouseLocation()
	return v2(0, 0)
end
function UserInputService:GetFocusedTextBox()
	return nil
end
services.UserInputService = UserInputService
local GuiService = newInstance("GuiService")
function GuiService:GetGuiInset()
	return v2(0, 58), v2(0, 0)
end
services.GuiService = GuiService
services.TextChatService = newInstance("TextChatService")

for name, s in services do
	s.__props.Name = s.__props.Name == s.__class and name or s.__props.Name
	s.__props.Parent = game
	table.insert(game.__children, s)
end
function game:GetService(name)
	local s = services[name]
	assert(s, "сервис не эмулирован: " .. name)
	return s
end
function game:BindToClose(fn)
	M.bindToClose = fn
end
M.services = services

----------------------------------------------------------------------
-- Игрок и R15-персонаж
----------------------------------------------------------------------
local r15 = {
	{ "HumanoidRootPart", v3(2, 2, 1), v3(0, 0, 0) },
	{ "LowerTorso", v3(2, 0.4, 1), v3(0, -0.2, 0) },
	{ "UpperTorso", v3(2, 1.6, 1), v3(0, 0.8, 0) },
	{ "Head", v3(1.2, 1.2, 1.2), v3(0, 2.2, 0) },
	{ "LeftUpperArm", v3(1, 1.2, 1), v3(-1.5, 1.0, 0) },
	{ "LeftLowerArm", v3(1, 1.0, 1), v3(-1.5, -0.1, 0) },
	{ "LeftHand", v3(1, 0.3, 1), v3(-1.5, -0.75, 0) },
	{ "RightUpperArm", v3(1, 1.2, 1), v3(1.5, 1.0, 0) },
	{ "RightLowerArm", v3(1, 1.0, 1), v3(1.5, -0.1, 0) },
	{ "RightHand", v3(1, 0.3, 1), v3(1.5, -0.75, 0) },
	{ "LeftUpperLeg", v3(1, 1.2, 1), v3(-0.5, -1.0, 0) },
	{ "LeftLowerLeg", v3(1, 1.3, 1), v3(-0.5, -2.2, 0) },
	{ "LeftFoot", v3(1, 0.3, 1), v3(-0.5, -3.0, 0) },
	{ "RightUpperLeg", v3(1, 1.2, 1), v3(0.5, -1.0, 0) },
	{ "RightLowerLeg", v3(1, 1.3, 1), v3(0.5, -2.2, 0) },
	{ "RightFoot", v3(1, 0.3, 1), v3(0.5, -3.0, 0) },
}

function M.newPlayer(name, userId)
	local p = newInstance("Player", { Name = name, DisplayName = name, UserId = userId })
	table.insert(M.players, p)
	local pg = newInstance("PlayerGui", { Name = "PlayerGui" })
	pg.Parent = p
	function p:LoadCharacter()
		local char = newInstance("Model", { Name = name })
		local hum = newInstance("Humanoid", { Name = "Humanoid" })
		hum.Parent = char
		for _, d in r15 do
			local part = newInstance("MeshPart", { Name = d[1], Size = d[2], CFrame = M.CFrame.new(d[3] + v3(0, 5, 0)) })
			part.Parent = char
		end
		local face = newInstance("Decal", { Name = "face" })
		face.Parent = char.Head
		char.__props.PrimaryPart = char.HumanoidRootPart
		p.__props.Character = char
		char.Parent = workspace
		sig(p, "CharacterAdded"):Fire(char)
		return char
	end
	function p:Kick() end
	return p
end

----------------------------------------------------------------------
-- Окружение скриптов
----------------------------------------------------------------------
function M.makeEnv(scriptInst, requireFn)
	local env = setmetatable({
		game = game,
		workspace = workspace,
		script = scriptInst,
		Instance = { new = M.Instance_new },
		Vector3 = M.Vector3,
		Vector2 = M.Vector2,
		CFrame = M.CFrame,
		Color3 = M.Color3,
		UDim = M.UDim,
		UDim2 = M.UDim2,
		NumberRange = M.NumberRange,
		NumberSequence = M.NumberSequence,
		ColorSequence = M.ColorSequence,
		PhysicalProperties = M.PhysicalProperties,
		TweenInfo = M.TweenInfo,
		RaycastParams = { new = function()
			return {}
		end },
		Enum = M.Enum,
		Random = M.Random,
		task = M.task,
		typeof = mtypeof,
		require = requireFn,
		wait = M.task.wait,
		tick = function()
			return M.clock
		end,
		os = setmetatable({ clock = function()
			return M.clock
		end }, { __index = os }),
		warn = function(...)
			print("WARN:", ...)
		end,
		utf8 = utf8,
	}, { __index = _G })
	return env
end

return M
