# Dashboard ↔ ESP32 compatibility review

**Historical pre-fix review:** locations/examples below describe the original code. Current fixes and verification are in `DEVICE_PROTOCOL.md` and `HANDOFF.md`.

ตรวจจากโค้ดเดิมก่อนแก้ เก็บไว้เป็นประวัติการตรวจ

## ข้อสรุป

เชื่อมต่อรับส่งข้อมูลกันได้ในระดับ protocol แต่ **การแปลมุม การตั้งศูนย์ และ CVA ยังไม่ตรงกัน** ระหว่าง ESP32, `index.html` และ `live_test.html` จึงยังไม่ควรถือว่าตัวเลขจากสองหน้าเทียบกันได้โดยตรง

การตรวจครั้งนี้เป็นการอ่านโค้ดและรันฟังก์ชัน JavaScript ที่แยกจาก source จริงด้วย Node VM เทียบกับสมการ ESP/PHP ที่ถอดมาคำนวณ ไม่ใช่การ compile/run C++ หรือการทดสอบ USB/เซ็นเซอร์จริง ไม่แก้พฤติกรรม application/firmware ระหว่าง review

## ส่วนที่สอดคล้อง

- ESP ส่ง JSON ครบ `c7_angle`, `head_pitch`, `head_roll`, `head_yaw`, `cva_angle` ตามชื่อที่เว็บ/API ใช้
- Serial ทั้งสองหน้าตั้ง 115200 baud; ESP ส่ง JSON หนึ่งบรรทัดทุก 200 ms
- ตัวอ่านเว็บสะสม buffer แล้วแบ่งตาม newline จึงรองรับ JSON ที่แบ่งมาในหลาย serial chunks และข้าม startup log ที่ไม่มี JSON
- ค่ามุมใช้หน่วยองศา ไม่พบการส่ง radians ใน payload
- โหมด USB ปิดการใช้ DB polling เป็นแหล่งมุม เพื่อไม่ให้ข้อมูลเก่าทับข้อมูล serial
- ทั้งสองหน้าจำกัดการส่งเข้า API ห่างกันอย่างน้อย 500 ms จึงไม่ได้เก็บครบทุก sample 5 Hz; ที่จังหวะ 200 ms สม่ำเสมอจะบันทึกประมาณทุก 600 ms
- PHP รับ field เหล่านี้ได้ และใช้ CVA ที่ client ส่งมาถ้ามี
- `computeKinematics` ของเว็บทั้งสองหน้าให้ CVA เท่ากันสำหรับมุมชุดเดียวกัน เมื่อไม่ใส่ simulated drift/jaw jitter

## Findings ตามความสำคัญ

### [P1] Workbench แปลงข้อมูลที่ ESP calibrate มาแล้วซ้ำ และเปลี่ยนแกน

ตำแหน่ง: `live_test.html:1510`, `live_test.html:1529`, `live_test.html:1632`; เทียบกับ `index.html:2744` และ sketch:239–251

ESP ส่งมุมหลังหัก offset/clamp แล้ว แต่ workbench ถือว่าเป็นค่าดิบและเรียก `normalizeRawSensorToBiomechanics` อีกครั้ง:

```text
pitch = -deltaPitch
roll  = deltaYaw * 0.6
yaw   = deltaRoll * 0.5
C7    = groupOrigin + deltaC7 + pitch * 0.35
```

ส่วน `index.html` ใช้มุมจาก packet โดยตรง การสลับแกน/กลับเครื่องหมาย/เพิ่ม pitch ใน C7 ซ้ำทำให้ผลต่างกันทั้งโมเดลและข้อมูลที่บันทึก ไม่ต้องมี hardware ก็ทำซ้ำได้

ตัวอย่างหลัง prime workbench ด้วย baseline `(-9,0,0,0)`:

| ค่า | ESP packet / มุมที่ index รับ | มุมหลัง workbench แปลง |
| --- | ---: | ---: |
| C7 | -2.50 | -6.00 |
| Pitch | +10.00 | -10.00 |
| Roll | +12.00 | +12.00 |
| Yaw | +20.00 | +6.00 |

roll ในตัวอย่างนี้เท่ากันโดยบังเอิญจาก `20 * 0.6 = 12`; เมื่อส่ง yaw อย่างเดียว จะกลายเป็น roll ใน workbench

