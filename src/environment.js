"use strict";
const path = require("node:path");

module.exports = function loadEnvironment(root) {
  if (process.env.VERCEL) return;
  try {
    // Node preserves variables already supplied by the shell/deployment.
    process.loadEnvFile(path.join(root, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};
