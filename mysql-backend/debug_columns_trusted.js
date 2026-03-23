const mysql = require("mysql2");
require("dotenv").config();

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        process.exit(1);
    }
    console.log("Connected to MySQL");

    db.query("DESCRIBE Trusted_Contact", (error, results) => {
        if (error) {
            console.error("Error describing Trusted_Contact table:", error);
        } else {
            console.log("Trusted_Contact Columns:", results.map(r => r.Field));
        }
        db.end();
    });
});
