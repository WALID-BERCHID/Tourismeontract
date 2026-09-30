import { Router } from "express";
import { z } from "zod";
import { all, get, run } from "../db.js";
import { optionalAuth, requireAuth } from "../auth.js";
import { notify } from "../notify.js";
import { parseNetwork, networkLabel } from "../chains/index.js";
import { escrowContract, readEvmCalendar } from "../chains/evm.js";
import { occupiedDays } from "../services/bookings.js";
import { HttpError, asyncHandler, dayFromDate, parse, priceQuote, publicUser, serializeListing, slugify, todayDay } from "../util.js";

const router = Router();

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const listingSchema = z.object({
  title: z.string().trim().min(10, "At least 10 characters").max(100),
  propertyType: z.string().trim().min(2).max(40),
  roomType: z.enum(["entire", "private", "shared"]),
  category: z.string().trim().min(2).max(40),
  description: z.string().trim().min(30, "Tell guests a bit more (30+ characters)").max(5000),
  city: z.string().trim().min(1, "Required").max(80),
  region: z.string().trim().max(80).default(""),
  country: z.string().trim().min(1, "Required").max(80),
  neighborhood: z.string().trim().max(160).default(""),
  address: z.string().trim().max(200).default(""),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  guests: z.number().int().min(1).max(50),
  bedrooms: z.number().int().min(0).max(50),
  beds: z.number().int().min(1).max(100),
  baths: z.number().min(0).max(50),
  amenities: z.array(z.string().max(40)).max(80).default([]),
  photos: z.array(z.string().max(500)).min(1, "Add at least one photo").max(40),
  houseRules: z.array(z.string().max(200)).max(30).default([]),
  priceUsd: z.number().min(10, "Minimum $10").max(50_000),
  cleaningFeeUsd: z.number().min(0).max(5_000).default(0),
  cancellationPolicy: z.enum(["flexible", "moderate", "strict"]),
  minNights: z.number().int().min(1).max(365),
  maxNights: z.number().int().min(1).max(365),
  instantBook: z.boolean().default(true),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).default("15:00"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  status: z.enum(["draft", "published", "unlisted"]).default("draft"),
});

const COLUMNS = {
  title: "title",
  propertyType: "property_type",
  roomType: "room_type",
  category: "category",
  description: "description",
  city: "city",
  region: "region",
  country: "country",
  neighborhood: "neighborhood",
  address: "address",
  lat: "lat",
  lng: "lng",
  guests: "guests",
  bedrooms: "bedrooms",
  beds: "beds",
  baths: "baths",
  priceUsd: "price_usd",
  cleaningFeeUsd: "cleaning_fee_usd",
  cancellationPolicy: "cancellation_policy",
  minNights: "min_nights",
  maxNights: "max_nights",
  checkInTime: "check_in_time",
  checkOutTime: "check_out_time",
  status: "status",
};
const JSON_COLUMNS = { amenities: "amenities", photos: "photos", houseRules: "house_rules" };

function toRow(body) {
  const row = {};
  for (const [k, col] of Object.entries(COLUMNS)) if (body[k] !== undefined) row[col] = body[k];
  for (const [k, col] of Object.entries(JSON_COLUMNS)) if (body[k] !== undefined) row[col] = JSON.stringify(body[k]);
  if (body.instantBook !== undefined) row.instant_book = body.instantBook ? 1 : 0;
  return row;
}

function ownListing(req) {
  const l = get(`SELECT * FROM listings WHERE id = ?`, Number(req.params.id));
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.host_id !== req.user.id && !req.user.is_admin) throw new HttpError(403, "Not your listing");
  return l;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

