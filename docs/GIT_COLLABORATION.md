# ส่งงานให้เพื่อนโดยรักษางานเดิม

## ช่องทางส่งงานที่ใช้จริง

บัญชีที่เชื่อมอยู่ไม่มีสิทธิ์เขียน repo ของเพื่อน จึงใช้ fork `67160366/C7-earphone` และ branch `codex/hardware-demo-handoff` แทน ไม่เปลี่ยน origin/main ของเพื่อน และไม่ merge อัตโนมัติ

- [เปิด source/README ของ branch ส่งต่อ](https://github.com/67160366/C7-earphone/tree/codex/hardware-demo-handoff)
- [หน้าเริ่มอ่านสำหรับเพื่อน](https://github.com/67160366/C7-earphone/blob/codex/hardware-demo-handoff/docs/README.md)
- [เปรียบเทียบงานกับ repo เดิม](https://github.com/67160162-BUU/C7-earphone/compare/main...67160366:codex/hardware-demo-handoff)

เพื่อนอ่านจาก fork ได้เลย ไม่ต้องให้สิทธิ์เขียนเพิ่มและไม่ต้อง merge ถ้าต้องการรันโดยไม่แตะโฟลเดอร์เก่า:

```powershell
git clone --branch codex/hardware-demo-handoff --single-branch https://github.com/67160366/C7-earphone.git C7-earphone-hardware-demo
```

ส่วนด้านล่างเป็นทางเลือกทั่วไปเมื่อมีสิทธิ์เขียน repo ต้นทาง หรือเมื่อส่งงานเพิ่มเติม

## การเตรียมในเครื่องนี้

- Remote `origin`: https://github.com/67160162-BUU/C7-earphone.git
- แยก branch `codex/hardware-demo-handoff` สำหรับ source และเอกสารชุดนี้แล้ว
- จุดเริ่มต้นของ branch คือ commit `ad2cbc280a54768f9d588ac6fe5351a70fa81073`
- ตรวจสถานะไฟล์และ commit ปัจจุบันด้วย `git status` / `git log` ก่อนส่งงานเพิ่มเติม
- บันทึกการสนทนาไม่อยู่ในชุดที่จะส่ง ตามข้อกำหนดผู้ใช้ เก็บไว้เฉพาะ ignored local notes
- การสร้าง branch ไม่ได้ทำสำเนาโฟลเดอร์อีกชุด แต่ทำให้ commit ที่จะสร้างไปอยู่ในสายงานใหม่
- ถ้า `main` บน GitHub มีงานเพิ่มภายหลัง อย่า force push ไปทับ ให้ตรวจ diff และจัดการผ่าน PR

## ถ้ามีสิทธิ์เขียน repo ของเพื่อน

ทำจาก root โปรเจกต์ ตรวจว่า branch ปัจจุบันเป็น branch งาน ไม่ใช่ `main`

```powershell
git status
git branch --show-current
git fetch origin
git diff
git ls-files --others --exclude-standard
```

ทดสอบตาม [HANDOFF](../HANDOFF.md) และตรวจไฟล์ที่ส่ง โดยเฉพาะ untracked files เพราะ `git diff` ปกติยังไม่แสดงเนื้อหาไฟล์ใหม่

```powershell
git add -A
git diff --cached --stat
git diff --cached
git diff --cached --check
```

ขั้นตอนข้างบนใช้ตรวจงานก่อนส่งแต่ละครั้ง ห้ามมี `.env`, `.local`, บันทึกการสนทนา, flash backup, raw telemetry หรือรูปแนบส่วนตัวใน staged diff; หากพบให้ unstage ไฟล์นั้นและแก้ ignore ก่อนทำต่อ

เมื่อตรวจ staged diff เรียบร้อย:

```powershell
git commit -m "Add hardware fixes, motion demo and project handoff"
git push -u origin codex/hardware-demo-handoff
```

นี่เป็นการสร้าง/อัปเดต branch งานบน GitHub ไม่เปลี่ยนไฟล์ใน `main` ของเพื่อน เปิด Pull Request โดยเลือก base=`main`, compare=`codex/hardware-demo-handoff` แล้วให้เพื่อนอ่าน Files changed ก่อนตัดสินใจ merge **การ merge ต่างหากที่จะนำโค้ดเข้า main** ไม่ต้อง merge เพื่อเปิดอ่านเอกสารใน branch

ลิงก์ส่วนนี้ใช้ได้เฉพาะกรณีได้สิทธิ์และ push branch เข้า repo ต้นทางในอนาคต สำหรับงานที่ส่งด้วย fork ให้ใช้ลิงก์ด้านบน:

- [branch งาน](https://github.com/67160162-BUU/C7-earphone/tree/codex/hardware-demo-handoff)
- [หน้าเริ่มอ่านสำหรับเพื่อน](https://github.com/67160162-BUU/C7-earphone/blob/codex/hardware-demo-handoff/docs/README.md)
- [เปรียบเทียบกับ main / เริ่มสร้าง PR](https://github.com/67160162-BUU/C7-earphone/compare/main...codex/hardware-demo-handoff)

การ push เข้า origin ต้องใช้บัญชีที่มีสิทธิ์เขียน หาก permission denied ให้ใช้ fork ตามขั้นตอนถัดไป

## ถ้าไม่มีสิทธิ์เขียน repo ของเพื่อน

Fork repo ไปยังบัญชีของตัวเองก่อน แล้วเพิ่ม remote ของ fork โดยไม่เปลี่ยน `origin` เดิม:

```powershell
git remote add myfork https://github.com/YOUR_ACCOUNT/C7-earphone.git
git push -u myfork codex/hardware-demo-handoff
```

แทน `YOUR_ACCOUNT` ด้วยบัญชีและ URL fork จริง จากนั้นสร้าง PR จาก branch บน fork กลับไปยัง repo เพื่อน ยังไม่ต้องให้เพื่อน merge เพื่ออ่านงานบน fork

## เพื่อนอยากรันโดยไม่ยุ่ง checkout เดิม

วิธีง่ายคือ clone branch ลงโฟลเดอร์ใหม่ หลังจาก branch ถูก push แล้ว ใช้ fork ที่ส่งงานจริง:

```powershell
git clone --branch codex/hardware-demo-handoff --single-branch https://github.com/67160366/C7-earphone.git C7-earphone-hardware-demo
cd C7-earphone-hardware-demo
```

จากนั้นทำตาม [README หลัก](../README.md) โฟลเดอร์โปรเจกต์เก่าของเพื่อนจะไม่ถูกแก้ ใช้คนละพอร์ตเว็บหากเปิดสองรุ่นพร้อมกัน และอย่าให้สองโปรแกรมแย่ง serial board เดียวกัน

## ข้อควรแยกให้ชัด

Git branch ป้องกันการปะปนของ source/history ไม่ได้ทำให้ ESP จริงแยกเป็นสองตัว การ flash บอร์ดหรือใช้พอร์ต USB ยังกระทบฮาร์ดแวร์ตัวเดียวกัน การ clone ไม่ได้คืน firmware เก่าของบอร์ด Backup เดิมอยู่เฉพาะเครื่องนี้และไม่ควรใส่ใน repo

ไม่ใช้ `git push --force`, ไม่ push ตรงเข้า `main`, ไม่ merge เอง และไม่ลบ branch/งานเดิมของเพื่อนเพื่อส่งเอกสารชุดนี้
