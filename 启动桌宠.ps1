# Run with PowerShell 7. Ctrl+C stops the desktop pet.
param([ValidateRange(1, 65535)][int]$Port = 3098, [ValidateRange(1, 65535)][int]$BridgePort = 3087, [switch]$Headless, [switch]$Check)

. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if (Invoke-PowerShell7Launcher -ScriptPath $PSCommandPath -Parameters $PSBoundParameters) { return }

$ErrorActionPreference = 'Stop'
$runtime = Join-Path $PSScriptRoot 'desktop-pet'
$package = Join-Path $runtime 'node_modules/dsh-pet'
if (-not (Test-Path -LiteralPath (Join-Path $package 'lib/standalone.js'))) {
    Push-Location -LiteralPath $runtime
    try {
        & npm.cmd ci --omit=dev --ignore-scripts --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw '桌宠依赖安装失败，请检查网络后重试。' }
    } finally { Pop-Location }
}
function Initialize-PetProfile([string]$Profile, [string]$Display) {
    $dataPath = Join-Path $Profile 'dsh-pet'
    $null = [IO.Directory]::CreateDirectory($dataPath)
    $profileConfig = Join-Path $dataPath 'main-config.jsonc'
    if (-not (Test-Path -LiteralPath $profileConfig)) {
        $defaults = @{ pets = @(@{
            id = 'main'; name = '大肥鱼'; size = 320; display = $Display
            balanceEnabled = $false; whisperEnabled = $true; workStatusEnabled = $false
            fixedEnabled = $true; position = @{ preset = 'top-right'; marginX = 24; marginY = 100 }
        }) }
        [IO.File]::WriteAllText($profileConfig, ($defaults | ConvertTo-Json -Depth 16) + [Environment]::NewLine)
    }
}
$helper = Join-Path $package 'runtime/electron-helper'
$personaAdapter = ([Uri](Join-Path $PSScriptRoot 'server/desktop/standalone-persona.js')).AbsoluteUri
$manifest = Get-Content -LiteralPath (Join-Path $package 'package.json') -Raw | ConvertFrom-Json
if ($manifest.version -ne '0.4.1') { throw '卫戍桌宠扩展需要 dsh-pet v0.4.1。' }
if ($Headless) {
    if (-not $PSBoundParameters.ContainsKey('Port')) { $Port = 3099 }
    $env:DSH_HOME = Join-Path $runtime 'validation-state'
    Initialize-PetProfile $env:DSH_HOME 'none'
    $config = Get-Content -LiteralPath (Join-Path $env:DSH_HOME 'dsh-pet/main-config.jsonc') -Raw | ConvertFrom-Json
    if (-not $config.pets -or ($config.pets | Where-Object { $_.display -ne 'none' })) { throw '无窗口配置要求所有桌宠的 display 为 none。' }
    if ($Check) { & node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --check; return }
    & node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --port $Port
    return
}
$env:DSH_HOME = Join-Path $runtime 'state'
Initialize-PetProfile $env:DSH_HOME 'desktop'
$data = Join-Path $env:DSH_HOME 'dsh-pet'
$null = [IO.Directory]::CreateDirectory($data)
$configPath = Join-Path $data 'main-config.jsonc'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
if (-not $config.pets) { throw '桌宠配置没有宠物，请检查 desktop-pet/state/dsh-pet/main-config.jsonc。' }
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
if ($Check) { & node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --check; return }
& node --import $personaAdapter (Join-Path $package 'lib/standalone.js') --port $Port
