# พจนานุกรมข้อมูล BSRU Workshop

ใช้ SQLite ในเครื่อง (`database/schema.sql`) และ PostgreSQL/Supabase บน Vercel (`database/schema.postgres.sql`) วันเวลากิจกรรมใช้ Asia/Bangkok และส่งค่าลงฐานข้อมูลเป็น UTC ที่มี timezone ชัดเจน

Schema PostgreSQL หลักใช้ `JSONB` สำหรับ `data_json`/`payload_json`, `TIMESTAMPTZ` สำหรับวันเวลา และ `BOOLEAN` สำหรับ `closed` โค้ดยังอ่านฐานข้อมูล PostgreSQL รุ่นเดิมที่ใช้ TEXT/INTEGER ได้โดยไม่ล้างหรือแปลงตารางอัตโนมัติ

## users — บัญชีผู้ใช้

| ฟิลด์ | ความหมาย |
|---|---|
| id | รหัสบัญชี (TEXT, PK) |
| name, type, code | ชื่อ ประเภท และรหัสประจำตัว (code ไม่ซ้ำ) |
| email, phone | ช่องทางติดต่อ (ไม่ซ้ำ) |
| faculty, major | คณะและสาขา/หลักสูตร |
| status | WAITING, APPROVED หรือ REJECTED |
| role | user หรือ staff |
| password_salt, password_hash | salt และ scrypt hash; ไม่ส่งให้หน้าเว็บ |
| created_at | วันเวลาสร้างบัญชี |

## workshops — เวิร์กช็อป

| ฟิลด์ | ความหมาย |
|---|---|
| id | รหัสกิจกรรม (PK) |
| title, description, cover | ชื่อ รายละเอียด และภาพปก |
| start_at, end_at | วันเวลาเริ่มและสิ้นสุด |
| place | สถานที่ |
| capacity | จำนวนที่นั่งสูงสุด |
| hours | ชั่วโมงอบรมที่นับได้ |
| closed | 1 เมื่อเจ้าหน้าที่ปิดรับลงทะเบียน |
| created_at | วันเวลาสร้างกิจกรรม |

## registrations — การลงทะเบียนและเช็กชื่อ

| ฟิลด์ | ความหมาย |
|---|---|
| id | รหัสรายการ (PK) |
| user_id | ผู้ลงทะเบียน (FK → users.id) |
| workshop_id | กิจกรรม (FK → workshops.id) |
| status | PENDING, ATTENDED, ABSENT หรือ CANCELLED |
| created_at, updated_at | วันเวลาสร้างและแก้ไขล่าสุด |
| UNIQUE(user_id, workshop_id) | ป้องกันลงทะเบียนซ้ำ |

ชั่วโมงสะสมคำนวณจาก `workshops.hours` เฉพาะ registration ที่มีสถานะ ATTENDED จึงไม่บวกชั่วโมงซ้ำในตารางแยก

## ratings — แบบประเมิน

เก็บ id, registration_id (FK และไม่ซ้ำ), user_id (FK), score 1–5 และ created_at.

## complaints และ complaint_replies — คำร้องและคำตอบ

`complaints` เก็บผู้ส่ง หัวข้อ รายละเอียด สถานะ OPEN/REPLIED/CLOSED และวันเวลาส่ง ส่วน `complaint_replies` เก็บรหัสคำตอบ คำร้อง เจ้าหน้าที่ผู้ตอบ ข้อความ และวันเวลาตอบ

## notifications — การแจ้งเตือน

เก็บผู้รับ หัวข้อ ข้อความ ประเภท/รายการอ้างอิง เวลาอ่าน และวันเวลาสร้าง; แยกข้อมูลด้วย `user_id`.

## otp_challenges — คำขอ OTP

เก็บวัตถุประสงค์ ช่องทางติดต่อ hash ของ OTP จำนวนครั้งที่กรอกผิด วันหมดอายุ สถานะใช้แล้ว และ payload ที่จำเป็น โดยรหัสผ่านสมัครถูกแฮชก่อนบันทึก payload

## password_reset_grants — สิทธิ์ตั้งรหัสผ่านใหม่

เก็บ hash ของ grant, ผู้ใช้, วันหมดอายุ และวันเวลาที่ใช้แล้ว; token จริงส่งให้เว็บชั่วคราวหลังยืนยัน OTP

## sessions — เซสชัน

เก็บ hash ของ session token, user_id, CSRF token, วันหมดอายุ และวันเวลาสร้าง; cookie ฝั่งเบราว์เซอร์เป็น HttpOnly และ SameSite=Strict

## app_state — รุ่นข้อมูลสำหรับซิงก์หน้าเว็บ

เก็บ revision และ JSON snapshot ที่ใช้ซิงก์ UI กับข้อมูลเชิงสัมพันธ์ การแก้ข้อมูลใช้ transaction; ถ้าข้อมูลเปลี่ยนจากหน้าต่างอื่น API ปฏิเสธ revision เก่า
# ตารางเพิ่มเติม: login_attempts

ใช้จำกัดการลองเข้าสู่ระบบต่อบัญชีในช่วง 15 นาที และล้างรายการหมดช่วงเวลาเมื่อมีคำขอเข้าสู่ระบบ

| ฟิลด์ | ชนิด | ความหมาย |
|---|---|---|
| id | TEXT (PK) | รหัสการลองเข้าสู่ระบบ |
| identity | TEXT | อีเมลที่แปลงเป็นตัวพิมพ์เล็ก หรือเบอร์โทรศัพท์ |
| created_at | TIMESTAMPTZ / TEXT ใน SQLite | เวลาลองเข้าสู่ระบบ |

ดัชนี: `idx_login_attempts_identity(identity, created_at)`; PostgreSQL เปิด RLS และไม่ให้เบราว์เซอร์อ่านตารางโดยตรง

