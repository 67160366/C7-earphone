# Local ESP32 monitor

Optional AI helper requested by the user: project agent `esp32_monitor`, defined in `.codex/agents/esp32_monitor.toml`, uses gpt-6-luna/low with narrowly scoped status/log context. It can interpret meaningful changes and answer hardware questions through the parent chat. The Python watcher is the continuous process; the AI helper still uses model tokens while working and is not an unlimited zero-token background service. Agent turns and script lifetime are separate; script logs remain available after an agent returns.

This is a local Python process, not an AI automation. It keeps reading the board without model/API calls. The process stays running until stopped or the computer restarts.

## Use

Double-click `Monitor-ESP32.cmd` to start/reuse the background monitor and open a live status viewer. Double-click `Stop-Monitor-ESP32.cmd` to stop it and release the serial port.

PowerShell equivalents from the project root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor-esp32.ps1 -Action Start
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor-esp32.ps1 -Action Watch
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor-esp32.ps1 -Action Status
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor-esp32.ps1 -Action Scan
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/monitor-esp32.ps1 -Action Stop
```

Ctrl+C in the viewer closes only that viewer; the background monitor continues. Stop the monitor before using dashboard USB, Arduino Serial Monitor, a separate serial probe or firmware upload. Those tools need exclusive access to the same port. The regular HTTP dashboard remains usable.

The monitor automatically finds one CP210x board, retries every2seconds when absent/unavailable and reconnects after USB unplug/replug, including a changed COM number. With multiple CP210x devices, specify `-Port COMn` explicitly. Device identifiers are runtime-only and ignored by Git.

The monitor does not reset, calibrate or flash a board. Change wiring with USB disconnected, then reconnect; boot-time sensor discovery still requires the board/sensors to restart. New `s/S` firmware diagnostic scans all non-reserved7-bit I2C addresses, without writing sensor registers. The monitor requests a scan after connecting and every15seconds; `-Action Scan` requests an earlier scan.

## Status

| State | Meaning |
| --- | --- |
| `READY_ALL_3` | Both BNO sensors and C7 report initialized/fresh, and measurement is valid |
| `PARTIAL_SENSOR_SET` | Valid angles, but fewer than all3 sensors are available/fresh |
| `SENSOR_NOT_READY` | Board sends frames, but calibration/validity/measurement fields are not usable |
| `WAITING_FOR_DATA` | Port open; no recognized protocol frame yet |
| `STALE` | No protocol frame for more than1.2seconds; angles/freshness are cleared |
| `DISCONNECTED` | Board absent, port unavailable or serial error; reconnecting automatically |
| `MONITOR_STOPPED` | Process deliberately stopped; status file is historical |

Presence in the full I2C scan and initialized/fresh sensor data are separate signals. A scanned address can ACK without completing the BNO protocol initialization. Other addresses are listed separately; the monitor does not guess their chip models.

Runtime artifacts are under ignored `.local/hardware-monitor/`:

- `status.json`: overwritten once/second with latest angles, sensor flags, scan addresses and process heartbeat.
- `events.log`: only state/sensor/address/boot/calibration changes; logs rotate at1MB with2 backups.
- `stderr.log`: process startup/unhandled errors.
- `monitor.pid` / `monitor.lock`: identity/exclusive-process protection.

The viewer displays Bangkok time and flags an old heartbeat. Raw measurements are not appended to CSV or the application's experiment history. Repeated checks should read `status.json` rather than launching another serial reader or repeatedly asking an agent to poll.

Requirements: Python3 with pyserial. This workspace has pyserial3.5 isolated under `.local/hardware-tools`. On a fresh checkout:

```powershell
python -m pip install --no-user --target .local/hardware-tools pyserial==3.5
```

## Verification

`python tests/test_hardware_monitor.py` checks ready/partial/invalid/stale/disconnect/reconnect behavior, clearing old readings, complete scan snapshots including unexpected addresses, and atomic status writes. Real runtime start/status/scan/stop/restart was exercised; the stopped process released the port for an independent reader. The current isolated suspect module scan found only0x68, with no ACK at0x4A/0x4B or any other usable address. This does not establish whether the module, power, wiring or selected interface is the cause.

## ตั้งศูนย์จากเว็บ

เปิด sensor_demo.html แล้วกด “ตั้งศูนย์ท่านี้” ขณะบอร์ดมีข้อมูลสด ระบบนับถอยหลัง 3 วินาที ส่งคำสั่ง z ผ่านมอนิเตอร์เดิม และรอ firmware ยืนยัน calibration_id ใหม่ ไม่ต้องเปิด COM ซ้ำหรือกด BOOT บนบอร์ด มอนิเตอร์ไม่ส่งคำสั่งเองหากไม่มีการกดจากผู้ใช้

api/hardware_calibrate.php รับเฉพาะ local POST พร้อม JSON และ custom header คำขออยู่ใน ignored .local/hardware-monitor/calibrate.request.json อายุไม่เกิน 5 วินาที ไม่รับคำสั่ง serial อิสระ ไม่แฟลชหรือรีบูตบอร์ด สถานะ calibration ใน snapshot เป็น sent/confirmed/failed; ระหว่างรอ ACK จะไม่แสดงค่ามุมว่า valid ถ้าบอร์ดหลุด เปลี่ยน boot/session หรือเกินเวลา จะแจ้งล้มเหลว

เป็นการตั้งท่าอ้างอิงด้วย offset ของ firmware ไม่แก้แกนเซ็นเซอร์ที่ติดตั้งผิดทิศ และไม่คงอยู่หลังปิดไฟบอร์ด ชุดทดสอบ: python -m unittest discover -s tests -p test_hardware_monitor.py และ node scripts/calibration-check.mjs
