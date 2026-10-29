# Handoff — สถานะปัจจุบันของ C7-earphone

เริ่มอ่านร่วมกับ [ศูนย์รวมเอกสาร](docs/README.md) เอกสารนี้ไม่ลงวันที่และไม่ใช้ผลตรวจสายเก่าแทนสถานะสด บันทึกการสนทนาส่วนตัวไม่อยู่ในชุดส่ง Git

## ข้อกำหนดและข้อสรุปหลัก

- **ไม่ใช้กล้อง** ในระบบวัด ตั้งศูนย์ เดโม หรือข้อเสนอถัดไป
- วัด orientation ของศีรษะจาก BNO ได้จริง; C7/CVA/แนวโน้มคอยื่นในแบบจำลองไม่ใช่การวัดตำแหน่ง C7–หูโดยตรง
- คอยื่นโดยศีรษะคงมุมเดิมอาจตรวจไม่พบ การเพิ่ม BNO ที่หูอีกข้างไม่ได้เติมข้อมูลตำแหน่งนั้น
- BNO หนึ่งตัวพอสำหรับเดโม ข้อเสนอการทดลองต่อคือ BNO หนึ่งตัว + MPU หนึ่งตัว แต่ source ยังรองรับ BNO สองตัว ไม่ได้เปลี่ยนวงจรถาวรตามข้อเสนอนี้
- ต้องตรวจ mounting axes/signs จริงก่อนอ้างว่าค่าที่ตั้งชื่อ pitch/roll/yaw ตรงกับแกนกายวิภาค

## Source และสถานะ Git

- Workspace: D:/work/HeadSet
- Origin: https://github.com/67160162-BUU/C7-earphone.git
- Fork สำหรับส่งงาน: https://github.com/67160366/C7-earphone — origin เดิมไม่มีสิทธิ์เขียนสำหรับบัญชีที่เชื่อมอยู่ จึงใช้ fork และ branch แยกแทน
- Baseline: ad2cbc280a54768f9d588ac6fe5351a70fa81073
- Branch ส่งต่อในเครื่อง: codex/hardware-demo-handoff
- งานส่งต่อใช้ branch นี้แยกจาก main ไม่มีการ merge หรือ push ตรงเข้า main; ตรวจ commit และ remote ล่าสุดด้วย git log / git status
- อ่าน [แนวทางส่ง Git](docs/GIT_COLLABORATION.md) ก่อนส่ง ต้องตรวจ staged diff และสิทธิ์ origin จริง อย่า force push หรือ push ตรง main
- .env, .local, raw telemetry, full flash backup และ .codex-remote-attachments ไม่เข้า Git เพื่อนต้องสร้าง runtime/config ของตัวเอง

## รันบนเครื่อง

