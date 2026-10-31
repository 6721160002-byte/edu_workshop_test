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
  if (options.hash)
    window.location = { hash: options.hash, hostname: "example.test" };
  if (options.history) {
    window.location = {
      hash: options.hash || "#dashboard",
      hostname: "example.test",
    };
    const entries = [window.location.hash];
    let current = 0;
    window.history = {
      pushState(_state, _title, hash) {
        entries.splice(current + 1);
        entries.push(hash);
        current++;
        window.location.hash = hash;
      },
      replaceState(_state, _title, hash) {
        entries[current] = hash;
        window.location.hash = hash;
      },
      back() {
        if (current > 0) {
          window.location.hash = entries[--current];
          window.dispatchEvent(new window.Event("popstate"));
        }
      },
    };
  }
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
    URLSearchParams,
    Date: options.now
      ? class extends Date {
          constructor(...args) {
            super(...(args.length ? args : [options.now]));
          }
          static now() {
            return +new Date(options.now);
          }
        }
      : Date,
    Blob,
    URL: options.download
      ? {
          createObjectURL(blob) {
            options.download(blob);
            return "blob:test-export";
          },
          revokeObjectURL() {},
        }
      : URL,
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
  const initialMarkup = document.querySelector("#app").innerHTML;
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
  return { window, document, click, settle, initialMarkup };
}

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test("staff dashboard prioritizes nonzero tasks and opens the matching workflow", async () => {
  const { document, click } = await screen("staff", {
    fixture: (store) => {
      const base = store.workshops[0];
      store.workshops.push({
        ...base,
        id: "pending-results",
        title: "Needs results",
        start: "2020-01-01T09:00",
        end: "2020-01-01T12:00",
      });
      store.registrations.push({
        id: "r-pending",
        userId: "admin",
        workshopId: "pending-results",
        status: "PENDING",
      });
      store.users.push({
        id: "waiting",
        role: "user",
        status: "WAITING",
        name: "Applicant",
      });
      store.complaints.push(
        { id: "c-open", status: "OPEN", issue: "New issue", replies: [] },
        { id: "c-closed", status: "CLOSED", issue: "Done", replies: [] },
      );
    },
  });
  const dashboard = document.querySelector(".staff-dashboard");
  assert.equal(dashboard.children[1].className, "staff-tasks");
  assert.equal(document.querySelectorAll(".staff-task").length, 3);
  await click('.staff-task[data-action="participants-for"]');
  assert.equal(
    document.getElementById("participant-filter").value,
    "pending-results",
  );
  assert.match(
    document.querySelector(".attendance-panel").textContent,
    /รอบันทึกผลอีก 1 คน/,
  );
  await click('.side-nav [data-id="dashboard"]');
  await click('.staff-task[data-id="approvals"]');
  assert.ok(document.getElementById("approval-search"));
  await click('.side-nav [data-id="dashboard"]');
  await click('.staff-task[data-id="complaints"]');
  assert.match(
    document.querySelector(".page-heading").textContent,
    /รายการคำร้องเรียน/,
  );
  const clear = await screen("staff");
  assert.equal(clear.document.querySelector(".staff-tasks"), null);
  assert.match(
    clear.document.querySelector(".staff-all-clear").textContent,
    /ไม่มีงานค้าง/,
  );
});

test("staff dashboard focuses on two graphs and keeps current activities in collapsed details", async () => {
  const now = new Date("2026-11-01T03:00:00Z");
  const { document, click } = await screen("staff", {
    now: now.toISOString(),
    fixture: (store) => {
      const base = store.workshops[0];
      store.workshops = [
        ...Array.from({ length: 7 }, (_, i) => ({
          ...base,
          id: "future-" + i,
          title: "Future " + i,
          closed: i === 6,
          capacity: i === 0 ? 1 : 30,
          start: new Date(+now + (i + 1) * 86400000).toISOString(),
          end: new Date(+now + (i + 1) * 86400000 + 3600000).toISOString(),
        })),
        {
          ...base,
          id: "ongoing",
          start: new Date(+now - 3600000).toISOString(),
          end: new Date(+now + 3600000).toISOString(),
        },
        {
          ...base,
          id: "ongoing-closed",
          closed: true,
          start: new Date(+now - 7200000).toISOString(),
          end: new Date(+now + 3600000).toISOString(),
        },
        { ...base, id: "cancelled", cancelled: true },
      ];
      store.registrations.push({
        id: "full",
        userId: "admin",
        workshopId: "future-0",
        status: "PENDING",
        createdAt: now.toISOString(),
      });
    },
  });
  assert.equal(
    document.querySelectorAll(".staff-dashboard-grid > section").length,
    2,
  );
  assert.equal(document.querySelector(".staff-stat-grid"), null);
  assert.equal(document.querySelector(".staff-status-summary"), null);
  const details = document.getElementById("staff-upcoming-details");
  assert.equal(details.hasAttribute("open"), false);
  const rows = [...document.querySelectorAll(".staff-table tbody tr")];
  assert.equal(rows.length, 5);
  assert.equal(rows[0].dataset.workshopId, "ongoing-closed");
  assert.equal(rows[1].dataset.workshopId, "ongoing");
  assert.match(
    rows[0].querySelector(".staff-phase").textContent,
    /กำลังดำเนินการ/,
  );
  assert.match(
    rows[2].querySelector(".staff-phase").textContent,
    /กำลังจะมาถึง/,
  );
  details.open = true;
  details.dispatchEvent(
    new document.defaultView.Event("toggle", { bubbles: true }),
  );
  changeSelect(document, "dashboard-period", "12");
  assert.ok(
    document.getElementById("staff-upcoming-details").hasAttribute("open"),
  );
  await click(
    '.staff-table [data-action="participants-for"][data-id="ongoing"]',
  );
  assert.equal(document.getElementById("participant-filter").value, "ongoing");
});