router.get("/", optionalAuth, (req, res) => {
  const q = parse(
    z.object({
      location: z.string().trim().max(100).optional(),
      checkIn: isoDate.optional(),
      checkOut: isoDate.optional(),
      guests: z.coerce.number().int().min(1).max(50).optional(),
      category: z.string().max(40).optional(),
      roomType: z.enum(["entire", "private", "shared"]).optional(),
      minPrice: z.coerce.number().min(0).optional(),
      maxPrice: z.coerce.number().min(0).optional(),
      bedrooms: z.coerce.number().int().min(0).optional(),
      beds: z.coerce.number().int().min(0).optional(),
      baths: z.coerce.number().min(0).optional(),
      amenities: z.string().max(500).optional(),
      propertyTypes: z.string().max(300).optional(),
      instantBook: z.enum(["1", "true"]).optional(),
      network: z.string().max(40).optional(),
      bounds: z.string().regex(/^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/).optional(),
      sort: z.enum(["recommended", "price_asc", "price_desc", "rating", "newest"]).default("recommended"),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(24),
    }),
    req.query
  );

  const where = [`l.status = 'published'`];
  const params = [];
  if (q.location) {
    const terms = q.location.split(",").map((t) => t.trim()).filter(Boolean);
    for (const t of terms.slice(0, 2)) {
      where.push(`(l.city LIKE ? OR l.region LIKE ? OR l.country LIKE ? OR l.neighborhood LIKE ? OR l.title LIKE ?)`);
      params.push(...Array(5).fill(`%${t}%`));
    }
  }
  if (q.guests) (where.push(`l.guests >= ?`), params.push(q.guests));
  if (q.category) (where.push(`l.category = ?`), params.push(q.category));
  if (q.roomType) (where.push(`l.room_type = ?`), params.push(q.roomType));
  if (q.minPrice != null) (where.push(`l.price_usd >= ?`), params.push(q.minPrice));
  if (q.maxPrice != null && q.maxPrice > 0) (where.push(`l.price_usd <= ?`), params.push(q.maxPrice));
  if (q.bedrooms) (where.push(`l.bedrooms >= ?`), params.push(q.bedrooms));
  if (q.beds) (where.push(`l.beds >= ?`), params.push(q.beds));
  if (q.baths) (where.push(`l.baths >= ?`), params.push(q.baths));
  if (q.instantBook) where.push(`l.instant_book = 1`);
  if (q.network) (where.push(`EXISTS (SELECT 1 FROM listing_chains c WHERE c.listing_id = l.id AND c.network = ?)`), params.push(q.network));
  if (q.propertyTypes) {
    const types = q.propertyTypes.split(",").filter(Boolean);
    where.push(`l.property_type IN (${types.map(() => "?").join(",")})`);
    params.push(...types);
  }
  if (q.amenities) {
    for (const a of q.amenities.split(",").filter(Boolean)) {
      where.push(`EXISTS (SELECT 1 FROM json_each(l.amenities) WHERE value = ?)`);
      params.push(a);
    }
  }
  if (q.bounds) {
    const [south, west, north, east] = q.bounds.split(",").map(Number);
    where.push(`l.lat BETWEEN ? AND ?`);
    params.push(south, north);
    if (west <= east) (where.push(`l.lng BETWEEN ? AND ?`), params.push(west, east));
    else (where.push(`(l.lng >= ? OR l.lng <= ?)`), params.push(west, east));
  }

  const order = {
    recommended: `(SELECT COALESCE(AVG(r.rating), 4.6) + MIN(COUNT(r.id), 50) * 0.004 FROM reviews r WHERE r.listing_id = l.id AND r.target = 'listing') DESC, l.id DESC`,
    price_asc: `l.price_usd ASC`,
    price_desc: `l.price_usd DESC`,
    rating: `(SELECT COALESCE(AVG(r.rating), 0) FROM reviews r WHERE r.listing_id = l.id AND r.target = 'listing') DESC`,
    newest: `l.created_at DESC, l.id DESC`,
  }[q.sort];

  let rows = all(`SELECT l.* FROM listings l WHERE ${where.join(" AND ")} ORDER BY ${order}`, ...params);

  let nights = null;
  if (q.checkIn && q.checkOut) {
    const from = dayFromDate(q.checkIn);
    const to = dayFromDate(q.checkOut);
    if (to <= from) throw new HttpError(400, "Checkout must be after check-in");
    nights = to - from;
    rows = rows.filter((l) => {
      if (nights < l.min_nights || nights > l.max_nights) return false;
      const occ = occupiedDays(l.id, from, to);
      return occ.size === 0;
    });
  }

  const allPrices = rows.map((r) => r.price_usd);
  const total = rows.length;
  const pageRows = rows.slice((q.page - 1) * q.limit, q.page * q.limit);
  res.json({
    total,
    page: q.page,
    pages: Math.max(1, Math.ceil(total / q.limit)),
    nights,
    priceRange: allPrices.length ? { min: Math.min(...allPrices), max: Math.max(...allPrices) } : null,
    results: pageRows.map((l) => ({
      ...serializeListing(l, { userId: req.user?.id }),
      totalUsd: nights ? priceQuote(l, nights).total : null,
    })),
  });
});

