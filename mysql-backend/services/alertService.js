require("dotenv").config();
const { sendMail } = require("./mailer");

const sendEmergencyEmail = async (
  recipients,
  location,
  userId,
  keyword,
  riskLevel
) => {
  const timestamp = new Date().toLocaleString();
  let subject = "Low Risk Alert - SHEILD Safety Notification";
  let body = `A low-risk keyword was detected.\n\nUser ID: ${userId}\nDetected Keyword: ${
    keyword || "Low-Risk Detected"
  }\nTime: ${timestamp}\n\nLive Location:\n${location}\n\nThis is only a precautionary alert.`;

  if (riskLevel === "HIGH") {
    subject = "EMERGENCY ALERT - Possible danger detected";
    body = `A high-risk keyword was detected from the SHEILD safety app.\n\nUser ID: ${userId}\nDetected Keyword: ${
      keyword || "High-Risk Detected"
    }\nTime: ${timestamp}\n\nLive Location:\n${location}\n\nPlease contact the user immediately. Calling contacts now.`;
  }

  return sendMail({
    to: recipients,
    subject,
    text: body,
  });
};

const sendSafeEmail = async (recipients, userName) => {
  return sendMail({
    to: recipients,
    subject: "SHEILD ALERT CANCELLED",
    text: `${userName} is SAFE now. Please ignore the previous emergency alert.`,
  });
};

module.exports = {
  sendEmergencyEmail,
  sendSafeEmail,
};
