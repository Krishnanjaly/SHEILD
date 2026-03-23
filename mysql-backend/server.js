const express = require("express");
/**
 * DB Table Schema for High-Risk Alerts:
 * 
 * CREATE TABLE emergency_incidents (
 *   id INT AUTO_INCREMENT PRIMARY KEY,
 *   user_id INT,
 *   detected_keyword VARCHAR(255),
 *   location_url TEXT,
 *   recording_url TEXT,
 *   contacts_notified JSON,
 *   status VARCHAR(50),
 *   cloudinary_public_id VARCHAR(255),
 *   created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * );
 */
const mysql = require("mysql2");

const cors = require("cors");
const nodemailer = require("nodemailer");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

/* ================================
   🔹 CLOUDINARY CONFIGURATION
================================ */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});




// Multer — stores uploaded file to disk temporarily
const tmpDir = path.join(__dirname, "tmp_uploads");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB cap
});

/* ================================
   🔹 MySQL Connection Pool
================================ */

const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

db.getConnection((err, connection) => {
  if (err) {
    console.log("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL");
    connection.release();
  }
});

/* ================================
   🔹 EMAIL TRANSPORTER
================================ */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* ================================
   🔹 SEND EMAIL OTP
================================ */

app.post("/send-email-otp", (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "Email required",
    });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  const sql = `
    INSERT INTO email_otps (email, otp)
    VALUES (?, ?)
  `;

  db.query(sql, [email, otp], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({
        success: false,
        message: "Database error",
      });
    }

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Your SHIELD OTP Code",
      text: `Your OTP code is ${otp}. It expires in 5 minutes.`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.log(error);
        return res.status(500).json({
          success: false,
          message: "Failed to send email",
        });
      }

      res.json({
        success: true,
        message: "OTP sent to email",
      });
    });
  });
});

/* ================================
   🔹 VERIFY EMAIL OTP
================================ */

app.post("/verify-email-otp", (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Missing fields",
    });
  }

  const sql = `
    SELECT * FROM email_otps
    WHERE email = ? AND otp = ?
    AND created_at >= NOW() - INTERVAL 5 MINUTE
    ORDER BY created_at DESC
    LIMIT 1
  `;

  db.query(sql, [email, otp], (err, results) => {
    if (err) return res.status(500).json({ success: false });

    if (results.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired OTP",
      });
    }

    db.query(
      "SELECT * FROM users WHERE email = ?",
      [email],
      (err2, userResult) => {
        if (err2) return res.status(500).json({ success: false });

        if (userResult.length > 0) {
          return res.json({
            success: true,
            existingUser: true,
            user: userResult[0],
          });
        } else {
          return res.json({
            success: true,
            existingUser: false,
          });
        }
      }
    );
  });
});

