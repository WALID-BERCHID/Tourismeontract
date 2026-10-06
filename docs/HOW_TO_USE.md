# How to use Tourisme — a complete walkthrough with real transactions

This guide follows one **buyer (guest)**, one **seller (host)** and the **arbiter** through the whole
product on the local blockchain, with screenshots taken by `npm run screenshots` and the exact
on-chain amounts recorded in [`screenshots/run.json`](screenshots/run.json).

> The screenshots were captured in an offline sandbox, so listing photos, avatars and map tiles are
> generated artwork. When you run the app yourself the real photos (Unsplash) and CARTO map tiles load.

---

## 0. The cast

| Role | Who | Login | Wallet (Hardhat account) |
|---|---|---|---|
| **Buyer / guest** | Sara Traveler | `guest@demo.tourisme.app` / `tourisme123` | `0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc` (#5) |
| **Seller / host** | Youssef Benali — owns *Riad Yasmine* (Marrakech), *Atlas stone lodge*, *Zermatt chalet* and 4 experiences | `youssef@demo.tourisme.app` / `tourisme123` | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (#1) |
| Seller / host | Karim Haddad — photographer, hosts the *Chefchaouen photo walk* | `karim@demo.tourisme.app` / `tourisme123` | `0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC` (#3) |
| **Arbiter / admin** | Admin Tourisme (the judge for disputes) | `admin@demo.tourisme.app` / `tourisme123` | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (#0) |

Contracts on the local chain (chainId 31337):

| Contract | Address |
|---|---|
| `TourismeEscrow` | `0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512` |
| `MockUSDC` (test stablecoin, 6 decimals) | `0x5FbDB2315678afecb367f032d93F642f64180aa3` |

Every test account starts with **10,000 ETH** and **50,000 USDC**. *Never use these keys on a real network.*

---

## 1. Start the app (2 minutes)

```bash
npm install
npm run dev        # local chain + deploy 28 listings on-chain + API (:4000) + web (:5173)
```

Open <http://localhost:5173>. To pay from a real browser wallet, add the network *Hardhat Local*
(RPC `http://127.0.0.1:8545`, chain id `31337`) to MetaMask and import one of the Hardhat keys
printed by `npx hardhat node`.

---

## 2. Discover

### Landing page
![Home](screenshots/01-home-hero.png)

The brand hero states the promise — *paid in crypto, protected by code* — with the stats that matter
(100 % of bookings in escrow, 5 chains, 0 days your money sits with a company). Behind the search
bar: trending stays, featured experiences and the three-step "how it works".

![Home, full page](screenshots/02-home-full.png)

### Search stays
![Search](screenshots/03-search-results.png)

Search *Marrakech · 3 nights · 2 guests*. Prices on the cards already include cleaning and the
service fee for those nights. Use the category rail (Riads, Desert, Beachfront…) and **Filters**
(price, rooms, amenities, property type, instant book, payment network).

![Map](screenshots/04-search-map.png)

**Show map** splits the screen; move the map and search that area.

### A listing — the seller's product
![Listing](screenshots/05-listing-page.png)

*Riad Yasmine* by Youssef: photos, amenities, availability calendar (merged from the database **and**
the on-chain calendar), reviews with category scores, host card, map and house rules. The booking
widget quotes the stay and shows which chains the host accepts (escrow badge).

### Experiences & tours
![Experiences](screenshots/06-experiences.png)
![Experience page](screenshots/07-experience-page.png)

Experiences are booked **privately for one date**: the price is per group (up to the host's maximum),
the page shows duration, languages, what's included and the meeting point. They use exactly the same
escrow contract as stays — an experience is a one-day listing — so the payout releases the day after.

### Help, trust and legal
![Help](screenshots/08-help-center.png)
![Trust](screenshots/09-trust-and-safety.png)
![Terms](screenshots/10-terms.png)

`/help`, `/trust`, `/about`, `/terms`, `/privacy`, `/cookies`, `/security` and `/contact` explain the
escrow, who judges disputes, fees, cancellation rules and the operator (Berchid Walid).

---

## 3. The buyer pays into escrow (Sara)

### Sign in
![Login](screenshots/11-login-modal.png)

Email + password, or **Continue with Ethereum wallet** — a free signature, no gas.
Sara's account already has wallet #5 verified:

![Account](screenshots/12-guest-account-wallets.png)

### Checkout — 3 nights at Riad Yasmine, paid in USDC
![Checkout](screenshots/13-checkout-usdc.png)

What Sara sees and what happened on-chain:

| Line | USD | On-chain |
|---|---|---|
| $285 × 3 nights | $855 | |
| Cleaning fee | $45 | |
| **Subtotal** (what the host prices) | **$900** | |
| Tourisme service fee (8 %) | $72 | |
| **Total paid by Sara** | **$972** | **972 USDC** locked in `TourismeEscrow` |
| Host payout after release (subtotal − 3 %) | $873 | 873 USDC withdrawable by Youssef |
| Platform (8 % + 3 %) | $99 | 99 USDC to the treasury on release |

Confirming triggers two wallet transactions (USDC `approve`, then `book`), then the API reads the
`Booked` event from the receipt and creates the reservation:

![Processing](screenshots/14-checkout-processing.png)
![Confirmed](screenshots/15-booking-confirmed.png)

| | |
|---|---|
| Confirmation code | `HMMF4LZ8H9` |
| Dates | 2026-10-16 → 2026-10-19 (3 nights) |
| On-chain booking id | `1` |
| Transaction | `0xd2fdd059cabd80f1481e38729efdc5eb5e39844f98a74760c175ab1d8d66862e` |
| Escrow USDC balance after | 972.0 USDC |

### The trip page
![Trip](screenshots/16-trip-detail.png)
![Trips](screenshots/17-trips.png)

The trip shows the escrow status, the network and amount, the paying wallet, the exact address
(revealed only after confirmation) and the actions: **Cancel reservation** (refund by policy),
**Release payment** (after check-in), **Report a problem**.

### A second purchase — an experience, paid in ETH
![Experience checkout](screenshots/18-checkout-experience-eth.png)

Sara books Karim's *Golden-hour photo walk* for today, 3 guests:

| | |
|---|---|
| Price per private group | $120 |
| Service fee (8 %) | $9.60 |
| **Total** | **$129.60 = 0.0432 ETH** (host priced ETH at $3,000) |
| Code | `HMHULH2FLC` |
| Transaction | `0x230f78c8d7f9862e4d6dafaf9672e75e248f1b0e852f2f5d9989ff016d0312ec` |

Her wallet went from 10,000 ETH to 9,999.9561 ETH (0.0432 ETH payment + ~0.0007 ETH gas across
all her transactions).

### Something went wrong → report a problem
![Report](screenshots/19-report-problem.png)
![Disputed](screenshots/20-trip-disputed.png)

The guide didn't show up. Sara reports it: `openDispute` is sent on-chain, the status becomes
**Disputed** and the host can no longer be paid. Every escrow event also lands as a system message in
the conversation with the host:

![Messages](screenshots/21-messages.png)

---

## 4. The seller side (Youssef)

![Dashboard](screenshots/22-host-dashboard.png)

Youssef's dashboard: paid out so far, **$873 upcoming (held in escrow)** — that's Sara's booking —
occupancy, rating, and his listings.

![Reservations](screenshots/23-host-reservations.png)
![Reservation](screenshots/24-host-reservation-detail.png)

The host sees Sara's reservation `HMMF4LZ8H9`, the amount locked and the actions available to him
(cancel = automatic 100 % refund to the guest; claim payout once 24 h after check-in have passed).

![Earnings](screenshots/25-host-earnings.png)

**Earnings**: monthly chart, payout history, and the on-chain balances with a **Withdraw** button —
funds move from the escrow contract straight to his wallet, no bank.

![Listings](screenshots/26-host-listings.png)
![Enable payments](screenshots/27-host-enable-payments.png)

Each listing is published on one or more chains from the editor's **On-chain payments** tab: one
wallet transaction creates the listing in the contract with its prices, stay limits and cancellation
policy. Hosts create new stays with the 8-step wizard or new experiences with the experience wizard:

![New experience](screenshots/28-host-new-experience.png)

---

## 5. The judge (arbiter)

![Admin](screenshots/29-admin-disputes.png)

The admin page shows platform stats and the open dispute. The arbiter — the address set in the
contract (`setArbiter`), today the Tourisme team — chooses the refund split and signs
`resolveDispute`:

![Resolved](screenshots/30-admin-resolved.png)

Result for `HMHULH2FLC`: **100 % refunded to Sara**, 0 to the host. The decision is a public
transaction; the arbiter can only split the escrowed amount, nothing else.

![Refunded](screenshots/31-trip-refunded.png)

Sara's trip now reads **Resolved**; the 0.0432 ETH is credited to her balance in the contract and
withdrawable with one click.

---

## 6. Mobile

| Home | Listing | Experiences | Trips |
|---|---|---|---|
| ![](screenshots/32-mobile-home.png) | ![](screenshots/33-mobile-listing.png) | ![](screenshots/34-mobile-experiences.png) | ![](screenshots/35-mobile-trips.png) |

---

## 7. Money flow cheat-sheet

For a stay whose host price (subtotal) is **1 ETH**:

| Party | Amount | When |
|---|---|---|
| Guest pays | **1.08 ETH** | at booking (`book`) — locked in escrow |
| Host receives | **0.97 ETH** | credited 24 h after check-in (`release`), withdrawn with `withdraw` |
| Treasury | **0.11 ETH** | at release (0.08 guest fee + 0.03 host fee) |
| Host cancels / declines | guest gets **1.08 ETH** back | immediately |
| Guest cancels (Moderate, < 5 days) | guest gets 0.5 ETH, host 0.485 ETH, treasury 0.095 ETH | immediately |
| Dispute resolved 100 % | guest gets **1.08 ETH** back | when the arbiter signs |

Gas is paid separately by whoever sends each transaction.

---

## 8. Regenerate the screenshots

```bash
npm run dev                 # in one terminal
npm run screenshots         # in another; add STUB_IMAGES=1 if you're offline
```

The script (`scripts/screenshots.mjs`) injects a mock MetaMask that signs with the demo keys, so the
whole buyer → seller → arbiter flow runs unattended and `docs/screenshots/run.json` records every
transaction hash and amount.
