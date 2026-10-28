"use strict";

module.exports = function createAuth({
  db,
  parseCookies,
  hashToken,
  now,
  publicUser,
  json,
}) {
  function sessionFor(req) {
    const raw = parseCookies(req.headers.cookie).bsru_session;
    if (!raw) return null;
    const row = db
      .prepare(
        `SELECT s.token_hash,s.csrf_token,s.expires_at,u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`,
      )
      .get(hashToken(raw));
    if (!row || row.expires_at < now()) return null;
    return { row, user: publicUser(row), csrf: row.csrf_token };
  }
  function requireSession(req, res, role) {
    const session = sessionFor(req);
    if (!session) {
      json(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
      return null;
    }
    if (role && session.user.role !== role) {
      json(res, 403, { error: "ไม่มีสิทธิ์ดำเนินการ" });
      return null;
    }
    if (req.method !== "GET" && req.headers["x-csrf-token"] !== session.csrf) {
      json(res, 403, { error: "โทเคนความปลอดภัยไม่ถูกต้อง" });
      return null;
    }
    return session;
  }

  return { sessionFor, requireSession };
};
