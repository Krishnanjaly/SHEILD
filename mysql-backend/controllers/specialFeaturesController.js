const db = require("../config/db");
const { sendSmsToMany } = require("../services/smsService");
const { sendMail } = require("../services/mailer");

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const getPublicBaseUrl = (req) => {
  if (process.env.PUBLIC_BASE_URL) {
    return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  }

  const protocolHeader = req.headers["x-forwarded-proto"];
  const protocol = Array.isArray(protocolHeader)
    ? protocolHeader[0]
    : protocolHeader || req.protocol || "https";
  const host = req.get("host");
  return `${protocol}://${host}`.replace(/\/$/, "");
};

const normalizeMapUrl = (latitude, longitude) => {
  if (
    latitude === undefined ||
    latitude === null ||
    longitude === undefined ||
    longitude === null ||
    `${latitude}`.trim() === "" ||
    `${longitude}`.trim() === ""
  ) {
    return "Live location unavailable";
  }

  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

const hasLiveCoordinates = (latitude, longitude) =>
  latitude !== undefined &&
  latitude !== null &&
  longitude !== undefined &&
  longitude !== null &&
  `${latitude}`.trim() !== "" &&
  `${longitude}`.trim() !== "";

const getEmergencyContacts = async (userId) => {
  const [trustedContacts] = await db.query(
    "SELECT trusted_name, trusted_no, email FROM trusted_contact WHERE user_id = ?",
    [userId]
  );
  const [legacyContacts] = await db.query(
    "SELECT name, phone, contact_email FROM contacts WHERE user_id = ?",
    [userId]
  );

  const emails = [
    ...trustedContacts.map((contact) => contact.email),
    ...legacyContacts.map((contact) => contact.contact_email),
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, array) => array.indexOf(value) === index);

  const phoneNumbers = [
    ...trustedContacts.map((contact) => contact.trusted_no),
    ...legacyContacts.map((contact) => contact.phone),
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.replace(/[^\d+]/g, "").trim())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);

  return {
    emails,
    phoneNumbers,
  };
};

const sendQrEmailAlerts = async (emails, { user, locationUrl, timestampText }) => {
  if (!emails.length) {
    return { sent: 0, failed: 0, error: null };
  }

  try {
    await sendMail({
      to: emails,
      subject: "SHEILD QR SOS Emergency Alert",
      text: `SHEILD EMERGENCY ALERT: QR SOS
A bystander triggered the user's emergency QR.
User: ${user.name || user.email || `User ${user.id}`}
Trigger: QR SOS
Timestamp: ${timestampText}
Live Location: ${locationUrl}
Please contact the user immediately.`,
    });

    return { sent: emails.length, failed: 0, error: null };
  } catch (error) {
    console.error("QR SOS email alert failed:", error);
    return {
      sent: 0,
      failed: emails.length,
      error: error.message || "Email alert failed",
    };
  }
};

