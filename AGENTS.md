# Working in C7-earphone

Read `README.md`, `docs/ARCHITECTURE.md` and `HANDOFF.md` before changing behavior.
`.init` records the checkout initialization. Keep the handoff current after meaningful work.

## Persistent user requirements

- Keep user-facing handoff documents undated and use `docs/README.md` as the entry point. The user explicitly excludes the conversation record from Git/push. Keep it only under ignored `.local/notes/CONVERSATION_RECORD.md`; never stage, copy into public docs, or link to it from shared documentation. Technical problems/fixes/results remain in HANDOFF and technical docs. Preserve historical observations separately from current status.
- The user wants to share work without changing the friend's old project. Work is isolated on `codex/hardware-demo-handoff`; do not commit, push or merge merely because sharing was discussed. Use branch + PR, or a fork if write access is absent, when explicitly authorized. Exclude local telemetry, flash backups and private attachments.

- **No cameras.** The user explicitly excludes cameras from this project's measurement, calibration, demo and proposed solutions. Do not propose or add camera-based tracking unless the user explicitly changes this requirement. Research papers may use optical reference equipment; identify that as the paper's validation method, not a project recommendation. Prefer wearable/non-camera sensing and distinguish measured orientation from inferred position/CVA.

## Stack and source of truth

- Original standalone Thai Canvas dashboards and wiring page, a separate Motion Studio demo with vendored Three.js/head scan, plain PHP APIs, a Python serial monitor and one Arduino ESP32 sketch.
- There is no package.json, Composer project, bundler or framework. Do not introduce one for routine fixes.
- The executable sketch currently uses **USB Serial**, 115200 baud, JSON lines every 200 ms. `base_plan.md` includes planned Wi-Fi and algorithm features that are not all implemented.
- `api/config.php` reads environment variables before project `.env`. Setup defaults to CSV/JSON in `.local/data`, with MySQL disabled.

## Commands

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Background
node scripts/check.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Stop
```

Use the supplied PHP router to serve the local app; a static Live Server does not execute PHP.
Node is needed only for the dependency-free checks. `check.mjs` starts a temporary PHP server and uses temporary data, never the tracked upstream samples.

## Editing and verification

- Preserve Thai text, UTF-8, current API fields and offline operation. Match nearby style.
- Preserve `api/posture_logs.csv` and `api/latest_angle.json` as upstream samples. Do not overwrite them with test telemetry.
- Never commit `.env`, `.local`, credentials, serial device identifiers or new personal sensor logs.
- If the user has the local hardware monitor running, read `.local/hardware-monitor/status.json` for checks instead of opening another serial reader. `scripts/monitor-esp32.ps1 -Action Stop` releases the port before upload/dashboard USB, and `-Action Start` resumes it. See `docs/HARDWARE_MONITOR.md`; the watcher uses no AI/API calls.
- The user requested the lightweight `esp32_monitor` subagent for hardware status and questions. Reuse that agent for substantive follow-up hardware checks; its project definition is `.codex/agents/esp32_monitor.toml` (gpt-6-luna, low effort, minimal context). Continuous capture remains the Python script; do not create per-frame agent/model polling. Do not promise unattended chat notifications after an agent turn ends.
- After API/config/router changes run `node scripts/check.mjs` and `git diff --check`.
- After UI behavior changes check the affected page in a browser, including its console and the save/readback flow where relevant. The automated check only parses inline JS; it does not exercise the DOM or Canvas.
- Firmware changes require a compile against the actual board/core/library versions and hardware validation. Do not label these complete based on web tests.
- CVA math exists in both HTML pages, PHP and the sketch. Compare all implementations before changing constants, coordinate signs or calibration. Record unresolved differences explicitly.
- USB now requires protocol v1; see `docs/DEVICE_PROTOCOL.md`. Firmware owns tare. Both pages use `assets/c7-device.js`; never remap calibrated axes or add cohort offsets to incoming measurements.
- After protocol/math/serial changes run `node scripts/device-check.mjs`; with g++ also run `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firmware-check.ps1`. Desktop stubs do not replace an ESP32 core/hardware build.
- Do not mistake pitch-deck illustrations, simulated drift correction or roadmap claims for features verified on hardware.
- The local dev server is single-user and binds to loopback. Changes for public hosting, authentication or concurrent writers are separate work.
- Do not push, flash a board or change shared databases as part of routine local initialization.
