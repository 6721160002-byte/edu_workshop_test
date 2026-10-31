"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");

const database = require("./helpers/test-database");
function provider() {
  const accounts = new Map();
  const sent = [],
    resets = [];
  let failSend = false;
  return {
    available: true,
    accounts,
    sent,
    resets,
    set failSend(value) {
      failSend = value;
    },
    async createOrSignIn(email, password) {
      if (!accounts.has(email))
        accounts.set(email, {
          uid: "firebase-" + accounts.size,
          email,
          password,
          verified: false,
          idToken: "server-only-token",
        });
      return this.signIn(email, password);
    },
    async signIn(email, password) {
      const account = accounts.get(email);
      if (!account || account.password !== password)
        throw Object.assign(Error("Wrong credentials"), { status: 401 });
      return { ...account };
    },
    async sendVerification(token) {
      if (failSend)
        throw Object.assign(Error("Provider unavailable"), { status: 502 });
      sent.push(token);
    },
    async sendPasswordReset(email) {
      resets.push(email);
    },
  };
}
const member = (email = "newmember@bsru.ac.th") => ({
  name: "Test Member",
  type: "เจ้าหน้าที่",
  role: "staff",
  code: "NEW-MEMBER",
  phone: "0891122334",
  email,
  password: "StrongPassword123!",
});
async function start(t, kind, firebase) {
  const db = await database(kind);
  const oldSeed = process.env.SEED_DEMO;
  process.env.SEED_DEMO = "1";
  let app;
  try {
    app = await require("../src/app")({
      database: db,
      registrationProvider: "firebase",
      firebaseAuth: firebase,
    });
  } finally {
    if (oldSeed === undefined) delete process.env.SEED_DEMO;
    else process.env.SEED_DEMO = oldSeed;
  }
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
  });
  const base = "http://127.0.0.1:" + server.address().port;
  const post = async (endpoint, body) => {
    const response = await fetch(base + endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: base },
      body: JSON.stringify(body),
    });
    return {
      status: response.status,
      cookie: response.headers.get("set-cookie"),
      data: await response.json(),
    };
  };
  const ageRate = () =>
    db
      .prepare(
        "UPDATE otp_challenges SET created_at=? WHERE purpose LIKE 'firebase-rate-%'",
      )
      .run(new Date(Date.now() - 61000).toISOString());
  return { db, base, post, ageRate };
}