const createQrEmergency = async ({ userId, latitude, longitude }) => {
  const [users] = await db.query("SELECT id, email, name FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return { status: 404, body: { success: false, message: "User not found" } };
  }

  const user = users[0];
  const { emails, phoneNumbers } = await getEmergencyContacts(userId);

  if (phoneNumbers.length === 0 && emails.length === 0) {
    return {
      status: 400,
      body: {
        success: false,
        message: "No emergency phone numbers or emails configured for this user",
      },
    };
  }

  const liveLocationAvailable = hasLiveCoordinates(latitude, longitude);
  const locationUrl = normalizeMapUrl(latitude, longitude);
  const [incident] = await db.query(
    "INSERT INTO emergency_incidents (user_id, detected_keyword, location_url, status) VALUES (?, 'QR_SCAN_TRIGGER', ?, 'ACTIVE')",
    [userId, locationUrl]
  );

  const emergencyId = incident.insertId;

  await db.query(
    "INSERT INTO activity_log (emergency_id, activity_type, timestamp) VALUES (?, 'QR_EMERGENCY_TRIGGERED', NOW())",
    [emergencyId]
  );

  const timestampText = new Date().toISOString();
  const smsText = `SHEILD EMERGENCY ALERT: QR SOS
A bystander triggered the user's emergency QR.
User: ${
    user.name || user.email || `User ${user.id}`
  }
Trigger: QR SOS
Timestamp: ${timestampText}
Live Location: ${locationUrl}
Please contact the user immediately.`;

  const smsResult = await sendSmsToMany(phoneNumbers, smsText);
  const emailResult = await sendQrEmailAlerts(emails, {
    user,
    locationUrl,
    timestampText,
  });

  const anyAlertDelivered = smsResult.sent > 0 || emailResult.sent > 0;

  if (anyAlertDelivered) {
    if (smsResult.sent > 0) {
      await db.query(
        "INSERT INTO emergency_alert (emergency_id, alert_type, alert_time, delivery_status) VALUES (?, 'sms', NOW(), 'SENT')",
        [emergencyId]
      );
    } else if (phoneNumbers.length > 0) {
      await db.query(
        "INSERT INTO emergency_alert (emergency_id, alert_type, alert_time, delivery_status) VALUES (?, 'sms', NOW(), 'FAILED')",
        [emergencyId]
      );
    }

    if (emailResult.sent > 0) {
      await db.query(
        "INSERT INTO emergency_alert (emergency_id, alert_type, alert_time, delivery_status) VALUES (?, 'email', NOW(), 'SENT')",
        [emergencyId]
      );
    }
  } else {
    await db.query(
      "INSERT INTO emergency_alert (emergency_id, alert_type, alert_time, delivery_status) VALUES (?, 'sms', NOW(), 'FAILED')",
      [emergencyId]
    );

    return {
      status: 502,
      body: {
        success: false,
        emergency_id: emergencyId,
        message: "QR SOS was recorded, but alerts were not delivered. Check SMS/email provider configuration and contact details.",
        smsRecipients: phoneNumbers.length,
        smsSent: smsResult.sent,
        smsFailed: smsResult.failed,
        smsResults: smsResult.results,
        emailRecipients: emails.length,
        emailSent: emailResult.sent,
        emailFailed: emailResult.failed,
        emailError: emailResult.error,
        locationUrl,
        liveLocationAvailable,
      },
    };
  }

  return {
    status: 201,
    body: {
      success: true,
      emergency_id: emergencyId,
      message: "QR SOS triggered successfully",
      smsRecipients: phoneNumbers.length,
      smsSent: smsResult.sent,
      smsFailed: smsResult.failed,
      emailRecipients: emails.length,
      emailSent: emailResult.sent,
      emailFailed: emailResult.failed,
      locationUrl,
      liveLocationAvailable,
    },
  };
};

