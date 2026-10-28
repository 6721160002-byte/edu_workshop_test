"use strict";

module.exports = function createRoutes({
  db,
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
}) {
  function routeApi(req, res, url) {
    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        app: "BSRU Workshop",
        database: "SQLite",
        databaseFile: path.relative(ROOT, DB_FILE).replaceAll("\\", "/"),
        time: now(),
        counts: {
          users: db.prepare("SELECT count(*) n FROM users").get().n,
          workshops: db.prepare("SELECT count(*) n FROM workshops").get().n,
          registrations: db
            .prepare("SELECT count(*) n FROM registrations")
            .get().n,
        },
      });
    }
    if (req.method === "GET" && url.pathname === "/api/session") {
      const session = sessionFor(req);
      return json(res, 200, {
        user: session?.user || null,
        csrf: session?.csrf || null,
      });
    }
    if (req.method === "POST" && url.pathname === "/api/otp/request")
      return bodyJson(req).then((data) => {
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
        const recent = db
          .prepare(
            "SELECT count(*) n FROM otp_challenges WHERE contact=? AND created_at>?",
          )
          .get(contact, new Date(Date.now() - 15 * 60 * 1000).toISOString()).n;
        if (recent >= 3)
          return json(res, 429, {
            error: "ขอ OTP เกินจำนวนที่กำหนด กรุณารอ 15 นาที",
          });
        let payload = {},
          user = null;
        const previous = data.replaceChallengeId
          ? db
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
            payload = JSON.parse(previous.payload_json);
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
            const duplicate = db
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
          user = db
            .prepare(`SELECT * FROM users WHERE role=? AND ${channel}=?`)
            .get(portal, contact);
          if (!user)
            return json(res, 404, { error: "ไม่พบบัญชีที่ผูกกับช่องทางนี้" });
          payload = { userId: user.id };
        }
        db.prepare(
          "UPDATE otp_challenges SET consumed_at=? WHERE contact=? AND consumed_at IS NULL",
        ).run(now(), contact);
        const id = uid(),
          code = String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
          expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        db.prepare(
          "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
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
      return bodyJson(req).then((data) => {
        const id = String(data.challengeId || ""),
          code = String(data.code || "");
        const challenge = db
          .prepare("SELECT * FROM otp_challenges WHERE id=?")
          .get(id);
        if (
          !challenge ||
          challenge.consumed_at ||
          challenge.expires_at <= now()
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
          const attempts = challenge.attempts + 1;
          db.prepare(
            "UPDATE otp_challenges SET attempts=?,consumed_at=? WHERE id=?",
          ).run(attempts, attempts >= 5 ? now() : null, id);
          return json(res, 400, {
            error:
              attempts >= 5
                ? "กรอกผิดครบ 5 ครั้ง OTP ถูกยกเลิก กรุณาขอใหม่"
                : `OTP ไม่ถูกต้อง เหลือโอกาส ${5 - attempts} ครั้ง`,
          });
        }
        const payload = JSON.parse(challenge.payload_json);
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare("UPDATE otp_challenges SET consumed_at=? WHERE id=?").run(
            now(),
            id,
          );
          if (challenge.purpose === "register") {
            const d = payload.draft,
              p = payload.password,
              userId = uid();
            const add = db.prepare(
              `INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,'WAITING','user',?,?,?)`,
            );
            add.run(
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
            const state = JSON.parse(
              db.prepare("SELECT data_json FROM app_state WHERE id=1").get()
                .data_json,
            );
            state.users.push(
              publicUser(
                db.prepare("SELECT * FROM users WHERE id=?").get(userId),
              ),
            );
            state.revision += 1;
            db.prepare(
              "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
            ).run(state.revision, JSON.stringify(state), now());
            db.exec("COMMIT");
            return json(res, 200, {
              purpose: "register",
              user: publicUser(
                db.prepare("SELECT * FROM users WHERE id=?").get(userId),
              ),
            });
          }
          const grant = crypto.randomBytes(32).toString("base64url"),
            expires = new Date(Date.now() + 5 * 60 * 1000).toISOString();
          db.prepare(
            "INSERT INTO password_reset_grants(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
          ).run(hashToken(grant), payload.userId, expires, now());
          db.exec("COMMIT");
          return json(res, 200, {
            purpose: "reset",
            grant,
            expiresAt: expires,
          });
        } catch (e) {
          db.exec("ROLLBACK");
          return json(res, 400, {
            error: e.message.includes("UNIQUE")
              ? "ข้อมูลบัญชีนี้ถูกใช้ไปแล้ว กรุณาเริ่มสมัครใหม่"
              : e.message,
          });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/password/reset")
      return bodyJson(req).then((data) => {
        const grant = String(data.grant || ""),
          password = String(data.password || "");
        if (
          !validNewPassword(password) ||
          password !== String(data.confirmation || "")
        )
          return json(res, 400, {
            error: "รหัสผ่านใหม่ไม่ผ่านเกณฑ์หรือยืนยันไม่ตรงกัน",
          });
        const row = db
          .prepare("SELECT * FROM password_reset_grants WHERE token_hash=?")
          .get(hashToken(grant));
        if (!row || row.consumed_at || row.expires_at <= now())
          return json(res, 410, {
            error: "สิทธิ์ตั้งรหัสผ่านหมดอายุหรือใช้ไปแล้ว กรุณาขอ OTP ใหม่",
          });
        const p = passwordRecord(password);
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            "UPDATE users SET password_salt=?,password_hash=? WHERE id=?",
          ).run(p.salt, p.hash, row.user_id);
          db.prepare(
            "UPDATE password_reset_grants SET consumed_at=? WHERE token_hash=?",
          ).run(now(), hashToken(grant));
          db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.user_id);
          db.exec("COMMIT");
          return json(res, 200, { ok: true });
        } catch (e) {
          db.exec("ROLLBACK");
          return json(res, 400, { error: "บันทึกรหัสผ่านไม่สำเร็จ" });
        }
      });
    if (req.method === "GET" && url.pathname === "/api/store") {
      const session = requireSession(req, res);
      if (!session) return;
      const snapshot = JSON.parse(
        db.prepare("SELECT data_json FROM app_state WHERE id=1").get()
          .data_json,
      );
      return json(res, 200, {
        store: viewFromSnapshot(snapshot, session.user),
      });
    }
    if (req.method === "POST" && url.pathname === "/api/store")
      return bodyJson(req).then((data) => {
        const session = requireSession(req, res);
        if (!session) return;
        db.exec("BEGIN IMMEDIATE");
        try {
          const merged = mergeSnapshot(session.user, data.store);
          merged.revision =
            db.prepare("SELECT revision FROM app_state WHERE id=1").get()
              .revision + 1;
          writeSnapshot(merged);
          db.prepare(
            "UPDATE app_state SET revision=?,data_json=?,updated_at=? WHERE id=1",
          ).run(merged.revision, JSON.stringify(merged), now());
          db.exec("COMMIT");
          return json(res, 200, {
            revision: merged.revision,
            store: viewFromSnapshot(merged, session.user),
          });
        } catch (e) {
          db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/login")
      return bodyJson(req).then((data) => {
        const identity = String(data.identity || "")
            .trim()
            .toLowerCase(),
          password = String(data.password || ""),
          portal = data.portal;
        const user = db
          .prepare("SELECT * FROM users WHERE lower(email)=? OR phone=?")
          .get(identity, identity);
        if (
          !user ||
          !verifyPassword(password, user.password_salt, user.password_hash)
        )
          return json(res, 401, {
            error: "อีเมล/เบอร์โทรศัพท์ หรือรหัสผ่านไม่ถูกต้อง",
          });
        if (user.role !== portal)
          return json(res, 403, {
            error: "บัญชีนี้ไม่มีสิทธิ์ใน Portal ที่เลือก",
          });
        if (user.status !== "APPROVED")
          return json(res, 403, { error: "บัญชีนี้รอเจ้าหน้าที่อนุมัติ" });
        const token = crypto.randomBytes(32).toString("base64url"),
          csrf = crypto.randomBytes(24).toString("base64url"),
          expires = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        db.prepare(
          "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)",
        ).run(hashToken(token), user.id, csrf, expires, now());
        return json(
          res,
          200,
          { user: publicUser(user), csrf },
          {
            "Set-Cookie": `bsru_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
          },
        );
      });
    if (req.method === "POST" && url.pathname === "/api/logout") {
      const session = requireSession(req, res);
      if (!session) return;
      db.prepare("DELETE FROM sessions WHERE token_hash=?").run(
        session.row.token_hash,
      );
      return json(
        res,
        200,
        { ok: true },
        {
          "Set-Cookie":
            "bsru_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
        },
      );
    }
    if (req.method === "GET" && url.pathname === "/api/workshops") {
      const session = requireSession(req, res);
      if (!session) return;
      return json(res, 200, { workshops: workshopRows() });
    }
    if (req.method === "POST" && url.pathname === "/api/enroll")
      return bodyJson(req).then((data) => {
        const session = requireSession(req, res, "user");
        if (!session) return;
        const workshopId = String(data.workshopId || "");
        db.exec("BEGIN IMMEDIATE");
        try {
          const w = db
            .prepare("SELECT * FROM workshops WHERE id=?")
            .get(workshopId);
          if (!w || w.closed || Date.parse(w.start_at) <= Date.now())
            throw Object.assign(new Error("กิจกรรมปิดรับลงทะเบียนแล้ว"), {
              status: 409,
            });
          const prior = db
            .prepare(
              "SELECT * FROM registrations WHERE user_id=? AND workshop_id=?",
            )
            .get(session.user.id, workshopId);
          if (prior && prior.status !== "CANCELLED")
            throw Object.assign(new Error("คุณลงทะเบียนกิจกรรมนี้แล้ว"), {
              status: 409,
            });
          const count = db
            .prepare(
              `SELECT count(*) n FROM registrations WHERE workshop_id=? AND status IN ('PENDING','ATTENDED','ABSENT')`,
            )
            .get(workshopId).n;
          if (count >= w.capacity)
            throw Object.assign(new Error("ที่นั่งเต็มแล้ว"), { status: 409 });
          const t = now();
          if (prior)
            db.prepare(
              `UPDATE registrations SET status='PENDING',updated_at=? WHERE id=?`,
            ).run(t, prior.id);
          else
            db.prepare(
              `INSERT INTO registrations(id,user_id,workshop_id,status,created_at,updated_at) VALUES(?,?,?,'PENDING',?,?)`,
            ).run(uid(), session.user.id, workshopId, t, t);
          db.exec("COMMIT");
          return json(res, 200, { ok: true, workshops: workshopRows() });
        } catch (e) {
          db.exec("ROLLBACK");
          return json(res, e.status || 400, { error: e.message });
        }
      });
    if (req.method === "POST" && url.pathname === "/api/attendance")
      return bodyJson(req).then((data) => {
        const session = requireSession(req, res, "staff");
        if (!session) return;
        const status = String(data.status || "");
        if (!["ATTENDED", "ABSENT"].includes(status))
          return json(res, 400, { error: "สถานะเช็กชื่อไม่ถูกต้อง" });
        const row = db
          .prepare(
            "SELECT r.*,w.title,w.hours FROM registrations r JOIN workshops w ON w.id=r.workshop_id WHERE r.id=?",
          )
          .get(String(data.registrationId || ""));
        if (!row) return json(res, 404, { error: "ไม่พบรายการลงทะเบียน" });
        if (row.status !== status) {
          db.exec("BEGIN IMMEDIATE");
          try {
            db.prepare(
              "UPDATE registrations SET status=?,updated_at=? WHERE id=?",
            ).run(status, now(), row.id);
            db.prepare(
              "INSERT INTO notifications(id,user_id,title,message,related_type,related_id,created_at) VALUES(?,?,?,?,?,?,?)",
            ).run(
              uid(),
              row.user_id,
              "อัปเดตผลการเข้าร่วม",
              `กิจกรรม “${row.title}” เปลี่ยนเป็น ${status === "ATTENDED" ? "เข้าร่วมงานแล้ว" : "ไม่ได้เข้าร่วม"}`,
              "registration",
              row.id,
              now(),
            );
            db.exec("COMMIT");
          } catch (e) {
            db.exec("ROLLBACK");
            return json(res, 400, { error: e.message });
          }
        }
        return json(res, 200, { ok: true });
      });
    if (req.method === "GET" && url.pathname === "/api/registrations") {
      const session = requireSession(req, res);
      if (!session) return;
      const all = session.user.role === "staff";
      const rows = all
        ? db
            .prepare(
              `SELECT r.*,u.name AS user_name,u.code,w.title AS workshop_title,w.hours FROM registrations r JOIN users u ON u.id=r.user_id JOIN workshops w ON w.id=r.workshop_id ORDER BY r.created_at DESC`,
            )
            .all()
        : db
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
