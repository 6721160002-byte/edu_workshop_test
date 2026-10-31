"use strict";
const path = require("node:path");
const { ROOT, DB_FILE } = require("../src/config");
const { createPool } = require("../src/database/pool");
const { createPostgresDatabase } = require("../src/database/postgres");
const {
  snapshotSQLite,
  inspectTarget,
  assertEmpty,
  importSnapshot,
} = require("../src/database/migrate");

function friendly(error) {
  const messages = {
    "28P01": "รหัสผ่านฐานข้อมูลไม่ถูกต้อง ตรวจ DATABASE_URL ใน .env",
    ENOTFOUND:
      "ไม่พบโฮสต์ฐานข้อมูล ให้คัดลอก Host/User/Port จาก Supabase Connect โดยตรง",
    ECONNREFUSED:
      "เชื่อมฐานข้อมูลไม่ได้ ตรวจว่าโปรเจกต์ Supabase พร้อมใช้งานและเลือกพอร์ตถูกต้อง",
    ENETUNREACH:
      "เครือข่ายเชื่อมโฮสต์นี้ไม่ได้ ให้ใช้ Session pooler ที่รองรับ IPv4 สำหรับเครื่องนี้",
    ETIMEDOUT:
      "เชื่อมต่อฐานข้อมูลหมดเวลา ตรวจเครือข่ายและสถานะโปรเจกต์ Supabase",
    DEPTH_ZERO_SELF_SIGNED_CERT:
      "ตรวจสอบใบรับรอง SSL ไม่ผ่าน กรุณาตรวจ Connection string และการตั้งค่าใบรับรอง ไม่ปิดการตรวจ SSL เพื่อข้ามปัญหา",
    SELF_SIGNED_CERT_IN_CHAIN:
      "ตรวจสอบใบรับรอง SSL ไม่ผ่าน กรุณาตรวจใบรับรองจาก Supabase และเครือข่ายที่ใช้งาน",
    23514:
      "ข้อมูลต้นทางไม่ผ่านเงื่อนไขฐานข้อมูลปลายทาง ยกเลิกการย้ายทั้งหมดแล้ว ให้ตรวจข้อมูลก่อนลองใหม่",
    23505: "มีข้อมูลซ้ำหรือปลายทางมีข้อมูลอยู่แล้ว ยกเลิกการย้ายทั้งหมด",
  };
  return (
    messages[error.code] ||
    (/^(SOURCE_|TARGET_|DATABASE_|NODE_VERSION_|MIGRATION_)/.test(
      error.code || "",
    )
      ? error.message
      : "ดำเนินการไม่สำเร็จ ตรวจค่าการเชื่อมต่อ เครือข่าย และสถานะ Supabase โดยไม่เผยแพร่ Connection string")
  );
}
async function main() {
  const command = process.argv[2] || "status";
  if (!["status", "backup", "migrate"].includes(command))
    throw Object.assign(
      Error("ใช้คำสั่ง db:status, db:backup หรือ db:migrate"),
      { code: "DATABASE_COMMAND_INVALID" },
    );
  if (command === "backup") {
    const snapshot = await snapshotSQLite(
      DB_FILE,
      path.join(ROOT, "storage", "backups"),
    );
    console.log(
      JSON.stringify(
        {
          backupFile: path.relative(ROOT, snapshot.backupFile),
          counts: snapshot.counts,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (!process.env.DATABASE_URL)
    throw Object.assign(
      Error(
        "ยังไม่ได้ตั้ง DATABASE_URL ให้เปิดไฟล์ .env และใส่ Connection string จาก Supabase Connect ก่อน",
      ),
      { code: "DATABASE_URL_MISSING" },
    );
  const pool = createPool();
  let destination;
  try {
    await pool.query("SELECT 1");
    const target = await inspectTarget(pool);
    if (command === "status") {
      console.log(
        JSON.stringify(
          {
            connected: true,
            database: "PostgreSQL",
            tablesReady: target.ready,
            counts: target.counts,
          },
          null,
          2,
        ),
      );
      return;
    }
    assertEmpty(target.counts);
    const snapshot = await snapshotSQLite(
      DB_FILE,
      path.join(ROOT, "storage", "backups"),
    );
    destination = createPostgresDatabase(pool);
    await destination.initialize();
    const result = await importSnapshot(snapshot, destination);
    console.log(
      JSON.stringify(
        {
          migrated: true,
          counts: result.counts,
          backupFile: path.relative(ROOT, result.backupFile),
          next: "เริ่มเซิร์ฟเวอร์ใหม่ แล้วตรวจ /api/health ต้องได้ PostgreSQL จากนั้นเข้าสู่ระบบด้วยบัญชีและรหัสผ่านเดิม",
        },
        null,
        2,
      ),
    );
  } finally {
    if (destination) await destination.close();
    else await pool.end();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(friendly(error));
    console.error(
      "Diagnostic code:",
      /^[A-Z0-9_]{1,64}$/.test(String(error.code || ""))
        ? error.code
        : "UNKNOWN",
    );
    process.exitCode = 1;
  });
module.exports = { friendly, main };
