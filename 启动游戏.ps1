# Run with PowerShell 7. Ctrl+C stops the local game server.
param([switch]$DesktopPet, [switch]$DshPetHeadless, [string]$DshPetBase, [string]$DshPetId, [string]$DshPetRuntimeFile, [switch]$DeepSeek, [switch]$Check)

. (Join-Path $PSScriptRoot 'launcher-common.ps1')
if (Invoke-PowerShell7Launcher -ScriptPath $PSCommandPath -Parameters $PSBoundParameters) { return }

$ErrorActionPreference = 'Stop'
$repoPath = $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $repoPath 'node_modules/ws/package.json'))) {
    Push-Location -LiteralPath $repoPath
    try {
        & npm.cmd ci --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw '游戏依赖安装失败，请检查网络后重试。' }
    } finally { Pop-Location }
}
if (($DesktopPet -or $DshPetHeadless) -and -not $DshPetBase) {
    $runtime = Join-Path $PSScriptRoot 'desktop-pet'
    $petPort = if ($DshPetHeadless) { 3099 } else { 3098 }
    $profile = if ($DshPetHeadless) { 'validation-state' } else { 'state' }
    $DshPetBase = "http://127.0.0.1:$petPort/dsh-pet-7340"
    if (-not $DshPetRuntimeFile) { $DshPetRuntimeFile = Join-Path $runtime "$profile/dsh-pet/standalone-runtime.json" }
}
if (($DesktopPet -or $DshPetHeadless) -and $DshPetRuntimeFile) {
    $env:SP_DSH_PET_RUNTIME_FILE = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($DshPetRuntimeFile)
}
if ($DeepSeek) {
    if (-not $env:DEEPSEEK_API_KEY) {
        if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'api_key.txt'))) {
            throw '请先设置 DEEPSEEK_API_KEY 与 DEEPSEEK_API_BASE，或在本地 api_key.txt 的两行分别填写密钥与 API 地址。'
        }
        $settings = @(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'api_key.txt') | ForEach-Object Trim | Where-Object { $_ })
        if ($settings.Count -lt 2) { throw 'api_key.txt 需要包含 DeepSeek 密钥和 API 地址。' }
        $env:DEEPSEEK_API_KEY = $settings[0]
        $env:DEEPSEEK_API_BASE = $settings[1]
    }
    if (-not $env:DEEPSEEK_MODEL) { $env:DEEPSEEK_MODEL = 'deepseek-v4.1-flash-1017' }
    $env:SP_DEEPSEEK_TEAMMATE = '1'
}
Push-Location -LiteralPath $repoPath
try {
    if ($DesktopPet -or $DshPetHeadless) {
        $env:SP_DSH_PET = '1'
        $env:SP_DSH_PET_HEADLESS = if ($DshPetHeadless) { '1' } else { '0' }
        if ($DshPetBase) { $env:SP_DSH_PET_BASE = $DshPetBase }
        if ($DshPetId) { $env:SP_DSH_PET_ID = $DshPetId }
    }
    if ($Check) {
        & $nodePath --check 'server/index.js'
        if ($LASTEXITCODE -ne 0) { throw '游戏脚本语法检查失败。' }
        Write-Host "游戏启动配置检查通过（PowerShell $($PSVersionTable.PSVersion.Major)）。"
        return
    }
    Write-Host '游戏地址：http://localhost:3000'
    Write-Host '同一局域网联机：其他设备访问本机局域网 IP 的 3000 端口，加入同一房间。'
    & $nodePath 'server/index.js'
} finally { Pop-Location }
