require("dotenv").config();
const { sendSmsToMany } = require("./smsService");

const parseRecipients = (recipients) =>
  Array.isArray(recipients)
    ? recipients
    : String(recipients || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

const sendEmergencySms = async (
  recipients,
  location,
  userId,
  keyword,
  riskLevel
) => {
  const timestamp = new Date().toLocaleString();
  const level = riskLevel === "HIGH" ? "HIGH" : "LOW";
  const action =
    level === "HIGH"
      ? "Please contact the user immediately. Calling contacts now."
      : "This is only a precautionary alert.";
  const body = `SHEILD ${level} ALERT
User ID: ${userId}
Detected Keyword: ${keyword || `${level}-Risk Detected`}
Time: ${timestamp}
Live Location: ${location}
${action}`;

  return sendSmsToMany(parseRecipients(recipients), body);
};

const sendSafeSms = async (recipients, userName) => {
  return sendSmsToMany(
    parseRecipients(recipients),
    `SHEILD ALERT CANCELLED\n${userName} is SAFE now. Please ignore the previous emergency alert.`
  );
};

module.exports = {
  sendEmergencySms,
  sendSafeSms,
  sendEmergencyEmail: sendEmergencySms,
  sendSafeEmail: sendSafeSms,
};
