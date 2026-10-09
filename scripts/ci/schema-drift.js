/**
 * Helper for scripts/ci/schema-drift.sh. Reads the same DB_* variables the app reads
 * (a .env is loaded too, but variables already in the environment win).
 *
 *   node scripts/ci/schema-drift.js is-empty          exit 1 if the database already has tables
 *   node scripts/ci/schema-drift.js dump <file>       SHOW CREATE TABLE for every table, sorted by
 *                                                     table name, AUTO_INCREMENT=n removed
 *   node scripts/ci/schema-drift.js models            compare the compiled models with the database:
 *                                                     a model whose table, or a non-virtual attribute whose
 *                                                     column, no migration created is MISSING (exit 1)
 *
 * Tables and columns are read from the compiled models (build/) and information_schema,
 * never from a regex over source. Run `npm run build` first.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const connect = () =>
  mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT || "3306", 10),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME,
  });

async function tableNames(conn) {
  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS t FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
  );
  return rows.map((r) => r.t ?? r.T);
}

async function main() {
  const [cmd, arg] = process.argv.slice(2);
  if (!process.env.DB_NAME) throw new Error("DB_NAME is not set");
  const conn = await connect();
  try {
    if (cmd === "is-empty") {
      const tables = await tableNames(conn);
      if (tables.length > 0) {
        console.error(`database ${process.env.DB_NAME} already has ${tables.length} table(s); this check needs an empty database`);
        process.exit(1);
      }
    } else if (cmd === "dump") {
      const out = [];
      for (const t of await tableNames(conn)) {
        const [rows] = await conn.query(`SHOW CREATE TABLE \`${t}\``);
        const ddl = String(rows[0]["Create Table"]).replace(/ AUTO_INCREMENT=\d+/g, "");
        out.push(`-- ${t}\n${ddl};\n`);
      }
      fs.writeFileSync(arg, out.join("\n"));
      console.log(`dumped ${out.length} tables to ${arg}`);
    } else if (cmd === "models") {
      const { Sequelize } = require("sequelize");
      const { initModels } = require(path.resolve("build/models/data-models/init-models"));
      const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER || "root", process.env.DB_PASSWORD || "", {
        host: process.env.DB_HOST || "127.0.0.1",
        port: parseInt(process.env.DB_PORT || "3306", 10),
        dialect: "mysql",
        logging: false,
      });
      initModels(sequelize);
      const [colRows] = await conn.query(
        "SELECT TABLE_NAME AS t, COLUMN_NAME AS c FROM information_schema.columns WHERE TABLE_SCHEMA = DATABASE()",
      );
      const dbColumns = new Map();
      for (const r of colRows) {
        const t = r.t ?? r.T;
        if (!dbColumns.has(t)) dbColumns.set(t, new Set());
        dbColumns.get(t).add(String(r.c ?? r.C).toLowerCase());
      }
      const dbTables = new Set(await tableNames(conn));
      const missingTables = [];
      const missingColumns = [];
      const modelTables = new Set();
      for (const model of Object.values(sequelize.models)) {
        const table = String(model.getTableName());
        modelTables.add(table);
        if (!dbTables.has(table)) {
          missingTables.push(`${model.name} -> ${table}`);
          continue;
        }
        for (const attr of Object.values(model.rawAttributes)) {
          if (attr.type && attr.type.key === "VIRTUAL") continue;
          const field = String(attr.field ?? attr.fieldName);
          if (!dbColumns.get(table).has(field.toLowerCase())) missingColumns.push(`${table}.${field}`);
        }
      }
      const dbOnly = [...dbTables].filter((t) => !modelTables.has(t) && t !== "SequelizeMeta");
      console.log(`models: ${modelTables.size} tables declared, ${dbTables.size} in the database`);
      console.log(`MODEL TABLE WITH NO MIGRATION (${missingTables.length})`);
      missingTables.forEach((m) => console.log(`  ${m}`));
      console.log(`MODEL COLUMN WITH NO MIGRATION (${missingColumns.length})`);
      missingColumns.forEach((m) => console.log(`  ${m}`));
      console.log(`database tables no model declares, informational (${dbOnly.length}): ${dbOnly.join(", ")}`);
      await sequelize.close();
      if (missingTables.length > 0 || missingColumns.length > 0) process.exit(1);
    } else {
      throw new Error("usage: schema-drift.js is-empty | dump <file> | models");
    }
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
