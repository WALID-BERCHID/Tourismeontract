import { test, before, after } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.DATABASE_FILE = ":memory:";
process.env.INDEXER = "0";

const { Wallet, JsonRpcProvider, Contract, NonceManager } = await import("ethers");
const { default: request } = await import("supertest");
const { openDb, get } = await import("../src/db.js");
const { createApp } = await import("../src/app.js");
const { seedDemo, syncDeployments } = await import("../src/seed/seed.js");
const { config } = await import("../src/config.js");

openDb(":memory:");
seedDemo();
syncDeployments();
const app = createApp();
const api = request(app);

const auth = (token) => ({ Authorization: `Bearer ${token}` });
let guestToken;

async function walletLogin(wallet, token, status = 200) {
  const nonce = await api.get(`/api/auth/nonce?chain=evm&address=${wallet.address}`).expect(200);
  const signature = await wallet.signMessage(nonce.body.message);
  const req = api.post("/api/auth/wallet");
  if (token) req.set(auth(token));
  return req.send({ chain: "evm", address: wallet.address, nonce: nonce.body.nonce, signature }).expect(status);
}

before(async () => {
  const res = await api.post("/api/auth/login").send({ email: "guest@demo.tourisme.app", password: "tourisme123" }).expect(200);
  guestToken = res.body.token;
});

test("health and meta", async () => {
  await api.get("/api/health").expect(200);
  const meta = await api.get("/api/meta").expect(200);
  assert.ok(meta.body.categories.length > 5);
  assert.ok(meta.body.amenities.find((a) => a.id === "wifi"));
});

test("sign up, duplicate email, login, bad password, profile", async () => {
  const signup = await api.post("/api/auth/signup").send({ email: "New@Example.com", password: "supersecret", firstName: "Nora" }).expect(201);
  assert.equal(signup.body.user.email, "new@example.com");
  await api.post("/api/auth/signup").send({ email: "new@example.com", password: "supersecret", firstName: "X" }).expect(409);
  await api.post("/api/auth/login").send({ email: "new@example.com", password: "wrongpass" }).expect(401);
  const login = await api.post("/api/auth/login").send({ email: "new@example.com", password: "supersecret" }).expect(200);
  const patched = await api.patch("/api/users/me").set(auth(login.body.token)).send({ bio: "Hello!", languages: ["English"] }).expect(200);
  assert.equal(patched.body.user.bio, "Hello!");
  // Welcome email went to the outbox with a verification link.
  const mail = get(`SELECT * FROM email_outbox WHERE to_email = 'new@example.com'`);
  assert.match(mail.html, /verify-email\?token=/);
  const token = mail.html.match(/token=([a-f0-9]+)/)[1];
  const verified = await api.post("/api/auth/verify-email").send({ token }).expect(200);
  assert.equal(verified.body.user.emailVerified, true);
});

test("password reset flow", async () => {
  await api.post("/api/auth/forgot-password").send({ email: "nobody@example.com" }).expect(200);
  await api.post("/api/auth/forgot-password").send({ email: "new@example.com" }).expect(200);
  const mail = get(`SELECT * FROM email_outbox WHERE to_email = 'new@example.com' AND subject LIKE 'Reset%' ORDER BY id DESC`);
  const token = mail.html.match(/token=([a-f0-9]+)/)[1];
  await api.post("/api/auth/reset-password").send({ token, password: "brandnewpass" }).expect(200);
  await api.post("/api/auth/reset-password").send({ token, password: "brandnewpass" }).expect(400);
  await api.post("/api/auth/login").send({ email: "new@example.com", password: "brandnewpass" }).expect(200);
});

test("wallet sign-in creates an account and rejects forged signatures", async () => {
  const w = Wallet.createRandom();
  const res = await walletLogin(w);
  assert.equal(res.body.isNew, true);
  assert.equal(res.body.user.wallets[0].address, w.address);
  const again = await walletLogin(w);
  assert.equal(again.body.user.id, res.body.user.id);

  const other = Wallet.createRandom();
  const nonce = await api.get(`/api/auth/nonce?chain=evm&address=${w.address}`).expect(200);
  const forged = await other.signMessage(nonce.body.message);
  await api.post("/api/auth/wallet").send({ chain: "evm", address: w.address, nonce: nonce.body.nonce, signature: forged }).expect(401);
});

