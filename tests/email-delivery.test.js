"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const makeDelivery = require("../src/email-delivery");

test("email sender requires configuration and only reports success when provider accepts", async (t) => {
  const original = {
    key: process.env.RESEND_API_KEY,
    from: process.env.OTP_FROM,
    fetch: global.fetch,
    smtpUser: process.env.SMTP_USER,
    smtpPassword: process.env.SMTP_PASSWORD,
  };
  t.after(() => {
    for (const [key, value] of [
      ["RESEND_API_KEY", original.key],
      ["OTP_FROM", original.from],
      ["SMTP_USER", original.smtpUser],
      ["SMTP_PASSWORD", original.smtpPassword],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    global.fetch = original.fetch;
  });
  delete process.env.RESEND_API_KEY;
  delete process.env.OTP_FROM;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASSWORD;
  assert.equal(makeDelivery().available, false);
  await assert.rejects(
    makeDelivery().send("member@bsru.ac.th", "123456"),
    /EMAIL_NOT_CONFIGURED/,
  );
  process.env.RESEND_API_KEY = "test-only-key";
  process.env.OTP_FROM = "Workshop <sender@example.test>";
  assert.equal(
    makeDelivery({ allowResend: false }).available,
    false,
    "normal signup must not use old Resend credentials for reset",
  );
  const sender = makeDelivery();
  assert.equal(sender.available, true);
  global.fetch = async (url, options) => {
    assert.equal(url, "https://api.resend.com/emails");
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ["member@bsru.ac.th"]);
    assert.ok(body.text.includes("123456"));
    return { ok: true, json: async () => ({ id: "accepted" }) };
  };
  await sender.send("member@bsru.ac.th", "123456");
  global.fetch = async () => ({
    ok: false,
    json: async () => ({ message: "rejected" }),
  });
  await assert.rejects(
    sender.send("member@bsru.ac.th", "123456"),
    /EMAIL_SEND_FAILED/,
  );
});

test("Gmail SMTP sends a reset OTP over TLS and does not report rejected mail as sent", async (t) => {
  const names = [
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_USER",
    "SMTP_PASSWORD",
    "SMTP_FROM",
  ];
  const old = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  t.after(() => {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
  });
  process.env.SMTP_HOST = "smtp.gmail.com";
  process.env.SMTP_PORT = "465";
  process.env.SMTP_USER = "sender@gmail.com";
  process.env.SMTP_PASSWORD = "abcd efgh ijkl mnop";
  delete process.env.SMTP_FROM;
  let message,
    settings,
    rejected = false;
  const sender = makeDelivery({
    createTransport(options) {
      settings = options;
      return {
        async sendMail(mail) {
          message = mail;
          return {
            accepted: rejected ? [] : [mail.to],
            rejected: rejected ? [mail.to] : [],
          };
        },
      };
    },
  });
  assert.equal(settings.secure, true);
  assert.equal(settings.auth.pass, "abcdefghijklmnop");
  assert.equal(settings.disableFileAccess, true);
  await sender.send("member@bsru.ac.th", "123456", { purpose: "reset" });
  assert.ok(message.subject.includes("OTP"));
  assert.ok(message.text.includes("123456"));
  assert.equal(message.from, "BSRU Workshop <sender@gmail.com>");
  assert.equal(message.to, "member@bsru.ac.th");
  assert.ok(!message.text.includes("abcdefghijklmnop"));
  rejected = true;
  await assert.rejects(
    sender.send("member@bsru.ac.th", "123456", { purpose: "reset" }),
    /EMAIL_SEND_FAILED/,
  );
  process.env.SMTP_PORT = "587";
  makeDelivery({
    createTransport(options) {
      assert.equal(options.secure, false);
      assert.equal(options.requireTLS, true);
      return {};
    },
  });
  process.env.SMTP_PORT = "invalid";
  assert.equal(
    makeDelivery().available,
    false,
    "bad SMTP settings must not crash signup/login",
  );
});
