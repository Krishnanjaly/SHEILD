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

    db.query("DESCRIBE users", (error, results) => {
        if (error) {
            console.error("Error describing users table:", error);
        } else {
            const hasQrToken = results.some(col => col.Field === 'qr_token');
            console.log("Column 'qr_token' exists:", hasQrToken);
        }
        db.end();
    });
});
