# Mounting: current prototype

No cameras. These are starting fixtures for bench/temporary attachment, not a validated anatomical mounting protocol.

## Head BNO085

Secure to a rigid headset part near the ear that follows the skull; prevent slip/cable torque. Firmware directly extracts Euler rotations about sensor X/Y/Z as named head pitch/roll/yaw. It has no per-module mounting transform. An initial axis-isolation fixture places the sensor XY plane horizontal, X axis line lateral, Y front/back, Z vertical. Axis lines alone do not establish correct positive signs or coupled-rotation behavior: these must be checked.

Two modules require equivalent axis orientation in the wearer's frame. Facing both component sides outward on opposite ears does not automatically achieve this. Practical vertical boards at the ears require a documented sensor-to-body quaternion mounting rotation before averaging. Tare subtracts offsets and cannot perform this rotation. Address-based left/right names do not verify physical attachment.

## Base-of-neck MPU6050

Use an insulated enclosure secured on the posterior midline near the chosen C7/upper-back reference, not loose clothing. Record exact position and remount consistently. Current firmware reads atan2(ax,az), hence the observed tilt is about sensor Y. For a starting fixture, use the Y axis line lateral and XZ plane sagittal: PCB approximately vertical on the back, X line along spine, Z front/back. Determine actual positive axes from PCB/chip documentation and validate forward/backward signs; do not infer axes from VCC header orientation.

The output is gravity inclination, affected by movement acceleration. Emitted c7_angle also contains head-pitch weighting and neutral offset, so it is not raw MPU inclination or measured C7-to-ear displacement.

## Check before permanent mounting

1. Temporarily attach and use a relaxed upright forward-looking reference, not forced maximal chin tuck. Keep still; briefly press BOOT to request zero.
2. Nod, shoulder-tilt and turn separately. Named pitch/roll/yaw should respectively dominate; check display directions. Strong swaps/reversals need mounting transforms/sign validation, not repeated zeroing.
3. Keep head module still and tilt MPU around its lateral Y axis. Confirm reproducible response. Raw MPU angle diagnostics are needed for quantitative verification; current demo shows modeled CVA, not raw MPU inclination.
4. Repeat after removing/reattaching. Do not claim the current firmware's anatomical signs/dual-ear alignment are validated from these instructions.

Sources: [Massmore module](https://github.com/Massmore/Massmore_BNO08x_SKU-1010), [TDK MPU6000/6050 specification, section11.1](https://product.tdk.cn/system/files/dam/doc/product/sensor/mortion-inertial/imu/data_sheet/mpu-6000-datasheet1.pdf). Firmware mapping: quaternionToEulerDeg and readC7PitchFromMpu6050 in esp32_c7_prototype/esp32_c7_prototype.ino. No wiring, firmware or calibration changed while writing this guide.
