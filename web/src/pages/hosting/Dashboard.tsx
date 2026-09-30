import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowRight, CalendarCheck, Home, Plus, Star, TrendingUp, Wallet } from "lucide-react";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useCurrency } from "../../lib/currency";
import { useTitle } from "../../lib/hooks";
import { dateRange, todayDay } from "../../lib/format";
import type { Booking, Listing } from "../../lib/types";
import { Avatar, Button, Container, Img, PageLoader } from "../../components/ui";

export interface HostStats {
  earnedUsd: number;
  pendingUsd: number;
  occupancy30d: number;
  rating: number | null;
  reviewCount: number;
  listingCount: number;
  monthly: { month: string; earnings: number; stays: number }[];
  payouts: Booking[];
}

export function useHostingBookings() {
  return useQuery({ queryKey: ["hosting-bookings"], queryFn: () => api.get<{ bookings: Booking[] }>("/bookings/hosting") });
}

function ReservationCard({ b }: { b: Booking }) {
  const today = todayDay();
  const label =
    b.status === "pending_host"
      ? "Request · respond within 24h"
      : b.checkOutDay === today
        ? "Checking out today"
        : b.checkInDay <= today && b.checkOutDay > today
          ? "Currently hosting"
          : b.checkInDay === today
            ? "Arriving today"
            : b.checkInDay - today === 1
              ? "Arriving tomorrow"
              : `In ${b.checkInDay - today} days`;
  return (
    <Link to={`/hosting/reservations/${b.id}`} className="flex w-[300px] shrink-0 flex-col justify-between rounded-2xl border border-ink-line p-5 transition hover:shadow-card">
      <div>
        <div className={clsx("text-sm font-semibold", b.status === "pending_host" ? "text-amber-700" : "text-brand")}>{label}</div>
        <div className="mt-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-semibold">{b.guest.name}</div>
            <div className="text-sm text-ink-muted">{dateRange(b.checkIn, b.checkOut)}</div>
            <div className="truncate text-sm text-ink-muted">{b.listing.title}</div>
          </div>
          <Avatar src={b.guest.avatarUrl} name={b.guest.firstName} size={44} />
        </div>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-ink-faint pt-3 text-sm">
        <span className="font-semibold">{b.amountNative}</span>
        <span className="text-ink-muted">{b.guests} guests</span>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { fmt } = useCurrency();
  const [tab, setTab] = useState<"requests" | "today" | "upcoming" | "hosting">("today");
  useTitle("Hosting");
  const { data, isLoading } = useHostingBookings();
  const { data: stats } = useQuery({ queryKey: ["host-stats"], queryFn: () => api.get<HostStats>("/hosting/stats") });
  const { data: listings } = useQuery({ queryKey: ["my-listings"], queryFn: () => api.get<{ listings: Listing[] }>("/hosting/listings") });

  if (isLoading) return <PageLoader />;
  const today = todayDay();
  const all = data?.bookings || [];
  const groups = {
    requests: all.filter((b) => b.status === "pending_host"),
    today: all.filter((b) => b.status === "confirmed" && (b.checkInDay === today || b.checkOutDay === today || b.checkInDay === today + 1)),
    hosting: all.filter((b) => b.status === "confirmed" && b.checkInDay <= today && b.checkOutDay > today),
    upcoming: all.filter((b) => ["confirmed", "pending_host"].includes(b.status) && b.checkInDay > today),
  };

  if (!listings?.listings.length) {
    return (
      <Container className="pb-24 pt-12">
        <div className="grid items-center gap-12 overflow-hidden rounded-3xl bg-gradient-to-br from-brand-light via-white to-white p-10 md:grid-cols-2 md:p-16">
          <div>
            <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
              Host your home.
              <br />
              <span className="text-brand">Get paid on-chain.</span>
            </h1>
            <p className="mt-5 text-lg text-ink-soft">List your riad, apartment or villa in minutes. Guests pay into escrow, and payouts land straight in your wallet 24 hours after check-in – in ETH, USDC, SOL or EOS.</p>
            <Button size="lg" className="mt-8" onClick={() => navigate("/hosting/listings/new")}>
              <Plus className="h-5 w-5" /> Create your listing
            </Button>
          </div>
          <div className="grid gap-4">
            {[
              ["1", "Describe your place", "Photos, amenities, location and house rules."],
              ["2", "Set your price & policy", "Nightly price, cleaning fee and cancellation terms – enforced by the contract."],
              ["3", "Publish on-chain", "Sign one transaction per network. Only 3% host fee."],
            ].map(([n, t, d]) => (
              <div key={n} className="flex gap-4 rounded-2xl bg-white p-5 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink font-bold text-white">{n}</span>
                <div>
                  <div className="font-semibold">{t}</div>
                  <div className="text-sm text-ink-muted">{d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Container>
    );
  }

  const list = groups[tab];
  return (
    <Container className="pb-24 pt-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[32px] font-semibold">Welcome back, {user?.firstName || "host"}</h1>
        <Button variant="outline" onClick={() => navigate("/hosting/listings/new")}>
          <Plus className="h-4 w-4" /> New listing
        </Button>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: Wallet, label: "Paid out", value: fmt(stats?.earnedUsd || 0, false), sub: "Released from escrow" },
          { icon: TrendingUp, label: "Upcoming earnings", value: fmt(stats?.pendingUsd || 0, false), sub: "Held in escrow" },
          { icon: CalendarCheck, label: "Occupancy (next 30d)", value: `${Math.round((stats?.occupancy30d || 0) * 100)}%`, sub: `${stats?.listingCount || 0} active listing${stats?.listingCount === 1 ? "" : "s"}` },
          { icon: Star, label: "Overall rating", value: stats?.rating?.toFixed(2) ?? "–", sub: `${stats?.reviewCount || 0} reviews` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-ink-faint p-5">
            <s.icon className="h-5 w-5 text-ink-muted" />
            <div className="mt-3 text-2xl font-semibold">{s.value}</div>
            <div className="text-sm font-medium">{s.label}</div>
            <div className="text-xs text-ink-muted">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold">Your reservations</h2>
        <Link to="/hosting/reservations" className="text-sm font-semibold underline">
          All reservations ({all.length})
        </Link>
      </div>
      <div className="scrollbar-hide mt-5 flex gap-2 overflow-x-auto">
        {(
          [
            ["requests", "Pending requests"],
            ["today", "Today & tomorrow"],
            ["hosting", "Currently hosting"],
            ["upcoming", "Upcoming"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={clsx("shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition", tab === k ? "border-ink ring-1 ring-ink" : "border-ink-line hover:border-ink")}>
            {label} ({groups[k].length})
          </button>
        ))}
      </div>
      <div className="mt-6">
        {list.length === 0 ? (
          <div className="flex h-44 flex-col items-center justify-center rounded-2xl bg-ink-bg text-center">
            <CalendarCheck className="mb-2 h-7 w-7" strokeWidth={1.4} />
            <p className="max-w-xs text-sm">
              {tab === "requests" ? "No pending requests." : tab === "today" ? "No guests arriving or leaving today or tomorrow." : tab === "hosting" ? "You don't have any guests staying right now." : "No upcoming reservations yet."}
            </p>
          </div>
        ) : (
          <div className="scrollbar-hide flex gap-4 overflow-x-auto pb-2">
            {list.map((b) => (
              <ReservationCard key={b.id} b={b} />
            ))}
          </div>
        )}
      </div>

      <div className="mt-12 flex items-center justify-between">
        <h2 className="text-[22px] font-semibold">Your listings</h2>
        <Link to="/hosting/listings" className="flex items-center gap-1 text-sm font-semibold underline">
          Manage <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {listings?.listings.slice(0, 6).map((l) => (
          <Link key={l.id} to={`/hosting/listings/${l.id}/edit`} className="flex gap-4 rounded-2xl border border-ink-faint p-3 hover:shadow-card">
            <Img src={l.photos[0]} alt={l.title} seed={l.id} className="h-20 w-20 shrink-0 rounded-xl" />
            <div className="min-w-0 py-1">
              <div className="truncate font-semibold">{l.title}</div>
              <div className="text-sm text-ink-muted">
                {l.city} · {fmt(l.priceUsd, false)}/night
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-xs font-semibold">
                <span className={clsx("h-2 w-2 rounded-full", l.status === "published" ? "bg-emerald-500" : l.status === "draft" ? "bg-amber-500" : "bg-ink-muted")} />
                {l.status === "published" ? (l.chains.length ? "Listed · bookable" : "Listed · enable payments") : l.status === "draft" ? "In progress" : "Unlisted"}
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-12 rounded-2xl bg-ink-bg p-6 text-sm">
        <Home className="mb-2 h-5 w-5" />
        <b>Tip:</b> Listings with 5+ photos, instant booking and a flexible policy get up to 3× more bookings. Keep your calendar up to date to avoid host cancellations, which are recorded on-chain.
      </div>
    </Container>
  );
}
