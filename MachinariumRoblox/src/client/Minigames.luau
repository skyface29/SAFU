--!nonstrict
-- Мини-игры: «Пять в ряд», вопросы Вентилятора, бомба, пауки из книги подсказок.

local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Machinarium"):WaitForChild("Config"))
local C = Config.Colors

local Minigames = {}

----------------------------------------------------------------------
-- ПЯТЬ В РЯД (гомоку) против робота из паба
----------------------------------------------------------------------
local N = 11
local DIRS = { { 1, 0 }, { 0, 1 }, { 1, 1 }, { 1, -1 } }

local function inside(x, y)
	return x >= 1 and x <= N and y >= 1 and y <= N
end

local function countLine(board, x, y, dx, dy, who)
	local n = 0
	local cx, cy = x + dx, y + dy
	while inside(cx, cy) and board[cx][cy] == who do
		n += 1
		cx += dx
		cy += dy
	end
	local open = inside(cx, cy) and board[cx][cy] == 0
	return n, open
end

local function wins(board, x, y, who)
	for _, d in DIRS do
		local a = countLine(board, x, y, d[1], d[2], who)
		local b = countLine(board, x, y, -d[1], -d[2], who)
		if a + b + 1 >= 5 then
			return true
		end
	end
	return false
end

-- оценка клетки для игрока who
local function scoreCell(board, x, y, who)
	local total = 0
	for _, d in DIRS do
		local a, oa = countLine(board, x, y, d[1], d[2], who)
		local b, ob = countLine(board, x, y, -d[1], -d[2], who)
		local len = a + b + 1
		local opens = (if oa then 1 else 0) + (if ob then 1 else 0)
		if len >= 5 then
			total += 100000
		elseif len == 4 then
			total += if opens == 2 then 12000 elseif opens == 1 then 2500 else 0
		elseif len == 3 then
			total += if opens == 2 then 1200 elseif opens == 1 then 150 else 0
		elseif len == 2 then
			total += if opens == 2 then 100 elseif opens == 1 then 20 else 0
		else
			total += opens
		end
	end
	return total
end

local function aiMove(board)
	local best, bx, by = -1, math.ceil(N / 2), math.ceil(N / 2)
	for x = 1, N do
		for y = 1, N do
			if board[x][y] == 0 then
				-- только клетки рядом с фишками
				local near = false
				for ddx = -2, 2 do
					for ddy = -2, 2 do
						if inside(x + ddx, y + ddy) and board[x + ddx][y + ddy] ~= 0 then
							near = true
						end
					end
				end
				if near then
					local s = scoreCell(board, x, y, 2) * 1.1 + scoreCell(board, x, y, 1) + math.random() * 5
					if s > best then
						best, bx, by = s, x, y
					end
				end
			end
		end
	end
	return bx, by
end

function Minigames.Gomoku(UI, onDone: (boolean) -> ())
	local finished = false
	local won = false
	local _, content = UI.window("⚫⚪ Пять в ряд", 560, 640, function()
		onDone(won)
	end)
	local info = UI.label(content, "Ты — ⚫. Собери 5 в ряд (по горизонтали, вертикали или диагонали).", UDim2.new(1, 0, 0, 44), nil, 18)
	local boardFrame = Instance.new("Frame")
	local cell = 44
	boardFrame.Size = UDim2.fromOffset(cell * N, cell * N)
	boardFrame.Position = UDim2.new(0.5, -cell * N / 2, 0, 50)
	boardFrame.BackgroundColor3 = Color3.fromRGB(210, 180, 130)
	UI.corner(boardFrame, 8)
	UI.stroke(boardFrame, UI.Ink, 3)
	boardFrame.Parent = content
	local board = {}
	local buttons = {}
	for x = 1, N do
		board[x] = {}
		buttons[x] = {}
		for y = 1, N do
			board[x][y] = 0
			local b = Instance.new("TextButton")
			b.Size = UDim2.fromOffset(cell - 2, cell - 2)
			b.Position = UDim2.fromOffset((x - 1) * cell + 1, (y - 1) * cell + 1)
			b.BackgroundColor3 = Color3.fromRGB(226, 200, 150)
			b.BackgroundTransparency = 0.3
			b.Text = ""
			b.TextSize = 30
			b.Font = UI.Font
			b.AutoButtonColor = true
			b.Parent = boardFrame
			buttons[x][y] = b
		end
	end
	local busy = false
	local function place(x, y, who)
		board[x][y] = who
		buttons[x][y].Text = if who == 1 then "⚫" else "⚪"
		buttons[x][y].AutoButtonColor = false
	end
	local function finish(playerWon: boolean, draw: boolean?)
		finished = true
		won = playerWon
		if draw then
			info.Text = "<b>Ничья!</b> Закрой окно и попробуй ещё раз."
		elseif playerWon then
			info.Text = "<b>🏆 Победа!</b> Робот в шоке. Закрой окно, чтобы забрать награду."
		else
			info.Text = "<b>🤖 Робот победил.</b> Закрой окно и сыграй снова."
		end
	end
	local moves = 0
	for x = 1, N do
		for y = 1, N do
			buttons[x][y].Activated:Connect(function()
				if finished or busy or board[x][y] ~= 0 then
					return
				end
				place(x, y, 1)
				moves += 1
				if wins(board, x, y, 1) then
					finish(true)
					return
				end
				if moves >= N * N then
					finish(false, true)
					return
				end
				busy = true
				info.Text = "🤖 думает…"
				task.wait(0.35)
				local ax, ay = aiMove(board)
				place(ax, ay, 2)
				buttons[ax][ay].BackgroundColor3 = Color3.fromRGB(240, 220, 170)
				moves += 1
				busy = false
				if wins(board, ax, ay, 2) then
					finish(false)
				elseif moves >= N * N then
					finish(false, true)
				else
					info.Text = "Твой ход ⚫"
				end
			end)
		end
	end
