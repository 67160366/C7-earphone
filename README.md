# C7-BioSync / C7-earphone

**เพื่อนหรือผู้พัฒนาที่เข้ามาอ่านต่อ เริ่มที่ [ศูนย์รวมเอกสาร](docs/README.md)**

- [สถานะล่าสุดและงานที่ต้องทำต่อ](HANDOFF.md)
- [วิธีส่งงานกลับ Git เดิมโดยไม่เปลี่ยน main](docs/GIT_COLLABORATION.md)

เอกสารส่งต่อจัดตามหัวข้อโดยไม่ลงวันที่ ครอบคลุมการแก้ไข ปัญหาทางเทคนิค ผลทดสอบ และงานค้าง ไม่รวมบันทึกการสนทนาส่วนตัว

**ข้อกำหนดหลัก: ไม่ใช้กล้อง** ในการวัด ตั้งศูนย์ หรือเดโม ใช้แนวทางเซ็นเซอร์สวมใส่/ไม่ใช้กล้องตามที่ผู้ใช้กำหนด แยกมุมที่วัดจริงออกจากตำแหน่งและ CVA ที่ประมาณจากแบบจำลองเสมอ

งานวิจัยที่เกี่ยวข้องและข้อจำกัด: [แนวทางวัดท่าทางโดยไม่ใช้กล้อง](docs/NON_CAMERA_POSTURE_RESEARCH.md)

เฝ้าบอร์ดอัตโนมัติในเครื่องโดยไม่เรียก AI: เปิด `Monitor-ESP32.cmd` เพื่อดูสถานะสด และ `Stop-Monitor-ESP32.cmd` เพื่อหยุดก่อนใช้ USB ของ dashboard/อัปโหลด ดูคำสั่งและสถานะใน `docs/HARDWARE_MONITOR.md`

USB dashboard ปัจจุบันต้องใช้ **firmware protocol v1** จาก sketch ที่แก้แล้ว ให้ build/upload ให้ตรงบอร์ดก่อนใช้กับฮาร์ดแวร์จริง เว็บใช้มุมหลังตั้งศูนย์จาก ESP โดยตรง ปุ่ม Zero ส่งคำสั่งไปที่ ESP และรอการยืนยัน ดูรายละเอียดและผลทดสอบใน `docs/DEVICE_PROTOCOL.md`

ต้นแบบติดตามมุมศีรษะและคอด้วย ESP32 รองรับ BNO085 หนึ่งหรือสองตัว และ MPU6050 เสริม พร้อมเดโม 3 มิติและบันทึกค่ามุมผ่าน PHP ส่วน CVA/แนวโน้มคอยื่นยังประมาณจากแบบจำลอง

## เริ่มใช้งานบน Windows

ต้องมี PHP 8+ พร้อม JSON/PDO ใน PATH ส่วน Node.js 18+ ใช้เฉพาะคำสั่งตรวจสอบ เครื่องที่เซตอัพนี้มี PHP 8.2.12 (`C:\xampp\php\php.exe`) และ Node.js 22.21.0 แล้ว

```powershell
cd D:\work\HeadSet
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Background
```

Setup สร้าง `.env` จาก `.env.example` เฉพาะเมื่อยังไม่มีไฟล์ และสร้าง `.local/data` สำหรับข้อมูลใหม่ ไม่มี npm/Composer dependencies ให้ติดตั้ง

- หน้าเสนอโปรเจกต์และจำลอง: http://127.0.0.1:8080/
- หน้าทดสอบรับค่าและบันทึก: http://127.0.0.1:8080/live_test.html
- ผังต่อวงจร: http://127.0.0.1:8080/wiring_guide.html
- เดโมขยับศีรษะจากเซ็นเซอร์จริงข้างเดียว: http://127.0.0.1:8080/sensor_demo.html (เปิดมอนิเตอร์เดิมไว้ ไม่ต้องกดเชื่อม USB ใน dashboard)

หน้า Motion Studio ใช้โมเดลสแกนศีรษะ 3D, จุดเซ็นเซอร์, มุม Pitch/Roll/Yaw และแนวโน้มคอยื่นจาก CVA จำลอง เกณฑ์ 5°/10 วินาทีเป็นเกณฑ์เดโม ไม่ใช่การวัดระยะคอยื่นหรือการวินิจฉัย โมเดลกับ Three.js เก็บไว้ใน assets พร้อมใบอนุญาตและไม่เรียก CDN; ไม่ต้องติดตั้ง npm เพิ่ม ตรวจด้วย `node scripts/demo-check.mjs`