test("both dashboard graphs share a Bangkok registration window and exclude cancelled, invalid and future records", async () => {
  const { document, click } = await screen("staff", {
    now: "2026-10-31T18:30:00Z", // Already 1 November in Bangkok.
    fixture: (store) => {
      store.registrations = [
        {
          id: "a",
          userId: "admin",
          workshopId: "w1",
          status: "ATTENDED",
          createdAt: "2026-10-31T17:30:00Z",
        },
        {
          id: "b",
          userId: "admin",
          workshopId: "w1",
          status: "PENDING",
          createdAt: "2026-10-31T18:00:00Z",
        },
        {
          id: "c",
          userId: "admin",
          workshopId: "w1",
          status: "CANCELLED",
          createdAt: "2026-10-31T18:10:00Z",
        },
        {
          id: "previous-month",
          userId: "admin",
          workshopId: "w1",
          status: "ABSENT",
          createdAt: "2026-10-31T16:59:00Z",
        },
        {
          id: "older",
          userId: "admin",
          workshopId: "w1",
          status: "ATTENDED",
          createdAt: "2026-02-01T00:00:00Z",
        },
        {
          id: "future",
          userId: "admin",
          workshopId: "w1",
          status: "PENDING",
          createdAt: "2026-10-31T19:00:00Z",
        },
        {
          id: "invalid",
          userId: "admin",
          workshopId: "w1",
          status: "PENDING",
          createdAt: "invalid",
        },
      ];
    },
  });
  assert.equal(document.getElementById("dashboard-period").value, "6");
  assert.equal(document.querySelectorAll(".staff-trend-item").length, 6);
  assert.equal(
    document.querySelector(".staff-registration-total").textContent,
    "3",
  );
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "50%",
  );
  assert.match(
    document.querySelector(".staff-outcome-pending").textContent,
    /ยังไม่มีผลการเข้าร่วม 1 รายการ/,
  );
  const bars = [...document.querySelectorAll(".staff-month-bar")];
  assert.match(
    bars.at(-1).getAttribute("aria-label"),
    /พฤศจิกายน 2569: 2 รายการ/,
  );
  assert.match(bars.at(-2).getAttribute("aria-label"), /ตุลาคม 2569: 1 รายการ/);
  assert.ok(
    [
      ...document.querySelectorAll(".staff-trend-item.is-zero .staff-bar-fill"),
    ].every((bar) => bar.style.height === "0%"),
  );
  await click('.staff-month-bar[data-count="2"]');
  assert.match(
    document.getElementById("toast-root").textContent,
    /พฤศจิกายน 2569: 2 รายการลงทะเบียน/,
  );
  const live = document.querySelector(".staff-all-clear").textContent;
  changeSelect(document, "dashboard-period", "12");
  assert.equal(document.querySelectorAll(".staff-trend-item").length, 12);
  assert.equal(
    document.querySelector(".staff-registration-total").textContent,
    "4",
  );
  assert.equal(
    document.querySelector(".staff-donut-value strong").textContent,
    "66.7%",
  );
  assert.equal(document.querySelector(".staff-all-clear").textContent, live);
});

test("dashboard donut distinguishes missing results from zero attendance and handles empty ranges", async () => {
  const options = (status) => ({
    now: "2026-11-01T03:00:00Z",
    fixture: (store) => {
      store.registrations = [
        {
          id: "one",
          userId: "admin",
          workshopId: "w1",
          status,
          createdAt: "2026-10-30T03:00:00Z",
        },
      ];
    },
  });
  const pending = await screen("staff", options("PENDING"));
  assert.equal(
    pending.document.querySelector(".staff-donut-value strong").textContent,
    "—",
  );
  assert.equal(pending.document.querySelector(".staff-outcome-legend"), null);
  assert.match(
    pending.document.querySelector(".staff-outcome-pending").textContent,
    /ไม่นำมาคำนวณเปอร์เซ็นต์/,
  );
  const absent = await screen("staff", options("ABSENT"));
  assert.equal(
    absent.document.querySelector(".staff-donut-value strong").textContent,
    "0%",
  );
  const attended = await screen("staff", options("ATTENDED"));
  assert.equal(
    attended.document.querySelector(".staff-donut-value strong").textContent,
    "100%",
  );
  const empty = await screen("staff");
  assert.equal(empty.document.querySelector(".staff-trend-chart"), null);
  assert.equal(
    empty.document.querySelector(".staff-donut-value strong").textContent,
    "—",
  );
  assert.match(
    empty.document.querySelector(".staff-trend-panel").textContent,
    /ยังไม่มีรายการลงทะเบียนในช่วงนี้/,
  );
  assert.ok(
    !empty.document.querySelector(".staff-report").innerHTML.includes("NaN"),
  );
});

for (const [role, page] of [
  ["user", "mine"],
  ["staff", "participants"],
])
  test(`${role}: refresh waits for session and data without flashing login`, async () => {
    let finishSession, finishStore, fixture;
    const { document, initialMarkup, settle } = await screen(role, {
      hash: `#${page}`,
      fixture: (store) => {
        fixture = structuredClone(store);
      },
      request: (endpoint) => {
        if (endpoint === "/api/session")
          return new Promise((resolve) => {
            finishSession = () =>
              resolve(
                response({
                  user: fixture.users[0],
                  csrf: "restored-session",
                  registrationProvider: "password",
                }),
              );
          });
        if (endpoint === "/api/store")
          return new Promise((resolve) => {
            finishStore = () => resolve(response({ store: fixture }));
          });
      },
    });
    assert.ok(initialMarkup.includes("app-bootstrap"));
    assert.ok(!initialMarkup.includes("login-form"));
    assert.equal(document.querySelector("#login-form"), null);
    assert.equal(document.querySelector(".sidebar"), null);
    assert.ok(document.querySelector('[aria-busy="true"]'));
    const loadingContent = document.querySelector(".app-bootstrap-content");
    assert.ok(
      document
        .querySelector("#bootstrap-message")
        .textContent.includes("กำลังตรวจสอบการเข้าสู่ระบบ"),
    );
    finishSession();
    await settle();
    assert.ok(finishStore);
    assert.equal(document.querySelector("#login-form"), null);
    assert.equal(document.querySelector(".sidebar"), null);
    assert.ok(document.querySelector(".app-bootstrap"));
    assert.equal(
      document.querySelector(".app-bootstrap-content"),
      loadingContent,
    );
    assert.ok(
      document
        .querySelector("#bootstrap-message")
        .textContent.includes("กำลังโหลดเวิร์กช็อป"),
    );
    finishStore();
    await settle();
    assert.equal(document.querySelector(".app-bootstrap"), null);
    assert.equal(document.querySelector("#login-form"), null);
    assert.equal(
      document.querySelector('.side-nav [aria-current="page"]').dataset.id,
      page,
    );
    assert.equal(document.defaultView.location.hash, `#${page}`);
  });

