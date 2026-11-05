# Shared launcher bootstrap. Keep this file ASCII for legacy Windows PowerShell.
function Invoke-PowerShell7Launcher {
    param([string]$ScriptPath, [System.Collections.IDictionary]$Parameters)
    if ($PSVersionTable.PSVersion.Major -ge 7) { return $false }
    $pwshPath = Join-Path $env:ProgramFiles 'PowerShell/7/pwsh.exe'
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