เปิดผ่าน PHP server นี้เพื่อใช้ API ครบ ปุ่ม phpMyAdmin ในหน้าเดิมชี้ไป XAMPP แยกต่างหาก และไม่จำเป็นสำหรับโหมด CSV

```powershell
# ตรวจ syntax และทดสอบ API ด้วยข้อมูลชั่วคราว
node scripts/check.mjs
node scripts/device-check.mjs
# Optional: g++ desktop sketch/stub checks (ไม่ใช่ build สำหรับ ESP32 จริง)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/firmware-check.ps1

# หยุด server ที่เปิดแบบ Background
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Stop

# หรือรันแบบ foreground แล้วหยุดด้วย Ctrl+C
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1

# เปลี่ยนพอร์ต กรณี 8080 ถูกใช้ (หยุด instance เดิมก่อน)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Port 8081 -Background
```

Log อยู่ที่ `.local/server.stderr.log` และ `.local/server.stdout.log`; PID อยู่ที่ `.local/server.pid` ไม่เปิด server เพิ่มเมื่อมี instance ที่จัดการไว้อยู่แล้ว

## การเก็บข้อมูลและ config

ค่าเริ่มต้น `C7_MYSQL_ENABLED=0` ใช้ CSV + JSON ได้ทันทีโดยไม่ต้องเปิด MySQL ข้อมูลใหม่อยู่ใน `.local/data` และไม่เข้า Git ไฟล์ `api/posture_logs.csv` และ `api/latest_angle.json` เป็นข้อมูลเดิมจาก upstream ซึ่งเก็บไว้ตามต้นฉบับ

`api/config.php` อ่าน environment variables ก่อน `.env` (รูปแบบ INI ตามตัวอย่าง) ค่า `C7_DATA_DIR` แบบ relative นับจาก root โปรเจกต์ การเปลี่ยน `.env` มีผลใน request ถัดไป

| ตัวแปร | หน้าที่ |
| --- | --- |
| `C7_MYSQL_ENABLED` | `0` ปิด MySQL, `1` เปิด dual storage พร้อม fallback ไปไฟล์ |
| `C7_DATA_DIR` | โฟลเดอร์ CSV/JSON; template ใช้ `.local/data` |
| `C7_DB_HOST`, `C7_DB_PORT` | MySQL host/port |
| `C7_DB_NAME` | ชื่อฐานข้อมูล เฉพาะอักษร ตัวเลข underscore |
| `C7_DB_USER`, `C7_DB_PASSWORD` | ข้อมูลเชื่อมต่อ เก็บใน `.env` เท่านั้น |
| `C7_DB_SOCKET` | optional Unix socket สำหรับ XAMPP บน macOS |

หากไม่ใช้ `.env` และไม่ตั้ง environment variables API จะรักษาค่าเดิม: เชื่อม MySQL localhost:3306 ด้วย root/รหัสผ่านว่างและเขียนไฟล์ใน `api/` ให้ใช้ setup เพื่อเลือกค่า local ที่แยกข้อมูลไว้

## เปิด MySQL เพิ่มภายหลัง

1. เปิด MySQL/MariaDB ที่ต้องการใช้เอง แล้วกำหนด host/port/user/password ใน `.env`
2. ตั้ง `C7_MYSQL_ENABLED=1` และชื่อฐานข้อมูลสำหรับโปรเจกต์นี้
3. เมื่อบันทึกครั้งแรก API จะสร้าง database/table ถ้ายังไม่มี จึงต้องมีสิทธิ์ CREATE DATABASE, CREATE TABLE, INSERT และ SELECT
4. ตรวจ `mysql_saved` ในผลบันทึก และ `mysql_connected` ในผลอ่าน ถ้าเชื่อมไม่ได้ระบบจะใช้ไฟล์ต่อไป

`api/db_init.sql` เป็น schema เดิมพร้อม INSERT baseline; การ import ซ้ำจะเพิ่ม baseline ซ้ำ และชื่อฐานข้อมูลในไฟล์นี้คงที่ที่ `c7_posture_db` ไม่ต้อง import เพื่อใช้โหมด CSV ไม่ได้เปิดหรือเปลี่ยนฐานข้อมูล MySQL บนเครื่องระหว่างการ init ครั้งนี้

