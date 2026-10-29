[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location $root
try {
    $compiler = (Get-Command g++ -ErrorAction Stop).Source
    New-Item -ItemType Directory -Path '.local/firmware-check' -Force | Out-Null
    & $compiler -std=c++17 -Wall -Wextra -I tests/firmware/stubs tests/firmware/check.cpp -o .local/firmware-check/check.exe
    if ($LASTEXITCODE -ne 0) { throw 'Desktop sketch/stub compilation failed' }
    & ./.local/firmware-check/check.exe | Set-Content -Encoding ascii .local/firmware-check/results.txt
    if ($LASTEXITCODE -ne 0) { throw 'Firmware lifecycle assertions failed' }
    node tests/firmware/parity.cjs
    if ($LASTEXITCODE -ne 0) { throw 'C++ / dashboard CVA parity failed' }
    Write-Host 'Desktop stubs only: actual Arduino core/library and hardware remain unverified.'
} finally { Pop-Location }
