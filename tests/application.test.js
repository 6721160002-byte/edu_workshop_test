"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("isolated application: assets, login, authorization and persistence", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bsru-test-"));
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = "http://127.0.0.1:" + port;
  const child = spawn(process.execPath, ["server.js"], {
    env: {
      ...process.env,
      PORT: String(port),
      NO_BROWSER: "1",
      DB_FILE: path.join(dir, "test.sqlite"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => {
    logs += data;
  });
  child.stderr.on("data", (data) => {
    logs += data;
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  let health;
  for (let i = 0; i < 100; i++) {
    try {
      health = await fetch(base + "/api/health");
      break;
    } catch {}
    if (child.exitCode !== null) throw new Error(logs);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(health, logs);
  assert.equal((await health.json()).ok, true);
  const html = await (await fetch(base)).text();
  assert.ok(html.includes("/assets/js/app.js"));
  for (const asset of [
    "/assets/js/app.js",
    "/assets/css/app.css",
    "/assets/css/premium.css",
    ...fs
      .readdirSync("public/assets/images")
      .map((name) => "/assets/images/" + name),
  ]) {
    const response = await fetch(base + asset);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.arrayBuffer()).byteLength > 0);
  }
  assert.equal((await fetch(base + "/api/store")).status, 401);
  assert.equal((await fetch(base + "/server.js")).status, 404);
  const login = await fetch(base + "/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identity: "std_demo@bsru.ac.th",
      password: "123456",
      portal: "user",
    }),
  });
  assert.equal(login.status, 200);
  const session = await login.json();
  assert.equal(session.user.id, "student");
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const stateResponse = await fetch(base + "/api/store", { headers });
  assert.equal(stateResponse.status, 200);
  const state = await stateResponse.json();
  assert.equal(
    (
      await fetch(base + "/api/store", {
        method: "POST",
        headers,
        body: JSON.stringify(state),
      })
    ).status,
    403,
  );
  const registration = await fetch(base + "/api/enroll", {
    method: "POST",
    headers: { ...headers, "X-CSRF-Token": session.csrf },
    body: JSON.stringify({ workshopId: "w2" }),
  });
  assert.equal(registration.status, 200);
  const registrations = await (
    await fetch(base + "/api/registrations", { headers })
  ).json();
  assert.ok(
    registrations.registrations.some(
      (row) => row.workshop_id === "w2" && row.user_id === "student",
    ),
  );
  assert.equal(state.store.users.length, 1);
  assert.equal(state.store.users[0].id, "student");
  const updated = structuredClone(state);
  updated.store.revision++;
  const save = await fetch(base + "/api/store", {
    method: "POST",
    headers: { ...headers, "X-CSRF-Token": session.csrf },
    body: JSON.stringify(updated),
  });
  assert.equal(save.status, 200);
  assert.equal((await save.json()).revision, updated.store.revision);
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(dir, "test.sqlite"), {
    readOnly: true,
  });
  assert.equal(
    db.prepare("PRAGMA integrity_check").get().integrity_check,
    "ok",
  );
  assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  db.close();
});
