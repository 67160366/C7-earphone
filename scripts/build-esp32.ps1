[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$cli = Join-Path $root '.local/arduino-cli/arduino-cli.exe'
$config = Join-Path $root '.local/arduino-cli.yaml'
if (!(Test-Path -LiteralPath $cli) -or !(Test-Path -LiteralPath $config)) {
    throw 'Arduino CLI and local config are required; see docs/HARDWARE_BUILD.md.'
}
$profile = Get-Content -LiteralPath (Join-Path $root 'esp32_c7_prototype/build-profile.json') -Raw | ConvertFrom-Json
& $cli compile --config-file $config --fqbn $profile.fqbn --warnings all --build-path (Join-Path $root '.local/esp32-build') (Join-Path $root 'esp32_c7_prototype')
if ($LASTEXITCODE -ne 0) { throw 'ESP32 firmware build failed' }
Write-Host 'Build complete. This command does not upload or erase a board.'