test("refresh shows login only after the server confirms there is no session", async () => {
  let finishSession;
  const { document, settle } = await screen(null, {
    request: (endpoint) =>
      endpoint === "/api/session"
        ? new Promise((resolve) => {
            finishSession = () => resolve(response({ user: null, csrf: null }));
          })
        : undefined,
  });
  assert.equal(document.querySelector("#login-form"), null);
  finishSession();
  await settle();
  assert.ok(document.querySelector("#login-form"));
  assert.equal(document.querySelector(".app-bootstrap"), null);
});

for (const failingEndpoint of ["/api/session", "/api/store"])
  test(`refresh can retry ${failingEndpoint} failures without assuming logout`, async () => {
    let fixture,
      fail = true;
    const { document, click } = await screen("staff", {
      hash: "#approvals",
      fixture: (store) => {
        fixture = structuredClone(store);
      },
      request: async (endpoint) => {
        if (endpoint === failingEndpoint && fail) {
          fail = false;
          throw Error("Connection unavailable");
        }
        if (endpoint === "/api/session")
          return response({ user: fixture.users[0], csrf: "restored-session" });
        if (endpoint === "/api/store") return response({ store: fixture });
      },
    });
    assert.equal(document.querySelector("#login-form"), null);
    assert.ok(document.querySelector('.app-bootstrap-content[role="alert"]'));
    await click('[data-action="retry-bootstrap"]');
    assert.equal(document.querySelector(".app-bootstrap"), null);
    assert.equal(document.querySelector("#login-form"), null);
    assert.equal(
      document.querySelector('.side-nav [aria-current="page"]').dataset.id,
      "approvals",
    );
  });

test("session expiry during refresh returns to login rather than exposing cached account data", async () => {
  const { document } = await screen("staff", {
    request: async (endpoint) =>
      endpoint === "/api/store"
        ? response({ error: "Session expired" }, 401)
        : undefined,
  });
  assert.ok(document.querySelector("#login-form"));
  assert.equal(document.querySelector(".sidebar"), null);
  assert.equal(
    document.querySelector('[data-action="toggle-account-menu"]'),
    null,
  );
});

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

test("staff deletion requires confirmation and waits for the server", async () => {
  let acknowledge,
    calls = 0;
  const { document, click, settle } = await screen("staff", {
    fixture: (store) => {
      store.workshops[0].title = '<img src=x onerror="alert(1)">';
    },
    request: (endpoint, request) => {
      if (endpoint !== "/api/workshops/delete") return;
      calls++;
      assert.equal(request.method, "POST");
      assert.deepEqual(JSON.parse(request.body), {
        workshopId: "w1",
        revision: 0,
      });
      assert.equal(request.headers.get("X-CSRF-Token"), "test");
      return new Promise((resolve) => {
        acknowledge = () =>
          resolve({
            ok: true,
            json: async () => ({
              store: {
                workshops: [],
                registrations: [],
                ratings: [],
                revision: 1,
              },
            }),
          });
      });
    },
  });
  await click('.side-nav [data-id="manage"]');
  await click('[data-action="workshop-menu"]');
  await click('[data-action="delete-workshop"]');
  assert.equal(calls, 0);
  assert.equal(document.querySelector("#modal-root img"), null);
  assert.match(
    document.querySelector(".dialog").textContent,
    /ไม่สามารถกู้คืนได้/,
  );
  await click('#modal-root [data-action="close"]');
  assert.equal(calls, 0);
  assert.ok(document.querySelector('[data-action="workshop-menu"]'));
  await click('[data-action="workshop-menu"]');
  await click('[data-action="delete-workshop"]');
  await click('[data-action="confirm-delete-workshop"]');
  assert.equal(calls, 1);
  assert.ok(document.querySelector('[data-action="workshop-menu"]'));
  assert.ok(
    document.querySelector('[data-action="confirm-delete-workshop"]').disabled,
  );
  assert.ok(
    !document
      .querySelector("#toast-root")
      .textContent.includes("ลบเวิร์กช็อปแล้ว"),
  );
  acknowledge();
  await settle();
  assert.equal(document.querySelector('[data-action="delete-workshop"]'), null);
  assert.equal(document.querySelector(".dialog"), null);
  assert.match(
    document.querySelector("#toast-root").textContent,
    /ลบเวิร์กช็อปแล้ว/,
  );
});

test("failed deletion keeps the workshop and allows retry", async () => {
  const { document, click } = await screen("staff", {
    request: (endpoint) =>
      endpoint === "/api/workshops/delete"
        ? {
            ok: false,
            status: 500,
            json: async () => ({ error: "Delete failed" }),
          }
        : null,
  });
  await click('.side-nav [data-id="manage"]');
  await click('[data-action="workshop-menu"]');
  await click('[data-action="delete-workshop"]');
  await click('[data-action="confirm-delete-workshop"]');
  assert.ok(document.querySelector('[data-action="workshop-menu"]'));
  assert.equal(
    document.querySelector('[data-action="confirm-delete-workshop"]').disabled,
    false,
  );
  assert.match(
    document.querySelector("#toast-root").textContent,
    /Delete failed/,
  );
});

