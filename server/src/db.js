import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { config } from "./config.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  bio TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  work TEXT NOT NULL DEFAULT '',
  languages TEXT NOT NULL DEFAULT '[]',
  phone TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  is_superhost INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  preferred_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (chain, address)
);

CREATE TABLE IF NOT EXISTS auth_nonces (
  nonce TEXT PRIMARY KEY,
  chain TEXT NOT NULL,
  address TEXT NOT NULL,
  message TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS email_tokens (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  host_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  property_type TEXT NOT NULL,
  room_type TEXT NOT NULL DEFAULT 'entire',
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL,
  neighborhood TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  guests INTEGER NOT NULL,
  bedrooms INTEGER NOT NULL,
  beds INTEGER NOT NULL,
  baths REAL NOT NULL,
  amenities TEXT NOT NULL DEFAULT '[]',
  photos TEXT NOT NULL DEFAULT '[]',
  house_rules TEXT NOT NULL DEFAULT '[]',
  price_usd REAL NOT NULL,
  cleaning_fee_usd REAL NOT NULL DEFAULT 0,
  cancellation_policy TEXT NOT NULL DEFAULT 'flexible',
  min_nights INTEGER NOT NULL DEFAULT 1,
  max_nights INTEGER NOT NULL DEFAULT 30,
  instant_book INTEGER NOT NULL DEFAULT 1,
  check_in_time TEXT NOT NULL DEFAULT '15:00',
  check_out_time TEXT NOT NULL DEFAULT '11:00',
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS listings_host ON listings(host_id);
CREATE INDEX IF NOT EXISTS listings_status ON listings(status);

-- On-chain publications of a listing (one per network).
CREATE TABLE IF NOT EXISTS listing_chains (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_listing_id TEXT NOT NULL,
  contract TEXT NOT NULL,
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (listing_id, network)
);

CREATE TABLE IF NOT EXISTS blocked_days (
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day INTEGER NOT NULL,
  PRIMARY KEY (listing_id, day)
);

CREATE TABLE IF NOT EXISTS bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  guest_id INTEGER NOT NULL REFERENCES users(id),
  host_id INTEGER NOT NULL REFERENCES users(id),
  chain TEXT NOT NULL,
  network TEXT NOT NULL,
  chain_booking_id TEXT,
  tx_hash TEXT,
  payer_address TEXT,
  currency TEXT NOT NULL,
  amount_native TEXT NOT NULL,
  check_in INTEGER NOT NULL,
  check_out INTEGER NOT NULL,
  guests INTEGER NOT NULL DEFAULT 1,
  nights INTEGER NOT NULL,
  subtotal_usd REAL NOT NULL,
  fee_usd REAL NOT NULL,
  total_usd REAL NOT NULL,
  status TEXT NOT NULL,
  host_approved INTEGER NOT NULL DEFAULT 1,
  message TEXT NOT NULL DEFAULT '',
  last_tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS bookings_guest ON bookings(guest_id);
CREATE INDEX IF NOT EXISTS bookings_host ON bookings(host_id);
CREATE INDEX IF NOT EXISTS bookings_listing ON bookings(listing_id);
CREATE UNIQUE INDEX IF NOT EXISTS bookings_chain_id ON bookings(network, chain_booking_id);

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id INTEGER NOT NULL REFERENCES bookings(id),
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL REFERENCES users(id),
  target TEXT NOT NULL,
  rating INTEGER NOT NULL,
  cleanliness INTEGER, accuracy INTEGER, communication INTEGER,
  location INTEGER, checkin INTEGER, value INTEGER,
  comment TEXT NOT NULL,
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (booking_id, target)
);
CREATE INDEX IF NOT EXISTS reviews_listing ON reviews(listing_id);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id),
  guest_id INTEGER NOT NULL REFERENCES users(id),
  host_id INTEGER NOT NULL REFERENCES users(id),
  booking_id INTEGER REFERENCES bookings(id),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (listing_id, guest_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id),
  body TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages(conversation_id);

CREATE TABLE IF NOT EXISTS wishlists (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id, read);

CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

let db;

export function openDb(file = config.dbFile) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  db.exec(SCHEMA);
  return db;
}

export function getDb() {
  if (!db) openDb();
  return db;
}

export const all = (sql, ...params) => getDb().prepare(sql).all(...params);
export const get = (sql, ...params) => getDb().prepare(sql).get(...params);
export const run = (sql, ...params) => getDb().prepare(sql).run(...params);

export function tx(fn) {
  const d = getDb();
  d.exec("BEGIN");
  try {
    const result = fn();
    d.exec("COMMIT");
    return result;
  } catch (err) {
    d.exec("ROLLBACK");
    throw err;
  }
}

export function kvGet(key, fallback = null) {
  const row = get("SELECT value FROM kv WHERE key = ?", key);
  return row ? JSON.parse(row.value) : fallback;
}

export function kvSet(key, value) {
  run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, JSON.stringify(value));
}