ใช้ router ที่ให้มาเพื่อให้ URL ดาวน์โหลด CSV/JSON อ่านจาก data directory ที่ตั้งไว้ Apache/XAMPP ที่เสิร์ฟไฟล์ตรงจะยังอ่านไฟล์ตัวอย่างใน `api/` จนกว่าจะตั้ง routing ให้ตรงกัน การเซตอัพนี้ครอบคลุม local PHP dev server

## ทดลองโดยไม่มี ESP32

เปิด `live_test.html` แล้วกด “ยิงท่าปกติ” หรือ “ยิงท่าคอยื่น” ผลจะบันทึกใน `.local/data` และแสดงในตารางล่าสุด ปุ่มจำลอง ESP32 จะส่งข้อมูลทุก 1 วินาที ให้กดหยุดเมื่อทดลองเสร็จ

ตัวอย่างเรียก API จาก PowerShell:

```powershell
$body = @{ c7_angle = -9; head_pitch = 0; head_roll = 0; head_yaw = 0; cva_angle = 52.05 } | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:8080/api/save_angle.php -Method Post -ContentType 'application/json' -Body $body
Invoke-RestMethod http://127.0.0.1:8080/api/get_latest.php
```

## ใช้ ESP32 จริง

Sketch ปัจจุบันคือ `esp32_c7_prototype/esp32_c7_prototype.ino` ใช้ USB Serial และปิด Wi-Fi/Bluetooth ไม่ได้ส่ง HTTP ตามตัวอย่างเก่าใน `base_plan.md`

1. ใช้เวอร์ชันใน `esp32_c7_prototype/build-profile.json`: Arduino CLI 1.5.1, ESP32 core 3.3.12 และ `SparkFun BNO080 Cortex Based IMU` 1.1.12 ซึ่งแยกสถานะ BNO085 สองตัวได้
2. มี profile สำหรับ ESP32-D0WD-V3 / Flash 4MB ที่ตรวจพบและ build/upload ผ่านแล้ว ใช้ `scripts/setup-esp32.ps1` และ `scripts/build-esp32.ps1` สำหรับติดตั้ง/build; คำสั่งสองตัวนี้ไม่อัปโหลดอัตโนมัติ
3. ตรวจผังวงจรกับ pin ของ sketch: SDA=21, SCL=22, BNO085 ซ้าย=`0x4A`, ขวา=`0x4B`, MPU6050 เสริม=`0x68`, motor=25, BOOT=0
4. เปิด Chrome/Edge ที่รองรับ Web Serial เข้า URL local ด้านบน ปิด Serial Monitor ที่จับพอร์ตเดียวกัน แล้วกดเชื่อมต่อ USB และเลือกพอร์ต
5. รับข้อมูลที่ 115200 baud เป็น JSON ทีละบรรทัดทุก 200 ms; ตั้งท่าตรงแล้วกด BOOT หรือส่ง `z`/`c` เพื่อตั้งศูนย์ใหม่

ต้องตรวจ pin กับรุ่น ESP32 ที่ใช้จริง โดยเฉพาะเมื่อใช้ S3/C3 แทน ESP32 รุ่นคลาสสิก ตรวจผล hardware ล่าสุดและข้อจำกัดใน `HANDOFF.md`: อัปโหลด v1 แล้ว แต่ address ฝั่งซ้าย 0x4A ยังไม่ตอบ

## เอกสารทำงานต่อ

- `.init`: บันทึกการเริ่มต้น workspace
- `AGENTS.md`: แนวทางสำหรับ coding agent ที่เข้ามาทำงานต่อ
- `docs/ARCHITECTURE.md`: โครงสร้างและเส้นทางข้อมูลจริง
- `HANDOFF.md`: สถานะล่าสุด ผลทดสอบ และประเด็นที่ต้องทำต่อ
- `docs/DEVICE_PROTOCOL.md`: protocol v1, การตั้งศูนย์, สูตร CVA ร่วม และข้อจำกัดปัจจุบัน
- `base_plan.md`: แผนงานเดิมและแนวคิดวิจัย ซึ่งมีส่วนที่ยังเป็น roadmap

รายละเอียด build จริง, library และการสำรอง Flash: `docs/HARDWARE_BUILD.md`
