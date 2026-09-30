# Tourisme — decentralized stays, paid through smart-contract escrow

An Airbnb-style marketplace for unique stays (riads, desert camps, villas, city apartments…) where
**every payment goes through a smart-contract escrow** instead of a company bank account.
Guests pay in **ETH / POL / USDC on Ethereum, Polygon or Base**, **SOL on Solana** or **EOS on
Antelope chains**. The contract holds the funds, refunds according to the cancellation policy,
and releases the payout to the host 24 hours after check-in. Disputes go to an on-chain arbiter.

```
contracts/evm      Solidity escrow (Hardhat) — main, fully tested
contracts/solana   Anchor program (Rust) — same rules, paid in SOL
contracts/eosio    Antelope C++ contract — pay by eosio.token transfer
server             Node API (Express + SQLite): accounts, listings, search, messaging, emails, chain verification
web                React + Vite + Tailwind web app (the Airbnb-like UI)
```

## Features

**Guests**
- Search by destination, dates and guests, with category bar, filters (price, rooms, amenities,
  property type, instant book, payment network) and an interactive price map (search this area)
- Listing pages: photo gallery, amenities, availability calendar (off-chain + on-chain), reviews
  with category scores, host profile, location map, house rules, cancellation policy
- Checkout: pick network & currency, connect wallet, see the exact on-chain quote and balance,
  get test USDC on testnets, pay into escrow; request-to-book or instant book
- Trips: upcoming, current, past and cancelled; cancel with a live refund preview; release payment
  early; report a problem (freezes payout); two-sided reviews (optionally recorded on-chain)
- Wishlists, messaging with hosts, in-app notifications, printable receipts, currency display
  (USD/EUR/MAD/GBP)
- Sign in with **email + password** or **wallet** (MetaMask/Rabby/Coinbase, Phantom) — no gas

**Hosts**
- 8-step listing wizard: type, map location (address search + draggable pin), rooms, amenities,
  photo upload (drag & drop, reorder, cover), description, pricing & policies, review & publish
- One-click **enable payments** per network (creates the listing and prices on-chain)
- Calendar blocking (mirrored on-chain), accept/decline requests (decline = automatic full refund)
- Dashboard (today, requests, current, upcoming), reservations table, earnings chart, payout
  history and **withdraw** from escrow to wallet

**Platform**
- Transactional emails: welcome/verify, password reset, booking confirmed/requested, new
  reservation (host), request accepted/declined, cancellation, payout released, dispute opened/
  resolved, new message, review reminder, listing published
- Server verifies every payment **on-chain** before recording a booking; an event indexer keeps
  statuses in sync even when users act directly on the contract
- Admin/arbiter page to resolve disputes on-chain, platform stats
- Mobile-first responsive UI with bottom tab bar, full-screen search, sticky reserve bar

## Quick start (local, ~2 minutes)

Requirements: **Node.js 22.5+**.

```bash
npm install
npm run dev
```

