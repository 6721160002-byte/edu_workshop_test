"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const database = require("./helpers/test-database");
const { verifyPassword } = require("../src/utils");

async function start(t, kind, available = true, options = {}) {
  const db = await database(kind);
  const previous = {
    seed: process.env.SEED_DEMO,
    environment: process.env.NODE_ENV,
  };
  process.env.SEED_DEMO = "1";
  process.env.NODE_ENV = "production";
  const sent = [];
  let failSend = false;
  const app = await require("../src/app")({
    database: db,
    registrationProvider: "password",
    storePlaintextPasswords: false,
    ...options,
    emailDelivery: {
      available,
      async send(to, code, options) {
        if (failSend) throw Error("private SMTP authentication details");
        sent.push({ to, code, options });
      },
    },
  });
  const server = http.createServer(app.handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await app.close();
    for (const [name, value] of [
      ["SEED_DEMO", previous.seed],
      ["NODE_ENV", previous.environment],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
  const base = "http://127.0.0.1:" + server.address().port;
  async function call(path, body, headers = {}) {
    const response = await fetch(base + "/api/" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Origin: base, ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return {
      status: response.status,
      body: await response.json(),
      cookie: response.headers.get("set-cookie"),
    };
  }
  const login = (email = "std_demo@bsru.ac.th", password = "123456") =>
    call("login", { identity: email, password });
  const request = (email = "std_demo@bsru.ac.th") =>
    call("otp/request", {
      purpose: "reset",
      channel: "email",
      contact: email,
      portal: "auto",
    });
  const verify = (response, code = sent.at(-1)?.code) =>
    call("otp/verify", { challengeId: response.body.challengeId, code });
  const change = (grant, password = "NewPasswordSecure123!") =>
    call("password/reset", { grant, password, confirmation: password });
  const age = () =>
    db
      .prepare(
        "UPDATE otp_challenges SET created_at=? WHERE purpose='password-reset'",
      )
      .run(new Date(Date.now() - 61000).toISOString());
  return {
    db,
    call,
    sent,
    login,
    request,
    verify,
    change,
    age,
    set failSend(value) {
      failSend = value;
    },
  };
}
function headers(session) {
  return {
    Cookie: session.cookie.split(";")[0],
    "X-CSRF-Token": session.body.csrf,
  };
}
const applicant = {
  name: "Normal Member",
  type: "เจ้าหน้าที่",
  code: "NORMAL-01",
  phone: "0892223344",
  email: "normal@bsru.ac.th",
  password: "SecurePassword123!",
  role: "staff",
  status: "APPROVED",
};

for (const kind of ["sqlite", "postgres"]) {
  test(`${kind}: opted-in readable passwords stay database-only and follow successful password changes`, async (t) => {
    const app = await start(t, kind, true, { storePlaintextPasswords: true });
    assert.equal(
      Number(
        (await app.db.prepare("SELECT count(*) n FROM user_passwords").get()).n,
      ),
      0,
    );
    await app.login();
    assert.equal(
      Number(
        (await app.db.prepare("SELECT count(*) n FROM user_passwords").get()).n,
      ),
      0,
      "login never captures existing users' passwords",
    );
    assert.equal(
      (await app.call("registration/request", applicant)).status,
      200,
    );
    const stored = await app.db
      .prepare(
        "SELECT p.* FROM user_passwords p JOIN users u ON u.id=p.user_id WHERE u.email=?",
      )
      .get(applicant.email);
    assert.equal(stored.password_plaintext, applicant.password);
    const member = await app.login(applicant.email, applicant.password);
    const admin = await app.login("admin1@bsru.ac.th");
    for (const session of [member, admin]) {
      for (const endpoint of ["session", "store"]) {
        const response = await app.call(endpoint, undefined, headers(session));
        assert.equal(response.status, 200);
        assert.ok(!JSON.stringify(response.body).includes(applicant.password));
        assert.ok(
          !JSON.stringify(response.body).includes("password_plaintext"),
        );
        assert.ok(!JSON.stringify(response.body).includes("user_passwords"));
      }
      assert.ok(!JSON.stringify(session.body).includes(applicant.password));
      assert.equal(
        (await app.call("user_passwords", undefined, headers(session))).status,
        404,
      );
    }
    const snapshot = await app.db
      .prepare("SELECT data_json FROM app_state WHERE id=1")
      .get();
    assert.ok(!JSON.stringify(snapshot).includes(applicant.password));
    const request = await app.request(applicant.email);
    const proof = await app.verify(request);
    assert.equal((await app.change(proof.body.grant, "bad")).status, 400);
    assert.equal(
      (
        await app.db
          .prepare(
            "SELECT password_plaintext FROM user_passwords WHERE user_id=?",
          )
          .get(stored.user_id)
      ).password_plaintext,
      applicant.password,
    );
    assert.equal((await app.change(proof.body.grant)).status, 200);
    assert.equal(
      (await app.change(proof.body.grant, "AnotherSecurePassword123!")).status,
      410,
    );
    assert.equal(
      (
        await app.db
          .prepare(
            "SELECT password_plaintext FROM user_passwords WHERE user_id=?",
          )
          .get(stored.user_id)
      ).password_plaintext,
      "NewPasswordSecure123!",
    );
    assert.equal(
      (await app.login(applicant.email, applicant.password)).status,
      401,
    );
    assert.equal(
      (await app.login(applicant.email, "NewPasswordSecure123!")).status,
      200,
    );
    if (kind === "postgres") {
      await app.db.withRequest(async () => {
        await app.db.exec(
          "CREATE ROLE password_reader; GRANT USAGE ON SCHEMA public TO password_reader; GRANT SELECT ON user_passwords TO password_reader; SET ROLE password_reader;",
        );
        try {
          assert.deepEqual(
            await app.db.prepare("SELECT * FROM user_passwords").all(),
            [],
            "RLS blocks a browser role even with SELECT privileges",
          );
        } finally {
          await app.db.exec("RESET ROLE");
        }
      });
    }
  });

  test(`${kind}: readable storage disabled records nothing and removes stale copies on reset`, async (t) => {
    const app = await start(t, kind);
    assert.equal(
      (await app.call("registration/request", applicant)).status,
      200,
    );
    assert.equal(
      Number(
        (await app.db.prepare("SELECT count(*) n FROM user_passwords").get()).n,
      ),
      0,
    );
    await app.db
      .prepare(
        "INSERT INTO user_passwords(user_id,password_plaintext,updated_at) VALUES(?,?,?)",
      )
      .run("student", "123456", new Date().toISOString());
    const request = await app.request();
    const proof = await app.verify(request);
    assert.equal((await app.change(proof.body.grant)).status, 200);
    assert.equal(
      Number(
        (await app.db.prepare("SELECT count(*) n FROM user_passwords").get()).n,
      ),
      0,
    );
    assert.equal(
      (await app.login("std_demo@bsru.ac.th", "NewPasswordSecure123!")).status,
      200,
    );
  });

  test(`${kind}: immediate signup, login and logout work without a mail service`, async (t) => {
    const app = await start(t, kind, false);
    const settings = (await app.call("session")).body;
    assert.equal(settings.registrationAvailable, true);
    assert.equal(settings.registrationProvider, "password");
    assert.equal(settings.passwordResetAvailable, false);
    assert.equal(settings.otpAvailable, false);
    const registered = await app.call("registration/request", applicant);
    assert.equal(registered.status, 200, JSON.stringify(registered));
    assert.equal(registered.body.registered, true);
    assert.equal(registered.cookie, null, "signup does not fabricate a login");
    assert.equal(app.sent.length, 0, "no OTP is needed to register");
    const row = await app.db
      .prepare("SELECT * FROM users WHERE email=?")
      .get(applicant.email);
    assert.equal(row.status, "APPROVED");
    assert.equal(row.role, "user", "staff type is not staff authorization");
    assert.ok(
      verifyPassword(applicant.password, row.password_salt, row.password_hash),
    );
    assert.ok(!JSON.stringify(row).includes(applicant.password));
    const session = await app.login(applicant.email, applicant.password);
    assert.equal(session.status, 200);
    assert.ok(session.cookie.includes("HttpOnly"));
    assert.ok(session.cookie.includes("Secure"));
    assert.equal(
      (await app.call("store", undefined, headers(session))).status,
      200,
    );
    assert.equal((await app.call("logout", {}, headers(session))).status, 200);
    assert.equal(
      (await app.call("store", undefined, headers(session))).status,
      401,
    );
    assert.equal(
      (await app.call("registration/request", applicant)).status,
      409,
    );
    assert.equal((await app.request()).status, 503);
    assert.equal(
      (
        await app.call("registration/request", {
          ...applicant,
          email: "bad@gmail.com",
        })
      ).status,
      400,
    );
  });

  test(`${kind}: real-mail OTP resets passwords, prevents replay, and revokes every old session`, async (t) => {
    const app = await start(t, kind);
    const first = await app.login(),
      second = await app.login();
    const requested = await app.request("STD_DEMO@BSRU.AC.TH");
    assert.equal(requested.status, 200, JSON.stringify(requested));
    assert.equal(
      requested.body.code,
      undefined,
      "production and development never expose the OTP",
    );
    assert.equal(requested.body.delivery, undefined);
    assert.equal(app.sent.at(-1).to, "std_demo@bsru.ac.th");
    assert.equal(app.sent.at(-1).options.purpose, "reset");
    const challenge = await app.db
      .prepare("SELECT * FROM otp_challenges WHERE id=?")
      .get(requested.body.challengeId);
    assert.ok(!JSON.stringify(challenge).includes(app.sent.at(-1).code));
    assert.equal((await app.verify(requested, "bad-code")).status, 400);
    const verified = await app.verify(requested);
    assert.equal(verified.status, 200);
    assert.equal((await app.verify(requested)).status, 410);
    const invalidPassword = await app.call("password/reset", {
      grant: verified.body.grant,
      password: "short",
      confirmation: "short",
    });
    assert.equal(invalidPassword.status, 400);
    const reset = await app.change(verified.body.grant);
    assert.equal(reset.status, 200, JSON.stringify(reset));
    assert.ok(reset.cookie.includes("Max-Age=0"));
    assert.equal((await app.change(verified.body.grant)).status, 410);
    for (const session of [first, second])
      assert.equal(
        (await app.call("store", undefined, headers(session))).status,
        401,
      );
    assert.equal((await app.login()).status, 401);
    assert.equal(
      (await app.login("std_demo@bsru.ac.th", "NewPasswordSecure123!")).status,
      200,
    );
    assert.equal(
      (
        await app.call("password/reset", {
          grant: "forged",
          password: "OtherSecurePassword123!",
          confirmation: "OtherSecurePassword123!",
        })
      ).status,
      410,
    );
  });

  test(`${kind}: resend revokes old codes and grants; cooldown and mail failure persist`, async (t) => {
    const app = await start(t, kind);
    const first = await app.request(),
      oldCode = app.sent.at(-1).code;
    assert.equal((await app.request()).status, 429);
    await app.age();
    const second = await app.request();
    assert.equal(second.status, 200);
    assert.equal((await app.verify(first, oldCode)).status, 410);
    const grant = await app.verify(second);
    assert.equal(grant.status, 200);
    await app.age();
    app.failSend = true;
    const failed = await app.request();
    assert.equal(failed.status, 502);
    assert.equal(failed.body.code, "OTP_SEND_FAILED");
    assert.ok(!JSON.stringify(failed).includes("private SMTP"));
    assert.equal(
      (await app.change(grant.body.grant)).status,
      410,
      "new requests revoke old password grants",
    );
    const row = await app.db
      .prepare(
        "SELECT * FROM otp_challenges WHERE purpose='password-reset' ORDER BY created_at DESC",
      )
      .get();
    assert.ok(row.consumed_at);
    assert.equal(
      (await app.verify({ body: { challengeId: row.id } }, "123456")).status,
      410,
    );
    await app.age();
    assert.equal(
      (await app.request()).status,
      429,
      "failed sends still consume the three-per-window quota",
    );
  });

  test(`${kind}: OTP attempt limits, expiration, and unknown emails never grant account access`, async (t) => {
    const app = await start(t, kind);
    const requested = await app.request();
    const code = app.sent.at(-1).code;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++)
      assert.equal((await app.verify(requested, wrong)).status, 400);
    assert.equal((await app.verify(requested, code)).status, 410);
    await app.age();
    const next = await app.request();
    await app.db
      .prepare("UPDATE otp_challenges SET expires_at=? WHERE id=?")
      .run("2000-01-01T00:00:00.000Z", next.body.challengeId);
    assert.equal((await app.verify(next)).status, 410);
    const unknown = await app.request("unknown@bsru.ac.th");
    assert.equal(unknown.status, 200);
    assert.equal(unknown.body.message, requested.body.message);
    assert.equal(app.sent.length, 2, "unknown accounts are not mailed");
    assert.equal((await app.verify(unknown, "123456")).status, 400);
    assert.equal(
      (
        await app.call("otp/request", {
          contact: "0892223344",
          channel: "phone",
          purpose: "reset",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await app.call("otp/request", {
          contact: "invalid",
          channel: "email",
          purpose: "reset",
        })
      ).status,
      400,
    );
  });

  test(`${kind}: concurrent grants are single-use; reset preserves profile status and migrates legacy Firebase binding`, async (t) => {
    const app = await start(t, kind);
    await app.db
      .prepare(
        "INSERT INTO firebase_identities(firebase_uid,user_id) VALUES(?,?)",
      )
      .run("previous-firebase", "student");
    const before = Number(
      (
        await app.db
          .prepare(
            "SELECT count(*) n FROM registrations WHERE user_id='student'",
          )
          .get()
      ).n,
    );
    const requested = await app.request();
    const verifications = await Promise.all([
      app.verify(requested),
      app.verify(requested),
    ]);
    assert.deepEqual(verifications.map((row) => row.status).sort(), [200, 410]);
    const grant = verifications.find((row) => row.status === 200).body.grant;
    const resets = await Promise.all([app.change(grant), app.change(grant)]);
    assert.deepEqual(resets.map((row) => row.status).sort(), [200, 410]);
    assert.equal(
      await app.db
        .prepare("SELECT * FROM firebase_identities WHERE user_id='student'")
        .get(),
      undefined,
    );
    assert.equal(
      Number(
        (
          await app.db
            .prepare(
              "SELECT count(*) n FROM registrations WHERE user_id='student'",
            )
            .get()
        ).n,
      ),
      before,
    );
    assert.equal(
      (await app.login("std_demo@bsru.ac.th", "NewPasswordSecure123!")).status,
      200,
    );
    await app.db
      .prepare("UPDATE users SET status='WAITING' WHERE id='student'")
      .run();
    await app.age();
    const pending = await app.request(),
      proof = await app.verify(pending);
    await app.db
      .prepare(
        "UPDATE password_reset_grants SET expires_at=? WHERE token_hash=?",
      )
      .run(
        "2000-01-01T00:00:00.000Z",
        require("../src/utils").hashToken(proof.body.grant),
      );
    assert.equal((await app.change(proof.body.grant)).status, 410);
    assert.equal(
      (
        await app.db
          .prepare("SELECT status FROM users WHERE id='student'")
          .get()
      ).status,
      "WAITING",
    );
  });
}
