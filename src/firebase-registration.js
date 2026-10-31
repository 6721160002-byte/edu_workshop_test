"use strict";

module.exports = function firebaseRegistration(c, firebase) {
  const {
    db,
    now,
    uid,
    crypto,
    hashToken,
    readJson,
    isExpired,
    passwordRecord,
    validNewPassword,
    json,
  } = c;
  const fail = (status, message, field, code) => {
    throw Object.assign(new Error(message), { status, field, code });
  };
  const normalize = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const validEmail = (value) =>
    /^[^\s@]+@bsru\.ac\.th$/.test(value) && value.length <= 150;
  async function draftFor(email) {
    return db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='firebase-registration' AND contact=? AND consumed_at IS NULL ORDER BY created_at DESC",
      )
      .get(email);
  }
  function requireAvailable() {
    if (!firebase.available)
      fail(
        503,
        "ยังไม่ได้ตั้งค่าระบบยืนยันอีเมล กรุณาติดต่อผู้ดูแลระบบ",
        undefined,
        "FIREBASE_NOT_CONFIGURED",
      );
  }
  async function limit(req, email, kind) {
    // Commit attempts before any provider calls, including failed sends.
    await db.exec("BEGIN IMMEDIATE");
    try {
      const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
      const purpose = "firebase-rate-" + kind;
      const ip = hashToken(
        String(
          (process.env.VERCEL && req.headers["x-real-ip"]) ||
            req.socket?.remoteAddress ||
            "unknown",
        ),
      );
      const rows = await db
        .prepare(
          "SELECT * FROM otp_challenges WHERE purpose=? AND created_at>? ORDER BY created_at DESC",
        )
        .all(purpose, cutoff);
      const own = rows.filter((row) => row.contact === email);
      if (own[0] && Date.now() - Date.parse(own[0].created_at) < 60000)
        fail(429, "กรุณารอ 60 วินาทีก่อนส่งลิงก์อีกครั้ง");
      if (
        own.length >= 3 ||
        rows.filter((row) => readJson(row.payload_json).ip === ip).length >= 15
      )
        fail(429, "ส่งคำขอหลายครั้งเกินไป กรุณารอ 15 นาที");
      await db
        .prepare(
          "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          uid(),
          purpose,
          "email",
          email,
          "",
          JSON.stringify({ ip }),
          new Date(Date.now() + 15 * 60000).toISOString(),
          now(),
        );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
  function assertIdentity(account, email, firebaseUid) {
    if (account.email !== email || (firebaseUid && account.uid !== firebaseUid))
      fail(401, "ข้อมูลบัญชีไม่ตรงกัน กรุณาติดต่อผู้ดูแลระบบ");
  }
  async function authenticate(user, identity, password) {
    const binding =
      user &&
      (await db
        .prepare("SELECT * FROM firebase_identities WHERE user_id=?")
        .get(user.id));
    const draft = !user && (await draftFor(identity));
    if (!binding && !draft) return null; // Existing local accounts retain their original login.
    requireAvailable();
    const account = await firebase.signIn(user?.email || identity, password);
    const payload = draft && readJson(draft.payload_json);
    assertIdentity(
      account,
      user?.email.toLowerCase() || identity,
      binding?.firebase_uid || payload?.firebaseUid,
    );
    if (!account.verified)
      fail(
        403,
        "กรุณาคลิกลิงก์ยืนยันในอีเมลก่อนเข้าสู่ระบบ หากไม่พบอีเมลให้ขอส่งลิงก์อีกครั้ง",
        undefined,
        "FIREBASE_EMAIL_UNVERIFIED",
      );
    if (binding) return user;
    if (isExpired(draft.expires_at))
      fail(
        410,
        "ข้อมูลสมัครหมดอายุ กรุณากรอกข้อมูลสมัครอีกครั้งด้วยอีเมลและรหัสผ่านเดิม",
      );
    await db.exec("BEGIN IMMEDIATE");
    try {
      // Re-read under the write lock so simultaneous verified logins create one account.
      const existing = await db
        .prepare(
          "SELECT u.* FROM firebase_identities f JOIN users u ON u.id=f.user_id WHERE f.firebase_uid=?",
        )
        .get(account.uid);
      if (existing) {
        if (existing.email.toLowerCase() !== identity)
          fail(409, "ข้อมูลบัญชีไม่ตรงกัน");
        await db.exec("COMMIT");
        return existing;
      }
      const fresh = await draftFor(identity);
      if (
        !fresh ||
        isExpired(fresh.expires_at) ||
        readJson(fresh.payload_json).firebaseUid !== account.uid
      )
        fail(410, "ข้อมูลสมัครหมดอายุ กรุณาสมัครใหม่");
      const d = readJson(fresh.payload_json).draft;
      // No usable local password exists for Firebase accounts. Their passwords
      // and password resets are managed exclusively by Firebase.
      const secret = passwordRecord(crypto.randomBytes(48).toString("hex"));
      const userId = uid();
      await db
        .prepare(
          "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'APPROVED','user',?,?,?)",
        )
        .run(
          userId,
          d.name,
          d.type,
          d.code,
          identity,
          d.phone,
          "",
          "",
          secret.salt,
          secret.hash,
          now(),
        );
      await db
        .prepare(
          "INSERT INTO firebase_identities(firebase_uid,user_id) VALUES(?,?)",
        )
        .run(account.uid, userId);
      await db
        .prepare(
          "UPDATE otp_challenges SET consumed_at=? WHERE purpose='firebase-registration' AND contact=? AND consumed_at IS NULL",
        )
        .run(now(), identity);
      await c.refreshSnapshot();
      const result = await db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(userId);
      await db.exec("COMMIT");
      return result;
    } catch (error) {
      await db.exec("ROLLBACK");
      if (/unique/i.test(error.message))
        fail(
          409,
          "อีเมล รหัสประจำตัว หรือเบอร์โทรศัพท์ถูกใช้แล้ว กรุณาตรวจสอบข้อมูล",
        );
      throw error;
    }
  }
  async function route(req, res, url) {
    const path = url.pathname;
    if (
      !path.startsWith("/api/registration/") &&
      !path.startsWith("/api/firebase/")
    )
      return false;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    try {
      requireAvailable();
      const data = await c.bodyJson(req);
      const email = normalize(data.email);
      if (
        ![
          "/api/registration/request",
          "/api/firebase/resend",
          "/api/firebase/password-reset",
        ].includes(path)
      )
        fail(
          404,
          "ระบบนี้ใช้ลิงก์ยืนยันอีเมล กรุณาเริ่มสมัครหรือเข้าสู่ระบบใหม่",
        );
      if (!validEmail(email)) fail(400, "กรุณาใช้อีเมล @bsru.ac.th", "email");
      if (path === "/api/firebase/password-reset") {
        await limit(req, email, "reset");
        const binding = await db
          .prepare(
            "SELECT f.user_id FROM firebase_identities f JOIN users u ON u.id=f.user_id WHERE lower(u.email)=?",
          )
          .get(email);
        if (binding || (await draftFor(email)))
          await firebase.sendPasswordReset(email);
        json(res, 200, {
          message:
            "หากอีเมลนี้มีบัญชีที่รองรับ ระบบจะส่งลิงก์ตั้งรหัสผ่านใหม่ กรุณาตรวจ Inbox และ Spam",
        });
        return true;
      }
      const password = String(data.password || "");
      if (!password || password.length > 128)
        fail(400, "กรุณากรอกรหัสผ่านไม่เกิน 128 ตัว", "password");
      if (path === "/api/firebase/resend") {
        await limit(req, email, "verification");
        const draft = await draftFor(email);
        if (!draft || isExpired(draft.expires_at))
          fail(410, "ข้อมูลสมัครหมดอายุ กรุณากรอกข้อมูลสมัครอีกครั้ง");
        const account = await firebase.signIn(email, password);
        assertIdentity(
          account,
          email,
          readJson(draft.payload_json).firebaseUid,
        );
        if (account.verified) {
          json(res, 200, { verified: true });
          return true;
        }
        await firebase.sendVerification(account.idToken);
        json(res, 200, { email, sent: true });
        return true;
      }
      if (!validNewPassword(password))
        fail(
          400,
          "ใช้รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์ ไม่มีช่องว่าง",
          "password",
        );
      const name = String(data.name || "").trim(),
        type = String(data.type || ""),
        code = String(data.code || "").trim(),
        phone = String(data.phone || "").trim();
      if (!name || name.length > 120)
        fail(400, "กรุณากรอกชื่อ-นามสกุลไม่เกิน 120 ตัว", "name");
      if (!["นักศึกษา", "อาจารย์", "เจ้าหน้าที่"].includes(type))
        fail(400, "กรุณาเลือกประเภทผู้ใช้งาน", "type");
      if (!code || code.length > 30)
        fail(400, "กรุณากรอกรหัสประจำตัวไม่เกิน 30 ตัว", "code");
      if (!/^0\d{8,9}$/.test(phone))
        fail(400, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "phone");
      if (
        await db
          .prepare(
            "SELECT id FROM users WHERE lower(email)=? OR code=? OR phone=?",
          )
          .get(email, code, phone)
      )
        fail(
          409,
          "อีเมล รหัสประจำตัว หรือเบอร์โทรศัพท์นี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ",
        );
      await limit(req, email, "verification");
      const account = await firebase.createOrSignIn(email, password);
      assertIdentity(account, email);
      // Save the profile before sending so retries survive provider failure.
      await db.exec("BEGIN IMMEDIATE");
      try {
        await db
          .prepare(
            "UPDATE otp_challenges SET consumed_at=? WHERE purpose='firebase-registration' AND contact=? AND consumed_at IS NULL",
          )
          .run(now(), email);
        await db
          .prepare(
            "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            uid(),
            "firebase-registration",
            "email",
            email,
            hashToken(account.uid),
            JSON.stringify({
              firebaseUid: account.uid,
              draft: { name, type, code, phone },
            }),
            new Date(Date.now() + 24 * 60 * 60000).toISOString(),
            now(),
          );
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
      if (!account.verified) await firebase.sendVerification(account.idToken);
      json(res, 200, {
        provider: "firebase",
        email,
        sent: !account.verified,
        verified: account.verified,
      });
    } catch (error) {
      json(res, error.status || 500, {
        error: error.status
          ? error.message
          : "ไม่สามารถดำเนินการสมัครได้ กรุณาลองใหม่ภายหลัง",
        field: error.field,
        code: error.code,
      });
    }
    return true;
  }
  return { route, authenticate };
};
