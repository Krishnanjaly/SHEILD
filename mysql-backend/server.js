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

const { sendSafeEmail } = require("./services/alertService");
const { sendMail, assertMailConfig } = require("./services/mailer");

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
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userId = users[0].id;
    const userEmail = users[0].email;
    const [trustedContacts] = await db.query(
      "SELECT email FROM trusted_contact WHERE user_id = ?",
      [userId]
    );
    const [legacyContacts] = await db.query(
      "SELECT contact_email FROM contacts WHERE user_id = ?",
      [userId]
    );

    const uniqueRecipients = [
      ...trustedContacts.map((c) => c.email),
      ...legacyContacts.map((c) => c.contact_email),
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase())
      .filter((value, index, array) => array.indexOf(value) === index);

    if (uniqueRecipients.length === 0) {
      return res.json({ success: true, message: "No trusted emails to notify" });
    }

    assertMailConfig();

    const keywordText = keyword || "MANUAL SOS";
    const timestampText = new Date().toISOString();
    const locationText = mapUrl || "Live location unavailable";
    const mediaUrls = Array.isArray(media_urls)
      ? media_urls.filter((value) => typeof value === "string" && value.trim().length > 0)
      : [];
    const mediaText = mediaUrls.length > 0 ? mediaUrls.join("\n") : "No media attached yet";
    const mediaHtml =
      mediaUrls.length > 0
        ? `<p><strong>Media URLs:</strong></p><ul>${mediaUrls
            .map((url) => `<li><a href="${url}">${url}</a></li>`)
            .join("")}</ul>`
        : `<p><strong>Media URLs:</strong> No media attached yet</p>`;

    const mailOptions = {
      to: uniqueRecipients,
      subject: `EMERGENCY ALERT FROM SHEILD: ${riskLevel} RISK`,
      text: `Urgent! A ${riskLevel} security risk was detected for ${userEmail}.
Trigger: ${keywordText}
Live location: ${locationText}
Timestamp: ${timestampText}
Media URLs:
${mediaText}
Please check on the user immediately.`,
      html: `<h3>SHEILD EMERGENCY ALERT</h3>
             <p>A <strong>${riskLevel} risk</strong> was detected for the user associated with <strong>${userEmail}</strong>.</p>
             <p><strong>Trigger:</strong> ${keywordText}</p>
             <p><strong>Timestamp:</strong> ${timestampText}</p>
             ${
               mapUrl
                 ? `<p><strong>Live location:</strong> <a href="${mapUrl}">${mapUrl}</a></p>`
                 : `<p><strong>Live location:</strong> unavailable</p>`
             }
             ${mediaHtml}
             <p><em>Check on your contact immediately. This is an automated alert.</em></p>`,
    };

    await sendMail(mailOptions);
    res.json({
      success: true,
      message: "Emergency emails sent successfully",
      recipients: uniqueRecipients.length,
    });
  } catch (error) {
    console.error("SOS Email error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send SOS emails",
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

    const db = require("./config/db");
    let users = [];
    if (normalizedUserId) {
      [users] = await db.query("SELECT id, email, name FROM users WHERE id = ?", [normalizedUserId]);
    } else if (normalizedEmail) {
      [users] = await db.query("SELECT id, email, name FROM users WHERE email = ?", [normalizedEmail]);
    }

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[0];
    const [trustedContacts] = await db.query(
      "SELECT email FROM trusted_contact WHERE user_id = ?",
      [user.id]
    );
    const [legacyContacts] = await db.query(
      "SELECT contact_email FROM contacts WHERE user_id = ?",
      [user.id]
    );

    const uniqueRecipients = [
      ...trustedContacts.map((c) => c.email),
      ...legacyContacts.map((c) => c.contact_email),
    ]
      .filter((value) => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim().toLowerCase())
      .filter((value, index, array) => array.indexOf(value) === index);

    if (uniqueRecipients.length === 0) {
      return res.json({ success: true, message: "No trusted emails to notify" });
    }

    assertMailConfig();

    const safeUserName =
      typeof user_name === "string" && user_name.trim().length > 0
        ? user_name.trim()
        : user.name || user.email;

    await sendSafeEmail(uniqueRecipients.join(","), safeUserName);
    res.json({
      success: true,
      message: "Safe emails sent successfully",
      recipients: uniqueRecipients.length,
    });
  } catch (error) {
    console.error("Safe Email error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to send safe emails",
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