PHP8+ สำหรับเว็บ, Python สำหรับ monitor, Node สำหรับ checks และ g++ สำหรับ desktop firmware checks เครื่องเดิมมี PHP8.2.12/Node22.21.0 ไม่ต้องติดตั้ง npm/Composer เพื่อรันเว็บ

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Background
```

เดโม: http://127.0.0.1:8080/sensor_demo.html
Workbench: http://127.0.0.1:8080/live_test.html
ผังสาย: http://127.0.0.1:8080/wiring_guide.html

.env เลือก C7_MYSQL_ENABLED=0 และเก็บ CSV/JSON ใน .local/data ตัวอย่างเดิม api/posture_logs.csv/latest_angle.json ไม่ถูกเขียนทับ PHP dev server ใช้ loopback single-user ไม่ใช่ public deployment

## สิ่งที่แก้และทำงานแล้ว

### Dashboard, protocol และ persistence

- assets/c7-device.js เป็นตัวใช้ร่วมสำหรับ validation/CVA/serial lifecycle
- Firmware เป็นเจ้าของ tare; เว็บไม่กลับ pitch สลับ roll/yaw ถ่วง C7 ซ้ำ หรือใช้ sessionStorage tare ทับค่าจริง
- Protocol1 มี boot/calibration identity, calibrated/valid และ presence/freshness; invalid/stale แสดงว่างและไม่บันทึกเป็นค่าปกติ
- USB แยกจาก DB/manual/synthetic streams; ป้องกันคำตอบเก่าทับสดและตัด simulation effects ออกจากข้อมูลจริง
- API ตรวจชนิด/ช่วง/finite/protocol, writer lock, atomic cache, sequence recovery และ truthful persistence errors
- CVA ใน JS/PHP/C++ ให้ผลเท่ากันเชิงซอฟต์แวร์ ไม่ใช่ anatomical validation
- Haptic ยังเป็น simulation; GPIO25ถูกตั้งLOW ไม่มีtimedmotorcontrol

### Firmware จริง

- ตรวจบอร์ดเป็น ESP32-D0WD-V3, flash4MB/crystal40MHz ผ่าน CP210x
- Backupเดิม4,194,304bytesพร้อมSHA-256อยู่.local/firmware-backupsแบบอ่านอย่างเดียว ไม่ควรแชร์ในGit
- Toolchain pinned: ArduinoCLI1.5.1, Espressifcore3.3.12, SparkFunBNO080library1.1.12
- Profile ESP32DevModule/DIO40MHz/4MB/default partitions/upload115200 ดู build-profile.json
- Buildจริงประมาณ71%flash/14%RAM และupload/hashผ่าน มีthird-party I2C_BUFFER_LENGTH warningที่ไม่ทำให้buildล้ม
- เปลี่ยนจากAdafruit static transportเป็นSparkFun per-instance; รอquaternionfiniteใกล้unitnormและretry ไม่อาศัยACKอย่างเดียว
- SDA21/SCL22, BNO0x4A/0x4B, optionalMPU0x68; report20Hz ส่งUSB5Hz
- ใช้wrap-aware Euler midpointเมื่อมีสองBNO ไม่ใช่fullSLERP/coherence/drift pipeline
- Firmware freshness500ms; browserUSB staleประมาณ1.2s; autozeroหลังมีข้อมูลสดและuptimeมากกว่า1.5s
- Serial i=knownaddress check, s=fullbus scan, z/c=zero; BOOTสั้นขอตั้งศูนย์
- Build/setup scripts ไม่flashเอง การflashบอร์ดครั้งก่อนเป็นงานที่ผู้ใช้อนุญาตแล้ว ห้ามflashซ้ำเป็นส่วนหนึ่งของการอ่านเอกสาร

### Hardware findings ที่ต้องแยกจากสถานะสด

เคยยืนยันBNO0x4B+MPU0x68ส่งเฟรมสด, Zeroack และisolatedAPIreadbackได้ มีsteady capture101/101validใน20วินาที บางรอบพบ0x4A+0x68และBNOสดด้วย

มีโมดูลหรือรอยต่อหนึ่งชุดที่ติด ๆ ดับ ๆ: สลับsensorโดยใช้สายเดิมแล้วบางตัวพบ/บางตัวไม่พบ อีกครั้งตัวสงสัยเคยกลับอ่านได้ ไม่ได้พิสูจน์ชิปเสีย ยังต้องแยกไฟ/ขั้ว/บัดกรี/modejumper/startup และติดป้ายตัวจริงให้ชัด ไม่สรุปจาก0x4A/0x4Bเพียงอย่างเดียวว่าตัวไหนเสีย

รูปที่ตรวจเป็นMassmoreHalleyV2.1: จ่าย3.3Vที่3Voได้, GNDร่วม, DI LOW/default0x4A/HIGH3.3Vเป็น0x4B ตรวจPS0/PS1ให้I2C อย่าเอา5Vเข้าขาDI ผลด้านไฟอ้างอิงบอร์ดรุ่นนี้ ไม่เหมารวมทุกbreakout

ในงานเปิดใช้webZeroล่าสุด มอนิเตอร์เริ่มใหม่และยังไม่พบบอร์ด นี่ไม่ใช่สถานะถาวร ทุกครั้งที่เช็คให้อ่าน .local/hardware-monitor/status.json พร้อมheartbeatและframe_age

### Monitor และ agent

เปิด Monitor-ESP32.cmd เพื่อเริ่ม/reuse watcherและดูstatus หยุด Stop-Monitor-ESP32.cmd ก่อนใช้ dashboardUSB/SerialMonitor/upload ไม่มีการเปิดพอร์ตซ้ำ

Python watcherค้นCP210x/reconnect, publishประมาณ1Hz, scan15s, rotatechange-onlylogs ไม่ใช้AI/APIหรือเขียนexperimenthistory การปิดviewerไม่หยุดwatcher และไม่ได้autostartหลังเปิดคอม

Agent esp32_monitor ใช้GPT-6Luna/lowตามที่ผู้ใช้ขอ อ่านsnapshot/eventsเพื่อตอบคำถาม ไม่ใช่ตัวจับทุกเฟรมและไม่ใช่บริการAIฟรีถาวร Configใน.codex/agents/esp32_monitor.toml มีไว้reuseเมื่อผู้ใช้ขอเช็ค

### Motion Studio

- Three.js0.186.1และheadscanพร้อมlicenseเก็บlocal ไม่ใช้CDN/buildstep
- หัวหมุนตามมุมจริงแบบYXZ; ลำตัวคงที่เพราะไม่ได้รับtorsoorientationอิสระ หุ่นไม่ใช่สัดส่วนเฉพาะผู้สวม
- มุมมอง3D/ข้าง/หน้า/หลัง, orbit/zoom, pitch/roll/yawและsensorfreshness
- ผังC7→tragus/แนวนอน/sector/CVAเป็นschematicจากค่าประมาณfirmware ไม่ใช้ความยาวเส้นเป็นเซนติเมตรจริง
- จุดC7/วง/เส้น/ผังเปิดปิดด้วยปุ่มC7; แผงBNOซ้าย/ขวา/MPUมีtoggleอิสระ และมีปุ่มเปิดปิดป้าย การซ่อนภาพไม่หยุดinput/classification
- ProxyลดCVAจากneutral52.05อย่างน้อย5องศาต่อเนื่อง10sแสดงสงสัยคอยื่น เป็นเกณฑ์เดโม ไม่ใช่diagnosis
- เมื่อinvalid/stale:ตัวเลข/ผลประเมินล้าง ภาพหยุด ผังแสดงท่าอ้างอิงหรือข้อมูลเก่า ไม่ปลอมข้อมูลสด
- ดูassetprovenanceที่ assets/vendor/README.md และข้อจำกัดการติดตั้งที่ docs/SENSOR_MOUNTING.md

### ตั้งศูนย์ผ่านเว็บ

ปุ่มตั้งศูนย์ท่านี้นับ3s → localPOST api/hardware_calibrate.php → watcherส่งzครั้งเดียว → รอเฟรมสดbootเดิมและcalibration_idเพิ่ม จึงขึ้นconfirmed มีreadiness/origin/customheader/JSONchecks คำขอหมดอายุเร็ว ไม่รับserialcommandอิสระและไม่รีบูต/flash

ข้อมูลมุมไม่validระหว่างรอACK; disconnect/reboot/sessionchange/timeoutล้มเหลวตามจริง Monitorรองรับและถูกrestartโหลดโค้ดแล้ว UIสำเร็จ/timeoutผ่านfixtureแยก ยังไม่สั่งzeroจริงในท่าของผู้ใช้ผ่านปุ่มใหม่นี้

Zeroเป็นEuler-offsetreference ไม่ใช่sensor-to-bodyrotation, intrinsicIMUcalibrationหรือตำแหน่ง3D ตั้งใหม่หลังปิดไฟ

## ผลตรวจที่มีหลักฐานแล้ว

คำสั่งด้านล่างสำหรับทำซ้ำ ผลที่เคยผ่านกับphysicalevidenceแยกจากกัน การแก้เอกสารส่งต่อไม่ได้รันhardwaretestทุกตัวซ้ำ

```powershell
node scripts/check.mjs
node scripts/device-check.mjs
node scripts/demo-check.mjs
node scripts/calibration-check.mjs
python -m unittest discover -s tests -p test_hardware_monitor.py
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firmware-check.ps1
git diff --check
```

APIchecksผ่านด้วยtemporarydata, devicechecks360fixturesผ่าน, C++stubs1,200fixturesสูงสุดต่างประมาณ0.000008536องศา, monitor7testsผ่าน, queueAPIและdemo/browserfixtureผ่าน การbuild/uploadcoreจริงกับhardwareบางชุดก็ผ่านแยกต่างหาก ไม่ยืนยันMySQLจริงหรือความแม่นยำกายวิภาค

Screenshots/captures/buildlogs/deviceidentities/localfixturesอยู่ignored.local ไม่ติดไปกับcloneเพื่อน

## งานต่อที่สำคัญ

1. ยืนยันsensor-to-bodyaxes/signsทีละแกน ก่อนยึดถาวรหรือรวมBNOสองข้าง
2. แยกโมดูลBNO/ขั้วที่ทำงานไม่สม่ำเสมอ และยืนยันความเสถียรหลังจัดสาย
3. ใช้BNOหนึ่งตัว+MPUหนึ่งตัวเป็นการทดลองเริ่มต้นได้ ทดสอบก้ม/ยื่นคางหัวระดับเดิม/โน้มทั้งตัวแยกกัน
4. ตรวจwebZeroกับบอร์ดจริงในท่าที่ผู้ใช้เลือก โดยไม่ตั้งศูนย์แทนขณะผู้ใช้ยังไม่ได้จัดท่า
5. ถ้าต้องการtranslation/CVAจริง ต้องเพิ่มobservableหรือmodelconstraintsที่ตรวจสอบได้ภายใต้ข้อห้ามกล้อง ดูงานวิจัยแต่ไม่ยกaccuracyของงานอื่นมาอ้างให้ของเรา
6. MySQLจริงและDB/fileoutagereconciliationยังไม่เสร็จ; schemaเก่าของCSV/SQLไม่ได้เก็บboot/calibrationmetadataทั้งหมด
7. มอเตอร์, high-rateเว็บstream, publichosting/auth/multiuserและการตรวจความแม่นยำทางคลินิกยังไม่ทำ
8. งานที่ส่งต่อให้เพื่อนอยู่ใน branch แยก ให้ review diff/commit ก่อนนำเข้า main การอ่านหรือรัน branch ไม่จำเป็นต้อง merge
