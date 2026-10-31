"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { DatabaseSync } = require("node:sqlite");
const database = require("./helpers/test-database");
const utils = require("../src/utils");
const { connectionOptions } = require("../src/database/pool");
const {
  DATA_TABLES,
  TRANSIENT_TABLES,
  snapshotSQLite,
  inspectTarget,
  importSnapshot,
  assertEmpty,
} = require("../src/database/migrate");
const { friendly } = require("../scripts/database");

async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bsru-migration-"));
  const file = path.join(root, "source.sqlite");
  const source = await database("sqlite", { filename: file });
  source.exec("PRAGMA journal_mode=WAL");
  await require("../src/app")({
    database: source,
    registrationProvider: "password",
    emailDelivery: { available: false },
  });
  const record = utils.passwordRecord("MigrationPassword123!");
  source
    .prepare(
      "INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
    )
    .run(
      "migrated",
      "สมาชิกทดสอบย้ายข้อมูล",
      "นักศึกษา",
      "MIGRATION-01",
      "migration@bsru.ac.th",
      "0891111122",
      "Science",
      "Computing",
      "APPROVED",
      "user",
      record.salt,
      record.hash,
      utils.now(),
    );
  source
    .prepare(
      "INSERT INTO user_passwords(user_id,password_plaintext,updated_at) VALUES(?,?,?)",
    )
    .run("migrated", "MigrationPassword123!", utils.now());
  source
    .prepare(
      "INSERT INTO notifications(id,user_id,title,message,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      "migration-notice",
      "migrated",
      "ภาษาไทย",
      "ข้อมูลจาก WAL ต้องไม่หาย",
      utils.now(),
    );
  source
    .prepare("UPDATE workshops SET start_at=?,end_at=? WHERE id=?")
    .run("2099-12-10T09:00", "2099-12-10T11:00", "w1");
  source
    .prepare(
      "INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at,created_at) VALUES(?,?,?,?,?)",
    )
    .run(
      "old-session",
      "migrated",
      "old-csrf",
      "2099-12-10T00:00:00Z",
      utils.now(),
    );
  source
    .prepare(
      "INSERT INTO password_reset_grants(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)",
    )
    .run("old-grant", "migrated", "2099-12-10T00:00:00Z", utils.now());
  source
    .prepare(
      "INSERT INTO otp_challenges(id,purpose,channel,contact,code_hash,payload_json,expires_at,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      "old-code",
      "password-reset",
      "email",
      "migration@bsru.ac.th",
      "hash",
      "{}",
      "2099-12-10T00:00:00Z",
      utils.now(),
    );
  source
    .prepare("INSERT INTO login_attempts(id,identity,created_at) VALUES(?,?,?)")
    .run("old-attempt", "migration@bsru.ac.th", utils.now());
  const store = require("../src/store")({ ...utils, db: source });
  await store.refreshSnapshot();
  const target = await database("postgres");
  t.after(async () => {
    source.close();
    await target.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, file, source, target };
}

