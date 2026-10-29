[CmdletBinding()]
param(
    [ValidateSet('Start','Stop','Status','Watch','Scan')][string]$Action = 'Status',
    [ValidatePattern('^COM[0-9]+$')][string]$Port
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$script = Join-Path $PSScriptRoot 'monitor-esp32.py'
$runtime = Join-Path $root '.local/hardware-monitor'
$pidFile = Join-Path $runtime 'monitor.pid'
$statusFile = Join-Path $runtime 'status.json'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null

function Get-MonitorProcess {
    if (!(Test-Path -LiteralPath $pidFile)) { return $null }
    $monitorPid = [int](Get-Content -LiteralPath $pidFile -Raw)
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $monitorPid"
    if ($process -and !$process.CommandLine.Contains($script)) { throw 'PID belongs to another process; refusing to control it.' }
    return $process
}

function Show-Status {
    if (!(Test-Path -LiteralPath $statusFile)) { Write-Host 'No monitor status yet.'; return }
    $status = Get-Content -LiteralPath $statusFile -Raw | ConvertFrom-Json
    $displayTime = [DateTimeOffset]::Parse($status.updated_at).ToOffset([TimeSpan]::FromHours(7)).ToString('yyyy-MM-dd HH:mm:ss zzz')
    Write-Host ("{0}  {1}  {2}" -f $displayTime, $status.port, $status.health)
    Write-Host ("Packets: {0} | valid received: {1} | last frame age: {2}s" -f $status.received_packets, $status.valid_packets, $status.frame_age_seconds)
    Write-Host ('I2C scan: ' + ($status.i2c_addresses -join ', '))
    foreach ($entry in @(@('BNO 0x4A','left'), @('BNO 0x4B','right'), @('MPU 0x68','c7'))) {
        $name = $entry[1]
        Write-Host ('{0}: initialized={1}, fresh={2}' -f $entry[0], $status.sensors."${name}_present", $status.sensors."${name}_fresh")
    }
    if ($status.unexpected_addresses.Count -gt 0) { Write-Host ('Other I2C addresses: ' + ($status.unexpected_addresses -join ', ')) }
    if ($status.angles) { Write-Host ('Angles: ' + ($status.angles | ConvertTo-Json -Compress)) }
    if ($status.error) { Write-Host ('Error: ' + $status.error) }
    if (!(Get-MonitorProcess)) { Write-Host 'Monitor process is not running; displayed status may be old.' }
    elseif (([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse($status.updated_at)).TotalSeconds -gt 5) { Write-Host 'Monitor status is stale.' }
}

switch ($Action) {
    'Start' {
        if (Get-MonitorProcess) { Show-Status; return }
        $python = (& python -c 'import sys; print(sys.executable)').Trim()
        $arguments = @('-u', ('"' + $script + '"'))
        if ($Port) { $arguments += @('--port', $Port) }
        $process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtime 'stdout.log') -RedirectStandardError (Join-Path $runtime 'stderr.log')
        Set-Content -LiteralPath $pidFile -Value $process.Id
        Start-Sleep -Seconds 2
        if ($process.HasExited) { Get-Content (Join-Path $runtime 'stderr.log'); throw 'Monitor failed to start.' }
        Show-Status
    }
    'Stop' {
        $process = Get-MonitorProcess
        if (!$process) { Write-Host 'Monitor is not running.'; return }
        [IO.File]::WriteAllText((Join-Path $runtime 'stop.request'), '')
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            if (!(Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 200
        }
        if (Get-Process -Id $process.ProcessId -ErrorAction SilentlyContinue) { throw 'Monitor has not stopped yet; inspect status/log before using the port.' }
        Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
        Write-Host 'Monitor stopped; serial port released.'
    }
    'Scan' {
        if (!(Get-MonitorProcess)) { throw 'Start the monitor first.' }
        [IO.File]::WriteAllText((Join-Path $runtime 'scan.request'), '')
        Write-Host 'Requested full I2C scan. Status refreshes automatically.'
    }
    'Status' { Show-Status }
    'Watch' {
        Write-Host 'Live local status. Ctrl+C closes this viewer; background monitor continues.'
        while ($true) { Clear-Host; Show-Status; Start-Sleep -Seconds 2 }
    }
}
