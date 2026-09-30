import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../db.js";
import { requireAuth } from "../auth.js";
import { notify } from "../notify.js";
import { ensureConversation, syncBooking } from "../services/bookings.js";
import { HttpError, asyncHandler, parse, publicUser, serializeListing } from "../util.js";

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviews = Router();

reviews.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const score = z.number().int().min(1).max(5);
    const body = parse(
      z.object({
        bookingId: z.number().int(),
        target: z.enum(["listing", "guest"]),
        rating: score,
        cleanliness: score.optional(),
        accuracy: score.optional(),
        communication: score.optional(),
        location: score.optional(),
        checkin: score.optional(),
        value: score.optional(),
        comment: z.string().trim().min(10, "Write at least a sentence").max(2000),
        txHash: z.string().max(200).optional(),
      }),
      req.body
    );
    let b = get(`SELECT * FROM bookings WHERE id = ?`, body.bookingId);
    if (!b) throw new HttpError(404, "Reservation not found");
    const isGuest = b.guest_id === req.user.id;
    const isHost = b.host_id === req.user.id;
    if ((body.target === "listing" && !isGuest) || (body.target === "guest" && !isHost)) throw new HttpError(403, "You can't review this stay");
    b = await syncBooking(b);
    if (!["completed", "resolved"].includes(b.status)) throw new HttpError(409, "Reviews open once the stay is completed and the escrow is released");
    if (get(`SELECT id FROM reviews WHERE booking_id = ? AND target = ?`, b.id, body.target)) throw new HttpError(409, "You already reviewed this stay");

    const subjectId = body.target === "listing" ? b.host_id : b.guest_id;
    run(
      `INSERT INTO reviews (booking_id, listing_id, author_id, subject_id, target, rating, cleanliness, accuracy, communication, location, checkin, value, comment, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      b.id,
      b.listing_id,
      req.user.id,
      subjectId,
      body.target,
      body.rating,
      body.cleanliness ?? null,
      body.accuracy ?? null,
      body.communication ?? null,
      body.location ?? null,
      body.checkin ?? null,
      body.value ?? null,
      body.comment,
      body.txHash || null
    );
    notify(
      subjectId,
      { type: "review", title: `New ${body.rating}★ review from ${req.user.first_name}`, body: body.comment.slice(0, 120), link: `/users/${subjectId}` },
      { template: "newReview", data: { authorName: req.user.first_name, rating: body.rating, comment: body.comment, subjectId }, transactional: false }
    );
    res.status(201).json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

export const conversations = Router();
conversations.use(requireAuth);

function loadConversation(req) {
  const c = get(`SELECT * FROM conversations WHERE id = ?`, Number(req.params.id));
  if (!c || (c.guest_id !== req.user.id && c.host_id !== req.user.id)) throw new HttpError(404, "Conversation not found");
  return c;
}

function serializeConversation(c, userId) {
  const otherId = c.guest_id === userId ? c.host_id : c.guest_id;
  const l = get(`SELECT id, title, photos, city FROM listings WHERE id = ?`, c.listing_id);
  const last = get(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT 1`, c.id);
  const unread = get(
    `SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND read_at IS NULL AND (sender_id IS NULL OR sender_id != ?)`,
    c.id,
    userId
  ).c;
  const booking = c.booking_id ? get(`SELECT id, code, status, check_in, check_out FROM bookings WHERE id = ?`, c.booking_id) : null;
  return {
    id: c.id,
    role: c.host_id === userId ? "host" : "guest",
    other: publicUser(get(`SELECT * FROM users WHERE id = ?`, otherId)),
    listing: { id: l.id, title: l.title, city: l.city, photo: JSON.parse(l.photos || "[]")[0] || null },
    booking,
    lastMessage: last ? { body: last.body, kind: last.kind, createdAt: last.created_at, mine: last.sender_id === userId } : null,
    unread,
    updatedAt: c.updated_at,
  };
}

conversations.get("/", (req, res) => {
  const rows = all(`SELECT * FROM conversations WHERE guest_id = ? OR host_id = ? ORDER BY updated_at DESC`, req.user.id, req.user.id);
  res.json({ conversations: rows.map((c) => serializeConversation(c, req.user.id)) });
});

