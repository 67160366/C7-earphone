# C7 USB protocol v1

Current behavior after the historical findings in `DASHBOARD_ESP_REVIEW.md` were fixed.

## Contract and calibration

Both dashboards load `assets/c7-device.js` locally. USB requires firmware protocol v1. Unversioned USB packets are rejected with an upload instruction. Legacy manual/API clients and historical files remain compatible with PHP.

ESP owns tare. Four measurement angles are calibrated anatomical degrees; browsers never swap axes, reverse pitch, add cohort offsets or tare again. Neutral is C7=-9 and head pitch/roll/yaw=0. Cohorts change references/thresholds without changing USB measurements.

```json
{"protocol_version":1,"boot_id":123456789,"calibration_id":1,"calibrated":true,"valid":true,"c7_estimated":true,"c7_angle":-2.5,"head_pitch":10,"head_roll":12,"head_yaw":20,"cva_angle":46.13}
```

Firmware also includes `sensors` presence/freshness flags for left/right/C7. It sends JSON lines every200ms at115200baud, including invalid status packets with null measurement fields. At least one detected head sensor is required. All detected head sensors and any detected C7 sensor must have samples no older than500ms. Missing/stale data never becomes a valid neutral posture. Sensor reset invalidates the tare.

Protocol1 requires finite JSON numbers, valid/calibrated=true, integer calibration_id>=1, and C7[-15,35], pitch[-25,45], roll[-30,30], yaw[-40,40]. Firmware auto-calibrates after1.5s when required sensors are fresh; successful BOOT or serial z/Z/c/C tare increments calibration_id. Both browser Zero buttons send `z\n` and wait for a changed calibration_id or boot_id. A5s acknowledgement timeout displays waiting/failure, not success. Browser sessionStorage tare is removed.

Browser stale timeout is1.2s without valid data. Invalid/stale state blanks posture numbers, dims the last model pose and skips persistence. Shared serial lifecycle uses generation identity, cancellation/cleanup, EOF handling, active-port disconnect filtering and an8192-character incomplete-line cap. Unrelated serial devices do not interrupt the active session.

USB starts by stopping auto simulation and invalidating in-flight DB responses. Manual/synthetic saves and DB updates cannot overwrite active USB measurements. Live rendering excludes demo drift/jaw jitter and directly applies received angles. Haptic UI explicitly says simulation; no motor is actuated.

## CVA model and persistence

JS, PHP and C++ use the same Y*X*Z quaternion rotation as the Canvas geometry:

```text
neckTilt = 4.2 + C7*1.02 + max(0, pitch*.16)
neck = rotate((0,.985,0), neckTilt, yaw*.35, roll*.4)
ear  = rotate((0,.12,.2505), pitch, yaw, roll)
CVA  = atan2(.04+neck.y+ear.y, max(.15,.725+neck.z+ear.z)) in degrees
```

Browser/API validate supplied protocol1 CVA within0.1degree of derived geometry for rounding, then use derived CVA rounded to2decimals. Legacy supplied CVA remains accepted; historical samples are untouched. Software parity is not physical measurement validation.

USB display is5Hz; storage is throttled to at least500ms with one request pending, so only a subset is saved. Workbench table USB IDs are local sequence IDs, not server IDs. Clearing the browser export buffer does not delete server history or calibrate the device.

API validates before writing, serializes local writers, checks write outcomes, atomically replaces JSON and recovers IDs from the CSV tail after cache failure. Responses include `mysql_saved`, `csv_saved`, `latest_saved`, optional `storage_error`; no durable history write yields HTTP500/status=error. UI separates live reception from save failure.

## Checks and evidence

```powershell
node scripts/check.mjs
node scripts/device-check.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firmware-check.ps1
git diff --check
```

- API: protocol validity/types/ranges/CVA, legacy compatibility, history/cache, partial/all disk failures, ID recovery and unavailable-MySQL fallback with temporary data.
- Device: unchanged angle semantics,360 fixtures across both Canvas geometries, chunked serial, invalid/stale states, calibration acknowledgement, replacement, EOF and disconnect scenarios.
- Firmware: g++ compiles the actual sketch with desktop API stubs in `tests/firmware`. Lifecycle assertions pass. 1,200 C++/JS fixtures have max error0.000008536degrees. This does not replace an actual Arduino ESP32 core/library build.
- Browser: disposable copies prepared by `scripts/prepare-browser-check.ps1` load `tests/serial-browser-mock.js`. Both real page handlers preserve -2.5/10/12/20 and CVA46.13, write isolated PHP storage, Zero returns52.05, invalid/stale blank numbers, and live-source guards preserve measurements. No error/warn console entries observed.

Evidence: ignored `.local/usb-canonical-verified.jpg`, `.local/usb-invalid-verified.jpg`. Browser test data lives under `.local/browser-fixture-data`, separate from `.local/data` and upstream samples.

## Remaining limits

An actual ESP32-D0WD-V3/4MB build and hash-verified upload now pass with the pinned profile in HARDWARE_BUILD.md. Right BNO0850x4B and MPU60500x68 provide fresh data; left0x4A does not ACK, so dual-ear operation and physical mounting axes remain unverified. The firmware now uses SparkFun per-instance transport and i/I diagnostic ACK lines. Sensor discovery remains boot-time only. Fusion is wrap-aware Euler midpoint, not the full quaternion/SLERP/coherence/drift pipeline in the plan. C7 is estimated from pitch without MPU and includes pitch weighting with it. Actual haptic output is unimplemented.

Working MySQL was not tested. DB/file histories and IDs are not reconciled after outages; recovered DB history may hide newer CSV readings. Keep verified local CSV mode until recovery policy is implemented/tested. Calibration/boot metadata is not retained in the angle-only CSV/SQL schema. Original narrow-screen fixed-column layout and full-CSV history reads remain.

Hardware evidence: HANDOFF.md and ignored .local/hardware-flash-record.json. Boot-time initialization confirms a real quaternion report and retries handshake timing misses.

Serial diagnostic `i/I` prints the three expected-address ACK checks. `s/S` scans all non-reserved7-bit addresses (0x08..0x77), printing `I2C FULL_SCAN_BEGIN`, ACK lines and `I2C FULL_SCAN_END`. Both are non-JSON debug output and do not constitute measurements. The local watcher in `docs/HARDWARE_MONITOR.md` uses the full scan and owns the serial port while running.
