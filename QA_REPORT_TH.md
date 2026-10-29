# รายงานตรวจสอบและแก้ไข BSRU Workshop

วันที่: 28 ตุลาคม 2569 (Asia/Bangkok)

ตรวจไฟล์แอปใน src/, api/, public/, database/, scripts/, tests/, package/lockfile, การตั้งค่า Vercel, คู่มือ และรายการไฟล์ในโฟลเดอร์ ไม่แก้ไฟล์ภายใน .git หรือ dependencies ใน node_modules และตรวจฐานข้อมูล SQLite ที่ใช้งานด้วยโหมดอ่านอย่างเดียว

## การแก้ไขหลัก

- src/utils.js: รองรับ JSON ทั้งข้อความและ object จาก JSONB; ตรวจวันหมดอายุด้วยเวลา; แปลงเวลากิจกรรม Asia/Bangkok เป็น UTC; ยอมรับภาพ assets ที่มีอยู่จริง; ปฏิเสธ password hash เสียอย่างปลอดภัย
- src/database/postgres.js และ index.js: รองรับ Date จาก TIMESTAMPTZ และ Boolean; ตรวจชนิดคอลัมน์ closed เพื่อรองรับฐานข้อมูลใหม่กับ INTEGER เดิม
- src/database/seed.js: สร้างผู้ดูแลได้เมื่อมีสมาชิกเดิมแต่ยังไม่มีเจ้าหน้าที่ ไม่เขียนทับเจ้าหน้าที่ที่มีอยู่
- database/schema.postgres.sql: รวม Schema PostgreSQL/Supabase ไว้ไฟล์เดียว ใช้ JSONB/TIMESTAMPTZ/BOOLEAN และเปิด RLS สำหรับตารางแอป ไม่มี DROP TABLE หรือ ALTER TYPE เพื่อแปลงข้อมูลเดิม
- src/auth.js: ปฏิเสธ session หมดอายุ วันที่ไม่ถูกต้อง และบัญชีที่ไม่อยู่ในสถานะ APPROVED
- src/store.js: เปรียบเทียบ JSON โดยไม่ขึ้นกับลำดับ key; ตรวจ ID ซ้ำ ชนิดข้อมูล และประวัติที่ไม่มีสิทธิ์แก้; กู้โครงสร้าง snapshot ที่เป็นค่าเริ่มต้น {} จากตารางเดิม; อัปเดต snapshot/revision หลัง API ลงทะเบียนหรือเช็กชื่อ
- src/routes.js: อ่าน JSONB อย่างถูกต้อง; OTP/grant ใช้ครั้งเดียวภายใต้ transaction; ค้นหาอีเมลรีเซ็ตโดยไม่สนตัวพิมพ์ใหญ่เล็ก; ใช้ Secure cookie ใน production; ไม่เช็กชื่อรายการที่ยกเลิก; ตอบ Error ชัดเจนเมื่อยังไม่ตั้งค่าส่ง OTP
- src/http.js: ตอบ 400 สำหรับ JSON null/array/primitive และตอบ 413 สำหรับข้อมูลเกินขนาดโดยไม่ตัด socket ทิ้งทันที
- src/app.js: ตรวจ Origin สำหรับ OPTIONS และเลิกส่ง Access-Control-Allow-Origin เป็น null
- src/static.js: ปฏิเสธ URL ที่มี null byte รองรับ HEAD/405 และจัดการข้อผิดพลาดของ file stream
- src/config.js และ server.js: ตรวจค่าพอร์ต แสดงพอร์ตจริงเมื่อใช้ 0 และรอปิดฐานข้อมูลเมื่อเริ่มเซิร์ฟเวอร์ไม่ได้
- public/assets/js/app.js: แก้ revision ย้อนกลับระหว่างบันทึกหลายครั้ง ป้องกันคำขอของบัญชีเก่าทับหน้าบัญชีใหม่ และซ่อนบัญชีสาธิตนอก localhost
- public/index.html และ assets/css/app.css: ย้าย inline CSS ไปไฟล์ CSS โดยรักษาลำดับ cascade เดิม และแก้ข้อความกรณีปิด JavaScript
- scripts/dev.js: ไม่ส่ง --watch-path บน Linux; start-local.bat ใช้ UTF-8 เพื่อแสดงภาษาไทย
- .vercelignore: ไม่ส่ง storage, cache และไฟล์ทดสอบไปกับ source deployment
- อัปเดต README, คู่มือ Deploy และพจนานุกรมข้อมูล

## ไฟล์ที่ลบ

- index.html และ index.original.html ที่โฟลเดอร์หลัก: เป็นหน้าเก่าที่ local server และ Vercel ไม่ใช้ ตรวจ hash แล้วตรงกับสำเนาใน Git HEAD จึงกู้คืนได้ หน้าเว็บที่ใช้งานคือ public/index.html
- database/schema.supabase.sql: เนื้อหาทั้งหมดรวมอยู่ใน database/schema.postgres.sql แล้ว พร้อมเพิ่ม RLS และไม่มีโค้ดเรียกใช้ชื่อไฟล์ที่ลบ
- .npm-cache/: แคชดาวน์โหลด npm ที่สร้างใหม่ได้

เก็บ node_modules, ฐานข้อมูล storage/bsru-workshop.sqlite และ WAL/SHM, log และเอกสารที่ยังใช้ ไม่มีการล้างข้อมูลบัญชีหรือเวิร์กช็อป

## ผลตรวจ

- npm run check: ตรวจไวยากรณ์ JavaScript ทั้งโปรเจกต์
- npm test: 15 tests ครอบคลุม SQLite, Schema Supabase ใหม่, PostgreSQL รุ่นเก่า, login/session, expired/rejected session, cold start, JSONB, Boolean, เวลา Bangkok, workshop save, OTP/reset/replay, revision conflict, administrator bootstrap, RLS, HTTP และการนำทาง UI ของผู้เรียน/เจ้าหน้าที่
- npm run format:check: ตรวจรูปแบบโค้ด
- PostgreSQL integration tests ใช้ PGlite ในเครื่อง ส่วน transaction advisory lock ใช้ test stub จึงยังไม่ใช่การทดสอบคำขอพร้อมกันบน Supabase จริง

## ขั้นตอนบนระบบ Deploy และข้อจำกัด

ยังไม่ได้เชื่อมต่อ Supabase จริง ไม่ได้เปลี่ยน Environment Variables และไม่ได้ Push/Redeploy จากการตรวจครั้งนี้ หลังนำโค้ดขึ้น ต้องตั้ง DATABASE_URL ให้ถูกต้อง และตั้ง BOOTSTRAP_ADMIN_EMAIL/BOOTSTRAP_ADMIN_PASSWORD หากยังไม่มีเจ้าหน้าที่ ตรวจผลที่ /api/health

บริการส่งอีเมล/SMS สำหรับ OTP ยังไม่ถูกติดตั้งหรือเชื่อมต่อ การล็อกอินบัญชีที่มีอยู่ไม่ต้องใช้ OTP แต่การสมัครและรีเซ็ตรหัสผ่านบน production ต้องเชื่อมบริการส่งจริงก่อน
