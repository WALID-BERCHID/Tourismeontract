import { all, get, run } from "../db.js";
import { notify } from "../notify.js";
import { dateFromDay, publicUser } from "../util.js";
import { explorerUrl, networkLabel, readBookingStatus } from "../chains/index.js";

export const ACTIVE_STATUSES = ["pending_host", "confirmed", "completed", "disputed", "resolved"];
const POLICY_LABEL = { flexible: "Flexible", moderate: "Moderate", strict: "Strict" };

export function bookingEmailData(b) {
  const l = get(`SELECT * FROM listings WHERE id = ?`, b.listing_id);
  const host = get(`SELECT * FROM users WHERE id = ?`, b.host_id);
  const guest = get(`SELECT * FROM users WHERE id = ?`, b.guest_id);
  const photos = JSON.parse(l.photos || "[]");
  return {
    bookingId: b.id,
    code: b.code,
    listingId: l.id,
    listingTitle: l.title,
    city: l.city,
    location: `${l.city}, ${l.country}`,
    photo: photos[0],
    checkIn: dateFromDay(b.check_in),
    checkOut: dateFromDay(b.check_out),
    guests: b.guests,
    nights: b.nights,
    total: b.total_usd,
    amountNative: b.amount_native,
    network: networkLabel(b.network),
    txUrl: explorerUrl(b.network, b.tx_hash),
    hostName: host.first_name,
    guestName: `${guest.first_name} ${guest.last_name ? guest.last_name[0] + "." : ""}`.trim(),
    policy: POLICY_LABEL[l.cancellation_policy],
    hostPayout: Math.round(b.subtotal_usd * 0.97 * 100) / 100,
  };
}

export function serializeBooking(b, viewerId) {
  const l = get(`SELECT id, title, city, country, photos, host_id, cancellation_policy, check_in_time, check_out_time, address, lat, lng FROM listings WHERE id = ?`, b.listing_id);
  const isGuest = viewerId === b.guest_id;
  const showAddress = ["confirmed", "completed", "disputed", "resolved"].includes(b.status);
  const review = get(`SELECT id, rating FROM reviews WHERE booking_id = ? AND target = 'listing'`, b.id);
  const guestReview = get(`SELECT id, rating FROM reviews WHERE booking_id = ? AND target = 'guest'`, b.id);
  const conversation = get(`SELECT id FROM conversations WHERE listing_id = ? AND guest_id = ?`, b.listing_id, b.guest_id);
  return {
    id: b.id,
    code: b.code,
    status: b.status,
    chain: b.chain,
    network: b.network,
    networkName: networkLabel(b.network),
    chainBookingId: b.chain_booking_id,
    txHash: b.tx_hash,
    txUrl: explorerUrl(b.network, b.tx_hash),
    payerAddress: b.payer_address,
    currency: b.currency,
    amountNative: b.amount_native,
    checkIn: dateFromDay(b.check_in),
    checkOut: dateFromDay(b.check_out),
    checkInDay: b.check_in,
    checkOutDay: b.check_out,
    guests: b.guests,
    nights: b.nights,
    subtotalUsd: b.subtotal_usd,
    feeUsd: b.fee_usd,
    totalUsd: b.total_usd,
    hostPayoutUsd: Math.round(b.subtotal_usd * 0.97 * 100) / 100,
    message: b.message,
    createdAt: b.created_at,
    updatedAt: b.updated_at,
    reviewed: !!review,
    guestReviewed: !!guestReview,
    conversationId: conversation?.id || null,
    listing: {
      id: l.id,
      title: l.title,
      city: l.city,
      country: l.country,
      photo: JSON.parse(l.photos || "[]")[0] || null,
      cancellationPolicy: l.cancellation_policy,
      checkInTime: l.check_in_time,
      checkOutTime: l.check_out_time,
      address: showAddress && (isGuest || viewerId === l.host_id) ? l.address : null,
      lat: l.lat,
      lng: l.lng,
    },
    guest: publicUser(get(`SELECT * FROM users WHERE id = ?`, b.guest_id)),
    host: publicUser(get(`SELECT * FROM users WHERE id = ?`, b.host_id)),
  };
}

export function ensureConversation(listingId, guestId, hostId, bookingId = null) {
  let conv = get(`SELECT * FROM conversations WHERE listing_id = ? AND guest_id = ?`, listingId, guestId);
  if (!conv) {
    const r = run(`INSERT INTO conversations (listing_id, guest_id, host_id, booking_id) VALUES (?, ?, ?, ?)`, listingId, guestId, hostId, bookingId);
    conv = get(`SELECT * FROM conversations WHERE id = ?`, r.lastInsertRowid);
  } else if (bookingId && conv.booking_id !== bookingId) {
    run(`UPDATE conversations SET booking_id = ? WHERE id = ?`, bookingId, conv.id);
  }
  return conv;
}

