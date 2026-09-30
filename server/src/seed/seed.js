import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { config } from "../config.js";
import { all, get, getDb, kvGet, kvSet, openDb, run, tx } from "../db.js";
import { bookingCode, todayDay } from "../util.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTINGS = JSON.parse(fs.readFileSync(path.join(__dirname, "listings.json"), "utf8"));

// Hardhat's well-known development accounts (never use these keys on a real network).
const HARDHAT = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
];

const HOSTS = [
  { first: "Youssef", last: "Benali", email: "youssef@demo.tourisme.app", location: "Marrakech, Morocco", work: "Riad owner & mountain guide", languages: ["Arabic", "French", "English"], bio: "Born in the Medina, I restored my grandparents' riad with local artisans. I love sharing Moroccan hospitality – mint tea is always ready.", avatar: "https://i.pravatar.cc/300?img=12", superhost: 1 },
  { first: "Amina", last: "El Idrissi", email: "amina@demo.tourisme.app", location: "Merzouga, Morocco", work: "Desert camp founder", languages: ["Arabic", "Tamazight", "English", "Spanish"], bio: "Sahara lover and eco-tourism entrepreneur. Our camps run on solar power and employ families from the local Berber community.", avatar: "https://i.pravatar.cc/300?img=47", superhost: 1 },
  { first: "Karim", last: "Haddad", email: "karim@demo.tourisme.app", location: "Chefchaouen, Morocco", work: "Photographer", languages: ["Arabic", "French", "English"], bio: "Photographer and traveler. I host in the places I love most and always share my list of hidden spots.", avatar: "https://i.pravatar.cc/300?img=15", superhost: 0 },
  { first: "Sofia", last: "Martins", email: "sofia@demo.tourisme.app", location: "Lisbon, Portugal", work: "Architect", languages: ["Portuguese", "English", "French"], bio: "Architect with a passion for restoring historic apartments. Design details matter to me – and so does a great coffee recommendation.", avatar: "https://i.pravatar.cc/300?img=32", superhost: 1 },
];

const REVIEWERS = [
  ["Emma", "London, UK", 5],
  ["Lucas", "Lyon, France", 9],
  ["Hiro", "Osaka, Japan", 60],
  ["Chloé", "Montréal, Canada", 45],
  ["Omar", "Casablanca, Morocco", 53],
  ["Mia", "Berlin, Germany", 25],
  ["Daniel", "Austin, USA", 68],
  ["Layla", "Dubai, UAE", 44],
];

