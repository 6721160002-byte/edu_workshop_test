"use strict";
const { spawn } = require("node:child_process");
const path = require("node:path");
const local = process.argv.includes("--local");
// Watch application code only; SQLite writes must never restart the server.
const child = spawn(
  process.execPath,
  [
    "--watch",
    ...(["win32", "darwin"].includes(process.platform)
      ? ["--watch-path=src", "--watch-path=server.js", "--watch-path=database"]
      : []),
    "server.js",
  ],
  {
    cwd: path.resolve(__dirname, ".."),
    stdio: "inherit",
    env: {
      ...process.env,
      NO_BROWSER: "1",
      // Explicit values override .env only for this local server process.
      ...(local
        ? {
            DATABASE_URL: "",
            HOST: "127.0.0.1",
            APP_ORIGIN: "",
            NODE_ENV: "development",
          }
        : {}),
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code || 0;
});
