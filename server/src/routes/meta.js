import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import multer from "multer";
import { config } from "../config.js";
import { all, get } from "../db.js";
import { requireAdmin, requireAuth } from "../auth.js";
import { supportedNetworks } from "../chains/index.js";
import { serializeBooking } from "../services/bookings.js";
import { HttpError, asyncHandler, serializeListing, todayDay } from "../util.js";

export const CATEGORIES = [
  { id: "riads", label: "Riads", icon: "riad" },
  { id: "beachfront", label: "Beachfront", icon: "beach" },
  { id: "iconic", label: "Iconic cities", icon: "landmark" },
  { id: "desert", label: "Desert", icon: "desert" },
  { id: "mountains", label: "Mountains", icon: "mountain" },
  { id: "amazing_pools", label: "Amazing pools", icon: "pool" },
  { id: "surfing", label: "Surfing", icon: "surf" },
  { id: "tropical", label: "Tropical", icon: "palm" },
  { id: "countryside", label: "Countryside", icon: "barn" },
  { id: "city", label: "City", icon: "city" },
  { id: "cabins", label: "Cabins", icon: "cabin" },
  { id: "camping", label: "Camping", icon: "tent" },
];

export const AMENITIES = [
  { id: "wifi", label: "Wifi", group: "Essentials" },
  { id: "kitchen", label: "Kitchen", group: "Essentials" },
  { id: "washer", label: "Washer", group: "Essentials" },
  { id: "ac", label: "Air conditioning", group: "Essentials" },
  { id: "heating", label: "Heating", group: "Essentials" },
  { id: "workspace", label: "Dedicated workspace", group: "Essentials" },
  { id: "tv", label: "TV", group: "Essentials" },
  { id: "essentials", label: "Towels, bed sheets, soap", group: "Essentials" },
  { id: "pool", label: "Pool", group: "Features" },
  { id: "hot_tub", label: "Hot tub", group: "Features" },
  { id: "sauna", label: "Sauna", group: "Features" },
  { id: "hammam", label: "Hammam", group: "Features" },
  { id: "free_parking", label: "Free parking", group: "Features" },
  { id: "gym", label: "Gym", group: "Features" },
  { id: "bbq", label: "BBQ grill", group: "Features" },
  { id: "fireplace", label: "Indoor fireplace", group: "Features" },
  { id: "rooftop", label: "Rooftop terrace", group: "Features" },
  { id: "garden", label: "Garden", group: "Features" },
  { id: "elevator", label: "Elevator", group: "Features" },
  { id: "crib", label: "Crib", group: "Features" },
  { id: "sea_view", label: "Sea view", group: "Location" },
  { id: "mountain_view", label: "Mountain view", group: "Location" },
  { id: "city_view", label: "City skyline view", group: "Location" },
  { id: "beach_access", label: "Beach access", group: "Location" },
  { id: "ski_in", label: "Ski-in/ski-out", group: "Location" },
  { id: "breakfast", label: "Breakfast included", group: "Services" },
  { id: "dinner", label: "Dinner included", group: "Services" },
  { id: "airport_shuttle", label: "Airport shuttle", group: "Services" },
  { id: "camel_trek", label: "Camel trek", group: "Services" },
  { id: "surfboards", label: "Surfboards", group: "Services" },
  { id: "bikes", label: "Bikes", group: "Services" },
];

export const meta = Router();

meta.get("/meta", (_req, res) => {
  res.json({
    platformName: config.platformName,
    categories: CATEGORIES,
    amenities: AMENITIES,
    propertyTypes: ["House", "Apartment", "Riad", "Villa", "Cabin", "Chalet", "Loft", "Townhouse", "Farmhouse", "Bungalow", "Cave house", "Tent", "Guesthouse", "Boutique hotel"],
    fees: { guestFeeBps: config.guestFeeBps, hostFeeBps: config.hostFeeBps },
    networks: supportedNetworks(),
    emailEnabled: !!config.mail.host,
  });
});

// Crypto → USD rates with a 60s cache and offline fallback.
let ratesCache = { at: 0, rates: { ETH: 3000, POL: 0.5, SOL: 150, EOS: 0.6, USDC: 1, EUR: 0.92, MAD: 9.9, GBP: 0.79 }, live: false };
meta.get(
  "/rates",
  asyncHandler(async (_req, res) => {
    if (Date.now() - ratesCache.at > 60_000) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,polygon-ecosystem-token,solana,eos,usd-coin&vs_currencies=usd", { signal: ctrl.signal });
        clearTimeout(t);
        const j = await r.json();
        ratesCache = {
          at: Date.now(),
          live: true,
          rates: {
            ...ratesCache.rates,
            ETH: j.ethereum?.usd ?? ratesCache.rates.ETH,
            POL: j["polygon-ecosystem-token"]?.usd ?? ratesCache.rates.POL,
            SOL: j.solana?.usd ?? ratesCache.rates.SOL,
            EOS: j.eos?.usd ?? ratesCache.rates.EOS,
            USDC: j["usd-coin"]?.usd ?? 1,
          },
        };
      } catch {
        ratesCache.at = Date.now();
      }
    }
    res.json({ usd: ratesCache.rates, live: ratesCache.live, updatedAt: new Date(ratesCache.at).toISOString() });
  })
);

