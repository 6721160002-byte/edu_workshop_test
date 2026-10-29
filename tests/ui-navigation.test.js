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
  const { document, click } = await screen(null, { otpAvailable: false });
  await click('[data-action="portal"][data-id="user"]');
  assert.ok(document.querySelector("#login-form"));
  assert.equal(document.querySelector('[data-action="register"]'), null);
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

test("role selection, admin login and member registration remain reachable", async () => {
  const { document, click } = await screen(null);
  assert.ok(document.querySelector(".portal-intro"));
  assert.equal(document.querySelectorAll('[data-action="portal"]').length, 2);
  await click('[data-action="portal"][data-id="staff"]');
  assert.ok(document.querySelector("#login-form"));
  assert.equal(document.querySelector('[data-action="register"]'), null);
  await click('[data-action="switch"]');
  assert.ok(document.querySelector(".portal-intro"));
  await click('[data-action="portal"][data-id="user"]');
  assert.ok(document.querySelector("#login-form"));
  assert.ok(document.querySelector("#identity"));
  assert.ok(document.querySelector("#password"));
  await click('[data-action="register"]');
  assert.ok(document.querySelector("#register-form"));
  assert.equal(
    document.querySelector(".dialog").getAttribute("aria-modal"),
    "true",
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
