# Deploy บน Vercel พร้อม PostgreSQL

โค้ดเดิมใช้ SQLite แบบไฟล์และเปิดเซิร์ฟเวอร์ด้วย `listen()` จึงต้องปรับให้ Vercel เรียกผ่าน `api/index.js` และใช้ PostgreSQL ภายนอก ข้อมูลจะเก็บใน PostgreSQL แทนพื้นที่ชั่วคราวของ Function

## ตั้งค่าครั้งแรก

1. สร้างหรือเชื่อม PostgreSQL กับโปรเจกต์ เช่น Neon ผ่าน Vercel Marketplace ใช้ฐานข้อมูลสำหรับแอปนี้โดยเฉพาะ
2. ตั้ง Node.js Version เป็น **24.x** ใน Project Settings
3. ตั้ง Environment Variables สำหรับ environment ที่จะ Deploy:
   - `DATABASE_URL`: PostgreSQL connection string ที่ผู้ให้บริการให้มา พร้อมค่า TLS ตามที่ผู้ให้บริการกำหนด ถ้าใช้ Neon ให้ใช้ pooled connection string
   - `BOOTSTRAP_ADMIN_EMAIL`: อีเมลผู้ดูแลระบบคนแรก
   - `BOOTSTRAP_ADMIN_PASSWORD`: รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ ห้ามมีช่องว่าง
   - `APP_ORIGIN` (ไม่บังคับ): URL จริง เช่น `https://your-project.vercel.app` ถ้าใช้หลาย Preview URL ให้เว้นค่านี้เพื่อใช้ Host ของคำขอ
4. ใช้ Framework Preset **Other** และ Root Directory เป็นโฟลเดอร์ที่มี `package.json` ไฟล์ `vercel.json` กำหนดให้เสิร์ฟ `public/`, ไม่ต้องมี build command และส่ง `/api/*` ไป Function
5. Push โค้ดและ Redeploy หลังตั้งค่า Environment Variables
6. เปิด `/api/health` ต้องได้ `ok: true` และ `database: PostgreSQL` จากนั้นล็อกอินด้วยบัญชีผู้ดูแลที่ตั้งไว้ในพอร์ทัลเจ้าหน้าที่

ระบบสร้างตารางและผู้ดูแลเมื่อฐานข้อมูลยังว่าง การเปิด Function ใหม่ไม่ล้างข้อมูลเดิม ค่า bootstrap ใช้เฉพาะการสร้างผู้ดูแลครั้งแรก การเปลี่ยนค่า environment ภายหลังไม่เปลี่ยนรหัสบัญชีที่สร้างแล้ว

## ขอบเขต

- ยังไม่ได้ย้ายข้อมูลจาก `storage/bsru-workshop.sqlite` ไป PostgreSQL อัตโนมัติ ฐานข้อมูลใหม่เริ่มด้วยผู้ดูแลหนึ่งบัญชีและยังไม่มีเวิร์กช็อป
- ไม่สร้างบัญชีสาธิตบน PostgreSQL เว้นแต่กำหนด `SEED_DEMO=1` อย่างชัดเจนสำหรับฐานข้อมูลทดสอบ
- OTP เดิมยังไม่มีบริการส่งอีเมล/SMS และโหมด production ไม่ส่งรหัสกลับให้เบราว์เซอร์ ต้องเชื่อมบริการส่ง OTP ก่อนเปิดรับสมัครหรือรีเซ็ตรหัสผ่านให้ผู้ใช้จริง
- Preview และ Production ควรใช้ฐานข้อมูลแยกกัน
- บนเครื่อง เมื่อไม่มี `DATABASE_URL` จะใช้ SQLite เดิม และยังใช้ `npm run dev` ได้

## ตรวจ Error

- `Set DATABASE_URL...`: ยังไม่ได้เชื่อมฐานข้อมูลหรือตั้ง environment ไม่ครบ
- `First deployment requires...`: ยังไม่ได้ตั้งข้อมูลผู้ดูแลครั้งแรก หรือรหัสผ่านไม่ผ่านเกณฑ์
- `password authentication failed`, `ENOTFOUND`, connection timeout: ตรวจ connection string, เครือข่าย และสถานะ PostgreSQL
- `403`: ตรวจ Origin/โดเมนและ `APP_ORIGIN`
- หาก Function ตอบ `503` ให้ดูข้อความ `Application initialization failed` ใน Vercel Function Logs โดยไม่เผยแพร่ connection string หรือรหัสผ่าน

อ้างอิง: [SQLite บน Vercel](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [PostgreSQL ผ่าน Marketplace](https://vercel.com/docs/postgres), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
