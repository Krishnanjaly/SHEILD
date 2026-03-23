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
        console.error("❌ Database connection failed:", err);
        process.exit(1);
    }
    console.log("✅ Connected to MySQL");

    // Add qr_token column to users table
    const sql = "ALTER TABLE users ADD COLUMN qr_token VARCHAR(255) UNIQUE AFTER email";

    db.query(sql, (error) => {
        if (error) {
            if (error.code === 'ER_DUP_COLUMN_NAME') {
                console.log("⚠️ Column 'qr_token' already exists.");
            } else {
                console.error("❌ Error adding column:", error);
            }
        } else {
            console.log("✅ Column 'qr_token' added successfully.");
        }
        db.end();
    });
});
