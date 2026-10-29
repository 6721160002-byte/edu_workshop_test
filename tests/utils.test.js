"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  localDateInput,
  workshopTimestamp,
  isExpired,
  readJson,
  validCover,
  verifyPassword,
} = require("../src/utils");
test("Bangkok workshop times are independent of the deployment timezone", () => {
  assert.equal(
    workshopTimestamp("2026-10-28T09:00"),
    "2026-10-28T02:00:00.000Z",
  );
  assert.equal(localDateInput("2026-10-28T02:00:00.000Z"), "2026-10-28T09:00");
  assert.equal(localDateInput("2026-10-28T09:00"), "2026-10-28T09:00");
  assert.equal(isExpired(new Date("2000-01-01")), true);
  assert.equal(isExpired("invalid"), true);
});
test("JSONB, JSON text and bundled image covers are accepted safely", () => {
  assert.deepEqual(readJson('{"revision":1}'), { revision: 1 });
  assert.deepEqual(readJson({ revision: 1 }), { revision: 1 });
  assert.equal(validCover("/assets/images/image-002.jpg"), true);
  assert.equal(validCover("/assets/images/../../server.js"), false);
  assert.equal(validCover("/assets/images/missing.jpg"), false);
  assert.equal(verifyPassword("abc", null, null), false);
});
