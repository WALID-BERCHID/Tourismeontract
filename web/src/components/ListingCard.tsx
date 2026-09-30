import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useCurrency } from "../lib/currency";
import type { Listing } from "../lib/types";
import { ChainIcon } from "./icons";
import { Img, Stars } from "./ui";

export function HeartButton({ listing, className }: { listing: Listing; className?: string }) {
  const { user, requireAuth } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(listing.wishlisted);
  const toggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) return requireAuth();
    const next = !saved;
    setSaved(next);
    try {
      if (next) await api.put(`/wishlists/${listing.id}`);
      else await api.del(`/wishlists/${listing.id}`);
      toast(next ? `Saved to your wishlist` : "Removed from wishlist", { description: listing.title });
      qc.invalidateQueries({ queryKey: ["wishlists"] });
    } catch {
      setSaved(!next);
      toast.error("Couldn't update your wishlist");
    }
  };
  return (
    <button type="button" onClick={toggle} aria-label={saved ? "Remove from wishlist" : "Save to wishlist"} className={clsx("transition active:scale-90", className)}>
      <Heart className={clsx("h-6 w-6 drop-shadow", saved ? "fill-brand text-white" : "fill-black/50 text-white")} strokeWidth={2} />
    </button>
  );
}

export default function ListingCard({ listing, nights, query = "", onHover }: { listing: Listing; nights?: number | null; query?: string; onHover?: (id: number | null) => void }) {
  const [idx, setIdx] = useState(0);
  const { fmt } = useCurrency();
  const photos = listing.photos.length ? listing.photos : [""];
  const step = (e: React.MouseEvent, d: number) => {
    e.preventDefault();
    e.stopPropagation();
    setIdx((i) => (i + d + photos.length) % photos.length);
  };
  const chains = [...new Set(listing.chains.map((c) => c.chain))];
  return (
    <Link to={`/rooms/${listing.id}${query}`} className="group block" onMouseEnter={() => onHover?.(listing.id)} onMouseLeave={() => onHover?.(null)}>
      <div className="relative aspect-[20/19] overflow-hidden rounded-xl">
        <div className="flex h-full transition-transform duration-300 ease-out" style={{ transform: `translateX(-${idx * 100}%)` }}>
          {photos.map((p, i) => (
            <Img key={i} src={i <= idx + 1 ? p : null} alt={listing.title} seed={listing.id + i} className="h-full w-full shrink-0" />
          ))}
        </div>
        {listing.reviewCount > 5 && (listing.rating || 0) >= 4.85 && (
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-[13px] font-semibold shadow-sm">Guest favorite</span>
        )}
        <HeartButton listing={listing} className="absolute right-3 top-3" />
        {photos.length > 1 && (
          <>
            {idx > 0 && (
              <button type="button" aria-label="Previous photo" onClick={(e) => step(e, -1)} className="absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow transition hover:scale-105 hover:bg-white group-hover:opacity-100">
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {idx < photos.length - 1 && (
              <button type="button" aria-label="Next photo" onClick={(e) => step(e, 1)} className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 opacity-0 shadow transition hover:scale-105 hover:bg-white group-hover:opacity-100">
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 gap-1.5">
              {photos.slice(0, 5).map((_, i) => (
                <span key={i} className={clsx("h-1.5 w-1.5 rounded-full transition", i === Math.min(idx, 4) ? "bg-white" : "bg-white/60")} />
              ))}
            </div>
          </>
        )}
      </div>
      <div className="mt-3 flex items-start justify-between gap-2">
        <h3 className="truncate text-[15px] font-semibold">
          {listing.city}, {listing.country}
        </h3>
        <Stars rating={listing.rating} className="shrink-0 text-[15px]" />
      </div>
      <p className="truncate text-[15px] text-ink-muted">{listing.title}</p>
      <p className="flex items-center gap-1.5 text-[15px] text-ink-muted">
        {listing.bedrooms > 0 ? `${listing.bedrooms} bedroom${listing.bedrooms > 1 ? "s" : ""}` : "Studio"} · {listing.guests} guests
        {chains.length > 0 && (
          <span className="ml-auto flex items-center gap-0.5" title="Pay with crypto escrow">
            {chains.map((c) => (
              <ChainIcon key={c} chain={c} className="h-3.5 w-3.5" />
            ))}
          </span>
        )}
      </p>
      <p className="mt-1.5 text-[15px]">
        {nights && listing.totalUsd ? (
          <>
            <span className="font-semibold underline">{fmt(listing.totalUsd, false)}</span> <span className="text-ink-muted">for {nights} night{nights > 1 ? "s" : ""}</span>
          </>
        ) : (
          <>
            <span className="font-semibold">{fmt(listing.priceUsd, false)}</span> <span>night</span>
          </>
        )}
      </p>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div>
      <div className="aspect-[20/19] animate-pulse rounded-xl bg-ink-faint" />
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-ink-faint" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-ink-faint" />
      <div className="mt-2 h-4 w-1/3 animate-pulse rounded bg-ink-faint" />
    </div>
  );
}
