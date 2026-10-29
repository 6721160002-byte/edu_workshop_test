"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const config = require("./config");
const utils = require("./utils");
const { isAllowedOrigin } = require("./origin");
module.exports = async function createApplication(options = {}) {
  const { APP_ORIGIN } = config;
  const db = options.database || (await require("./database")());
  const context = { ...config, ...utils, db, fs, path, crypto };

  Object.assign(context, require("./http")(context));
  Object.assign(context, require("./auth")(context));
  Object.assign(context, require("./store")(context));
  try {
    await db.withRequest(async () => {
      await db.exec("BEGIN IMMEDIATE");
      await require("./database/seed")(context).seed();
      await context.ensureSnapshot();
      await db.exec("COMMIT");
    });
  } catch (error) {
    await db.close();
    throw error;
  }
  const { json } = context;
  const { routeApi } = require("./routes")(context);
  const { serveStatic } = require("./static")(context);

  const handler = (req, res) => {
    if (!isAllowedOrigin(req, APP_ORIGIN))
      return json(res, 403, { error: "คำขอมาจากแหล่งที่ไม่ได้รับอนุญาต" });
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...(req.headers.origin
          ? {
              "Access-Control-Allow-Origin": req.headers.origin,
              Vary: "Origin",
            }
          : {}),
        "Access-Control-Allow-Methods": "GET,POST",
        "Access-Control-Allow-Headers": "Content-Type,X-CSRF-Token",
      });
      return res.end();
    }
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return json(res, 400, { error: "URL ไม่ถูกต้อง" });
    }
    if (url.pathname.startsWith("/api/")) {
      return db
        .withRequest(() => routeApi(req, res, url))
        .catch((err) => {
          if (!res.headersSent)
            json(res, err.status || 500, {
              error: err.message || "เกิดข้อผิดพลาดภายในระบบ",
            });
        });
    } else serveStatic(req, res, url);
  };
  return { handler, close: () => db.close() };
};