แนวแก้: กำหนด semantic ของ packet ให้ชัดว่าเป็น anatomical angles หลัง calibration แล้ว ให้ทั้งสองหน้าใช้ receiver เดียวกัน ห้ามใช้ normalization สำหรับ raw-sensor รุ่นเก่ากับ packet นี้โดยไม่แยก protocol/version

### [P1] CVA ที่ส่ง/เก็บและ CVA บนโมเดลใช้คนละสมการ

ตำแหน่ง: sketch:111, `api/save_angle.php:49`, `live_test.html:807`, `index.html:1722`, `index.html:2752`

ESP/PHP ใช้ ear offset คงที่ ขณะที่เว็บหมุน ear offset ตาม skull orientation และ neck orientation ซึ่งรวม pitch/roll/yaw ทำให้สูตรเท่ากันเฉพาะบางกรณี เช่น baseline

| มุม C7 / pitch / roll / yaw | ESP/PHP formula | สูตรโมเดลเว็บทั้งสองหน้า |
| --- | ---: | ---: |
| -9 / 0 / 0 / 0 | 52.0522° | 52.0522° |
| -2.5 / 10 / 12 / 20 | 47.9501° | 46.1309° |
| -9 / 30 / 0 / 0 | 49.6599° | 45.1380° |
| 22 / -2 / 0 / 0 | 36.2850° | 36.5961° |
| -9 / 0 / 30 / 40 | 52.0522° | 50.0705° |

index แสดง `parsed.cva_angle` ในข้อความ USB และส่ง packet เดิมเข้า API แต่ Canvas/การประเมินสถานะคำนวณ CVA ใหม่ จึงเห็นคนละ CVA ได้แม้อยู่หน้าเดียวกัน ส่วน workbench ทิ้ง CVA จาก ESP แล้วคำนวณใหม่หลังเปลี่ยนมุมตาม finding แรก ตัวอย่าง packet เดียวกันข้างบนกลายเป็น CVA **51.97°** ใน workbench

แนวแก้: เลือก authoritative CVA model หนึ่งชุด ทำ parity fixtures ข้าม JS/PHP/C++ และระบุแยกให้ชัดหากต้องแสดงทั้ง measured/estimated/rendered values ห้ามสมมติว่าการปรับสูตรให้ตรงกันยืนยันความแม่นยำทางการวัดแล้ว

### [P1] Calibration ของ firmware และ browser ไม่ประสานกัน

ตำแหน่ง: sketch:223, sketch:232, `live_test.html:1458`, `live_test.html:1473`, `live_test.html:1514`

ESP auto-zero หลังมี sample และ uptime >1.5s; workbench auto-zero ทันทีที่อ่าน packet แรก และเก็บ tare ใน sessionStorage โดยไม่รู้ว่า firmware zero/reboot ไปแล้ว ปุ่ม Zero ในเว็บแก้ browser offsets เท่านั้น ไม่ส่ง `z`/`c` กลับไปที่ ESP

ถ้า browser เก็บ tare จาก packet `C7=-2.5,pitch=10,roll=12,yaw=20` แล้วผู้ใช้กด BOOT ให้ ESP ส่ง neutral `(-9,0,0,0)` workbench กลับได้ `C7=-12,pitch=10,roll=-12,yaw=-6,CVA=50.82` แทนท่าศูนย์ การเปิดพอร์ตที่ทำให้บอร์ด reset อาจเกิดลำดับรับ packet ก่อน firmware พร้อมเช่นกัน

แนวแก้: ให้ calibration มีเจ้าของเดียว พร้อม `calibration_id`/boot identity และสถานะ ready; ให้ปุ่มเว็บสั่ง calibration แล้วรอ acknowledgement แทนการตั้ง offset แยกโดยไม่รับรู้กัน

### [P1] ไม่มี sensor validity/freshness จึงรายงานท่าปกติแม้ไม่มีเซ็นเซอร์

ตำแหน่ง: sketch:33, sketch:173–264; receiver `index.html:2744`, `live_test.html:1636`

หากหา BNO ทั้งสองและ MPU ไม่เจอ ค่าเริ่มต้นยังเป็นศูนย์และ loop ยังส่ง `C7=-9,pitch=0,roll=0,yaw=0,CVA≈52.05` ทุก 200 ms ไม่มี field แจ้งว่าไม่มีเซ็นเซอร์หรือยังไม่ calibrated ถ้า sensor หยุดส่งระหว่างทำงานก็ใช้มุมเดิมต่อโดยไม่มี sample-age timeout ฝั่งเว็บยอมรับเป็นข้อมูลสดและบันทึกต่อ