router.get("/suggestions", (req, res) => {
  const q = String(req.query.q || "").trim();
  const rows = q
    ? all(
        `SELECT city, region, country, COUNT(*) AS n FROM listings WHERE status = 'published' AND (city LIKE ? OR country LIKE ? OR region LIKE ?)
         GROUP BY city, country ORDER BY (city LIKE ?) DESC, n DESC, city LIMIT 8`,
        `${q}%`,
        `${q}%`,
        `${q}%`,
        `${q}%`
      )
    : all(`SELECT city, region, country, COUNT(*) AS n FROM listings WHERE status = 'published' GROUP BY city, country ORDER BY n DESC, city LIMIT 8`);
  res.json(rows.map((r) => ({ label: `${r.city}, ${r.country}`, city: r.city, region: r.region, country: r.country, count: r.n })));
});

// ---------------------------------------------------------------------------
// Listing detail
// ---------------------------------------------------------------------------

function loadVisible(req) {
  const l = get(`SELECT * FROM listings WHERE id = ? OR slug = ?`, Number(req.params.id) || -1, req.params.id);
  if (!l) throw new HttpError(404, "Listing not found");
  if (l.status !== "published" && l.host_id !== req.user?.id && !req.user?.is_admin) throw new HttpError(404, "Listing not found");
  return l;
}

function reviewsFor(listingId, limit, offset = 0) {
  return all(
    `SELECT r.*, u.first_name, u.avatar_url, u.location AS author_location, u.created_at AS author_joined
     FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.listing_id = ? AND r.target = 'listing' ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    listingId,
    limit,
    offset
  ).map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    createdAt: r.created_at,
    txHash: r.tx_hash,
    author: { id: r.author_id, name: r.first_name, avatarUrl: r.avatar_url, location: r.author_location, joinedAt: r.author_joined },
  }));
}

router.get("/:id", optionalAuth, (req, res) => {
  const l = loadVisible(req);
  const host = get(`SELECT * FROM users WHERE id = ?`, l.host_id);
  const today = todayDay();
  const occupied = [...occupiedDays(l.id, today, today + 400)].sort((a, b) => a - b);
  const listing = serializeListing(l, { full: true, userId: req.user?.id });
  const canSeeAddress = req.user && (req.user.id === l.host_id || req.user.is_admin);
  res.json({
    listing: { ...listing, address: canSeeAddress ? l.address : null },
    host: publicUser(host),
    reviews: reviewsFor(l.id, 6),
    occupiedDays: occupied,
    today,
    networks: listing.chains.map((c) => ({ ...c, name: networkLabel(c.network) })),
  });
});

router.get("/:id/reviews", optionalAuth, (req, res) => {
  const l = loadVisible(req);
  const page = Math.max(1, Number(req.query.page) || 1);
  res.json({ reviews: reviewsFor(l.id, 20, (page - 1) * 20) });
});

/** Availability merged from the database and (for EVM) the on-chain calendar. */
router.get(
  "/:id/calendar",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const l = loadVisible(req);
    const today = todayDay();
    const days = occupiedDays(l.id, today, today + 400);
    const network = req.query.network ? String(req.query.network) : null;
    if (network) {
      const pub = get(`SELECT * FROM listing_chains WHERE listing_id = ? AND network = ?`, l.id, network);
      const { chain, id } = parseNetwork(network);
      if (pub && chain === "evm") {
        try {
          for (let from = today; from < today + 400; from += 200) {
            for (const d of await readEvmCalendar(id, pub.chain_listing_id, from, 200)) days.add(d);
          }
        } catch {
          /* RPC down: fall back to database availability */
        }
      }
    }
    res.json({ today, occupiedDays: [...days].sort((a, b) => a - b) });
  })
);

router.get("/:id/quote", optionalAuth, (req, res) => {
  const l = loadVisible(req);
  const q = parse(z.object({ checkIn: isoDate, checkOut: isoDate }), req.query);
  const from = dayFromDate(q.checkIn);
  const to = dayFromDate(q.checkOut);
  const nights = to - from;
  let error = null;
  if (nights <= 0) error = "Checkout must be after check-in";
  else if (from < todayDay()) error = "Check-in can't be in the past";
  else if (nights < l.min_nights) error = `Minimum stay is ${l.min_nights} nights`;
  else if (nights > l.max_nights) error = `Maximum stay is ${l.max_nights} nights`;
  else if (occupiedDays(l.id, from, to).size) error = "Those dates are not available";
  res.json({ available: !error, error, quote: nights > 0 ? priceQuote(l, nights) : null });
});

// ---------------------------------------------------------------------------
// Hosting
// ---------------------------------------------------------------------------

router.post("/", requireAuth, (req, res) => {
  const body = parse(listingSchema, req.body);
  if (body.maxNights < body.minNights) throw new HttpError(400, "Please check the highlighted fields", { maxNights: "Must be ≥ minimum nights" });
  const row = toRow(body);
  row.slug = slugify(`${body.title} ${body.city}`);
  row.host_id = req.user.id;
  const cols = Object.keys(row);
  const r = run(`INSERT INTO listings (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...Object.values(row));
  const l = get(`SELECT * FROM listings WHERE id = ?`, r.lastInsertRowid);
  if (l.status === "published") {
    notify(req.user.id, { type: "listing", title: "Your listing is live", body: l.title, link: `/rooms/${l.id}` }, { template: "listingPublished", data: { listingTitle: l.title, listingId: l.id } });
  }
  res.status(201).json({ listing: serializeListing(l, { full: true }) });
});