test("every workshop status has a delete button for staff only", async () => {
  const admin = await screen("staff", {
    fixture: (store) => {
      const base = store.workshops[0];
      store.workshops.push(
        { ...base, id: "closed", closed: true },
        {
          ...base,
          id: "finished",
          start: "2000-01-01T09:00",
          end: "2000-01-01T12:00",
        },
      );
    },
  });
  await admin.click('.side-nav [data-id="manage"]');
  const actions = [
    ...admin.document.querySelectorAll('[data-action="workshop-menu"]'),
  ];
  assert.equal(actions.length, 3);
  for (const action of actions) {
    await admin.click(
      `[data-action="workshop-menu"][data-id="${action.dataset.id}"]`,
    );
    const menu = admin.document.querySelector("#workshop-actions-menu");
    assert.equal(
      menu.querySelector('[data-action="delete-workshop"]').dataset.id,
      action.dataset.id,
    );
    assert.equal(
      Boolean(menu.querySelector('[data-action="close-workshop"]')),
      action.dataset.id === "w1",
    );
    const escape = new admin.document.defaultView.Event("keydown", {
      bubbles: true,
      cancelable: true,
    });
    escape.key = "Escape";
    menu.querySelector("button").dispatchEvent(escape);
    assert.equal(admin.document.querySelector("#workshop-actions-menu"), null);
  }
  const learner = await screen("user");
  await learner.click('.side-nav [data-id="workshops"]');
  assert.equal(
    learner.document.querySelector('[data-action="delete-workshop"]'),
    null,
  );
});

function changeSelect(document, id, value) {
  const select = document.getElementById(id);
  const options = [...select.querySelectorAll("option")];
  for (const option of options) option.selected = false;
  options.find((option) => option.value === String(value)).selected = true;
  select.dispatchEvent(
    new document.defaultView.Event("change", { bubbles: true }),
  );
}

function archiveFixture(store) {
  const base = store.workshops[0];
  const make = (id, year, month = "11") => ({
    ...base,
    id,
    title: "Repeated Workshop",
    place: "Studio " + year,
    start: `${year}-${month}-01T09:00`,
    end: `${year}-${month}-01T12:00`,
    attendanceFinalizedAt: `${year}-${month}-02T00:00:00Z`,
    attendanceFinalizedBy: "admin",
  });
  const year = new Date().getFullYear() - 1;
  store.workshops = [
    make("old", year - 10),
    make("previous", year - 1),
    ...Array.from({ length: 23 }, (_, i) =>
      make("past-" + i, year, i === 22 ? "10" : "11"),
    ),
    { ...make("closed-past", year, "09"), closed: true },
    { ...make("invalid-date", year), start: "invalid" },
    { ...make("ongoing", year), end: "2099-12-31T12:00" },
    { ...make("cancelled", year), cancelled: true },
    base,
  ];
  store.users.push(
    {
      id: "member-a",
      name: "=Alice",
      code: "A001",
      email: "alice@example.test",
    },
    { id: "member-b", name: "Bob", code: "B002", email: "bob@example.test" },
  );
  store.registrations = [
    { id: "ra", userId: "member-a", workshopId: "past-0", status: "ATTENDED" },
    { id: "rb", userId: "member-b", workshopId: "past-0", status: "ABSENT" },
    { id: "rc", userId: "member-b", workshopId: "previous", status: "ABSENT" },
  ];
}

test("attendance completion counts all registrants, blocks incomplete workshops and waits for server confirmation", async () => {
  let fixture,
    finishFinalize,
    finalizeCalls = 0;
  const { document, click, settle } = await screen("staff", {
    hash: "#archive?workshop=w1",
    fixture: (store) => {
      store.workshops[0].start = "2020-11-01T09:00";
      store.workshops[0].end = "2020-11-01T12:00";
      store.users.push({ id: "student", name: "Student", code: "S001" });
      store.registrations = [
        {
          id: "pending",
          userId: "student",
          workshopId: "w1",
          status: "PENDING",
        },
        {
          id: "cancelled",
          userId: "admin",
          workshopId: "w1",
          status: "CANCELLED",
        },
      ];
      fixture = structuredClone(store);
    },
    save: ({ store: incoming }) => {
      fixture = incoming;
      return response({
        store: structuredClone(fixture),
        revision: fixture.revision,
      });
    },
    request: (endpoint) => {
      if (endpoint !== "/api/workshops/finalize-attendance") return;
      finalizeCalls++;
      return new Promise((resolve) => {
        finishFinalize = () => {
          fixture.workshops[0].attendanceFinalizedAt = new Date().toISOString();
          fixture.workshops[0].attendanceFinalizedBy = "admin";
          fixture.revision++;
          resolve(
            response({
              store: structuredClone(fixture),
              revision: fixture.revision,
            }),
          );
        };
      });
    },
  });
  assert.equal(document.querySelector(".archive-roster"), null);
  assert.match(
    document.querySelector(".attendance-panel").textContent,
    /รอบันทึกผลอีก 1 คน/,
  );
  assert.ok(
    document.querySelector('[data-action="finalize-attendance"]').disabled,
  );
  await click('[data-action="participants-for"][data-id="w1"]');
  await click('[data-action="attendance-pending"]');
  assert.equal(document.querySelectorAll(".panel table tbody tr").length, 1);
  await click('[data-action="finalize-attendance"]');
  assert.equal(finalizeCalls, 0);
  await click('[data-action="attend"][data-id="pending"]');
  await click('[data-action="confirmed-attend"][data-id="pending"]');
  assert.match(
    document.querySelector(".attendance-panel").textContent,
    /บันทึกแล้ว 1 \/ 1 คน/,
    document.getElementById("toast-root").textContent,
  );
  assert.equal(
    document.querySelector('[data-action="finalize-attendance"]').disabled,
    false,
  );
  await click('[data-action="finalize-attendance"]');
  assert.ok(document.querySelector('[role="alertdialog"]'));
  await click('[data-action="answer-no"]');
  assert.equal(finalizeCalls, 0);
  await click('[data-action="finalize-attendance"]');
  await click('[data-action="answer-yes"]');
  assert.equal(finalizeCalls, 1);
  assert.equal(document.querySelector(".archive-roster"), null);
  assert.ok(
    document.querySelector('[data-action="finalize-attendance"]').disabled,
  );
  finishFinalize();
  await settle();
  assert.ok(document.querySelector(".archive-roster"));
  assert.equal(document.querySelector('[data-action="attend"]'), null);
  assert.equal(
    document.querySelector(
      '#archive-participant-status option[value="PENDING"]',
    ),
    null,
  );
  await click('.side-nav [data-id="participants"]');
  assert.equal(document.querySelector('[data-action="attend"]'), null);
  assert.match(
    document.querySelector(".attendance-panel").textContent,
    /ยืนยันผลและเก็บเข้าประวัติแล้ว/,
  );
});

