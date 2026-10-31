"use strict";

// Pending registrations live separately from users. No session or permissions
// exist until a server-verified email code is consumed in the same transaction.
module.exports = function registration(c, delivery) {
  const {
    db,
    json,
    now,
    uid,
    crypto,
    hashToken,
    readJson,
    isExpired,
    passwordRecord,
    verifyPassword,
    validNewPassword,
    publicUser,
    SESSION_TTL_MS,
  } = c;
  const fail = (status, error, field) => {
    throw Object.assign(new Error(error), { status, field });
  };
  const email = (value) =>
    String(value || "")
      .trim()
      .toLowerCase();
  const mask = (value) => {
    const [local, domain] = value.split("@");
    return `${local.slice(0, 2)}***@${domain}`;
  };
  const validEmail = (value) =>
    /^[^\s@]+@bsru\.ac\.th$/.test(value) && value.length <= 150;
  const until = (ms) => new Date(Date.now() + ms).toISOString();
  async function flowFor(data) {
    const row = await db
      .prepare("SELECT * FROM otp_challenges WHERE id=?")
      .get(String(data.flowId || ""));
    if (
      !row ||
      row.purpose !== "email-registration" ||
      row.consumed_at ||
      isExpired(row.expires_at) ||
      !crypto.timingSafeEqual(
        Buffer.from(row.code_hash),
        Buffer.from(hashToken(String(data.token || ""))),
      )
    )
      fail(410, "การสมัครหมดอายุ กรุณากลับไปสมัครใหม่");
    return row;
  }
  async function latest(flowId) {
    const rows = await db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='email-registration-code' ORDER BY created_at DESC",
      )
      .all();
    return rows.find((row) => readJson(row.payload_json).flowId === flowId);
  }
  async function state(flow, code) {
    return {
      flowId: flow.id,
      maskedEmail: mask(flow.contact),
      expiresAt: code?.expires_at || null,
      resendAt: code
        ? new Date(Date.parse(code.created_at) + 60000).toISOString()
        : now(),
    };
  }
  async function issue(flow, contact, req) {
    const previous = await latest(flow.id);
    if (previous && Date.now() - Date.parse(previous.created_at) < 60000)
      fail(429, "กรุณารอ 60 วินาทีก่อนส่งรหัสอีกครั้ง");
    const cutoff = new Date(Date.now() - 15 * 60000).toISOString();
    const rows = await db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='email-registration-code' AND created_at>?",
      )
      .all(cutoff);
    const ip = hashToken(
      String(
        (process.env.VERCEL && req.headers["x-real-ip"]) ||
          req.socket?.remoteAddress ||
          "unknown",
      ),
    );
    if (
      rows.filter(
        (r) =>
          r.contact === contact || readJson(r.payload_json).flowId === flow.id,
      ).length >= 3 ||
      rows.filter((r) => readJson(r.payload_json).ip === ip).length >= 15
    )
      fail(429, "ขอรหัสหลายครั้งเกินไป กรุณารอ 15 นาที");
    const duplicate = await db
      .prepare("SELECT id FROM users WHERE lower(email)=?")
      .get(contact);
    if (duplicate) fail(409, "อีเมลนี้มีบัญชีแล้ว กรุณาเข้าสู่ระบบ", "email");
    const id = uid(),
      code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    // Revoke every old code for this flow, including the previous email.
    for (const row of await db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='email-registration-code' AND consumed_at IS NULL",
      )
      .all())
      if (
        readJson(row.payload_json).flowId === flow.id ||
        row.contact === contact
      )
        await db
          .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
          .run(now(), row.id);
    await db
      .prepare("UPDATE otp_challenges SET contact=? WHERE id=?")
      .run(contact, flow.id);
    const row = { id, created_at: now(), expires_at: until(5 * 60000) };
    await db
      .prepare(
        "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        "email-registration-code",
        "email",
        contact,
        hashToken(`${id}:${code}`),
        JSON.stringify({ flowId: flow.id, ip }),
        row.expires_at,
        row.created_at,
      );
    try {
      await delivery.send(contact, code);
    } catch {
      await db
        .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
        .run(now(), id);
      fail(502, "ส่งอีเมลไม่สำเร็จ กรุณาตรวจอีเมลแล้วลองใหม่ภายหลัง");
    }
    return state({ ...flow, contact }, row);
  }
  return async function route(req, res, url) {
    if (!url.pathname.startsWith("/api/registration/")) return false;
    if (req.method !== "POST") {
      json(res, 405, { error: "Method not allowed" });
      return true;
    }
    const data = await c.bodyJson(req);
    if (!delivery.available) {
      json(res, 503, {
        error: "ยังไม่ได้ตั้งค่าบริการส่งอีเมล กรุณาติดต่อผู้ดูแลระบบ",
        code: "EMAIL_NOT_CONFIGURED",
      });
      return true;
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
      let flow;
      if (url.pathname === "/api/registration/request") {
        const contact = email(data.email),
          password = String(data.password || "");
        if (!validEmail(contact))
          fail(400, "กรุณาใช้อีเมล @bsru.ac.th", "email");
        if (!validNewPassword(password))
          fail(
            400,
            "ใช้รหัสผ่านอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์",
            "password",
          );
        const drafts = await db
          .prepare(
            "SELECT * FROM otp_challenges WHERE purpose='email-registration' AND contact=? AND consumed_at IS NULL ORDER BY created_at DESC",
          )
          .all(contact);
        flow = drafts.find((r) => !isExpired(r.expires_at));
        const token = crypto.randomBytes(32).toString("base64url");
        if (flow) {
          const stored = readJson(flow.payload_json).password;
          if (!verifyPassword(password, stored.salt, stored.hash))
            fail(
              409,
              "มีการสมัครค้างอยู่ กรุณาใช้รหัสผ่านที่ตั้งไว้เพื่อยืนยันต่อ",
              "password",
            );
          await db
            .prepare("UPDATE otp_challenges SET code_hash=? WHERE id=?")
            .run(hashToken(token), flow.id);
        } else {
          const name = String(data.name || "").trim(),
            type = String(data.type || "");
          if (!name || name.length > 120)
            fail(400, "กรุณากรอกชื่อ-นามสกุลไม่เกิน 120 ตัว", "name");
          if (!["นักศึกษา", "อาจารย์", "เจ้าหน้าที่"].includes(type))
            fail(400, "กรุณาเลือกประเภทผู้ใช้งาน", "type");
          // Institutional identifiers remain required by the existing account schema.
          const code = String(data.code || "").trim(),
            phone = String(data.phone || "").trim();
          if (!code || code.length > 30)
            fail(400, "กรุณากรอกรหัสประจำตัว", "code");
          if (!/^0\d{8,9}$/.test(phone))
            fail(400, "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง", "phone");
          if (
            await db
              .prepare("SELECT id FROM users WHERE code=? OR phone=?")
              .get(code, phone)
          )
            fail(409, "รหัสประจำตัวหรือเบอร์โทรศัพท์นี้มีบัญชีแล้ว", "code");
          flow = { id: uid(), contact, expires_at: until(24 * 60 * 60000) };
          await db
            .prepare(
              "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
            )
            .run(
              flow.id,
              "email-registration",
              "email",
              contact,
              hashToken(token),
              JSON.stringify({
                draft: { name, type, code, phone, faculty: "", major: "" },
                password: passwordRecord(password),
              }),
              flow.expires_at,
              now(),
            );
        }
        const result = await issue(flow, contact, req);
        await db.exec("COMMIT");
        json(res, 200, { ...result, token });
        return true;
      }
      flow = await flowFor(data);
      if (url.pathname === "/api/registration/status") {
        const result = await state(flow, await latest(flow.id));
        await db.exec("COMMIT");
        json(res, 200, result);
        return true;
      }
      if (
        ["/api/registration/resend", "/api/registration/email"].includes(
          url.pathname,
        )
      ) {
        const contact = url.pathname.endsWith("/email")
          ? email(data.email)
          : flow.contact;
        if (!validEmail(contact))
          fail(400, "กรุณาใช้อีเมล @bsru.ac.th", "email");
        const result = await issue(flow, contact, req);
        await db.exec("COMMIT");
        json(res, 200, result);
        return true;
      }
      if (url.pathname !== "/api/registration/verify") fail(404, "ไม่พบรายการ");
      const row = await latest(flow.id);
      if (!row || row.consumed_at || isExpired(row.expires_at))
        fail(410, "รหัสหมดอายุหรือใช้ไม่ได้แล้ว กดส่งรหัสอีกครั้ง", "otp");
      if (row.attempts >= 5)
        fail(429, "กรอกรหัสผิดครบ 5 ครั้ง กรุณาส่งรหัสอีกครั้ง", "otp");
      if (
        !/^\d{6}$/.test(String(data.code || "")) ||
        !crypto.timingSafeEqual(
          Buffer.from(row.code_hash),
          Buffer.from(hashToken(`${row.id}:${data.code}`)),
        )
      ) {
        await db
          .prepare("UPDATE otp_challenges SET attempts=attempts+1 WHERE id=?")
          .run(row.id);
        await db.exec("COMMIT");
        json(res, 400, {
          error: `รหัสไม่ถูกต้อง เหลือ ${Math.max(0, 4 - row.attempts)} ครั้ง หากจำไม่ได้ให้ส่งรหัสอีกครั้ง`,
          field: "otp",
        });
        return true;
      }
      const { draft: d, password: p } = readJson(flow.payload_json),
        userId = uid();
      await db
        .prepare(
          "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'APPROVED','user',?,?,?)",
        )
        .run(
          userId,
          d.name,
          d.type,
          d.code,
          flow.contact,
          d.phone,
          d.faculty,
          d.major,
          p.salt,
          p.hash,
          now(),
        );
      await db
        .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=? OR id=?")
        .run(now(), flow.id, row.id);
      const user = publicUser(
        await db.prepare("SELECT * FROM users WHERE id=?").get(userId),
      );
      const snapshot = readJson(
        (await db.prepare("SELECT data_json FROM app_state WHERE id=1").get())
          .data_json,
      );
      snapshot.users.push(user);
      snapshot.revision++;
      await db
        .prepare(
          "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
        )
        .run(snapshot.revision, JSON.stringify(snapshot), now());
      const token = crypto.randomBytes(32).toString("base64url"),
        csrf = crypto.randomBytes(24).toString("base64url");
      await db
        .prepare(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)",
        )
        .run(hashToken(token), userId, csrf, until(SESSION_TTL_MS), now());
      await db.exec("COMMIT");
      json(
        res,
        200,
        { user, csrf },
        {
          "Set-Cookie": `bsru_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${process.env.VERCEL || process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
        },
      );
      return true;
    } catch (e) {
      // Delivery errors still retain rate-limit rows and revoke old codes.
      let registration;
      if (e.status === 502 && data.flowId) {
        const flow = await flowFor(data);
        registration = await state(flow, await latest(flow.id));
      }
      await db.exec(e.status === 502 ? "COMMIT" : "ROLLBACK");
      json(res, e.status || 400, {
        error: /unique/i.test(e.message)
          ? "ข้อมูลบัญชีนี้ถูกใช้แล้ว กรุณาเข้าสู่ระบบหรือแก้ไขข้อมูล"
          : e.message,
        field: e.field,
        registration,
      });
      return true;
    }
  };
};
