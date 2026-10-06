import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock, Sparkles, Wallet, Zap } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useMeta } from "../lib/hooks";
import type { Listing } from "../lib/types";
import { ChainIcon } from "./icons";
import { Img } from "./ui";

const PARTNERS = [
  ["evm", "Ethereum"],
  ["evm", "Polygon"],
  ["evm", "Base"],
  ["solana", "Solana"],
  ["eos", "EOS"],
  ["evm", "USDC"],
] as const;

/** Landing hero: the brand story (escrow, chains) with a floating "collectible" stack of listings. */
export default function Hero() {
  const { user, openAuth } = useAuth();
  const { data: meta } = useMeta();
  const { data } = useQuery({ queryKey: ["hero"], queryFn: () => api.get<{ results: Listing[] }>("/listings?limit=3&sort=rating"), staleTime: 5 * 60_000 });
  const cards = data?.results || [];
  const networks = Math.max(5, meta?.networks.length || 0);

  return (
    <section className="relative overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-50 [mask-image:radial-gradient(70%_70%_at_50%_20%,#000,transparent)]" />
      <div className="pointer-events-none absolute -left-40 top-20 h-[420px] w-[420px] rounded-full bg-brand-violet/30 blur-[120px]" />
      <div className="pointer-events-none absolute -right-20 -top-20 h-[380px] w-[380px] rounded-full bg-brand/25 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-brand-cyan/10 blur-[120px]" />

      <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 px-5 pb-14 pt-10 sm:px-10 lg:grid-cols-[1.05fr_1fr] lg:pt-16">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-brand-mint">
            <Sparkles className="h-3.5 w-3.5" /> The first travel marketplace with 100% on-chain escrow
          </span>
          <h1 className="mt-6 font-display text-[44px] font-extrabold leading-[1.02] tracking-tight sm:text-[64px]">
            <span className="text-gradient-brand">Book</span>, stay and <span className="text-gradient-brand">explore</span> – paid in <span className="text-brand-mint">crypto</span>, protected by code.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-ink-soft">
            Riads, villas, desert camps and local experiences. Your payment is locked in a smart contract and only released to the host after check-in. Refunds and disputes run on-chain – no middleman, no chargeback games.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#explore" className="inline-flex items-center gap-2 rounded-xl bg-brand-gradient px-6 py-3.5 font-semibold text-white shadow-glow transition hover:brightness-110">
              Explore stays <ArrowRight className="h-4 w-4" />
            </a>
            <Link to="/experiences" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-6 py-3.5 font-semibold transition hover:border-brand/60 hover:bg-white/10">
              Experiences & tours
            </Link>
            {!user && (
              <button type="button" onClick={() => openAuth("login")} className="inline-flex items-center gap-2 px-2 py-3 text-sm font-semibold text-ink-soft hover:text-ink">
                <Wallet className="h-4 w-4" /> Connect wallet
              </button>
            )}
          </div>
          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-6">
            {[
              ["100%", "Escrow-protected bookings"],
              [`${networks}`, "Blockchains supported"],
              ["0", "Days your money sits with a company"],
            ].map(([v, l]) => (
              <div key={l}>
                <dt className="font-display text-3xl font-extrabold text-gradient">{v}</dt>
                <dd className="mt-1 text-xs text-ink-muted">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Collectible stack */}
        <div className="relative hidden h-[520px] lg:block">
          {cards.slice(0, 3).map((l, i) => {
            const pos = ["right-10 top-6 rotate-[6deg]", "right-40 top-24 -rotate-[4deg]", "right-[70px] top-[200px] rotate-[2deg]"][i];
            const z = ["z-10", "z-20", "z-30"][i];
            return (
              <Link
                key={l.id}
                to={`/rooms/${l.id}`}
                className={`glass-strong border-gradient absolute ${pos} ${z} w-[300px] rounded-3xl p-2.5 shadow-pop transition hover:z-40 hover:scale-[1.03] animate-float`}
                style={{ animationDelay: `${i * 1.2}s` }}
              >
                <Img src={l.photos[0]} alt={l.title} seed={l.id} className="aspect-[4/3] w-full rounded-2xl" />
                <div className="px-2 pb-2 pt-3">
                  <div className="truncate font-display text-sm font-semibold">{l.title}</div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-ink-muted">
                      {l.city}, {l.country}
                    </span>
                    <span className="flex items-center gap-1 font-mono font-semibold text-brand-mint">
                      <ChainIcon chain={l.chains[0]?.chain || "evm"} className="h-3 w-3" /> ${l.priceUsd}/night
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
          <div className="glass absolute bottom-6 left-0 z-40 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-mint/15 text-brand-mint">
              <Lock className="h-4 w-4" />
            </span>
            <div>
              <div className="font-semibold">Funds locked in escrow</div>
              <div className="text-xs text-ink-muted">Released 24h after check-in · auto-refunds on cancel</div>
            </div>
          </div>
          <div className="glass absolute right-0 top-[400px] z-40 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm">
            <Zap className="h-4 w-4 text-brand" /> Instant Book · no gas to sign in
          </div>
        </div>
      </div>

      {/* Chain / partner strip */}
      <div className="relative border-y border-white/5 bg-canvas-2/40">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-center gap-x-12 gap-y-4 px-5 py-6 sm:px-10">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">Settles on</span>
          {PARTNERS.map(([chain, name]) => (
            <span key={name} className="flex items-center gap-2 font-display text-lg font-bold text-ink-soft/80 transition hover:text-ink">
              <ChainIcon chain={chain} className="h-5 w-5" /> {name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function HowItWorks() {
  const steps = [
    { n: "01", t: "Pick a stay or experience", b: "Search by destination, dates and vibe. Every listing shows which chains and tokens it accepts." },
    { n: "02", t: "Pay into escrow", b: "Connect MetaMask, Phantom or Anchor and pay in ETH, POL, USDC, SOL or EOS. The contract – not us – holds the funds." },
    { n: "03", t: "Check in, then it releases", b: "24 hours after check-in the host gets paid. Cancel before and the policy refunds you automatically. Problems? An arbiter decides on-chain." },
  ];
  return (
    <section className="mx-auto max-w-[1280px] px-5 py-16 sm:px-10">
      <div className="mb-10 flex items-end justify-between gap-6">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-brand">How it works</span>
          <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Trust the contract, not the company.</h2>
        </div>
        <Link to="/help#escrow" className="hidden items-center gap-2 rounded-full border border-brand/40 px-5 py-2 text-sm font-semibold text-brand hover:bg-brand/10 sm:flex">
          Read the escrow rules <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="glass group relative overflow-hidden rounded-3xl p-7 transition hover:-translate-y-1 hover:shadow-glow-violet">
            <span className="font-mono text-sm font-semibold text-brand-mint">{s.n}</span>
            <h3 className="mt-3 font-display text-xl font-semibold">{s.t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{s.b}</p>
            <span className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-brand-gradient opacity-0 blur-3xl transition group-hover:opacity-40" />
          </div>
        ))}
      </div>
    </section>
  );
}
