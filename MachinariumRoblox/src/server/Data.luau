--!nonstrict
-- Data: сохранение прогресса игрока (DataStore) + кэш сессии.
-- В Studio без включённого "Enable Studio Access to API Services" игра
-- работает, просто без сохранения.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage:WaitForChild("Machinarium").Config)

local Data = {}
Data.Profiles = {} :: { [Player]: any }

local store: DataStore? = nil
do
	local ok, res = pcall(function()
		return DataStoreService:GetDataStore(Config.DataStoreName)
	end)
	if ok then
		store = res
	else
		warn("[Machinarium] DataStore недоступен, прогресс не сохраняется:", res)
	end
end

local function default()
	return {
		v = 1,
		bolts = 0,
		totalBolts = 0,
		stage = 1,
		parts = {}, -- leg / arm / antenna
		josef = { speed = 0, jump = 0, stretch = 0, magnet = 0, rocket = 0, radar = 0 },
		berta = { rescued = false, cook = 0, basket = 0, love = 0, wheels = 0 },
		skin = "rust",
		skins = { rust = true },
		dress = "cream",
		dresses = { cream = true },
		facts = {},
		eggs = {},
		memories = {},
		quiz = {},
		hasCat = false,
		wins = 0,
		endings = 0,
		hintBook = false,
		gfx = "sunset",
	}
end

-- дополняем старые сохранения новыми полями
local function reconcile(data, template)
	for k, v in template do
		if data[k] == nil then
			data[k] = if type(v) == "table" then table.clone(v) else v
		elseif type(v) == "table" and type(data[k]) == "table" then
			reconcile(data[k], v)
		end
	end
	return data
end

function Data.Load(player: Player)
	local data = nil
	if store then
		for attempt = 1, 3 do
			local ok, res = pcall(function()
				return store:GetAsync("u_" .. player.UserId)
			end)
			if ok then
				data = res
				break
			end
			warn("[Machinarium] Ошибка загрузки, попытка", attempt, res)
			task.wait(1.5)
		end
	end
	data = reconcile(data or {}, default())
	Data.Profiles[player] = data
	return data
end

function Data.Get(player: Player)
	return Data.Profiles[player]
end

function Data.Save(player: Player)
	local data = Data.Profiles[player]
	if not data or not store then
		return
	end
	local ok, err = pcall(function()
		store:SetAsync("u_" .. player.UserId, data)
	end)
	if not ok then
		warn("[Machinarium] Ошибка сохранения:", err)
	end
end

function Data.Release(player: Player)
	Data.Save(player)
	Data.Profiles[player] = nil
end

function Data.StartAutosave()
	task.spawn(function()
		while true do
			task.wait(120)
			for _, p in Players:GetPlayers() do
				task.spawn(Data.Save, p)
			end
		end
	end)
	game:BindToClose(function()
		if RunService:IsStudio() and not store then
			return
		end
		for _, p in Players:GetPlayers() do
			Data.Save(p)
		end
	end)
end

return Data
