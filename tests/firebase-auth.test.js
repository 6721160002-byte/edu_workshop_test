"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const makeAuth = require("../src/firebase-auth");

test("Firebase REST uses the configured project, checks account state and keeps tokens server-side", async () => {
  const calls = [];
  const auth = makeAuth({
    apiKey: "project-key",
    continueUrl: "https://workshop.example.test/",
    request: async (url, options) => {
      const method = new URL(url).pathname.split(":")[1];
      assert.equal(new URL(url).searchParams.get("key"), "project-key");
      const body = JSON.parse(options.body);
      calls.push({ method, body });
      assert.equal(options.headers["X-Firebase-Locale"], "th");
      const result =
        method === "lookup"
          ? {
              users: [
                {
                  localId: "firebase-user",
                  email: "MEMBER@bsru.ac.th",
                  emailVerified: true,
                },
              ],
            }
          : { localId: "firebase-user", idToken: "request-only-token" };
      return { ok: true, json: async () => result };
    },
  });
  const account = await auth.createOrSignIn(
    "member@bsru.ac.th",
    "TestPassword123!",
  );
  assert.equal(account.verified, true);
  assert.equal(account.email, "member@bsru.ac.th");
  assert.equal(calls[1].method, "lookup");
  await auth.sendVerification(account.idToken);
  assert.deepEqual(calls.at(-1).body, {
    requestType: "VERIFY_EMAIL",
    idToken: "request-only-token",
    continueUrl: "https://workshop.example.test/",
  });
  await auth.sendPasswordReset(account.email);
  assert.equal(calls.at(-1).body.requestType, "PASSWORD_RESET");
});

test("Firebase sender fails closed for missing settings, invalid responses and provider errors", async () => {
  await assert.rejects(
    makeAuth({ apiKey: "" }).signIn("member@bsru.ac.th", "password"),
    { code: "FIREBASE_NOT_CONFIGURED" },
  );
  assert.throws(
    () => makeAuth({ continueUrl: "http://external.example.test/" }),
    /HTTPS/,
  );
  const fake = (payload, ok = false) =>
    makeAuth({
      apiKey: "test",
      request: async () => ({
        ok,
        status: ok ? 200 : 400,
        json: async () => payload,
      }),
    });
  await assert.rejects(
    fake({ error: { message: "INVALID_LOGIN_CREDENTIALS" } }).signIn(
      "member@bsru.ac.th",
      "wrong",
    ),
    { status: 401 },
  );
  await assert.rejects(
    fake({ error: { message: "OPERATION_NOT_ALLOWED" } }).signIn(
      "member@bsru.ac.th",
      "wrong",
    ),
    { code: "FIREBASE_CONFIGURATION_ERROR" },
  );
  await assert.rejects(
    fake({ error: { message: "TOO_MANY_ATTEMPTS_TRY_LATER" } }).signIn(
      "member@bsru.ac.th",
      "wrong",
    ),
    { status: 429 },
  );
  await assert.rejects(fake({}, true).signIn("member@bsru.ac.th", "wrong"), {
    code: "FIREBASE_INVALID_RESPONSE",
  });
  await assert.rejects(
    makeAuth({
      apiKey: "test",
      request: async () => {
        throw Error("private-key-details");
      },
    }).signIn("member@bsru.ac.th", "wrong"),
    (error) =>
      error.status === 502 && !error.message.includes("private-key-details"),
  );
  await fake({ error: { message: "EMAIL_NOT_FOUND" } }).sendPasswordReset(
    "member@bsru.ac.th",
  );
});

test("existing Firebase emails require the correct password; string claims and disabled accounts never count as verified", async () => {
  const methods = [];
  let disabled = false;
  const auth = makeAuth({
    apiKey: "test",
    request: async (url) => {
      const method = new URL(url).pathname.split(":")[1];
      methods.push(method);
      if (method === "signUp")
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { message: "EMAIL_EXISTS" } }),
        };
      return {
        ok: true,
        json: async () =>
          method === "lookup"
            ? {
                users: [
                  {
                    localId: "id",
                    email: "member@bsru.ac.th",
                    emailVerified: "true",
                    disabled,
                  },
                ],
              }
            : { idToken: "token", localId: "id" },
      };
    },
  });
  assert.equal(
    (await auth.createOrSignIn("member@bsru.ac.th", "correct")).verified,
    false,
  );
  assert.deepEqual(methods, ["signUp", "signInWithPassword", "lookup"]);
  disabled = true;
  await assert.rejects(auth.signIn("member@bsru.ac.th", "correct"), {
    status: 401,
  });
});