test("search: location, guests, price, amenities, dates, map bounds", async () => {
  const all = await api.get("/api/listings?limit=100").expect(200);
  assert.equal(all.body.total, 18);
  const morocco = await api.get("/api/listings?location=Morocco&limit=100").expect(200);
  assert.ok(morocco.body.results.every((l) => l.country === "Morocco"));
  const big = await api.get("/api/listings?guests=8").expect(200);
  assert.ok(big.body.results.every((l) => l.guests >= 8));
  const cheap = await api.get("/api/listings?maxPrice=100").expect(200);
  assert.ok(cheap.body.results.every((l) => l.priceUsd <= 100));
  const pools = await api.get("/api/listings?amenities=pool,wifi").expect(200);
  assert.ok(pools.body.total > 0);
  const bounds = await api.get("/api/listings?bounds=29,-11,36,-1").expect(200);
  assert.ok(bounds.body.results.every((l) => l.country === "Morocco"));
  const dated = await api.get("/api/listings?checkIn=2030-01-10&checkOut=2030-01-15").expect(200);
  assert.equal(dated.body.nights, 5);
  assert.ok(dated.body.results.every((l) => l.totalUsd > 0));
  const sugg = await api.get("/api/listings/suggestions?q=Mar").expect(200);
  assert.equal(sugg.body[0].city, "Marrakech");
});

test("listing detail, quote and reviews", async () => {
  const d = await api.get("/api/listings/1").expect(200);
  assert.ok(d.body.host.firstName);
  assert.equal(d.body.listing.address, null, "address hidden from the public");
  const q = await api.get("/api/listings/1/quote?checkIn=2030-02-01&checkOut=2030-02-04").expect(200);
  assert.equal(q.body.available, true);
  assert.equal(q.body.quote.subtotal, 285 * 3 + 45);
  const short = await api.get("/api/listings/1/quote?checkIn=2030-02-01&checkOut=2030-02-02").expect(200);
  assert.equal(short.body.available, false);
});

test("host creates, edits, blocks dates and unlists a listing", async () => {
  const body = {
    title: "Cozy test apartment in Rabat",
    propertyType: "Apartment",
    roomType: "entire",
    category: "city",
    description: "A lovely bright apartment near the Kasbah of the Udayas and the beach.",
    city: "Rabat",
    country: "Morocco",
    lat: 34.02,
    lng: -6.83,
    guests: 2,
    bedrooms: 1,
    beds: 1,
    baths: 1,
    photos: ["https://example.com/a.jpg"],
    priceUsd: 60,
    cancellationPolicy: "flexible",
    minNights: 1,
    maxNights: 30,
    status: "published",
  };
  await api.post("/api/listings").send(body).expect(401);
  await api.post("/api/listings").set(auth(guestToken)).send({ ...body, title: "short" }).expect(400);
  const created = await api.post("/api/listings").set(auth(guestToken)).send(body).expect(201);
  const id = created.body.listing.id;
  await api.patch(`/api/listings/${id}`).set(auth(guestToken)).send({ priceUsd: 75 }).expect(200);
  const blocked = await api.put(`/api/listings/${id}/blocked`).set(auth(guestToken)).send({ days: [30000, 30001], blocked: true }).expect(200);
  assert.deepEqual(blocked.body.blocked, [30000, 30001]);
  const mine = await api.get("/api/hosting/listings").set(auth(guestToken)).expect(200);
  assert.ok(mine.body.listings.find((l) => l.id === id && l.priceUsd === 75));
  const hostLogin = await api.post("/api/auth/login").send({ email: "youssef@demo.tourisme.app", password: "tourisme123" }).expect(200);
  await api.patch(`/api/listings/${id}`).set(auth(hostLogin.body.token)).send({ priceUsd: 1 }).expect(403);
  await api.delete(`/api/listings/${id}`).set(auth(guestToken)).expect(200);
});

test("messaging, wishlists and notifications", async () => {
  const conv = await api.post("/api/conversations").set(auth(guestToken)).send({ listingId: 2, body: "Hi! Is the camp open in August?" }).expect(201);
  const host = await api.post("/api/auth/login").send({ email: "amina@demo.tourisme.app", password: "tourisme123" }).expect(200);
  const me = await api.get("/api/auth/me").set(auth(host.body.token)).expect(200);
  assert.ok(me.body.unreadMessages >= 1);
  const thread = await api.get(`/api/conversations/${conv.body.conversationId}`).set(auth(host.body.token)).expect(200);
  assert.equal(thread.body.messages[0].body, "Hi! Is the camp open in August?");
  await api.post(`/api/conversations/${conv.body.conversationId}/messages`).set(auth(host.body.token)).send({ body: "Yes, all year!" }).expect(201);
  const email = get(`SELECT * FROM email_outbox WHERE subject LIKE 'New message from%' ORDER BY id DESC`);
  assert.ok(email);

  await api.put("/api/wishlists/3").set(auth(guestToken)).expect(200);
  const wl = await api.get("/api/wishlists").set(auth(guestToken)).expect(200);
  assert.equal(wl.body.listings[0].id, 3);
  await api.delete("/api/wishlists/3").set(auth(guestToken)).expect(200);

  const notes = await api.get("/api/notifications").set(auth(host.body.token)).expect(200);
  assert.ok(notes.body.notifications.some((n) => n.type === "message"));
});

