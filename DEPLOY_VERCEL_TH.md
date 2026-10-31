# Deploy บน Vercel พร้อม PostgreSQL

โค้ดเดิมใช้ SQLite แบบไฟล์และเปิดเซิร์ฟเวอร์ด้วย `listen()` จึงต้องปรับให้ Vercel เรียกผ่าน `api/index.js` และใช้ PostgreSQL ภายนอก ข้อมูลจะเก็บใน PostgreSQL แทนพื้นที่ชั่วคราวของ Function

## ตั้งค่าครั้งแรก

1. สร้างหรือเชื่อม PostgreSQL กับโปรเจกต์ เช่น Supabase หรือ Neon ใช้ฐานข้อมูลสำหรับแอปนี้โดยเฉพาะ
2. ตั้ง Node.js Version เป็น **24.x** ใน Project Settings
3. ตั้ง Environment Variables สำหรับ environment ที่จะ Deploy:
   - `DATABASE_URL`: PostgreSQL connection string พร้อมค่า TLS ตามที่ผู้ให้บริการกำหนด ถ้าใช้ Supabase ให้คัดลอก Transaction pooler จากหน้า Connect (พอร์ต 6543 และชื่อผู้ใช้ตามที่หน้า Connect ระบุ) ใช้รหัสผ่านฐานข้อมูล ไม่ใช่ anon key หรือรหัสผ่านบัญชี Supabase หากใช้ Neon ให้ใช้ pooled connection string
   - `BOOTSTRAP_ADMIN_EMAIL`: อีเมลผู้ดูแลระบบคนแรก
   - `BOOTSTRAP_ADMIN_PASSWORD`: รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ ห้ามมีช่องว่าง
   - `REGISTRATION_PROVIDER`: `password` สำหรับสมัครและเข้าสู่ระบบปกติ
   - `STORE_PLAINTEXT_PASSWORDS`: ปกติปิด (`0`) หากเจ้าของระบบเลือกเก็บรหัสผ่านที่อ่านได้ ให้ตั้ง `1` ตาม [SUPABASE_PASSWORD_VIEW_TH.md](SUPABASE_PASSWORD_VIEW_TH.md) และ deploy โค้ดรุ่นนี้
   - `SMTP_HOST`: `smtp.gmail.com`, `SMTP_PORT`: `465`
   - `SMTP_USER`: Gmail ผู้ส่ง และ `SMTP_PASSWORD`: Google App Password สำหรับส่ง OTP รีเซ็ตรหัสผ่าน ดู [PASSWORD_RESET_SETUP_TH.md](PASSWORD_RESET_SETUP_TH.md)
   - `APP_ORIGIN` (ไม่บังคับ): URL จริง เช่น `https://your-project.vercel.app` ถ้าใช้หลาย Preview URL ให้เว้นค่านี้เพื่อใช้ Host ของคำขอ
4. ใช้ Framework Preset **Other** และ Root Directory เป็นโฟลเดอร์ที่มี `package.json` ไฟล์ `vercel.json` กำหนดให้เสิร์ฟ `public/`, ไม่ต้องมี build command และส่ง `/api/*` ไป Function
5. Push โค้ดและ Redeploy หลังตั้งค่า Environment Variables
6. เปิด `/api/health` ต้องได้ `ok: true` และ `database: PostgreSQL` จากนั้นล็อกอินด้วยบัญชีผู้ดูแลที่ตั้งไว้ในพอร์ทัลเจ้าหน้าที่

ระบบสร้างตารางและผู้ดูแลเมื่อฐานข้อมูลยังว่าง การเปิด Function ใหม่ไม่ล้างข้อมูลเดิม ค่า bootstrap ใช้เฉพาะการสร้างผู้ดูแลครั้งแรก การเปลี่ยนค่า environment ภายหลังไม่เปลี่ยนรหัสบัญชีที่สร้างแล้ว

Schema หลักมีไฟล์เดียวคือ `database/schema.postgres.sql` ใช้ได้ทั้ง Supabase และ PostgreSQL ทั่วไป รองรับ JSONB, TIMESTAMPTZ และ BOOLEAN โดยยังรองรับตารางรุ่นเดิมที่ใช้ TEXT/INTEGER ไม่ต้อง DROP TABLE หรือแปลงชนิดข้อมูลเพื่ออัปเดตโค้ดครั้งนี้

การเชื่อมต่อของเซิร์ฟเวอร์ต้องมีสิทธิ์สร้างตาราง/ดัชนีและอ่านเขียนข้อมูล เช่นบัญชีฐานข้อมูลจากหน้า Connect ของ Supabase Schema เปิด RLS และไม่สร้าง policy ให้ anon/authenticated เพราะแอปใช้ backend ตรวจสิทธิ์เอง ห้ามนำ DATABASE_URL ไปใส่โค้ดฝั่งเบราว์เซอร์ บัญชีล็อกอินอยู่ใน public.users ซึ่งแยกจาก Supabase Auth

ถ้ามีตาราง users อยู่แล้วแต่ยังไม่มีเจ้าหน้าที่ ระบบสร้างผู้ดูแลจากค่า bootstrap ได้ หากมีเจ้าหน้าที่อยู่แล้วจะไม่เขียนทับบัญชีหรือรหัสผ่านนั้น

## ขอบเขต

- หากต้องการเก็บข้อมูล SQLite เดิม ให้ย้ายด้วย `npm run db:migrate` ก่อนเริ่มเว็บบนฐานข้อมูลใหม่ ตาม [SUPABASE_SETUP_TH.md](SUPABASE_SETUP_TH.md) การตั้ง DATABASE_URL อย่างเดียวไม่ย้ายข้อมูล ฐานข้อมูลใหม่ที่ไม่ได้ย้ายข้อมูลจะเริ่มด้วยผู้ดูแลหนึ่งบัญชีและยังไม่มีเวิร์กช็อป
- ไม่สร้างบัญชีสาธิตบน PostgreSQL เว้นแต่กำหนด `SEED_DEMO=1` อย่างชัดเจนสำหรับฐานข้อมูลทดสอบ
- ระบบสมาชิกปัจจุบันสมัคร/เข้าสู่ระบบได้โดยไม่ส่งอีเมล และส่ง OTP เฉพาะรีเซ็ตรหัสผ่านผ่าน SMTP จริง ไม่ต้องซื้อโดเมนสำหรับ Gmail หากยังไม่ตั้ง SMTP จะปิดการกู้รหัสผ่านออนไลน์ ส่วนการสมัครยังทำงานได้
- Preview และ Production ควรใช้ฐานข้อมูลแยกกัน
- บนเครื่อง เมื่อไม่มี `DATABASE_URL` จะใช้ SQLite เดิม และยังใช้ `npm run dev` ได้

## ตรวจ Error

- `Set DATABASE_URL...`: ยังไม่ได้เชื่อมฐานข้อมูลหรือตั้ง environment ไม่ครบ
- `First deployment requires...`: ยังไม่ได้ตั้งข้อมูลผู้ดูแลครั้งแรก หรือรหัสผ่านไม่ผ่านเกณฑ์
- `password authentication failed`, `ENOTFOUND`, connection timeout: ตรวจ connection string, เครือข่าย และสถานะ PostgreSQL
- `403`: ตรวจ Origin/โดเมนและ `APP_ORIGIN`
- หาก Function ตอบ `503` ให้ดูข้อความ `Application initialization failed` ใน Vercel Function Logs โดยไม่เผยแพร่ connection string หรือรหัสผ่าน

อ้างอิง: [SQLite บน Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [PostgreSQL ผ่าน Marketplace](https://vercel.com/docs/postgres), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
