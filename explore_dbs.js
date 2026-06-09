require("dotenv").config();
const mysql = require("mysql2/promise");

async function listDatabases() {
  try {
    const connection = await mysql.createConnection(process.env.DATABASE_URL);
    console.log("Connected to MySQL host.");
    const [rows] = await connection.query("SHOW DATABASES");
    console.log("Databases:", rows.map(r => r.Database));
    
    // Check if we can access the crm database if it exists
    const crmDb = rows.find(r => r.Database.includes("stockology"));
    if (crmDb) {
      console.log(`Found CRM Database: ${crmDb.Database}`);
      await connection.query(`USE ${crmDb.Database}`);
      const [tables] = await connection.query("SHOW TABLES");
      console.log(`Tables in ${crmDb.Database}:`, tables.map(t => Object.values(t)[0]));
    }

    await connection.end();
  } catch (error) {
    console.error("Error:", error.message);
  }
}

listDatabases();
