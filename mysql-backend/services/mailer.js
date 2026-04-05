const nodemailer = require("nodemailer");
const dns = require("dns");
const net = require("net");
const { Resend } = require("resend");

dns.setDefaultResultOrder("ipv4first");

const normalizeRecipients = (value) => {
  const items = Array.isArray(value) ? value : String(value || "").split(",");
  return items
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
};

const resolveFromAddress = (from) => {
  if (from) return from;
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (process.env.SMTP_USER) return `"SHEILD Guardian" <${process.env.SMTP_USER}>`;
  if (process.env.EMAIL_USER) return `"SHEILD Guardian" <${process.env.EMAIL_USER}>`;
  return "SHEILD Guardian <onboarding@resend.dev>";
};

const hasGenericSmtpConfig = () =>
  Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );

const createIpv4Socket = (options, callback) => {
  dns.lookup(options.host, { family: 4 }, (lookupError, address) => {
    if (lookupError) {
      callback(lookupError);
      return;
    }

    const socket = net.connect({
      host: address,
      port: options.port,
      family: 4,
    });

    callback(null, {
      connection: socket,
    });
  });
};

const createTransporter = () => {
  if (hasGenericSmtpConfig()) {
    const secure =
      process.env.SMTP_SECURE === "true" || Number(process.env.SMTP_PORT) === 465;

    return {
      transporter: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
        family: 4,
        getSocket: createIpv4Socket,
        tls: {
          rejectUnauthorized: false,
        },
        connectionTimeout: 20000,
        greetingTimeout: 20000,
        socketTimeout: 20000,
      }),
      provider: "smtp_custom",
    };
  }

  return {
    transporter: nodemailer.createTransport({
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
    }),
    provider: "gmail_smtp",
  };
};

const { transporter, provider: smtpProvider } = createTransporter();
const resend =
  process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim()
    ? new Resend(process.env.RESEND_API_KEY.trim())
    : null;

const maskEmail = (value) => {
  const email = String(value || "").trim().toLowerCase();
  const [name, domain] = email.split("@");
  if (!name || !domain) return email || "unknown";
  if (name.length <= 2) return `${name[0] || "*"}*@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
};

const mailDebug = (message, meta = {}) => {
  console.log("[MAILER]", message, meta);
};

const assertMailConfig = () => {
  if (resend) {
    return;
  }

  if (hasGenericSmtpConfig()) {
    return;
  }

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

  const fromAddress = resolveFromAddress(from);
  const provider = resend ? "resend" : smtpProvider;

  mailDebug("Preparing outbound mail", {
    provider,
    recipientCount: recipients.length,
    recipients: recipients.map(maskEmail),
    subject: mailOptions.subject || null,
    from: fromAddress,
  });

  if (resend) {
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: recipients,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
    });

    if (error) {
      mailDebug("Resend send failed", {
        code: error.name || "RESEND_SEND_FAILED",
        message: error.message || null,
      });
      const resendError = new Error(error.message || "Resend email send failed");
      resendError.code = "RESEND_SEND_FAILED";
      throw resendError;
    }

    mailDebug("Resend send succeeded", {
      provider,
      id: data?.id || null,
      recipientCount: recipients.length,
    });
    return data;
  }

  try {
    const result = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(","),
      ...mailOptions,
    });

    mailDebug("SMTP send succeeded", {
      provider,
      messageId: result?.messageId || null,
      accepted: Array.isArray(result?.accepted) ? result.accepted.map(maskEmail) : [],
      rejected: Array.isArray(result?.rejected) ? result.rejected.map(maskEmail) : [],
    });

    return result;
  } catch (error) {
    mailDebug("SMTP send failed", {
      provider,
      code: error?.code || null,
      command: error?.command || null,
      response: error?.response || null,
      message: error?.message || null,
    });
    throw error;
  }
};

module.exports = {
  transporter,
  sendMail,
  normalizeRecipients,
  assertMailConfig,
};
