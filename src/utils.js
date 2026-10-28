"use strict";
const crypto = require("node:crypto");
const now = () => new Date().toISOString();
const localDateInput = (value) => {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
const uid = () => crypto.randomUUID();
const hashToken = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  type: row.type,
  code: row.code,
  email: row.email,
  phone: row.phone,
  faculty: row.faculty,
  major: row.major,
  status: row.status,
  role: row.role,
});
const passwordRecord = (
  password,
  salt = crypto.randomBytes(16).toString("hex"),
) => ({ salt, hash: crypto.scryptSync(password, salt, 64).toString("hex") });
const verifyPassword = (password, salt, expected) => {
  const actual = crypto.scryptSync(password, salt, 64);
  const digest = Buffer.from(expected, "hex");
  return (
    digest.length === actual.length && crypto.timingSafeEqual(digest, actual)
  );
};
function validNewPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 12 &&
    password.length <= 128 &&
    !/\s/.test(password) &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password) &&
    ![
      "password123!",
      "password1234!",
      "qwerty123456!",
      "123456789abc!",
    ].includes(password.toLowerCase())
  );
}
function validCover(value) {
  if (!value) return true;
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(
    String(value),
  );
  if (!m) return false;
  const b = Buffer.from(m[2], "base64");
  if (b.length > 3 * 1024 * 1024) return false;
  if (m[1] === "jpeg")
    return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (m[1] === "png")
    return (
      b.length > 8 &&
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    );
  return (
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP"
  );
}

module.exports = {
  now,
  localDateInput,
  uid,
  hashToken,
  publicUser,
  passwordRecord,
  verifyPassword,
  validNewPassword,
  validCover,
};
