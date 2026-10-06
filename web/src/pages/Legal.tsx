import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Bug, FileText, Lock, Mail, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useTitle } from "../lib/hooks";
import { Container } from "../components/ui";

const UPDATED = "October 6, 2026";
const OPERATOR = "Berchid Walid";
const CONTACT = "hello@tourisme.app";

function LegalLayout({ icon, kicker, title, intro, children }: { icon: ReactNode; kicker: string; title: string; intro: string; children: ReactNode }) {
  useTitle(title);
  const nav: [string, string][] = [
    ["/about", "About"],
    ["/trust", "Trust & Safety"],
    ["/terms", "Terms of Service"],
    ["/privacy", "Privacy Policy"],
    ["/cookies", "Cookie Policy"],
    ["/security", "Security"],
    ["/contact", "Contact"],
  ];
  return (
    <Container className="pb-24 pt-10">
      <div className="grid gap-10 lg:grid-cols-[240px_1fr]">
        <nav className="scrollbar-hide flex gap-2 overflow-x-auto lg:sticky lg:top-28 lg:block lg:space-y-1 lg:self-start">
          {nav.map(([to, label]) => (
            <Link key={to} to={to} className={`shrink-0 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-white/5 lg:block ${window.location.pathname === to ? "bg-white/10 text-ink" : "text-ink-soft"}`}>
              {label}
            </Link>
          ))}
        </nav>
        <article className="min-w-0 max-w-3xl">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand">
            {icon} {kicker}
          </span>
          <h1 className="mt-3 font-display text-4xl font-bold">{title}</h1>
          <p className="mt-3 text-lg text-ink-soft">{intro}</p>
          <p className="mt-2 text-xs text-ink-muted">Last updated {UPDATED}</p>
          <div className="prose-legal mt-10 space-y-8 leading-relaxed text-ink-soft [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-3">{children}</div>
        </article>
      </div>
    </Container>
  );
}

