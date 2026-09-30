import nodemailer from "nodemailer";
import { config } from "../config.js";
import { get, run } from "../db.js";
import { templates } from "./templates.js";

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  if (config.mail.host) {
    transporter = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.secure,
      auth: config.mail.user ? { user: config.mail.user, pass: config.mail.pass } : undefined,
    });
  } else {
    // No SMTP configured (local dev): render the email and keep it in the outbox table,
    // viewable at GET /api/dev/emails.
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  return transporter;
}

export const mailEnabled = () => !!config.mail.host;

/**
 * Sends a templated email. Never throws: failures are recorded in the outbox so a broken SMTP
 * server can't break bookings or sign-ups.
 */
export async function sendEmail(to, templateName, data = {}) {
  if (!to) return;
  const render = templates[templateName];
  if (!render) throw new Error(`Unknown email template ${templateName}`);
  const { subject, html, text } = render({ ...data, appUrl: config.appUrl, platform: config.platformName });
  try {
    await getTransporter().sendMail({ from: config.mail.from, to, subject, html, text });
    run(`INSERT INTO email_outbox (to_email, subject, html, status) VALUES (?, ?, ?, ?)`, to, subject, html, mailEnabled() ? "sent" : "logged");
    if (!mailEnabled() && !config.isProd && process.env.NODE_ENV !== "test") {
      console.log(`[mail] (not sent – SMTP not configured) to=${to} subject="${subject}"`);
    }
  } catch (err) {
    console.error(`[mail] failed to send "${subject}" to ${to}:`, err.message);
    run(`INSERT INTO email_outbox (to_email, subject, html, status, error) VALUES (?, ?, ?, 'failed', ?)`, to, subject, html, err.message);
  }
}

/** Email a user by id, honouring their notification preference (transactional mails bypass it). */
export async function emailUser(userId, templateName, data = {}, { transactional = true } = {}) {
  const user = get(`SELECT email, first_name, email_notifications FROM users WHERE id = ?`, userId);
  if (!user?.email) return;
  if (!transactional && !user.email_notifications) return;
  await sendEmail(user.email, templateName, { firstName: user.first_name || "there", ...data });
}
