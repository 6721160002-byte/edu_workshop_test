"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
// Watch application code only; SQLite writes must never restart the server.
const child = spawn(
  process.execPath,
  [
    "--watch",
    "--watch-path=src",
    "--watch-path=server.js",
    "--watch-path=database/schema.sql",
    "server.js",
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, NO_BROWSER: "1" },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
