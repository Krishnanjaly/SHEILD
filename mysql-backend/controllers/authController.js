const db = require("../config/db");
const bcrypt = require("bcryptjs");
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

// 🔹 REGISTER (Standard Username/Email/Pass)
const register = async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({
      success: false,
      message: "Missing username, email, or password",
    });
  }

  try {
    // Check if user already exists (username or email)
    const [existing] = await db.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [email, username]
    );

    if (existing.length > 0) {
      const field = existing[0].email === email ? "Email" : "Username";
      return res.status(400).json({
        success: false,
        message: `${field} already exists.`,
      });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert into DB
    const [result] = await db.query(
      "INSERT INTO users (username, name, email, password) VALUES (?, ?, ?, ?)",
      [username, username, email, hashedPassword]
    );

    res.status(201).json({
      success: true,
      user: {
        id: result.insertId,
        username,
        email,
      },
      message: "User registered successfully!",
    });
  } catch (error) {
    console.error("❌ Register Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

// 🔹 LOGIN (Standard Identifier/Pass)
const login = async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({
      success: false,
      message: "Missing identifier or password",
    });
  }

  try {
    // Find user by username or email
    const [users] = await db.query(
      "SELECT * FROM users WHERE email = ? OR username = ?",
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    const user = users[0];

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials.",
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name || user.username,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error("❌ Login Error:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  googleAuth,
  registerUser,
  getUser,
  register,
  login,
};