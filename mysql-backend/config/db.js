const mysql = require("mysql2");
require("dotenv").config();

// Create connection pool using either a single URL or individual variables
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: {
    rejectUnauthorized: false,
  },
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
});

module.exports = pool.promise();