router.patch("/:id", requireAuth, (req, res) => {
  const l = ownListing(req);
  const body = parse(listingSchema.partial(), req.body);
  const row = toRow(body);
  const min = body.minNights ?? l.min_nights;
  const max = body.maxNights ?? l.max_nights;
  if (max < min) throw new HttpError(400, "Please check the highlighted fields", { maxNights: "Must be ≥ minimum nights" });
  if (Object.keys(row).length) {
    run(
      `UPDATE listings SET ${Object.keys(row).map((c) => `${c} = ?`).join(", ")}, updated_at = datetime('now') WHERE id = ?`,
      ...Object.values(row),
      l.id
    );
  }
  const updated = get(`SELECT * FROM listings WHERE id = ?`, l.id);
  if (l.status !== "published" && updated.status === "published") {
    notify(req.user.id, { type: "listing", title: "Your listing is live", body: updated.title, link: `/rooms/${l.id}` }, { template: "listingPublished", data: { listingTitle: updated.title, listingId: l.id } });
  }
  res.json({ listing: serializeListing(updated, { full: true }) });
});

router.delete("/:id", requireAuth, (req, res) => {
  const l = ownListing(req);
  const active = get(`SELECT COUNT(*) AS c FROM bookings WHERE listing_id = ? AND status IN ('pending_host','confirmed','disputed') AND check_out >= ?`, l.id, todayDay()).c;
  if (active) throw new HttpError(409, "This listing has upcoming reservations. Unlist it instead, or cancel them first.");
  const anyBookings = get(`SELECT COUNT(*) AS c FROM bookings WHERE listing_id = ?`, l.id).c;
  if (anyBookings) run(`UPDATE listings SET status = 'unlisted' WHERE id = ?`, l.id);
  else run(`DELETE FROM listings WHERE id = ?`, l.id);
  res.json({ ok: true });
});

/** Record that the host published the listing on a blockchain network. */
router.post(
  "/:id/chains",
  requireAuth,
  asyncHandler(async (req, res) => {
    const l = ownListing(req);
    const body = parse(z.object({ network: z.string(), chainListingId: z.string().regex(/^\d+$/), txHash: z.string().max(200).optional() }), req.body);
    const { chain, id } = parseNetwork(body.network);
    let contract = "";
    if (chain === "evm") {
      const escrow = escrowContract(id);
      const onChain = await escrow.getListing(body.chainListingId);
      const wallets = all(`SELECT address FROM wallets WHERE user_id = ? AND chain = 'evm'`, req.user.id).map((w) => w.address.toLowerCase());
      if (!wallets.includes(onChain.host.toLowerCase())) throw new HttpError(403, "The on-chain listing host is not one of your linked wallets");
      contract = await escrow.getAddress();
    }
    run(
      `INSERT INTO listing_chains (listing_id, chain, network, chain_listing_id, contract, tx_hash) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(listing_id, network) DO UPDATE SET chain_listing_id = excluded.chain_listing_id, contract = excluded.contract, tx_hash = excluded.tx_hash`,
      l.id,
      chain,
      body.network,
      body.chainListingId,
      contract,
      body.txHash || null
    );
    res.json({ listing: serializeListing(get(`SELECT * FROM listings WHERE id = ?`, l.id), { full: true }) });
  })
);

router.put("/:id/blocked", requireAuth, (req, res) => {
  const l = ownListing(req);
  const body = parse(z.object({ days: z.array(z.number().int()).max(400), blocked: z.boolean() }), req.body);
  for (const d of body.days) {
    if (body.blocked) run(`INSERT OR IGNORE INTO blocked_days (listing_id, day) VALUES (?, ?)`, l.id, d);
    else run(`DELETE FROM blocked_days WHERE listing_id = ? AND day = ?`, l.id, d);
  }
  res.json({ blocked: all(`SELECT day FROM blocked_days WHERE listing_id = ? ORDER BY day`, l.id).map((r) => r.day) });
});

export default router;
