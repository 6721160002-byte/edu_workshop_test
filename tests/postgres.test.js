"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const {
  createPostgresDatabase,
  parameters,
} = require("../src/database/postgres");

async function database() {
  const engine = new PGlite();
  const query = async (sql, values = []) => {
    if (sql === "SELECT pg_advisory_xact_lock(724017001)") return { rows: [] };
    const result =
      !values.length && sql.includes(";")
        ? (await engine.exec(sql)).at(-1)
        : await engine.query(sql, values);
    return { ...result, rowCount: result.affectedRows };
  };
  let queue = Promise.resolve();
  const pool = {
    query,
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => (release = resolve));
      await previous;
      return { query, release };
    },
    end: () => engine.close(),
  };
  const db = createPostgresDatabase(pool);
  await db.initialize();
  return db;
}

test("SQL parameters preserve quoted question marks", () => {
  assert.equal(
    parameters("SELECT '?' AS label, x FROM users WHERE id=? AND name=?"),
    "SELECT '?' AS label, x FROM users WHERE id=$1 AND name=$2",
  );
});

test("PostgreSQL backend serves the existing API and preserves state across application restarts", async (t) => {
  process.env.SEED_DEMO = "1";
  const db = await database();
  const application = await require("../src/app")({ database: db });
  const server = http.createServer(application.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    delete process.env.SEED_DEMO;
    await new Promise((resolve) => server.close(resolve));
    await db.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const response = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({
      identity: "std_demo@bsru.ac.th",
      password: "123456",
      portal: "user",
    }),
  });
  assert.equal(response.status, 200, await response.clone().text());
  const user = await response.json();
  const headers = {
    Cookie: response.headers.get("set-cookie").split(";")[0],
    "Content-Type": "application/json",
    "X-CSRF-Token": user.csrf,
    Origin: base,
  };
  const state = await (await fetch(base + "/api/store", { headers })).json();
  assert.equal(state.store.users.length, 1);
  state.store.revision++;
  let save = await fetch(base + "/api/store", {
    method: "POST",
    headers,
    body: JSON.stringify(state),
  });
  assert.equal(save.status, 200, await save.clone().text());
  const duplicate = await fetch(base + "/api/store", {
    method: "POST",
    headers,
    body: JSON.stringify(state),
  });
  assert.equal(duplicate.status, 409);
  const enrollment = await fetch(base + "/api/enroll", {
    method: "POST",
    headers,
    body: JSON.stringify({ workshopId: "w2" }),
  });
  assert.equal(enrollment.status, 200, await enrollment.clone().text());
  const registrations = await (
    await fetch(base + "/api/registrations", { headers })
  ).json();
  assert.ok(
    registrations.registrations.some(
      (r) => r.workshop_id === "w2" && r.status === "PENDING",
    ),
  );
  // A fresh application reuses the same database rather than resetting it.
  await require("../src/app")({ database: db });
  const persisted = await db
    .prepare("SELECT revision FROM app_state WHERE id=1")
    .get();
  assert.equal(persisted.revision, state.store.revision);
  const sessions = await db.prepare("SELECT count(*) n FROM sessions").get();
  assert.equal(Number(sessions.n), 1);
});

test("production PostgreSQL creates only the configured administrator", async (t) => {
  delete process.env.SEED_DEMO;
  process.env.BOOTSTRAP_ADMIN_EMAIL = "owner@example.test";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "TestOnlyPassword123!";
  const db = await database();
  t.after(async () => {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await db.close();
  });
  await require("../src/app")({ database: db });
  const users = await db.prepare("SELECT email,role FROM users").all();
  assert.equal(users.length, 1);
  assert.equal(users[0].email, "owner@example.test");
  assert.equal(users[0].role, "staff");
});
