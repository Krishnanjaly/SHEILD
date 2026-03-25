const db = require("../config/db");
require("dotenv").config();

// 🔹 GOOGLE AUTH
const googleAuth = async (req, res) => {
  const { email, name, profile_pic } = req.body;

  if (!email || !name) {
    return res.status(400).json({ success: false, message: "Missing Google data" });
  }

  try {
    // 1. Check if user exists
    const [results] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    let userData;

    if (results.length > 0) {
      // User exists
      userData = results[0];
      console.log(`✅ Google user logged in: ${email}`);
    } else {
      // 🆕 Create new user (Google login is trusted)
      // Including defaults for fields that might be mandatory in the schema
      const [insertResult] = await db.query(
        "INSERT INTO users (name, email, notes, age, blood_group, password, ai_enabled) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [name, email, 'Registered via Google', 0, 'Unknown', 'google_auth_placeholder', 0]
      );
      
      const [newUser] = await db.query(
        "SELECT * FROM users WHERE id = ?",
        [insertResult.insertId]
      );
      userData = newUser[0];
      console.log(`🆕 New Google user registered: ${email}`);
    }

    res.json({
      success: true,
      user: userData
    });

  } catch (error) {
    console.error("❌ Google Auth Error:", error);
    res.status(500).json({ success: false, message: "Database error during Google login" });
  }
};

// 🔹 REGISTER USER (Legacy / Manual fallback)
const registerUser = async (req, res) => {
  const { name, age, bloodGroup, notes, password, aiEnabled, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  try {
    await db.query(
      `INSERT INTO users 
       (name, age, blood_group, notes, password, ai_enabled, email) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, age, bloodGroup, notes, password, aiEnabled, email]
    );

    res.json({ success: true });

  } catch (error) {
    console.error("❌ Register Error:", error);
    res.status(500).json({ success: false });
  }
};

// 🔹 GET USER
const getUser = async (req, res) => {
  const { email } = req.params;

  try {
    const [results] = await db.query(
      "SELECT * FROM users WHERE email = ?",
      [email]
    );

    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.status(404).json({ message: "User not found" });
    }

  } catch (error) {
    console.error("❌ Get User Error:", error);
    res.status(500).json({ success: false });
  }
};

module.exports = {
  googleAuth,
  registerUser,
  getUser,
};