แนวแก้: ส่ง sensor presence, freshness, calibrated และ valid flag; ไม่แสดงสถานะ posture ปกติหรือเก็บเป็น measurement เมื่อไม่มีข้อมูลที่ใช้ได้

### [P2] การเฉลี่ยมุมหูสองข้างเกิดข้อผิดพลาดที่ ±180°

ตำแหน่ง: sketch:208–211

เฉลี่ย Euler แบบ `(left + right)/2` ก่อน `wrapDeg` เช่น yaw 179° และ -179° เป็นทิศใกล้กัน แต่ได้ค่าเฉลี่ย 0° ทำให้โมเดลกระโดดหรือ tare ผิด การ wrap ภายหลังแก้ค่าเฉลี่ยที่เสียไปแล้วไม่ได้

แนวแก้: ใช้ quaternion averaging/SLERP หลังแก้ mounting frame หรืออย่างน้อย circular mean สำหรับมุมที่ wrap ได้ พร้อมทดสอบกรณีข้าม ±180° และเซ็นเซอร์ข้างหนึ่งยังไม่มี sample

### [P2] ข้อความ HAPTIC ACTIVE เป็น simulation ยังไม่ทำให้มอเตอร์จริงทำงาน

ตำแหน่ง: `index.html:2414`; sketch:141, sketch:232

เว็บเปลี่ยนข้อความ/สีเมื่อจับเวลาท่าผิดครบ 5 วินาที แต่ไม่มีการเขียนคำสั่งควบคุมมอเตอร์กลับทาง serial เฟิร์มแวร์มีเพียงการตั้ง GPIO25 เป็น LOW ตอน setup และรับคำสั่ง calibration เท่านั้น จึงยังไม่มี end-to-end haptic feedback

แนวแก้: ระบุ simulation ใน UI หรือ implement state machine ฝั่ง firmware และ protocol/acknowledgement ให้ครบก่อนแสดงเป็นสถานะของ hardware จริง

## ข้อจำกัดเพิ่มเติม

- Firmware ยึด C7 neutral ที่ -9 แต่เว็บเลือก group origin เป็น -9/6.7/0 ได้; index ใช้เป็น reference ขณะที่ workbench ใช้ origin ในการแปลงค่าที่บันทึก จึงเปลี่ยนกลุ่มแล้วอาจเปลี่ยน semantics ของ measurement
- Sliders บนเว็บจำกัด pitch สูงสุด 40 และ roll ±25 แต่ firmware ส่งได้ pitch 45 และ roll ±30; ค่า slider อาจไม่ตรงกับค่าที่กำลัง render
- ยังไม่ยืนยันทิศ anatomical pitch/roll/yaw กับการติดตั้งเซ็นเซอร์จริง ต้องทดสอบก้ม/เงย เอียง และหันแยกกัน โดยไม่สรุปจากชื่อแกนอย่างเดียว
- โหมดไม่มี MPU6050 ประมาณ C7 จาก head pitch จึงไม่สามารถถือว่ามีการวัด C7 อิสระจากศีรษะ
- browser USB history เป็นลำดับ local และอัปเดตทุก packet แต่ server เก็บเป็นบาง packet; ไม่ควรใช้ ID จำนวนแถวหรือ timestamp ของสองแหล่งแทนกัน

## Evidence และสิ่งที่ควรทำต่อ

- `node scripts/check.mjs` ผ่าน: API file save/readback, history, fallback และ syntax ยังทำงาน แต่ไม่ตรวจความถูกต้องของ semantic มุม
- `.local/coupling-probe.cjs`: แยก class/functions จาก HTML จริงมารันทดสอบโดยไม่มี DOM
- `.local/coupling-probe-results.json`: ตัวเลขผลทดสอบข้างบน
- รันทวนด้วย `node .local/coupling-probe.cjs` (artifact local ไม่เข้า Git)
- เริ่มแก้จาก protocol/เจ้าของ calibration/แกนมุม แล้วเลือก CVA model ร่วมกัน ก่อนทดสอบ hardware และเพิ่ม sensor validity/haptic

ไม่มีการแก้ application หรือ firmware ใน review นี้
