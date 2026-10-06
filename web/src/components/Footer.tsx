import { Link } from "react-router-dom";
import { Globe, ShieldCheck } from "lucide-react";
import { useCurrency } from "../lib/currency";
import { ChainIcon, Logo, Wordmark } from "./icons";

const CHAINS: { chain: "evm" | "solana" | "eos"; name: string }[] = [
  { chain: "evm", name: "Ethereum" },
  { chain: "evm", name: "Polygon" },
  { chain: "evm", name: "Base" },
  { chain: "solana", name: "Solana" },
  { chain: "eos", name: "EOS" },
];

export default function Footer() {
  const { currency } = useCurrency();
  const col = "space-y-3 text-sm text-ink-soft";
  const link = "block transition hover:text-ink hover:underline";
  return (
    <footer className="relative mt-20 overflow-hidden border-t border-white/5 pb-24 md:pb-0">
      <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-brand-violet/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-32 top-0 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative mx-auto grid max-w-[2520px] gap-10 px-5 py-14 sm:px-10 md:grid-cols-[1.4fr_1fr_1fr_1fr] xl:px-20">
        <div>
          <Link to="/" className="flex items-center gap-2">
            <Logo className="h-9 w-9" />
            <Wordmark />
          </Link>
          <p className="mt-4 max-w-sm text-sm text-ink-soft">
            The on-chain travel marketplace. Stays and experiences worldwide, paid through smart-contract escrow – no company ever holds your money.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {CHAINS.map((c) => (
              <span key={c.name} className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold">
                <ChainIcon chain={c.chain} className="h-3.5 w-3.5" /> {c.name}
              </span>
            ))}
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs text-brand-mint">
            <ShieldCheck className="h-4 w-4" /> Open-source contracts · verifiable on every explorer
          </p>
        </div>
        <div className={col}>
          <h4 className="font-display font-semibold text-ink">Travel</h4>
          <Link to="/" className={link}>Stays</Link>
          <Link to="/experiences" className={link}>Experiences & tours</Link>
          <Link to="/wishlists" className={link}>Wishlists</Link>
          <Link to="/trips" className={link}>My trips</Link>
        </div>
        <div className={col}>
          <h4 className="font-display font-semibold text-ink">Hosting</h4>
          <Link to="/hosting/listings/new" className={link}>List your home</Link>
          <Link to="/hosting/experiences/new" className={link}>Host an experience</Link>
          <Link to="/hosting/earnings" className={link}>Payouts in crypto</Link>
          <Link to="/help#fees" className={link}>Fees</Link>
        </div>
        <div className={col}>
          <h4 className="font-display font-semibold text-ink">Company</h4>
          <Link to="/about" className={link}>About</Link>
          <Link to="/trust" className={link}>Trust & Safety</Link>
          <Link to="/help" className={link}>Help Center</Link>
          <Link to="/security" className={link}>Security</Link>
          <Link to="/contact" className={link}>Contact</Link>
        </div>
      </div>
      <div className="relative mx-auto flex max-w-[2520px] flex-col gap-3 border-t border-white/5 px-5 py-6 text-sm text-ink-muted sm:px-10 md:flex-row md:items-center md:justify-between xl:px-20">
        <p>
          © {new Date().getFullYear()} Tourisme · Founded by <span className="font-semibold text-ink">Berchid Walid</span> · Travel on-chain
        </p>
        <p className="flex flex-wrap items-center gap-4 font-semibold">
          <Link to="/terms" className="hover:text-ink">Terms</Link>
          <Link to="/privacy" className="hover:text-ink">Privacy</Link>
          <Link to="/cookies" className="hover:text-ink">Cookies</Link>
          <span className="flex items-center gap-1.5">
            <Globe className="h-4 w-4" /> English (US)
          </span>
          <span className="font-mono">{currency}</span>
        </p>
      </div>
    </footer>
  );
}