test("failed finalization keeps results editable and activities without registrants still require confirmation", async () => {
  let calls = 0;
  const { document, click } = await screen("staff", {
    fixture: (store) => {
      store.workshops[0].start = "2020-11-01T09:00";
      store.workshops[0].end = "2020-11-01T12:00";
    },
    request: (endpoint) =>
      endpoint === "/api/workshops/finalize-attendance"
        ? (calls++, response({ error: "Temporary failure" }, 500))
        : null,
  });
  await click('.side-nav [data-id="archive"]');
  assert.equal(document.querySelector(".archive-table"), null);
  await click('[data-action="participants-for"][data-id="w1"]');
  assert.match(
    document.querySelector(".attendance-panel").textContent,
    /ไม่มีผู้ลงทะเบียน/,
  );
  assert.equal(
    document.querySelector('[data-action="finalize-attendance"]').disabled,
    false,
  );
  await click('[data-action="finalize-attendance"]');
  await click('[data-action="answer-yes"]');
  assert.equal(calls, 1);
  assert.match(
    document.getElementById("toast-root").textContent,
    /Temporary failure/,
  );
  assert.equal(document.querySelector(".archive-roster"), null);
  assert.equal(
    document.querySelector('[data-action="finalize-attendance"]').disabled,
    false,
  );
});

test("archive separates years and months, including closed past events, with bounded results", async () => {
  const year = new Date().getFullYear() - 1;
  const { document, click } = await screen("staff", {
    fixture: archiveFixture,
  });
  await click('.side-nav [data-id="archive"]');
  assert.equal(document.getElementById("archive-year").value, String(year));
  assert.match(
    document.querySelector(".manage-results-heading").textContent,
    /24/,
  );
  assert.equal(document.querySelectorAll(".archive-table tbody tr").length, 10);
  assert.equal(document.querySelector('[data-workshop-id="w1"]'), null);
  assert.equal(document.querySelector('[data-workshop-id="ongoing"]'), null);
  changeSelect(document, "archive-month", "9");
  assert.equal(document.querySelectorAll(".archive-table tbody tr").length, 1);
  assert.ok(document.querySelector('[data-workshop-id="closed-past"]'));
  changeSelect(document, "archive-year", year - 10);
  assert.equal(document.getElementById("archive-month").value, "all");
  assert.ok(document.querySelector('[data-workshop-id="old"]'));
  assert.match(
    document.querySelector(".manage-results-heading h2").textContent,
    new RegExp(String(year - 10 + 543)),
  );
});

test("archive roster is scoped to one event, read-only, and returns to the same list page", async () => {
  let writes = 0;
  const { document, click } = await screen("staff", {
    fixture: archiveFixture,
    request: (_endpoint, request) => {
      if (request.method === "POST") writes++;
    },
  });
  await click('.side-nav [data-id="archive"]');
  await click('[data-action="archive-page"][aria-label="หน้าถัดไป"]');
  const rowIds = [...document.querySelectorAll(".archive-table tbody tr")].map(
    (r) => r.dataset.workshopId,
  );
  await click('[data-action="archive-roster"]');
  assert.ok(document.querySelector(".archive-readonly"));
  assert.equal(document.querySelector('[data-action="attend"]'), null);
  assert.equal(document.querySelector('[data-action="absent"]'), null);
  await click('[data-action="archive-back"]');
  assert.deepEqual(
    [...document.querySelectorAll(".archive-table tbody tr")].map(
      (r) => r.dataset.workshopId,
    ),
    rowIds,
  );
  const search = document.getElementById("archive-search");
  search.value = "nonexistent workshop";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  assert.equal(document.querySelector(".archive-table"), null);
  await click('[data-action="archive-clear"]');
  assert.match(
    document.querySelector(".archive-page-number").textContent,
    /1 \/ 3/,
  );
  assert.equal(writes, 0);
});

