--[[
    FH4N Script Hub V2
    Fitur: Fly, Speed, InfJump, Noclip, Anti-AFK
    Update: Draggable, Minimize to "FN" Logo
]]

local ScreenGui = Instance.new("ScreenGui")
local MainFrame = Instance.new("Frame")
local Title = Instance.new("TextLabel")
local Container = Instance.new("Frame")
local MinimizeBtn = Instance.new("TextButton")
local Logo = Instance.new("TextButton")
local UIListLayout = Instance.new("UIListLayout")

-- Setup Parent
ScreenGui.Parent = game.CoreGui
ScreenGui.Name = "FH4N_V2"

-- --- LOGO MINIMIZE (FN) ---
Logo.Name = "FN_Logo"
Logo.Parent = ScreenGui
Logo.BackgroundColor3 = Color3.fromRGB(45, 45, 45)
Logo.Position = UDim2.new(0.05, 0, 0.2, 0)
Logo.Size = UDim2.new(0, 50, 0, 50)
Logo.Visible = false
Logo.Text = "FN"
Logo.TextColor3 = Color3.fromRGB(255, 255, 255)
Logo.TextSize = 20
Logo.Font = Enum.Font.GothamBold

local UICornerLogo = Instance.new("UICorner", Logo)
UICornerLogo.CornerRadius = Point.new(0, 25) -- Membuat logo bulat

-- --- MAIN FRAME ---
MainFrame.Name = "MainFrame"
MainFrame.Parent = ScreenGui
MainFrame.BackgroundColor3 = Color3.fromRGB(30, 30, 30)
MainFrame.BorderSizePixel = 0
MainFrame.Position = UDim2.new(0.3, 0, 0.3, 0)
MainFrame.Size = UDim2.new(0, 200, 0, 280)
MainFrame.Active = true
MainFrame.Draggable = true -- Fitur Geser

local UICornerMain = Instance.new("UICorner", MainFrame)

Title.Parent = MainFrame
Title.Size = UDim2.new(1, -30, 0, 35)
Title.Text = "  FH4N HUB"
Title.TextColor3 = Color3.fromRGB(255, 255, 255)
Title.TextXAlignment = Enum.TextXAlignment.Left
Title.BackgroundTransparency = 1
Title.Font = Enum.Font.GothamBold

MinimizeBtn.Parent = MainFrame
MinimizeBtn.Size = UDim2.new(0, 30, 0, 30)
MinimizeBtn.Position = UDim2.new(1, -30, 0, 0)
MinimizeBtn.Text = "-"
MinimizeBtn.TextColor3 = Color3.fromRGB(255, 255, 255)
MinimizeBtn.BackgroundTransparency = 1
MinimizeBtn.TextSize = 20

Container.Parent = MainFrame
Container.Position = UDim2.new(0, 5, 0, 40)
Container.Size = UDim2.new(1, -10, 1, -45)
Container.BackgroundTransparency = 1

UIListLayout.Parent = Container
UIListLayout.Padding = UDim.new(0, 5)
UIListLayout.HorizontalAlignment = Enum.HorizontalAlignment.Center

-- --- LOGIKA MINIMIZE ---
MinimizeBtn.MouseButton1Click:Connect(function()
    MainFrame.Visible = false
    Logo.Visible = true
end)

Logo.MouseButton1Click:Connect(function()
    MainFrame.Visible = true
    Logo.Visible = false
end)

-- --- FUNGSI TOMBOL ---
local function createButton(name, callback)
    local btn = Instance.new("TextButton")
    btn.Parent = Container
    btn.Size = UDim2.new(1, 0, 0, 35)
    btn.BackgroundColor3 = Color3.fromRGB(50, 50, 50)
    btn.Text = name
    btn.TextColor3 = Color3.fromRGB(255, 255, 255)
    btn.Font = Enum.Font.Gotham
    btn.BorderSizePixel = 0
    
    local corner = Instance.new("UICorner", btn)
    corner.CornerRadius = UDim.new(0, 6)
    
    btn.MouseButton1Click:Connect(function()
        callback(btn)
    end)
    return btn
end

-- 1. Fly
local flying = false
createButton("Fly: OFF", function(btn)
    flying = not flying
    btn.Text = flying and "Fly: ON" or "Fly: OFF"
    local plr = game.Players.LocalPlayer
    local char = plr.Character or plr.CharacterAdded:Wait()
    if flying then
        local bv = Instance.new("BodyVelocity", char.PrimaryPart)
        bv.MaxForce = Vector3.new(math.huge, math.huge, math.huge)
        bv.Velocity = Vector3.new(0,0,0)
        bv.Name = "FH4NFly"
        task.spawn(function()
            while flying do
                bv.Velocity = workspace.CurrentCamera.CFrame.LookVector * 50
                task.wait()
            end
            bv:Destroy()
        end)
    end
end)

-- 2. Speed
local sOn = false
createButton("Speed: OFF", function(btn)
    sOn = not sOn
    game.Players.LocalPlayer.Character.Humanoid.WalkSpeed = sOn and 100 or 16
    btn.Text = sOn and "Speed: ON" or "Speed: OFF"
end)

-- 3. InfJump
local ijOn = false
game:GetService("UserInputService").JumpRequest:Connect(function()
    if ijOn then game.Players.LocalPlayer.Character:FindFirstChildOfClass("Humanoid"):ChangeState("Jumping") end
end)
createButton("InfJump: OFF", function(btn)
    ijOn = not ijOn
    btn.Text = ijOn and "InfJump: ON" or "InfJump: OFF"
end)

-- 4. Noclip
local ncOn = false
game:GetService("RunService").Stepped:Connect(function()
    if ncOn then
        for _, v in pairs(game.Players.LocalPlayer.Character:GetDescendants()) do
            if v:IsA("BasePart") then v.CanCollide = false end
        end
    end
end)
createButton("Noclip: OFF", function(btn)
    ncOn = not ncOn
    btn.Text = ncOn and "Noclip: ON" or "Noclip: OFF"
end)

-- 5. Anti-AFK
createButton("Anti-AFK: OFF", function(btn)
    local vu = game:GetService("VirtualUser")
    game:GetService("Players").LocalPlayer.Idled:Connect(function()
        vu:Button2Down(Vector2.new(0,0), workspace.CurrentCamera.CFrame)
        wait(1)
        vu:Button2Up(Vector2.new(0,0), workspace.CurrentCamera.CFrame)
    end)
    btn.Text = "Anti-AFK: ACTIVE"
    btn.BackgroundColor3 = Color3.fromRGB(0, 150, 0)
end)