test("PostgreSQL options select TLS for Supabase and limit serverless pools without leaking URLs", (t) => {
  const previous = process.env.VERCEL;
  t.after(() => {
    if (previous === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previous;
  });
  delete process.env.VERCEL;
  const options = connectionOptions(
    "postgresql://postgres.project:secret@aws-0-region.pooler.supabase.com:5432/postgres",
  );
  assert.equal(
    new URL(options.connectionString).searchParams.get("sslmode"),
    null,
  );
  assert.equal(options.ssl.rejectUnauthorized, true);
  assert.ok(options.ssl.ca.includes("BEGIN CERTIFICATE"));
  const parsed = new (require("pg/lib/connection-parameters"))(options);
  assert.equal(parsed.ssl.rejectUnauthorized, true);
  assert.equal(
    parsed.ssl.ca,
    options.ssl.ca,
    "pg must retain the custom CA after URL parsing",
  );
  const systemRoots = connectionOptions(options.connectionString, {
    certificateFile: null,
    certificate: null,
  });
  assert.equal(
    new URL(systemRoots.connectionString).searchParams.get("sslmode"),
    "verify-full",
  );
  assert.throws(
    () =>
      connectionOptions(options.connectionString, {
        certificateFile: null,
        certificate: "not a certificate",
      }),
    { code: "DATABASE_CA_INVALID" },
  );
  assert.equal(options.max, 3);
  process.env.VERCEL = "1";
  assert.equal(connectionOptions(options.connectionString).max, 1);
  assert.throws(
    () =>
      connectionOptions(
        "postgresql://postgres.project:private@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=disable",
      ),
    { code: "DATABASE_SSL_REQUIRED" },
  );
  assert.throws(
    () => connectionOptions("postgresql://USER:PASSWORD@HOST/DATABASE"),
    { code: "DATABASE_URL_INVALID" },
  );
  const text = friendly({
    code: "28P01",
    message: "postgresql://private-password@host/private",
  });
  assert.ok(!text.includes("private-password"));
  assert.ok(
    !friendly({
      message: "unknown connection error private-password",
    }).includes("private-password"),
  );
});

test("SQLite migration preserves passwords, Thai data, WAL writes, snapshots and Bangkok times", async (t) => {
  const { root, file, source, target } = await fixture(t);
  const snapshot = await snapshotSQLite(file, path.join(root, "backups"));
  assert.equal(snapshot.counts.users, 4);
  const backup = new DatabaseSync(snapshot.backupFile, { readOnly: true });
  assert.ok(
    backup
      .prepare("SELECT id FROM notifications WHERE id='migration-notice'")
      .get(),
  );
  backup.close();
  const result = await importSnapshot(snapshot, target);
  assert.equal(result.counts.users, 4);
  for (const table of DATA_TABLES)
    assert.equal(
      Number(
        (await target.prepare(`SELECT count(*) n FROM "${table}"`).get()).n,
      ),
      snapshot.counts[table],
    );
  for (const table of TRANSIENT_TABLES)
    assert.equal(
      Number(
        (await target.prepare(`SELECT count(*) n FROM "${table}"`).get()).n,
      ),
      0,
      table + " must not migrate active secrets",
    );
  const member = await target
    .prepare("SELECT * FROM users WHERE id='migrated'")
    .get();
  assert.ok(
    utils.verifyPassword(
      "MigrationPassword123!",
      member.password_salt,
      member.password_hash,
    ),
  );
  assert.equal(member.name, "สมาชิกทดสอบย้ายข้อมูล");
  assert.equal(
    (
      await target
        .prepare(
          "SELECT password_plaintext FROM user_passwords WHERE user_id='migrated'",
        )
        .get()
    ).password_plaintext,
    "MigrationPassword123!",
  );
  assert.equal(
    (await target.prepare("SELECT start_at FROM workshops WHERE id='w1'").get())
      .start_at,
    "2099-12-10T02:00:00.000Z",
  );
  const state = (
    await target.prepare("SELECT data_json FROM app_state WHERE id=1").get()
  ).data_json;
  assert.ok(state.users.some((row) => row.id === "migrated"));
  assert.equal(
    source.prepare("SELECT count(*) n FROM users").get().n,
    4,
    "source remains intact",
  );
  assert.equal(
    source.prepare("SELECT count(*) n FROM sessions").get().n,
    1,
    "source sessions are not deleted",
  );
  const inspected = await inspectTarget({
    query: async (sql) => ({ rows: await target.prepare(sql).all() }),
  });
  assert.equal(inspected.ready, true);
  assert.equal(inspected.counts.users, 4);
  const app = await require("../src/app")({
    database: target,
    registrationProvider: "password",
    emailDelivery: { available: false },
  });
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = "http://127.0.0.1:" + server.address().port;
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: "migration@bsru.ac.th",
      password: "MigrationPassword123!",
    }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  assert.equal(session.user.id, "migrated");
  const loaded = await fetch(base + "/api/store", {
    headers: { Cookie: login.headers.get("set-cookie").split(";")[0] },
  });
  assert.equal(loaded.status, 200);
  assert.ok(
    (await loaded.json()).store.notifications.some(
      (row) => row.id === "migration-notice",
    ),
  );
});

test("migration refuses nonempty targets and never overwrites existing destination accounts", async (t) => {
  const { root, file, target } = await fixture(t);
  const snapshot = await snapshotSQLite(file, path.join(root, "backups"));
  await importSnapshot(snapshot, target);
  const original = await target
    .prepare("SELECT password_hash FROM users WHERE id='migrated'")
    .get();
  await assert.rejects(importSnapshot(snapshot, target), {
    code: "TARGET_NOT_EMPTY",
  });
  assert.equal(
    (
      await target
        .prepare("SELECT password_hash FROM users WHERE id='migrated'")
        .get()
    ).password_hash,
    original.password_hash,
  );
  assert.equal(
    Number((await target.prepare("SELECT count(*) n FROM users").get()).n),
    4,
  );
  assert.throws(() => assertEmpty({ users: 1 }), { code: "TARGET_NOT_EMPTY" });
});

test("a destination constraint failure rolls back all imported rows and preserves the source", async (t) => {
  const { root, file, source, target } = await fixture(t);
  source
    .prepare("UPDATE workshops SET end_at=? WHERE id='w1'")
    .run("2099-12-10T08:00");
  const snapshot = await snapshotSQLite(file, path.join(root, "backups"));
  await assert.rejects(
    importSnapshot(snapshot, target),
    (error) => error.code === "23514",
  );
  for (const table of DATA_TABLES)
    assert.equal(
      Number(
        (await target.prepare(`SELECT count(*) n FROM "${table}"`).get()).n,
      ),
      0,
    );
  assert.equal(source.prepare("SELECT count(*) n FROM users").get().n, 4);
  assert.ok(fs.existsSync(snapshot.backupFile));
});
