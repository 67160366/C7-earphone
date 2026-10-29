[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$profile = Get-Content -LiteralPath (Join-Path $root 'esp32_c7_prototype/build-profile.json') -Raw | ConvertFrom-Json
$local = Join-Path $root '.local'
$cliDirectory = Join-Path $local 'arduino-cli'
$cli = Join-Path $cliDirectory 'arduino-cli.exe'
New-Item -ItemType Directory -Path $cliDirectory -Force | Out-Null
if (!(Test-Path -LiteralPath $cli)) {
    $archive = Join-Path $local 'arduino-cli-stable.zip'
    Invoke-WebRequest -Uri "https://downloads.arduino.cc/arduino-cli/arduino-cli_$($profile.arduino_cli)_Windows_64bit.zip" -OutFile $archive
    Expand-Archive -LiteralPath $archive -DestinationPath $cliDirectory -Force
}
$cliInfo = (& $cli version --format json) | ConvertFrom-Json
if ($cliInfo.VersionString -ne $profile.arduino_cli) { throw "Expected Arduino CLI $($profile.arduino_cli); found $($cliInfo.VersionString)." }
$configuration = @{
    board_manager = @{ additional_urls = @($profile.board_manager_url) }
    directories = @{
        data = (Join-Path $local 'arduino-data')
        downloads = (Join-Path $local 'arduino-downloads')
        user = (Join-Path $local 'arduino-sketchbook')
    }
}
$config = Join-Path $local 'arduino-cli.yaml'
# JSON is valid YAML; serialize paths instead of hand-escaping Windows separators.
[IO.File]::WriteAllText($config, ($configuration | ConvertTo-Json -Depth 5), [Text.UTF8Encoding]::new($false))
& $cli core update-index --config-file $config
if ($LASTEXITCODE -ne 0) { throw 'Arduino index update failed' }
& $cli core install "$($profile.platform)@$($profile.platform_version)" --config-file $config
if ($LASTEXITCODE -ne 0) { throw 'ESP32 core install failed' }
foreach ($library in $profile.libraries) {
    & $cli lib install "$($library.name)@$($library.version)" --config-file $config
    if ($LASTEXITCODE -ne 0) { throw "Library install failed: $($library.name)" }
}
Write-Host 'ESP32 build tools ready inside .local. No board was uploaded.'
