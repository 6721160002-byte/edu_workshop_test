"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function screen(role, options = {}) {
  const { window, document } = parseHTML(
    '<html><body><div id="app"></div><div id="modal-root"></div><div id="confirm-root"></div><div id="toast-root"></div></body></html>',
  );
  window.scrollTo = () => {};
  window.HTMLElement.prototype.focus = function () {};
  const account = {
    id: role === "staff" ? "admin" : "student",
    name: "BSRU Member",
    role,
    type: "นักศึกษา",
    code: "DEMO",
    status: "APPROVED",
    email: "demo@example.test",
    phone: "0812345678",
    faculty: "คณะวิทยาศาสตร์",
    major: "คอมพิวเตอร์",
  };
  const fixture = {
    users: role ? [account] : [],
    workshops: [
      {
        id: "w1",
        title: "Creative Learning Workshop",
        start: "2099-11-01T09:00",
        end: "2099-11-01T12:00",
        hours: 3,
        capacity: 30,
        place: "Learning Studio",
        closed: false,
      },
    ],
    registrations: [],
    ratings: [],
    complaints: [],
    notifications: [],
    revision: 0,
  };
  options.fixture?.(fixture);
  const context = vm.createContext({
    window,
    document,
    console,
    Headers,
    FormData: class {
      constructor(form) {
        this.rows = [...form.querySelectorAll("input,select,textarea")]
          .filter((el) => el.name && !el.disabled)
          .map((el) => [el.name, el.value || ""]);
      }
      entries() {
        return this.rows[Symbol.iterator]();
      }
      [Symbol.iterator]() {
        return this.entries();
      }
    },
    crypto: require("node:crypto").webcrypto,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    fetch: async (endpoint, request = {}) => {
      if (options.request) {
        const response = await options.request(endpoint, request);
        if (response) return response;
      }
      if (
        endpoint === "/api/store" &&
        request.method === "POST" &&
        options.save
      )
        return options.save(JSON.parse(request.body));
      return {
        ok: true,
        json: async () =>
          endpoint === "/api/session"
            ? {
                user: role ? account : null,
                csrf: "test",
                otpAvailable: options.otpAvailable !== false,
                registrationAvailable: options.registrationAvailable !== false,
                registrationProvider: options.registrationProvider || "resend",
                passwordResetAvailable: options.passwordResetAvailable === true,
              }
            : { store: structuredClone(fixture) },
      };
    },
  });
  vm.runInContext(fs.readFileSync("public/assets/js/app.js", "utf8"), context);
  const settle = async () => {
    for (let i = 0; i < 5; i++)
      await new Promise((resolve) => setImmediate(resolve));
  };
  await settle();
  const click = async (selector) => {
    const button = document.querySelector(selector);
    assert.ok(button, selector);
    button.click();
    await settle();
  };
  return { document, click, settle };
}

test("production login explains unavailable account recovery without a dead OTP form", async () => {
  const { document, click } = await screen(null, {
    otpAvailable: false,
    registrationAvailable: false,
  });
  assert.ok(document.querySelector("#login-form"));
  await click('[data-action="register"]');
  assert.ok(document.querySelector("#email-register-form"));
  assert.ok(document.querySelector(".notice"));
  assert.equal(document.querySelector('[data-action="forgot"]'), null);
  assert.ok(document.querySelector(".notice"));
});

test("registration success waits for server acknowledgement", async () => {
  let acknowledge;
  const { document, click, settle } = await screen("user", {
    save: (payload) =>
      new Promise((resolve) => {
        acknowledge = () =>
          resolve({
            ok: true,
            json: async () => ({
              store: payload.store,
              revision: payload.store.revision,
            }),
          });
      }),
  });
  await click('[data-action="enroll"]');
  await click('[data-action="confirm-enroll"]');
  assert.ok(acknowledge);
  assert.ok(
    !document
      .querySelector("#toast-root")
      .textContent.includes("ลงทะเบียนสำเร็จ"),
  );
  assert.ok(
    document
      .querySelector("[data-sync-status]")
      .textContent.includes("กำลังบันทึก"),
  );
  acknowledge();
  await settle();
  assert.ok(
    document
      .querySelector("#toast-root")
      .textContent.includes("ลงทะเบียนสำเร็จ"),
  );
  assert.equal(
    document.querySelector(".dialog"),
    null,
    "no forced rating after registering",
  );
});

