"use strict";
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");
const { PGlite } = require("@electric-sql/pglite");
const { createPostgresDatabase } = require("../../src/database/postgres");

module.exports = async function database(kind, { filename = ":memory:" } = {}) {
  if (kind === "sqlite") {
    const db = new DatabaseSync(filename);
    db.exec(fs.readFileSync("database/schema.sql", "utf8"));
    db.kind = "sqlite";
    db.boolean = (value) => Number(Boolean(value));
    let queue = Promise.resolve();
    db.withRequest = (work) => {
      const next = queue.then(work);
      queue = next.catch(() => {});
      return next;
    };
    return db;
  }
  const engine = new PGlite();
  const query = async (sql, values = []) => {
    if (sql === "SELECT pg_advisory_xact_lock(724017001)") return { rows: [] };
    const result =
      !values.length && sql.includes(";")
        ? (await engine.exec(sql)).at(-1)
        : await engine.query(sql, values);
    return { ...result, rowCount: result.affectedRows };
  };
  let queue = Promise.resolve();
  const db = createPostgresDatabase({
    query,
    async connect() {
      const previous = queue;
      let release;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      return { query, release };
    },
    end: () => engine.close(),
  });
  await db.initialize();
  return db;
};
