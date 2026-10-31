"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const load = require("../src/environment");

test("local .env loads without overriding deployment values or requiring a file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "bsru-environment-"));
  const names = ["VERCEL", "BSRU_TEST_ENV_FILE", "BSRU_TEST_ENV_EXISTING"];
  const old = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  t.after(() => {
    for (const name of names) {
      if (old[name] === undefined) delete process.env[name];
      else process.env[name] = old[name];
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  delete process.env.VERCEL;
  delete process.env.BSRU_TEST_ENV_FILE;
  load(root);
  fs.writeFileSync(
    path.join(root, ".env"),
    'BSRU_TEST_ENV_FILE="file value"\nBSRU_TEST_ENV_EXISTING=file\n',
  );
  process.env.BSRU_TEST_ENV_EXISTING = "deployment";
  load(root);
  assert.equal(process.env.BSRU_TEST_ENV_FILE, "file value");
  assert.equal(process.env.BSRU_TEST_ENV_EXISTING, "deployment");
  delete process.env.BSRU_TEST_ENV_FILE;
  process.env.VERCEL = "1";
  load(root);
  assert.equal(process.env.BSRU_TEST_ENV_FILE, undefined);
});
