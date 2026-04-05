const nodemailer = require("nodemailer");
const dns = require("dns");

dns.setDefaultResultOrder("ipv4first");

const normalizeRecipients = (value) => {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
};

const createTransporter = () =>
  nodemailer.createTransport({
    service: "gmail",
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    family: 4,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 20000,
    greetingTimeout: 20000,
    socketTimeout: 20000,
  });

const transporter = createTransporter();

const assertMailConfig = () => {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    const error = new Error("Email credentials are missing on the backend");
    error.code = "MAIL_CONFIG_MISSING";
    throw error;
  }
};

const sendMail = async ({ to, from, ...mailOptions }) => {
  assertMailConfig();
  const recipients = normalizeRecipients(to);

  if (recipients.length === 0) {
    const error = new Error("No valid email recipients available");
    error.code = "MAIL_RECIPIENTS_MISSING";
    throw error;
  }

  return transporter.sendMail({
    from: from || `"SHEILD Guardian" <${process.env.EMAIL_USER}>`,
    to: recipients.join(","),
    ...mailOptions,
  });
};

module.exports = {
  transporter,
  sendMail,
  normalizeRecipients,
  assertMailConfig,
};
