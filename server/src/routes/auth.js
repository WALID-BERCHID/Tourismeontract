import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { config } from "../config.js";
import { get, run } from "../db.js";
import { createNonce, optionalAuth, requireAuth, signToken, verifyWalletSignature } from "../auth.js";
import { sendEmail } from "../email/mailer.js";
import { HttpError, asyncHandler, parse, publicUser, randomToken } from "../util.js";

const router = Router();

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: process.env.NODE_ENV === "test" ? 10_000 : 30, standardHeaders: true, legacyHeaders: false });

const password = z.string().min(8, "Use at least 8 characters").max(128);
const email = z.string().trim().toLowerCase().email("Enter a valid email");

function issueEmailToken(userId, purpose, ttlMs) {
  const token = randomToken();
  run(`DELETE FROM email_tokens WHERE user_id = ? AND purpose = ?`, userId, purpose);
  run(`INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, ?, ?)`, token, userId, purpose, Date.now() + ttlMs);
  return token;
}

function consumeEmailToken(token, purpose) {
  const row = get(`SELECT * FROM email_tokens WHERE token = ? AND purpose = ?`, token, purpose);
  if (!row || row.expires_at < Date.now()) throw new HttpError(400, "This link is invalid or has expired");
  run(`DELETE FROM email_tokens WHERE token = ?`, token);
  return row.user_id;
}

const session = (user) => ({ token: signToken(user.id), user: publicUser(user, { withPrivate: true }) });

router.post(
  "/signup",
  limiter,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ email, password, firstName: z.string().trim().min(1, "Required").max(50), lastName: z.string().trim().max(50).default("") }),
      req.body
    );
    if (get(`SELECT id FROM users WHERE email = ?`, body.email)) throw new HttpError(409, "An account with this email already exists", { email: "Already registered – log in instead" });
    const hash = await bcrypt.hash(body.password, 10);
    const r = run(`INSERT INTO users (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)`, body.email, hash, body.firstName, body.lastName);
    const user = get(`SELECT * FROM users WHERE id = ?`, r.lastInsertRowid);
    const token = issueEmailToken(user.id, "verify", 48 * 3600_000);
    sendEmail(user.email, "welcome", { firstName: user.first_name, verifyUrl: `${config.appUrl}/verify-email?token=${token}` });
    res.status(201).json(session(user));
  })
);

router.post(
  "/login",
  limiter,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ email, password: z.string().min(1, "Required") }), req.body);
    const user = get(`SELECT * FROM users WHERE email = ?`, body.email);
    if (!user?.password_hash || !(await bcrypt.compare(body.password, user.password_hash))) {
      throw new HttpError(401, "Incorrect email or password");
    }
    res.json(session(user));
  })
);

router.get("/nonce", limiter, (req, res) => {
  const { chain, address } = parse(z.object({ chain: z.enum(["evm", "solana"]), address: z.string().min(1) }), req.query);
  res.json(createNonce(chain, address));
});

/** Sign in with a wallet, or link the wallet to the logged-in account. */
router.post(
  "/wallet",
  limiter,
  optionalAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({ chain: z.enum(["evm", "solana"]), address: z.string(), nonce: z.string(), signature: z.string() }),
      req.body
    );
    const address = verifyWalletSignature(body);
    const existing = get(`SELECT * FROM wallets WHERE chain = ? AND address = ?`, body.chain, address);

    if (req.user) {
      if (existing && existing.user_id !== req.user.id) throw new HttpError(409, "This wallet is linked to another account");
      if (!existing) run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, ?, ?)`, req.user.id, body.chain, address);
      return res.json(session(get(`SELECT * FROM users WHERE id = ?`, req.user.id)));
    }
    let user;
    if (existing) {
      user = get(`SELECT * FROM users WHERE id = ?`, existing.user_id);
    } else {
      const r = run(`INSERT INTO users (first_name) VALUES (?)`, "");
      run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, ?, ?)`, r.lastInsertRowid, body.chain, address);
      user = get(`SELECT * FROM users WHERE id = ?`, r.lastInsertRowid);
    }
    res.json({ ...session(user), isNew: !existing });
  })
);

router.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const { token } = parse(z.object({ token: z.string() }), req.body);
    const userId = consumeEmailToken(token, "verify");
    run(`UPDATE users SET email_verified = 1 WHERE id = ?`, userId);
    res.json({ ok: true, user: publicUser(get(`SELECT * FROM users WHERE id = ?`, userId), { withPrivate: true }) });
  })
);

router.post(
  "/resend-verification",
  limiter,
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user.email) throw new HttpError(400, "Add an email address first");
    if (req.user.email_verified) return res.json({ ok: true });
    const token = issueEmailToken(req.user.id, "verify", 48 * 3600_000);
    await sendEmail(req.user.email, "verifyEmail", { firstName: req.user.first_name, verifyUrl: `${config.appUrl}/verify-email?token=${token}` });
    res.json({ ok: true });
  })
);

router.post(
  "/forgot-password",
  limiter,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ email }), req.body);
    const user = get(`SELECT * FROM users WHERE email = ?`, body.email);
    if (user) {
      const token = issueEmailToken(user.id, "reset", 3600_000);
      await sendEmail(user.email, "passwordReset", { firstName: user.first_name, resetUrl: `${config.appUrl}/reset-password?token=${token}` });
    }
    // Same response either way so emails can't be enumerated.
    res.json({ ok: true });
  })
);

router.post(
  "/reset-password",
  limiter,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ token: z.string(), password }), req.body);
    const userId = consumeEmailToken(body.token, "reset");
    run(`UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?`, await bcrypt.hash(body.password, 10), userId);
    res.json(session(get(`SELECT * FROM users WHERE id = ?`, userId)));
  })
);

router.get("/me", requireAuth, (req, res) => {
  const unread = get(`SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0`, req.user.id).c;
  const unreadMessages = get(
    `SELECT COUNT(*) AS c FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE (c.guest_id = ? OR c.host_id = ?) AND m.read_at IS NULL AND (m.sender_id IS NULL OR m.sender_id != ?)`,
    req.user.id,
    req.user.id,
    req.user.id
  ).c;
  res.json({ user: publicUser(req.user, { withPrivate: true }), unreadNotifications: unread, unreadMessages });
});

export default router;
