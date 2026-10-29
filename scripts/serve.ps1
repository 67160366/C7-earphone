[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)][int]$Port = 8080,
    [switch]$Background,
    [switch]$Stop
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$local = Join-Path $root '.local'
$router = Join-Path $PSScriptRoot 'router.php'
$pidFile = Join-Path $local 'server.pid'
if ($Stop) {
    if (!(Test-Path -LiteralPath $pidFile)) { Write-Host 'No managed server PID.'; return }
    $serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
    if ($process) {
        if ($process.Name -ne 'php.exe' -or !$process.CommandLine.Contains($router)) {
            throw 'PID no longer belongs to this project PHP server; refusing to stop it.'
        }
        Stop-Process -Id $serverPid
    }
    Remove-Item -LiteralPath $pidFile
    Write-Host 'Project server stopped.'
    return
}
if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) { throw 'Run scripts/setup.ps1 first.' }
$php = (Get-Command php -ErrorAction Stop).Source
New-Item -ItemType Directory -Path $local -Force | Out-Null
if ($Background -and (Test-Path -LiteralPath $pidFile)) {
    $previousPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    if (Get-Process -Id $previousPid -ErrorAction SilentlyContinue) {
        throw 'A managed server PID is still active. Stop it with scripts/serve.ps1 -Stop first.'
    }
}
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
try { $listener.Start() } finally { $listener.Stop() }
if ($Background) {
    $server = Start-Process -FilePath $php -ArgumentList @('-S', "127.0.0.1:$Port", '-t', ('"' + $root + '"'), ('"' + $router + '"')) -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput (Join-Path $local 'server.stdout.log') -RedirectStandardError (Join-Path $local 'server.stderr.log') -PassThru
    Set-Content -LiteralPath $pidFile -Value $server.Id
    $ready = $false
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
        if ($server.HasExited) { throw 'PHP exited. Inspect .local/server.stderr.log.' }
        try {
            $response = Invoke-WebRequest "http://127.0.0.1:$Port/api/get_latest.php" -UseBasicParsing -TimeoutSec 2
            $body = $response.Content | ConvertFrom-Json
            if ($body.status -eq 'ok') { $ready = $true; break }
        } catch { Start-Sleep -Milliseconds 200 }
    }
    if (!$ready) {
        Stop-Process -Id $server.Id -ErrorAction SilentlyContinue
        Remove-Item -LiteralPath $pidFile
        throw 'Server did not become ready. Inspect .local/server.stderr.log.'
    }
    Write-Host "Ready: http://127.0.0.1:$Port/ (PID $($server.Id))"
} else {
    Write-Host "Open http://127.0.0.1:$Port/ ; Ctrl+C stops the server."
    & $php -S "127.0.0.1:$Port" -t $root $router
}
