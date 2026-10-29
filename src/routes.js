"use strict";

module.exports = function createRoutes({
  db,
  readJson,
  isExpired,
  path,
  ROOT,
  DB_FILE,
  now,
  json,
  sessionFor,
  requireSession,
  bodyJson,
  crypto,
  uid,
  hashToken,
  publicUser,
  passwordRecord,
  verifyPassword,
  validNewPassword,
  SESSION_TTL_MS,
  workshopRows,
  viewFromSnapshot,
  mergeSnapshot,
  writeSnapshot,
  refreshSnapshot,
}) {
  async function routeApi(req, res, url) {
    const cookieSecure =
      process.env.VERCEL || process.env.NODE_ENV === "production"
        ? "; Secure"
        : "";
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        app: "BSRU Workshop",
        database: db.kind === "postgres" ? "PostgreSQL" : "SQLite",
        ...(db.kind === "postgres"
          ? {}
          : {
              databaseFile: path.relative(ROOT, DB_FILE).replaceAll("\\", "/"),
            }),
        time: now(),
        counts: {
          users: (await db.prepare("SELECT count(*) n FROM users").get()).n,
          workshops: (
            await db.prepare("SELECT count(*) n FROM workshops").get()
          ).n,
          registrations: (
            await db.prepare("SELECT count(*) n FROM registrations").get()
          ).n,
        },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/session") {
      const session = await sessionFor(req);
      return json(res, 200, {
        user: session?.user || null,
        csrf: session?.csrf || null,
        otpAvailable: !(
          process.env.VERCEL || process.env.NODE_ENV === "production"
        ),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/otp/request")
      return bodyJson(req).then(async (data) => {
        if (process.env.VERCEL || process.env.NODE_ENV === "production")
          return json(res, 503, {
            error: "ระบบยังไม่ได้ตั้งค่าบริการส่ง OTP กรุณาติดต่อเจ้าหน้าที่",
            code: "OTP_DELIVERY_NOT_CONFIGURED",
          });
        const purpose = data.purpose,
          channel = data.channel,
          contact = String(data.contact || "").trim(),
          portal = data.portal;
        if (
          !["register", "reset"].includes(purpose) ||
          !["email", "phone"].includes(channel) ||
          !contact ||
          !["user", "staff"].includes(portal)
        )
          return json(res, 400, { error: "ข้อมูลขอ OTP ไม่ถูกต้อง" });
        const recent = (
          await db
            .prepare(
              "SELECT count(*) n FROM otp_challenges WHERE contact=? AND created_at>?",
            )
            .get(contact, new Date(Date.now() - 15 * 60 * 1000).toISOString())
        ).n;
        if (recent >= 3)
          return json(res, 429, {
            error: "ขอ OTP เกินจำนวนที่กำหนด กรุณารอ 15 นาที",
          });
        let payload = {},
          user = null;
        const previous = data.replaceChallengeId
          ? await db
              .prepare("SELECT * FROM otp_challenges WHERE id=?")
              .get(String(data.replaceChallengeId))
          : null;
        if (purpose === "register") {
          const d = data.draft || {},
            password = String(data.password || "");
          if (
            previous &&
            previous.purpose === "register" &&
            previous.channel === channel &&
            previous.contact.toLowerCase() === contact.toLowerCase()
          )
            payload = readJson(previous.payload_json);
          else {
            if (
              portal !== "user" ||
              !/^\S+@bsru\.ac\.th$/i.test(String(d.email || ""))
            )
              return json(res, 400, {
                error: "สมัครได้เฉพาะอีเมล @bsru.ac.th",
              });
            if (!validNewPassword(password))
              return json(res, 400, {
                error:
                  "รหัสผ่านต้องยาวอย่างน้อย 12 ตัว มีตัวพิมพ์ใหญ่ ตัวพิมพ์เล็ก ตัวเลข และสัญลักษณ์",
              });
            if (
              !d.name ||
              !d.type ||
              !d.code ||
              !d.phone ||
              !d.faculty ||
              !d.major ||
              !["นักศึกษา", "อาจารย์"].includes(d.type) ||
              !["email", "phone"].includes(channel) ||
              String(d[channel] || "").toLowerCase() !== contact.toLowerCase()
            )
              return json(res, 400, {
                error: "ข้อมูลสมัครหรือช่องทางยืนยันไม่ครบ",
              });
            const duplicate = await db
              .prepare(
                "SELECT id FROM users WHERE lower(email)=lower(?) OR phone=? OR code=?",
              )
              .get(d.email, d.phone, d.code);
            if (duplicate)
              return json(res, 409, {
                error: "อีเมล เบอร์โทรศัพท์ หรือรหัสประจำตัวนี้ลงทะเบียนแล้ว",
              });
            const passwordData = passwordRecord(password);
            payload = {
              draft: {
                name: String(d.name).slice(0, 160),
                type: d.type,
                code: String(d.code).slice(0, 40),
                email: String(d.email).toLowerCase(),
                phone: String(d.phone).slice(0, 30),
                faculty: String(d.faculty).slice(0, 180),
                major: String(d.major).slice(0, 180),
              },
              password: passwordData,
            };
          }
        } else {
          user = await db
            .prepare(
              `SELECT * FROM users WHERE role=? AND ${channel === "email" ? "lower(email)=lower(?)" : "phone=?"}`,
            )
            .get(portal, contact);
          if (!user)
            return json(res, 404, { error: "ไม่พบบัญชีที่ผูกกับช่องทางนี้" });
          payload = { userId: user.id };
        }
        await db
          .prepare(
            "UPDATE otp_challenges SET consumed_at=? WHERE contact=? AND consumed_at IS NULL",
          )
          .run(now(), contact);
        const id = uid(),
          code = String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
          expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await db
          .prepare(
            "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
          )
          .run(
            id,
            purpose,
            channel,
            contact,
            hashToken(`${id}:${code}`),
            JSON.stringify(payload),
            expires,
            now(),
          );
        return json(res, 200, {
          challengeId: id,
          expiresAt: expires,
          code: process.env.NODE_ENV === "production" ? undefined : code,
          delivery: "demo-only",
        });
      });
    if (req.method === "POST" && url.pathname === "/api/otp/verify")
      return bodyJson(req).then(async (data) => {
        const id = String(data.challengeId || ""),
          code = String(data.code || "");
        const challenge = await db
          .prepare("SELECT * FROM otp_challenges WHERE id=?")
          .get(id);
        if (
          !challenge ||
          challenge.consumed_at ||
          isExpired(challenge.expires_at)
        )
          return json(res, 410, {
            error: "OTP หมดอายุหรือใช้ไปแล้ว กรุณาขอใหม่",
          });
        if (challenge.attempts >= 5)
          return json(res, 429, {
            error: "กรอกผิดครบ 5 ครั้ง OTP ถูกยกเลิก กรุณาขอใหม่",
          });
        if (
          !/^\d{6}$/.test(code) ||
          !crypto.timingSafeEqual(
            Buffer.from(hashToken(`${id}:${code}`)),
            Buffer.from(challenge.code_hash),
          )
        ) {
          const updated = await db
            .prepare(
              "UPDATE otp_challenges SET attempts=attempts+1,consumed_at=CASE WHEN attempts+1>=5 THEN ? ELSE consumed_at END WHERE id=? AND consumed_at IS NULL RETURNING attempts",
            )
            .get(now(), id);
          if (!updated)
            return json(res, 410, {
              error: "OTP หมดอายุหรือใช้ไปแล้ว กรุณาขอใหม่",
            });
          const attempts = updated.attempts;
          return json(res, 400, {
            error:
              attempts >= 5
                ? "กรอกผิดครบ 5 ครั้ง OTP ถูกยกเลิก กรุณาขอใหม่"
                : `OTP ไม่ถูกต้อง เหลือโอกาส ${5 - attempts} ครั้ง`,
          });
        }
        const payload = readJson(challenge.payload_json);
        await db.exec("BEGIN IMMEDIATE");
        try {
          const current = await db
            .prepare("SELECT * FROM otp_challenges WHERE id=?")
            .get(id);
          if (
            !current ||
            current.consumed_at ||
            current.attempts >= 5 ||
            isExpired(current.expires_at)
          )
            throw Object.assign(
              new Error("OTP หมดอายุหรือใช้ไปแล้ว กรุณาขอใหม่"),
              { status: 410 },
            );
          await db
            .prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?")
            .run(now(), id);
          if (challenge.purpose === "register") {
            const d = payload.draft,
              p = payload.password,
              userId = uid();
            const add = db.prepare(
              `INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'WAITING','user',?,?,?)`,
            );
            await add.run(
              userId,
              d.name,
              d.type,
              d.code,
              d.email,
              d.phone,
              d.faculty,
              d.major,
              p.salt,
              p.hash,
              now(),
            );
            const state = readJson(
              (
                await db
                  .prepare("SELECT data_json FROM app_state WHERE id=1")
                  .get()
              ).data_json,
            );
            state.users.push(
              publicUser(
                await db.prepare("SELECT * FROM users WHERE id=?").get(userId),
              ),
            );
            state.revision += 1;
            await db
              .prepare(
                "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
              )
              .run(state.revision, JSON.stringify(state), now());
            await db.exec("COMMIT");
            return json(res, 200, {
              purpose: "register",
              user: publicUser(
                await db.prepare("SELECT * FROM users WHERE id=?").get(userId),
              ),
            });
          }
          const grant = crypto.randomBytes(32).toString("base64url"),
            expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          await db
            .prepare(
              "INSERT INTO password_reset_grants(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
            )
            .run(hashToken(grant), payload.userId, expires, now());
          await db.exec("COMMIT");
          return json(res, 200, {
            purpose: "reset",
            grant,
            expiresAt: expires,
          });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, e.status || 400, {
            error: e.message.includes("UNIQUE")
              ? "ข้อมูลบัญชีนี้ถูกใช้ไปแล้ว กรุณาเริ่มสมัครใหม่"
              : e.message,
          });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/password/reset")
      return bodyJson(req).then(async (data) => {
        const grant = String(data.grant || ""),
          password = String(data.password || "");
        if (
          !validNewPassword(password) ||
          password !== String(data.confirmation || "")
        )
          return json(res, 400, {
            error: "รหัสผ่านใหม่ไม่ผ่านเกณฑ์หรือยืนยันไม่ตรงกัน",
          });
        const row = await db
          .prepare("SELECT * FROM password_reset_grants WHERE token_hash=?")
          .get(hashToken(grant));
        if (!row || row.consumed_at || isExpired(row.expires_at))
          return json(res, 410, {
            error: "สิทธิ์ตั้งรหัสผ่านหมดอายุหรือใช้ไปแล้ว กรุณาขอ OTP ใหม่",
          });
        const p = passwordRecord(password);
        await db.exec("BEGIN IMMEDIATE");
        try {
          const grantUser = await db
            .prepare(
              "UPDATE password_reset_grants SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL AND expires_at>? RETURNING user_id",
            )
            .get(now(), hashToken(grant), now());
          if (!grantUser) {
            await db.exec("ROLLBACK");
            return json(res, 410, {
              error: "สิทธิ์ตั้งรหัสผ่านหมดอายุหรือใช้ไปแล้ว กรุณาขอ OTP ใหม่",
            });
          }
          await db
            .prepare(
              "UPDATE users SET password_salt=?,password_hash=? WHERE id=?",
            )
            .run(p.salt, p.hash, row.user_id);
          await db
            .prepare("DELETE FROM sessions WHERE user_id=?")
            .run(row.user_id);
          await db.exec("COMMIT");
          return json(res, 200, { ok: true });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, 400, { error: "บันทึกรหัสผ่านไม่สำเร็จ" });
        }
      });
    if (req.method === "GET" && url.pathname === "/api/store") {
      const session = await requireSession(req, res);
      if (!session) return;
      const snapshot = readJson(
        (await db.prepare("SELECT data_json FROM app_state WHERE id=1").get())
          .data_json,
      );
      return json(res, 200, {
        store: viewFromSnapshot(snapshot, session.user),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/store")
      return bodyJson(req).then(async (data) => {
        const session = await requireSession(req, res);
        if (!session) return;
        await db.exec("BEGIN IMMEDIATE");
        try {
          const merged = await mergeSnapshot(session.user, data.store);
          merged.revision =
            (
              await db
                .prepare("SELECT revision FROM app_state WHERE id=1")
                .get()
            ).revision + 1;
          await writeSnapshot(merged);
          await db
            .prepare(
              "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
            )
            .run(merged.revision, JSON.stringify(merged), now());
          await db.exec("COMMIT");
          return json(res, 200, {
            revision: merged.revision,
            store: viewFromSnapshot(merged, session.user),
          });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/login")
      return bodyJson(req).then(async (data) => {
        const identity = String(data.identity || "")
            .trim()
            .toLowerCase(),
          password = String(data.password || ""),
          portal = data.portal;
        if (!identity || identity.length > 160 || password.length > 128)
          return json(res, 400, { error: "กรุณาตรวจสอบข้อมูลเข้าสู่ระบบ" });
        const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        await db
          .prepare("DELETE FROM login_attempts WHERE created_at < ?")
          .run(cutoff);
        const attempts = await db
          .prepare(
            "SELECT count(*) n FROM login_attempts WHERE identity=? AND created_at>=?",
          )
          .get(identity, cutoff);
        if (Number(attempts.n) >= 8)
          return json(res, 429, {
            error: "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที",
            code: "LOGIN_RATE_LIMITED",
          });
        await db
          .prepare(
            "INSERT INTO login_attempts(id,identity,created_at) VALUES(?,?,?)",
          )
          .run(uid(), identity, now());
        const user = await db
          .prepare("SELECT * FROM users WHERE lower(email)=? OR phone=?")
          .get(identity, identity);
        if (
          !user ||
          !verifyPassword(password, user.password_salt, user.password_hash)
        )
          return json(res, 401, {
            error: "อีเมล/เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง",
          });
        if (portal && user.role !== portal)
          return json(res, 403, {
            error: "บัญชีนี้ไม่มีสิทธิ์ใน Portal ที่เลือก",
          });
        if (user.status !== "APPROVED")
          return json(res, 403, {
            error:
              user.status === "REJECTED"
                ? "บัญชีนี้ไม่ได้รับอนุมัติ กรุณาติดต่อเจ้าหน้าที่เพื่อตรวจสอบข้อมูล"
                : "บัญชีนี้รอเจ้าหน้าที่อนุมัติ",
          });
        await db
          .prepare("DELETE FROM login_attempts WHERE identity=?")
          .run(identity);
        const token = crypto.randomBytes(32).toString("base64url"),
          csrf = crypto.randomBytes(24).toString("base64url"),
          expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await db
          .prepare(
            "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)",
          )
          .run(hashToken(token), user.id, csrf, expires, now());
        return json(
          res,
          200,
          { user: publicUser(user), csrf },
          {
            "Set-Cookie": `bsru_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${cookieSecure}`,
          },
        );
      });
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const session = await requireSession(req, res);
      if (!session) return;
      await db
        .prepare("DELETE FROM sessions WHERE token_hash=?")
        .run(session.row.token_hash);
      return json(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie": `bsru_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecure}`,
        },
      );
    }
    if (req.method === "GET" && url.pathname === "/api/workshops") {
      const session = await requireSession(req, res);
      if (!session) return;
      return json(res, 200, { workshops: await workshopRows() });
    }
    if (req.method === "POST" && url.pathname === "/api/enroll")
      return bodyJson(req).then(async (data) => {
        const session = await requireSession(req, res, "user");
        if (!session) return;
        const workshopId = String(data.workshopId || "");
        await db.exec("BEGIN IMMEDIATE");
        try {
          const w = await db
            .prepare("SELECT * FROM workshops WHERE id=?")
            .get(workshopId);
          if (!w || w.closed || Date.parse(w.start_at) <= Date.now())
            throw Object.assign(new Error("กิจกรรมปิดรับลงทะเบียนแล้ว"), {
              status: 409,
            });
          const conflict = await db
            .prepare(
              "SELECT w.title FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=? AND r.status<>'CANCELLED' AND w.id<>? AND w.start_at<? AND w.end_at>? LIMIT 1",
            )
            .get(session.user.id, workshopId, w.end_at, w.start_at);
          if (conflict)
            throw Object.assign(
              new Error(
                `เวลาตรงกับกิจกรรม “${conflict.title}” ที่ลงทะเบียนไว้แล้ว`,
              ),
              { status: 409 },
            );
          const prior = await db
            .prepare(
              "SELECT * FROM registrations WHERE user_id=? AND workshop_id=?",
            )
            .get(session.user.id, workshopId);
          if (prior && prior.status !== "CANCELLED")
            throw Object.assign(new Error("คุณลงทะเบียนกิจกรรมนี้แล้ว"), {
              status: 409,
            });
          const count = (
            await db
              .prepare(
                `SELECT count(*) n FROM registrations WHERE workshop_id=? AND status IN ('PENDING','ATTENDED','ABSENT')`,
              )
              .get(workshopId)
          ).n;
          if (count >= w.capacity)
            throw Object.assign(new Error("ที่นั่งเต็มแล้ว"), { status: 409 });
          const t = now();
          if (prior)
            await db
              .prepare(
                `UPDATE registrations SET status='PENDING',updated_at=? WHERE id=?`,
              )
              .run(t, prior.id);
          else
            await db
              .prepare(
                `INSERT INTO registrations(id,user_id,workshop_id,status,created_at,updated_at) VALUES(?,?,?,'PENDING',?,?)`,
              )
              .run(uid(), session.user.id, workshopId, t, t);
          await refreshSnapshot();
          await db.exec("COMMIT");
          return json(res, 200, { ok: true, workshops: await workshopRows() });
        } catch (e) {
          await db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/attendance")
      return bodyJson(req).then(async (data) => {
        const session = await requireSession(req, res, "staff");
        if (!session) return;
        const status = String(data.status || "");
        if (!["ATTENDED", "ABSENT"].includes(status))
          return json(res, 400, { error: "สถานะเช็กชื่อไม่ถูกต้อง" });
        const row = await db
          .prepare(
            "SELECT r.*,w.title,w.hours FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.id=?",
          )
          .get(String(data.registrationId || ""));
        if (!row) return json(res, 404, { error: "ไม่พบรายการลงทะเบียน" });
        if (row.status !== status) {
          await db.exec("BEGIN IMMEDIATE");
          try {
            const current = await db
              .prepare("SELECT status FROM registrations WHERE id=?")
              .get(row.id);
            if (current.status === "CANCELLED")
              throw Object.assign(
                new Error("ไม่สามารถเช็กชื่อรายการที่ยกเลิกแล้ว"),
                { status: 409 },
              );
            if (current.status === status) {
              await db.exec("COMMIT");
              return json(res, 200, { ok: true });
            }
            await db
              .prepare(
                "UPDATE registrations SET status=?,updated_at=? WHERE id=?",
              )
              .run(status, now(), row.id);
            await db
              .prepare(
                "INSERT INTO notifications(id,user_id,title,message,related_type,related_id,created_at) VALUES(?,?,?,?,?,?,?)",
              )
              .run(
                uid(),
                row.user_id,
                "อัปเดตผลการเข้าร่วม",
                `กิจกรรม “${row.title}” เปลี่ยนเป็น ${status === "ATTENDED" ? "เข้าร่วมงานแล้ว" : "ไม่ได้เข้าร่วม"}`,
                "registration",
                row.id,
                now(),
              );
            await refreshSnapshot();
            await db.exec("COMMIT");
          } catch (e) {
            await db.exec("ROLLBACK");
            return json(res, e.status || 400, { error: e.message });
          }
        }
        return json(res, 200, { ok: true });
      });
    if (req.method === "GET" && url.pathname === "/api/registrations") {
      const session = await requireSession(req, res);
      if (!session) return;
      const all = session.user.role === "staff";
      const rows = all
        ? await db
            .prepare(
              `SELECT r.*,u.name AS user_name,u.code,w.title AS workshop_title,w.hours FROM registrations r JOIN users u ON u.id=r.user_id JOIN workshops w ON w.id=r.workshop_id ORDER BY r.created_at DESC`,
            )
            .all()
        : await db
            .prepare(
              `SELECT r.*,w.title AS workshop_title,w.hours FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.user_id=? ORDER BY r.created_at DESC`,
            )
            .all(session.user.id);
      return json(res, 200, { registrations: rows });
    }
    json(res, 404, { error: "ไม่พบ API endpoint" });
  }

  return { routeApi };
};