This starts a local Hardhat blockchain, deploys the contracts, publishes the 18 demo listings
on-chain, and runs the API (http://localhost:4000) and web app (**http://localhost:5173**).

### Demo accounts (password `tourisme123`)

| Role  | Email                         | Wallet (Hardhat account) |
|-------|-------------------------------|--------------------------|
| Guest | `guest@demo.tourisme.app`     | #5 |
| Host  | `youssef@demo.tourisme.app`   | #1 |
| Host  | `amina@demo.tourisme.app`     | #2 |
| Host  | `karim@demo.tourisme.app`     | #3 |
| Host  | `sofia@demo.tourisme.app`     | #4 |
| Admin / arbiter | `admin@demo.tourisme.app` | #0 |

To pay locally with MetaMask: add the network *Hardhat Local* (RPC `http://127.0.0.1:8545`,
chain id `31337`) and import a Hardhat test key (printed by `npx hardhat node`; e.g. account #6
`0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e`). Every test account has
10,000 ETH and 50,000 test USDC. **Never use these keys on a real network.**

Emails are not sent locally unless you configure SMTP; open
http://localhost:4000/api/dev/emails to see everything that would have been sent.

### Tests

```bash
npm test                          # Solidity tests + API tests (API e2e runs against the local chain if it's up)
cd contracts/solana && cargo test # Solana program unit tests
npm run build -w web              # type-check + production build
```

## Deploying to production

### 1. Deploy the smart contracts

Start with testnets (Sepolia, Polygon Amoy, Base Sepolia), then mainnets once audited.

```bash
cd contracts/evm
cat > .env <<'EOF'
DEPLOYER_PRIVATE_KEY=0x...      # funded deployer (use a fresh key)
ARBITER_ADDRESS=0x...           # dispute resolver — a Safe multisig is recommended
TREASURY_ADDRESS=0x...          # receives the 8% guest + 3% host fees
# USDC_ADDRESS=0x...            # real USDC; omit on testnets to deploy a test USDC with faucet
EOF
npm run deploy:sepolia          # also: deploy:amoy, deploy:baseSepolia
```

Each deploy updates `web/src/config/deployments.json`, which the API reads to know the contract
addresses. Add more networks (mainnet, Polygon, Base) in `hardhat.config.js`.

**Solana (optional):** see `contracts/solana/README.md` (`anchor deploy`, then `scripts/initialize.mjs`),
then set `SOLANA_ENABLED=1` and `SOLANA_PROGRAM_ID`.
**EOS (optional):** see `contracts/eosio/README.md`, then set `EOS_ENABLED=1` and `EOS_CONTRACT`.

### 2. Configure

```bash
cp .env.example .env
```

At minimum set `APP_URL`, `JWT_SECRET` (`openssl rand -hex 32`), `SMTP_*` and `MAIL_FROM`,
`EVM_CHAIN_IDS` and the RPC URLs. Any SMTP provider works (Resend, SendGrid, Mailgun, Postmark,
Amazon SES, Gmail app password). Verify your sending domain (SPF/DKIM) so emails land in inboxes.

### 3. Run

**Docker (any VPS, Render, Railway, Fly.io…)** — one container serves the API and the web app:

```bash
docker compose up -d --build
```

Data (SQLite database + uploaded photos) lives in the `/data` volume — back it up. Put the
container behind HTTPS (Caddy, Nginx, or your platform's load balancer).

**Without Docker:**

```bash
npm ci && npm run build -w web
NODE_ENV=production node --no-warnings=ExperimentalWarning server/src/index.js
```

The API serves `web/dist` automatically when it exists. To host the frontend separately
(Vercel/Netlify), build it with `VITE_API_URL=https://api.yourdomain.com` and set `CORS_ORIGINS`.

### Production checklist

- [ ] Get the contracts **professionally audited** before accepting real funds
- [ ] Arbiter and contract owner are multisig wallets (e.g. Safe); keep the deployer key offline
- [ ] `JWT_SECRET` set, `SEED_DEMO=0`, HTTPS enabled, `/data` volume backed up
- [ ] SMTP domain verified; test the password-reset email
- [ ] RPC URLs are public or domain-restricted (they are sent to browsers for price quotes)
- [ ] Check local short-term-rental regulations and KYC/AML obligations in your markets

## How the escrow works

1. The host publishes a listing on-chain with prices per token, min/max nights and a
   cancellation policy (Flexible, Moderate, Strict).
2. The guest calls `book()` with the exact quote (nights × price + cleaning + 8% service fee).
   The contract rejects any night that is already booked or blocked.
3. Before check-in, `cancelByGuest()` refunds according to the policy; `cancelByHost()` always
   refunds 100%.
4. From 24h after check-in (15:00 UTC), anyone can call `release()`; the host's share (minus 3%)
   becomes withdrawable. The guest can release early.
5. Until then, the guest can `openDispute()`; the arbiter settles with `resolveDispute(bps)`.
6. After the stay both sides can leave on-chain reviews.

Payouts use a pull pattern (`withdraw(token)`), guarded by `ReentrancyGuard`, with pausable
bookings and fee caps (≤ 20%).
