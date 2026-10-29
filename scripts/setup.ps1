[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$php = (Get-Command php -ErrorAction Stop).Source
& $php (Join-Path $PSScriptRoot 'doctor.php')
if ($LASTEXITCODE -ne 0) { throw 'PHP requirements failed' }
if (!(Test-Path -LiteralPath (Join-Path $root '.env'))) {
    Copy-Item -LiteralPath (Join-Path $root '.env.example') -Destination (Join-Path $root '.env')
}
New-Item -ItemType Directory -Path (Join-Path $root '.local/data') -Force | Out-Null
Get-ChildItem -Path (Join-Path $root 'api'), (Join-Path $root 'scripts') -Filter '*.php' | ForEach-Object {
    & $php -l $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "PHP syntax error: $($_.FullName)" }
}
Write-Host 'Setup complete. Defaults use CSV/JSON; existing .env and upstream records are preserved.'
Write-Host 'Start: powershell -ExecutionPolicy Bypass -File scripts/serve.ps1 -Background'