test("archive participant filters and CSV retain workshop date and avoid mixing identical workshop names", async () => {
  const year = new Date().getFullYear() - 1;
  let csvBlob;
  const { document, click } = await screen("staff", {
    hash: `#archive?year=${year}&month=11&workshop=past-0`,
    fixture: archiveFixture,
    download: (blob) => {
      csvBlob = blob;
    },
  });
  assert.equal(
    document.querySelectorAll(".archive-roster-table tbody tr").length,
    2,
  );
  assert.match(
    document.querySelector(".archive-roster-table").textContent,
    /ไม่ได้เข้าร่วม/,
  );
  assert.equal(
    document.querySelector(
      '#archive-participant-status option[value="PENDING"]',
    ),
    null,
  );
  changeSelect(document, "archive-participant-status", "ATTENDED");
  assert.equal(
    document.querySelectorAll(".archive-roster-table tbody tr").length,
    1,
  );
  await click('[data-action="archive-export"]');
  const csv = await csvBlob.text();
  assert.match(csv, /'\=Alice/);
  assert.match(csv, /Repeated Workshop/);
  assert.match(csv, /พฤศจิกายน/);
  assert.match(csv, new RegExp(String(year + 543)));
  assert.ok(!csv.includes("Bob"));
  changeSelect(document, "archive-participant-status", "all");
  const search = document.getElementById("archive-participant-search");
  search.value = "B002";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  assert.equal(
    document.querySelectorAll(".archive-roster-table tbody tr").length,
    1,
  );
  assert.match(
    document.querySelector(".archive-roster-table").textContent,
    /Bob/,
  );
});

test("archive year/month and selected workshop survive refresh links and browser back", async () => {
  const year = new Date().getFullYear() - 1;
  const { window, document, click, settle } = await screen("staff", {
    history: true,
    hash: `#archive?year=${year}&month=10`,
    fixture: archiveFixture,
  });
  assert.ok(document.querySelector('[data-workshop-id="past-22"]'));
  await click('[data-action="archive-roster"][data-id="past-22"]');
  assert.match(window.location.hash, /workshop=past-22/);
  const refreshed = await screen("staff", {
    hash: window.location.hash,
    fixture: archiveFixture,
  });
  assert.ok(refreshed.document.querySelector(".archive-roster"));
  assert.match(
    refreshed.document.querySelector(".page-heading").textContent,
    /ตุลาคม/,
  );
  window.history.back();
  await settle();
  assert.equal(document.querySelector(".archive-roster"), null);
  assert.equal(document.getElementById("archive-year").value, String(year));
  assert.equal(document.getElementById("archive-month").value, "10");
});

test("archive groups UTC dates by Bangkok calendar year and handles empty, invalid or missing events", async () => {
  const { document } = await screen("staff", {
    hash: "#archive?year=2025&month=1",
    fixture: (store) => {
      store.workshops = [
        {
          ...store.workshops[0],
          id: "boundary",
          attendanceFinalizedAt: "2025-01-02T00:00:00Z",
          attendanceFinalizedBy: "admin",
          start: "2024-12-31T18:30:00Z",
          end: "2024-12-31T19:30:00Z",
        },
      ];
    },
  });
  assert.ok(document.querySelector('[data-workshop-id="boundary"]'));
  assert.match(document.querySelector(".archive-table").textContent, /2568/);
  const missing = await screen("staff", {
    hash: "#archive?year=invalid&month=999&workshop=deleted",
  });
  assert.equal(missing.document.querySelector(".archive-roster"), null);
  assert.match(
    missing.document.querySelector(".archive-view").textContent,
    /ไม่พบกิจกรรมย้อนหลังนี้/,
  );
  assert.ok(missing.document.getElementById("archive-year").disabled);
  const learner = await screen("user", {
    hash: "#archive",
    fixture: archiveFixture,
  });
  assert.equal(
    learner.document.querySelector('.side-nav [data-id="archive"]'),
    null,
  );
  assert.equal(learner.document.querySelector(".archive-view"), null);
});

test("hundreds of workshops stay bounded and filters reset pagination", async () => {
  const { document, click, settle } = await screen("staff", {
    fixture: (store) => {
      const base = store.workshops[0];
      store.workshops = Array.from({ length: 137 }, (_, i) => {
        const future = new Date(Date.UTC(2099, 0, i + 1, 9));
        const past = new Date(Date.UTC(2000, 0, i + 1, 9));
        return {
          ...base,
          id: `bulk-${i}`,
          title: `Workshop ${String(i).padStart(3, "0")}`,
          place: i % 2 ? "Room A" : "Room B",
          start:
            i % 5 === 0
              ? new Date(Date.now() - 3600000).toISOString()
              : (i % 5 === 3 ? past : future).toISOString(),
          end:
            i % 5 === 0
              ? new Date(Date.now() + 3600000).toISOString()
              : new Date(
                  (i % 5 === 3 ? past : future).getTime() + 7200000,
                ).toISOString(),
          closed: i % 5 === 2,
          cancelled: i % 5 === 4,
        };
      });
    },
  });
  await click('.side-nav [data-id="manage"]');
  const rows = () => [...document.querySelectorAll(".manage-workshop-row")];
  assert.equal(rows().length, 10);
  assert.match(
    document.querySelector(".manage-result-count").textContent,
    /137/,
  );
  assert.ok(
    rows().every(
      (row) => Number(row.dataset.workshopId.split("-")[1]) % 5 === 0,
    ),
  );
  assert.equal(document.querySelector("#manage-date-panel").hidden, false);
  assert.equal(
    document.querySelector('[data-action="toggle-manage-dates"]'),
    null,
  );
  const firstPage = rows().map((row) => row.dataset.workshopId);
  await click('[data-action="manage-page"][aria-label="หน้าถัดไป"]');
  assert.ok(rows().every((row) => !firstPage.includes(row.dataset.workshopId)));
  assert.match(document.querySelector(".manage-range").textContent, /11–20/);
  await click('[data-action="manage-page"][data-id="14"]');
  assert.equal(rows().length, 7);
  changeSelect(document, "phase-filter", "upcoming");
  await settle();
  assert.equal(
    document.querySelector('.manage-page-links [aria-current="page"]').dataset
      .id,
    "1",
  );
  assert.ok(
    rows().every(
      (row) => Number(row.dataset.workshopId.split("-")[1]) % 5 === 1,
    ),
  );
  assert.equal(document.querySelector(".manage-group-row"), null);
  assert.equal(document.querySelector(".manage-row-status"), null);
  changeSelect(document, "manage-page-size", "25");
  await settle();
  assert.equal(rows().length, 25);
  await click('[data-action="reset-manage-filters"]');
  assert.equal(rows().length, 25);
  changeSelect(document, "manage-sort", "newest");
  await settle();
  assert.equal(document.querySelector(".manage-group-row"), null);
  assert.equal(document.querySelectorAll(".manage-row-status").length, 25);
  changeSelect(document, "phase-filter", "finished");
  await settle();
  assert.ok(
    rows().every(
      (row) => Number(row.dataset.workshopId.split("-")[1]) % 5 === 3,
    ),
  );
  changeSelect(document, "phase-filter", "closed");
  await settle();
  assert.ok(
    rows().every(
      (row) => Number(row.dataset.workshopId.split("-")[1]) % 5 === 2,
    ),
  );
  const search = document.querySelector("#search");
  search.value = "No matching workshop";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  await settle();
  assert.equal(rows().length, 0);
  assert.ok(document.querySelector(".manage-empty"));
  await click('[data-action="reset-manage-filters"]');
  const from = document.querySelector("#date-from");
  from.value = "2100-01-01";
  from.dispatchEvent(
    new document.defaultView.Event("change", { bubbles: true }),
  );
  await settle();
  assert.equal(rows().length, 0);
  await click('[data-action="clear-manage-dates"]');
  assert.equal(rows().length, 25);
});

test("deleting the final workshop on the last page returns to a valid page", async () => {
  let fixture;
  const { document, click } = await screen("staff", {
    fixture: (store) => {
      const base = store.workshops[0];
      store.workshops = Array.from({ length: 11 }, (_, i) => ({
        ...base,
        id: `item-${i}`,
        title: `Item ${String(i).padStart(2, "0")}`,
      }));
      fixture = store;
    },
    request: (endpoint, request) => {
      if (endpoint !== "/api/workshops/delete") return;
      const { workshopId } = JSON.parse(request.body);
      const archived = fixture.workshops.find((w) => w.id === workshopId);
      return response({
        store: {
          ...fixture,
          workshops: fixture.workshops.filter((w) => w.id !== workshopId),
          auditLog: [
            {
              id: "deletion-entry",
              entity: "workshops",
              action: "delete",
              entityId: workshopId,
              actorName: "Admin",
              createdAt: new Date().toISOString(),
              workshop: { ...archived, registrationCount: 0 },
            },
          ],
          revision: 1,
        },
      });
    },
  });
  await click('.side-nav [data-id="manage"]');
  await click('[data-action="manage-page"][data-id="2"]');
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 1);
  await click('[data-action="workshop-menu"]');
  assert.equal(
    document.querySelector("#workshop-actions-menu").parentNode,
    document.body,
  );
  await click('[data-action="delete-workshop"]');
  await click('[data-action="confirm-delete-workshop"]');
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 10);
  assert.equal(document.querySelector(".manage-empty"), null);
  await click('[data-action="manage-view"][data-id="deleted"]');
  await click('[data-action="deleted-workshop-detail"]');
  assert.ok(document.querySelector(".dialog").textContent.includes("Item 10"));
  assert.equal(document.querySelector('[data-action="workshop-menu"]'), null);
});