for (const kind of ["sqlite", "postgres"]) {
  test(`Firebase ${kind}: registration, verification, sessions, legacy login and reset`, async (t) => {
    const firebase = provider();
    const { db, base, post, ageRate } = await start(t, kind, firebase);
    const settings = await (await fetch(base + "/api/session")).json();
    assert.equal(settings.registrationProvider, "firebase");
    assert.equal(settings.registrationAvailable, true);
    assert.equal(settings.passwordResetAvailable, true);
    const data = member();
    const request = await post("/api/registration/request", data);
    assert.equal(request.status, 200, JSON.stringify(request));
    assert.equal(request.data.sent, true);
    assert.equal(request.cookie, null);
    assert.equal(JSON.stringify(request).includes("server-only-token"), false);
    assert.equal(
      await db.prepare("SELECT id FROM users WHERE email=?").get(data.email),
      undefined,
    );
    const pending = await db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='firebase-registration'",
      )
      .get();
    assert.ok(!JSON.stringify(pending.payload_json).includes(data.password));
    assert.ok(
      !JSON.stringify(pending.payload_json).includes("server-only-token"),
    );
    const login = () =>
      post("/api/login", {
        identity: data.email,
        password: data.password,
        emailVerified: true,
        role: "staff",
      });
    assert.equal(
      (
        await post("/api/login", {
          identity: data.email,
          password: "incorrect",
        })
      ).status,
      401,
    );
    const unverified = await login();
    assert.equal(unverified.status, 403);
    assert.equal(unverified.data.code, "FIREBASE_EMAIL_UNVERIFIED");
    assert.equal(unverified.cookie, null);
    assert.equal(
      (
        await post("/api/registration/verify", {
          email: data.email,
          code: "123456",
          emailVerified: true,
        })
      ).status,
      404,
    );
    firebase.accounts.get(data.email).verified = true;
    const [first, second] = await Promise.all([login(), login()]);
    assert.equal(first.status, 200, JSON.stringify(first));
    assert.equal(second.status, 200, JSON.stringify(second));
    assert.ok(first.cookie.includes("HttpOnly"));
    assert.equal(first.data.user.status, "APPROVED");
    assert.equal(
      first.data.user.role,
      "user",
      "selecting staff type must not grant staff access",
    );
    assert.equal(
      Number(
        (await db.prepare("SELECT count(*) n FROM firebase_identities").get())
          .n,
      ),
      1,
    );
    const store = await (
      await fetch(base + "/api/store", {
        headers: { Cookie: first.cookie.split(";")[0] },
      })
    ).json();
    assert.equal(store.store.users.length, 1);
    assert.equal(store.store.users[0].id, first.data.user.id);
    assert.equal(
      (
        await post("/api/login", {
          identity: data.phone,
          password: data.password,
        })
      ).status,
      200,
    );
    assert.equal((await post("/api/registration/request", data)).status, 409);
    const localLogin = await post("/api/login", {
      identity: "std_demo@bsru.ac.th",
      password: "123456",
    });
    assert.equal(localLogin.status, 200);
    const reset = await post("/api/firebase/password-reset", {
      email: data.email,
    });
    assert.equal(reset.status, 200);
    assert.deepEqual(firebase.resets, [data.email]);
    assert.equal(
      (
        await post("/api/firebase/password-reset", {
          email: "std_demo@bsru.ac.th",
        })
      ).data.message,
      reset.data.message,
    );
    assert.equal(
      firebase.resets.length,
      1,
      "legacy passwords must not be reset through Firebase",
    );
    assert.equal(
      (await post("/api/firebase/password-reset", { email: data.email }))
        .status,
      429,
    );
    await ageRate();
    firebase.accounts.get(data.email).uid = "different-firebase-account";
    assert.equal(
      (await login()).status,
      401,
      "Firebase identity binding cannot be replaced",
    );
  });

  test(`Firebase ${kind}: failed sends retain drafts and cooldown; expired profiles cannot activate`, async (t) => {
    const firebase = provider();
    const { db, post, ageRate } = await start(t, kind, firebase);
    firebase.failSend = true;
    const data = member();
    assert.equal((await post("/api/registration/request", data)).status, 502);
    assert.ok(
      await db
        .prepare(
          "SELECT id FROM otp_challenges WHERE purpose='firebase-registration'",
        )
        .get(),
    );
    assert.equal((await post("/api/firebase/resend", data)).status, 429);
    await ageRate();
    firebase.failSend = false;
    assert.equal((await post("/api/firebase/resend", data)).status, 200);
    assert.equal(firebase.sent.length, 1);
    await db
      .prepare(
        "UPDATE otp_challenges SET expires_at=? WHERE purpose='firebase-registration'",
      )
      .run(new Date(Date.now() - 1000).toISOString());
    firebase.accounts.get(data.email).verified = true;
    const login = await post("/api/login", {
      identity: data.email,
      password: data.password,
    });
    assert.equal(login.status, 410);
    assert.equal(login.cookie, null);
    assert.equal(
      await db.prepare("SELECT id FROM users WHERE email=?").get(data.email),
      undefined,
    );
    await ageRate();
    const again = await post("/api/registration/request", data);
    assert.equal(again.status, 200);
    assert.equal(again.data.verified, true);
    assert.equal(
      (
        await post("/api/login", {
          identity: data.email,
          password: data.password,
        })
      ).status,
      200,
    );
  });

  test(`Firebase ${kind}: missing configuration and conflicting identifiers fail closed`, async (t) => {
    const firebase = provider();
    firebase.available = false;
    const { db, post, base } = await start(t, kind, firebase);
    assert.equal(
      (await (await fetch(base + "/api/session")).json()).registrationAvailable,
      false,
    );
    assert.equal(
      (await post("/api/registration/request", member())).status,
      503,
    );
    firebase.available = true;
    const data = member();
    assert.equal(
      (
        await post("/api/registration/request", {
          ...data,
          email: "member@gmail.com",
        })
      ).status,
      400,
    );
    assert.equal((await post("/api/registration/request", data)).status, 200);
    await db
      .prepare("UPDATE users SET code=? WHERE id='student'")
      .run(data.code);
    firebase.accounts.get(data.email).verified = true;
    const login = await post("/api/login", {
      identity: data.email,
      password: data.password,
    });
    assert.equal(login.status, 409);
    assert.equal(
      Number(
        (await db.prepare("SELECT count(*) n FROM firebase_identities").get())
          .n,
      ),
      0,
    );
    assert.equal(
      await db.prepare("SELECT id FROM users WHERE email=?").get(data.email),
      undefined,
    );
  });
}
