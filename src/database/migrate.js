"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const sqlite = require("node:sqlite");
const { isDeepStrictEqual } = require("node:util");
const { workshopTimestamp } = require("../utils");

// Ordered by foreign-key dependencies. Password salts/hashes stay intact.
const DATA_TABLES = [
  "users",
  "user_passwords",
  "firebase_identities",
  "workshops",
  "registrations",
  "ratings",
  "complaints",
  "complaint_replies",
  "notifications",
  "app_state",
];
const TRANSIENT_TABLES = [
  "sessions",
  "otp_challenges",
  "password_reset_grants",
  "login_attempts",
];
const ALL_TABLES = [...DATA_TABLES, ...TRANSIENT_TABLES];
const identifier = (name) => {
  if (!/^[a-z_]+$/.test(name))
    throw new Error("Unsupported database identifier");
  return `"${name}"`;
};
const fail = (code, message) => {
  throw Object.assign(new Error(message), { code });
};

async function snapshotSQLite(sourceFile, backupDirectory) {
  if (typeof sqlite.backup !== "function")
    fail(
      "NODE_VERSION_REQUIRED",
      "การสำรองข้อมูลเพื่อย้ายฐานข้อมูลต้องใช้ Node.js 24 หรือ 22.16 ขึ้นไป",
    );
  sourceFile = path.resolve(sourceFile);
  if (!fs.existsSync(sourceFile))
    fail("SOURCE_NOT_FOUND", "ไม่พบไฟล์ SQLite ต้นทาง");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupFile = path.join(
    backupDirectory,
    `before-supabase-${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomUUID()}.sqlite`,
  );
  // Never overwrite an earlier backup, even when two commands start together.
  fs.closeSync(fs.openSync(backupFile, "wx", 0o600));
  const source = new sqlite.DatabaseSync(sourceFile, { readOnly: true });
  try {
    await sqlite.backup(source, backupFile);
  } finally {
    source.close();
  }
  const snapshot = new sqlite.DatabaseSync(backupFile, { readOnly: true });
  try {
    if (
      snapshot.prepare("PRAGMA integrity_check").get().integrity_check !==
        "ok" ||
      snapshot.prepare("PRAGMA foreign_key_check").all().length
    )
      fail(
        "SOURCE_INTEGRITY_ERROR",
        "ฐานข้อมูลต้นทางไม่ผ่านการตรวจสอบ ยังไม่ย้ายข้อมูล",
      );
    const existing = new Set(
      snapshot
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((row) => row.name),
    );
    if (!existing.has("users") || !existing.has("workshops"))
      fail(
        "SOURCE_SCHEMA_INVALID",
        "ไฟล์ต้นทางไม่ใช่ฐานข้อมูลของ BSRU Workshop",
      );
    const rows = Object.fromEntries(
      DATA_TABLES.map((table) => [
        table,
        existing.has(table)
          ? snapshot
              .prepare(`SELECT * FROM ${identifier(table)}`)
              .all()
              .map((row) => ({ ...row }))
          : [],
      ]),
    );
    if (!rows.users.length)
      fail("SOURCE_EMPTY", "ไม่พบบัญชีสมาชิกใน SQLite ต้นทาง");
    return {
      backupFile,
      rows,
      counts: Object.fromEntries(
        DATA_TABLES.map((table) => [table, rows[table].length]),
      ),
    };
  } finally {
    snapshot.close();
  }
}