/* ================================
   🔹 REGISTER USER
================================ */
app.post("/register-user", (req, res) => {
  const { name, age, bloodGroup, notes, password, aiEnabled, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "Missing required fields",
    });
  }

  const sql = `
    INSERT INTO users 
    (name, age, blood_group, notes, password, ai_enabled, email)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [name, age, bloodGroup, notes, password, aiEnabled, email],
    (err) => {
      if (err) {
        return res.status(500).json({ success: false });
      }

      res.json({ success: true });
    }
  );
});
/* ================================
   🔹 GET USER (BY PHONE OR EMAIL)
================================ */
app.get("/user/:email", (req, res) => {
  const { email } = req.params;

  const sql = "SELECT * FROM users WHERE email = ?";

  db.query(sql, [email], (err, results) => {
    if (err) return res.status(500).json({ success: false });

    if (results.length > 0) {
      res.json(results[0]);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  });
});
/* ================================
   🔹 UPDATE USER
================================ */
app.put("/update-user/:email", (req, res) => {
  const { email } = req.params;
  const { name, age, bloodGroup, notes, aiEnabled } = req.body;

  const sql = `
    UPDATE users
    SET name = ?, age = ?, blood_group = ?, notes = ?, ai_enabled = ?
    WHERE email = ?
  `;

  db.query(
    sql,
    [name, age, bloodGroup, notes, aiEnabled, email],
    (err) => {
      if (err) return res.status(500).json({ success: false });

      res.json({ success: true });
    }
  );
});
/* ================================
   🔹 ADD CONTACT
================================ */
app.post("/add-contact", async (req, res) => {
  const {
    email,
    name,
    relation,
    phone,
    contact_email,
    location,
    notes,
    gender,
  } = req.body;

  try {
    // 1️⃣ Get user ID from email
    const [userRows] = await db.promise().query(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = userRows[0].id;

    // 2️⃣ Insert contact using user_id
    const query = `
      INSERT INTO contacts 
      (user_id, name, relation, phone, contact_email, location, notes, gender)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    await db.promise().query(query, [
      userId,
      name,
      relation,
      phone,
      contact_email,
      location,
      notes,
      gender,
    ]);

    res.json({ message: "Contact added successfully" });

  } catch (err) {
    console.error("Add Contact Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================================
   🔹 UPDATE CONTACT
================================ */
app.post("/update-contact", (req, res) => {
  const { id, name, relation, phone, location, notes, gender } = req.body;

  if (!id) {
    return res.status(400).json({ success: false, message: "Contact ID required" });
  }

  const sql = `
    UPDATE contacts
    SET name = ?, relation = ?, phone = ?, location = ?, notes = ?, gender = ?
    WHERE id = ?
  `;

  db.query(sql, [name, relation, phone, location, notes, gender, id], (err) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ success: false, message: "Database error" });
    }
    res.json({ success: true, message: "Contact updated successfully" });
  });
});