test("deleted workshop history is read-only, searchable and supports older deletion logs", async () => {
  const { document, click, settle } = await screen("staff", {
    fixture: (store) => {
      const original = store.workshops[0];
      store.auditLog = Array.from({ length: 24 }, (_, i) => ({
        id: `history-${i}`,
        entity: "workshops",
        action: "delete",
        entityId: `removed-${i}`,
        actorName: `ผู้ลบหมายเลข${i}`,
        createdAt: new Date(Date.UTC(2026, 9, i + 1, 10)).toISOString(),
        workshop: {
          ...original,
          id: `removed-${i}`,
          title:
            i === 23
              ? '<img src=x onerror="alert(1)">'
              : `Deleted workshop ${i}`,
          registrationCount: 5,
        },
      }));
      store.auditLog.push({
        id: "old-deletion",
        entity: "workshops",
        action: "delete",
        entityId: "legacy-deleted-id",
        actorName: "Previous admin",
        createdAt: "2026-09-30T10:00:00Z",
      });
    },
  });
  await click('.side-nav [data-id="manage"]');
  assert.match(
    document.querySelector(".manage-result-count").textContent,
    /1 รายการ/,
  );
  assert.equal(
    document.querySelector('#phase-filter [value="cancelled"]'),
    null,
  );
  assert.equal(document.querySelector('#phase-filter [value="deleted"]'), null);
  assert.equal(document.querySelectorAll("#phase-filter option").length, 5);
  assert.ok(
    [...document.querySelectorAll("#phase-filter option")].every(
      (option) => !option.textContent.includes("·"),
    ),
  );
  changeSelect(document, "phase-filter", "upcoming");
  const currentSearch = document.querySelector("#search");
  currentSearch.value = "No matching current workshop";
  currentSearch.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  await settle();
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 0);
  await click('[data-action="manage-view"][data-id="deleted"]');
  await settle();
  assert.equal(document.querySelector("#search").value, "");
  assert.equal(document.querySelector("#phase-filter"), null);
  assert.equal(
    document.querySelector('[data-action="manage-view"][aria-pressed="true"]')
      .dataset.id,
    "deleted",
  );
  assert.match(
    document.querySelector(".manage-result-count").textContent,
    /25 รายการ/,
  );
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 10);
  assert.equal(
    document.querySelector(".manage-deleted-row").dataset.workshopId,
    "removed-23",
  );
  assert.equal(document.querySelector(".manage-deleted-table img"), null);
  assert.equal(document.querySelector('[data-action="workshop-menu"]'), null);
  assert.equal(
    document.querySelector('[data-action="participants-for"]'),
    null,
  );
  await click('[data-action="deleted-workshop-detail"]');
  assert.ok(
    document.querySelector(".dialog").textContent.includes("ผู้ลบหมายเลข23"),
  );
  assert.ok(
    document.querySelector(".dialog").textContent.includes("5 / 30 ที่นั่ง"),
  );
  assert.equal(document.querySelector("#modal-root img"), null);
  assert.equal(document.querySelector('[data-action="edit-workshop"]'), null);
  await click('#modal-root [data-action="close"]');
  await click('[data-action="manage-page"][data-id="3"]');
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 5);
  const search = document.querySelector("#search");
  search.value = "legacy-deleted-id";
  search.dispatchEvent(
    new document.defaultView.Event("input", { bubbles: true }),
  );
  await settle();
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 1);
  await click('[data-action="deleted-workshop-detail"]');
  assert.ok(
    document
      .querySelector(".dialog .notice")
      .textContent.includes("ไม่ได้เก็บชื่อ"),
  );
  assert.ok(
    document.querySelector(".dialog").textContent.includes("legacy-deleted-id"),
  );
  await click('#modal-root [data-action="close"]');
  await click('[data-action="reset-manage-filters"]');
  assert.equal(document.querySelectorAll(".manage-deleted-row").length, 10);
  assert.equal(document.querySelector("#phase-filter"), null);
  await click('[data-action="manage-view"][data-id="current"]');
  assert.equal(document.querySelectorAll(".manage-workshop-row").length, 1);
  assert.equal(document.querySelector(".manage-deleted-row"), null);
  assert.equal(document.querySelector("#phase-filter").value, "all");
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
  test(
    role + " account dropdown opens details, settings and role-specific links",
    async () => {
      const { document, click } = await screen(role, { otpAvailable: false });
      const trigger = document.querySelector(
        '[data-action="toggle-account-menu"]',
      );
      const menu = document.querySelector("#account-dropdown");
      assert.ok(menu.hidden);
      await click('[data-action="toggle-account-menu"]');
      assert.equal(trigger.getAttribute("aria-expanded"), "true");
      assert.equal(menu.hidden, false);
      await click(".page-heading");
      assert.ok(menu.hidden);
      await click('[data-action="toggle-account-menu"]');
      const escape = new document.defaultView.Event("keydown", {
        bubbles: true,
        cancelable: true,
      });
      escape.key = "Escape";
      trigger.dispatchEvent(escape);
      assert.ok(menu.hidden);
      assert.equal(trigger.getAttribute("aria-expanded"), "false");
      const down = new document.defaultView.Event("keydown", {
        bubbles: true,
        cancelable: true,
      });
      down.key = "ArrowDown";
      trigger.dispatchEvent(down);
      assert.equal(menu.hidden, false);
      assert.ok(
        menu.querySelector(
          `[data-action="page"][data-id="${role === "staff" ? "manage" : "mine"}"]`,
        ),
      );
      await click('#account-dropdown [data-action="account-profile"]');
      assert.ok(menu.hidden);
      assert.ok(
        document
          .querySelector(".account-details")
          .textContent.includes("demo@example.test"),
      );
      await click('#modal-root [data-action="account-settings"]');
      assert.equal(
        document.querySelector('[name="account-name"]').value,
        "BSRU Member",
      );
      assert.equal(
        document.querySelector('[name="account-phone"]').value,
        "0812345678",
      );
      assert.equal(
        document.querySelector('#account-settings-form [name="email"]'),
        null,
      );
      await click('#modal-root [data-action="close"]');
      await click('[data-action="toggle-account-menu"]');
      await click('#account-dropdown [data-action="account-password"]');
      assert.ok(
        document
          .querySelector(".notice")
          .textContent.includes("ยังไม่ได้เปิดบริการ"),
      );
    },
  );

