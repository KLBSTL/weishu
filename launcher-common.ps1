# Shared launcher bootstrap. Keep this file ASCII for legacy Windows PowerShell.
function Initialize-StrongholdNetwork {
    if ($env:HTTP_PROXY -or $env:HTTPS_PROXY -or $env:ALL_PROXY) { return }
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $pending = $client.ConnectAsync('127.0.0.1', 7892)
        if (-not $pending.Wait(250) -or -not $client.Connected) { return }
        $env:HTTP_PROXY = 'http://127.0.0.1:7892'
        $env:HTTPS_PROXY = $env:HTTP_PROXY
        if (-not $env:NO_PROXY) { $env:NO_PROXY = 'localhost,127.0.0.1,::1' }
    } catch {
        # A missing local proxy is optional; explicit user settings always win.
    } finally { $client.Dispose() }
}

function Invoke-PowerShell7Launcher {
    param([string]$ScriptPath, [System.Collections.IDictionary]$Parameters)
    if ($PSVersionTable.PSVersion.Major -ge 7) { return $false }
    $pwshPath = 'E:\university_class\Tools\PowerShell\7\pwsh.exe'
    if (-not (Test-Path -LiteralPath $pwshPath)) {
        $command = Get-Command pwsh.exe -ErrorAction SilentlyContinue
        if (-not $command -or $command.Source -match '\\WindowsApps\\') { throw 'PowerShell 7 is required. Install it or run this script from pwsh.exe.' }
        $pwshPath = $command.Source
    }
    $launchArgs = @('-NoLogo', '-NoProfile', '-File', $ScriptPath)
    foreach ($key in $Parameters.Keys) {
        $value = $Parameters[$key]
        if ($value -is [System.Management.Automation.SwitchParameter]) {
            if ($value.IsPresent) { $launchArgs += "-$key" }
        } else { $launchArgs += "-$key"; $launchArgs += [string]$value }
    }
    $previousEncoding = [Console]::OutputEncoding
    try {
        [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
        & $pwshPath @launchArgs | Out-Host
        $childExitCode = $LASTEXITCODE
    } finally { [Console]::OutputEncoding = $previousEncoding }
    if ($childExitCode -ne 0) { throw "PowerShell 7 launcher exited with code $childExitCode." }
    return $true
}
function Stop-StrongholdDesktopPet {
    param([int]$Port, [string]$DataPath)
    $listener = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$listener) { return }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($owner.CommandLine -notlike '*dsh-pet*standalone.js*') { throw 'Desktop pet port belongs to another application.' }
    $state = Get-Content -LiteralPath (Join-Path $DataPath 'standalone-runtime.json') -Raw | ConvertFrom-Json
    if ($state.pid -ne $listener.OwningProcess -or $state.port -ne $Port -or !$state.token) { throw 'Desktop pet runtime does not match the listening process.' }
    $null = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/shutdown" -Method Post -ContentType 'application/json' -Body '{}' -Headers @{ 'X-DSH-Pet-Token' = $state.token } -TimeoutSec 5 -NoProxy
    $deadline = [DateTime]::UtcNow.AddSeconds(8)
    do {
        if (!(Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Desktop pet has not exited yet. Close its original launcher before restarting.'
}
