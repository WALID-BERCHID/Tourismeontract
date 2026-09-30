import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../db.js";
import { requireAuth } from "../auth.js";
import { notify } from "../notify.js";
import { parseNetwork, readBookingStatus, verifyBooking } from "../chains/index.js";
import { applyStatus, bookingEmailData, ensureConversation, occupiedDays, serializeBooking, syncBooking } from "../services/bookings.js";
import { HttpError, asyncHandler, bookingCode, dayFromDate, parse, priceQuote, todayDay } from "../util.js";

const router = Router();
router.use(requireAuth);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function loadBooking(req) {
  const b = get(`SELECT * FROM bookings WHERE id = ? OR code = ?`, Number(req.params.id) || -1, req.params.id);
  if (!b) throw new HttpError(404, "Reservation not found");
  if (b.guest_id !== req.user.id && b.host_id !== req.user.id && !req.user.is_admin) throw new HttpError(404, "Reservation not found");
  return b;
}

/**
 * Registers a booking after the guest's escrow payment transaction. The server independently
 * verifies the transaction on-chain before recording anything.
 */
router.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(
      z.object({
        listingId: z.number().int(),
        network: z.string(),
        txHash: z.string().min(10).max(200),
        payerAddress: z.string().min(1).max(100),
        checkIn: isoDate,
        checkOut: isoDate,
        guests: z.number().int().min(1).max(50),
        message: z.string().max(2000).default(""),
      }),
      req.body
    );
    const l = get(`SELECT * FROM listings WHERE id = ?`, body.listingId);
    if (!l || l.status !== "published") throw new HttpError(404, "Listing not found");
    if (l.host_id === req.user.id) throw new HttpError(400, "You can't book your own listing");
    if (body.guests > l.guests) throw new HttpError(400, `This place allows up to ${l.guests} guests`);

    const { chain } = parseNetwork(body.network);
    const pub = get(`SELECT * FROM listing_chains WHERE listing_id = ? AND network = ?`, l.id, body.network);
    if (!pub) throw new HttpError(400, "This listing doesn't accept payments on that network");

    const wallet = all(`SELECT address FROM wallets WHERE user_id = ? AND chain = ?`, req.user.id, chain).map((w) => w.address.toLowerCase());
    if (!wallet.includes(body.payerAddress.toLowerCase())) throw new HttpError(403, "Connect and verify this wallet on your account before paying with it");

    const existing = get(`SELECT * FROM bookings WHERE tx_hash = ?`, body.txHash);
    if (existing) {
      if (existing.guest_id !== req.user.id) throw new HttpError(409, "Transaction already registered");
      return res.json({ booking: serializeBooking(existing, req.user.id) });
    }

    const checkIn = dayFromDate(body.checkIn);
    const checkOut = dayFromDate(body.checkOut);
    const onChain = await verifyBooking(body.network, {
      txHash: body.txHash,
      guestAddress: body.payerAddress,
      chainListingId: pub.chain_listing_id,
      checkIn,
      checkOut,
    });
    if (onChain.chainListingId !== String(pub.chain_listing_id)) throw new HttpError(400, "Payment is for a different listing");
    if (onChain.checkIn !== checkIn || onChain.checkOut !== checkOut) throw new HttpError(400, "Payment dates don't match");
    if (String(onChain.guest).toLowerCase() !== body.payerAddress.toLowerCase()) throw new HttpError(400, "Payment was made from a different wallet");
    if (get(`SELECT id FROM bookings WHERE network = ? AND chain_booking_id = ?`, body.network, onChain.chainBookingId)) {
      throw new HttpError(409, "This escrow booking is already registered");
    }
    // The chain already guarantees the nights were free; this catches off-chain overlaps.
    if (occupiedDays(l.id, checkIn, checkOut).size) console.warn(`[bookings] overlap with off-chain calendar for listing ${l.id}`);

    const nights = checkOut - checkIn;
    const quote = priceQuote(l, nights);
    const instant = !!l.instant_book;
    const r = run(
      `INSERT INTO bookings (code, listing_id, guest_id, host_id, chain, network, chain_booking_id, tx_hash, payer_address, currency,
        amount_native, check_in, check_out, guests, nights, subtotal_usd, fee_usd, total_usd, status, host_approved, message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bookingCode(),
      l.id,
      req.user.id,
      l.host_id,
      chain,
      body.network,
      onChain.chainBookingId,
      body.txHash,
      body.payerAddress,
      onChain.amountNative.split(" ").pop(),
      onChain.amountNative,
      checkIn,
      checkOut,
      body.guests,
      nights,
      quote.subtotal,
      quote.serviceFee,
      quote.total,
      instant ? "confirmed" : "pending_host",
      instant ? 1 : 0,
      body.message
    );
    const b = get(`SELECT * FROM bookings WHERE id = ?`, r.lastInsertRowid);

    const conv = ensureConversation(l.id, req.user.id, l.host_id, b.id);
    run(
      `INSERT INTO messages (conversation_id, sender_id, body, kind) VALUES (?, NULL, ?, 'system')`,
      conv.id,
      instant
        ? `Reservation ${b.code} confirmed · ${body.checkIn} → ${body.checkOut} · ${onChain.amountNative} held in escrow`
        : `Booking request ${b.code} · ${body.checkIn} → ${body.checkOut} · ${onChain.amountNative} held in escrow. The host has 24 hours to respond.`
    );
    if (body.message.trim()) {
      run(`INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)`, conv.id, req.user.id, body.message.trim());
    }
    run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, conv.id);

    const d = bookingEmailData(b);
    notify(
      req.user.id,
      { type: "booking", title: instant ? "Reservation confirmed" : "Request sent", body: `${l.title} · ${body.checkIn}`, link: `/trips/${b.id}` },
      { template: instant ? "bookingConfirmedGuest" : "bookingRequestGuest", data: d }
    );
    notify(
      l.host_id,
      { type: "booking", title: instant ? "New reservation" : "New booking request", body: `${d.guestName} · ${body.checkIn}`, link: `/hosting/reservations/${b.id}` },
      { template: "newBookingHost", data: { ...d, isRequest: !instant, message: body.message } }
    );
    res.status(201).json({ booking: serializeBooking(b, req.user.id) });
  })
);

function withTimeline(rows, userId) {
  const today = todayDay();
  return rows.map((b) => {
    const s = serializeBooking(b, userId);
    let bucket = "past";
    if (["cancelled_by_guest", "cancelled_by_host", "declined"].includes(b.status)) bucket = "cancelled";
    else if (b.check_out <= today) bucket = "past";
    else if (b.check_in <= today) bucket = "current";
    else bucket = "upcoming";
    return { ...s, bucket };
  });
}

router.get("/trips", (req, res) => {
  const rows = all(`SELECT * FROM bookings WHERE guest_id = ? ORDER BY check_in DESC`, req.user.id);
  res.json({ bookings: withTimeline(rows, req.user.id) });
});

router.get("/hosting", (req, res) => {
  const rows = all(`SELECT * FROM bookings WHERE host_id = ? ORDER BY check_in ASC`, req.user.id);
  res.json({ bookings: withTimeline(rows, req.user.id) });
});

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const b = await syncBooking(loadBooking(req));
    res.json({ booking: serializeBooking(b, req.user.id) });
  })
);

/** Host accepts a request-to-book (the escrow payment is already locked on-chain). */
router.post("/:id/accept", (req, res) => {
  const b = loadBooking(req);
  if (b.host_id !== req.user.id) throw new HttpError(403, "Only the host can accept");
  if (b.status !== "pending_host") throw new HttpError(409, "This request can no longer be accepted");
  run(`UPDATE bookings SET host_approved = 1 WHERE id = ?`, b.id);
  res.json({ booking: serializeBooking(applyStatus(b.id, "confirmed"), req.user.id) });
});

/**
 * Called by the web app after an on-chain action (cancel, release, dispute, resolve).
 * The new status is always read back from the chain, never trusted from the client.
 */
router.post(
  "/:id/sync",
  asyncHandler(async (req, res) => {
    const b = loadBooking(req);
    const body = parse(
      z.object({ txHash: z.string().max(200).optional(), reason: z.string().max(1000).optional(), refundPercent: z.number().min(0).max(100).optional() }),
      req.body || {}
    );
    let status;
    try {
      status = (await readBookingStatus(b.network, b.chain_booking_id)).status;
    } catch (err) {
      throw new HttpError(502, `Couldn't read the escrow status: ${err.message}`);
    }
    if (status === "confirmed" && !b.host_approved) status = "pending_host";
    const updated = status !== b.status ? applyStatus(b.id, status, { txHash: body.txHash, reason: body.reason, refundPercent: body.refundPercent }) : b;
    res.json({ booking: serializeBooking(updated, req.user.id) });
  })
);

export default router;
