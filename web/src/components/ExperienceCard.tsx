import { Link } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import { useCurrency } from "../lib/currency";
import type { Listing } from "../lib/types";
import { ChainIcon } from "./icons";
import { HeartButton } from "./ListingCard";
import { Img, Stars } from "./ui";

export function durationLabel(h: number) {
  if (!h) return "";
  if (h >= 24) return `${Math.round(h / 24)} day${h >= 48 ? "s" : ""}`;
  return Number.isInteger(h) ? `${h} h` : `${Math.floor(h)}h${Math.round((h % 1) * 60)}`;
}

/** NFT-style "collectible" card for experiences & tours. */
export default function ExperienceCard({ listing, query = "", onHover }: { listing: Listing; query?: string; onHover?: (id: number | null) => void }) {
  const { fmt } = useCurrency();
  const chains = [...new Set(listing.chains.map((c) => c.chain))];
  return (
    <Link
      to={`/experiences/${listing.id}${query}`}
      className="glass group block overflow-hidden rounded-3xl transition hover:-translate-y-1 hover:shadow-glow-violet"
      onMouseEnter={() => onHover?.(listing.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="relative m-2 aspect-[4/3] overflow-hidden rounded-2xl">
        <Img src={listing.photos[0]} alt={listing.title} seed={listing.id} className="h-full w-full transition duration-500 group-hover:scale-105" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-canvas/80 to-transparent" />
        <span className="absolute left-3 top-3 rounded-full bg-canvas/70 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-mint backdrop-blur">
          {listing.propertyType}
        </span>
        <HeartButton listing={listing} className="absolute right-3 top-3" />
        <div className="absolute bottom-3 left-3 flex items-center gap-3 text-xs font-medium text-white">
          {listing.durationHours > 0 && (
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> {durationLabel(listing.durationHours)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> up to {listing.guests}
          </span>
        </div>
      </div>
      <div className="px-4 pb-4 pt-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-muted">
            {listing.city}, {listing.country}
          </p>
          <Stars rating={listing.rating} className="shrink-0 text-xs" />
        </div>
        <h3 className="mt-1 line-clamp-2 font-display text-[15px] font-semibold leading-snug">{listing.title}</h3>
        <div className="mt-3 flex items-end justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Private group</div>
            <div className="font-mono text-[15px] font-semibold">{fmt(listing.priceUsd, false)}</div>
          </div>
          {chains.length > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-1" title="Escrow payment available">
              {chains.map((c) => (
                <ChainIcon key={c} chain={c} className="h-3.5 w-3.5" />
              ))}
              <span className="ml-0.5 text-[10px] font-semibold text-brand-mint">ESCROW</span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export function ExperienceCardSkeleton() {
  return (
    <div className="glass rounded-3xl p-2">
      <div className="aspect-[4/3] animate-pulse rounded-2xl bg-ink-faint" />
      <div className="px-2 pb-2 pt-3">
        <div className="h-3 w-1/2 animate-pulse rounded bg-ink-faint" />
        <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-ink-faint" />
        <div className="mt-3 h-4 w-1/3 animate-pulse rounded bg-ink-faint" />
      </div>
    </div>
  );
}
