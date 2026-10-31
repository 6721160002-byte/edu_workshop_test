"use strict";

// Public signup does not depend on the mail service. Passwords and profiles
// live in the application's database (Supabase PostgreSQL in production).
module.exports = function passwordRegistration(c) {
  const { db, json, now, uid, hashToken, passwordRecord, validNewPassword } = c;
  const fail = (status, message, field) => {
    throw Object.assign(new Error(message), { status, field });
  };
  return async function route(req, res, url) {
    if (!url.pathname.startsWith("/api/registration/")) return false;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    let transaction = false;
    try {
      if (url.pathname !== "/api/registration/request")
        fail(
          404,
          "การสมัครใช้ชื่อ อีเมล และรหัสผ่าน กรุณากลับไปที่หน้าสมัครสมาชิก",
        );
      const data = await c.bodyJson(req);
      const name = String(data.name || "").trim();
      const email = String(data.email || "")
        .trim()
        .toLowerCase();
      const type = String(data.type || "");
      const code = String(data.code || "").trim();
      const phone = String(data.phone || "").trim();
      const password = String(data.password || "");
      if (!name || name.length > 120)
        fail(400, "กรุณากรอกชื่อ-นามสกุลไม่เกิน 120 ตัว", "name");
      if (!/^[^\s@]+@bsru\.ac\.th$/.test(email) || email.length > 150)
        fail(400, "กรุณาใช้อีเมล @bsru.ac.th", "email");
      if (!["นักศึกษา", "อาจารย์", "เจ้าหน้าที่"].includes(type))
        fail(400, "กรุณาเลือกประเภทผู้ใช้งาน", "type");
      if (!code || code.length > 30)
        fail(400, "กรุณากรอกรหัสประจำตัวไม่เกิน 30 ตัว", "code");
      if (!/^0\d{8,9}$/.test(phone))
        fail(400, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "phone");
      if (!validNewPassword(password))
        fail(
          400,
          "ใช้รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ ไม่มีช่องว่าง",
          "password",
        );
      await db.exec("BEGIN IMMEDIATE");
      transaction = true;
      const ip = hashToken(
        String(
          (process.env.VERCEL && req.headers["x-real-ip"]) ||
            req.socket?.remoteAddress ||
            "unknown",
        ),
      );
      const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
      const count = await db
        .prepare(
          "SELECT count(*) n FROM otp_challenges WHERE purpose='password-signup-limit' AND contact=? AND created_at>?",
        )
        .get(ip, cutoff);
      if (Number(count.n) >= 10)
        fail(429, "สมัครหลายบัญชีเกินไป กรุณารอ 15 นาที");
      if (
        await db
          .prepare(
            "SELECT id FROM users WHERE lower(email)=? OR code=? OR phone=?",
          )
          .get(email, code, phone)
      )
        fail(
          409,
          "อีเมล รหัสประจำตัว หรือเบอร์โทรศัพท์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบหรือตรวจสอบข้อมูล",
        );
      const record = passwordRecord(password),
        userId = uid();
      await db
        .prepare(
          "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'APPROVED','user',?,?,?)",
        )
        .run(
          userId,
          name,
          type,
          code,
          email,
          phone,
          "",
          "",
          record.salt,
          record.hash,
          now(),
        );
      await c.storeReadablePassword(userId, password);
      await db
        .prepare(
          "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,'password-signup-limit','email',?,'','{}',?,?)",
        )
        .run(uid(), ip, new Date(Date.now() + 15 * 60000).toISOString(), now());
      await c.refreshSnapshot();
      await db.exec("COMMIT");
      transaction = false;
      json(res, 200, { registered: true, email });
    } catch (error) {
      if (transaction) await db.exec("ROLLBACK");
      json(res, error.status || (/unique/i.test(error.message) ? 409 : 500), {
        error: error.status
          ? error.message
          : /unique/i.test(error.message)
            ? "ข้อมูลบัญชีนี้ถูกใช้แล้ว กรุณาตรวจสอบข้อมูล"
            : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่ภายหลัง",
        field: error.field,
      });
    }
    return true;
  };
};
