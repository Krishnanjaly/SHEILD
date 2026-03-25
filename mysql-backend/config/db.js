const mysql = require("mysql2");
require("dotenv").config();

const url = new URL(process.env.DB_URL);

const pool = mysql.createPool({
  host: url.hostname,
  user: url.username,
  password: url.password,
  database: url.pathname.replace("/", ""),
  port: url.port,
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
});

module.exports = pool.promise();