test("server seat totals hide full workshops even without other members' registrations", async () => {
  const { document, click } = await screen("user", {
    fixture: (store) => {
      store.workshops[0].occupancy = 30;
    },
  });
  await click('.side-nav [data-id="workshops"]');
  assert.equal(document.querySelectorAll(".card").length, 0);
});

test("activity details and staff management tables are reachable", async () => {
  const learner = await screen("user");
  await learner.click('[data-action="workshop-detail"]');
  assert.ok(learner.document.querySelector(".activity-description"));
  const admin = await screen("staff");
  await admin.click('.side-nav [data-id="manage"]');
  assert.ok(admin.document.querySelector("table"));
  assert.equal(admin.document.querySelectorAll(".card").length, 0);
});

test("staff can save a workshop from the form after confirmation", async () => {
  let saved;
  const { document, click, settle } = await screen("staff", {
    save: async (payload) => {
      saved = payload.store;
      return {
        ok: true,
        json: async () => ({
          store: payload.store,
          revision: payload.store.revision,
        }),
      };
    },
  });
  await click('.side-nav [data-id="manage"]');
  await click('[data-action="add-workshop"]');
  for (const [name, value] of Object.entries({
    title: "New workshop",
    start: "2099-12-01T09:00",
    end: "2099-12-01T12:00",
    place: "Room B",
    capacity: "30",
    hours: "3",
    description: "Workshop details",
  }))
    document.querySelector('#workshop-form [name="' + name + '"]').value =
      value;
  const form = document.querySelector("#workshop-form");
  form.dispatchEvent(
    new document.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await settle();
  await click('[data-action="answer-yes"]');
  assert.ok(saved?.workshops.some((w) => w.title === "New workshop"));
  assert.equal(document.querySelector("#workshop-form"), null);
});

test("shared login opens directly without role selection and keeps member registration", async () => {
  const { document, click } = await screen(null);
  assert.ok(document.querySelector(".login-promo"));
  assert.ok(document.querySelector("#login-form"));
  assert.equal(document.querySelectorAll('[data-action="portal"]').length, 0);
  assert.equal(document.querySelector('[data-action="switch"]'), null);
  assert.ok(document.querySelector("#identity"));
  assert.ok(document.querySelector("#password"));
  await click('[data-action="register"]');
  assert.ok(document.querySelector("#email-register-form"));
  assert.equal(
    document.querySelectorAll('#email-register-form [type="password"]').length,
    1,
  );
  const fields = [
    ...document.querySelectorAll("#email-register-form input"),
  ].map((el) => el.name);
  assert.ok(fields.indexOf("phone") < fields.indexOf("email"));
});

test("email registration keeps field values on error and verifies without repeating a password", async () => {
  let submission;
  const { document, click, settle } = await screen(null, {
    request: async (endpoint, request) => {
      if (endpoint === "/api/registration/request") {
        submission = JSON.parse(request.body);
        if (submission.email === "invalid")
          return {
            ok: false,
            status: 400,
            json: async () => ({ error: "Invalid email", field: "email" }),
          };
        return {
          ok: true,
          json: async () => ({
            flowId: "flow",
            token: "secret",
            maskedEmail: "st***@bsru.ac.th",
            expiresAt: new Date(Date.now() + 300000).toISOString(),
            resendAt: new Date(Date.now() + 60000).toISOString(),
          }),
        };
      }
      if (endpoint === "/api/registration/verify") {
        assert.equal(JSON.parse(request.body).code, "123456");
        assert.equal(JSON.parse(request.body).password, undefined);
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: "Wrong code", field: "otp" }),
        };
      }
    },
  });
  await click('[data-action="register"]');
  const form = document.querySelector("#email-register-form");
  form.querySelector('[name="name"]').value = "Example Member";
  form.querySelector('[name="password"]').value = "StrongPassword123!";
  form.querySelector('[name="email"]').value = "invalid";
  const submit = async (form) => {
    form.dispatchEvent(
      new document.defaultView.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
  };
  await submit(form);
  assert.equal(form.querySelector('[name="name"]').value, "Example Member");
  assert.equal(
    form.querySelector('[name="password"]').value,
    "StrongPassword123!",
  );
  assert.equal(
    form.querySelector('[data-error="email"]').textContent,
    "Invalid email",
  );
  form.querySelector('[name="email"]').value = "student@bsru.ac.th";
  await submit(form);
  assert.equal(submission.password, "StrongPassword123!");
  const otp = document.querySelector("#email-otp-form");
  assert.ok(otp);
  assert.equal(otp.querySelector('[type="password"]'), null);
  assert.equal(
    otp.querySelector('[name="otp"]').getAttribute("autocomplete"),
    "one-time-code",
  );
  assert.ok(
    document.querySelector(".dialog").textContent.includes("st***@bsru.ac.th"),
  );
  assert.equal(
    document.querySelector('[data-action="email-resend"]').disabled,
    true,
  );
  otp.querySelector('[name="otp"]').value = "123456";
  await submit(otp);
  assert.equal(
    otp.querySelector('[data-error="otp"]').textContent,
    "Wrong code",
  );
});

