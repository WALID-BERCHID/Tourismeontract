import { Link } from "react-router-dom";
import { Globe } from "lucide-react";
import { useCurrency } from "../lib/currency";

export default function Footer() {
  const { currency } = useCurrency();
  const col = "space-y-3 text-sm";
  return (
    <footer className="mt-16 border-t border-ink-faint bg-ink-bg pb-24 md:pb-0">
      <div className="mx-auto grid max-w-[2520px] gap-8 px-5 py-12 sm:px-10 md:grid-cols-3 xl:px-20">
        <div className={col}>
          <h4 className="font-semibold">Support</h4>
          <Link to="/help" className="block hover:underline">Help Center</Link>
          <Link to="/help#escrow" className="block hover:underline">How escrow protects you</Link>
          <Link to="/help#cancellation" className="block hover:underline">Cancellation options</Link>
          <Link to="/help#disputes" className="block hover:underline">Report a problem</Link>
        </div>
        <div className={col}>
          <h4 className="font-semibold">Hosting</h4>
          <Link to="/hosting/listings/new" className="block hover:underline">List your home</Link>
          <Link to="/help#hosting" className="block hover:underline">Hosting resources</Link>
          <Link to="/hosting/earnings" className="block hover:underline">Payouts in crypto</Link>
          <Link to="/help#fees" className="block hover:underline">Fees</Link>
        </div>
        <div className={col}>
          <h4 className="font-semibold">Tourisme</h4>
          <Link to="/help#about" className="block hover:underline">About the protocol</Link>
          <Link to="/help#chains" className="block hover:underline">Supported blockchains</Link>
          <Link to="/help#privacy" className="block hover:underline">Privacy</Link>
          <Link to="/help#terms" className="block hover:underline">Terms</Link>
        </div>
      </div>
      <div className="mx-auto flex max-w-[2520px] flex-col gap-3 border-t border-ink-faint px-5 py-6 text-sm sm:px-10 md:flex-row md:items-center md:justify-between xl:px-20">
        <p>© {new Date().getFullYear()} Tourisme · Decentralized stays · Escrow on Ethereum, Polygon, Base, Solana & EOS</p>
        <p className="flex items-center gap-4 font-semibold">
          <span className="flex items-center gap-1.5"><Globe className="h-4 w-4" /> English (US)</span>
          <span>{currency}</span>
        </p>
      </div>
    </footer>
  );
}
