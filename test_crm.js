const mysql = require("mysql2/promise");

async function run() {
  const connection = await mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "crm",
    port: 3306,
  });

  try {
    const passwordHash = "$2a$10$2Qy4dmyEBo9RxMQRut/RRO7PYd2b78f.YtpqKRtXGXOcPY1ywWdVq"; // bcrypt hash of 123456
    const [result] = await connection.query(
      "UPDATE users SET password = ?, kyc_portal_access = 1 WHERE email = ?",
      [passwordHash, "Anilyadav082817@gmail.com"]
    );
    console.log("Update result:", result);
    
    // Verify
    const [rows] = await connection.query(
      "SELECT id, name, email, password, kyc_portal_access FROM users WHERE email = ?",
      ["Anilyadav082817@gmail.com"]
    );
    console.log("Verified user state:", rows);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await connection.end();
  }
}

run();
