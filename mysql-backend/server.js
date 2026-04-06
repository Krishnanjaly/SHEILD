const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const dns = require("dns");
require("dotenv").config();

dns.setDefaultResultOrder("ipv4first");

const aiRoutes = require("./routes/ai.js");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use("/ai", aiRoutes);

const tmpDir = path.join(__dirname, "tmp_uploads");
if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

const authRoutes = require("./routes/authRoutes");
const contactRoutes = require("./routes/contactRoutes");
const emergencyWorkflow = require("./routes/emergencyWorkflow");
const keywordRoutes = require("./routes/keywordRoutes");

app.use("/", authRoutes);
app.use("/", contactRoutes);
app.use("/", emergencyWorkflow);
app.use("/", keywordRoutes);

app.get("/test-connection", (req, res) => {
  res.json({
    status: "Backend is running",
    success: true,
    timestamp: new Date().toISOString(),
  });
});

const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.get("/generate-signature", (req, res) => {
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
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

const { sendSmsToMany } = require("./services/smsService");

app.post("/send-sos", async (req, res) => {
  try {
    const { email, user_id, latitude, longitude, keyword, risk_level, media_urls } = req.body;
    const normalizedEmail =
      typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const normalizedUserId =
      user_id === undefined || user_id === null || `${user_id}`.trim() === ""
        ? null
        : String(user_id).trim();

    if (!normalizedEmail && !normalizedUserId) {
      return res.status(400).json({
        success: false,
        message: "email or user_id is required",
      });
    }

    console.log("[SMS_API] /send-sos request received", {
      userId: normalizedUserId,
      email: normalizedEmail,
      riskLevel: risk_level || "HIGH",
      hasLatitude: latitude !== undefined && latitude !== null && `${latitude}` !== "",
      hasLongitude: longitude !== undefined && longitude !== null && `${longitude}` !== "",
      mediaCount: Array.isArray(media_urls) ? media_urls.length : 0,
    });

    const riskLevel = risk_level || "HIGH";
    const hasCoordinates =
      latitude !== undefined &&
      latitude !== null &&
      longitude !== undefined &&
      longitude !== null &&
      `${latitude}` !== "" &&
      `${longitude}` !== "";
    const mapUrl = hasCoordinates
      ? `https://www.google.com/maps?q=${latitude},${longitude}`
      : null;

    const db = require("./config/db");
    let users = [];
    if (normalizedUserId) {
      [users] = await db.query("SELECT id, email FROM users WHERE id = ?", [normalizedUserId]);
    } else if (normalizedEmail) {
      [users] = await db.query("SELECT id, email FROM users WHERE email = ?", [normalizedEmail]);
    }

    if (users.length === 0) {
      console.log("[SMS_API] /send-sos user lookup failed", {
        userId: normalizedUserId,
        email: normalizedEmail,
      });
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userId = users[0].id;
    const userEmail = users[0].email;
    const [trustedContacts] = await db.query(
      "SELECT trusted_no FROM trusted_contact WHERE user_id = ?",
      [userId]
    );
    const [legacyContacts] = await db.query(
      "SELECT phone FROM contacts WHERE user_id = ?",
      [userId]
    );

    const uniqueRecipients = [
      ...trustedContacts.map((c) => c.trusted_no),
      ...legacyContacts.map((c) => c.phone),
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.replace(/[^\d+]/g, "").trim())
      .filter((value, index, array) => array.indexOf(value) === index);

    if (uniqueRecipients.length === 0) {
      console.log("[SMS_API] /send-sos no trusted recipients", {
        userId,
        userEmail,
      });
      return res.json({ success: true, message: "No trusted phone numbers to notify" });
    }

    const keywordText = keyword || "MANUAL SOS";
    const timestampText = new Date().toISOString();
    const locationText = mapUrl || "Live location unavailable";
    const mediaUrls = Array.isArray(media_urls)
      ? media_urls.filter((value) => typeof value === "string" && value.trim().length > 0)
      : [];
    const mediaText = mediaUrls.length > 0 ? mediaUrls.join("\n") : "No media attached yet";

    const smsMessage = `SHEILD ${riskLevel} ALERT
Trigger: ${keywordText}
Location: ${locationText}
Time: ${timestampText}
Media: ${mediaText}
Please check on the user immediately.`;

    const smsResult = await sendSmsToMany(uniqueRecipients, smsMessage);
    console.log("[SMS_API] /send-sos send completed", {
      userId,
      userEmail,
      recipients: smsResult.sent,
      riskLevel,
    });
    res.json({
      success: true,
      message: "Emergency SMS alerts sent successfully",
      recipients: smsResult.sent,
      failed: smsResult.failed,
    });
  } catch (error) {
    console.error("SOS SMS error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send SOS SMS alerts",
      error: error.message,
      code: error.code || null,
      command: error.command || null,
      response: error.response || null,
    });
  }
});

app.post("/send-safe", async (req, res) => {
  try {
    const { email, user_id, user_name } = req.body;
    const normalizedEmail =
      typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null;
    const normalizedUserId =
      user_id === undefined || user_id === null || `${user_id}`.trim() === ""
        ? null
        : String(user_id).trim();

    if (!normalizedEmail && !normalizedUserId) {
      return res.status(400).json({
        success: false,
        message: "email or user_id is required",
      });
    }

    console.log("[SMS_API] /send-safe request received", {
      userId: normalizedUserId,
      email: normalizedEmail,
      hasUserName: typeof user_name === "string" && user_name.trim().length > 0,
    });

    const db = require("./config/db");
    let users = [];
    if (normalizedUserId) {
      [users] = await db.query("SELECT id, email, name FROM users WHERE id = ?", [normalizedUserId]);
    } else if (normalizedEmail) {
      [users] = await db.query("SELECT id, email, name FROM users WHERE email = ?", [normalizedEmail]);
    }

    if (users.length === 0) {
      console.log("[SMS_API] /send-safe user lookup failed", {
        userId: normalizedUserId,
        email: normalizedEmail,
      });
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[0];
    const [trustedContacts] = await db.query(
      "SELECT trusted_no FROM trusted_contact WHERE user_id = ?",
      [user.id]
    );
    const [legacyContacts] = await db.query(
      "SELECT phone FROM contacts WHERE user_id = ?",
      [user.id]
    );

    const uniqueRecipients = [
      ...trustedContacts.map((c) => c.trusted_no),
      ...legacyContacts.map((c) => c.phone),
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.replace(/[^\d+]/g, "").trim())
      .filter((value, index, array) => array.indexOf(value) === index);

    if (uniqueRecipients.length === 0) {
      console.log("[SMS_API] /send-safe no trusted recipients", {
        userId: user.id,
        userEmail: user.email,
      });
      return res.json({ success: true, message: "No trusted phone numbers to notify" });
    }

    const safeUserName =
      typeof user_name === "string" && user_name.trim().length > 0
        ? user_name.trim()
        : user.name || user.email;

    const smsResult = await sendSmsToMany(
      uniqueRecipients,
      `SHEILD SAFE UPDATE\n${safeUserName} is SAFE now. Please ignore the previous emergency alert.`
    );
    console.log("[SMS_API] /send-safe send completed", {
      userId: user.id,
      userEmail: user.email,
      recipients: smsResult.sent,
    });
    res.json({
      success: true,
      message: "Safe SMS alerts sent successfully",
      recipients: smsResult.sent,
      failed: smsResult.failed,
    });
  } catch (error) {
    console.error("Safe SMS error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send safe SMS alerts",
      error: error.message,
      code: error.code || null,
      command: error.command || null,
      response: error.response || null,
    });
  }
});

app.get("/get-all-contacts-debug", async (req, res) => {
  try {
    const [contacts] = await require("./config/db").query("SELECT * FROM trusted_contact");
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SHEILD API Server running on port ${PORT}`);
});
