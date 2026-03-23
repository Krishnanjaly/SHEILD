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

    db.query("DESCRIBE contacts", (error, results) => {
        if (error) {
            console.error("Error describing contacts table:", error);
        } else {
            console.log("Contacts Columns:", results.map(r => r.Field));
        }
        db.end();
    });
});
