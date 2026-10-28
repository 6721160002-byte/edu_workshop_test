"use strict";

module.exports = function createHttp({ MAX_BODY_BYTES }) {
  function json(res, status, data, extra = {}) {
    const body = Buffer.from(JSON.stringify(data));
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": body.length,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    });
    res.end(body);
  }
  function parseCookies(header = "") {
    const out = {};
    for (const part of header.split(";")) {
      const i = part.indexOf("=");
      if (i <= 0) continue;
      const key = part.slice(0, i).trim();
      try {
        out[key] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* Ignore malformed cookies; protected routes will treat them as unauthenticated. */
      }
    }
    return out;
  }
  function bodyJson(req) {
    // Vercel may parse the request body before invoking our function.
    if (req.body !== undefined) {
      try {
        const raw = Buffer.isBuffer(req.body)
          ? req.body.toString("utf8")
          : req.body;
        const size = Buffer.byteLength(
          typeof raw === "string" ? raw : JSON.stringify(raw),
        );
        if (size > MAX_BODY_BYTES)
          throw Object.assign(new Error("คำขอมีขนาดใหญ่เกินกำหนด"), {
            status: 413,
          });
        return Promise.resolve(
          typeof raw === "string" ? JSON.parse(raw || "{}") : raw,
        );
      } catch (error) {
        return Promise.reject(
          Object.assign(error, { status: error.status || 400 }),
        );
      }
    }
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BODY_BYTES) {
          reject(
            Object.assign(new Error("คำขอมีขนาดใหญ่เกินกำหนด"), {
              status: 413,
            }),
          );
          req.destroy();
        } else chunks.push(chunk);
      });
      req.on("end", () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
        } catch {
          reject(
            Object.assign(new Error("รูปแบบข้อมูลไม่ถูกต้อง"), { status: 400 }),
          );
        }
      });
      req.on("error", reject);
    });
  }

  return { json, parseCookies, bodyJson };
};