async function inspectTarget(pool) {
  const result = await pool.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  );
  const existing = new Set(result.rows.map((row) => row.table_name));
  const counts = {};
  for (const table of ALL_TABLES)
    counts[table] = existing.has(table)
      ? Number(
          (
            await pool.query(
              `SELECT count(*) n FROM public.${identifier(table)}`,
            )
          ).rows[0].n,
        )
      : 0;
  return { ready: ALL_TABLES.every((table) => existing.has(table)), counts };
}
function assertEmpty(counts) {
  if (Object.values(counts).some((value) => Number(value) !== 0))
    fail(
      "TARGET_NOT_EMPTY",
      "ฐานข้อมูลปลายทางมีข้อมูลแอปอยู่แล้ว จึงหยุดเพื่อไม่เขียนทับ กรุณาเลือกโปรเจกต์/ฐานข้อมูลว่างสำหรับย้าย หรือให้ตรวจข้อมูลปลายทางก่อน",
    );
}
function convertRow(table, row, destination) {
  const result = { ...row };
  if (table === "workshops") {
    result.start_at = workshopTimestamp(row.start_at);
    result.end_at = workshopTimestamp(row.end_at);
    result.closed = destination.boolean(Boolean(row.closed));
  }
  if (table === "app_state")
    result.data_json = JSON.stringify(
      typeof row.data_json === "string"
        ? JSON.parse(row.data_json)
        : row.data_json,
    );
  return result;
}
function comparable(column, value) {
  if (column === "data_json")
    return typeof value === "string" ? JSON.parse(value) : value;
  if (column.endsWith("_at") && value !== null)
    return new Date(value).toISOString();
  return value;
}

async function importSnapshot(snapshot, destination) {
  await destination.withRequest(async () => {
    await destination.exec("BEGIN IMMEDIATE");
    try {
      // Serialize against SQL writers as well as this application's advisory lock.
      await destination.exec(
        `LOCK TABLE ${ALL_TABLES.map(identifier).join(",")} IN EXCLUSIVE MODE`,
      );
      const counts = {};
      for (const table of ALL_TABLES)
        counts[table] = Number(
          (
            await destination
              .prepare(`SELECT count(*) n FROM ${identifier(table)}`)
              .get()
          ).n,
        );
      assertEmpty(counts);
      for (const table of DATA_TABLES) {
        for (const sourceRow of snapshot.rows[table]) {
          const row = convertRow(table, sourceRow, destination);
          const columns = Object.keys(row);
          await destination
            .prepare(
              `INSERT INTO ${identifier(table)}(${columns.map(identifier).join(",")}) VALUES(${columns.map(() => "?").join(",")})`,
            )
            .run(...columns.map((column) => row[column]));
        }
      }
      // Check values, not just counts, before committing any destination data.
      for (const table of DATA_TABLES) {
        if (
          Number(
            (
              await destination
                .prepare(`SELECT count(*) n FROM ${identifier(table)}`)
                .get()
            ).n,
          ) !== snapshot.counts[table]
        )
          fail(
            "MIGRATION_VERIFY_FAILED",
            "จำนวนข้อมูลปลายทางไม่ตรงกับต้นทาง ยกเลิกการย้ายทั้งหมด",
          );
        const key =
          { firebase_identities: "firebase_uid", user_passwords: "user_id" }[
            table
          ] || "id";
        for (const sourceRow of snapshot.rows[table]) {
          const expected = convertRow(table, sourceRow, destination);
          const actual = await destination
            .prepare(
              `SELECT * FROM ${identifier(table)} WHERE ${identifier(key)}=?`,
            )
            .get(expected[key]);
          if (
            !actual ||
            Object.keys(expected).some(
              (column) =>
                !isDeepStrictEqual(
                  comparable(column, expected[column]),
                  comparable(column, actual[column]),
                ),
            )
          )
            fail(
              "MIGRATION_VERIFY_FAILED",
              "ข้อมูลปลายทางไม่ตรงกับต้นทาง ยกเลิกการย้ายทั้งหมด",
            );
        }
      }
      await destination.exec("COMMIT");
    } catch (error) {
      await destination.exec("ROLLBACK");
      throw error;
    }
  });
  return { counts: snapshot.counts, backupFile: snapshot.backupFile };
}
module.exports = {
  DATA_TABLES,
  TRANSIENT_TABLES,
  snapshotSQLite,
  inspectTarget,
  assertEmpty,
  importSnapshot,
};
