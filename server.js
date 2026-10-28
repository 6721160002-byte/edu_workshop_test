"use strict";

// Keep Vercel's request entry point separate from the local port listener.
if (process.env.VERCEL) {
  module.exports = require("./api/index");
} else {
  require("./src/server");
}
