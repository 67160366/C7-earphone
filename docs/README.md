# เริ่มอ่านโปรเจกต์จากตรงนี้

โปรเจกต์ ESP32 + เซ็นเซอร์สวมใส่สำหรับทดลองติดตามมุมศีรษะและคอ มี dashboard, API, firmware และหน้าเดโม 3D ส่วนมุม CVA/แนวโน้มคอยื่นยังเป็นค่าประมาณจากแบบจำลอง ไม่ใช่ระยะหรือมุมกายวิภาคที่วัดตรง

**ข้อกำหนดหลักของผู้ใช้: ไม่ใช้กล้อง** ในการวัด ตั้งศูนย์ หรือเดโม

## ถ้ามีเวลาอ่านสั้น ๆ

1. อ่าน [HANDOFF](../HANDOFF.md) เพื่อรู้ว่าตอนนี้ทำอะไรได้แล้วและอะไรยังไม่ได้ยืนยัน
2. เปิด [README หลัก](../README.md) เพื่อเซตอัพและรันบนเครื่องตัวเอง
3. อ่าน [แนวทาง Git ร่วมกับเพื่อน](GIT_COLLABORATION.md) ก่อน commit/push/merge

ชุดเอกสารนี้มีเฉพาะข้อมูลส่งต่อโปรเจกต์และปัญหาทางเทคนิค ไม่รวมบันทึกการสนทนาส่วนตัว

## เอกสารตามงาน

| อยากรู้เรื่อง | เปิดไฟล์ |
| --- | --- |
| ภาพรวมไฟล์และทางเดินข้อมูล | [ARCHITECTURE](ARCHITECTURE.md) |
| ปัญหา dashboard/ESP เดิมก่อนแก้ | [DASHBOARD_ESP_REVIEW](DASHBOARD_ESP_REVIEW.md) — เป็นประวัติ ไม่ใช่รายการบั๊กที่ยังเปิดทั้งหมด |
| Protocol, มุม, ความสด, Zero | [DEVICE_PROTOCOL](DEVICE_PROTOCOL.md) |
| Toolchain และ build บอร์ดจริง | [HARDWARE_BUILD](HARDWARE_BUILD.md) |
| สคริปต์มอนิเตอร์และตั้งศูนย์จากเว็บ | [HARDWARE_MONITOR](HARDWARE_MONITOR.md) |
| ติด MPU/BNO อย่างไรและข้อจำกัดแกน | [SENSOR_MOUNTING](SENSOR_MOUNTING.md) |
| งานวิจัยที่ไม่ใช้กล้อง | [NON_CAMERA_POSTURE_RESEARCH](NON_CAMERA_POSTURE_RESEARCH.md) |
| ข้อกำหนดสำหรับ coding agent | [AGENTS](../AGENTS.md) |

## ลองเปิดใช้งาน

ต้องมี PHP 8+; Node ใช้สำหรับตรวจสอบ ไม่ต้องติดตั้ง npm dependencies ของเว็บ

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/serve.ps1 -Background
```

- หน้าเดโม: http://127.0.0.1:8080/sensor_demo.html
- หน้าทดสอบเต็ม: http://127.0.0.1:8080/live_test.html
- ผังสาย: http://127.0.0.1:8080/wiring_guide.html

ถ้ามี ESP ให้เปิด `Monitor-ESP32.cmd` หน้าเดโมอ่านผ่านมอนิเตอร์นี้ ถ้าจะใช้ USB โดยตรงใน workbench ให้หยุดมอนิเตอร์ก่อนด้วย `Stop-Monitor-ESP32.cmd` พอร์ตเดียวเปิดอ่านพร้อมกันไม่ได้

เครื่องเพื่อนต้องสร้าง `.env`, runtime, tools และข้อมูลของตัวเองตาม setup; สิ่งเหล่านี้ไม่ส่งขึ้น Git ไม่ได้มีข้อมูลเซ็นเซอร์หรือ backup flash ติดไปกับ source

ถ้ายังไม่มีบอร์ด หน้าเดโมแสดงโมเดลกับท่าอ้างอิงได้ แต่ไม่แกล้งแสดงว่าเป็นข้อมูลสด
