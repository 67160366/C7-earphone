[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path $root '.local/browser-fixture'
foreach ($directory in @($fixture, (Join-Path $fixture 'api'), (Join-Path $fixture 'assets'))) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}
foreach ($page in @('index.html', 'live_test.html', 'wiring_guide.html')) {
    $html = [IO.File]::ReadAllText((Join-Path $root $page))
    $html = $html.Replace('<script src="assets/c7-device.js"></script>', '<script src="assets/c7-device.js"></script><script src="serial-browser-mock.js"></script>')
    [IO.File]::WriteAllText((Join-Path $fixture $page), $html, [Text.UTF8Encoding]::new($false))
}
Get-ChildItem (Join-Path $root 'api') -Filter '*.php' | Copy-Item -Destination (Join-Path $fixture 'api')
Copy-Item -LiteralPath (Join-Path $root 'assets/c7-device.js') -Destination (Join-Path $fixture 'assets/c7-device.js')
Copy-Item -LiteralPath (Join-Path $root 'tests/serial-browser-mock.js') -Destination (Join-Path $fixture 'serial-browser-mock.js')
Write-Host "Fixture prepared: $fixture"
Write-Host 'Serve it with PHP, C7_MYSQL_ENABLED=0 and C7_DATA_DIR pointing to an isolated fixture data directory.'