const renderQrEmergencyPage = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).send("Missing userId");
  }

  const [users] = await db.query("SELECT id, name, email FROM users WHERE id = ?", [userId]);
  if (users.length === 0) {
    return res.status(404).send("User not found");
  }

  const user = users[0];
  const pageTitle = `SHEILD QR SOS`;
  const userLabel = escapeHtml(user.name || user.email || `User ${user.id}`);
  const apiBase = getPublicBaseUrl(req);

  return res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${pageTitle}</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #130c0c;
      --panel: #1d1313;
      --panel-border: rgba(255,255,255,0.08);
      --accent: #e11d48;
      --accent-2: #fb7185;
      --text: #f5f5f5;
      --muted: #b8b8b8;
      --success: #22c55e;
      --warn: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Arial, sans-serif;
      background:
        radial-gradient(circle at top, rgba(225,29,72,0.18), transparent 35%),
        linear-gradient(180deg, #160d0d 0%, var(--bg) 100%);
      color: var(--text);
      display: grid;
      place-items: center;
      padding: 20px;
    }
    .card {
      width: min(100%, 460px);
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 24px;
      padding: 28px 22px;
      box-shadow: 0 20px 80px rgba(0,0,0,0.45);
    }
    .badge {
      display: inline-block;
      padding: 8px 12px;
      border-radius: 999px;
      background: rgba(225,29,72,0.14);
      color: #fecdd3;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 12px;
      font-size: 28px;
      line-height: 1.1;
    }
    p {
      margin: 0 0 14px;
      line-height: 1.5;
      color: var(--muted);
    }
    .user {
      color: var(--text);
      font-weight: 700;
    }
    button {
      width: 100%;
      border: 0;
      border-radius: 18px;
      padding: 18px 16px;
      font-size: 16px;
      font-weight: 700;
      color: white;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), var(--accent-2));
      box-shadow: 0 10px 30px rgba(225,29,72,0.35);
    }
    button[disabled] {
      cursor: not-allowed;
      opacity: 0.7;
    }
    .status {
      min-height: 24px;
      margin-top: 18px;
      font-size: 14px;
      color: var(--muted);
    }
    .status.success { color: var(--success); }
    .status.warn { color: var(--warn); }
    .footer {
      margin-top: 18px;
      font-size: 12px;
      color: #8f8f8f;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">SHEILD Emergency QR</div>
    <h1>Send SOS to the emergency contacts of the user</h1>
    <p>This page will send an automatic emergency alert with live location to <span class="user">${userLabel}</span>'s emergency contacts.</p>
    <button id="sosButton">Send SOS to the emergency contacts of the user</button>
    <div id="status" class="status">Ready to request location and send SOS.</div>
    <div class="footer">One tap is required. This page sends SMS alerts with live location to the user's emergency contacts.</div>
  </main>
  <script>
    const button = document.getElementById("sosButton");
    const statusNode = document.getElementById("status");
    const userId = ${JSON.stringify(String(userId))};
    const endpoint = ${JSON.stringify(`${apiBase}/qr/trigger-public`)};

    const setStatus = (text, className) => {
      statusNode.textContent = text;
      statusNode.className = "status" + (className ? " " + className : "");
    };

    const sendSos = async (coords) => {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          latitude: coords ? coords.latitude : null,
          longitude: coords ? coords.longitude : null
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to send SOS");
      }

      const deliveredCount = (data.smsSent || 0) + (data.emailSent || 0);
      const deliveryLabel = data.smsSent > 0
        ? "SMS alert"
        : "email alert";
      const locationSuffix = data.liveLocationAvailable
        ? " with live location"
        : ". Live location was unavailable, so the alert was sent without GPS";
      setStatus("SOS " + deliveryLabel + " sent successfully to " + deliveredCount + " contact route(s)" + locationSuffix + ".", "success");
      button.disabled = true;
      button.textContent = "SOS Sent";
    };

    button.addEventListener("click", () => {
      button.disabled = true;
      setStatus("Getting live location...", "");

      const fallback = () => {
        setStatus("Location unavailable. Sending SOS without live GPS...", "warn");
        sendSos(null).catch((error) => {
          setStatus(error.message || "Unable to send SOS. Check SMS provider setup and contact phone numbers.", "warn");
          button.disabled = false;
        });
      };

      if (!navigator.geolocation) {
        fallback();
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          setStatus("Sending SOS to emergency contacts...", "");
          sendSos({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          }).catch((error) => {
            setStatus(error.message || "Unable to send SOS. Check SMS provider setup and contact phone numbers.", "warn");
            button.disabled = false;
          });
        },
        () => fallback(),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });
  </script>
</body>
</html>`);
};

const triggerFakeCall = async (req, res) => {
  const { user_id, caller_name, trigger_method } = req.body;
  try {
    await db.query(
      "INSERT INTO fake_call (user_id, caller_name, trigger_method, created_at) VALUES (?, ?, ?, NOW())",
      [user_id, caller_name, trigger_method || "manual_button"]
    );
    res.status(201).json({ success: true, message: "Fake call entry created" });
  } catch (error) {
    console.error("Error triggering fake call:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const createAccessLink = async (req, res) => {
  const { evidence_id, access_level, expiry_time } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO access_link (evidence_id, access_level, expiry_time, created_at) VALUES (?, ?, ?, NOW())",
      [evidence_id, access_level || "view", expiry_time]
    );
    res.status(201).json({
      success: true,
      link_id: result.insertId,
      message: "Access link generated",
    });
  } catch (error) {
    console.error("Error creating access link:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const generateQrLink = async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    return res.status(400).json({ success: false, message: "User ID is required" });
  }

  try {
    const [users] = await db.query("SELECT id FROM users WHERE id = ?", [userId]);

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const qrUrl = `${getPublicBaseUrl(req)}/qr-emergency?userId=${encodeURIComponent(
      String(userId)
    )}`;

    return res.json({
      success: true,
      qrUrl,
    });
  } catch (error) {
    console.error("Error generating QR link:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const triggerQR = async (req, res) => {
  try {
    const { user_id, latitude, longitude } = req.body;
    const result = await createQrEmergency({
      userId: user_id,
      latitude,
      longitude,
    });
    return res.status(result.status).json(result.body);
  } catch (error) {
    console.error("Error triggering QR:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  triggerFakeCall,
  createAccessLink,
  generateQrLink,
  renderQrEmergencyPage,
  triggerQR,
};
