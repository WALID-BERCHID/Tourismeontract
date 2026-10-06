/**
 * Walks through the whole product as a buyer (guest), a seller (host) and the arbiter, executing real
 * escrow transactions on the local Hardhat chain, and saves screenshots to docs/screenshots/.
 *
 *   npm run dev            # in another terminal (chain + API + web)
 *   npm run screenshots
 *
 * A mock EIP-1193 wallet is injected into the page: it signs with the Hardhat test key of the demo
 * account being used, so no browser extension is needed. Every transaction hash and amount is written
 * to docs/screenshots/run.json – the numbers in docs/HOW_TO_USE.md come from there.
 *
 * Env: BASE_URL (default http://localhost:5173), RPC_URL (default http://127.0.0.1:8545),
 *      STUB_IMAGES=1 to replace remote photos/map tiles with generated artwork (offline sandboxes).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { JsonRpcProvider, NonceManager, Wallet, getBytes, formatEther, formatUnits } from "ethers";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs/screenshots");
const BASE = process.env.BASE_URL || "http://localhost:5173";
const API = process.env.API_URL || "http://localhost:4000";
const RPC = process.env.RPC_URL || "http://127.0.0.1:8545";
const STUB = process.env.STUB_IMAGES === "1";

// Hardhat's well-known development keys (never use on a real network).
const KEYS = {
  admin: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // #0 – arbiter / admin@demo
  youssef: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // #1 – host youssef@demo
  guest: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // #5 – guest@demo (Sara)
};
const ACCOUNTS = {
  admin: "admin@demo.tourisme.app",
  youssef: "youssef@demo.tourisme.app",
  guest: "guest@demo.tourisme.app",
};
const PASSWORD = "tourisme123";

const provider = new JsonRpcProvider(RPC, 31337, { staticNetwork: true });
const run = { startedAt: new Date().toISOString(), network: "Hardhat local (chainId 31337)", accounts: {}, steps: [] };
const log = (step, data = {}) => {
  console.log(`▸ ${step}`, Object.keys(data).length ? JSON.stringify(data) : "");
  run.steps.push({ step, ...data });
};

// ---------------------------------------------------------------------------
// Generated artwork for offline sandboxes (photos, avatars, map tiles)
// ---------------------------------------------------------------------------

const seedFiles = ["server/src/seed/listings.json", "server/src/seed/experiences.json"].map((f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8")));
const photoScene = new Map();
for (const l of seedFiles.flat()) {
  const scene = { riads: "riad", desert: "dunes", mountains: "mountains", adventure: "mountains", beachfront: "beach", surfing: "beach", water: "beach", tropical: "forest", nature: "forest", countryside: "forest", city: "city", iconic: "city", nightlife: "city", amazing_pools: "pool", wellness: "pool", cabins: "forest", camping: "dunes", food: "riad", culture: "riad", photography: "city", crafts: "riad" }[l.category] || "mountains";
  l.photos.forEach((p, i) => photoScene.set(p.split("?")[0], { scene, variant: i, title: l.title }));
}
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const PALETTES = [
  ["#1b1040", "#5b2a86", "#f06292", "#ffb74d"],
  ["#0b1a3a", "#1e3a8a", "#38bdf8", "#3df5a8"],
  ["#2a0b2e", "#7c1d6f", "#f23b9e", "#ffd166"],
  ["#0f172a", "#334155", "#8b5cf6", "#f472b6"],
  ["#1a0b2e", "#4c1d95", "#a78bfa", "#fde68a"],
  ["#082032", "#2c394b", "#2dd4bf", "#f8fafc"],
];
function sceneSvg(url) {
  const key = url.split("?")[0];
  const info = photoScene.get(key) || { scene: ["dunes", "mountains", "city", "beach", "riad", "pool", "forest"][hash(key) % 7], variant: hash(key) % 3 };
  const h = hash(key + info.variant);
  const [c0, c1, c2, c3] = PALETTES[(h + info.variant) % PALETTES.length];
  const W = 1200, H = 900;
  const rnd = (n, s = 0) => ((h >>> (s % 24)) % 1000) / 1000 * n;
  const stars = Array.from({ length: 70 }, (_, i) => `<circle cx="${(hash(key + i) % W)}" cy="${(hash(key + i * 7) % (H / 2))}" r="${1 + (i % 3) * 0.6}" fill="#fff" opacity="${0.3 + (i % 5) * 0.12}"/>`).join("");
  const sun = `<circle cx="${300 + rnd(600, 3)}" cy="${220 + rnd(120, 5)}" r="${70 + rnd(60, 7)}" fill="${c3}" opacity=".95"/><circle cx="${300 + rnd(600, 3)}" cy="${220 + rnd(120, 5)}" r="${140 + rnd(60, 7)}" fill="${c3}" opacity=".15"/>`;
  let layers = "";
  const dark = (c, a) => `<g opacity="${a}">${c}</g>`;
  switch (info.scene) {
    case "dunes":
      layers = [0.9, 0.7, 0.5].map((o, i) => `<path d="M0 ${560 + i * 90} C ${200 + i * 60} ${480 + i * 80}, ${500 + i * 40} ${640 + i * 40}, ${760} ${540 + i * 90} S ${1100} ${620 + i * 70}, ${W} ${560 + i * 90} V${H} H0Z" fill="${[c2, c1, c0][i]}" opacity="${o}"/>`).join("");
      layers += `<path d="M560 690 l24 -46 l10 20 l18 -8 l14 34z" fill="${c0}"/><circle cx="586" cy="640" r="5" fill="${c0}"/>`;
      break;
    case "mountains":
      layers = [[c2, 0.85, 420], [c1, 0.9, 520], [c0, 1, 640]].map(([c, o, y], i) => `<path d="M0 ${y + 160} L ${150 + i * 80} ${y} L ${320 + i * 60} ${y + 110} L ${520 - i * 40} ${y - 60} L ${720 + i * 30} ${y + 90} L ${900} ${y - 20 + i * 40} L ${1080 + i * 50} ${y + 100} L ${W} ${y + 40} V${H} H0Z" fill="${c}" opacity="${o}"/>`).join("");
      layers += `<path d="M470 ${600 - 60 + 40} l50 -40 l50 40z" fill="#fff" opacity=".7"/>`;
      break;
    case "city":
      layers = Array.from({ length: 22 }, (_, i) => {
        const bw = 40 + (hash(key + "b" + i) % 50), bh = 160 + (hash(key + "h" + i) % 320), x = i * 56 - 20;
        const win = Array.from({ length: Math.floor(bh / 34) }, (_, r) => Array.from({ length: Math.floor(bw / 16) }, (_, c) => (hash(key + i + r + c) % 3 ? `<rect x="${x + 6 + c * 16}" y="${H - bh + 12 + r * 34}" width="7" height="12" fill="${c3}" opacity=".8"/>` : "")).join("")).join("");
        return `<rect x="${x}" y="${H - bh}" width="${bw}" height="${bh}" fill="${i % 2 ? c0 : c1}"/>${win}`;
      }).join("");
      break;
    case "beach":
      layers = `<rect x="0" y="560" width="${W}" height="${H}" fill="${c1}" opacity=".9"/>${[0, 1, 2, 3].map((i) => `<path d="M0 ${600 + i * 40} q 150 -18 300 0 t 300 0 t 300 0 t 300 0" stroke="#fff" stroke-opacity=".25" fill="none" stroke-width="3"/>`).join("")}<path d="M0 760 C 300 720, 700 780, ${W} 740 V${H} H0Z" fill="${c3}" opacity=".9"/><path d="M180 760 C 190 600, 230 520, 260 470" stroke="${c0}" stroke-width="14" fill="none" stroke-linecap="round"/>${[-70, -40, -10, 20, 50].map((a) => `<path d="M260 470 q ${80 * Math.cos((a * Math.PI) / 180)} ${-60 + 80 * Math.sin((a * Math.PI) / 180)} ${170 * Math.cos((a * Math.PI) / 180)} ${-20 + 150 * Math.sin((a * Math.PI) / 180)}" stroke="${c0}" stroke-width="12" fill="none" stroke-linecap="round"/>`).join("")}`;
      break;
    case "riad":
      layers = `<rect x="0" y="420" width="${W}" height="${H}" fill="${c0}"/>${[0, 1, 2, 3].map((i) => `<path d="M${120 + i * 270} 820 V 560 a 100 100 0 0 1 200 0 V 820 Z" fill="${c1}"/><path d="M${140 + i * 270} 820 V 570 a 80 80 0 0 1 160 0 V 820 Z" fill="${c2}" opacity=".9"/>`).join("")}<rect x="0" y="820" width="${W}" height="80" fill="${c1}"/>${Array.from({ length: 24 }, (_, i) => `<rect x="${i * 50}" y="${830 + (i % 2) * 20}" width="40" height="18" fill="${c3}" opacity=".35"/>`).join("")}<circle cx="600" cy="300" r="26" fill="${c3}"/><path d="M600 326 v 90" stroke="${c3}" stroke-width="3"/>`;
      break;
    case "pool":
      layers = `<rect x="0" y="520" width="${W}" height="${H}" fill="${c0}"/><rect x="140" y="600" width="920" height="260" rx="28" fill="${c2}" opacity=".9"/>${[0, 1, 2, 3, 4].map((i) => `<path d="M170 ${640 + i * 45} q 100 -14 200 0 t 200 0 t 200 0 t 200 0" stroke="#fff" stroke-opacity=".35" fill="none" stroke-width="3"/>`).join("")}${[0, 1, 2].map((i) => `<rect x="${200 + i * 150}" y="545" width="110" height="34" rx="8" fill="${c3}" opacity=".8"/>`).join("")}`;
      break;
    default:
      layers = `<rect x="0" y="640" width="${W}" height="${H}" fill="${c0}"/>${Array.from({ length: 18 }, (_, i) => { const x = i * 70 + (hash(key + i) % 30), s = 120 + (hash(key + "t" + i) % 160); return `<path d="M${x} ${700} l ${s / 3} ${-s} l ${s / 3} ${s} z" fill="${i % 2 ? c1 : c2}" opacity=".9"/>`; }).join("")}`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c0}"/><stop offset=".55" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="${W}" height="${H}" fill="url(#sky)"/>${stars}${sun}${dark(layers, 1)}</svg>`;
}
function avatarSvg(url) {
  const n = Number(new URL(url).searchParams.get("img") || hash(url) % 70);
  const [c0, , c2] = PALETTES[n % PALETTES.length];
  const letter = "SYAKMELHOCDJ"[n % 12];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c0}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="118" r="62" fill="#fff" opacity=".9"/><path d="M50 300 c 10 -90 70 -120 100 -120 s 90 30 100 120z" fill="#fff" opacity=".9"/><text x="150" y="140" text-anchor="middle" font-family="Inter,sans-serif" font-size="64" font-weight="800" fill="${c0}">${letter}</text></svg>`;
}
function tileSvg(url) {
  const h = hash(url);
  const lines = Array.from({ length: 6 }, (_, i) => `<path d="M${(h >> i) % 256} 0 L ${(h >> (i + 3)) % 256} 256" stroke="#2a2659" stroke-width="${1 + (i % 2)}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" fill="#100e2b"/><path d="M0 64H256M0 128H256M0 192H256M64 0V256M128 0V256M192 0V256" stroke="#1b1840" stroke-width="1"/>${lines}</svg>`;
}

async function stubImages(context) {
  if (!STUB) return;
  await context.route(/images\.unsplash\.com|i\.pravatar\.cc|basemaps\.cartocdn\.com|tile\.openstreetmap\.org/, (route) => {
    const url = route.request().url();
    const body = /pravatar/.test(url) ? avatarSvg(url) : /cartocdn|openstreetmap/.test(url) ? tileSvg(url) : sceneSvg(url);
    route.fulfill({ status: 200, contentType: "image/svg+xml", headers: { "cache-control": "public, max-age=86400" }, body });
  });
  // Nominatim is only used by the host wizard's address search.
  await context.route(/nominatim\.openstreetmap\.org/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

// ---------------------------------------------------------------------------
// Mock wallet + session helpers
// ---------------------------------------------------------------------------

async function apiLogin(email) {
  const r = await fetch(`${API}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
  if (!r.ok) throw new Error(`login failed for ${email}: ${r.status}`);
  return r.json();
}

async function openSession(browser, role, { mobile = false } = {}) {
  const context = await browser.newContext({
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 2 : 1,
    isMobile: mobile,
    hasTouch: mobile,
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await stubImages(context);
  const wallet = role ? new Wallet(KEYS[role], provider) : null;
  const sender = wallet ? new NonceManager(wallet) : null;
  if (role) {
    const session = await apiLogin(ACCOUNTS[role]);
    run.accounts[role] = { email: ACCOUNTS[role], name: session.user.name, wallet: wallet.address, role: role === "guest" ? "buyer / guest" : role === "admin" ? "arbiter / admin" : "seller / host" };
    await context.addInitScript((token) => localStorage.setItem("tourisme.token", token), session.token);
  }
  await context.exposeFunction("__walletRequest", async (method, params = []) => {
    if (!wallet) throw new Error("No wallet in this session");
    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [wallet.address];
      case "eth_chainId":
        return "0x7a69";
      case "net_version":
        return "31337";
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain":
        return null;
      case "personal_sign": {
        const [message] = params;
        return wallet.signMessage(getBytes(message));
      }
      case "eth_sendTransaction": {
        const [t] = params;
        try {
          const tx = await sender.sendTransaction({ to: t.to, data: t.data, value: t.value ? BigInt(t.value) : 0n, gasLimit: t.gas ? BigInt(t.gas) : undefined });
          if (process.env.DEBUG_WALLET) console.log("  [wallet] sent", tx.hash, "nonce", tx.nonce);
          return tx.hash;
        } catch (e) {
          sender.reset();
          console.log("  [wallet] sendTransaction failed:", e.shortMessage || e.message);
          throw e;
        }
      }
      default:
        return provider.send(method, params);
    }
  });
  await context.addInitScript(() => {
    const listeners = {};
    window.ethereum = {
      isMetaMask: true,
      isTourismeMock: true,
      request: ({ method, params }) => window.__walletRequest(method, params || []),
      on: (e, cb) => ((listeners[e] = listeners[e] || []).push(cb), undefined),
      removeListener: () => undefined,
    };
  });
  const page = await context.newPage();
  lastPage = page;
  page.on("pageerror", (e) => console.log("  [page error]", e.message));
  return { context, page, wallet };
}

async function goto(page, url, { settle = 1200 } = {}) {
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(settle);
}

let shotIndex = 0;
let lastPage = null;
async function shot(page, name, { fullPage = false, caption = "" } = {}) {
  const file = `${String(++shotIndex).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, file), fullPage, animations: "disabled" });
  run.steps.push({ screenshot: file, caption });
  console.log(`  📸 ${file}`);
  return file;
}

const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const today = Math.floor(Date.now() / 86_400_000);
/** First free window of `nights` nights starting at least `from` days ahead (so reruns don't collide). */
async function freeWindow(listingId, nights, from = 10) {
  const cal = await (await fetch(`${API}/api/listings/${listingId}/calendar?network=evm:31337`)).json();
  const busy = new Set(cal.occupiedDays);
  for (let start = today + from; start < today + 360; start++) {
    let ok = true;
    for (let d = start; d < start + nights; d++) if (busy.has(d)) ok = false;
    if (ok) return [day(start - today), day(start - today + nights)];
  }
  throw new Error("no free dates");
}
const bal = async (addr) => formatEther(await provider.getBalance(addr));