test("account settings wait for confirmation, retain failed input and update the header", async () => {
  let savedStore,
    finishSave,
    rejectSave = true;
  const { document, click, settle } = await screen("user", {
    fixture: (store) => {
      savedStore = structuredClone(store);
    },
    request: async (endpoint, request) => {
      if (endpoint !== "/api/account") return;
      const data = JSON.parse(request.body);
      if (rejectSave)
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: "Phone already used" }),
        };
      return new Promise((resolve) => {
        finishSave = () => {
          Object.assign(savedStore.users[0], data);
          savedStore.revision++;
          resolve({
            ok: true,
            json: async () => ({
              user: savedStore.users[0],
              store: savedStore,
            }),
          });
        };
      });
    },
  });
  await click('[data-action="toggle-account-menu"]');
  await click('#account-dropdown [data-action="account-settings"]');
  const form = document.querySelector("#account-settings-form");
  form.querySelector('[name="account-name"]').value = "New Member Name";
  form.querySelector('[name="account-phone"]').value = "0891234567";
  const submit = () =>
    form.dispatchEvent(
      new document.defaultView.Event("submit", {
        bubbles: true,
        cancelable: true,
      }),
    );
  submit();
  await settle();
  assert.equal(form.querySelector(".error").textContent, "Phone already used");
  assert.equal(
    form.querySelector('[name="account-name"]').value,
    "New Member Name",
  );
  rejectSave = false;
  submit();
  await settle();
  assert.ok(finishSave);
  assert.ok(form.querySelector('[type="submit"]').disabled);
  assert.ok(
    document
      .querySelector('[data-action="toggle-account-menu"]')
      .getAttribute("aria-label")
      .includes("BSRU Member"),
  );
  finishSave();
  await settle();
  assert.equal(document.querySelector("#account-settings-form"), null);
  assert.ok(
    document
      .querySelector('[data-action="toggle-account-menu"]')
      .getAttribute("aria-label")
      .includes("New Member Name"),
  );
  assert.ok(
    document
      .querySelector("#toast-root")
      .textContent.includes("บันทึกข้อมูลบัญชีแล้ว"),
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
          ? [
              "manage",
              "approvals",
              "participants",
              "archive",
              "complaints",
              "dashboard",
            ]
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
