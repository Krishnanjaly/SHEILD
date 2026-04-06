const db = require("../config/db");
const cloudinary = require("cloudinary").v2;
const { sendSmsToMany } = require("../services/smsService");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const getEmergencyRecipients = async (userId) => {
  const [trustedContacts] = await db.query(
    "SELECT trusted_no FROM trusted_contact WHERE user_id = ?",
    [userId]
  );
  const [legacyContacts] = await db.query(
    "SELECT phone FROM contacts WHERE user_id = ?",
    [userId]
  );

  return [
    ...trustedContacts.map((contact) => contact.trusted_no),
    ...legacyContacts.map((contact) => contact.phone),
  ]
    .filter((value) => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.replace(/[^\d+]/g, "").trim())
    .filter((value, index, array) => array.indexOf(value) === index);
};

const getCloudinaryPublicIdFromUrl = (url) => {
  if (!url || typeof url !== "string" || !url.includes("cloudinary")) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const uploadIndex = parsedUrl.pathname.indexOf("/upload/");
    if (uploadIndex === -1) {
      return null;
    }

    let publicPath = parsedUrl.pathname.slice(uploadIndex + "/upload/".length);
    publicPath = publicPath.replace(/^v\d+\//, "");
    return publicPath.replace(/\.[^/.]+$/, "");
  } catch (error) {
    console.log("Unable to parse Cloudinary URL:", error);
    return null;
  }
};