export function systemMessage(listingId, guestId, hostId, body, bookingId = null) {
  const conv = ensureConversation(listingId, guestId, hostId, bookingId);
  run(`INSERT INTO messages (conversation_id, sender_id, body, kind) VALUES (?, NULL, ?, 'system')`, conv.id, body);
  run(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`, conv.id);
  return conv;
}

/**
 * Moves a booking to `status` and runs the side effects (system message, in-app notifications,
 * emails). Idempotent: calling it twice with the same status does nothing.
 */
export function applyStatus(bookingId, status, { txHash = null, reason = "", refundPercent = null } = {}) {
  const b = get(`SELECT * FROM bookings WHERE id = ?`, bookingId);
  if (!b || b.status === status) return b;
  const prev = b.status;
  // A host "cancel" of a request that was never accepted is a decline.
  if (status === "cancelled_by_host" && prev === "pending_host") status = "declined";
  if (status === "cancelled_by_host" && prev === "declined") return b;
  run(`UPDATE bookings SET status = ?, last_tx_hash = COALESCE(?, last_tx_hash), updated_at = datetime('now') WHERE id = ?`, status, txHash, b.id);
  const updated = get(`SELECT * FROM bookings WHERE id = ?`, b.id);
  const d = bookingEmailData(updated);
  const tripLink = `/trips/${b.id}`;
  const hostLink = `/hosting/reservations/${b.id}`;

  switch (status) {
    case "confirmed":
      if (prev === "pending_host") {
        systemMessage(b.listing_id, b.guest_id, b.host_id, `${d.hostName} accepted the booking request. Reservation ${b.code} is confirmed.`, b.id);
        notify(b.guest_id, { type: "booking", title: "Request accepted", body: `${d.listingTitle} · ${d.checkIn}`, link: tripLink }, { template: "bookingAccepted", data: d });
      }
      break;
    case "declined":
      systemMessage(b.listing_id, b.guest_id, b.host_id, `The host declined this request. The escrow refunded the guest in full.`, b.id);
      notify(b.guest_id, { type: "booking", title: "Request declined – fully refunded", body: d.listingTitle, link: tripLink }, {
        template: "bookingCancelled",
        data: { ...d, cancelledBy: "the host (request declined)", refund: `${b.amount_native} (100%)`, refundNote: "The refund is available to withdraw from the escrow contract." },
      });
      break;
    case "cancelled_by_guest":
    case "cancelled_by_host": {
      const byHost = status === "cancelled_by_host";
      systemMessage(b.listing_id, b.guest_id, b.host_id, `Reservation ${b.code} was cancelled by the ${byHost ? "host" : "guest"}.`, b.id);
      const common = { ...d, cancelledBy: byHost ? "the host" : "the guest", refund: byHost ? `${b.amount_native} (100%)` : null };
      notify(b.guest_id, { type: "booking", title: "Reservation cancelled", body: d.listingTitle, link: tripLink }, { template: "bookingCancelled", data: common });
      notify(b.host_id, { type: "booking", title: "Reservation cancelled", body: `${d.guestName} · ${d.checkIn}`, link: hostLink }, { template: "bookingCancelled", data: { ...common, isHost: true } });
      break;
    }
    case "completed":
      notify(b.host_id, { type: "payout", title: "Payout released", body: `${d.listingTitle} · ${b.code}`, link: "/hosting/earnings" }, { template: "payoutReleased", data: d });
      notify(b.guest_id, { type: "review", title: `How was ${d.city}?`, body: "Leave a review for your host", link: `${tripLink}?review=1` }, { template: "reviewReminder", data: d, transactional: false });
      break;
    case "disputed":
      systemMessage(b.listing_id, b.guest_id, b.host_id, `The guest reported an issue: “${reason || "No details provided"}”. The payout is on hold until the arbiter resolves the case.`, b.id);
      notify(b.guest_id, { type: "dispute", title: "Issue reported", body: d.listingTitle, link: tripLink }, { template: "disputeOpened", data: { ...d, reason } });
      notify(b.host_id, { type: "dispute", title: "A guest reported an issue", body: d.listingTitle, link: hostLink }, { template: "disputeOpened", data: { ...d, reason } });
      break;
    case "resolved":
      systemMessage(b.listing_id, b.guest_id, b.host_id, `The dispute was resolved on-chain${refundPercent != null ? ` (${refundPercent}% refunded to the guest)` : ""}.`, b.id);
      for (const uid of [b.guest_id, b.host_id]) {
        notify(uid, { type: "dispute", title: "Dispute resolved", body: d.listingTitle, link: uid === b.guest_id ? tripLink : hostLink }, { template: "disputeResolved", data: { ...d, refundPercent: refundPercent ?? "—" } });
      }
      break;
    default:
  }
  return updated;
}

/** Re-reads a booking's status from its chain and applies any change. */
export async function syncBooking(b) {
  if (!b.chain_booking_id) return b;
  try {
    const onChain = await readBookingStatus(b.network, b.chain_booking_id);
    let status = onChain.status;
    // Host approval is an off-chain step on top of an on-chain "Booked" escrow.
    if (status === "confirmed" && !b.host_approved) status = "pending_host";
    if (status && status !== "none" && status !== b.status) return applyStatus(b.id, status);
  } catch {
    // RPC unavailable – keep the last known status.
  }
  return get(`SELECT * FROM bookings WHERE id = ?`, b.id);
}

export function occupiedDays(listingId, fromDay, toDay) {
  const booked = all(
    `SELECT check_in, check_out FROM bookings WHERE listing_id = ? AND status IN (${ACTIVE_STATUSES.map(() => "?").join(",")})
     AND check_out > ? AND check_in < ?`,
    listingId,
    ...ACTIVE_STATUSES,
    fromDay,
    toDay
  );
  const days = new Set();
  for (const b of booked) for (let d = b.check_in; d < b.check_out; d++) days.add(d);
  for (const r of all(`SELECT day FROM blocked_days WHERE listing_id = ? AND day >= ? AND day < ?`, listingId, fromDay, toDay)) days.add(r.day);
  return days;
}
