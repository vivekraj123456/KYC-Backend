const mysql = require("mysql2/promise");

async function listLocalDatabases() {
  const config = {
    host: "localhost",
    user: "root",
    password: "",
    port: 3306,
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log("Connected to LOCAL MySQL host.");
    const [rows] = await connection.query("SHOW DATABASES");
    console.log("Local Databases:", rows.map(r => r.Database));
    await connection.end();
  } catch (error) {
    console.error("Error connecting to LOCAL MySQL:", error.message);
  }
}

listLocalDatabases();
