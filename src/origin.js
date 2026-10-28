"use strict";

// Proxies may terminate HTTPS before forwarding the request to Node.
// Compare the browser origin with the public Host, never the listening address.
function isAllowedOrigin(req, configuredOrigin) {
  if (!req.headers.origin) return true;
  try {
    const origin = new URL(req.headers.origin);
    if (!["http:", "https:"].includes(origin.protocol)) return false;
    if (configuredOrigin) return origin.origin === configuredOrigin;
    return origin.host === req.headers.host;
  } catch {
    return false;
  }
}

module.exports = { isAllowedOrigin };