conversations.get("/:id", (req, res) => {
  const c = loadConversation(req);
  run(`UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND read_at IS NULL AND (sender_id IS NULL OR sender_id != ?)`, c.id, req.user.id);
  const messages = all(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC`, c.id).map((m) => ({
    id: m.id,
    body: m.body,
    kind: m.kind,
    senderId: m.sender_id,
    mine: m.sender_id === req.user.id,
    createdAt: m.created_at,
    readAt: m.read_at,
  }));
  res.json({ conversation: serializeConversation(c, req.user.id), messages });
});

function postMessage(c, sender, body) {
  const r = run(`INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`, c.id, sender.id, body);
  run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, c.id);
  const recipient = c.guest_id === sender.id ? c.host_id : c.guest_id;
  const l = get(`SELECT title FROM listings WHERE id = ?`, c.listing_id);
  // Only email if the recipient hasn't got another unread message in this thread already (avoid spam).
  const pending = get(
    `SELECT COUNT(*) AS c FROM messages WHERE conversation_id = ? AND read_at IS NULL AND sender_id = ? AND id != ?`,
    c.id,
    sender.id,
    r.lastInsertRowid
  ).c;
  notify(
    recipient,
    { type: "message", title: `Message from ${sender.first_name || "a traveler"}`, body: body.slice(0, 120), link: `/messages/${c.id}` },
    pending ? undefined : { template: "newMessage", data: { senderName: sender.first_name || "A traveler", preview: body.slice(0, 280), listingTitle: l.title, conversationId: c.id }, transactional: false }
  );
  return r.lastInsertRowid;
}

conversations.post("/", (req, res) => {
  const body = parse(z.object({ listingId: z.number().int(), body: z.string().trim().min(1).max(4000) }), req.body);
  const l = get(`SELECT * FROM listings WHERE id = ? AND status = 'published'`, body.listingId);
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.host_id === req.user.id) throw new HttpError(400, "You can't message yourself");
  const c = ensureConversation(l.id, req.user.id, l.host_id);
  postMessage(c, req.user, body.body);
  res.status(201).json({ conversationId: c.id });
});

conversations.post("/:id/messages", (req, res) => {
  const c = loadConversation(req);
  const body = parse(z.object({ body: z.string().trim().min(1).max(4000) }), req.body);
  const id = postMessage(c, req.user, body.body);
  const m = get(`SELECT * FROM messages WHERE id = ?`, id);
  res.status(201).json({ message: { id: m.id, body: m.body, kind: m.kind, senderId: m.sender_id, mine: true, createdAt: m.created_at } });
});

// ---------------------------------------------------------------------------
// Wishlists
// ---------------------------------------------------------------------------

export const wishlists = Router();
wishlists.use(requireAuth);

wishlists.get("/", (req, res) => {
  const rows = all(
    `SELECT l.* FROM wishlists w JOIN listings l ON l.id = w.listing_id WHERE w.user_id = ? AND l.status = 'published' ORDER BY w.created_at DESC`,
    req.user.id
  );
  res.json({ listings: rows.map((l) => serializeListing(l, { userId: req.user.id })) });
});

wishlists.put("/:listingId", (req, res) => {
  const id = Number(req.params.listingId);
  if (!get(`SELECT id FROM listings WHERE id = ?`, id)) throw new HttpError(404, "Listing not found");
  run(`INSERT OR IGNORE INTO wishlists (user_id, listing_id) VALUES (?, ?)`, req.user.id, id);
  res.json({ ok: true });
});

wishlists.delete("/:listingId", (req, res) => {
  run(`DELETE FROM wishlists WHERE user_id = ? AND listing_id = ?`, req.user.id, Number(req.params.listingId));
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notifications = Router();
notifications.use(requireAuth);

notifications.get("/", (req, res) => {
  const rows = all(`SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50`, req.user.id);
  res.json({ notifications: rows.map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, read: !!n.read, createdAt: n.created_at })) });
});

notifications.post("/read-all", (req, res) => {
  run(`UPDATE notifications SET read = 1 WHERE user_id = ?`, req.user.id);
  res.json({ ok: true });
});
