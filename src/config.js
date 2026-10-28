"use strict";
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");
const DATA = path.join(ROOT, "storage");
const DB_FILE = process.env.DB_FILE
  ? path.resolve(process.env.DB_FILE)
  : path.join(DATA, "bsru-workshop.sqlite");
const HOST = "127.0.0.1";
const PREFERRED_PORT = Number(process.env.PORT || 8001);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

module.exports = {
  ROOT,
  PUBLIC,
  DATA,
  DB_FILE,
  HOST,
  PREFERRED_PORT,
  SESSION_TTL_MS,
  MAX_BODY_BYTES,
  MIME,
};