// ---------------------------------------------------------------------------
// End-to-end escrow booking against a local Hardhat node (skipped if not running)
// ---------------------------------------------------------------------------

const dep = config.deployments?.evm?.[31337];
let chainUp = false;
if (dep) {
  try {
    const p = new JsonRpcProvider("http://127.0.0.1:8545");
    chainUp = (await p.getCode(dep.escrow)) !== "0x";
  } catch {
    chainUp = false;
  }
}

test("on-chain booking → confirmation emails → cancel → refund", { skip: !chainUp && "local Hardhat node with deployed escrow not running" }, async () => {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  // Hardhat account #7 (well-known dev key).
  const guestWallet = new Wallet("0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356", provider);
  const signup = await api.post("/api/auth/signup").send({ email: "e2e@example.com", password: "supersecret", firstName: "Eve" }).expect(201);
  const token = signup.body.token;
  await walletLogin(guestWallet, token);

  const listing = (await api.get("/api/listings/riad-yasmine-medina-marrakech").expect(200)).body;
  const pub = listing.listing.chains.find((c) => c.network === "evm:31337");
  assert.ok(pub, "seed listing published on local chain");

  const signer = new NonceManager(guestWallet);
  const escrow = new Contract(dep.escrow, ["function quote(uint256,address,uint32,uint32) view returns (uint256,uint256,uint256)", "function book(uint256,address,uint32,uint32) payable returns (uint256)", "function cancelByGuest(uint256)"], signer);
  const block = await provider.getBlock("latest");
  const today = Math.floor(block.timestamp / 86400);
  const checkIn = today + 40 + Math.floor(Math.random() * 200);
  const checkOut = checkIn + 3;
  const [, , total] = await escrow.quote(pub.chainListingId, "0x0000000000000000000000000000000000000000", checkIn, checkOut);
  const txr = await escrow.book(pub.chainListingId, "0x0000000000000000000000000000000000000000", checkIn, checkOut, { value: total });
  await txr.wait();

  const iso = (d) => new Date(d * 86400000).toISOString().slice(0, 10);
  const payload = { listingId: listing.listing.id, network: "evm:31337", txHash: txr.hash, payerAddress: guestWallet.address, checkIn: iso(checkIn), checkOut: iso(checkOut), guests: 2, message: "Can't wait!" };
  await api.post("/api/bookings").set(auth(token)).send({ ...payload, checkOut: iso(checkOut + 1) }).expect(400);
  const created = await api.post("/api/bookings").set(auth(token)).send(payload).expect(201);
  const b = created.body.booking;
  assert.equal(b.status, "confirmed");
  assert.match(b.amountNative, /ETH/);
  assert.ok(get(`SELECT * FROM email_outbox WHERE to_email = 'e2e@example.com' AND subject LIKE 'Reservation confirmed%'`));
  assert.ok(get(`SELECT * FROM email_outbox WHERE to_email = 'youssef@demo.tourisme.app' AND subject LIKE 'New reservation%'`));

  const cal = await api.get(`/api/listings/${listing.listing.id}/calendar?network=evm:31337`).expect(200);
  assert.ok(cal.body.occupiedDays.includes(checkIn));

  await (await escrow.cancelByGuest(b.chainBookingId)).wait();
  const synced = await api.post(`/api/bookings/${b.id}/sync`).set(auth(token)).send({}).expect(200);
  assert.equal(synced.body.booking.status, "cancelled_by_guest");
  assert.ok(get(`SELECT * FROM email_outbox WHERE to_email = 'e2e@example.com' AND subject LIKE '%cancelled'`));

  const trips = await api.get("/api/bookings/trips").set(auth(token)).expect(200);
  assert.equal(trips.body.bookings[0].bucket, "cancelled");
});

after(() => {});
