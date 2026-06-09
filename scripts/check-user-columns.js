require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  const [db] = await conn.query("SELECT DATABASE() AS db");
  const [cols] = await conn.query("SHOW COLUMNS FROM `User`");
  console.log("Database:", db[0].db);
  console.log("User columns:", cols.map((c) => c.Field).join(", "));
  console.log("has lastLoginAt:", cols.some((c) => c.Field === "lastLoginAt"));
  await conn.end();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