end

----------------------------------------------------------------------
-- ВОПРОСЫ ВЕНТИЛЯТОРА
----------------------------------------------------------------------
function Minigames.Quiz(UI, startAnger: number, answer: (number, number) -> any)
	local _, content = UI.window("🌀 Вентилятор спрашивает", 520, 420)
	local anger = startAnger or 0
	local meter = UI.label(content, "", UDim2.new(1, 0, 0, 30), nil, 20)
	local qLabel = UI.label(content, "", UDim2.new(1, 0, 0, 70), UDim2.fromOffset(0, 34), 24)
	local hint = UI.label(content, "<i>Подсказка из оригинала: вентилятор надо… разозлить 😈. А за правильные ответы дают болты.</i>", UDim2.new(1, 0, 0, 44), UDim2.new(0, 0, 1, -44), 16, Color3.fromRGB(120, 90, 70))
	local _h = hint
	local btns = {}
	local order = {}
	for i = 1, #Config.FanQuiz do
		order[i] = i
	end
	for i = #order, 2, -1 do
		local j = math.random(1, i)
		order[i], order[j] = order[j], order[i]
	end
	local cur = 1
	local function updateMeter()
		meter.Text = "Злость вентилятора: " .. string.rep("😤", anger) .. string.rep("⚪", math.max(0, Config.FanAngerToOpen - anger))
	end
	local function show()
		local q = Config.FanQuiz[order[(cur - 1) % #order + 1]]
		qLabel.Text = "<b>" .. q.q .. "</b>"
		for i, b in btns do
			b.Text = q.a[i] or ""
			b.Visible = q.a[i] ~= nil
		end
	end
	local locked = false
	for i = 1, 3 do
		local b = UI.button(content, "", UDim2.new(1, 0, 0, 48), UDim2.fromOffset(0, 110 + (i - 1) * 56), C.RustLight)
		btns[i] = b
		b.Activated:Connect(function()
			if locked then
				return
			end
			locked = true
			local idx = order[(cur - 1) % #order + 1]
			local res = answer(idx, i)
			if res then
				anger = res.anger
				updateMeter()
				b.BackgroundColor3 = if res.correct then Color3.fromRGB(110, 170, 90) else Color3.fromRGB(190, 80, 60)
				if res.opened then
					qLabel.Text = "<b>ВЖЖЖЖУХ!</b> Вентилятор взбесился и улетел. Путь в теплицу открыт!"
					for _, bb in btns do
						bb.Visible = false
					end
					task.wait(2.5)
					UI.closeWindow()
					return
				end
			end
			task.wait(0.7)
			b.BackgroundColor3 = C.RustLight
			cur += 1
			show()
			locked = false
		end)
	end
	updateMeter()
	show()
end

----------------------------------------------------------------------
-- БОМБА
----------------------------------------------------------------------
function Minigames.Bomb(UI, seq: { string }, submit: ({ string }) -> boolean)
	local _, content = UI.window("💣 Бомба Братства Чёрной Шляпы", 520, 440)
	local wireById = {}
	for _, w in Config.BombWires do
		wireById[w.id] = w
	end
	local info = UI.label(content, "Главарь Братства думает о порядке проводов… Запоминай!", UDim2.new(1, 0, 0, 50), nil, 20)
	-- пузырь мыслей главаря
	local bubble = UI.panel(content, UDim2.new(1, 0, 0, 90), UDim2.fromOffset(0, 56), Color3.fromRGB(255, 255, 250))
	local bl = UI.label(bubble, "", UDim2.fromScale(1, 1), nil, 52)
	bl.TextXAlignment = Enum.TextXAlignment.Center
	local s = "🎩💭 "
	for _, id in seq do
		s ..= wireById[id].emoji
	end
	bl.Text = s
	local timer = UI.label(content, "", UDim2.new(1, 0, 0, 30), UDim2.fromOffset(0, 154), 22, Color3.fromRGB(190, 50, 40))
	local picked = {}
	local wireBtns = {}
	local done = false
	for i, w in Config.BombWires do
		local b = UI.button(content, "✂️ " .. w.name, UDim2.new(0.5, -6, 0, 50), UDim2.new(((i - 1) % 2) * 0.5, ((i - 1) % 2) * 6, 0, 196 + math.floor((i - 1) / 2) * 58), w.color)
		b.Visible = false
		wireBtns[w.id] = b
		b.Activated:Connect(function()
			if done or table.find(picked, w.id) then
				return
			end
			table.insert(picked, w.id)
			b.Text = "✂️ " .. #picked
			b.BackgroundTransparency = 0.5
			if #picked == #seq then
				done = true
				local ok = submit(picked)
				if ok then
					info.Text = "<b>Фух! Бомба обезврежена.</b>"
					bubble.Visible = true
					bl.Text = "💣❌ 😅"
					task.wait(2)
					UI.closeWindow()
				else
					info.Text = "<b>Не тот порядок!</b> Закрой окно и попробуй снова."
				end
			end
		end)
	end
	task.spawn(function()
		for t = 4, 1, -1 do
			timer.Text = "Пузырь исчезнет через " .. t .. "…"
			task.wait(1)
			if not content.Parent then
				return
			end
		end
		bubble.Visible = false
		timer.Text = "⏱️ Режь провода по порядку!"
		info.Text = "Какой был порядок? Нажимай провода."
		for _, b in wireBtns do
			b.Visible = true
		end
	end)
end

----------------------------------------------------------------------
-- ПАУКИ: мини-игра на обложке книги подсказок
-- Веди ключ (W/S, стрелки или мышь), стреляй (пробел/клик) и доведи до замка.
----------------------------------------------------------------------
function Minigames.Spiders(UI, onDone: (boolean) -> ())
	local success = false
	local conns = {}
	local _, content = UI.window("📖 Книга подсказок заперта", 600, 440, function()
		for _, c in conns do
			c:Disconnect()
		end
		onDone(success)
	end)
	UI.label(content, "Веди 🗝️ к замку: <b>W/S</b> или мышь — вверх/вниз, <b>пробел/клик</b> — стрелять в пауков.", UDim2.new(1, 0, 0, 44), nil, 17)
	local W, H = 560, 280
	local field = Instance.new("Frame")
	field.Size = UDim2.fromOffset(W, H)
	field.Position = UDim2.new(0.5, -W / 2, 0, 50)
	field.BackgroundColor3 = Color3.fromRGB(60, 46, 36)
	field.ClipsDescendants = true
	UI.corner(field, 10)
	UI.stroke(field, UI.Ink, 3)
	field.Parent = content
	-- кирпичи на фоне (иногда складываются в «rebol»)
	local letters = { "R", "E", "B", "O", "L" }
	local showRebol = math.random() < 0.5
	for i = 0, 13 do
		for j = 0, 6 do
			local b = Instance.new("TextLabel")
			b.Size = UDim2.fromOffset(38, 18)
			b.Position = UDim2.fromOffset(i * 40 + (j % 2) * 20, j * 40 + 10)
			b.BackgroundColor3 = Color3.fromRGB(90, 66, 50)
			b.BorderSizePixel = 0
			b.Font = UI.Font
			b.TextSize = 14
			b.TextColor3 = Color3.fromRGB(150, 120, 90)
			b.Text = if showRebol and j == 3 and i >= 4 and i <= 8 then letters[i - 3] else ""
			b.Parent = field
		end
	end
	local function sprite(text: string, size: number): TextLabel
		local l = Instance.new("TextLabel")
		l.BackgroundTransparency = 1
		l.Size = UDim2.fromOffset(size, size)
		l.AnchorPoint = Vector2.new(0.5, 0.5)
		l.Text = text
		l.TextSize = size
		l.Font = UI.Font
		l.ZIndex = 5
		l.Parent = field
		return l
	end
	local key = sprite("🗝️", 30)
	local lock = sprite("🔒", 40)
	local keyY = H / 2
	local keyX = 40
	local progress = 0
	local LENGTH = 22 -- секунд до замка
	local spiders = {}
	local bullets = {}
	local spawnT = 0
	local status = UI.label(content, "", UDim2.new(1, 0, 0, 30), UDim2.new(0, 0, 0, 336), 20)
	local running = true
	local cooldown = 0

	local function reset()
		for _, s in spiders do
			s.l:Destroy()
		end
		for _, b in bullets do
			b.l:Destroy()
		end
		spiders, bullets = {}, {}
		progress = 0
		keyY = H / 2
	end
	local function shoot()
		if not running or cooldown > 0 then
			return
		end
		cooldown = 0.18
		local b = sprite("•", 22)
		b.TextColor3 = Color3.fromRGB(255, 220, 120)
		table.insert(bullets, { l = b, x = keyX + 16, y = keyY })
	end
	table.insert(conns, UserInputService.InputBegan:Connect(function(input, gp)
		if input.KeyCode == Enum.KeyCode.Space or input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
			shoot()
		end
	end))
	table.insert(conns, RunService.RenderStepped:Connect(function(dt)
		if not running or not field.Parent then
			return
		end
		cooldown = math.max(0, cooldown - dt)
		-- управление
		local dy = 0
		if UserInputService:IsKeyDown(Enum.KeyCode.W) or UserInputService:IsKeyDown(Enum.KeyCode.Up) then
			dy -= 1
		end
		if UserInputService:IsKeyDown(Enum.KeyCode.S) or UserInputService:IsKeyDown(Enum.KeyCode.Down) then
			dy += 1
		end
		if dy ~= 0 then
			keyY += dy * 180 * dt
		else
			local m = UserInputService:GetMouseLocation()
			local ap = field.AbsolutePosition
			local rel = m.Y - ap.Y - GuiService:GetGuiInset().Y -- поправка на верхнюю панель Roblox
			if m.X > ap.X and m.X < ap.X + field.AbsoluteSize.X and rel > 0 and rel < field.AbsoluteSize.Y then
				keyY += (rel / field.AbsoluteSize.Y * H - keyY) * math.min(1, dt * 8)
			end
		end
		keyY = math.clamp(keyY, 18, H - 18)
		key.Position = UDim2.fromOffset(keyX, keyY)
		progress += dt / LENGTH
		lock.Position = UDim2.fromOffset(W + 30 - progress * (W - keyX), H / 2)
		status.Text = "До замка: " .. math.floor(progress * 100) .. "%"
		-- пауки
		spawnT -= dt
		if spawnT <= 0 and progress < 0.92 then
			spawnT = 0.55 + math.random() * 0.5
			local s = sprite("🕷️", 30)
			table.insert(spiders, { l = s, x = W + 20, y = math.random(20, H - 20), v = 90 + math.random() * 70, wob = math.random() * 6 })
		end
		for i = #spiders, 1, -1 do
			local s = spiders[i]
			s.x -= s.v * dt
			s.y += math.sin(os.clock() * 4 + s.wob) * 30 * dt
			s.l.Position = UDim2.fromOffset(s.x, s.y)
			if (Vector2.new(s.x, s.y) - Vector2.new(keyX, keyY)).Magnitude < 24 then
				-- паук отбрасывает ключ назад, но не в самое начало
				local keep = math.max(0, progress - 0.25)
				reset()
				progress = keep
				status.Text = "🕷️ Паук укусил ключ! Отброшен назад…"
				return
			end
			if s.x < -20 then
				s.l:Destroy()
				table.remove(spiders, i)
			end
		end
		for i = #bullets, 1, -1 do
			local b = bullets[i]
			b.x += 420 * dt
			b.l.Position = UDim2.fromOffset(b.x, b.y)
			local hit = false
			for j = #spiders, 1, -1 do
				local s = spiders[j]
				if (Vector2.new(s.x, s.y) - Vector2.new(b.x, b.y)).Magnitude < 22 then
					s.l:Destroy()
					table.remove(spiders, j)
					hit = true
					break
				end
			end
			if hit or b.x > W + 10 then
				b.l:Destroy()
				table.remove(bullets, i)
			end
		end
		if progress >= 1 then
			running = false
			success = true
			status.Text = "<b>🔓 Замок открыт!</b> Закрой окно — книга откроется."
			lock.Text = "🔓"
		end
	end))
end

return Minigames
