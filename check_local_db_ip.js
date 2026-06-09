const mysql = require("mysql2/promise");

async function listLocalDatabases() {
  const config = {
    host: "127.0.0.1",
    user: "root",
    password: "",
    port: 3306,
  };

  try {
    const connection = await mysql.createConnection(config);
    console.log("Connected to 127.0.0.1 MySQL host.");
    const [rows] = await connection.query("SHOW DATABASES");
    console.log("Databases:", rows.map(r => r.Database));
    await connection.end();
  } catch (error) {
    console.error("Error connecting to 127.0.0.1 MySQL:", error.message);
  }
}

listLocalDatabases();
