require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log("Connected to MySQL successfully.");
    const [rows] = await connection.query("SELECT id, applicationId, status, currentStep, personalDetails FROM KycApplication ORDER BY createdAt DESC LIMIT 5");
    console.log("KycApplications:", JSON.stringify(rows, null, 2));
    await connection.end();
  } catch (error) {
    console.error("Error:", error.message);
  }
}

main();
