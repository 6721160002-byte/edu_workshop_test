"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const { once } = require("node:events");
const { PGlite } = require("@electric-sql/pglite");
const {
  createPostgresDatabase,
  parameters,
} = require("../src/database/postgres");

async function database({ legacy = false } = {}) {
  const engine = new PGlite();
  if (legacy)
    await engine.exec(
      fs
        .readFileSync("database/schema.sql", "utf8")
        .replace("PRAGMA foreign_keys = ON;", "")
        .replace("COLLATE NOCASE", "")
        .replace("hours REAL", "hours DOUBLE PRECISION"),
    );
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
  assert.equal(persisted.revision, state.store.revision + 1);
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

for (const legacy of [false, true])
  test(`login, workshops, OTP and cold start with ${legacy ? "legacy TEXT/INTEGER" : "Supabase JSONB/TIMESTAMPTZ/BOOLEAN"} schema`, async (t) => {
    process.env.SEED_DEMO = "1";
    const db = await database({ legacy });
    const sent = [];
    let rejectEmail = false;
    const app = await require("../src/app")({
      database: db,
      emailDelivery: {
        available: true,
        async send(email, code) {
          if (rejectEmail) throw Error("provider failed");
          sent.push({ email, code });
        },
      },
    });
    const server = http.createServer(app.handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      delete process.env.SEED_DEMO;
      await new Promise((resolve) => server.close(resolve));
      await db.close();
    });
    const base = "http://127.0.0.1:" + server.address().port;
    async function call(route, data, auth = {}) {
      const response = await fetch(base + "/api/" + route, {
        method: data === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", Origin: base, ...auth },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get("set-cookie"),
      };
    }
    async function login(identity, portal = "user", password = "123456") {
      const response = await call("login", { identity, portal, password });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      return {
        Cookie: response.cookie.split(";")[0],
        "X-CSRF-Token": response.body.csrf,
      };
    }
    const admin = await login("admin1@bsru.ac.th", "staff");
    const initial = (await call("store", undefined, admin)).body.store;
    initial.workshops.sort((a, b) =>
      a.id === "w1" ? -1 : b.id === "w1" ? 1 : 0,
    );
    assert.equal(
      typeof (
        await db.prepare("SELECT data_json FROM app_state WHERE id=1").get()
      ).data_json,
      legacy ? "string" : "object",
    );
    initial.workshops[0].cover = "/assets/images/image-002.jpg";
    initial.workshops[0].start = "2099-12-01T09:00";
    initial.workshops[0].end = "2099-12-01T16:00";
    initial.workshops[0].closed = true;
    initial.revision++;
    let saved = await call("store", { store: initial }, admin);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const workshop = await db
      .prepare("SELECT closed,start_at FROM workshops WHERE id=?")
      .get(initial.workshops[0].id);
    assert.equal(Boolean(workshop.closed), true);
    assert.equal(
      new Date(workshop.start_at).toISOString(),
      "2099-12-01T02:00:00.000Z",
    );
    const invalid = structuredClone(saved.body.store);
    invalid.revision++;
    invalid.workshops[0].start = "not-a-date";
    assert.equal((await call("store", { store: invalid }, admin)).status, 400);
    const student = await login("std_demo@bsru.ac.th");
    assert.equal(
      (await call("session", undefined, student)).body.user.id,
      "student",
    );
    // TIMESTAMPTZ sessions and JSONB documents must survive a cold start.
    await require("../src/app")({ database: db });
    assert.equal((await call("store", undefined, student)).status, 200);
    const draft = {
      name: "New Member",
      type: "นักศึกษา",
      code: "NEW001",
      email: "new001@bsru.ac.th",
      phone: "0800000099",
      password: "SecureNewPassword123!",
    };
    const request = await call("registration/request", draft);
    assert.equal(request.status, 200, JSON.stringify(request.body));
    assert.equal(request.body.code, undefined, "never return the OTP");
    assert.equal(
      await db.prepare("SELECT id FROM users WHERE email=?").get(draft.email),
      undefined,
    );
    const flow = { flowId: request.body.flowId, token: request.body.token };
    assert.equal(
      (await call("registration/status", flow)).status,
      200,
      "reload resumes verification",
    );
    assert.equal(
      (await call("registration/status", { ...flow, token: "forged" })).status,
      410,
    );
    assert.equal(
      (await call("registration/verify", { ...flow, code: "invalid" })).status,
      400,
    );
    assert.equal(
      (await call("registration/resend", flow)).status,
      429,
      "server enforces cooldown",
    );
    const codes = () =>
      db
        .prepare(
          "SELECT * FROM otp_challenges WHERE purpose='email-registration-code' ORDER BY created_at DESC",
        )
        .all();
    async function ageLatest() {
      const row = (await codes())[0];
      await db
        .prepare("UPDATE otp_challenges SET created_at=? WHERE id=?")
        .run(new Date(Date.now() - 61000).toISOString(), row.id);
    }
    const oldCode = sent.at(-1).code;
    await ageLatest();
    assert.equal(
      (
        await call("registration/email", {
          ...flow,
          email: "new002@bsru.ac.th",
        })
      ).status,
      200,
    );
    assert.equal(sent.at(-1).email, "new002@bsru.ac.th");
    const revoked = (await codes()).find((r) => r.contact === draft.email);
    assert.ok(revoked.consumed_at, "editing email revokes original code");
    assert.equal(
      (await call("registration/verify", { ...flow, code: oldCode })).status,
      400,
    );
    const current = (await codes())[0];
    await db
      .prepare("UPDATE otp_challenges SET expires_at=? WHERE id=?")
      .run("2000-01-01T00:00:00.000Z", current.id);
    assert.equal(
      (await call("registration/verify", { ...flow, code: sent.at(-1).code }))
        .status,
      410,
      "expired code rejected",
    );
    await ageLatest();
    assert.equal((await call("registration/resend", flow)).status, 200);
    assert.equal((await call("registration/resend", flow)).status, 429);
    await ageLatest();
    assert.equal(
      (await call("registration/resend", flow)).status,
      429,
      "server enforces the 15-minute send quota after cooldown",
    );
    const emailVerified = await call("registration/verify", {
      ...flow,
      code: sent.at(-1).code,
    });
    assert.equal(emailVerified.status, 200, JSON.stringify(emailVerified.body));
    assert.equal(emailVerified.body.user.status, "APPROVED");
    assert.equal(emailVerified.body.user.role, "user");
    const newSession = {
      Cookie: emailVerified.cookie.split(";")[0],
      "X-CSRF-Token": emailVerified.body.csrf,
    };
    assert.equal(
      (await call("store", undefined, newSession)).status,
      200,
      "emailVerified member enters immediately",
    );
    assert.equal(
      (await call("registration/verify", { ...flow, code: sent.at(-1).code }))
        .status,
      410,
      "one use",
    );
    assert.equal(
      (
        await call("registration/request", {
          ...draft,
          email: "new002@bsru.ac.th",
        })
      ).status,
      409,
    );
    const pending = await call("registration/request", {
      ...draft,
      email: "pending@bsru.ac.th",
      code: "PENDING001",
      phone: "0800000088",
    });
    assert.equal(pending.status, 200);
    await ageLatest();
    const resumed = await call("registration/request", {
      email: "pending@bsru.ac.th",
      password: draft.password,
    });
    assert.equal(
      resumed.status,
      200,
      "existing pending email can continue without duplicate account",
    );
    for (let i = 0; i < 5; i++)
      assert.equal(
        (
          await call("registration/verify", {
            flowId: resumed.body.flowId,
            token: resumed.body.token,
            code: "wrong",
          })
        ).status,
        400,
      );
    assert.equal(
      (
        await call("registration/verify", {
          flowId: resumed.body.flowId,
          token: resumed.body.token,
          code: sent.at(-1).code,
        })
      ).status,
      429,
      "attempt limit",
    );
    await ageLatest();
    rejectEmail = true;
    assert.equal(
      (
        await call("registration/resend", {
          flowId: resumed.body.flowId,
          token: resumed.body.token,
        })
      ).status,
      502,
      "provider failure is not a success",
    );
    rejectEmail = false;
    const staffOtp = await call("otp/request", {
      purpose: "reset",
      channel: "email",
      contact: "admin1@bsru.ac.th",
      portal: "auto",
    });
    assert.equal(staffOtp.status, 200, JSON.stringify(staffOtp.body));
    const otp = await call("otp/request", {
      purpose: "reset",
      channel: "email",
      contact: "STD_DEMO@BSRU.AC.TH",
      portal: "auto",
    });
    assert.equal(otp.status, 200, JSON.stringify(otp.body));
    const verified = await call("otp/verify", {
      challengeId: otp.body.challengeId,
      code: otp.body.code,
    });
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    assert.equal(
      (
        await call("otp/verify", {
          challengeId: otp.body.challengeId,
          code: otp.body.code,
        })
      ).status,
      410,
    );
    const change = {
      grant: verified.body.grant,
      password: "NewSecurePassword123!",
      confirmation: "NewSecurePassword123!",
    };
    assert.equal((await call("password/reset", change)).status, 200);
    assert.equal((await call("password/reset", change)).status, 410);
    assert.equal((await call("store", undefined, student)).status, 401);
    const logged = await login("std_demo@bsru.ac.th", "user", change.password);
    await db
      .prepare("UPDATE sessions SET expires_at=? WHERE user_id=?")
      .run("2000-01-01T00:00:00.000Z", "student");
    assert.equal((await call("session", undefined, logged)).body.user, null);
    const nextLogin = await login(
      "std_demo@bsru.ac.th",
      "user",
      change.password,
    );
    await db
      .prepare("UPDATE users SET status='REJECTED' WHERE id=?")
      .run("student");
    assert.equal((await call("store", undefined, nextLogin)).status, 401);
    // Default documents inserted manually are rebuilt without dropping accounts.
    await db.prepare("UPDATE app_state SET data_json=? WHERE id=1").run("{}");
    await require("../src/app")({ database: db });
    const rebuilt = (await call("store", undefined, admin)).body.store;
    assert.equal(rebuilt.users.length, 4);
    assert.equal(rebuilt.workshops.length, 5);
    assert.equal(
      rebuilt.workshops.find((w) => w.id === initial.workshops[0].id).start,
      "2099-12-01T09:00",
    );
  });

test("bootstrap administrator works with existing members and public table reads are denied by RLS", async (t) => {
  delete process.env.SEED_DEMO;
  process.env.BOOTSTRAP_ADMIN_EMAIL = "new-admin@example.test";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "BootstrapTestPassword123!";
  const db = await database();
  t.after(async () => {
    delete process.env.BOOTSTRAP_ADMIN_EMAIL;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    await db.close();
  });
  const password = require("../src/utils").passwordRecord(
    "MemberTestPassword123!",
  );
  await db
    .prepare(
      `INSERT INTO users(id,name,type,code,email,phone,faculty,major,status,role,password_salt,password_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      "existing",
      "Existing member",
      "นักศึกษา",
      "EXIST-01",
      "member@example.test",
      "0811111111",
      "Science",
      "Computing",
      "APPROVED",
      "user",
      password.salt,
      password.hash,
      new Date().toISOString(),
    );
  await require("../src/app")({ database: db });
  assert.equal(
    Number((await db.prepare("SELECT count(*) n FROM users").get()).n),
    2,
  );
  assert.equal(
    (await db.prepare("SELECT email FROM users WHERE role='staff'").get())
      .email,
    "new-admin@example.test",
  );
  await db.exec("CREATE ROLE bsru_reader");
  await db
    .prepare(
      "INSERT INTO firebase_identities(firebase_uid,user_id) VALUES(?,?)",
    )
    .run("private-firebase-uid", "existing");
  await db.exec(
    "GRANT SELECT ON users, sessions, app_state, firebase_identities TO bsru_reader",
  );
  await db.exec("SET ROLE bsru_reader");
  try {
    for (const table of [
      "users",
      "sessions",
      "app_state",
      "firebase_identities",
    ])
      assert.deepEqual(await db.prepare("SELECT * FROM " + table).all(), []);
  } finally {
    await db.exec("RESET ROLE");
  }
});
