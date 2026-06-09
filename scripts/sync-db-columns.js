/**
 * Adds missing Prisma User columns on production MySQL (safe / idempotent).
 * Run: node scripts/sync-db-columns.js
 */
require("dotenv").config();
const mysql = require("mysql2/promise");

const USER_COLUMNS = [
  { name: "lastLoginAt", ddl: "ADD COLUMN `lastLoginAt` DATETIME(3) NULL" },
  { name: "metadata", ddl: "ADD COLUMN `metadata` LONGTEXT NULL" },
  { name: "riskScore", ddl: "ADD COLUMN `riskScore` INT NOT NULL DEFAULT 0" },
  { name: "status", ddl: "ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'active'" },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);
  console.log("Connected. Applying User column fixes...\n");

  for (const col of USER_COLUMNS) {
    const exists = await columnExists(conn, "User", col.name);
    if (exists) {
      console.log(`  skip User.${col.name} (already exists)`);
      continue;
    }
    await conn.query(`ALTER TABLE \`User\` ${col.ddl}`);
    console.log(`  added User.${col.name}`);
  }

  await conn.end();
  console.log("\nDone. Restart the API and retry send-otp.");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
