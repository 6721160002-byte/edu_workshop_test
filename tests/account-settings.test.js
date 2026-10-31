"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");

for (const kind of ["sqlite", "postgres"])
  test(`${kind}: account settings preserve identity and permissions`, async (t) => {
    const previous = process.env.SEED_DEMO;
    process.env.SEED_DEMO = "1";
    t.after(() => {
      if (previous === undefined) delete process.env.SEED_DEMO;
      else process.env.SEED_DEMO = previous;
    });
    const db = await database(kind);
    const app = await require("../src/app")({
      database: db,
      registrationProvider: "password",
      storePlaintextPasswords: false,
      emailDelivery: { available: false },
    });
    const server = http.createServer(app.handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    t.after(async () => {
      await new Promise((resolve) => server.close(resolve));
      await app.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    async function call(route, body, headers = {}) {
      const response = await fetch(base + route, {
        method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: await response.json(), response };
    }
    const change = { name: "Updated Member", phone: "0891234567" };
    assert.equal((await call("/api/account", change)).status, 401);
    for (const [id, email, name, phone] of [
      ["student", "std_demo@bsru.ac.th", "Updated Member", "0891234567"],
      ["admin", "admin1@bsru.ac.th", "Updated Administrator", "0891234568"],
    ]) {
      const login = await call("/api/login", {
        identity: email,
        password: "123456",
      });
      assert.equal(login.status, 200);
      const cookie = login.response.headers.get("set-cookie").split(";")[0];
      const headers = { Cookie: cookie, "X-CSRF-Token": login.body.csrf };
      const old = await db.prepare("SELECT * FROM users WHERE id=?").get(id);
      const others = await db
        .prepare("SELECT * FROM users WHERE id<>? ORDER BY id")
        .all(id);
      assert.equal(
        (await call("/api/account", change, { Cookie: cookie })).status,
        403,
      );
      assert.equal(
        (await call("/api/account", { ...change, role: "staff" }, headers))
          .status,
        400,
      );
      assert.equal(
        (await call("/api/account", { name: " ", phone }, headers)).status,
        400,
      );
      assert.equal(
        (await call("/api/account", { name, phone: "invalid" }, headers))
          .status,
        400,
      );
      assert.equal(
        (await call("/api/account", { name, phone: "0899990002" }, headers))
          .status,
        409,
      );
      assert.deepEqual(
        await db.prepare("SELECT * FROM users WHERE id=?").get(id),
        old,
      );
      const saved = await call(
        "/api/account",
        { name: ` ${name} `, phone },
        headers,
      );
      assert.equal(saved.status, 200);
      assert.equal(saved.body.user.name, name);
      assert.equal(saved.body.user.phone, phone);
      assert.equal(saved.body.user.email, old.email);
      assert.equal(saved.body.user.role, old.role);
      assert.equal(saved.body.user.password_hash, undefined);
      assert.deepEqual(
        { ...(await db.prepare("SELECT * FROM users WHERE id=?").get(id)) },
        { ...old, name, phone },
      );
      assert.deepEqual(
        await db.prepare("SELECT * FROM users WHERE id<>? ORDER BY id").all(id),
        others,
      );
      const latest = await call("/api/store", undefined, headers);
      assert.equal(
        latest.body.store.users.find((user) => user.id === id).name,
        name,
      );
      const session = await call("/api/session", undefined, headers);
      assert.equal(session.body.user.name, name);
      const relogin = await call("/api/login", {
        identity: phone,
        password: "123456",
      });
      assert.equal(relogin.status, 200);
      assert.equal(relogin.body.user.id, id);
    }
  });
