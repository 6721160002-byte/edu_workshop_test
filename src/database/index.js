"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { ROOT, DB_FILE } = require("../config");
module.exports = async function openDatabase() {
  if (process.env.DATABASE_URL) {
    const { Pool, types } = require("pg");
    types.setTypeParser(20, Number);
    const { createPostgresDatabase } = require("./postgres");
    const db = createPostgresDatabase(
      new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 3,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 10000,
      }),
    );
    try {
      await db.initialize();
      return db;
    } catch (error) {
      await db.close();
      throw error;
    }
  }
  if (process.env.VERCEL)
    throw Object.assign(
      new Error(
        "Set DATABASE_URL to a persistent PostgreSQL database in Vercel Environment Variables.",
      ),
      { code: "DATABASE_URL_MISSING" },
    );
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  db.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  db.exec(fs.readFileSync(path.join(ROOT, "database", "schema.sql"), "utf8"));
  let queue = Promise.resolve();
  db.withRequest = (work) => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  db.kind = "sqlite";
  db.boolean = (value) => Number(Boolean(value));
  return db;
};
