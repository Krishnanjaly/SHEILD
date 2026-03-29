const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const aiRoutes = require("./routes/ai.js");

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use("/ai", aiRoutes);

// Temp directory for uploads
const tmpDir = path.join(__dirname, "tmp_uploads");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

// Routes mounting
const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const emergencyWorkflow = require("./routes/emergencyWorkflow");
const keywordRoutes = require("./routes/keywordRoutes");

app.use("/", authRoutes);
app.use("/", contactRoutes);
app.use("/", emergencyWorkflow);
app.use("/", keywordRoutes);

// Additional standalone routes (to be refactored later if needed)
// Basic test route
app.get("/test-connection", (req, res) => {
  res.json({ status: "Backend is running", success: true, timestamp: new Date().toISOString() });
});

// Cloudinary Signature endpoint
const cloudinary = require('cloudinary').v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

app.get("/generate-signature", (req, res) => {
  const timestamp = Math.round((new Date()).getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request({
    timestamp: timestamp,
    folder: 'shield_emergency_records'
  }, process.env.CLOUDINARY_API_SECRET);

  res.json({
    signature,
    timestamp,
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY
  });
});

// Standalone SOS Email endpoint
const nodemailer = require("nodemailer");
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  family: 4, // 🔥 FORCE IPv4
  tls: {
    rejectUnauthorized: false,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

app.post("/send-sos", async (req, res) => {
  try {
    const { email, latitude, longitude, keyword, risk_level } = req.body;
    const mapUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;

    // Find trusted contacts for this user email
    const [user] = await require("./config/db").query("SELECT id FROM users WHERE email = ?", [email]);
    if (user.length === 0) return res.status(404).json({ success: false, message: "User not found" });

    const [contacts] = await require("./config/db").query("SELECT email FROM trusted_contact WHERE user_id = ?", [user[0].id]);

    const recipients = contacts.map(c => c.email).filter(e => e).join(",");
    if (!recipients) return res.json({ success: true, message: "No trusted emails to notify" });

    const mailOptions = {
      // ... rest of email logic stays same ...
      from: process.env.EMAIL_USER,
      to: recipients,
      subject: `🚨 EMERGENCY ALERT FROM SHEILD: ${risk_level} RISK`,
      text: `Urgent! A ${risk_level} security risk was detected. \nKeyword: ${keyword || 'None'}\nLocation: ${mapUrl}\nPlease check on the user immediately.`,
      html: `<h3>🚨 SHEILD EMERGENCY ALERT</h3>
             <p>A <strong>${risk_level} risk</strong> has been detected for the user associated with ${email}.</p>
             <p><strong>Detected Keyword:</strong> ${keyword || 'None'}</p>
             <p><strong>Real-time Location:</strong> <a href="${mapUrl}">View on Google Maps</a></p>
             <br/>
             <p><em>Check on your contact immediately. This is an automated alert.</em></p>`
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Emergency emails sent successfully" });
  } catch (error) {
    console.error("SOS Email error:", error);
    res.status(500).json({ success: false, message: "Failed to send SOS emails" });
  }
});

// Debug route for contacts
app.get("/get-all-contacts-debug", async (req, res) => {
  try {
    const [contacts] = await require("./config/db").query("SELECT * FROM trusted_contact");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Port listener
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SHEILD API Server running on port ${PORT}`);
});
