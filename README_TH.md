# BSRU Workshop — ระบบจัดการอบรมและเวิร์กช็อป

การ Deploy บน Vercel ใช้ PostgreSQL ภายนอก ดูขั้นตอนและค่าที่ต้องตั้งใน [DEPLOY_VERCEL_TH.md](DEPLOY_VERCEL_TH.md)

UI ใช้งานจาก `public/index.html` โดยใช้สไตล์ร่วมใน `public/assets/css/premium.css` ครอบคลุมหน้าผู้เรียนและเจ้าหน้าที่ รองรับหน้าจอมือถือ เมนูผ่านคีย์บอร์ด และการตั้งค่า `prefers-reduced-motion` เพื่อปิด Motion

โครงการสาธิต Node.js + SQLite สำหรับใช้งานบนเครื่องนี้ หน้าเดิมถูกเก็บไว้ที่ `index.original.html`; เว็บให้บริการจาก `public/` และไฟล์ฐานข้อมูลอยู่ที่ `storage/bsru-workshop.sqlite` ซึ่งอยู่นอกโฟลเดอร์เว็บ

## สิ่งที่ต้องมี

- Windows 10/11
- Node.js 22.13 ขึ้นไป (ใช้ `node:sqlite` ที่มากับ Node.js และใช้ Prettier สำหรับจัดรูปแบบโค้ด)

ตรวจ Node.js และ npm ใน PowerShell:

```powershell
node --version
npm --version
```

## พัฒนาผ่าน Terminal

เปิด Terminal ในโฟลเดอร์โปรเจกต์ แล้วรัน:

```powershell
npm install
npm run dev
```

เปิด URL ที่ Terminal แสดง ปกติคือ `http://127.0.0.1:8001` หากพอร์ตไม่ว่างจะใช้ 8002 โหมด dev จะรีสตาร์ตเมื่อแก้ `src/`, `server.js` หรือ `database/schema.sql` การแก้ไฟล์ใน `public/` ให้รีเฟรชเบราว์เซอร์เพื่อดูผล กด Ctrl+C เพื่อหยุด

- `npm start`: เปิดระบบตามปกติ
- `npm run check`: ตรวจไวยากรณ์ JavaScript
- `npm test`: ทดสอบ API กับฐานข้อมูลชั่วคราวแยกจากข้อมูลใช้งาน
- `npm run format`: จัดรูปแบบโค้ด
- `npm run format:check`: ตรวจรูปแบบโดยไม่แก้ไฟล์

กำหนดพอร์ตด้วย `$env:PORT='8010'` ก่อนรันคำสั่งได้ ฐานข้อมูลหลักยังอยู่ที่ `storage/bsru-workshop.sqlite` และเลือกฐานข้อมูลแยกได้ด้วย environment variable `DB_FILE`

## โครงสร้างโค้ดใหม่

- `public/index.html`: โครงหน้าเว็บ
- `public/assets/css/app.css`: รูปแบบและ responsive layout
- `public/assets/js/app.js`: การแสดงผล ฟอร์ม และการเรียก API
- `public/assets/images/`: รูปภาพที่แยกจาก data URI เดิม
- `src/server.js`: ประกอบโมดูลและเริ่มเซิร์ฟเวอร์
- `src/config.js`, `src/utils.js`: การตั้งค่าและฟังก์ชันร่วม
- `src/database/`: เปิด SQLite และสร้างข้อมูลสาธิตเริ่มต้น
- `src/auth.js`, `src/http.js`: session สิทธิ์ CSRF และ HTTP helpers
- `src/store.js`: อ่าน ตรวจสอบ และบันทึกสถานะระบบ
- `src/routes.js`, `src/static.js`: API และการให้บริการไฟล์หน้าเว็บ
- `scripts/`, `tests/`: คำสั่งพัฒนาและการทดสอบ

`server.js` ที่โฟลเดอร์หลักยังรองรับคำสั่งเดิม ส่วน `index.html` และ `index.original.html` ที่โฟลเดอร์หลักเก็บเป็นต้นฉบับอ้างอิง รายงาน `QA_REPORT_TH.md` เป็นผลตรวจเดิมก่อนการจัดโครงสร้างครั้งนี้

## เริ่มและหยุดระบบ

