import { run } from "./db.js";
import { emailUser } from "./email/mailer.js";

/**
 * In-app notification + optional templated email.
 * @param {number} userId
 * @param {{type: string, title: string, body?: string, link?: string}} n
 * @param {{template: string, data?: object, transactional?: boolean}} [email]
 */
export function notify(userId, n, email) {
  run(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, ?, ?, ?, ?)`, userId, n.type, n.title, n.body || "", n.link || null);
  if (email) {
    // Fire and forget: emailing must never block or fail the request.
    emailUser(userId, email.template, email.data || {}, { transactional: email.transactional !== false }).catch(() => {});
  }
}
