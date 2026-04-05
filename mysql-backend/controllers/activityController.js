const db = require("../config/db");

let activityLogSchemaReady;

const ensureActivityLogSchema = async () => {
  if (!activityLogSchemaReady) {
    activityLogSchemaReady = (async () => {
      const [columns] = await db.query("SHOW COLUMNS FROM activity_log LIKE 'user_id'");
      if (!Array.isArray(columns) || columns.length === 0) {
        await db.query(
          "ALTER TABLE activity_log ADD COLUMN user_id INT NULL AFTER emergency_id, ADD INDEX idx_activity_log_user_id (user_id)"
        );
      }
    })().catch((error) => {
      activityLogSchemaReady = null;
      throw error;
    });
  }

  return activityLogSchemaReady;
};

const logActivity = async (req, res) => {
  const { emergency_id, activity_type, user_id } = req.body;
  try {
    await ensureActivityLogSchema();
    await db.query(
      "INSERT INTO activity_log (emergency_id, user_id, activity_type, timestamp) VALUES (?, ?, ?, NOW())",
      [emergency_id ?? null, user_id ?? null, activity_type]
    );
    res.status(201).json({ success: true, message: "Activity successfully logged" });
  } catch (error) {
    console.error("Error logging activity:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const logNotification = async (req, res) => {
  const { emergency_id, notification_type } = req.body;
  try {
    await db.query(
      "INSERT INTO notification (emergency_id, notification_type, sent_time) VALUES (?, ?, NOW())",
      [emergency_id, notification_type]
    );
    res.status(201).json({ success: true, message: "Notification logged" });
  } catch (error) {
    console.error("Error logging notification:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getActivities = async (req, res) => {
  try {
    await ensureActivityLogSchema();
    const [rows] = await db.query(
      "SELECT log_id AS id, emergency_id, user_id, activity_type, timestamp FROM activity_log ORDER BY timestamp DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching activities:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const getActivitiesByEmail = async (req, res) => {
  const { email } = req.params;
  try {
    await ensureActivityLogSchema();
    const [rows] = await db.query(
      "SELECT DISTINCT al.log_id AS id, al.emergency_id, al.user_id, al.activity_type, al.timestamp " +
      "FROM activity_log al " +
      "LEFT JOIN emergency_incidents ei ON al.emergency_id = ei.id " +
      "LEFT JOIN users activity_user ON al.user_id = activity_user.id " +
      "LEFT JOIN users emergency_user ON ei.user_id = emergency_user.id " +
      "WHERE activity_user.email = ? OR emergency_user.email = ? " +
      "ORDER BY al.timestamp DESC",
      [email, email]
    );
    res.json(rows);
  } catch (error) {
    console.error("Error fetching activities by email:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const deleteActivityByEmail = async (req, res) => {
  const { email, id } = req.params;
  try {
    await ensureActivityLogSchema();
    const [result] = await db.query(
      "DELETE al FROM activity_log al " +
      "LEFT JOIN emergency_incidents ei ON al.emergency_id = ei.id " +
      "LEFT JOIN users activity_user ON al.user_id = activity_user.id " +
      "LEFT JOIN users emergency_user ON ei.user_id = emergency_user.id " +
      "WHERE al.log_id = ? AND (activity_user.email = ? OR emergency_user.email = ?)",
      [id, email, email]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ success: false, message: "Activity not found" });
    }

    res.json({ success: true, message: "Activity deleted successfully" });
  } catch (error) {
    console.error("Error deleting activity by email:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

const clearActivitiesByEmail = async (req, res) => {
  const { email } = req.params;
  try {
    await ensureActivityLogSchema();
    await db.query(
      "DELETE al FROM activity_log al " +
      "LEFT JOIN emergency_incidents ei ON al.emergency_id = ei.id " +
      "LEFT JOIN users activity_user ON al.user_id = activity_user.id " +
      "LEFT JOIN users emergency_user ON ei.user_id = emergency_user.id " +
      "WHERE activity_user.email = ? OR emergency_user.email = ?",
      [email, email]
    );
    res.json({ success: true, message: "Activities deleted successfully" });
  } catch (error) {
    console.error("Error clearing activities by email:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  logActivity,
  logNotification,
  getActivities,
  getActivitiesByEmail,
  deleteActivityByEmail,
  clearActivitiesByEmail
};