test("Firebase signup uses an email link and offers resend and password recovery", async () => {
  const calls = [];
  const { document, click, settle } = await screen(null, {
    registrationProvider: "firebase",
    passwordResetAvailable: true,
    request: async (endpoint, request) => {
      if (
        endpoint === "/api/registration/request" ||
        endpoint === "/api/firebase/resend"
      ) {
        calls.push({ endpoint, body: JSON.parse(request.body) });
        return {
          ok: true,
          json: async () => ({
            provider: "firebase",
            sent: true,
            email: "member@bsru.ac.th",
          }),
        };
      }
      if (endpoint === "/api/firebase/password-reset") {
        calls.push({ endpoint, body: JSON.parse(request.body) });
        return {
          ok: true,
          json: async () => ({ message: "Check your inbox" }),
        };
      }
    },
  });
  const submit = async (form) => {
    form.dispatchEvent(
      new document.defaultView.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
  };
  await click('[data-action="register"]');
  const form = document.querySelector("#email-register-form");
  form.querySelector('[name="email"]').value = "member@bsru.ac.th";
  form.querySelector('[name="password"]').value = "StrongPassword123!";
  await submit(form);
  assert.equal(form.querySelector('[name="password"]').value, "");
  assert.equal(document.querySelector("#email-otp-form"), null);
  assert.ok(
    document.querySelector(".dialog").textContent.includes("คลิกลิงก์ยืนยัน"),
  );
  const resend = document.querySelector("#firebase-resend-form");
  resend.querySelector('[name="password"]').value = "StrongPassword123!";
  await submit(resend);
  assert.equal(calls.at(-1).endpoint, "/api/firebase/resend");
  assert.equal(calls.at(-1).body.password, "StrongPassword123!");
  await click('[data-action="firebase-login"]');
  assert.equal(
    document.querySelector('#login-form [name="identity"]').value,
    "member@bsru.ac.th",
  );
  await click('[data-action="forgot"]');
  const reset = document.querySelector("#firebase-reset-form");
  assert.ok(reset);
  assert.equal(
    document.querySelector("#forgot-form"),
    null,
    "Firebase recovery must not expose simulated OTP",
  );
  reset.querySelector('[name="email"]').value = "member@bsru.ac.th";
  await submit(reset);
  assert.equal(calls.at(-1).endpoint, "/api/firebase/password-reset");
  assert.ok(
    document
      .querySelector('[role="status"]')
      .textContent.includes("Check your inbox"),
  );
});

test("unverified Firebase login opens email-link guidance and clears the password", async () => {
  const { document, settle } = await screen(null, {
    registrationProvider: "firebase",
    passwordResetAvailable: true,
    request: async (endpoint) =>
      endpoint === "/api/login"
        ? {
            ok: false,
            status: 403,
            json: async () => ({
              error: "Verify email first",
              code: "FIREBASE_EMAIL_UNVERIFIED",
            }),
          }
        : undefined,
  });
  const form = document.querySelector("#login-form");
  form.querySelector('[name="identity"]').value = "member@bsru.ac.th";
  form.querySelector('[name="password"]').value = "StrongPassword123!";
  form.dispatchEvent(
    new document.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await settle();
  assert.equal(form.querySelector('[name="password"]').value, "");
  assert.ok(document.querySelector("#firebase-resend-form"));
  assert.equal(document.querySelector(".sidebar"), null);
});

test("normal signup succeeds independently of email setup and returns to password login", async () => {
  const { document, click, settle } = await screen(null, {
    registrationProvider: "password",
    otpAvailable: false,
    passwordResetAvailable: false,
    request: async (endpoint) =>
      endpoint === "/api/registration/request"
        ? {
            ok: true,
            json: async () => ({
              registered: true,
              email: "member@bsru.ac.th",
            }),
          }
        : undefined,
  });
  await click('[data-action="register"]');
  const form = document.querySelector("#email-register-form");
  assert.equal(form.querySelector('[type="submit"]').disabled, false);
  form.querySelector('[name="password"]').value = "SecurePassword123!";
  form.dispatchEvent(
    new document.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await settle();
  assert.ok(
    document.querySelector(".dialog").textContent.includes("สมัครสมาชิกสำเร็จ"),
  );
  assert.equal(form.querySelector('[name="password"]').value, "");
  assert.equal(document.querySelector("#email-otp-form"), null);
  await click('[data-action="registration-login"]');
  assert.equal(
    document.querySelector('#login-form [name="identity"]').value,
    "member@bsru.ac.th",
  );
});

test("email OTP recovery verifies a number, resets the password and waits for server success", async () => {
  const calls = [];
  let finishReset;
  const { document, click, settle } = await screen(null, {
    registrationProvider: "password",
    otpAvailable: true,
    passwordResetAvailable: true,
    request: async (endpoint, request) => {
      if (
        ["/api/otp/request", "/api/otp/verify", "/api/password/reset"].includes(
          endpoint,
        )
      ) {
        const data = JSON.parse(request.body);
        calls.push({ endpoint, data });
        if (endpoint === "/api/otp/request")
          return {
            ok: true,
            json: async () => ({
              challengeId: "reset-challenge",
              expiresAt: new Date(Date.now() + 300000).toISOString(),
              resendAt: new Date(Date.now() + 60000).toISOString(),
            }),
          };
        if (endpoint === "/api/otp/verify") {
          if (data.code !== "123456")
            return {
              ok: false,
              status: 400,
              json: async () => ({ error: "Wrong OTP" }),
            };
          return {
            ok: true,
            json: async () => ({
              grant: "one-use-grant",
              expiresAt: new Date(Date.now() + 300000).toISOString(),
            }),
          };
        }
        return new Promise((resolve) => {
          finishReset = () =>
            resolve({ ok: true, json: async () => ({ ok: true }) });
        });
      }
    },
  });
  const submit = async (form) => {
    form.dispatchEvent(
      new document.defaultView.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await settle();
  };
  await click('[data-action="forgot"]');
  const forgot = document.querySelector("#forgot-form");
  assert.equal(
    forgot.querySelector("select"),
    null,
    "email is the only recovery channel",
  );
  forgot.querySelector('[name="reset-contact"]').value = "member@bsru.ac.th";
  await submit(forgot);
  assert.equal(calls[0].data.channel, "email");
  const otp = document.querySelector("#otp-form");
  assert.ok(otp);
  assert.equal(
    document.querySelector(".otp-inbox"),
    null,
    "never display a simulated OTP",
  );
  assert.ok(!document.querySelector(".dialog").textContent.includes("123456"));
  assert.equal(
    document.querySelector('[data-action="otp-resend"]').disabled,
    true,
  );
  otp.querySelector('[name="otp"]').value = "000000";
  await submit(otp);
  assert.equal(otp.querySelector(".error").textContent, "Wrong OTP");
  otp.querySelector('[name="otp"]').value = "123456";
  await submit(otp);
  const reset = document.querySelector("#reset-form");
  assert.ok(reset);
  reset.querySelector('[name="reset-password"]').value =
    "NewSecurePassword123!";
  reset.querySelector('[name="reset-confirm"]').value = "NewSecurePassword123!";
  await submit(reset);
  assert.equal(calls.at(-1).data.grant, "one-use-grant");
  assert.ok(finishReset);
  assert.ok(
    !document
      .querySelector("#toast-root")
      .textContent.includes("ตั้งรหัสผ่านใหม่สำเร็จ"),
  );
  finishReset();
  await settle();
  assert.equal(document.querySelector("#reset-form"), null);
  assert.ok(document.querySelector("#login-form"));
  assert.ok(
    document
      .querySelector("#toast-root")
      .textContent.includes("ตั้งรหัสผ่านใหม่สำเร็จ"),
  );
});

test("signed-in members can request password changes at their registered email", async () => {
  const { document, click } = await screen("user", {
    registrationProvider: "password",
    otpAvailable: true,
    passwordResetAvailable: true,
  });
  await click('[data-action="change-password"]');
  const email = document.querySelector('#forgot-form [name="reset-contact"]');
  assert.equal(email.value, "demo@example.test");
  assert.ok(email.hasAttribute("readonly"));
});

test("failed OTP delivery keeps the email form and does not show a sent confirmation", async () => {
  const { document, click, settle } = await screen(null, {
    registrationProvider: "password",
    otpAvailable: true,
    passwordResetAvailable: true,
    request: async (endpoint) =>
      endpoint === "/api/otp/request"
        ? {
            ok: false,
            status: 502,
            json: async () => ({ error: "Email delivery failed" }),
          }
        : undefined,
  });
  await click('[data-action="forgot"]');
  const form = document.querySelector("#forgot-form");
  form.querySelector('[name="reset-contact"]').value = "member@bsru.ac.th";
  form.dispatchEvent(
    new document.defaultView.Event("submit", {
      bubbles: true,
      cancelable: true,
    }),
  );
  await settle();
  assert.equal(document.querySelector("#otp-form"), null);
  assert.equal(
    form.querySelector(".error").textContent,
    "Email delivery failed",
  );
  assert.equal(
    form.querySelector('[name="reset-contact"]').value,
    "member@bsru.ac.th",
  );
});

for (const role of ["user", "staff"])
  test(role + " signs out to the same neutral login", async () => {
    const { document, click } = await screen(role);
    await click('[data-action="logout"]');
    await click('[data-action="confirmed-logout"]');
    assert.ok(document.querySelector(".login-promo"));
    assert.ok(document.querySelector("#login-form"));
    assert.equal(document.querySelector('[data-action="portal"]'), null);
    assert.equal(document.querySelector('[data-action="switch"]'), null);
    assert.ok(
      !document.querySelector(".form h2").textContent.includes("เจ้าหน้าที่"),
    );
  });

for (const role of ["user", "staff"])
  test(
    role + " navigation renders every screen and the correct active menu",
    async () => {
      const { document, click } = await screen(role);
      assert.ok(document.querySelector(".sidebar"));
      const pages =
        role === "staff"
          ? ["manage", "approvals", "participants", "complaints", "dashboard"]
          : [
              "workshops",
              "mine",
              "reports",
              "notifications",
              "my-complaints",
              "dashboard",
            ];
      for (const page of pages) {
        await click('.side-nav [data-id="' + page + '"]');
        assert.equal(
          document.querySelector('.side-nav [aria-current="page"]').dataset.id,
          page,
        );
        assert.ok(document.querySelector(".page-stage").textContent.trim());
        assert.ok(document.querySelector(".page-heading h1"));
      }
      if (role === "staff") {
        await click('.side-nav [data-id="manage"]');
        await click('[data-action="add-workshop"]');
        assert.ok(document.querySelector("#workshop-form"));
      } else {
        await click('[data-action="support"]');
        assert.ok(document.querySelector("#support-form"));
      }
    },
  );