export function About() {
  return (
    <LegalLayout icon={<Users className="h-4 w-4" />} kicker="About" title="Travel on-chain." intro="Tourisme is a marketplace for stays and experiences where the payment rules are enforced by smart contracts instead of a company's goodwill.">
      <section>
        <h2>Why we exist</h2>
        <p>
          Every travel marketplace asks you to trust it with your money: you pay up-front, the platform holds the funds, and if something goes wrong you file a ticket and wait. Tourisme replaces that trust with code. When you book, your payment is locked in an open-source escrow contract on Ethereum, Polygon, Base, Solana or EOS. The host is paid 24 hours after you check in. Cancellations refund you automatically according to the policy you agreed to, and disputes are settled by an arbiter whose only power is to split the escrowed amount.
        </p>
      </section>
      <section>
        <h2>Who is behind Tourisme</h2>
        <p>
          Tourisme was founded and is operated by <b className="text-ink">{OPERATOR}</b>. The project started in Morocco – riads, desert camps and Atlas lodges were our first listings – and now hosts stays and experiences worldwide. The smart contracts, the API and the web app are open source so anyone can verify how funds move.
        </p>
      </section>
      <section>
        <h2>Our principles</h2>
        <ul>
          <li><b className="text-ink">Non-custodial.</b> We never hold your money or your keys.</li>
          <li><b className="text-ink">Verifiable.</b> Every payment, refund and payout is a public transaction you can check on a block explorer.</li>
          <li><b className="text-ink">Host-first economics.</b> A 3% host fee and an 8% guest fee – lower than incumbents – because the contract does the heavy lifting.</li>
          <li><b className="text-ink">Local.</b> Experiences and stays are run by the people who live there.</li>
        </ul>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Press, partnerships or questions: <a className="text-brand-mint underline" href={`mailto:${CONTACT}`}>{CONTACT}</a> or the <Link to="/contact" className="underline">contact page</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}

export function Trust() {
  return (
    <LegalLayout icon={<ShieldCheck className="h-4 w-4" />} kicker="Trust & Safety" title="How you're protected." intro="What the escrow guarantees, what it doesn't, and who decides when something goes wrong.">
      <section>
        <h2>For guests</h2>
        <ul>
          <li>The host never receives your payment before you arrive. Funds stay in the escrow contract until 24 hours after check-in.</li>
          <li>If the place or experience doesn't exist or isn't as described, open a dispute from your trip page within that window. The payout is frozen immediately.</li>
          <li>Cancellations are refunded automatically according to the listing's policy (Flexible, Moderate or Strict). If the host cancels, you get 100% back.</li>
          <li>Exact addresses are only revealed after your booking is confirmed; messages stay inside Tourisme so there is a record.</li>
        </ul>
      </section>
      <section>
        <h2>For hosts</h2>
        <ul>
          <li>Guests pay the full amount into escrow before a booking exists – no chargebacks, no unpaid stays.</li>
          <li>Payouts are released to your balance in the contract 24 hours after check-in and withdrawn to your own wallet whenever you want.</li>
          <li>Guests are verified by wallet signature and can be reviewed on-chain; their history follows their wallet.</li>
        </ul>
      </section>
      <section>
        <h2>Who judges a dispute?</h2>
        <p>
          The escrow contract has a single <i>arbiter</i> address. Only it can call <code className="font-mono text-brand-mint">resolveDispute</code>, choosing a refund split between 0% and 100%. The arbiter cannot access any other funds. Today the arbiter is operated by the Tourisme team; decisions are executed on-chain and are publicly visible. The contract owner can later point the arbiter at a multisig or a decentralized jury without changing the escrow itself.
        </p>
      </section>
      <section>
        <h2>What the contract cannot do</h2>
        <p>
          Code cannot see a building. Verification of listings today relies on host wallets, public profiles, reviews and the dispute process. We are working on identity verification for hosts (Verified badge), proof-of-listing documents, host bonds forfeited for fraudulent listings, and decentralized arbitration. We'll always say clearly which of these are live.
        </p>
      </section>
      <section>
        <h2>Report a concern</h2>
        <p>
          Something looks off? Email <a className="text-brand-mint underline" href={`mailto:trust@tourisme.app`}>trust@tourisme.app</a>. For security vulnerabilities see our <Link to="/security" className="underline">security policy</Link>.
        </p>
      </section>
    </LegalLayout>
  );
}

export function Terms() {
  return (
    <LegalLayout icon={<ScrollText className="h-4 w-4" />} kicker="Legal" title="Terms of Service" intro="The agreement between you and Tourisme when you use the website, the API or the escrow contracts.">
      <section>
        <h2>1. Who we are</h2>
        <p>
          "Tourisme", "we" and "us" refer to the Tourisme platform operated by {OPERATOR} ("Operator"). Tourisme provides a marketplace that connects hosts offering accommodation or experiences ("Listings") with guests, and publishes open-source smart contracts that hold payments in escrow.
        </p>
      </section>
      <section>
        <h2>2. The platform is non-custodial</h2>
        <p>
          Tourisme never holds, controls or transfers your funds. Payments are sent by you directly to an escrow smart contract on a public blockchain. The contract – not Tourisme – holds the funds and executes refunds, payouts and dispute resolutions according to its published code. Blockchain transactions are irreversible; please double-check networks, amounts and wallet addresses before confirming.
        </p>
      </section>
      <section>
        <h2>3. Accounts</h2>
        <p>You must be at least 18 to use Tourisme. You can sign in with an email and password or with a wallet signature. You are responsible for safeguarding your credentials and private keys and for all activity under your account. One person, one account.</p>
      </section>
      <section>
        <h2>4. Bookings, fees and payment</h2>
        <ul>
          <li>A booking exists when the escrow contract emits a <code className="font-mono">Booked</code> event for your payment. Prices in fiat currencies are shown for convenience only; the amount charged is the on-chain quote in the selected token.</li>
          <li>Guests pay a service fee (currently 8% of the subtotal). Hosts pay a fee (currently 3%) deducted from their payout. Fees are set in the contract and shown before you confirm.</li>
          <li>Network (gas) fees are paid to the blockchain and are not refundable.</li>
          <li>Hosts' payouts are released 24 hours after check-in unless a dispute is open.</li>
        </ul>
      </section>
      <section>
        <h2>5. Cancellations and refunds</h2>
        <p>Each Listing states its cancellation policy (Flexible, Moderate or Strict) before you book. Refunds are computed and executed by the escrow contract. Host cancellations and declined requests always refund the guest in full.</p>
      </section>
      <section>
        <h2>6. Disputes</h2>
        <p>
          A guest may open a dispute before the payout is released. The arbiter designated in the contract reviews the evidence provided by both parties through Tourisme messaging and resolves the dispute on-chain by assigning a refund percentage. Arbiter decisions are final for the escrowed funds. Nothing prevents either party from pursuing other legal remedies.
        </p>
      </section>
      <section>
        <h2>7. Host obligations</h2>
        <ul>
          <li>You may only list accommodation or experiences you are legally entitled to offer, and you must comply with local laws, taxes, licensing and safety rules.</li>
          <li>Listings must be accurate. Misrepresentation may lead to refunds from escrow, removal of the Listing and account suspension.</li>
          <li>You must honour confirmed bookings. Repeated cancellations lead to suspension.</li>
        </ul>
      </section>
      <section>
        <h2>8. Guest obligations</h2>
        <p>Follow the house rules and the host's reasonable instructions, respect the property and the maximum number of guests, and communicate honestly. Damage caused by a guest may be claimed by the host through the dispute process or directly.</p>
      </section>
      <section>
        <h2>9. Prohibited uses</h2>
        <p>No unlawful activity, money laundering, circumventing the escrow (paying hosts directly), scraping, interfering with the contracts or the API, impersonation, or discriminatory conduct.</p>
      </section>
      <section>
        <h2>10. Content</h2>
        <p>You keep ownership of the photos and text you upload and grant Tourisme a worldwide, royalty-free licence to display them to operate the marketplace. Don't upload content you don't have the rights to.</p>
      </section>
      <section>
        <h2>11. Disclaimers and liability</h2>
        <p>
          Tourisme is provided "as is". The smart contracts are open source and audited by the community, but blockchain software can contain bugs; use it at your own risk. Tourisme is not a party to the agreement between host and guest and does not own, control or inspect Listings. To the maximum extent permitted by law, the Operator's liability is limited to the fees you paid to Tourisme in the twelve months before the claim.
        </p>
      </section>
      <section>
        <h2>12. Changes and termination</h2>
        <p>We may update these terms; material changes are announced on the site at least 14 days in advance. You can close your account at any time; on-chain records cannot be deleted. We may suspend accounts that violate these terms.</p>
      </section>
      <section>
        <h2>13. Governing law</h2>
        <p>These terms are governed by the laws of the Kingdom of Morocco, without prejudice to mandatory consumer-protection rules of your country of residence. Contact: <a className="text-brand-mint underline" href={`mailto:legal@tourisme.app`}>legal@tourisme.app</a>.</p>
      </section>
    </LegalLayout>
  );
}

export function Privacy() {
  return (
    <LegalLayout icon={<Lock className="h-4 w-4" />} kicker="Legal" title="Privacy Policy" intro="What we collect, why, and the choices you have. Written for people, not lawyers.">
      <section>
        <h2>Data controller</h2>
        <p>{OPERATOR}, operating Tourisme. Privacy questions: <a className="text-brand-mint underline" href={`mailto:privacy@tourisme.app`}>privacy@tourisme.app</a>.</p>
      </section>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li><b className="text-ink">Account data</b> – name, email, password hash, profile photo, bio, languages, preferred currency.</li>
          <li><b className="text-ink">Wallet addresses</b> you link or sign in with. Signing a login message costs no gas and reveals only your public address.</li>
          <li><b className="text-ink">Listings and bookings</b> – listing details, photos, dates, guests, messages with hosts/guests, reviews.</li>
          <li><b className="text-ink">Technical data</b> – IP address, browser type and pages visited, used for security and to keep the service running.</li>
        </ul>
        <p>We never collect your private keys, seed phrases or card numbers – there are none to collect.</p>
      </section>
      <section>
        <h2>Why we use it</h2>
        <ul>
          <li>To run the marketplace: show listings, verify on-chain payments, send booking emails and notifications (contract performance).</li>
          <li>To keep hosts and guests safe: fraud prevention, dispute handling (legitimate interest).</li>
          <li>To improve the product with aggregated, anonymised statistics (legitimate interest).</li>
          <li>Marketing emails only with your consent – you can turn them off in Account settings at any time.</li>
        </ul>
      </section>
      <section>
        <h2>Blockchain data</h2>
        <p>
          Payments, refunds, payouts and optional on-chain reviews are written to public blockchains and are permanent and visible to anyone. They contain wallet addresses, amounts, dates and listing ids – not your name or email. Please consider this before linking a wallet that can be associated with your identity.
        </p>
      </section>
      <section>
        <h2>Sharing</h2>
        <p>
          We share your first name, profile photo and messages with the other party of a booking, and the exact address of a stay with confirmed guests. We use processors for email delivery, hosting and exchange-rate data; they only process data on our instructions. We don't sell personal data.
        </p>
      </section>
      <section>
        <h2>Retention</h2>
        <p>Account data is kept while your account is active and for 5 years after your last booking for tax and dispute purposes, unless you ask for earlier deletion where the law allows. On-chain data cannot be deleted.</p>
      </section>
      <section>
        <h2>Your rights</h2>
        <p>Access, correct, export or delete your data, object to processing, or withdraw consent at any time by emailing privacy@tourisme.app. EU/UK residents can also complain to their supervisory authority.</p>
      </section>
      <section>
        <h2>Security</h2>
        <p>Passwords are hashed with bcrypt, sessions use short-lived signed tokens, all traffic is encrypted in transit and uploads are scanned for type. See our <Link to="/security" className="underline">security page</Link>.</p>
      </section>
    </LegalLayout>
  );
}

export function Cookies() {
  return (
    <LegalLayout icon={<FileText className="h-4 w-4" />} kicker="Legal" title="Cookie Policy" intro="We use almost no cookies, and none for advertising.">
      <section>
        <h2>What we store in your browser</h2>
        <ul>
          <li><b className="text-ink">tourisme.token</b> – your login session (local storage). Removed when you log out.</li>
          <li><b className="text-ink">tourisme.currency</b> – your display currency preference (local storage).</li>
        </ul>
        <p>These are strictly necessary for the service and do not require consent. We do not use advertising or cross-site tracking cookies.</p>
      </section>
      <section>
        <h2>Third parties</h2>
        <p>Map tiles (CARTO / OpenStreetMap), web fonts (Google Fonts) and photo hosting may set their own technical cookies when loaded. Your wallet extension (MetaMask, Phantom, Anchor) manages its own storage – we never read it.</p>
      </section>
      <section>
        <h2>Managing cookies</h2>
        <p>You can clear site data from your browser settings at any time; you'll simply be logged out.</p>
      </section>
    </LegalLayout>
  );
}

export function Security() {
  return (
    <LegalLayout icon={<Bug className="h-4 w-4" />} kicker="Security" title="Security & responsible disclosure" intro="How the system is protected and how to tell us if you find a hole.">
      <section>
        <h2>Architecture</h2>
        <ul>
          <li><b className="text-ink">Smart contracts</b> – Solidity (OpenZeppelin ReentrancyGuard, SafeERC20, Pausable), pull-based withdrawals, fee caps, a full Hardhat test suite; Anchor (Rust) and Antelope (C++) implementations follow the same rules.</li>
          <li><b className="text-ink">Server</b> – every booking is verified by reading the on-chain transaction receipt; the client is never trusted for amounts, dates or status. Rate limiting, helmet headers, input validation with zod, MIME-checked uploads.</li>
          <li><b className="text-ink">Wallet login</b> – nonce-based message signing, one-time nonces with expiry; no gas required.</li>
        </ul>
      </section>
      <section>
        <h2>Reporting a vulnerability</h2>
        <p>
          Please email <a className="text-brand-mint underline" href="mailto:security@tourisme.app">security@tourisme.app</a> with a description and reproduction steps. We acknowledge reports within 48 hours and aim to fix critical issues within 7 days. Don't exploit the issue beyond what's needed to prove it, and don't touch other users' data or funds. We credit researchers who report responsibly.
        </p>
      </section>
      <section>
        <h2>Scope</h2>
        <p>The web app, the API, and the escrow contracts listed on the <Link to="/help#chains" className="underline">Help Center</Link>. Test networks are preferred for proofs of concept.</p>
      </section>
    </LegalLayout>
  );
}

export function Contact() {
  return (
    <LegalLayout icon={<Mail className="h-4 w-4" />} kicker="Contact" title="Talk to us." intro="Real people, real answers. We reply within one business day.">
      <section>
        <h2>Email</h2>
        <ul>
          <li>General: <a className="text-brand-mint underline" href={`mailto:${CONTACT}`}>{CONTACT}</a></li>
          <li>Trust & safety / disputes: <a className="text-brand-mint underline" href="mailto:trust@tourisme.app">trust@tourisme.app</a></li>
          <li>Hosts & partnerships: <a className="text-brand-mint underline" href="mailto:hosts@tourisme.app">hosts@tourisme.app</a></li>
          <li>Press: <a className="text-brand-mint underline" href="mailto:press@tourisme.app">press@tourisme.app</a></li>
          <li>Security: <a className="text-brand-mint underline" href="mailto:security@tourisme.app">security@tourisme.app</a></li>
        </ul>
      </section>
      <section>
        <h2>Operator</h2>
        <p>Tourisme is operated by {OPERATOR}. Registered office: Casablanca, Morocco.</p>
      </section>
      <section>
        <h2>Before you write</h2>
        <p>Most booking questions are answered in the <Link to="/help" className="underline">Help Center</Link>. For an active reservation, message your host or guest from the trip page – the conversation is kept as evidence if a dispute is opened.</p>
      </section>
    </LegalLayout>
  );
}
