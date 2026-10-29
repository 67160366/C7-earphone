# ESP32 hardware build

The detected chip is classic ESP32-D0WD-V3 revision3.1 with4MB flash and40MHz crystal. The project uses the generic ESP32 Dev Module target with DIO40MHz flash,4MB/default partitions and115200baud upload. This identifies the chip/configuration, not a branded PCB model. Confirm a different board before reusing these settings.

Pinned versions and FQBN are in `esp32_c7_prototype/build-profile.json`:

- Arduino CLI1.5.1
- Espressif Arduino ESP32 core3.3.12
- SparkFun BNO080 Cortex Based IMU1.1.12 (AR/VR stabilized quaternion reports)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-esp32.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-esp32.ps1
```

Setup downloads official Arduino/Espressif package-index tools into ignored `.local`, without changing global Arduino configuration or PATH. Build outputs go to `.local/esp32-build`. Build does not upload or erase anything.

The sketch uses SparkFun's per-instance driver because Adafruit BNO08x1.2.7 uses static I2C/SH2 state: constructing a second Adafruit sensor replaces the first transport. The independent SparkFun instances keep address, packet and quaternion state separately. See [Adafruit source](https://github.com/adafruit/Adafruit_BNO08x/blob/master/src/Adafruit_BNO08x.cpp), [reported multi-instance issue](https://github.com/adafruit/Adafruit_BNO08x/issues/32), and [SparkFun driver](https://github.com/sparkfun/SparkFun_BNO080_Arduino_Library/blob/main/src/SparkFun_BNO080_Arduino_Library.cpp).

For an explicitly requested upload, release the selected serial port from dashboard/Serial Monitor first, then use the verified FQBN/configuration and build directory. Do not erase all flash or change eFuses as part of a normal sketch upload. Keep full-flash backups and their hashes under ignored `.local/firmware-backups`; they can contain device configuration and must not be committed/shared.

Official tooling references: [Arduino CLI installation](https://docs.arduino.cc/arduino-cli/installation), [Espressif Arduino installation](https://docs.espressif.com/projects/arduino-esp32/en/latest/installing.html), [esptool read/write commands](https://docs.espressif.com/projects/esptool/en/latest/esp32/esptool/basic-commands.html).

Hardware outcome and remaining validation are recorded in `HANDOFF.md`. Desktop stubs verify application logic only; real core builds and post-upload sensor/serial checks are separate evidence.

Previously verified on the tested wiring: pinned real core build passes (71% flash/14% RAM) and esptool upload hash verification passes. SparkFun emits a nonfatal I2C_BUFFER_LENGTH redefinition warning against this core. Post-upload right BNO085 and MPU6050 data, serial Zero acknowledgement, dashboard parser and isolated API readback pass. A20s steady-state capture had101/101 valid frames. That capture had no ACK at0x4A; later wiring sessions also observed0x4A. These are separate partial tests, not a full dual-ear validation. See HANDOFF.md.
