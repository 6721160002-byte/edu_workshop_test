"use strict";

// Explicit opt-in for a database owner who requires readable passwords.
// Authentication still uses scrypt. Never expose this table through app APIs,
// snapshots, logs, or frontend state. Existing hashes cannot be recovered.
module.exports = function passwordStorage(
  { db, now },
  enabled = process.env.STORE_PLAINTEXT_PASSWORDS === "1",
) {
  return async function storeReadablePassword(userId, password) {
    // Call in the same transaction as the account/password change so a failed
    // signup/reset cannot leave a readable password behind or a stale value.
    if (!enabled) {
      await db
        .prepare("DELETE FROM user_passwords WHERE user_id=?")
        .run(userId);
      return;
    }
    await db
      .prepare(
        "INSERT INTO user_passwords(user_id,password_plaintext,updated_at) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_plaintext=excluded.password_plaintext,updated_at=excluded.updated_at",
      )
      .run(userId, password, now());
  };
};