// ---------------------------------------------------------------------------
// The walkthrough
// ---------------------------------------------------------------------------

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const meta = await (await fetch(`${API}/api/meta`)).json();
  const net = meta.networks.find((n) => n.id === "evm:31337");
  if (!net) throw new Error("Local network not found in /api/meta – is the chain deployed?");
  run.contracts = { escrow: net.escrow, usdc: net.usdc };
  const exp = await (await fetch(`${API}/api/listings?kind=experience&limit=5&sort=rating`)).json();
  run.experienceId = exp.results.find((e) => e.chains.length && e.instantBook).id;

  // ---- 1. Public pages (nobody logged in) ----------------------------------
  if (!process.env.SKIP_PUBLIC) {
    const { context, page } = await openSession(browser, null);
    await goto(page, "/", { settle: 2500 });
    await shot(page, "home-hero", { caption: "Landing page: brand hero, escrow stats and the chains the escrow settles on." });
    await shot(page, "home-full", { fullPage: true, caption: "Full landing page: trending stays, featured experiences, how it works." });
    const [sIn, sOut] = await freeWindow(1, 3, 10);
    await goto(page, `/?location=Marrakech&checkIn=${sIn}&checkOut=${sOut}&adults=2`);
    await shot(page, "search-results", { caption: "Search: Marrakech, 3 nights, 2 guests – totals include all fees." });
    await page.getByRole("button", { name: /Show map/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, "search-map", { caption: "Split map view with price pins; drag the map and 'search this area'." });
    await goto(page, `/rooms/1?checkIn=${sIn}&checkOut=${sOut}&adults=2`, { settle: 2000 });
    await shot(page, "listing-page", { fullPage: true, caption: "Listing page: photos, amenities, calendar, reviews, host card and the escrow booking widget." });
    await goto(page, "/experiences", { settle: 2000 });
    await shot(page, "experiences", { fullPage: true, caption: "Experiences & tours marketplace with category rail and single-date search." });
    const expId = run.experienceId;
    await goto(page, `/experiences/${expId}`, { settle: 2000 });
    await shot(page, "experience-page", { fullPage: true, caption: "Experience page: duration, group size, what's included, meeting point and the per-group escrow price." });
    await goto(page, "/help");
    await shot(page, "help-center", { caption: "Help Center: escrow, who judges disputes, cancellation policies, fees, live contract addresses." });
    await goto(page, "/trust");
    await shot(page, "trust-and-safety", { fullPage: true, caption: "Trust & Safety: what the escrow guarantees and who the arbiter is." });
    await goto(page, "/terms");
    await shot(page, "terms", { caption: "Terms of Service (plus Privacy, Cookies, Security and Contact pages)." });
    await goto(page, "/");
    await page.getByRole("button", { name: /Connect wallet/ }).first().click();
    await page.waitForTimeout(800);
    await shot(page, "login-modal", { caption: "Sign in with email/password or a wallet signature (no gas)." });
    await context.close();
  }

  // ---- 2. Buyer: Sara books Youssef's riad with USDC -----------------------
  let stayBooking, expBooking;
  {
    const { context, page, wallet } = await openSession(browser, "guest");
    const before = { eth: await bal(wallet.address) };
    await goto(page, "/account");
    await shot(page, "guest-account-wallets", { caption: "Buyer account (Sara): profile and the verified wallet used to pay." });

    const [checkIn, checkOut] = await freeWindow(1, 3, 10);
    await goto(page, `/book/1?checkIn=${checkIn}&checkOut=${checkOut}&adults=2`, { settle: 2500 });
    await page.getByRole("button", { name: "Connect" }).click();
    await page.waitForTimeout(2500);
    await shot(page, "checkout-usdc", { fullPage: true, caption: "Checkout: network + token (USDC), wallet connected & verified, on-chain quote and price breakdown." });
    const quoteText = await page.locator("text=You pay").locator("..").innerText().catch(() => "");
    await page.getByRole("button", { name: /Confirm and pay/ }).click();
    await page.waitForTimeout(1500);
    await shot(page, "checkout-processing", { caption: "Approve USDC → confirm payment → block confirmation → server verifies the Booked event." }).catch(() => {});
    await page.getByRole("button", { name: "View trip" }).waitFor({ timeout: 120_000 });
    await shot(page, "booking-confirmed", { caption: "Reservation confirmed – funds are now locked in the escrow contract." });
    await page.getByRole("button", { name: "View trip" }).click();
    await page.waitForURL(/\/trips\/\d+/, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const tripUrl = page.url();
    const bookingId = Number(tripUrl.split("/").pop());
    const b = (await (await fetch(`${API}/api/bookings/${bookingId}`, { headers: { Authorization: `Bearer ${(await apiLogin(ACCOUNTS.guest)).token}` } })).json()).booking;
    stayBooking = b;
    log("Guest paid for stay", { code: b.code, listing: b.listing.title, checkIn: b.checkIn, checkOut: b.checkOut, nights: b.nights, subtotalUsd: b.subtotalUsd, guestFeeUsd: b.feeUsd, totalUsd: b.totalUsd, paid: b.amountNative, hostPayoutUsd: b.hostPayoutUsd, txHash: b.txHash, chainBookingId: b.chainBookingId, quote: quoteText });
    await shot(page, "trip-detail", { fullPage: true, caption: "Trip page: escrow status, transaction hash, address revealed, cancel/release/report actions." });
    await goto(page, "/trips");
    await shot(page, "trips", { caption: "Trips: upcoming / past / cancelled." });

    // Experience, paid in ETH, then a dispute is opened on it.
    // Booked for today so the guest can report a problem right away (the UI allows it from check-in day).
    const [expDate, expEnd] = await freeWindow(run.experienceId, 1, 0);
    await goto(page, `/book/${run.experienceId}?checkIn=${expDate}&checkOut=${expEnd}&adults=3`, { settle: 2500 });
    await page.getByRole("button", { name: "Connect" }).click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: "ETH", exact: true }).click();
    await page.waitForTimeout(2500);
    await shot(page, "checkout-experience-eth", { fullPage: true, caption: "Booking an experience for one date, paid in ETH." });
    await page.getByRole("button", { name: /Confirm and pay|Request to book/ }).click();
    await page.getByRole("button", { name: "View trip" }).waitFor({ timeout: 120_000 });
    await page.getByRole("button", { name: "View trip" }).click();
    await page.waitForURL(/\/trips\/\d+/, { timeout: 30_000 });
    await page.waitForTimeout(2000);
    const expBookingId = Number(page.url().split("/").pop());
    expBooking = (await (await fetch(`${API}/api/bookings/${expBookingId}`, { headers: { Authorization: `Bearer ${(await apiLogin(ACCOUNTS.guest)).token}` } })).json()).booking;
    log("Guest paid for experience", { code: expBooking.code, listing: expBooking.listing.title, date: expBooking.checkIn, totalUsd: expBooking.totalUsd, paid: expBooking.amountNative, txHash: expBooking.txHash, status: expBooking.status });

    if (expBooking.status === "confirmed") {
      await page.getByRole("button", { name: /Report a problem/ }).click();
      await page.getByPlaceholder(/No hot water/).fill("The guide never showed up at the meeting point and doesn't answer messages.");
      await shot(page, "report-problem", { caption: "Guest reports a problem → payout frozen on-chain until the arbiter decides." });
      await page.getByRole("button", { name: "Submit report" }).click();
      await page.waitForTimeout(6000);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(page, "trip-disputed", { caption: "The booking is now 'Disputed'; the host cannot withdraw." });
      log("Guest opened dispute", { code: expBooking.code });
    }
    await goto(page, "/messages", { settle: 2000 });
    await shot(page, "messages", { caption: "Inbox: every booking gets a conversation with system messages for each escrow event." });
    await goto(page, "/wishlists");
    const after = { eth: await bal(wallet.address) };
    log("Guest ETH balance", { before: before.eth, after: after.eth });
    await context.close();
  }

  // ---- 3. Seller: Youssef sees the reservation, his earnings, his listings --
  {
    const { context, page, wallet } = await openSession(browser, "youssef");
    await goto(page, "/hosting", { settle: 2000 });
    await shot(page, "host-dashboard", { caption: "Host dashboard (Youssef): today, requests, upcoming reservations." });
    await goto(page, "/hosting/reservations", { settle: 2000 });
    await shot(page, "host-reservations", { caption: "Reservations table with escrow status and payout per booking." });
    await goto(page, `/hosting/reservations/${stayBooking.id}`, { settle: 2000 });
    await shot(page, "host-reservation-detail", { fullPage: true, caption: "Host view of Sara's booking: guest, dates, amount locked, actions." });
    await goto(page, "/hosting/earnings", { settle: 2500 });
    await shot(page, "host-earnings", { fullPage: true, caption: "Earnings: monthly chart, pending vs released, withdraw from escrow to wallet." });
    await goto(page, "/hosting/listings", { settle: 2000 });
    await shot(page, "host-listings", { caption: "Host's stays and experiences; publish state and enabled chains." });
    await goto(page, "/hosting/listings/1/edit", { settle: 2000 });
    await page.getByRole("button", { name: "On-chain payments" }).click();
    await page.waitForTimeout(1200);
    await shot(page, "host-enable-payments", { caption: "Enable payments per network: creates the listing + prices in the escrow contract." });
    await goto(page, "/hosting/experiences/new", { settle: 1500 });
    await shot(page, "host-new-experience", { fullPage: true, caption: "Experience wizard: type, category, meeting point, group & duration, inclusions, price." });
    log("Host wallet", { address: wallet.address, eth: await bal(wallet.address) });
    await context.close();
  }

  // ---- 4. Arbiter resolves the dispute --------------------------------------
  if (expBooking) {
    const { context, page } = await openSession(browser, "admin");
    await goto(page, "/admin", { settle: 2000 });
    await shot(page, "admin-disputes", { caption: "Admin / arbiter: platform stats and open disputes with a refund slider." });
    const slider = page.locator('input[type="range"]').first();
    if (await slider.count()) {
      await slider.evaluate((el) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
        setter.call(el, "100");
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await page.waitForTimeout(500);
      await page.getByRole("button", { name: "Resolve on-chain" }).first().click();
      await page.waitForTimeout(7000);
      await page.reload({ waitUntil: "networkidle" });
      await page.waitForTimeout(1500);
      await shot(page, "admin-resolved", { caption: "Dispute resolved on-chain: 100% refunded to the guest." });
      log("Arbiter resolved dispute", { code: expBooking.code, refundPercent: 100 });
    }
    await context.close();
  }

  // ---- 5. Buyer sees the refund ----------------------------------------------
  if (expBooking) {
    const { context, page } = await openSession(browser, "guest");
    await goto(page, `/trips/${expBooking.id}`, { settle: 2500 });
    await shot(page, "trip-refunded", { fullPage: true, caption: "Guest's trip after resolution: status 'Resolved', refund withdrawable from the contract." });
    await context.close();
  }

  // ---- 6. Mobile ---------------------------------------------------------------
  {
    const { context, page } = await openSession(browser, "guest", { mobile: true });
    await goto(page, "/", { settle: 2500 });
    await shot(page, "mobile-home", { caption: "Mobile: full-screen search and bottom tab bar." });
    await goto(page, "/rooms/1", { settle: 2000 });
    await shot(page, "mobile-listing", { caption: "Mobile listing with sticky reserve bar." });
    await goto(page, "/experiences", { settle: 2000 });
    await shot(page, "mobile-experiences", { caption: "Mobile experiences." });
    await goto(page, "/trips", { settle: 2000 });
    await shot(page, "mobile-trips", { caption: "Mobile trips." });
    await context.close();
  }

  // Final on-chain snapshot
  const escrowEth = await provider.getBalance(run.contracts.escrow);
  const usdcBal = await provider.call({ to: run.contracts.usdc, data: "0x70a08231" + run.contracts.escrow.slice(2).padStart(64, "0") });
  run.escrowBalances = { eth: formatEther(escrowEth), usdc: formatUnits(BigInt(usdcBal), 6) };
  run.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify(run, null, 2));
  await browser.close();
  console.log(`\nDone – ${shotIndex} screenshots in ${path.relative(ROOT, OUT)}`);
}

main().catch(async (err) => {
  console.error(err);
  if (lastPage) await lastPage.screenshot({ path: path.join(OUT, "error.png"), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(OUT, "run.json"), JSON.stringify({ ...run, error: String(err) }, null, 2));
  process.exit(1);
});
