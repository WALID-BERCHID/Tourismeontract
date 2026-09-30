const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const fmtDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const money = (v) => `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function layout({ platform, appUrl, preheader = "", body }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f7f7f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#222">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f7f7;padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #ebebeb">
<tr><td style="padding:28px 32px 0">
<a href="${appUrl}" style="text-decoration:none;color:#E61E4D;font-size:24px;font-weight:800;letter-spacing:-0.5px">${esc(platform)}</a>
</td></tr>
<tr><td style="padding:20px 32px 32px;font-size:16px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #ebebeb;font-size:12px;color:#717171;line-height:1.5">
Payments on ${esc(platform)} are held in a smart-contract escrow and released to the host 24 hours after check-in.<br>
You're receiving this email because of activity on your ${esc(platform)} account. <a href="${appUrl}/account" style="color:#717171">Notification settings</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href, label) =>
  `<p style="margin:28px 0"><a href="${href}" style="background:linear-gradient(90deg,#E61E4D,#D70466);color:#fff;text-decoration:none;padding:14px 24px;border-radius:8px;font-weight:600;display:inline-block">${esc(label)}</a></p>`;

function tripCard(d) {
  const photo = d.photo ? `<img src="${esc(d.photo)}" alt="" width="496" style="width:100%;max-width:496px;height:auto;border-radius:12px;display:block;margin-bottom:16px">` : "";
  return `<div style="border:1px solid #ebebeb;border-radius:12px;padding:16px;margin:20px 0">
${photo}
<div style="font-weight:600;font-size:17px">${esc(d.listingTitle)}</div>
<div style="color:#717171;font-size:14px;margin-top:2px">${esc(d.location || "")}</div>
<table role="presentation" width="100%" style="margin-top:14px;font-size:14px">
<tr><td style="color:#717171">Check-in</td><td align="right">${fmtDate(d.checkIn)}</td></tr>
<tr><td style="color:#717171">Checkout</td><td align="right">${fmtDate(d.checkOut)}</td></tr>
${d.guests ? `<tr><td style="color:#717171">Guests</td><td align="right">${d.guests}</td></tr>` : ""}
${d.code ? `<tr><td style="color:#717171">Confirmation code</td><td align="right"><b>${esc(d.code)}</b></td></tr>` : ""}
${d.total != null ? `<tr><td style="color:#717171">Total</td><td align="right"><b>${money(d.total)}</b>${d.amountNative ? ` <span style="color:#717171">(${esc(d.amountNative)})</span>` : ""}</td></tr>` : ""}
${d.network ? `<tr><td style="color:#717171">Paid on</td><td align="right">${esc(d.network)}</td></tr>` : ""}
</table>
${d.txUrl ? `<p style="font-size:13px;margin:12px 0 0"><a href="${esc(d.txUrl)}" style="color:#222">View escrow transaction ↗</a></p>` : ""}
</div>`;
}

const make = (subject, preheader, bodyFn) => (d) => {
  const body = bodyFn(d);
  return {
    subject: subject(d),
    html: layout({ platform: d.platform, appUrl: d.appUrl, preheader: preheader(d), body }),
    text: body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  };
};

export const templates = {
  welcome: make(
    (d) => `Welcome to ${d.platform}, ${d.firstName}!`,
    () => "Confirm your email to start booking",
    (d) => `<h1 style="font-size:24px;margin:0 0 12px">Welcome, ${esc(d.firstName)} 👋</h1>
