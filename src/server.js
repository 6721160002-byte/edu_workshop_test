"use strict";
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const config = require("./config");
const utils = require("./utils");
const { ROOT, PUBLIC, DB_FILE, HOST, PREFERRED_PORT, MIME } = config;
let activePort = PREFERRED_PORT;
let triedFallbackPort = false;
const db = require("./database")();
const context = { ...config, ...utils, db, fs, path, crypto };
require("./database/seed")(context).seed();
Object.assign(context, require("./http")(context));
Object.assign(context, require("./auth")(context));
Object.assign(context, require("./store")(context));
context.ensureSnapshot();
const { json } = context;
const { routeApi } = require("./routes")(context);
const { serveStatic } = require("./static")(context);

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "null",
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type,X-CSRF-Token",
    });
    return res.end();
  }
  const origin = req.headers.origin;
  if (origin && origin !== `http://${HOST}:${activePort}`)
    return json(res, 403, { error: "คำขอมาจากแหล่งที่ไม่ได้รับอนุญาต" });
  let url;
  try {
    url = new URL(req.url, `http://${HOST}:${activePort}`);
  } catch {
    return json(res, 400, { error: "URL ไม่ถูกต้อง" });
  }
  if (url.pathname.startsWith("/api/")) {
    Promise.resolve(routeApi(req, res, url)).catch((err) => {
      if (!res.headersSent)
        json(res, err.status || 500, {
          error: err.message || "เกิดข้อผิดพลาดภายในระบบ",
        });
    });
  } else serveStatic(req, res, url);
});
server.on("error", (err) => {
  if (
    err.code === "EADDRINUSE" &&
    !triedFallbackPort &&
    !process.env.PORT &&
    PREFERRED_PORT === 8001
  ) {
    triedFallbackPort = true;
    activePort = 8002;
    console.warn(
      "พอร์ต 8001 ไม่ว่าง กำลังลองพอร์ตสำรอง 8002 โดยไม่ปิดโปรแกรมอื่น",
    );
    server.listen(activePort, HOST);
    return;
  }
  if (err.code === "EADDRINUSE")
    console.error(
      `พอร์ต ${activePort} ถูกใช้งานอยู่ กรุณาปิดโปรแกรมที่ใช้อยู่ หรือกำหนด PORT เป็นพอร์ตว่าง`,
    );
  else console.error(err.message);
  db.close();
  process.exitCode = 1;
});
function onListening() {
  console.log(`BSRU Workshop server พร้อมใช้งาน: http://${HOST}:${activePort}`);
  console.log(`โฟลเดอร์เว็บ: ${PUBLIC}`);
  console.log(`ฐานข้อมูล SQLite: ${path.relative(ROOT, DB_FILE)}`);
  if (process.env.NO_BROWSER !== "1") {
    const opener = spawn(
      "cmd.exe",
      ["/c", "start", "", `http://${HOST}:${activePort}`],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    opener.unref();
  }
}
server.once("listening", onListening);
server.listen(activePort, HOST);
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
