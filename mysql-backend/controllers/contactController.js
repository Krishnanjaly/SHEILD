const db = require("../config/db");

const addContact = async (req, res) => {
  const { email, name, relation, phone, contact_email, location, notes, gender } = req.body;
  try {
    const [userRows] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (userRows.length === 0) return res.status(404).json({ message: "User not found" });

    const userId = userRows[0].id;
    await db.query(
      "INSERT INTO contacts (user_id, name, relation, phone, contact_email, location, notes, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, name, relation, phone, contact_email, location, notes, gender]
    );
    res.json({ message: "Contact added successfully" });
  } catch (err) {
    console.error("Add Contact Error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

const getContacts = async (req, res) => {
  const { email } = req.params;
  try {
    const [rows] = await db.query(
      `SELECT contacts.* FROM contacts JOIN users ON contacts.user_id = users.id WHERE users.email = ?`,
      [email]
    );
    res.json({ contacts: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const updateContact = async (req, res) => {
  const { id } = req.params;
  const { name, relation, phone, contact_email, location, notes, gender } = req.body;
  try {
    await db.query(
      `UPDATE contacts SET name=?, relation=?, phone=?, contact_email=?, location=?, notes=?, gender=? WHERE id=?`,
      [name, relation, phone, contact_email, location, notes, gender, id]
    );
    res.json({ message: "Contact updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteContact = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("DELETE FROM contacts WHERE id = ?", [id]);
    res.json({ message: "Deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Delete failed" });
  }
};

// Trusted_Contact Table Handlers (Legacy compatibility)
const addTrustedContact = async (req, res) => {
  const { user_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude } = req.body;
  try {
    if (!user_id || !trusted_name || !trusted_no || !email || !relationship_type) {
      return res.status(400).json({ success: false, message: "Missing required trusted contact fields" });
    }

    await db.query(
      "INSERT INTO trusted_contact (user_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [user_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Add trusted contact error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

const getTrustedContacts = async (req, res) => {
  const { user_id } = req.params;
  try {
    const [result] = await db.query("SELECT * FROM trusted_contact WHERE user_id = ?", [user_id]);
    res.json(result);
  } catch (err) {
    console.error("Get trusted contacts error:", err);
    res.json([]);
  }
};

const updateTrustedContact = async (req, res) => {
  const { trusted_id, trusted_name, trusted_no, email, relationship_type, latitude, longitude } = req.body;
  try {
    if (!trusted_id) {
      return res.status(400).json({ success: false, message: "trusted_id is required" });
    }

    await db.query(
      "UPDATE trusted_contact SET trusted_name = ?, trusted_no = ?, email = ?, relationship_type = ?, latitude = ?, longitude = ? WHERE trusted_id = ?",
      [trusted_name, trusted_no, email, relationship_type, latitude, longitude, trusted_id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Update trusted contact error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  addContact,
  getContacts,
  updateContact,
  deleteContact,
  addTrustedContact,
  getTrustedContacts,
  updateTrustedContact,
};