const startEmergency = async (req, res) => {
  const { user_id, detected_keyword, location_url } = req.body;
  try {
    const [result] = await db.query(
      "INSERT INTO emergency_incidents (user_id, detected_keyword, location_url, status) VALUES (?, ?, ?, 'ACTIVE')",
      [user_id, detected_keyword || null, location_url]
    );

    res.status(201).json({
      success: true,
      emergency_id: result.insertId,
      message: "Emergency incident started",
    });
  } catch (error) {
    console.error("Error starting emergency:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const endEmergency = async (req, res) => {
  const { emergency_id } = req.body;
  try {
    await db.query(
      "UPDATE emergency_incidents SET status = 'RESOLVED' WHERE id = ?",
      [emergency_id]
    );
    res.json({ success: true, message: "Emergency incident resolved" });
  } catch (error) {
    console.error("Error ending emergency:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const storeAudio = async (req, res) => {
  const { emergency_id, audio_file_path } = req.body;
  try {
    await db.query(
      "INSERT INTO audio_record (emergency_id, audio_file_path, encryption_status) VALUES (?, ?, TRUE)",
      [emergency_id, audio_file_path]
    );
    res.status(201).json({ success: true, message: "Audio record stored" });
  } catch (error) {
    console.error("Error storing audio:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const storeVideo = async (req, res) => {
  const { emergency_id, camera_type, video_file_path } = req.body;
  try {
    await db.query(
      "INSERT INTO video_record (emergency_id, camera_type, video_file_path, encryption_status) VALUES (?, ?, ?, TRUE)",
      [emergency_id, camera_type, video_file_path]
    );
    res.status(201).json({ success: true, message: "Video record stored" });
  } catch (error) {
    console.error("Error storing video:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const storeEvidence = async (req, res) => {
  const { emergency_id, evidence_type } = req.body;
  try {
    await db.query(
      "INSERT INTO cloud_evidence (emergency_id, evidence_type, upload_time, retention_status) VALUES (?, ?, NOW(), 'ACTIVE')",
      [emergency_id, evidence_type]
    );
    res.status(201).json({ success: true, message: "Evidence logged" });
  } catch (error) {
    console.error("Error logging evidence:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const logAlert = async (req, res) => {
  const { emergency_id, alert_type } = req.body;
  try {
    await db.query(
      "INSERT INTO emergency_alert (emergency_id, alert_type, alert_time, delivery_status) VALUES (?, ?, NOW(), 'SENT')",
      [emergency_id, alert_type]
    );
    res.status(201).json({ success: true, message: "Alert logged" });
  } catch (error) {
    console.error("Error logging alert:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const logCall = async (req, res) => {
  const { emergency_id, call_status } = req.body;
  try {
    await db.query(
      "INSERT INTO emergency_call (emergency_id, call_time, call_status) VALUES (?, NOW(), ?)",
      [emergency_id, call_status]
    );
    res.status(201).json({ success: true, message: "Call logged" });
  } catch (error) {
    console.error("Error logging call:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const triggerEmergencyProtocol = async (req, res) => {
  const {
    user_id,
    keyword,
    location_link,
    recording_url,
    cloudinary_public_id,
    device_id,
    risk_level,
    media_type,
  } = req.body;

  if (!user_id || !recording_url) {
    return res
      .status(400)
      .json({ success: false, message: "user_id and recording_url are required" });
  }

  try {
    const [users] = await db.query(
      "SELECT id, email FROM users WHERE id = ?",
      [user_id]
    );

    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const user = users[0];
    const recordingType = media_type || "video";
    const filename = recording_url.split("/").pop() || `emergency_${recordingType}`;

    const [recordingResult] = await db.query(
      "INSERT INTO emergency_recordings (user_id, type, url, filename, recorded_at) VALUES (?, ?, ?, ?, NOW())",
      [user_id, recordingType, recording_url, filename]
    );

    const [activeIncidents] = await db.query(
      "SELECT id FROM emergency_incidents WHERE user_id = ? AND status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1",
      [user_id]
    );

    let emergencyId = null;
    if (activeIncidents.length > 0) {
      emergencyId = activeIncidents[0].id;
      await db.query(
        "UPDATE emergency_incidents SET recording_url = ?, cloudinary_public_id = ?, contacts_notified = 'PENDING' WHERE id = ?",
        [recording_url, cloudinary_public_id || null, emergencyId]
      );
      await db.query(
        "INSERT INTO cloud_evidence (emergency_id, evidence_type, upload_time, retention_status) VALUES (?, ?, NOW(), 'ACTIVE')",
        [emergencyId, recordingType]
      );
    }

    const recipients = await getEmergencyRecipients(user_id);
    if (recipients.length > 0) {
      const text = `SHEILD Emergency Evidence: ${(risk_level || "HIGH").toUpperCase()} RISK
Emergency evidence captured for ${user.email}.
Trigger: ${keyword || "High-risk detected"}
Location: ${location_link || "Unavailable"}
Recording URL: ${recording_url}
Device: ${device_id || "Unknown"}
`;

      await sendSmsToMany(recipients, text);

      if (emergencyId) {
        await db.query(
          "UPDATE emergency_incidents SET contacts_notified = 'YES' WHERE id = ?",
          [emergencyId]
        );
      }
    }

    return res.status(201).json({
      success: true,
      recording_id: recordingResult.insertId,
      emergency_id: emergencyId,
      message: "Emergency protocol executed",
    });
  } catch (error) {
    console.error("Error triggering emergency protocol:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getRecordingsByEmail = async (req, res) => {
  const { email } = req.params;

  try {
    const [users] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (users.length === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const userId = users[0].id;
    const [rows] = await db.query(
      `SELECT 
          er.id,
          er.type,
          er.url,
          er.filename,
          er.recorded_at,
          ei.detected_keyword AS keyword,
          ei.location_url AS location
       FROM emergency_recordings er
       LEFT JOIN emergency_incidents ei
         ON ei.user_id = er.user_id
        AND ei.recording_url = er.url
       WHERE er.user_id = ?
       ORDER BY er.recorded_at DESC`,
      [userId]
    );

    return res.json(rows);
  } catch (error) {
    console.error("Error fetching recordings:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getRecordingsByUserId = async (req, res) => {
  const { userId } = req.params;

  try {
    const [rows] = await db.query(
      `SELECT
          er.id,
          er.type,
          er.url,
          er.filename,
          er.recorded_at,
          ei.detected_keyword AS keyword,
          ei.location_url AS location
       FROM emergency_recordings er
       LEFT JOIN emergency_incidents ei
         ON ei.user_id = er.user_id
        AND ei.recording_url = er.url
       WHERE er.user_id = ?
       ORDER BY er.recorded_at DESC`,
      [userId]
    );

    return res.json(rows);
  } catch (error) {
    console.error("Error fetching recordings by userId:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const deleteRecording = async (req, res) => {
  const { id } = req.params;

  try {
    const [recordings] = await db.query(
      "SELECT id, url FROM emergency_recordings WHERE id = ?",
      [id]
    );

    if (recordings.length === 0) {
      return res.status(404).json({ success: false, message: "Recording not found" });
    }

    const recording = recordings[0];
    const publicId = getCloudinaryPublicIdFromUrl(recording.url);
    let cloudinaryResult = null;

    if (publicId) {
      cloudinaryResult = await cloudinary.uploader.destroy(publicId, {
        resource_type: "video",
      });
    }

    const [result] = await db.query(
      "DELETE FROM emergency_recordings WHERE id = ?",
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Recording not found" });
    }

    await db.query(
      "UPDATE emergency_incidents SET recording_url = NULL, cloudinary_public_id = NULL WHERE recording_url = ?",
      [recording.url]
    );

    return res.json({
      success: true,
      message: "Recording deleted",
      cloudinary: cloudinaryResult,
    });
  } catch (error) {
    console.error("Error deleting recording:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const renameRecording = async (req, res) => {
  const { id } = req.params;
  const { filename } = req.body;
  const cleanedFilename = typeof filename === "string" ? filename.trim() : "";

  if (!cleanedFilename) {
    return res.status(400).json({ success: false, message: "filename is required" });
  }

  try {
    const [result] = await db.query(
      "UPDATE emergency_recordings SET filename = ? WHERE id = ?",
      [cleanedFilename, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "Recording not found" });
    }

    return res.json({ success: true, message: "Recording renamed", filename: cleanedFilename });
  } catch (error) {
    console.error("Error renaming recording:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const deleteCloudinaryAsset = async (req, res) => {
  const { publicId } = req.params;

  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: "video",
    });

    return res.json({ success: true, result });
  } catch (error) {
    console.error("Error deleting Cloudinary asset:", error);
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  startEmergency,
  endEmergency,
  storeAudio,
  storeVideo,
  storeEvidence,
  logAlert,
  logCall,
  triggerEmergencyProtocol,
  getRecordingsByEmail,
  getRecordingsByUserId,
  deleteRecording,
  renameRecording,
  deleteCloudinaryAsset,
};
