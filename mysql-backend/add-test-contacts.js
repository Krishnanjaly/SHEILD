const mysql = require("mysql2");
require("dotenv").config();

// Create connection using same config as server.js
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

// Test contacts to add
const testContacts = [
  {
    user_id: "U101",
    trusted_name: "Emergency Contact 1",
    trusted_no: "1234567890",
    relationship_type: "family",
    latitude: 40.7128,
    longitude: -74.0060
  },
  {
    user_id: "U101", 
    trusted_name: "Emergency Contact 2",
    trusted_no: "9876543210",
    relationship_type: "friend",
    latitude: 40.7580,
    longitude: -73.9855
  },
  {
    user_id: "U101",
    trusted_name: "Emergency Contact 3", 
    trusted_no: "5551234567",
    relationship_type: "colleague",
    latitude: 40.7831,
    longitude: -73.9712
  }
];

async function addTestContacts() {
  try {
    console.log("🔧 Adding test contacts to database...");
    
    for (const contact of testContacts) {
      const sql = `
        INSERT INTO Trusted_Contact 
        (user_id, trusted_name, trusted_no, relationship_type, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?)
      `;
      
      await db.promise().query(sql, [
        contact.user_id,
        contact.trusted_name,
        contact.trusted_no,
        contact.relationship_type,
        contact.latitude,
        contact.longitude
      ]);
      
      console.log(`✅ Added: ${contact.trusted_name} (${contact.trusted_no})`);
    }
    
    // Verify contacts were added
    const [rows] = await db.promise().query("SELECT * FROM Trusted_Contact WHERE user_id = ?", ["U101"]);
    console.log(`\n📋 Total contacts for user U101: ${rows.length}`);
    rows.forEach(contact => {
      console.log(`   - ${contact.trusted_name}: ${contact.trusted_no}`);
    });
    
    console.log("\n🎉 Test contacts added successfully!");
    console.log("📞 Now trigger a high-risk alert in your app to test the calling system.");
    
  } catch (error) {
    console.error("❌ Error adding contacts:", error);
  } finally {
    db.end();
  }
}

addTestContacts();
