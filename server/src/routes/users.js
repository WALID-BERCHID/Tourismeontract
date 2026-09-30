import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { config } from "../config.js";
import { all, get, run } from "../db.js";
import { normalizeAddress, requireAuth } from "../auth.js";
import { sendEmail } from "../email/mailer.js";
import { HttpError, asyncHandler, parse, publicUser, randomToken, serializeListing } from "../util.js";

const router = Router();

router.patch(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        firstName: z.string().trim().min(1, "Required").max(50).optional(),
        lastName: z.string().trim().max(50).optional(),
        email: z.string().trim().toLowerCase().email("Enter a valid email").optional(),
        phone: z.string().trim().max(30).nullable().optional(),
        bio: z.string().max(1000).optional(),
        location: z.string().max(100).optional(),
        work: z.string().max(100).optional(),
        languages: z.array(z.string().max(30)).max(20).optional(),
        avatarUrl: z.string().max(500).nullable().optional(),
        emailNotifications: z.boolean().optional(),
        preferredCurrency: z.enum(["USD", "EUR", "MAD", "GBP"]).optional(),
      }),
      req.body
    );
    const u = req.user;
    if (body.email && body.email !== u.email) {
      if (get(`SELECT id FROM users WHERE email = ? AND id != ?`, body.email, u.id)) throw new HttpError(409, "Email already in use", { email: "Already in use" });
      run(`UPDATE users SET email = ?, email_verified = 0 WHERE id = ?`, body.email, u.id);
      const token = randomToken();
      run(`INSERT INTO email_tokens (token, user_id, purpose, expires_at) VALUES (?, ?, 'verify', ?)`, token, u.id, Date.now() + 48 * 3600_000);
      sendEmail(body.email, "verifyEmail", { firstName: body.firstName || u.first_name, verifyUrl: `${config.appUrl}/verify-email?token=${token}` });
    }
    const map = {
      firstName: "first_name",
      lastName: "last_name",
      phone: "phone",
      bio: "bio",
      location: "location",
      work: "work",
      avatarUrl: "avatar_url",
    };
    for (const [k, col] of Object.entries(map)) if (body[k] !== undefined) run(`UPDATE users SET ${col} = ? WHERE id = ?`, body[k], u.id);
    if (body.languages) run(`UPDATE users SET languages = ? WHERE id = ?`, JSON.stringify(body.languages), u.id);
    if (body.emailNotifications !== undefined) run(`UPDATE users SET email_notifications = ? WHERE id = ?`, body.emailNotifications ? 1 : 0, u.id);
    if (body.preferredCurrency) run(`UPDATE users SET preferred_currency = ? WHERE id = ?`, body.preferredCurrency, u.id);
    res.json({ user: publicUser(get(`SELECT * FROM users WHERE id = ?`, u.id), { withPrivate: true }) });
  })
);

router.post(
  "/me/password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ currentPassword: z.string().optional(), newPassword: z.string().min(8, "Use at least 8 characters").max(128) }), req.body);
    if (req.user.password_hash && !(await bcrypt.compare(body.currentPassword || "", req.user.password_hash))) {
      throw new HttpError(400, "Current password is incorrect", { currentPassword: "Incorrect password" });
    }
    run(`UPDATE users SET password_hash = ? WHERE id = ?`, await bcrypt.hash(body.newPassword, 10), req.user.id);
    res.json({ ok: true });
  })
);

/** EOS accounts are linked by name (payments are verified on-chain against this account). */
router.post(
  "/me/wallets",
  requireAuth,
  asyncHandler(async (req, res) => {
    const body = parse(z.object({ chain: z.literal("eos"), address: z.string() }), req.body);
    const address = normalizeAddress("eos", body.address);
    const existing = get(`SELECT * FROM wallets WHERE chain = 'eos' AND address = ?`, address);
    if (existing && existing.user_id !== req.user.id) throw new HttpError(409, "This account is linked to another user");
    if (!existing) run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, 'eos', ?)`, req.user.id, address);
    res.json({ user: publicUser(get(`SELECT * FROM users WHERE id = ?`, req.user.id), { withPrivate: true }) });
  })
);

router.delete("/me/wallets/:chain/:address", requireAuth, (req, res) => {
  const count = get(`SELECT COUNT(*) AS c FROM wallets WHERE user_id = ?`, req.user.id).c;
  if (!req.user.password_hash && count <= 1) throw new HttpError(400, "Add a password before removing your only sign-in wallet");
  run(`DELETE FROM wallets WHERE user_id = ? AND chain = ? AND address = ?`, req.user.id, req.params.chain, req.params.address);
  res.json({ user: publicUser(get(`SELECT * FROM users WHERE id = ?`, req.user.id), { withPrivate: true }) });
});

router.get("/:id", (req, res) => {
  const u = get(`SELECT * FROM users WHERE id = ?`, Number(req.params.id));
  if (!u) throw new HttpError(404, "User not found");
  const listings = all(`SELECT * FROM listings WHERE host_id = ? AND status = 'published' ORDER BY id DESC`, u.id).map((l) => serializeListing(l));
  const reviews = all(
    `SELECT r.*, a.first_name AS author_name, a.avatar_url AS author_avatar, l.title AS listing_title
     FROM reviews r JOIN users a ON a.id = r.author_id JOIN listings l ON l.id = r.listing_id
     WHERE (r.target = 'listing' AND l.host_id = ?) OR (r.target = 'guest' AND r.subject_id = ?)
     ORDER BY r.created_at DESC LIMIT 30`,
    u.id,
    u.id
  ).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    target: r.target,
    listingTitle: r.listing_title,
    author: { id: r.author_id, name: r.author_name, avatarUrl: r.author_avatar },
  }));
  res.json({ user: publicUser(u), listings, reviews });
});

export default router;