/* ================================
   🔹 GET CONTACTS BY USER EMAIL
================================ */
app.get("/contacts/:email", async (req, res) => {
  const { email } = req.params;

  try {
    const [rows] = await db.promise().query(
      `SELECT contacts.*
       FROM contacts
       JOIN users ON contacts.user_id = users.id
       WHERE users.email = ?`,
      [email]
    );

    res.json({ contacts: rows });

  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});
/* ================================
   🔹 DELETE CONTACT
================================ */
app.delete("/delete-contact/:id", (req, res) => {
  const { id } = req.params;

  db.query(
    "DELETE FROM contacts WHERE id = ?",
    [id],
    (err, result) => {
      if (err) {
        return res.status(500).json({ message: "Delete failed" });
      }

      res.json({ message: "Deleted successfully" });
    }
  );
});


app.put("/update-contact/:id", async (req, res) => {
  const {
    name,
    relation,
    phone,
    contact_email,   // 👈 ADD THIS
    location,
    notes,
    gender,
  } = req.body;

  const { id } = req.params;

  try {
    await db.promise().query(
      `UPDATE contacts 
       SET name=?, relation=?, phone=?, contact_email=?, location=?, notes=?, gender=? 
       WHERE id=?`,
      [name, relation, phone, contact_email, location, notes, gender, id]
    );

    res.json({ message: "Contact updated successfully" });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

/* ================================
   🔹 START SERVER
================================ */

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});



app.post("/send-sos", async (req, res) => {
  const { email, latitude, longitude, keyword, risk_level } = req.body;

  try {
    const [userRows] = await db.promise().query(
      "SELECT id, name FROM users WHERE email = ?", [email]
    );

    if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

    const userId = userRows[0].id;
    const userName = userRows[0].name;

    const [contacts] = await db.promise().query(
      "SELECT contact_email FROM contacts WHERE user_id = ? AND contact_email IS NOT NULL AND contact_email != ''",
      [userId]
    );

    if (contacts.length === 0) return res.status(400).json({ message: "No trusted emails found" });

    const recipients = contacts.map(c => c.contact_email).filter(Boolean);
    const timestamp = new Date().toLocaleString();

    let subject = "Low Risk Alert – SHIELD Safety Notification";
    let body = `A low-risk keyword was detected.\n\nUser ID: ${userId}\nDetected Keyword: ${keyword || 'Low-Risk Detected'}\nTime: ${timestamp}\n\nLive Location:\nhttps://maps.google.com/?q=${latitude},${longitude}\n\nThis is only a precautionary alert.`;

    if (risk_level === 'HIGH') {
      subject = "EMERGENCY ALERT – Possible danger detected";
      body = `A high-risk keyword was detected from the SHIELD safety app.\n\nUser ID: ${userId}\nDetected Keyword: ${keyword}\nTime: ${timestamp}\n\nLive Location:\nhttps://maps.google.com/?q=${latitude},${longitude}\n\nPlease contact the user immediately. Calling contacts now.`;
    }

    await transporter.sendMail({
      from: `"SHIELD Guardian" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: subject,
      text: body,
    });

    // Log to DB
    await db.promise().query(
      `INSERT INTO emergency_incidents (user_id, detected_keyword, location_url, status)
       VALUES (?, ?, ?, ?)`,
      [userId, keyword || "SOS", `https://maps.google.com/?q=${latitude},${longitude}`, risk_level === 'HIGH' ? "HIGH_RISK_SOS_SENT" : "LOW_RISK_ALERT_SENT"]
    );

    res.json({ message: `${risk_level} alert sent successfully` });

  } catch (err) {
    console.error("SOS Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/cancel-sos", async (req, res) => {
  const { email } = req.body;

  try {
    // 1️⃣ Get user
    const [userRows] = await db.promise().query(
      "SELECT id, name FROM users WHERE email = ?",
      [email]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const userId = userRows[0].id;
    const userName = userRows[0].name;

    // 2️⃣ Get trusted contacts using user_id
    const [contacts] = await db.promise().query(
      "SELECT contact_email FROM contacts WHERE user_id = ? AND contact_email IS NOT NULL AND contact_email != ''",
      [userId]
    );

    const recipients = contacts
      .map(c => c.contact_email)
      .filter(Boolean);

    if (recipients.length === 0) {
      return res.status(400).json({ message: "No valid emails found" });
    }

    // 3️⃣ Setup transporter
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    // 4️⃣ Send SAFE email
    const info = await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: recipients,
      subject: "✅ SHIELD ALERT CANCELLED",
      text: `${userName} is SAFE now. Please ignore the previous emergency alert.`,
    });

    console.log("Safe email sent:", info.accepted);

    res.json({ message: "Safe notification sent" });

  } catch (err) {
    console.error("Cancel SOS Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/add-keyword", async (req, res) => {
  const { user_id, keyword_text, security_level } = req.body;

  try {
    await db.promise().query(
      "INSERT INTO emergency_keyword (user_id, keyword_text, security_level) VALUES (?, ?, ?)",
      [user_id, keyword_text.toLowerCase(), security_level]
    );

    res.json({ message: "Keyword added successfully" });
  } catch (error) {
    console.error("Add Keyword Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.get("/get-keywords/:user_id/:level", async (req, res) => {
  const { user_id, level } = req.params;

  try {
    const [rows] = await db.promise().query(
      "SELECT * FROM emergency_keyword WHERE user_id = ? AND security_level = ?",
      [user_id, level]
    );

    res.json(rows);
  } catch (error) {
    console.error("Fetch Keyword Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});


app.delete("/delete-keyword/:id", async (req, res) => {
  try {
    await db.promise().query(
      "DELETE FROM emergency_keyword WHERE keyword_id = ?",
      [req.params.id]
    );

    res.json({ message: "Keyword deleted" });
  } catch (error) {
    console.error("Delete Keyword Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});



app.post("/send-emergency", async (req, res) => {
  try {
    const { recipients, location } = req.body;
    console.log("📨 Emergency route triggered");
    console.log("Recipients:", recipients);
    console.log("Location:", location);

    if (!recipients || recipients.length === 0) {
      return res.status(400).json({ message: "No recipients provided" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"SHIELD Emergency" <${process.env.EMAIL_USER}>`,
      to: recipients,
      subject: "🚨 SHIELD EMERGENCY ALERT 🚨",
      text: `
I may be in danger.

My live location:
${location}

Please help immediately.

— SHIELD Safety App
      `,
    });

    res.status(200).json({ message: "Emergency email sent successfully" });

  } catch (error) {
    console.log("🔥🔥🔥 EMAIL ERROR START 🔥🔥🔥");
    console.log(error);
    console.log("🔥🔥🔥 EMAIL ERROR END 🔥🔥🔥");

    res.status(500).json({
      message: "Failed to send email",
      error: error.message,
    });
  }
});

app.post("/addTrustedContact", (req, res) => {

  const {
    user_id,
    trusted_name,
    trusted_no,
    email,
    relationship_type,
    latitude,
    longitude
  } = req.body;

  const sql = `
    INSERT INTO Trusted_Contact
    (user_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

  db.query(sql,
    [user_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude],
    (err, result) => {

      if (err) {
        console.log(err);
        res.json({ success: false });
      } else {
        res.json({ success: true });
      }

    });
});

app.get("/getTrustedContacts/:user_id", (req, res) => {

  const user_id = req.params.user_id;
  console.log('🔍 Fetching contacts for user_id:', user_id);

  const sql = "SELECT * FROM Trusted_Contact WHERE user_id = ?";

  db.query(sql, [user_id], (err, result) => {

    if (err) {
      console.log('❌ Database error:', err);
      return res.json([]);
    }

    console.log('📋 Query result:', result);
    console.log('📋 Result length:', result?.length);
    res.json(result);

  });
});

// Debug endpoint to test connection
app.get("/test-connection", (req, res) => {
  res.json({ status: "Backend is running", timestamp: new Date().toISOString() });
});

// Debug endpoint to see all contacts
app.get("/get-all-contacts-debug", (req, res) => {
  const sql = "SELECT * FROM Trusted_Contact LIMIT 10";
  
  db.query(sql, (err, result) => {
    if (err) {
      console.log('❌ Debug query error:', err);
      return res.json({ error: err.message });
    }
    
    console.log('🔍 All contacts debug:', result);
    res.json(result);
  });
});

app.get("/keywords/:userId", async (req, res) => {

  const { userId } = req.params;

  const [rows] = await db.promise().query(
    "SELECT keyword_text, security_level FROM emergency_keyword WHERE user_id = ?",
    [userId]
  );

  const lowRisk = [];
  const highRisk = [];

  rows.forEach((row) => {
    if (row.security_level === "LOW") {
      lowRisk.push(row.keyword_text.toLowerCase());
    } else {
      highRisk.push(row.keyword_text.toLowerCase());
    }
  });

  res.json({
    lowRiskKeywords: lowRisk,
    highRiskKeywords: highRisk
  });

});

/* ===================================================
   🔹 UPLOAD RECORDING → CLOUDINARY → DB → SOS EMAIL
=================================================== */
app.post("/upload-recording", upload.single("file"), async (req, res) => {
  const { email, type, location } = req.body;
  const file = req.file;

  if (!file) return res.status(400).json({ message: "No file uploaded" });

  const filePath = file.path;
  let cloudinaryUrl = "";

  try {
    // ── 1. Upload to Cloudinary ──
    console.log("☁️ Uploading to Cloudinary:", file.originalname || file.filename);
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: type === "video" ? "video" : "auto",
      folder: "emergency-recordings",
      public_id: `emergency_${type}_${Date.now()}`,
    });

    cloudinaryUrl = uploadResult.secure_url;
    console.log("✅ Cloudinary URL:", cloudinaryUrl);

    // Delete temp file
    fs.unlink(filePath, () => {});

    // ── 2. Get user from DB ──
    const [userRows] = await db.promise().query(
      "SELECT id, name FROM users WHERE email = ?", [email]
    );
    if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

    const userId = userRows[0].id;
    const userName = userRows[0].name;

    // ── 3. Save URL to emergency_recordings ──
    await db.promise().query(
      `INSERT INTO emergency_recordings (user_id, type, url, filename, recorded_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [userId, type, cloudinaryUrl, `emergency_${type}_${Date.now()}`]
    );
    console.log("✅ Recording URL saved to DB");

    // ── 4. Get trusted contacts ──
    const [contacts] = await db.promise().query(
      "SELECT contact_email FROM contacts WHERE user_id = ? AND contact_email IS NOT NULL AND contact_email != ''",
      [userId]
    );

    if (contacts.length > 0) {
      const recipients = contacts.map(c => c.contact_email).filter(Boolean);

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
      });

      const locationHtml = location && location !== "Location unavailable"
        ? `<p>📍 <a href="${location}" style="color:#ec1313">View Live Location on Google Maps</a></p>`
        : "";

      const typeLabel = type === "video" ? "Video" : "Audio";
      const typeIcon  = type === "video" ? "📹" : "🎙️";

      // ── 5. Send rich HTML SOS email ──
      await transporter.sendMail({
        from: `"SHIELD Emergency" <${process.env.EMAIL_USER}>`,
        to: recipients,
        subject: "🚨 HIGH RISK ALERT - SHIELD",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:2px solid #ec1313;border-radius:12px;overflow:hidden">
            <div style="background:#ec1313;padding:20px;text-align:center">
              <h1 style="color:#fff;margin:0;font-size:22px">🚨 HIGH RISK EMERGENCY ALERT</h1>
            </div>
            <div style="padding:24px;background:#1a0f0f;color:#fff">
              <p style="font-size:16px"><strong>${userName}</strong> has triggered a HIGH RISK emergency alert via the SHIELD safety app.</p>
              ${locationHtml}
              <p>${typeIcon} Emergency ${typeLabel} Recording:<br/>
                <a href="${cloudinaryUrl}" style="color:#ec1313;word-break:break-all">${cloudinaryUrl}</a>
              </p>
              <p style="background:rgba(236,19,19,0.1);border-left:4px solid #ec1313;padding:12px;border-radius:4px">
                ⚠️ Please contact them <strong>IMMEDIATELY</strong> and alert local authorities if necessary.
              </p>
            </div>
            <div style="background:#2a1b1b;padding:12px;text-align:center">
              <p style="color:#888;font-size:11px;margin:0">Sent automatically by SHIELD Safety App</p>
            </div>
          </div>
        `,
      });
      console.log("✅ HIGH RISK SOS email sent to:", recipients);
    } else {
      console.log("⚠️ No trusted contacts found — SOS email not sent");
    }

    res.json({ message: "Recording uploaded and SOS sent", cloudinaryUrl });

  } catch (err) {
    // Always clean up temp file
    if (filePath) fs.unlink(filePath, () => {});
    console.error("Upload Recording Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/* ================================
   🔹 GET RECORDINGS FOR USER
================================ */
app.get("/recordings/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const [userRows] = await db.promise().query(
      "SELECT id FROM users WHERE email = ?", [email]
    );
    if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

    const [rows] = await db.promise().query(
      `(SELECT id, type, url, recorded_at, '' as keyword, '' as location FROM emergency_recordings WHERE user_id = ?)
       UNION
       (SELECT id, 'video' as type, recording_url as url, created_at as recorded_at, detected_keyword as keyword, location_url as location FROM emergency_incidents WHERE user_id = ? AND recording_url IS NOT NULL)
       ORDER BY recorded_at DESC`,
      [userRows[0].id, userRows[0].id]
    );
    res.json(rows);
  } catch (err) {
    console.error("Get Recordings Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===================================================
   🔹 GEN SIGNATURE FOR CLOUDINARY (Secure Direct Upload)
=================================================== */
app.get("/generate-signature", (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp: timestamp,
      folder: "shield_emergency_records",
    },
    process.env.CLOUDINARY_API_SECRET
  );

  res.json({
    signature,
    timestamp,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
  });
});

/* ===================================================
   🔹 EMERGENCY ALERT (GMAIL + LOG)
=================================================== */
app.post("/trigger-emergency-protocol", async (req, res) => {
  const { user_id, keyword, location_link, recording_url, contacts, cloudinary_public_id } = req.body;

  try {
    // 1. Get user name for the email
    const [userRows] = await db.promise().query(
      "SELECT name FROM users WHERE id = ?", [user_id]
    );
    const userName = userRows.length > 0 ? userRows[0].name : `User ${user_id}`;

    // 2. Prepare recipient list
    const recipients = contacts
      .map(c => c.contact_email || c.email)
      .filter(email => email && email.trim() !== "");

    if (recipients.length > 0) {
      const timestamp = new Date().toLocaleString();
      // ── HIGH-RISK EMAIL ──
      const mailOptions = {
        from: `"SHIELD Guardian" <${process.env.EMAIL_USER}>`,
        to: recipients,
        subject: "EMERGENCY ALERT – Possible danger detected",
        text: `A high-risk keyword was detected from the SHIELD safety app.\n\nUser ID: ${user_id}\nDetected Keyword: ${keyword}\nTime: ${timestamp}\n\nLive Location:\n${location_link}\n\nRecording Evidence: ${recording_url}\n\nPlease contact the user immediately.`
      };

      await transporter.sendMail(mailOptions);
      console.log("✅ High-risk alert email sent to:", recipients);
    } else {
      console.log("⚠️ No contact emails found for /trigger-emergency-protocol");
    }

    // 4. Log to Database
    await db.promise().query(
      `INSERT INTO emergency_incidents (user_id, detected_keyword, location_url, recording_url, contacts_notified, status, cloudinary_public_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id || null, keyword || "DETECTION", location_link || "Unknown", recording_url || "", JSON.stringify(contacts || []), "EMAIL_SENT", cloudinary_public_id || null]
    );

    res.json({ success: true, message: "Emergency alerts sent and recorded." });
  } catch (error) {
    console.error("Emergency Protocol Error:", error);
    res.status(500).json({ success: false, message: "Failed to trigger email protocol" });
  }
});

/* ===================================================
   🔹 DELETE INCIDENT (Sync with Cloudinary)
=================================================== */
app.delete("/emergency-incident/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Fetch public_id from DB
    const [rows] = await db.promise().query(
      "SELECT cloudinary_public_id FROM emergency_incidents WHERE id = ?", [id]
    );

    if (rows.length === 0) return res.status(404).json({ message: "Record not found" });

    const publicId = rows[0].cloudinary_public_id;

    // 2. Delete from Cloudinary if exists
    if (publicId) {
      // Note: use 'video' or 'raw' type since audio/video is used.
      const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
      console.log(`Cloudinary Delete Result (${publicId}):`, result);
      
      // Fallback for other storage types
      if (result.result !== 'ok') {
         await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
         await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
      }
    }

    // 3. Delete from Database
    await db.promise().query("DELETE FROM emergency_incidents WHERE id = ?", [id]);

    res.json({ success: true, message: "Incident and Cloudinary asset deleted." });
  } catch (err) {
    console.error("Delete Incident Error:", err);
    res.status(500).json({ message: "Failed to delete incident", error: err.message });
  }
});

/* ===================================================
   🔹 UPDATE INCIDENT STATUS
=================================================== */
app.put("/emergency-incident/:id", async (req, res) => {
  const { id } = req.params;
  const { status, detected_keyword } = req.body;
  try {
    await db.promise().query(
      "UPDATE emergency_incidents SET status = COALESCE(?, status), detected_keyword = COALESCE(?, detected_keyword) WHERE id = ?",
      [status, detected_keyword, id]
    );
    res.json({ success: true, message: "Incident updated successfully" });
  } catch (err) {
    console.error("Update Incident Error:", err);
    res.status(500).json({ message: "Update failed" });
  }
});
/* ===================================================
   🔹 DELETE RECORDING (from emergency_recordings)
=================================================== */
app.delete("/delete-recording/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1. Get recording details including Cloudinary URL
    const [recording] = await db.promise().query(
      "SELECT url FROM emergency_recordings WHERE id = ?",
      [id]
    );
    
    // 2. Delete from database first
    await db.promise().query("DELETE FROM emergency_recordings WHERE id = ?", [id]);
    
    // 3. If recording has Cloudinary URL, also delete from Cloudinary
    if (recording && recording[0] && recording[0].url && recording[0].url.includes('cloudinary')) {
      try {
        // Extract public_id from Cloudinary URL
        const urlParts = recording[0].url.split('/');
        const fileNameWithExt = urlParts[urlParts.length - 1];
        const publicId = fileNameWithExt.split('.')[0]; // Remove file extension
        
        console.log(`🗑️ Also deleting from Cloudinary: ${publicId}`);
        
        // Delete from Cloudinary
        const result = await cloudinary.uploader.destroy(publicId);
        
        if (result.result === 'ok' || result.result === 'not found') {
          console.log(`✅ Cloudinary file deleted: ${publicId}`);
        } else {
          console.warn(`⚠️ Cloudinary deletion issue: ${result.result}`);
        }
      } catch (cloudinaryErr) {
        console.warn('⚠️ Cloudinary deletion error:', cloudinaryErr);
        // Don't fail the whole operation if Cloudinary deletion fails
      }
    }
    
    res.json({ success: true, message: "Recording deleted successfully" });
  } catch (err) {
    console.error("Delete Recording Error:", err);
    res.status(500).json({ message: "Delete failed" });
  }
});

/* ===================================================
  🔹 DELETE FROM CLOUDINARY (by public_id)
=================================================== */
app.delete("/delete-cloudinary/:publicId", async (req, res) => {
  const { publicId } = req.params;
  try {
    console.log(`🗑️ Deleting Cloudinary file with public_id: ${publicId}`);
    
    // Delete from Cloudinary
    const result = await cloudinary.uploader.destroy(publicId);
    
    if (result.result === 'ok' || result.result === 'not found') {
      console.log(`✅ Cloudinary file deleted: ${publicId}`);
      res.json({ 
        success: true, 
        message: "Cloudinary file deleted successfully",
        result: result.result 
      });
    } else {
      console.warn(`⚠️ Cloudinary deletion issue: ${result.result}`);
      res.status(400).json({ 
        success: false, 
        message: "Cloudinary deletion failed",
        result: result.result 
      });
    }
  } catch (err) {
    console.error("Cloudinary Delete Error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Cloudinary deletion failed",
      error: err.message 
    });
  }
});



/* ===================================================
   🔹 QR EMERGENCY ACCESS ENDPOINTS
=================================================== */

// Function to get local IP address for QR URL
const getLocalIp = () => {
    const interfaces = os.networkInterfaces();
    let backupIp = 'localhost';
    
    // Check prioritised interfaces first
    const prioritisations = ['Wi-Fi', 'Ethernet', 'Wireless', 'en0', 'wlan0'];
    
    for (const name of prioritisations) {
        const iface = interfaces[name];
        if (iface) {
            for (const alias of iface) {
                if (alias.family === 'IPv4' && !alias.internal) {
                    return alias.address;
                }
            }
        }
    }

    // Fallback search
    for (const devName in interfaces) {
        const iface = interfaces[devName];
        if (devName.toLowerCase().includes('vbox') || devName.toLowerCase().includes('virtual') || devName.toLowerCase().includes('wsl')) continue;
        
        for (let i = 0; i < iface.length; i++) {
            const alias = iface[i];
            if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
                return alias.address;
            }
        }
    }
    return backupIp;
};

/**
 * Endpoint to generate/fetch secure QR token for user
 * GET /generate-qr/:userId
 */
app.get("/generate-qr/:userId", async (req, res) => {
    const { userId } = req.params;
    const localIp = getLocalIp();

    try {
        // 1. Check if user already has a token
        const [rows] = await db.promise().query(
            "SELECT qr_token FROM users WHERE id = ?", [userId]
        );

        if (rows.length === 0) return res.status(404).json({ message: "User not found" });

        let token = rows[0].qr_token;

        // 2. If no token, generate one
        if (!token) {
            token = crypto.randomBytes(16).toString('hex');
            await db.promise().query(
                "UPDATE users SET qr_token = ? WHERE id = ?", [token, userId]
            );
        }

        const qrUrl = `http://${localIp}:${PORT}/sos-trigger/${token}`;

        res.json({
            token,
            qrUrl
        });

    } catch (err) {
        console.error("Generate QR Error:", err);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * Endpoint triggered when someone scans the emergency QR code
 * GET /sos-trigger/:token
 */
app.get("/sos-trigger/:token", async (req, res) => {
    const { token } = req.params;

    try {
        // 1. Find user by token
        const [userRows] = await db.promise().query(
            "SELECT id, name, email FROM users WHERE qr_token = ?", [token]
        );

        if (userRows.length === 0) {
            return res.status(404).send("<h1>Error</h1><p>Invalid or expired emergency token.</p>");
        }

        const user = userRows[0];
        
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; background: #181111; color: #fff; text-align: center; padding: 50px 20px; }
                    .card { background: #2a1b1b; padding: 30px; border-radius: 20px; border: 1px solid #ec1313; }
                    .btn { background: #ec1313; color: white; padding: 15px 30px; border-radius: 10px; text-decoration: none; display: inline-block; font-weight: bold; margin-top: 20px; border: none; cursor: pointer; }
                    h1 { color: #ec1313; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>🚨 EMERGENCY</h1>
                    <p>You have scanned the emergency code for <strong>${user.name}</strong>.</p>
                    <p>Are you sure you want to send an emergency alert to their trusted contacts?</p>
                    
                    <form action="/sos-confirm/${token}" method="POST">
                        <button type="submit" class="btn">CONFIRM & SEND ALERT</button>
                    </form>
                    
                    <p style="margin-top:20px; color:#888; font-size: 12px;">This will share their current known location with their family.</p>
                </div>
            </body>
            </html>
        `);
    } catch (err) {
        console.error("SOS Trigger Error:", err);
        res.status(500).send("Server Error");
    }
});

/**
 * Confirm post request from the web trigger
 * POST /sos-confirm/:token
 */
app.post("/sos-confirm/:token", async (req, res) => {
    const { token } = req.params;

    try {
        const [userRows] = await db.promise().query(
            "SELECT id, name, email FROM users WHERE qr_token = ?", [token]
        );

        if (userRows.length === 0) return res.status(404).send("Invalid Token");

        const user = userRows[0];

        // Fetch trusted contacts
        const [contacts] = await db.promise().query(
            "SELECT contact_email FROM contacts WHERE user_id = ? AND contact_email IS NOT NULL AND contact_email != ''",
            [user.id]
        );

        if (contacts.length > 0) {
            const recipients = contacts.map(c => c.contact_email).filter(Boolean);
            
            await transporter.sendMail({
                from: `"SHIELD Guardian" <${process.env.EMAIL_USER}>`,
                to: recipients,
                subject: `🚨 QR EMERGENCY ALERT for ${user.name}`,
                text: `URGENT: Someone has scanned the emergency QR code for ${user.name}.\n\nPlease check on them immediately!\n\nThis alert was triggered via a QR scan by a bystander.`,
            });
            
            await db.promise().query(
                "INSERT INTO emergency_incidents (user_id, detected_keyword, status) VALUES (?, ?, ?)",
                [user.id, "QR_SCAN_SOS", "EMAIL_SENT"]
            );
        }

        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { font-family: sans-serif; background: #181111; color: #fff; text-align: center; padding: 50px 20px; }
                    .card { background: #2a1b1b; padding: 30px; border-radius: 20px; border: 1px solid #22c55e; }
                    h1 { color: #22c55e; }
                </style>
            </head>
            <body>
                <div class="card">
                    <h1>✅ ALERT SENT</h1>
                    <p>The emergency alert has been sent to <strong>${user.name}'s</strong> trusted contacts.</p>
                    <p>Thank you for your help.</p>
                </div>
            </body>
            </html>
        `);

    } catch (err) {
        console.error("SOS Confirm Error:", err);
        res.status(500).send("Server Error");
    }
});


