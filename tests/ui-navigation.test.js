"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { parseHTML } = require("linkedom");

async function screen(role) {
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
  const context = vm.createContext({
    window,
    document,
    console,
    Headers,
    crypto: require("node:crypto").webcrypto,
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    fetch: async (endpoint) => ({
      ok: true,
      json: async () =>
        endpoint === "/api/session"
          ? { user: role ? account : null, csrf: "test" }
          : { store: fixture },
    }),
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
  return { document, click };
}

test("public role selection, login and registration remain reachable", async () => {
  const { document, click } = await screen(null);
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
