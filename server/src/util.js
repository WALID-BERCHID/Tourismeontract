import crypto from "node:crypto";
import { all, get } from "./db.js";

export const DAY_MS = 86_400_000;

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Validate `data` with a zod schema, throwing a 400 with field errors. */
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) fields[issue.path.join(".") || "_"] = issue.message;
    throw new HttpError(400, "Please check the highlighted fields", fields);
  }
  return result.data;
}

export const dayFromDate = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
export const dateFromDay = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
export const todayDay = () => Math.floor(Date.now() / DAY_MS);

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

export function bookingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "HM";
  for (const b of crypto.randomBytes(8)) code += alphabet[b % alphabet.length];
  return code;
}

export function slugify(text) {
  const base = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "listing"}-${crypto.randomBytes(3).toString("hex")}`;
}

const json = (v, fallback) => {
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
};

export function publicUser(u, { withPrivate = false } = {}) {
  if (!u) return null;
  const stats = get(
    `SELECT COUNT(*) AS count, AVG(r.rating) AS avg FROM reviews r WHERE r.subject_id = ? AND r.target = 'host'`,
    u.id
  );
  const listingReviews = get(
    `SELECT COUNT(*) AS count, AVG(r.rating) AS avg FROM reviews r JOIN listings l ON l.id = r.listing_id
     WHERE l.host_id = ? AND r.target = 'listing'`,
    u.id
  );
  const out = {
    id: u.id,
    firstName: u.first_name,
    lastName: withPrivate ? u.last_name : u.last_name ? `${u.last_name[0]}.` : "",
    name: `${u.first_name}${u.last_name ? " " + u.last_name : ""}`.trim() || "Traveler",
    avatarUrl: u.avatar_url,
    bio: u.bio,
    location: u.location,
    work: u.work,
    languages: json(u.languages, []),
    isSuperhost: !!u.is_superhost,
    emailVerified: !!u.email_verified,
    joinedAt: u.created_at,
    hostReviewCount: listingReviews.count,
    hostRating: listingReviews.avg ? Math.round(listingReviews.avg * 100) / 100 : null,
    guestReviewCount: stats.count,
    listingCount: get(`SELECT COUNT(*) AS c FROM listings WHERE host_id = ? AND status = 'published'`, u.id).c,
    wallets: all(`SELECT chain, address FROM wallets WHERE user_id = ?`, u.id),
  };
  if (withPrivate) {
    Object.assign(out, {
      email: u.email,
      phone: u.phone,
      isAdmin: !!u.is_admin,
      emailNotifications: !!u.email_notifications,
      preferredCurrency: u.preferred_currency,
      hasPassword: !!u.password_hash,
    });
  }
  return out;
}

export function listingRating(listingId) {
  const r = get(
    `SELECT COUNT(*) AS count, AVG(rating) AS rating, AVG(cleanliness) AS cleanliness, AVG(accuracy) AS accuracy,
            AVG(communication) AS communication, AVG(location) AS location, AVG(checkin) AS checkin, AVG(value) AS value
     FROM reviews WHERE listing_id = ? AND target = 'listing'`,
    listingId
  );
  const round = (v) => (v == null ? null : Math.round(v * 100) / 100);
  return {
    count: r.count,
    rating: round(r.rating),
    categories: {
      cleanliness: round(r.cleanliness),
      accuracy: round(r.accuracy),
      communication: round(r.communication),
      location: round(r.location),
      checkin: round(r.checkin),
      value: round(r.value),
    },
  };
}

export function serializeListing(l, { full = false, userId = null } = {}) {
  if (!l) return null;
  const rating = listingRating(l.id);
  const chains = all(`SELECT chain, network, chain_listing_id AS chainListingId, contract FROM listing_chains WHERE listing_id = ?`, l.id);
  const out = {
    id: l.id,
    slug: l.slug,
    title: l.title,
    propertyType: l.property_type,
    roomType: l.room_type,
    category: l.category,
    city: l.city,
    region: l.region,
    country: l.country,
    lat: l.lat,
    lng: l.lng,
    guests: l.guests,
    bedrooms: l.bedrooms,
    beds: l.beds,
    baths: l.baths,
    photos: json(l.photos, []),
    priceUsd: l.price_usd,
    cleaningFeeUsd: l.cleaning_fee_usd,
    instantBook: !!l.instant_book,
    status: l.status,
    rating: rating.rating,
    reviewCount: rating.count,
    chains,
    hostId: l.host_id,
    isNew: rating.count === 0,
    wishlisted: userId ? !!get(`SELECT 1 FROM wishlists WHERE user_id = ? AND listing_id = ?`, userId, l.id) : false,
  };
  if (full) {
    Object.assign(out, {
      description: l.description,
      neighborhood: l.neighborhood,
      amenities: json(l.amenities, []),
      houseRules: json(l.house_rules, []),
      cancellationPolicy: l.cancellation_policy,
      minNights: l.min_nights,
      maxNights: l.max_nights,
      checkInTime: l.check_in_time,
      checkOutTime: l.check_out_time,
      ratingDetails: rating.categories,
      createdAt: l.created_at,
      updatedAt: l.updated_at,
    });
  }
  return out;
}

/**
 * Price breakdown in USD, mirroring the on-chain formula (nightly * nights + cleaning, plus the
 * guest service fee). The amount actually charged in crypto is always quoted by the contract.
 */
export function priceQuote(listing, nights) {
  const round = (v) => Math.round(v * 100) / 100;
  const base = listing.price_usd * nights;
  const subtotal = base + listing.cleaning_fee_usd;
  const fee = (subtotal * 800) / 10_000;
  return {
    nightly: listing.price_usd,
    nights,
    base: round(base),
    cleaningFee: listing.cleaning_fee_usd,
    subtotal: round(subtotal),
    serviceFee: round(fee),
    total: round(subtotal + fee),
  };
}
