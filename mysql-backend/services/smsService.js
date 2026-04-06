const axios = require("axios");

const normalizePhoneNumber = (value) =>
  String(value || "").replace(/[^\d+]/g, "").trim();

const uniquePhoneNumbers = (values) =>
  values
    .map(normalizePhoneNumber)
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index);

const sendSms = async (to, message) => {
  const phoneNumber = normalizePhoneNumber(to);
  if (!phoneNumber) {
    return { success: false, message: "Missing phone number" };
  }

  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER) {
    const auth = Buffer.from(
      `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
    ).toString("base64");

    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
      new URLSearchParams({
        From: process.env.TWILIO_FROM_NUMBER,
        To: phoneNumber,
        Body: message,
      }),
      {
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return { success: true, message: "SMS sent" };
  }

  if (process.env.SMS_API_URL) {
    await axios.post(
      process.env.SMS_API_URL,
      { to: phoneNumber, message },
      process.env.SMS_API_KEY
        ? { headers: { Authorization: `Bearer ${process.env.SMS_API_KEY}` } }
        : undefined
    );

    return { success: true, message: "SMS sent" };
  }

  const error = new Error("SMS provider is not configured");
  error.code = "SMS_PROVIDER_NOT_CONFIGURED";
  throw error;
};

const sendSmsToMany = async (phoneNumbers, message) => {
  const recipients = uniquePhoneNumbers(phoneNumbers);
  const results = [];

  for (const phoneNumber of recipients) {
    try {
      await sendSms(phoneNumber, message);
      results.push({ phoneNumber, success: true });
    } catch (error) {
      results.push({
        phoneNumber,
        success: false,
        error: error.message,
        code: error.code || null,
      });
    }
  }

  return {
    recipients,
    results,
    sent: results.filter((result) => result.success).length,
    failed: results.filter((result) => !result.success).length,
  };
};

module.exports = {
  normalizePhoneNumber,
  uniquePhoneNumbers,
  sendSms,
  sendSmsToMany,
};