1. เปิดโฟลเดอร์ `C:\Users\ASUS\Desktop\edu_workshop_test`.
2. ดับเบิลคลิก `start-local.bat`.
3. ระบบลองเปิดที่ `http://127.0.0.1:8001` ก่อน หากพอร์ตไม่ว่างจะสลับไป `http://127.0.0.1:8002` โดยไม่ปิดโปรแกรมอื่น ให้ใช้ URL ที่หน้าต่างคำสั่งแสดง.
4. หน้าต่างคำสั่งจะแสดงตำแหน่งเว็บและไฟล์ฐานข้อมูล ปล่อยหน้าต่างนี้เปิดไว้ขณะสาธิต.
5. หยุดระบบโดยคลิกหน้าต่างเซิร์ฟเวอร์แล้วกด `Ctrl+C`.

เซิร์ฟเวอร์ผูกกับ `127.0.0.1` เท่านั้น ใช้สำหรับ localhost และการสาธิตในเครื่อง ไม่ได้เปิดให้เครื่องอื่นในเครือข่ายเข้าถึง

## บัญชีสาธิต

| บทบาท | อีเมล | รหัสผ่าน |
|---|---|---|
| นักศึกษา | `std_demo@bsru.ac.th` | `123456` |
| อาจารย์ | `staff_demo@bsru.ac.th` | `123456` |
| เจ้าหน้าที่ | `admin1@bsru.ac.th` | `123456` |

บัญชีเหล่านี้มีไว้สำหรับโหมดสาธิตในเครื่องเท่านั้น บัญชีใหม่จะใช้รหัสผ่านตามเกณฑ์ความปลอดภัยและต้องรอเจ้าหน้าที่อนุมัติ

## โหมด OTP ในเครื่อง

โครงการยังไม่ได้เชื่อม SMTP หรือบริการ SMS การขอ OTP จะแสดงรหัสในหน้าทดสอบของเว็บอย่างชัดเจน โดยรหัสมีอายุ 5 นาที ใช้ได้ครั้งเดียว และจำกัดการลอง/ขอซ้ำ ไม่มีการส่งอีเมลหรือ SMS จริง

## ฐานข้อมูล

- Schema: `database/schema.sql`
- ไฟล์ข้อมูลจริง: `storage/bsru-workshop.sqlite`
- สถานะและข้อมูลหลักถูกเก็บใน SQLite; รหัสผ่านเก็บเป็น salted scrypt hash; session เก็บเฉพาะ hash ของ token.
- API ใช้ prepared statements, ตรวจ session/บทบาท และตรวจ CSRF token สำหรับคำขอที่แก้ไขข้อมูล.
- เปิดดูสถานะเชื่อมต่อได้ที่ `http://127.0.0.1:8001/api/health`.

## สำรองและกู้คืน

ปิดเซิร์ฟเวอร์ก่อนคัดลอกไฟล์ฐานข้อมูล เพื่อให้สำเนาสมบูรณ์:

```powershell
Copy-Item .\storage\bsru-workshop.sqlite .\storage\bsru-workshop-backup.sqlite
```

กู้คืนโดยปิดเซิร์ฟเวอร์ก่อน แล้วคัดลอกไฟล์สำรองทับ `storage\bsru-workshop.sqlite`.

## แก้ปัญหาเบื้องต้น

- **พอร์ต 8001 ถูกใช้งาน:** ระบบจะลองพอร์ต 8002 ให้อัตโนมัติ ถ้าพอร์ตสำรองไม่ว่าง ให้ตรวจด้วย `Get-NetTCPConnection -LocalPort 8001,8002 -State Listen`.
- **ไม่พบคำสั่ง `node`:** ติดตั้ง Node.js LTS จาก [เว็บไซต์ทางการ](https://nodejs.org/en/download) แล้วปิด/เปิด PowerShell หรือ File Explorer ใหม่.
- **หน้าเว็บไม่เปิด:** ตรวจว่าหน้าต่าง `start-local.bat` ยังทำงาน และใช้ URL `http://127.0.0.1:8001`.
- **รีเซ็ตข้อมูลสาธิต:** หยุดเซิร์ฟเวอร์ก่อน จากนั้นสำรองแล้วลบไฟล์ฐานข้อมูลและไฟล์ `-wal`, `-shm` ถ้ามี แล้วเริ่มใหม่ ระบบจะสร้างฐานข้อมูลและข้อมูลสาธิตชุดเริ่มต้น.

รายละเอียดตารางอยู่ใน `DATABASE_DICTIONARY_TH.md` และ ER diagram อยู่ใน `ER_DIAGRAM.md`.
