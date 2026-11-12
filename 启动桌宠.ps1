# Run with PowerShell 7. Ctrl+C stops the desktop pet.
param([ValidateRange(1, 65535)][int]$Port = 3098, [ValidateRange(1, 65535)][int]$BridgePort = 3087, [switch]$Headless, [switch]$Check, [switch]$Restart, [switch]$Stop, [string]$DataHome, [string]$CompanionStatusFile, [ValidateRange(0,4)][int]$PetCount = 0,
    [ValidateSet('dsh','direct')][string]$AiBackend, [ValidateSet('configured','official')][string]$DshRoute, [string]$DshExecutable)

. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if (Invoke-PowerShell7Launcher -ScriptPath $PSCommandPath -Parameters $PSBoundParameters) { return }

$ErrorActionPreference = 'Stop'
Initialize-StrongholdNetwork
Assert-StrongholdNode
if ($AiBackend) { $env:SP_AI_BACKEND = $AiBackend }
if ($DshRoute) { $env:SP_DSH_ROUTE = $DshRoute; if (!$AiBackend) { $env:SP_AI_BACKEND = 'dsh' } }
$env:SP_PWSH_EXECUTABLE = (Get-Process -Id $PID).Path
if ($DshExecutable) { $env:SP_DSH_EXECUTABLE = $DshExecutable }
if ($env:SP_AI_BACKEND -eq 'dsh') {
    if ($DshExecutable) { $env:SP_DSH_EXECUTABLE = $DshExecutable }
    if (-not $env:SP_DSH_EXECUTABLE) {
        $shortcutPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'DeepSeek Harness.lnk'
        if (Test-Path -LiteralPath $shortcutPath) {
            $shortcutShell = New-Object -ComObject WScript.Shell
            $env:SP_DSH_EXECUTABLE = $shortcutShell.CreateShortcut($shortcutPath).TargetPath
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcutShell)
        }
    }
    if (-not $env:SP_DSH_EXECUTABLE -or -not (Test-Path -LiteralPath $env:SP_DSH_EXECUTABLE)) {
        Write-Warning 'DSH runtime not found. Open Settings > API connection to choose its path or use direct API.'
    }
}
$runtime = Join-Path $PSScriptRoot 'desktop-pet'
$package = Join-Path $runtime 'node_modules/dsh-pet'
if (-not (Test-Path -LiteralPath (Join-Path $package 'lib/standalone.js'))) {
    Push-Location -LiteralPath $runtime
    try {
        & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw '桌宠依赖安装失败，请检查网络后重试。' }
    } finally { Pop-Location }
}
$helper = Join-Path $package 'runtime/electron-helper'
$personaAdapter = ([Uri](Join-Path $PSScriptRoot 'server/desktop/companion-adapter.js')).AbsoluteUri
$manifest = Get-Content -LiteralPath (Join-Path $package 'package.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne '0.4.1') { throw '卫戍桌宠扩展需要 dsh-pet v0.4.1。' }
if ($Stop -and ($Check -or $Restart)) { throw '-Stop 不能与 -Check 或 -Restart 同时使用。' }
if ($Headless -and -not $PSBoundParameters.ContainsKey('Port')) { $Port = 3099 }
$env:DSH_HOME = if ($DataHome) { [IO.Path]::GetFullPath($DataHome) } elseif ($Headless) { Join-Path $runtime 'validation-state' } else { Join-Path $runtime 'state' }
$data = Join-Path $env:DSH_HOME 'dsh-pet'
if ($Stop) { Stop-StrongholdDesktopPet -Port $Port -DataPath $data; Write-Output '桌宠已停止；人物、连接和历史保留。'; return }
if (!$Headless -and !$env:DSH_PET_ELECTRON_PATH) {
    $bundledElectron = Join-Path $runtime 'state/electron/electron.exe'
    if (Test-Path -LiteralPath $bundledElectron) { $env:DSH_PET_ELECTRON_PATH = $bundledElectron }
}
if ($Check) { & node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --check; if ($LASTEXITCODE -ne 0) { throw '桌宠检查未通过。' }; return }
if (!(Test-Path -LiteralPath (Join-Path $data 'main-config.jsonc'))) {
    $null = [IO.Directory]::CreateDirectory($data)
    $firstConfig = @{ pets = @(@{ id = 'main'; name = '桌面伙伴'; display = $(if ($Headless) { 'none' } else { 'both' }); size = 240; balanceEnabled = $false; whisperEnabled = $false; workStatusEnabled = $false }) }
    [IO.File]::WriteAllText((Join-Path $data 'main-config.jsonc'), ($firstConfig | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
    Write-Output '首次启动：请打开吊坠面板，在“设置 → API连接”配置连接，在“人物”导入角色卡。'
}
function Set-ArkPetCount([string]$ConfigFile, [bool]$HiddenPets) {
    if ($PetCount -eq 0 -or $Check) { return }
    $petConfig = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json -AsHashtable
    if (-not $petConfig.pets) { throw '桌宠配置缺少可复制的形象。' }
    $petList = @($petConfig.pets | Select-Object -First $PetCount)
    while ($petList.Count -lt $PetCount) {
        $partner = $petConfig.pets[0] | ConvertTo-Json -Depth 64 | ConvertFrom-Json -AsHashtable
        $partner.id = "partner-$($petList.Count + 1)"
        $partner.name = "搭档$($petList.Count + 1)"
        $partner.display = if ($HiddenPets) { 'none' } else { 'desktop' }
        $petList += $partner
    }
    $petConfig.pets = $petList
    [IO.File]::WriteAllText($ConfigFile, ($petConfig | ConvertTo-Json -Depth 64) + [Environment]::NewLine)
}
if ($Headless) {
    Set-ArkPetCount (Join-Path $env:DSH_HOME 'dsh-pet/main-config.jsonc') $true
    $config = Get-Content -LiteralPath (Join-Path $env:DSH_HOME 'dsh-pet/main-config.jsonc') -Raw | ConvertFrom-Json
    if (-not $config.pets -or ($config.pets | Where-Object { $_.display -ne 'none' })) { throw '无窗口配置要求所有桌宠的 display 为 none。' }
    if ($Restart) { Stop-StrongholdDesktopPet -Port $Port -DataPath (Join-Path $env:DSH_HOME 'dsh-pet') }
    & node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --port $Port
    return
}
$null = [IO.Directory]::CreateDirectory($data)
if ($Restart -and !$Check) { Stop-StrongholdDesktopPet -Port $Port -DataPath $data }
if ($CompanionStatusFile) {
    $statusFile=[IO.Path]::GetFullPath($CompanionStatusFile)
    if ([IO.Path]::GetFileName($statusFile) -ne 'ark-companion-status.json') {throw 'DSH status file name invalid'}
    [IO.File]::WriteAllText((Join-Path $data 'companion-link.json'),(@{statusFile=$statusFile}|ConvertTo-Json -Compress))
}
$existing=Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($existing -and !$Check) {
    $ownerProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$($existing.OwningProcess)"
    if ($ownerProcess.CommandLine -notlike '*dsh-pet*standalone.js*') {throw 'Desktop pet port is occupied by another application'}
    $existingStatePath = Join-Path $data 'standalone-runtime.json'
    if (!(Test-Path -LiteralPath $existingStatePath)) { throw '此端口已有其他数据目录的桌宠。请换用 -Port 或使用原数据目录。' }
    $existingState = Get-Content -LiteralPath $existingStatePath -Raw | ConvertFrom-Json
    if ($existingState.pid -ne $existing.OwningProcess -or $existingState.port -ne $Port) { throw '此端口与所选数据目录不匹配。请换用 -Port。' }
    Write-Output '桌宠已运行。使用 -Restart 加载代码更新，使用 -Stop 退出并保留数据。'
    return
}
$configPath = Join-Path $data 'main-config.jsonc'
Set-ArkPetCount $configPath $false
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $config.pets) { throw '桌宠配置没有宠物，请检查所选数据目录的 dsh-pet/main-config.jsonc。' }
$restored = @()
foreach ($pet in $config.pets) {
    if ($pet.display -notin @('desktop', 'both')) {
        $pet.display = if ($pet.display -eq 'web') { 'both' } else { 'desktop' }
        $restored += $pet.id
    }
}
if ($restored.Count) {
    [IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 64) + [Environment]::NewLine)
    Write-Host "已恢复桌面显示：$($restored -join ', ')。无窗口开发请使用 -Headless。"
}
$keyPath = Join-Path $data 'stronghold-pet.key'
if (-not (Test-Path -LiteralPath $keyPath)) {
    $key = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    [IO.File]::WriteAllText($keyPath, $key)
}
$settings = @{
    origin = "http://127.0.0.1:$BridgePort"
    token = (Get-Content -LiteralPath $keyPath -Raw).Trim()
} | ConvertTo-Json -Compress
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'server/desktop/native.js') -Raw
[IO.File]::WriteAllText((Join-Path $helper 'stronghold-pet.js'), "const strongholdPetConfig = $settings;`n$source")
$indexPath = Join-Path $helper 'index.html'
$index = Get-Content -LiteralPath $indexPath -Raw
$tag = '<script src="./stronghold-pet.js"></script>'
if (-not $index.Contains($tag)) {
    if (-not $index.Contains('</body>')) { throw '桌宠窗口页面缺少加载位置。' }
    [IO.File]::WriteAllText($indexPath, $index.Replace('</body>', "$tag`n  </body>"))
}
$roleSource = Join-Path $PSScriptRoot 'server/desktop'
foreach ($item in @(@('roleplay-windows.cjs','ark-roleplay-windows.cjs'), @('roleplay-preload.cjs','ark-roleplay-preload.cjs'), @('roleplay-config.cjs','roleplay-config.cjs'), @('bridge-timeouts.cjs','ark-bridge-timeouts.cjs'))) {
    Copy-Item -LiteralPath (Join-Path $roleSource $item[0]) -Destination (Join-Path $helper $item[1])
}
$bridgePath = Join-Path $helper 'main/bridge.js'
$bridgeSource = [IO.File]::ReadAllText($bridgePath)
$oldBridgeTimeout = '      }, 45000).unref?.();'
$newBridgeTimeout = "      }, require('../ark-bridge-timeouts.cjs').bridgeTimeout(method, url, body)).unref?.();"
if (!$bridgeSource.Contains($newBridgeTimeout)) {
    if ([regex]::Matches($bridgeSource,[regex]::Escape($oldBridgeTimeout)).Count -ne 1) { throw 'Desktop bridge timeout requires the pinned helper v0.4.1 hook.' }
    [IO.File]::WriteAllText($bridgePath,$bridgeSource.Replace($oldBridgeTimeout,$newBridgeTimeout))
}
$mainPath = Join-Path $helper 'main.js'
$helperMain = [IO.File]::ReadAllText($mainPath)
$panelMarker = '  createDisplaySync({ screen, petWindows, dpi });'
$oldPanelRegistration = "  require('./ark-roleplay-windows.cjs').install({ app, BrowserWindow, ipcMain, screen, hostRequest: bridge.hostRequest, petWindows, helperDir: __dirname });"
$panelRegistration = "  require('./ark-roleplay-windows.cjs').install({ app, BrowserWindow, ipcMain, screen, hostRequest: bridge.hostRequest, hostReady: () => !BRIDGE || !!bridge.callbackUrl(), petWindows, helperDir: __dirname });"
if ($helperMain.Contains($oldPanelRegistration)) { $helperMain=$helperMain.Replace($oldPanelRegistration,$panelRegistration); [IO.File]::WriteAllText($mainPath,$helperMain) }
if (!$helperMain.Contains($panelRegistration)) {
    if ([regex]::Matches($helperMain, [regex]::Escape($panelMarker)).Count -ne 1) { throw 'Desktop roleplay panel requires the pinned helper window hook.' }
    [IO.File]::WriteAllText($mainPath, $helperMain.Replace($panelMarker, "$panelMarker`n$panelRegistration"))
}
$preloadPath = Join-Path $helper 'preload.js'
$helperPreload = [IO.File]::ReadAllText($preloadPath)
$panelPreload = "require('./ark-roleplay-preload.cjs');"
if (!$helperPreload.Contains($panelPreload)) { [IO.File]::WriteAllText($preloadPath, "$helperPreload`n$panelPreload`n") }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'server/desktop/companion-native.js') -Destination (Join-Path $helper 'companion-native.js')
$index=Get-Content -LiteralPath $indexPath -Raw
if (!$index.Contains('<script src="./companion-native.js"></script>')) {
    [IO.File]::WriteAllText($indexPath,$index.Replace('</body>',"<script src=`"./companion-native.js`"></script>`n</body>"))
}
& node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --port $Port