const COMMENTS = [
  "Absolutely magical stay. The photos don't do it justice – the host thought of every detail and was super responsive. We'll be back!",
  "Beautiful place, spotless and exactly as described. Check-in was seamless and paying through the escrow felt really safe.",
  "One of the best stays we've had anywhere. Amazing breakfast, incredible views, and a host who genuinely cares.",
  "Great location, very comfortable beds and a really well-equipped kitchen. Highly recommend for couples.",
  "The host gave us fantastic tips for local restaurants and activities. The space was calm, clean and gorgeous.",
  "Perfect for our family trip. Kids loved it, parents loved it even more. Communication was quick and friendly.",
  "Lovely stay overall – a little noise in the morning but nothing that took away from the experience. Would book again.",
  "Stunning architecture and a peaceful atmosphere. Felt like a home away from home.",
];

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export function seedDemo({ reset = false } = {}) {
  if (reset) {
    getDb().exec(`DELETE FROM messages; DELETE FROM conversations; DELETE FROM reviews; DELETE FROM wishlists; DELETE FROM notifications;
      DELETE FROM bookings; DELETE FROM blocked_days; DELETE FROM listing_chains; DELETE FROM listings; DELETE FROM wallets;
      DELETE FROM email_tokens; DELETE FROM users; DELETE FROM kv; DELETE FROM email_outbox;`);
  }
  if (get(`SELECT COUNT(*) AS c FROM listings`).c > 0) return false;

  const hash = bcrypt.hashSync("tourisme123", 10);
  tx(() => {
    const userId = (u) =>
      run(
        `INSERT INTO users (email, password_hash, first_name, last_name, avatar_url, bio, location, work, languages, email_verified, is_superhost, is_admin, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        u.email,
        hash,
        u.first,
        u.last || "",
        u.avatar || null,
        u.bio || "",
        u.location || "",
        u.work || "",
        JSON.stringify(u.languages || ["English"]),
        u.superhost || 0,
        u.admin || 0,
        u.createdAt || "2021-03-14 10:00:00"
      ).lastInsertRowid;

    const adminId = userId({ first: "Admin", last: "Tourisme", email: "admin@demo.tourisme.app", admin: 1, location: "Casablanca, Morocco" });
    run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, 'evm', ?)`, adminId, HARDHAT[0]);
    const hostIds = HOSTS.map((h, i) => {
      const id = userId(h);
      run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, 'evm', ?)`, id, HARDHAT[i + 1]);
      return id;
    });
    const guestId = userId({ first: "Sara", last: "Traveler", email: "guest@demo.tourisme.app", avatar: "https://i.pravatar.cc/300?img=5", location: "Rabat, Morocco", bio: "Always planning the next trip.", languages: ["Arabic", "French", "English"], createdAt: "2023-06-01 09:00:00" });
    run(`INSERT INTO wallets (user_id, chain, address) VALUES (?, 'evm', ?)`, guestId, HARDHAT[5]);
    const reviewerIds = REVIEWERS.map(([first, location, img], i) =>
      userId({ first, email: `reviewer${i}@demo.tourisme.app`, location, avatar: `https://i.pravatar.cc/300?img=${img}`, createdAt: `202${i % 4}-0${(i % 8) + 1}-10 12:00:00` })
    );

    const rand = rng(42);
    const today = todayDay();
    LISTINGS.forEach((l, idx) => {
      const listingId = run(
        `INSERT INTO listings (slug, host_id, title, property_type, room_type, category, description, city, region, country, neighborhood, address,
          lat, lng, guests, bedrooms, beds, baths, amenities, photos, house_rules, price_usd, cleaning_fee_usd, cancellation_policy,
          min_nights, max_nights, instant_book, check_in_time, check_out_time, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', datetime('now', ?))`,
        l.slug,
        hostIds[l.hostIndex],
        l.title,
        l.propertyType,
        l.roomType,
        l.category,
        l.description,
        l.city,
        l.region,
        l.country,
        l.neighborhood,
        `${l.neighborhood.split(",")[0]}, ${l.city}, ${l.country}`,
        l.lat,
        l.lng,
        l.guests,
        l.bedrooms,
        l.beds,
        l.baths,
        JSON.stringify(l.amenities),
        JSON.stringify(l.photos),
        JSON.stringify(l.houseRules),
        l.priceUsd,
        l.cleaningFeeUsd,
        l.cancellationPolicy,
        l.minNights,
        l.maxNights,
        l.instantBook ? 1 : 0,
        l.checkInTime,
        l.checkOutTime,
        `-${LISTINGS.length - idx} days`
      ).lastInsertRowid;

      // Past stays with reviews (historical, off-chain records).
      const n = idx % 5 === 4 ? 0 : 2 + Math.floor(rand() * 5);
      for (let i = 0; i < n; i++) {
        const reviewer = reviewerIds[(idx + i) % reviewerIds.length];
        const nights = Math.max(l.minNights, 2 + Math.floor(rand() * 4));
        const checkIn = today - 30 - Math.floor(rand() * 300);
        const subtotal = l.priceUsd * nights + l.cleaningFeeUsd;
        const bookingId = run(
          `INSERT INTO bookings (code, listing_id, guest_id, host_id, chain, network, currency, amount_native, check_in, check_out, guests, nights,
             subtotal_usd, fee_usd, total_usd, status, created_at)
           VALUES (?, ?, ?, ?, 'evm', 'evm:31337', 'USDC', ?, ?, ?, 2, ?, ?, ?, ?, 'completed', datetime(? * 86400 - 30 * 86400, 'unixepoch'))`,
          bookingCode(),
          listingId,
          reviewer,
          hostIds[l.hostIndex],
          `${(subtotal * 1.08).toFixed(2)} USDC`,
          checkIn,
          checkIn + nights,
          nights,
          subtotal,
          subtotal * 0.08,
          subtotal * 1.08,
          checkIn
        ).lastInsertRowid;
        const rating = rand() < 0.8 ? 5 : 4;
        const sub = () => (rand() < 0.85 ? 5 : 4);
        run(
          `INSERT INTO reviews (booking_id, listing_id, author_id, subject_id, target, rating, cleanliness, accuracy, communication, location, checkin, value, comment, created_at)
           VALUES (?, ?, ?, ?, 'listing', ?, ?, ?, ?, ?, ?, ?, ?, datetime(? * 86400, 'unixepoch'))`,
          bookingId,
          listingId,
          reviewer,
          hostIds[l.hostIndex],
          rating,
          sub(),
          sub(),
          sub(),
          sub(),
          sub(),
          sub(),
          COMMENTS[Math.floor(rand() * COMMENTS.length)],
          checkIn + nights + 2
        );
      }
    });
  });
  console.log(`[seed] demo data created (${LISTINGS.length} listings). Demo logins use password "tourisme123".`);
  return true;
}

/**
 * Links seed listings to their on-chain ids from deployments.json. When the local Hardhat chain
 * was redeployed, bookings from the previous deployment are dropped since they no longer exist.
 */
export function syncDeployments() {
  const evm = config.deployments?.evm || {};
  for (const [chainId, dep] of Object.entries(evm)) {
    const network = `evm:${chainId}`;
    const key = `deployment:${chainId}`;
    // A restarted local chain redeploys to the same address, so include the deploy time.
    const fingerprint = `${dep.escrow.toLowerCase()}:${dep.deployedAt || ""}`;
    const prev = kvGet(key);
    if (prev && prev !== fingerprint) {
      console.log(`[seed] escrow on ${network} changed – clearing stale on-chain records`);
      const stale = all(`SELECT id FROM bookings WHERE network = ? AND chain_booking_id IS NOT NULL`, network).map((r) => r.id);
      for (const id of stale) {
        run(`DELETE FROM reviews WHERE booking_id = ?`, id);
        run(`UPDATE conversations SET booking_id = NULL WHERE booking_id = ?`, id);
        run(`DELETE FROM bookings WHERE id = ?`, id);
      }
      run(`DELETE FROM listing_chains WHERE network = ?`, network);
      run(`DELETE FROM kv WHERE key LIKE ?`, `indexer:${chainId}:%`);
    }
    kvSet(key, fingerprint);
    for (const [slug, chainListingId] of Object.entries(dep.seedListings || {})) {
      const l = get(`SELECT id FROM listings WHERE slug = ?`, slug);
      if (!l) continue;
      run(
        `INSERT INTO listing_chains (listing_id, chain, network, chain_listing_id, contract) VALUES (?, 'evm', ?, ?, ?)
         ON CONFLICT(listing_id, network) DO UPDATE SET chain_listing_id = excluded.chain_listing_id, contract = excluded.contract`,
        l.id,
        network,
        String(chainListingId),
        dep.escrow
      );
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  openDb();
  seedDemo({ reset: process.argv.includes("--reset") });
  syncDeployments();
}