// ---------------------------------------------------------------------------
// Photo uploads
// ---------------------------------------------------------------------------

fs.mkdirSync(config.uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${path.extname(file.originalname).toLowerCase() || ".jpg"}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});

meta.post("/uploads", requireAuth, upload.array("photos", 20), (req, res) => {
  if (!req.files?.length) throw new HttpError(400, "Upload JPG, PNG or WebP images up to 10 MB");
  res.status(201).json({ urls: req.files.map((f) => `${config.apiUrl}/uploads/${f.filename}`) });
});

// ---------------------------------------------------------------------------
// Hosting dashboard
// ---------------------------------------------------------------------------

meta.get("/hosting/listings", requireAuth, (req, res) => {
  const rows = all(`SELECT * FROM listings WHERE host_id = ? ORDER BY updated_at DESC`, req.user.id);
  res.json({ listings: rows.map((l) => ({ ...serializeListing(l, { full: true }), address: l.address })) });
});

meta.get("/hosting/stats", requireAuth, (req, res) => {
  const today = todayDay();
  const uid = req.user.id;
  const one = (sql, ...p) => get(sql, ...p);
  const earned = one(`SELECT COALESCE(SUM(subtotal_usd * 0.97), 0) AS v FROM bookings WHERE host_id = ? AND status IN ('completed','resolved')`, uid).v;
  const pending = one(`SELECT COALESCE(SUM(subtotal_usd * 0.97), 0) AS v FROM bookings WHERE host_id = ? AND status IN ('confirmed','pending_host','disputed')`, uid).v;
  const monthly = all(
    `SELECT strftime('%Y-%m', check_in * 86400, 'unixepoch') AS month, SUM(subtotal_usd * 0.97) AS earnings, COUNT(*) AS stays
     FROM bookings WHERE host_id = ? AND status IN ('confirmed','completed','resolved') AND check_in >= ? GROUP BY month ORDER BY month`,
    uid,
    today - 365
  );
  const nightsBooked = one(
    `SELECT COALESCE(SUM(MIN(check_out, ?) - MAX(check_in, ?)), 0) AS v FROM bookings WHERE host_id = ? AND status IN ('confirmed','completed','resolved') AND check_out > ? AND check_in < ?`,
    today + 30,
    today,
    uid,
    today,
    today + 30
  ).v;
  const listingCount = one(`SELECT COUNT(*) AS c FROM listings WHERE host_id = ? AND status = 'published'`, uid).c;
  const rating = one(`SELECT AVG(r.rating) AS v, COUNT(*) AS c FROM reviews r JOIN listings l ON l.id = r.listing_id WHERE l.host_id = ? AND r.target = 'listing'`, uid);
  const payouts = all(
    `SELECT * FROM bookings WHERE host_id = ? AND status IN ('completed','resolved','confirmed','disputed') ORDER BY check_in DESC LIMIT 50`,
    uid
  ).map((b) => serializeBooking(b, uid));
  res.json({
    earnedUsd: Math.round(earned * 100) / 100,
    pendingUsd: Math.round(pending * 100) / 100,
    occupancy30d: listingCount ? Math.min(1, nightsBooked / (listingCount * 30)) : 0,
    rating: rating.v ? Math.round(rating.v * 100) / 100 : null,
    reviewCount: rating.c,
    listingCount,
    monthly,
    payouts,
  });
});

// ---------------------------------------------------------------------------
// Admin / arbiter
// ---------------------------------------------------------------------------

meta.get("/admin/overview", requireAdmin, (req, res) => {
  const count = (sql) => get(sql).c;
  res.json({
    users: count(`SELECT COUNT(*) AS c FROM users`),
    listings: count(`SELECT COUNT(*) AS c FROM listings WHERE status = 'published'`),
    bookings: count(`SELECT COUNT(*) AS c FROM bookings`),
    gmvUsd: get(`SELECT COALESCE(SUM(total_usd), 0) AS c FROM bookings WHERE status IN ('confirmed','completed','resolved')`).c,
    disputes: all(`SELECT * FROM bookings WHERE status = 'disputed' ORDER BY updated_at DESC`).map((b) => serializeBooking(b, req.user.id)),
    recent: all(`SELECT * FROM bookings ORDER BY id DESC LIMIT 20`).map((b) => serializeBooking(b, req.user.id)),
  });
});

// ---------------------------------------------------------------------------
// Dev tools: email outbox (disabled in production)
// ---------------------------------------------------------------------------

meta.get("/dev/emails", (req, res) => {
  if (config.isProd) throw new HttpError(404, "Not found");
  res.json({ emails: all(`SELECT id, to_email AS "to", subject, status, error, created_at AS createdAt FROM email_outbox ORDER BY id DESC LIMIT 100`) });
});

meta.get("/dev/emails/:id", (req, res) => {
  if (config.isProd) throw new HttpError(404, "Not found");
  const row = get(`SELECT html FROM email_outbox WHERE id = ?`, Number(req.params.id));
  if (!row) throw new HttpError(404, "Not found");
  res.type("html").send(row.html);
});