<p>Thanks for joining ${esc(d.platform)} — unique stays around the world, paid securely through smart-contract escrow on Ethereum, Polygon, Base, Solana and EOS.</p>
<p>Please confirm your email address so we can send you booking confirmations and messages from hosts.</p>
${button(d.verifyUrl, "Confirm email")}
<p style="color:#717171;font-size:14px">This link expires in 48 hours.</p>`
  ),

  verifyEmail: make(
    (d) => `Confirm your email for ${d.platform}`,
    () => "One click to confirm your email",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Confirm your email</h1>
<p>Hi ${esc(d.firstName)}, tap the button below to confirm this email address.</p>
${button(d.verifyUrl, "Confirm email")}`
  ),

  passwordReset: make(
    (d) => `Reset your ${d.platform} password`,
    () => "Reset link inside – valid for 1 hour",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Reset your password</h1>
<p>Hi ${esc(d.firstName)}, we received a request to reset your password. If this was you, choose a new one below.</p>
${button(d.resetUrl, "Reset password")}
<p style="color:#717171;font-size:14px">The link expires in 1 hour. If you didn't ask for this, you can safely ignore this email.</p>`
  ),

  bookingConfirmedGuest: make(
    (d) => `Reservation confirmed for ${d.listingTitle}`,
    (d) => `You're going to ${d.location}!`,
    (d) => `<h1 style="font-size:24px;margin:0 0 12px">You're going to ${esc(d.city || d.location)}! 🎉</h1>
<p>Hi ${esc(d.firstName)}, your reservation with ${esc(d.hostName)} is confirmed. Your payment is locked in the escrow contract and will only be released to the host 24 hours after you check in.</p>
${tripCard(d)}
${button(`${d.appUrl}/trips/${d.bookingId}`, "View your trip")}
<p style="font-size:14px;color:#717171">Cancellation policy: <b>${esc(d.policy)}</b>. Need to change plans? Manage your reservation from your Trips page.</p>`
  ),

  bookingRequestGuest: make(
    (d) => `Request sent to ${d.hostName}`,
    () => "Your payment is held in escrow until the host responds",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Your request has been sent</h1>
<p>Hi ${esc(d.firstName)}, ${esc(d.hostName)} has 24 hours to accept your request. Your payment is safely held in escrow — if the host declines, you're refunded in full automatically.</p>
${tripCard(d)}
${button(`${d.appUrl}/trips/${d.bookingId}`, "View request")}`
  ),

  newBookingHost: make(
    (d) => (d.isRequest ? `Booking request from ${d.guestName}` : `New reservation: ${d.guestName} arrives ${fmtDate(d.checkIn)}`),
    (d) => `${d.nights} nights · ${money(d.hostPayout)} payout`,
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">${d.isRequest ? "New booking request" : "New reservation confirmed"}</h1>
<p>Hi ${esc(d.firstName)}, <b>${esc(d.guestName)}</b> ${d.isRequest ? "would like to stay" : "booked"} ${d.nights} night${d.nights > 1 ? "s" : ""} at ${esc(d.listingTitle)}.</p>
${d.message ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f7f7f7;border-radius:8px;font-style:italic">“${esc(d.message)}”</blockquote>` : ""}
${tripCard(d)}
<p>Your estimated payout is <b>${money(d.hostPayout)}</b>, released from escrow 24 hours after check-in.</p>
${button(`${d.appUrl}/hosting/reservations/${d.bookingId}`, d.isRequest ? "Review request" : "View reservation")}`
  ),

  bookingAccepted: make(
    (d) => `${d.hostName} accepted your request`,
    () => "Your reservation is confirmed",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Request accepted ✅</h1>
<p>Hi ${esc(d.firstName)}, great news — ${esc(d.hostName)} accepted your booking request.</p>
${tripCard(d)}
${button(`${d.appUrl}/trips/${d.bookingId}`, "View your trip")}`
  ),

  bookingCancelled: make(
    (d) => `Reservation ${d.code} cancelled`,
    (d) => (d.refund ? `Refund: ${d.refund}` : "Your reservation was cancelled"),
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Reservation cancelled</h1>
<p>Hi ${esc(d.firstName)}, the reservation below was cancelled by ${esc(d.cancelledBy)}.</p>
${tripCard(d)}
${d.refund ? `<p>Refund to the guest: <b>${esc(d.refund)}</b>. ${d.refundNote || ""}</p>` : ""}
${button(`${d.appUrl}/${d.isHost ? "hosting/reservations" : "trips"}/${d.bookingId}`, "View details")}`
  ),

  payoutReleased: make(
    (d) => `Payout released for ${d.listingTitle}`,
    (d) => `${d.amountNative} is ready to withdraw`,
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Your payout is ready 💸</h1>
<p>Hi ${esc(d.firstName)}, the escrow for reservation <b>${esc(d.code)}</b> has been released. <b>${esc(d.amountNative)}</b> is now available in your on-chain balance.</p>
${button(`${d.appUrl}/hosting/earnings`, "Withdraw earnings")}`
  ),

  disputeOpened: make(
    (d) => `Issue reported for reservation ${d.code}`,
    () => "The payout is on hold while we review",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">An issue was reported</h1>
<p>Hi ${esc(d.firstName)}, an issue was reported for reservation <b>${esc(d.code)}</b> at ${esc(d.listingTitle)}:</p>
<blockquote style="margin:16px 0;padding:12px 16px;background:#f7f7f7;border-radius:8px">${esc(d.reason)}</blockquote>
<p>The escrow payout is paused until our resolution team (the on-chain arbiter) reviews the case. Please reply in the conversation with any photos or details.</p>
${button(`${d.appUrl}/messages`, "Open messages")}`
  ),

  disputeResolved: make(
    (d) => `Resolution for reservation ${d.code}`,
    () => "The escrow has been settled",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Case resolved</h1>
<p>Hi ${esc(d.firstName)}, the dispute for reservation <b>${esc(d.code)}</b> has been settled on-chain. The guest was refunded <b>${d.refundPercent}%</b> of the stay.</p>
${button(`${d.appUrl}/trips`, "View details")}`
  ),

  newMessage: make(
    (d) => `New message from ${d.senderName}`,
    (d) => d.preview,
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">${esc(d.senderName)} sent you a message</h1>
<p style="color:#717171;font-size:14px;margin:0">About ${esc(d.listingTitle)}</p>
<blockquote style="margin:16px 0;padding:14px 16px;background:#f7f7f7;border-radius:8px">${esc(d.preview)}</blockquote>
${button(`${d.appUrl}/messages/${d.conversationId}`, "Reply")}`
  ),

  reviewReminder: make(
    (d) => `How was your stay at ${d.listingTitle}?`,
    () => "Leave a review – it takes 1 minute",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Share your experience</h1>
<p>Hi ${esc(d.firstName)}, we hope you enjoyed ${esc(d.listingTitle)}. Your review helps other travelers and is recorded on-chain for transparency.</p>
${button(`${d.appUrl}/trips/${d.bookingId}?review=1`, "Write a review")}`
  ),

  newReview: make(
    (d) => `${d.authorName} left you a ${d.rating}-star review`,
    (d) => d.comment.slice(0, 90),
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">You got a new review ${"★".repeat(d.rating)}</h1>
<blockquote style="margin:16px 0;padding:14px 16px;background:#f7f7f7;border-radius:8px">${esc(d.comment)}</blockquote>
<p style="color:#717171">— ${esc(d.authorName)}</p>
${button(`${d.appUrl}/users/${d.subjectId}`, "See your profile")}`
  ),

  listingPublished: make(
    (d) => `Your listing is live: ${d.listingTitle}`,
    () => "Guests can now book your place",
    (d) => `<h1 style="font-size:22px;margin:0 0 12px">Congratulations, your place is live! 🏡</h1>
<p>Hi ${esc(d.firstName)}, <b>${esc(d.listingTitle)}</b> is now published${d.networks ? ` and bookable on ${esc(d.networks)}` : ""}.</p>
${button(`${d.appUrl}/rooms/${d.listingId}`, "View listing")}`
  ),
};
